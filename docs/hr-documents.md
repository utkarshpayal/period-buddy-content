# HR documents: team members, letters, certificates and e-signing

**Status:** In build on `feat/hr-documents` (Admin Workspace + period-buddy-be)
**Date:** 27 Sep 2026
**Who can use it:** Super Admin only (new permission `hr.manage`)

## What it does

From the Admin Workspace, a Super Admin can:

1. **Keep a list of team members:** hires, interns and contractors. These are HR records only, not portal logins, so they're separate from the Team page.
2. **Keep document templates** designed in Canva: offer letters, internship completion letters, experience letters, certificates, and anything on the letterhead.
3. **Generate a filled PDF for a person and email it**, with an optional link to **sign it online**. The signed copy comes back to the portal, and both sides get it by email.

## Where the templates come from (Canva Free)

Canva's API can only fill templates on Canva Enterprise. On Free, the flow is: **in Canva, choose Share → Download → PDF Standard, then upload that PDF here.** To change a design, edit it in Canva, download it again, and replace the file on the template. The fields you've placed stay where they are.

There are two kinds of template, and you pick one per template:

| Kind | Canva PDF is… | You set up… | Best for |
|---|---|---|---|
| **Fixed design** | The complete document, with blank spaces | Click on the page to place fields such as `{{fullName}}` or `{{startDate}}`, and set font, size, colour and alignment | Certificates, and offer letters with fixed wording |
| **Letterhead** | Just the letterhead (logo, header, footer) | Write the letter body in the portal with `{{fields}}`; it flows onto as many pages as it needs | Offer letters with custom wording, experience letters, NOCs, any letter |

## Fields (placeholders)

A placeholder is written as `{{key}}`. The built-in keys come from the member's record:

`firstName`, `lastName`, `fullName`, `email`, `phone`, `designation`, `department`, `employmentType`, `startDate`, `endDate`, `compensation`, `location`, `managerName`, `address`, `today`, `companyName` and `documentNumber`.

Dates are written out in words, for example "1 October 2026". Custom fields on a member are available as `{{custom.key}}`.

If a template uses a key that the member doesn't have (for example `{{reportingTime}}`), the send dialog asks for it. The preview won't generate until every field has a value.

## Signing

- Signing is switched on per template with **Needs signature**.
  - **Fixed** templates: you draw the signature box on the page.
  - **Letterhead** templates: the box is placed automatically after the letter body.
- The email includes a **Review & sign** button. It opens the public page `ADMIN_APP_URL/sign/<token>`, and nobody needs to log in.
- On that page the person reads the PDF, draws their signature or uploads a photo of it, types their name, ticks "I agree", and submits.
- The portal then stamps the signature into the box, with "Signed electronically by {name} on {date}" underneath. The signed PDF is stored, the document's status changes to **Signed**, and both the person and whoever sent it get the signed copy by email.
- A signing link is valid for 30 days. Once the document is signed, the link shows the signed copy. It stops working if the document is revoked. **Resend** issues a new link.

## Privacy decisions

- **PDFs are stored in MongoDB (`HrFile`), not S3.** The app's S3 bucket is public-read, and these documents include salaries. Files are only served through staff-only endpoints, or through a valid signing token for that one document.
- Signing tokens are random 32-byte values, and only their SHA-256 hash is stored.
- Every create, send, revoke and sign is recorded in the audit log.

---

## API contract (period-buddy-be)

All admin routes use `authenticate`, `requireStaff` and `requirePermission('hr.manage')`, with base path `/api/admin/hr`. JSON responses use the usual `{ success, message, data }` envelope. PDF responses are raw `application/pdf`.

### Types

```ts
type EmploymentType = "full_time" | "part_time" | "intern" | "contract" | "consultant";
type MemberStatus = "offered" | "active" | "completed" | "exited";
type TemplateCategory = "offer_letter" | "internship_completion" | "experience_letter" | "certificate" | "letterhead" | "other";
type TemplateKind = "fixed" | "letterhead";
type FontFamily = "sans" | "serif";
type DocumentStatus = "generated" | "sent" | "viewed" | "signed" | "revoked";

type HrMember = {
  _id: string;
  firstName: string; lastName: string | null;
  email: string; phone: string | null;
  designation: string | null; department: string | null;
  employmentType: EmploymentType; status: MemberStatus;
  startDate: string | null; endDate: string | null;      // ISO date "2026-10-01"
  compensation: string | null;                           // free text, e.g. "₹15,000 / month"
  location: string | null; managerName: string | null; address: string | null;
  customFields: { key: string; value: string }[];        // key: /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/
  notes: string | null;
  documentCount?: number;                                // in lists
  createdAt: string; updatedAt: string;
};

// Positions are PDF points from the page's TOP-LEFT corner (72 pt = 1 inch).
type TemplateField = {
  id: string;                       // client-generated, stable
  key: string;                      // placeholder key, e.g. "fullName" or "custom.team"
  page: number;                     // 0-based
  x: number; y: number;             // top-left of the text box
  width: number;                    // box width, used for alignment and auto-shrink
  fontSize: number;                 // 6–72
  font: FontFamily; bold: boolean;
  color: string;                    // "#RRGGBB"
  align: "left" | "center" | "right";
};
type Box = { page: number; x: number; y: number; width: number; height: number };

type HrTemplate = {
  _id: string;
  name: string; category: TemplateCategory; kind: TemplateKind;
  pages: { width: number; height: number }[];            // from the uploaded PDF
  fileName: string;
  fields: TemplateField[];                               // fixed only
  body: string;                                          // letterhead only; blank line = new paragraph, **bold**
  layout: { marginTop: number; marginBottom: number; marginLeft: number; marginRight: number;
            fontSize: number; lineHeight: number; font: FontFamily };   // letterhead only
  requiresSignature: boolean;
  signatureBox: Box | null;                              // fixed + requiresSignature
  emailSubject: string; emailBody: string;               // may use {{placeholders}}
  active: boolean;
  placeholders: string[];                                // keys used anywhere in the template (server-computed)
  createdAt: string; updatedAt: string;
};

type HrDocument = {
  _id: string;
  number: string;                                        // "NURA/HR/2026/0007"
  member: { _id: string; fullName: string; email: string } | null;
  template: { _id: string; name: string } | null;
  templateName: string; category: TemplateCategory;
  status: DocumentStatus;
  requiresSignature: boolean;
  sentTo: string | null; sentAt: string | null; viewedAt: string | null;
  signedAt: string | null; signerName: string | null;
  hasSignedFile: boolean;
  createdBy: { _id: string; firstName?: string; lastName?: string; email?: string } | null;
  createdAt: string;
};
```

### Endpoints

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/meta` | | `{ placeholders: {key,label}[], categories: {value,label}[], employmentTypes: {value,label}[], memberStatuses: {value,label}[], fonts: FontFamily[], companyName }` |
| GET | `/members` | `?search=&status=` | `{ members: HrMember[] }` (with `documentCount`) |
| POST | `/members` | member fields (`firstName`, `email` required) | `201 { member }` |
| GET | `/members/:id` | | `{ member, documents: HrDocument[] }` |
| PUT | `/members/:id` | member fields | `{ member }` |
| DELETE | `/members/:id` | | Deletes the member, their documents and files |
| GET | `/templates` | | `{ templates: HrTemplate[] }` |
| POST | `/templates` | **multipart**: `file` (PDF, ≤ 15 MB, required) + `data` (JSON string with the template fields) | `201 { template }` |
| GET | `/templates/:id` | | `{ template }` |
| PUT | `/templates/:id` | **multipart**: optional `file` (replaces the PDF, keeping the fields) + `data` (JSON) | `{ template }` |
| DELETE | `/templates/:id` | | Documents already issued keep their own PDFs |
| GET | `/templates/:id/file` | | The template PDF, for rendering in the field editor |
| POST | `/documents/preview` | `{ templateId, memberId, values?: Record<string,string> }` | The filled PDF, **or** `400 { message, data: { missing: string[] } }` |
| POST | `/documents` | `{ templateId, memberId, values?, send: boolean, message?: string }` | `201 { document, emailed: boolean }`. Also `400` with `missing`, as above |
| GET | `/documents` | `?memberId=&status=` | `{ documents: HrDocument[] }` (newest first, max 200) |
| GET | `/documents/:id/file` | `?version=original\|signed` (default: signed if it exists) | The PDF (`Content-Disposition: attachment`) |
| POST | `/documents/:id/resend` | `{ message?: string }` | `{ document, emailed }`. Sends a new signing link if the document needs a signature and isn't signed yet |
| POST | `/documents/:id/revoke` | | `{ document }`. The signing link stops working |

### Public signing (no auth) — base `/api/sign`

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/:token` | | `{ document: { number, templateName, category, status, requiresSignature, sentAt, signedAt, signerName }, recipient: { firstName, fullName }, companyName, signatureBox: Box, pages }`. The first view marks the document `viewed`. Returns `404` for a bad token and `410` for an expired or revoked one |
| GET | `/:token/file` | | The PDF (the signed version once it's signed), shown inline |
| POST | `/:token` | `{ signature: "data:image/png;base64,…" (≤ 1 MB), name: string (≤ 80), agree: true }` | `{ status: "signed", signedAt }`. Returns `409` if it's already signed |
