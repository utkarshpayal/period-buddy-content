import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

/*
 * HR documents (docs/hr-documents.md): team members, Canva-based letter and
 * certificate templates, generated PDFs and the public e-signing flow.
 * Staff routes live under /api/admin/hr (hr.manage); signing under /api/sign
 * (no auth, the token in the link is the credential).
 */

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

/* ----------------------------- Types ----------------------------- */

export type EmploymentType = "full_time" | "part_time" | "intern" | "contract" | "consultant";
export type MemberStatus = "offered" | "active" | "completed" | "exited";
export type TemplateCategory =
  | "offer_letter"
  | "internship_completion"
  | "experience_letter"
  | "certificate"
  | "letterhead"
  | "other";
export type TemplateKind = "fixed" | "letterhead";
export type FontFamily = "sans" | "serif";
export type DocumentStatus = "generated" | "sent" | "viewed" | "signed" | "revoked";

export type CustomField = { key: string; value: string };

export type HrMember = {
  _id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  employmentType: EmploymentType;
  status: MemberStatus;
  startDate: string | null;
  endDate: string | null;
  compensation: string | null;
  location: string | null;
  managerName: string | null;
  address: string | null;
  customFields: CustomField[];
  notes: string | null;
  documentCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type HrMemberInput = Omit<HrMember, "_id" | "documentCount" | "createdAt" | "updatedAt">;

/** Positions are PDF points from the page's TOP-LEFT corner (72 pt = 1 inch). */
export type TemplateField = {
  id: string;
  key: string;
  /** Optional line of text with {{keys}} in it, e.g. "Ref: NC/CERT/{{documentNumber}}". Wins over `key`. */
  text?: string;
  /** Painted first (usually white) to hide placeholder text printed in the PDF itself. */
  cover?: { x: number; y: number; width: number; height: number; color?: string };
  page: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  font: FontFamily;
  bold: boolean;
  color: string;
  align: "left" | "center" | "right";
  /** A paragraph: wraps to `width` at full size; **bold** runs are drawn in `boldColor`. */
  wrap?: boolean;
  /** Line spacing as a multiple of fontSize (multi-line values and wrap fields). */
  lineHeight?: number;
  boldColor?: string;
};

export type Box = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Signature box only: where the signing date is written (a design's "Date" line). */
  dateX?: number;
  dateY?: number;
  /** Signature box only: where the "Signed electronically by …" note goes. */
  noteX?: number;
  noteY?: number;
};

export type LetterLayout = {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  fontSize: number;
  lineHeight: number;
  font: FontFamily;
};

export type HrTemplate = {
  _id: string;
  name: string;
  category: TemplateCategory;
  kind: TemplateKind;
  pages: { width: number; height: number }[];
  fileName: string;
  fields: TemplateField[];
  body: string;
  layout: LetterLayout;
  requiresSignature: boolean;
  signatureBox: Box | null;
  emailSubject: string;
  emailBody: string;
  active: boolean;
  placeholders: string[];
  createdAt: string;
  updatedAt: string;
};

/** What the create/edit form sends as the `data` part. */
export type HrTemplateInput = Pick<
  HrTemplate,
  | "name"
  | "category"
  | "kind"
  | "fields"
  | "body"
  | "layout"
  | "requiresSignature"
  | "signatureBox"
  | "emailSubject"
  | "emailBody"
  | "active"
>;

export type StaffRef = { _id: string; firstName?: string; lastName?: string; email?: string } | null;

export type HrDocument = {
  _id: string;
  number: string;
  member: { _id: string; fullName: string; email: string } | null;
  template: { _id: string; name: string } | null;
  templateName: string;
  category: TemplateCategory;
  status: DocumentStatus;
  requiresSignature: boolean;
  sentTo: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  signerName: string | null;
  hasSignedFile: boolean;
  createdBy: StaffRef;
  createdAt: string;
};

export type Option<T extends string = string> = { value: T; label: string };

export type HrMeta = {
  placeholders: { key: string; label: string }[];
  categories: Option<TemplateCategory>[];
  employmentTypes: Option<EmploymentType>[];
  memberStatuses: Option<MemberStatus>[];
  fonts: FontFamily[];
  companyName: string;
};

export type SignSession = {
  document: {
    number: string;
    templateName: string;
    category: TemplateCategory;
    status: DocumentStatus;
    requiresSignature: boolean;
    sentAt: string | null;
    signedAt: string | null;
    signerName: string | null;
  };
  recipient: { firstName: string; fullName: string };
  companyName: string;
  signatureBox: Box | null;
  pages: { width: number; height: number }[];
};

/** A request error that also carries the HTTP status and any `missing` fields. */
export class HrApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public missing: string[] = []
  ) {
    super(message);
  }
}

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

/* --------------------------- Request helpers --------------------------- */

const requireBase = () => {
  if (!apiBaseUrl) {
    throw new HrApiError(
      "This page requires the API. Add VITE_API_BASE_URL to a root .env file, then restart the dev server.",
      0
    );
  }
};

/** Parse an error response into an HrApiError (with `missing` when the server names absent fields). */
const toError = async (response: Response, fallback: string): Promise<HrApiError> => {
  let body: ApiEnvelope<{ missing?: string[] }> | undefined;
  try {
    body = (await response.json()) as ApiEnvelope<{ missing?: string[] }>;
  } catch {
    body = undefined;
  }
  return new HrApiError(body?.message ?? fallback, response.status, body?.data?.missing ?? []);
};

async function send(path: string, options: RequestInit = {}, auth = true): Promise<Response> {
  requireBase();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getApiToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetchWithTimeout(
    `${apiBaseUrl}${path}`,
    { ...options, credentials: auth ? "include" : "omit", headers },
    options.body instanceof FormData ? 120_000 : 45_000
  );
  if (auth && response.status === 401) {
    handleUnauthorized();
    throw new HrApiError("Your session has expired. Please sign in again.", 401);
  }
  if (auth && response.status === 403) {
    throw await toError(response, "You don't have permission to do this.");
  }
  if (!response.ok) throw await toError(response, `Request failed with ${response.status}`);
  return response;
}

async function json<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const response = await send(path, options, auth);
  let body: ApiEnvelope<T> | undefined;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    body = undefined;
  }
  return (body?.data ?? (body as unknown as T)) as T;
}

const blob = async (path: string, options: RequestInit = {}, auth = true) =>
  (await send(path, options, auth)).blob();

const toQuery = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

const templateForm = (data: HrTemplateInput, file?: File | null) => {
  const form = new FormData();
  if (file) form.append("file", file, file.name);
  form.append("data", JSON.stringify(data));
  return form;
};

/* ------------------------------ Staff API ------------------------------ */

const BASE = "/api/admin/hr";

export const hrApi = {
  meta: () => json<HrMeta>(`${BASE}/meta`),

  listMembers: (params: { search?: string; status?: string } = {}) =>
    json<{ members: HrMember[] }>(`${BASE}/members${toQuery(params)}`),
  getMember: (id: string) => json<{ member: HrMember; documents: HrDocument[] }>(`${BASE}/members/${id}`),
  createMember: (input: HrMemberInput) =>
    json<{ member: HrMember }>(`${BASE}/members`, { method: "POST", body: JSON.stringify(input) }),
  updateMember: (id: string, input: HrMemberInput) =>
    json<{ member: HrMember }>(`${BASE}/members/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteMember: (id: string) => json<unknown>(`${BASE}/members/${id}`, { method: "DELETE" }),

  listTemplates: () => json<{ templates: HrTemplate[] }>(`${BASE}/templates`),
  getTemplate: (id: string) => json<{ template: HrTemplate }>(`${BASE}/templates/${id}`),
  createTemplate: (data: HrTemplateInput, file: File) =>
    json<{ template: HrTemplate }>(`${BASE}/templates`, { method: "POST", body: templateForm(data, file) }),
  updateTemplate: (id: string, data: HrTemplateInput, file?: File | null) =>
    json<{ template: HrTemplate }>(`${BASE}/templates/${id}`, { method: "PUT", body: templateForm(data, file) }),
  deleteTemplate: (id: string) => json<unknown>(`${BASE}/templates/${id}`, { method: "DELETE" }),
  templateFile: (id: string) => blob(`${BASE}/templates/${id}/file`),

  /** The filled PDF, or an HrApiError whose `missing` lists fields without a value. */
  preview: (input: { templateId: string; memberId: string; values?: Record<string, string> }) =>
    blob(`${BASE}/documents/preview`, { method: "POST", body: JSON.stringify(input) }),
  createDocument: (input: {
    templateId: string;
    memberId: string;
    values?: Record<string, string>;
    send: boolean;
    message?: string;
  }) =>
    json<{ document: HrDocument; emailed: boolean }>(`${BASE}/documents`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  listDocuments: (params: { memberId?: string; status?: string } = {}) =>
    json<{ documents: HrDocument[] }>(`${BASE}/documents${toQuery(params)}`),
  documentFile: (id: string, version?: "original" | "signed") =>
    blob(`${BASE}/documents/${id}/file${toQuery({ version })}`),
  resendDocument: (id: string, message?: string) =>
    json<{ document: HrDocument; emailed: boolean }>(`${BASE}/documents/${id}/resend`, {
      method: "POST",
      body: JSON.stringify({ message })
    }),
  revokeDocument: (id: string) =>
    json<{ document: HrDocument }>(`${BASE}/documents/${id}/revoke`, { method: "POST" })
};

/* ----------------------------- Public signing ----------------------------- */

const signPath = (token: string) => `/api/sign/${encodeURIComponent(token)}`;

export const signApi = {
  session: (token: string) => json<SignSession>(signPath(token), {}, false),
  file: (token: string) => blob(`${signPath(token)}/file`, {}, false),
  submit: (token: string, input: { signature: string; name: string; agree: true }) =>
    json<{ status: "signed"; signedAt: string }>(signPath(token), { method: "POST", body: JSON.stringify(input) }, false)
};

/* ------------------------------ Helpers ------------------------------ */

export const isHrApiConfigured = Boolean(apiBaseUrl);

export const fullName = (m: Pick<HrMember, "firstName" | "lastName">) =>
  [m.firstName, m.lastName].filter(Boolean).join(" ");

/** Save a Blob as a file download. */
export function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]+/g, "-");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Placeholder keys a member can fill without asking (mirrors the server's built-ins). */
export const BUILT_IN_KEYS = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "designation",
  "department",
  "employmentType",
  "startDate",
  "endDate",
  "compensation",
  "location",
  "managerName",
  "address",
  "today",
  "companyName",
  "documentNumber",
  "documentSeq"
];

/** Keys that are always available, whatever the member record holds. */
const ALWAYS = new Set(["fullName", "firstName", "email", "employmentType", "today", "companyName", "documentNumber", "documentSeq"]);

/**
 * What a member resolves for one placeholder key, or null when the send
 * dialog needs to ask for it. Dates show as the server formats them roughly
 * ("1 October 2026"); the server's own value wins in the PDF.
 */
export function memberValue(member: HrMember, key: string, meta?: HrMeta | null): string | null {
  // Custom fields match however they were typed ("Duration", "duration"), as
  // custom.duration or plain {{duration}} (the server does the same).
  const custom = (name: string) => {
    const hit = member.customFields.find((f) => camelKey(f.key) === camelKey(name));
    return hit?.value?.trim() ? hit.value : null;
  };
  if (key.startsWith("custom.")) return custom(key.slice(7));
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null;
  switch (key) {
    case "fullName":
      return fullName(member);
    case "employmentType":
      return meta?.employmentTypes.find((t) => t.value === member.employmentType)?.label ?? member.employmentType;
    case "startDate":
      return date(member.startDate);
    case "endDate":
      return date(member.endDate);
    case "today":
      return date(new Date().toISOString());
    case "companyName":
      return meta?.companyName ?? "The Nura Care";
    case "documentNumber":
    case "documentSeq":
      return "Assigned when generated";
    default: {
      const v = (member as unknown as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) return v;
      if (ALWAYS.has(key)) return "";
      return custom(key);
    }
  }
}

/* ------------------------- Forgiving field names ------------------------- */
// Mirrors period-buddy-be utils/hrValues.js canonicalKey(): what people type
// in a Canva design ("First Name", "[ Candidate Full Name ]", "Stipend")
// → the key the server fills. The server re-checks on save.
const KEY_ALIASES: Record<string, string> = {
  firstname: "firstName", first: "firstName", givenname: "firstName",
  lastname: "lastName", surname: "lastName", familyname: "lastName",
  fullname: "fullName", name: "fullName", candidatefullname: "fullName", candidatename: "fullName",
  internname: "fullName", employeename: "fullName", recipientname: "fullName", membername: "fullName",
  email: "email", emailaddress: "email", emailid: "email",
  phone: "phone", mobile: "phone", phonenumber: "phone", mobilenumber: "phone", contact: "phone",
  designation: "designation", role: "designation", roletitle: "designation", position: "designation",
  jobtitle: "designation", positionheld: "designation",
  department: "department", dept: "department", team: "department", departmentteam: "department",
  employmenttype: "employmentType", type: "employmentType",
  startdate: "startDate", joiningdate: "startDate", dateofjoining: "startDate", doj: "startDate", fromdate: "startDate",
  enddate: "endDate", lastdate: "endDate", relievingdate: "endDate", todate: "endDate", lastworkingday: "endDate",
  compensation: "compensation", stipend: "compensation", salary: "compensation", ctc: "compensation", pay: "compensation",
  location: "location", mode: "location", workmode: "location", worklocation: "location",
  manager: "managerName", managername: "managerName", mentor: "managerName", mentorname: "managerName",
  reportingto: "managerName", reportingmanager: "managerName", supervisor: "managerName",
  address: "address", addressline1: "address", recipientaddress: "address",
  today: "today", date: "today", issuedate: "today", issued: "today", dateofissue: "today", currentdate: "today",
  companyname: "companyName", company: "companyName", organisation: "companyName", organization: "companyName",
  documentnumber: "documentNumber", ref: "documentNumber", refno: "documentNumber", reference: "documentNumber",
  referencenumber: "documentNumber", docno: "documentNumber", certificatenumber: "documentNumber",
  documentseq: "documentSeq", seq: "documentSeq", serial: "documentSeq", serialno: "documentSeq"
};

const camelKey = (s: string) =>
  s
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");

export function canonicalKey(raw: string): string {
  const s = raw.trim();
  const custom = /^custom\.(.+)$/i.exec(s);
  if (custom) return `custom.${camelKey(custom[1])}`;
  const alias = KEY_ALIASES[s.toLowerCase().replace(/[^a-z0-9]/g, "")];
  if (alias) return alias;
  const c = camelKey(s);
  return /^[A-Za-z][A-Za-z0-9]*$/.test(c) ? c : "";
}
