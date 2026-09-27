import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2, MousePointerClick, PenLine, Save, Trash2, Upload, X } from "lucide-react";
import {
  Box,
  HrMember,
  HrMeta,
  HrTemplate,
  HrTemplateInput,
  LetterLayout,
  TemplateCategory,
  TemplateField,
  TemplateKind,
  fullName,
  hrApi
} from "../../api/hrApi";
import { LoadedPdf, loadPdf, renderPage } from "../../lib/pdf";
import { useToast } from "../../components/Toast";
import { PdfModal, placeholderLabel, useHrMeta } from "./shared";

const MM = 72 / 25.4; // points per millimetre
const toMm = (pt: number) => Math.round((pt / MM) * 10) / 10;
const fromMm = (mm: number) => Math.round(mm * MM * 10) / 10;

const DEFAULT_LAYOUT: LetterLayout = {
  marginTop: 150,
  marginBottom: 110,
  marginLeft: 64,
  marginRight: 64,
  fontSize: 11,
  lineHeight: 1.5,
  font: "sans"
};

const EMAIL_DEFAULTS: Record<TemplateCategory, { subject: string; what: string }> = {
  offer_letter: { subject: "Your offer letter from {{companyName}}", what: "your offer letter" },
  internship_completion: { subject: "Your internship completion letter", what: "your internship completion letter" },
  experience_letter: { subject: "Your experience letter from {{companyName}}", what: "your experience letter" },
  certificate: { subject: "Your certificate from {{companyName}}", what: "your certificate" },
  letterhead: { subject: "A letter from {{companyName}}", what: "your letter" },
  other: { subject: "A document from {{companyName}}", what: "your document" }
};

const emailBodyFor = (category: TemplateCategory) =>
  `Hi {{firstName}},\n\nPlease find ${EMAIL_DEFAULTS[category].what} attached.\n\nWarm regards,\nTeam {{companyName}}`;

const newInput = (): HrTemplateInput => ({
  name: "",
  category: "offer_letter",
  kind: "fixed",
  fields: [],
  body: "Dear {{firstName}},\n\nWe are delighted to offer you the role of **{{designation}}** at {{companyName}}, starting on {{startDate}}.\n\n…\n\nWarm regards,",
  layout: DEFAULT_LAYOUT,
  requiresSignature: false,
  signatureBox: null,
  emailSubject: EMAIL_DEFAULTS.offer_letter.subject,
  emailBody: emailBodyFor("offer_letter"),
  active: true
});

const toInput = (t: HrTemplate): HrTemplateInput => ({
  name: t.name,
  category: t.category,
  kind: t.kind,
  fields: t.fields,
  body: t.body,
  layout: { ...DEFAULT_LAYOUT, ...t.layout },
  requiresSignature: t.requiresSignature,
  signatureBox: t.signatureBox,
  emailSubject: t.emailSubject,
  emailBody: t.emailBody,
  active: t.active
});

const uid = () => Math.random().toString(36).slice(2, 10);

/** Insert `text` at the textarea/input cursor and return the new value. */
function insertAtCursor(el: HTMLTextAreaElement | HTMLInputElement | null, current: string, text: string) {
  if (!el) return current + text;
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const next = current.slice(0, start) + text + current.slice(end);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
  return next;
}

const PlaceholderChips: React.FC<{ meta: HrMeta | null; onPick: (key: string) => void; extra?: string[] }> = ({
  meta,
  onPick,
  extra = []
}) => {
  const [custom, setCustom] = useState("");
  return (
    <div className="hr-chips">
      {(meta?.placeholders ?? []).map((p) => (
        <button key={p.key} type="button" className="hr-chip" onClick={() => onPick(p.key)} title={`{{${p.key}}}`}>
          {p.label}
        </button>
      ))}
      {extra
        .filter((k) => !meta?.placeholders.some((p) => p.key === k))
        .map((k) => (
          <button key={k} type="button" className="hr-chip is-custom" onClick={() => onPick(k)}>
            {k}
          </button>
        ))}
      <span className="hr-chip-custom">
        <input
          value={custom}
          placeholder="custom.field"
          aria-label="Custom field name"
          onChange={(e) => setCustom(e.target.value.replace(/\s+/g, "_"))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              e.preventDefault();
              onPick(custom.startsWith("custom.") ? custom : `custom.${custom}`);
              setCustom("");
            }
          }}
        />
      </span>
    </div>
  );
};

/* ================================ Editor ================================ */

export const TemplateEditor: React.FC<{
  template: HrTemplate | null;
  onClose: () => void;
  onSaved: (t: HrTemplate) => void;
}> = ({ template: initial, onClose, onSaved }) => {
  const toast = useToast();
  const { meta } = useHrMeta();
  const [template, setTemplate] = useState<HrTemplate | null>(initial);
  const [form, setForm] = useState<HrTemplateInput>(initial ? toInput(initial) : newInput());
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pdfLoading, setPdfLoading] = useState(Boolean(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<"field" | "signature">("field");
  const [members, setMembers] = useState<HrMember[]>([]);
  const [previewMember, setPreviewMember] = useState("");
  const [preview, setPreview] = useState<Blob | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof HrTemplateInput>(key: K, value: HrTemplateInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };
  const setLayout = (patch: Partial<LetterLayout>) => set("layout", { ...form.layout, ...patch });

  // Load the saved PDF for an existing template.
  useEffect(() => {
    if (!initial) return;
    let alive = true;
    hrApi
      .templateFile(initial._id)
      .then(loadPdf)
      .then((p) => alive && setPdf(p))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Couldn't load the PDF."))
      .finally(() => alive && setPdfLoading(false));
    return () => {
      alive = false;
    };
  }, [initial]);

  useEffect(() => {
    hrApi
      .listMembers()
      .then((r) => {
        setMembers(r.members);
        setPreviewMember((cur) => cur || r.members[0]?._id || "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !preview) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, preview]);

  const pickFile = async (f: File | null) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return setError("Upload a PDF (in Canva: Share → Download → PDF Standard).");
    if (f.size > 15 * 1024 * 1024) return setError("That PDF is over 15 MB. Download it from Canva as “PDF Standard”, not “PDF Print”.");
    setError(null);
    setPdfLoading(true);
    try {
      const p = await loadPdf(f);
      setPdf(p);
      setFile(f);
      setDirty(true);
      if (!form.name.trim()) set("name", f.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "));
    } catch {
      setError("That file couldn't be read as a PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  const setCategory = (category: TemplateCategory) => {
    setForm((f) => ({
      ...f,
      category,
      // Swap the defaults only if they haven't been edited.
      emailSubject: f.emailSubject === EMAIL_DEFAULTS[f.category].subject ? EMAIL_DEFAULTS[category].subject : f.emailSubject,
      emailBody: f.emailBody === emailBodyFor(f.category) ? emailBodyFor(category) : f.emailBody
    }));
    setDirty(true);
  };

  const validate = () => {
    if (!form.name.trim()) return "Give the template a name.";
    if (!template && !file) return "Upload the PDF from Canva.";
    if (!form.emailSubject.trim()) return "Add an email subject.";
    if (form.kind === "fixed" && form.requiresSignature && !form.signatureBox) return "Draw the signature box on the page (Signature tool).";
    if (form.kind === "letterhead" && !form.body.trim()) return "Write the letter body.";
    return null;
  };

  const save = async (): Promise<HrTemplate | null> => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return null;
    }
    setSaving(true);
    setError(null);
    const data: HrTemplateInput = {
      ...form,
      name: form.name.trim(),
      signatureBox: form.kind === "fixed" && form.requiresSignature ? form.signatureBox : null
    };
    try {
      const res = template ? await hrApi.updateTemplate(template._id, data, file) : await hrApi.createTemplate(data, file!);
      setTemplate(res.template);
      setForm(toInput(res.template));
      setFile(null);
      setDirty(false);
      onSaved(res.template);
      toast.success("Template saved.");
      return res.template;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the template.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    if (!previewMember) return setError("Add a team member first. The preview fills the template with their details.");
    setPreviewing(true);
    try {
      const saved = dirty || !template ? await save() : template;
      if (!saved) return;
      setPreview(await hrApi.preview({ templateId: saved._id, memberId: previewMember }));
    } catch (err) {
      const missing = (err as { missing?: string[] }).missing;
      setError(
        missing?.length
          ? `This member has no value for ${missing.map((k) => placeholderLabel(k, meta)).join(", ")}. The send dialog will ask for these.`
          : err instanceof Error
            ? err.message
            : "Couldn't build the preview."
      );
    } finally {
      setPreviewing(false);
    }
  };

  const selectedField = form.fields.find((f) => f.id === selected) ?? null;
  const updateField = (id: string, patch: Partial<TemplateField>) =>
    set(
      "fields",
      form.fields.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );

  const usedKeys = useMemo(() => [...new Set(form.fields.map((f) => f.key).filter((k) => k.startsWith("custom.")))], [form.fields]);

  return (
    <div className="modal-overlay hr-editor-overlay">
      <div className="hr-editor" role="dialog" aria-modal="true" aria-label="Template editor">
        <header className="hr-editor-head">
          <div>
            <p className="eyebrow">Letter template</p>
            <h3>{form.name.trim() || "New template"}</h3>
          </div>
          <div className="hr-row-actions">
            {dirty && <span className="admin-user-sub">Unsaved changes</span>}
            <button type="button" className="primary-action" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="spin-icon" size={16} /> : <Save size={16} />} Save
            </button>
            <button
              type="button"
              className="gy-icon-btn"
              aria-label="Close"
              onClick={() => (!dirty || window.confirm("Close without saving your changes?")) && onClose()}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="hr-editor-main">
          <section className="hr-editor-side">
            {error && <div className="gy-alert gy-alert-error"><span>{error}</span></div>}

            <label className="ws-field">
              <span>Name</span>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Internship offer letter" />
            </label>
            <div className="hr-grid">
              <label className="ws-field">
                <span>Category</span>
                <select value={form.category} onChange={(e) => setCategory(e.target.value as TemplateCategory)}>
                  {meta?.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label className="ws-field">
                <span>Status</span>
                <select value={form.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}>
                  <option value="1">Active</option>
                  <option value="0">Archived</option>
                </select>
              </label>
            </div>

            <fieldset className="hr-kind">
              <legend>What is the Canva PDF?</legend>
              {(
                [
                  ["fixed", "The complete document", "You place fields like name and dates on it. Best for certificates."],
                  ["letterhead", "Just the letterhead", "You write the letter here; it flows onto as many pages as needed."]
                ] as [TemplateKind, string, string][]
              ).map(([value, title, hint]) => (
                <label key={value} className={`ws-role-option ${form.kind === value ? "is-selected" : ""}`}>
                  <input type="radio" name="kind" checked={form.kind === value} onChange={() => set("kind", value)} />
                  <div>
                    <strong>{title}</strong>
                    <span>{hint}</span>
                  </div>
                </label>
              ))}
            </fieldset>

            <div className="hr-upload">
              <label className="gy-btn gy-btn-ghost hr-upload-btn">
                <Upload size={14} /> {template || file ? "Replace PDF" : "Upload PDF"}
                <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </label>
              <small className="admin-user-sub">
                {file ? file.name : template ? template.fileName : "In Canva: Share → Download → PDF Standard."}
                {template && " Replacing keeps the fields where they are."}
              </small>
            </div>

            <label className="hr-check">
              <input type="checkbox" checked={form.requiresSignature} onChange={(e) => set("requiresSignature", e.target.checked)} />
              <span>
                <strong>Needs signature</strong>
                <small>
                  {form.kind === "fixed"
                    ? "Draw the signature box on the page with the Signature tool."
                    : "The signature box goes right after the letter body."}
                </small>
              </span>
            </label>

            {form.kind === "fixed" && selectedField && (
              <FieldPanel
                field={selectedField}
                meta={meta}
                extraKeys={usedKeys}
                pages={pdf?.numPages ?? 1}
                onChange={(patch) => updateField(selectedField.id, patch)}
                onDelete={() => {
                  set("fields", form.fields.filter((f) => f.id !== selectedField.id));
                  setSelected(null);
                }}
              />
            )}

            {form.kind === "letterhead" && (
              <div className="hr-letter-settings">
                <label className="ws-field">
                  <span>Letter body</span>
                  <textarea
                    ref={bodyRef}
                    rows={12}
                    className="hr-body-input"
                    value={form.body}
                    onChange={(e) => set("body", e.target.value)}
                  />
                </label>
                <small className="admin-user-sub">Blank line = new paragraph. Wrap words in **double stars** for bold. Click a field to insert it:</small>
                <PlaceholderChips meta={meta} onPick={(key) => set("body", insertAtCursor(bodyRef.current, form.body, `{{${key}}}`))} />
                <div className="hr-grid hr-grid-4">
                  {(
                    [
                      ["marginTop", "Top margin"],
                      ["marginBottom", "Bottom"],
                      ["marginLeft", "Left"],
                      ["marginRight", "Right"]
                    ] as [keyof LetterLayout, string][]
                  ).map(([key, label]) => (
                    <label key={key} className="ws-field">
                      <span>{label} (mm)</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={toMm(form.layout[key] as number)}
                        onChange={(e) => setLayout({ [key]: fromMm(Number(e.target.value) || 0) })}
                      />
                    </label>
                  ))}
                </div>
                <div className="hr-grid hr-grid-3">
                  <label className="ws-field">
                    <span>Font</span>
                    <select value={form.layout.font} onChange={(e) => setLayout({ font: e.target.value as LetterLayout["font"] })}>
                      <option value="sans">Sans</option>
                      <option value="serif">Serif</option>
                    </select>
                  </label>
                  <label className="ws-field">
                    <span>Size (pt)</span>
                    <input type="number" min={8} max={16} step={0.5} value={form.layout.fontSize} onChange={(e) => setLayout({ fontSize: Number(e.target.value) || 11 })} />
                  </label>
                  <label className="ws-field">
                    <span>Line height</span>
                    <input type="number" min={1} max={2.5} step={0.05} value={form.layout.lineHeight} onChange={(e) => setLayout({ lineHeight: Number(e.target.value) || 1.5 })} />
                  </label>
                </div>
              </div>
            )}

            <div className="hr-email">
              <p className="hr-subhead">Email</p>
              <label className="ws-field">
                <span>Subject</span>
                <input ref={subjectRef} value={form.emailSubject} onChange={(e) => set("emailSubject", e.target.value)} />
              </label>
              <label className="ws-field">
                <span>Message</span>
                <textarea ref={emailRef} rows={5} value={form.emailBody} onChange={(e) => set("emailBody", e.target.value)} />
              </label>
              <PlaceholderChips meta={meta} onPick={(key) => set("emailBody", insertAtCursor(emailRef.current, form.emailBody, `{{${key}}}`))} />
              <small className="admin-user-sub">The PDF is attached{form.requiresSignature ? ", and a “Review & sign” button is added" : ""}.</small>
            </div>

            <div className="hr-preview-with">
              <p className="hr-subhead">Preview with a real person</p>
              <div className="hr-row-actions">
                <select className="app-filter-select" value={previewMember} onChange={(e) => setPreviewMember(e.target.value)} aria-label="Preview with">
                  {members.length === 0 && <option value="">No team members yet</option>}
                  {members.map((m) => <option key={m._id} value={m._id}>{fullName(m)}</option>)}
                </select>
                <button type="button" className="gy-btn gy-btn-ghost" disabled={previewing || !previewMember} onClick={runPreview}>
                  {previewing ? <Loader2 className="spin-icon" size={14} /> : <Eye size={14} />} {dirty || !template ? "Save & preview" : "Preview"}
                </button>
              </div>
            </div>
          </section>

          <section className="hr-editor-canvas">
            {pdfLoading ? (
              <div className="gy-empty"><Loader2 className="spin-icon" size={22} /><p>Opening the PDF…</p></div>
            ) : !pdf ? (
              <label className="hr-dropzone">
                <Upload size={26} />
                <strong>Upload your Canva PDF</strong>
                <span>In Canva: Share → Download → File type “PDF Standard”.</span>
                <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </label>
            ) : form.kind === "fixed" ? (
              <>
                <div className="hr-toolbar">
                  <div className="gx-tabs" role="tablist" aria-label="Tool">
                    <button type="button" role="tab" aria-selected={tool === "field"} className={tool === "field" ? "is-active" : ""} onClick={() => setTool("field")}>
                      <MousePointerClick size={14} /> Fields
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tool === "signature"}
                      disabled={!form.requiresSignature}
                      className={tool === "signature" ? "is-active" : ""}
                      onClick={() => setTool("signature")}
                      title={form.requiresSignature ? "" : "Tick “Needs signature” first"}
                    >
                      <PenLine size={14} /> Signature box
                    </button>
                  </div>
                  <small className="admin-user-sub">
                    {tool === "field"
                      ? "Click on the page to add a field. Drag to move, drag the right edge to resize."
                      : "Drag on the page to draw where the signature goes."}
                  </small>
                </div>
                <FixedCanvas
                  pdf={pdf}
                  fields={form.fields}
                  signatureBox={form.requiresSignature ? form.signatureBox : null}
                  tool={form.requiresSignature ? tool : "field"}
                  selected={selected}
                  meta={meta}
                  onSelect={setSelected}
                  onAdd={(page, x, y) => {
                    const f: TemplateField = {
                      id: uid(),
                      key: "fullName",
                      page,
                      x: Math.max(0, x - 4),
                      y: Math.max(0, y - 9),
                      width: 220,
                      fontSize: 14,
                      font: "sans",
                      bold: false,
                      color: "#1E1823",
                      align: "left"
                    };
                    set("fields", [...form.fields, f]);
                    setSelected(f.id);
                  }}
                  onChangeField={updateField}
                  onChangeSignature={(box) => set("signatureBox", box)}
                />
              </>
            ) : (
              <LetterheadCanvas pdf={pdf} form={form} meta={meta} />
            )}
          </section>
        </div>
      </div>
      {preview && (
        <PdfModal
          title={`Preview · ${form.name}`}
          file={preview}
          filename={`${form.name} (preview).pdf`}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
};

/* ------------------------------ Field panel ------------------------------ */

const FieldPanel: React.FC<{
  field: TemplateField;
  meta: HrMeta | null;
  extraKeys: string[];
  pages: number;
  onChange: (patch: Partial<TemplateField>) => void;
  onDelete: () => void;
}> = ({ field, meta, extraKeys, onChange, onDelete }) => {
  const known = meta?.placeholders.some((p) => p.key === field.key);
  return (
    <div className="hr-field-panel">
      <div className="hr-field-panel-head">
        <p className="hr-subhead">Selected field</p>
        <button type="button" className="gy-btn gy-btn-quiet-danger" onClick={onDelete}>
          <Trash2 size={14} /> Remove
        </button>
      </div>
      <label className="ws-field">
        <span>Fills in</span>
        <select
          value={known || extraKeys.includes(field.key) ? field.key : "__custom"}
          onChange={(e) => onChange({ key: e.target.value === "__custom" ? "custom." : e.target.value })}
        >
          {meta?.placeholders.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          {extraKeys.map((k) => <option key={k} value={k}>{placeholderLabel(k, meta)}</option>)}
          <option value="__custom">Custom field…</option>
        </select>
      </label>
      {!known && (
        <label className="ws-field">
          <span>Custom field name</span>
          <input
            value={field.key.replace(/^custom\./, "")}
            placeholder="e.g. project"
            onChange={(e) => onChange({ key: `custom.${e.target.value.replace(/[^a-zA-Z0-9_]/g, "")}` })}
          />
        </label>
      )}
      <div className="hr-grid hr-grid-3">
        <label className="ws-field">
          <span>Font</span>
          <select value={field.font} onChange={(e) => onChange({ font: e.target.value as TemplateField["font"] })}>
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
          </select>
        </label>
        <label className="ws-field">
          <span>Size</span>
          <input type="number" min={6} max={72} value={field.fontSize} onChange={(e) => onChange({ fontSize: Math.min(72, Math.max(6, Number(e.target.value) || 12)) })} />
        </label>
        <label className="ws-field">
          <span>Colour</span>
          <input type="color" value={field.color} onChange={(e) => onChange({ color: e.target.value.toUpperCase() })} />
        </label>
      </div>
      <div className="hr-row-actions">
        <div className="gx-tabs" role="tablist" aria-label="Alignment">
          {(["left", "center", "right"] as const).map((a) => (
            <button key={a} type="button" role="tab" aria-selected={field.align === a} className={field.align === a ? "is-active" : ""} onClick={() => onChange({ align: a })}>
              {a[0].toUpperCase() + a.slice(1)}
            </button>
          ))}
        </div>
        <label className="hr-check is-inline">
          <input type="checkbox" checked={field.bold} onChange={(e) => onChange({ bold: e.target.checked })} />
          <span><strong>Bold</strong></span>
        </label>
      </div>
      <small className="admin-user-sub">
        Page {field.page + 1} · {Math.round(field.x)}, {Math.round(field.y)} pt · {Math.round(field.width)} pt wide. Long text shrinks to fit the width.
      </small>
    </div>
  );
};

/* ------------------------------ Page canvases ------------------------------ */

/** Width the page is drawn at, following the container. */
function useContainerWidth(max = 760) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.min(max, Math.floor(el.clientWidth - 2)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return { ref, width };
}

/** One rendered PDF page, with whatever overlay the caller draws on top. */
const PageView: React.FC<{
  pdf: LoadedPdf;
  index: number;
  width: number;
  children: (scale: number) => React.ReactNode;
  overlayProps?: React.HTMLAttributes<HTMLDivElement>;
}> = ({ pdf, index, width, children, overlayProps }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!canvasRef.current || !width) return;
    const job = renderPage(pdf, index, canvasRef.current, width);
    job.promise.then((s) => alive && setScale(s)).catch(() => undefined);
    return () => {
      alive = false;
      job.cancel();
    };
  }, [pdf, index, width]);
  return (
    <div className="hr-page">
      <canvas ref={canvasRef} />
      {scale > 0 && (
        <div className="hr-page-overlay" data-page={index} {...overlayProps}>
          {children(scale)}
        </div>
      )}
      {pdf.numPages > 1 && <span className="hr-page-num">Page {index + 1}</span>}
    </div>
  );
};

type Drag =
  | { kind: "move"; id: string; startX: number; startY: number; orig: TemplateField; scale: number }
  | { kind: "resize"; id: string; startX: number; orig: TemplateField; scale: number }
  | { kind: "sig-draw"; page: number; x0: number; y0: number; scale: number; rect: DOMRect }
  | { kind: "sig-move"; startX: number; startY: number; orig: Box; scale: number }
  | { kind: "sig-resize"; startX: number; startY: number; orig: Box; scale: number };

const FixedCanvas: React.FC<{
  pdf: LoadedPdf;
  fields: TemplateField[];
  signatureBox: Box | null;
  tool: "field" | "signature";
  selected: string | null;
  meta: HrMeta | null;
  onSelect: (id: string | null) => void;
  onAdd: (page: number, x: number, y: number) => void;
  onChangeField: (id: string, patch: Partial<TemplateField>) => void;
  onChangeSignature: (box: Box) => void;
}> = ({ pdf, fields, signatureBox, tool, selected, meta, onSelect, onAdd, onChangeField, onChangeSignature }) => {
  const { ref, width } = useContainerWidth();
  const drag = useRef<Drag | null>(null);
  const moved = useRef(false);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      moved.current = true;
      if (d.kind === "move") {
        onChangeField(d.id, {
          x: Math.max(0, d.orig.x + (e.clientX - d.startX) / d.scale),
          y: Math.max(0, d.orig.y + (e.clientY - d.startY) / d.scale)
        });
      } else if (d.kind === "resize") {
        onChangeField(d.id, { width: Math.max(24, d.orig.width + (e.clientX - d.startX) / d.scale) });
      } else if (d.kind === "sig-draw") {
        const x1 = (e.clientX - d.rect.left) / d.scale;
        const y1 = (e.clientY - d.rect.top) / d.scale;
        onChangeSignature({
          page: d.page,
          x: Math.min(d.x0, x1),
          y: Math.min(d.y0, y1),
          width: Math.max(20, Math.abs(x1 - d.x0)),
          height: Math.max(12, Math.abs(y1 - d.y0))
        });
      } else if (d.kind === "sig-move") {
        onChangeSignature({
          ...d.orig,
          x: Math.max(0, d.orig.x + (e.clientX - d.startX) / d.scale),
          y: Math.max(0, d.orig.y + (e.clientY - d.startY) / d.scale)
        });
      } else {
        onChangeSignature({
          ...d.orig,
          width: Math.max(40, d.orig.width + (e.clientX - d.startX) / d.scale),
          height: Math.max(20, d.orig.height + (e.clientY - d.startY) / d.scale)
        });
      }
    },
    [onChangeField, onChangeSignature]
  );

  useEffect(() => {
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
    };
  }, [onMove]);

  const pages = Array.from({ length: pdf.numPages }, (_, i) => i);

  return (
    <div className="hr-pages" ref={ref}>
      {width > 0 &&
        pages.map((index) => (
          <PageView
            key={index}
            pdf={pdf}
            index={index}
            width={width}
            overlayProps={{
              className: `hr-page-overlay ${tool === "signature" ? "is-drawing" : "is-adding"}`
            }}
          >
            {(scale) => (
              <div
                className="hr-overlay-hit"
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / scale;
                  const y = (e.clientY - rect.top) / scale;
                  if (tool === "signature") {
                    drag.current = { kind: "sig-draw", page: index, x0: x, y0: y, scale, rect };
                    onChangeSignature({ page: index, x, y, width: 20, height: 12 });
                  } else {
                    if (selected) onSelect(null);
                    else onAdd(index, x, y);
                  }
                }}
              >
                {fields
                  .filter((f) => f.page === index)
                  .map((f) => (
                    <div
                      key={f.id}
                      className={`hr-field ${selected === f.id ? "is-selected" : ""}`}
                      style={{
                        left: f.x * scale,
                        top: f.y * scale,
                        width: f.width * scale,
                        height: f.fontSize * 1.3 * scale,
                        fontSize: f.fontSize * scale,
                        fontFamily: f.font === "serif" ? "Georgia, 'DejaVu Serif', serif" : "'DejaVu Sans', 'Nunito Sans', sans-serif",
                        fontWeight: f.bold ? 700 : 400,
                        color: f.color,
                        textAlign: f.align
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        moved.current = false;
                        onSelect(f.id);
                        drag.current = { kind: "move", id: f.id, startX: e.clientX, startY: e.clientY, orig: f, scale };
                      }}
                    >
                      <span className="hr-field-text">{placeholderLabel(f.key, meta)}</span>
                      <span
                        className="hr-field-handle"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onSelect(f.id);
                          drag.current = { kind: "resize", id: f.id, startX: e.clientX, orig: f, scale };
                        }}
                        aria-hidden
                      />
                    </div>
                  ))}
                {signatureBox && signatureBox.page === index && (
                  <div
                    className="hr-sig-box"
                    style={{
                      left: signatureBox.x * scale,
                      top: signatureBox.y * scale,
                      width: signatureBox.width * scale,
                      height: signatureBox.height * scale
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag.current = { kind: "sig-move", startX: e.clientX, startY: e.clientY, orig: signatureBox, scale };
                    }}
                  >
                    <PenLine size={14} /> Signature
                    <span
                      className="hr-sig-handle"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        drag.current = { kind: "sig-resize", startX: e.clientX, startY: e.clientY, orig: signatureBox, scale };
                      }}
                      aria-hidden
                    />
                  </div>
                )}
              </div>
            )}
          </PageView>
        ))}
    </div>
  );
};

/** Shows the letterhead with the text area and an approximate text flow. */
const LetterheadCanvas: React.FC<{ pdf: LoadedPdf; form: HrTemplateInput; meta: HrMeta | null }> = ({ pdf, form, meta }) => {
  const { ref, width } = useContainerWidth();
  const { layout } = form;
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc(form.body)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => `<mark>${esc(placeholderLabel(key, meta))}</mark>`);
  }, [form.body, meta]);
  return (
    <div className="hr-pages" ref={ref}>
      <p className="admin-user-sub hr-approx">
        Approximate preview of the first page. Use “Preview” for the real PDF with someone's details.
      </p>
      {width > 0 && (
        <PageView pdf={pdf} index={0} width={width}>
          {(scale) => (
            <div
              className="hr-letter-area"
              style={{
                left: layout.marginLeft * scale,
                right: layout.marginRight * scale,
                top: layout.marginTop * scale,
                bottom: layout.marginBottom * scale,
                fontSize: layout.fontSize * scale,
                lineHeight: layout.lineHeight,
                fontFamily: layout.font === "serif" ? "Georgia, 'DejaVu Serif', serif" : "'DejaVu Sans', 'Nunito Sans', sans-serif"
              }}
            >
              <div className="hr-letter-text" dangerouslySetInnerHTML={{ __html: html }} />
              {form.requiresSignature && <div className="hr-sig-box is-static"><PenLine size={12} /> Signature</div>}
            </div>
          )}
        </PageView>
      )}
    </div>
  );
};

