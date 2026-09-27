import React, { useEffect, useMemo, useState } from "react";
import { Check, Eye, FileCheck2, Loader2, Mail, PenLine } from "lucide-react";
import { HrApiError, HrDocument, HrMember, HrTemplate, fullName, hrApi, memberValue } from "../../api/hrApi";
import { useToast } from "../../components/Toast";
import { Dialog, PdfModal, labelOf, placeholderLabel, useHrMeta } from "./shared";

/**
 * Pick a template and a member, fill whatever the member record doesn't
 * cover, preview, then generate (and optionally email). Opened from a member
 * (member fixed) or from a template (template fixed).
 */
export const SendDocumentDialog: React.FC<{
  member?: HrMember;
  template?: HrTemplate;
  onClose: () => void;
  onDone?: (doc: HrDocument) => void;
}> = ({ member: fixedMember, template: fixedTemplate, onClose, onDone }) => {
  const toast = useToast();
  const { meta } = useHrMeta();
  const [templates, setTemplates] = useState<HrTemplate[]>(fixedTemplate ? [fixedTemplate] : []);
  const [members, setMembers] = useState<HrMember[]>(fixedMember ? [fixedMember] : []);
  const [templateId, setTemplateId] = useState(fixedTemplate?._id ?? "");
  const [memberId, setMemberId] = useState(fixedMember?._id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  // Keys the server said it couldn't fill, on top of what we work out here.
  const [serverMissing, setServerMissing] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"preview" | "generate" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Blob | null>(null);
  const [result, setResult] = useState<{ doc: HrDocument; emailed: boolean; sent: boolean } | null>(null);

  useEffect(() => {
    if (!fixedTemplate) {
      hrApi
        .listTemplates()
        .then((r) => setTemplates(r.templates.filter((t) => t.active)))
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load templates."));
    }
    if (!fixedMember) {
      hrApi
        .listMembers()
        .then((r) => setMembers(r.members))
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load team members."));
    }
  }, [fixedTemplate, fixedMember]);

  const template = templates.find((t) => t._id === templateId) ?? null;
  const member = members.find((m) => m._id === memberId) ?? null;

  const rows = useMemo(() => {
    if (!template || !member) return [];
    const all = template.placeholders.map((key) => {
      const resolved = memberValue(member, key, meta);
      const ask = resolved === null || serverMissing.includes(key);
      return { key, resolved, ask };
    });
    // Fields to type in go first, so they're never below the fold of the list.
    return [...all.filter((r) => r.ask), ...all.filter((r) => !r.ask)];
  }, [template, member, meta, serverMissing]);

  const unfilled = rows.filter((r) => r.ask && !values[r.key]?.trim()).map((r) => r.key);
  const extraValues = () =>
    Object.fromEntries(rows.filter((r) => r.ask && values[r.key]?.trim()).map((r) => [r.key, values[r.key].trim()]));

  const handleError = (err: unknown, fallback: string) => {
    if (err instanceof HrApiError && err.missing.length) {
      setServerMissing((prev) => [...new Set([...prev, ...err.missing])]);
      setError(`Fill in: ${err.missing.map((k) => placeholderLabel(k, meta)).join(", ")}.`);
    } else setError(err instanceof Error ? err.message : fallback);
  };

  const doPreview = async () => {
    if (!template || !member) return;
    setBusy("preview");
    setError(null);
    try {
      setPreview(await hrApi.preview({ templateId: template._id, memberId: member._id, values: extraValues() }));
    } catch (err) {
      handleError(err, "Couldn't build the preview.");
    } finally {
      setBusy(null);
    }
  };

  const generate = async (send: boolean) => {
    if (!template || !member) return;
    if (unfilled.length) return setError(`Fill in: ${unfilled.map((k) => placeholderLabel(k, meta)).join(", ")}.`);
    if (send && !window.confirm(`Email “${template.name}” to ${member.email}?`)) return;
    setBusy(send ? "send" : "generate");
    setError(null);
    try {
      const res = await hrApi.createDocument({
        templateId: template._id,
        memberId: member._id,
        values: extraValues(),
        send,
        message: message.trim() || undefined
      });
      setResult({ doc: res.document, emailed: res.emailed, sent: send });
      onDone?.(res.document);
      if (send && !res.emailed) toast.error("The document was created, but the email didn't send.");
    } catch (err) {
      handleError(err, "Couldn't create the document.");
    } finally {
      setBusy(null);
    }
  };

  if (result) {
    return (
      <Dialog
        title="Done"
        onClose={onClose}
        footer={<button type="button" className="primary-action" onClick={onClose}>Close</button>}
      >
        <div className="hr-result">
          <span className="hr-result-icon"><Check size={26} /></span>
          <h4>{result.doc.templateName} for {result.doc.member?.fullName ?? member?.firstName}</h4>
          <p>
            {result.doc.number} ·{" "}
            {result.sent
              ? result.emailed
                ? `emailed to ${result.doc.sentTo}.`
                : "created, but the email didn't send. Use Resend from their profile."
              : "generated. You can email it later from their profile."}
          </p>
          {result.doc.requiresSignature && result.emailed && (
            <p className="admin-user-sub">
              <PenLine size={13} /> They'll get a link to sign it online. You'll get an email once they've signed.
            </p>
          )}
        </div>
      </Dialog>
    );
  }

  const ready = Boolean(template && member);

  return (
    <>
      <Dialog
        wide
        title="Send a document"
        subtitle="Fields come from the team member's record. Anything missing, you fill in here."
        onClose={onClose}
        footer={
          <>
            <button type="button" className="gy-btn gy-btn-ghost" disabled={!ready || busy !== null} onClick={doPreview}>
              {busy === "preview" ? <Loader2 className="spin-icon" size={14} /> : <Eye size={14} />} Preview
            </button>
            <button type="button" className="gy-btn gy-btn-ghost" disabled={!ready || busy !== null} onClick={() => generate(false)}>
              {busy === "generate" ? <Loader2 className="spin-icon" size={14} /> : <FileCheck2 size={14} />} Generate only
            </button>
            <button type="button" className="primary-action" disabled={!ready || busy !== null} onClick={() => generate(true)}>
              {busy === "send" ? <Loader2 className="spin-icon" size={16} /> : <Mail size={16} />} Generate &amp; email
            </button>
          </>
        }
      >
        {error && <div className="gy-alert gy-alert-error"><span>{error}</span></div>}

        <div className="hr-grid">
          <label className="ws-field">
            <span>Template</span>
            <select
              value={templateId}
              disabled={Boolean(fixedTemplate)}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setServerMissing([]);
                setError(null);
              }}
            >
              <option value="">Choose a template…</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} · {labelOf(meta?.categories, t.category)}
                </option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>Team member</span>
            <select
              value={memberId}
              disabled={Boolean(fixedMember)}
              onChange={(e) => {
                setMemberId(e.target.value);
                setServerMissing([]);
                setError(null);
              }}
            >
              <option value="">Choose a person…</option>
              {members.map((m) => (
                <option key={m._id} value={m._id}>
                  {fullName(m)} · {m.email}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!fixedTemplate && templates.length === 0 && (
          <p className="admin-user-sub">No active templates yet. Add one under Letter Templates.</p>
        )}

        {ready && (
          <div className="hr-fields-table">
            <div className="hr-fields-head">
              <span>Field</span>
              <span>Value in the document</span>
            </div>
            {rows.length === 0 && <p className="admin-user-sub">This template has no fields to fill.</p>}
            {rows.map((r) => (
              <div key={r.key} className={`hr-fields-row ${r.ask ? "is-ask" : ""}`}>
                <span className="hr-field-key">
                  {placeholderLabel(r.key, meta)}
                  <code>{`{{${r.key}}}`}</code>
                </span>
                {r.ask ? (
                  <input
                    value={values[r.key] ?? ""}
                    placeholder="Needed for this document"
                    onChange={(e) => setValues((v) => ({ ...v, [r.key]: e.target.value }))}
                    aria-label={placeholderLabel(r.key, meta)}
                  />
                ) : (
                  <span className="hr-field-value">{r.resolved || <em>empty</em>}</span>
                )}
              </div>
            ))}
            {template?.requiresSignature && (
              <p className="admin-user-sub hr-sign-note">
                <PenLine size={13} /> Needs a signature: the email includes a link to sign it online.
              </p>
            )}
          </div>
        )}

        <label className="ws-field">
          <span>Personal note in the email (optional)</span>
          <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Welcome aboard! Can't wait to start working with you." />
        </label>
      </Dialog>
      {preview && template && member && (
        <PdfModal
          title={`Preview · ${template.name} for ${fullName(member)}`}
          file={preview}
          filename={`${template.name} - ${fullName(member)} (preview).pdf`}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
};
