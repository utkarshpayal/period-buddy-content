import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, Check, Download, Eraser, Loader2, PenLine, Upload } from "lucide-react";
import { HrApiError, SignSession, downloadBlob, signApi } from "../api/hrApi";
import { LoadedPdf, loadPdf, renderPage } from "../lib/pdf";

/*
 * Public e-signing page (docs/hr-documents.md): the link in an offer-letter
 * email lands here. No login: the token in the URL is the credential, and
 * the backend only ever serves this one document for it. Most people open
 * it on their phone, so everything is one column.
 */

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; title: string; message: string }
  | { kind: "ready"; session: SignSession; file: Blob; pdf: LoadedPdf };

const MAX_SIGNATURE_WIDTH = 800;

export const SignPage: React.FC = () => {
  const { token = "" } = useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [signature, setSignature] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ signedAt: string; file: Blob | null } | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const session = await signApi.session(token);
      const file = await signApi.file(token);
      const pdf = await loadPdf(file);
      setState({ kind: "ready", session, file, pdf });
      setName((n) => n || session.recipient.fullName);
    } catch (err) {
      const status = err instanceof HrApiError ? err.status : 0;
      setState({
        kind: "error",
        title: status === 410 ? "This link has expired" : status === 404 ? "This link isn't valid" : "Something went wrong",
        message:
          status === 410
            ? "It was revoked, or it's more than 30 days old. Ask the person who sent it for a new link."
            : status === 404
              ? "Please open the link exactly as it appears in your email."
              : err instanceof Error
                ? err.message
                : "Please try again in a moment."
      });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signature) return setError("Add your signature first.");
    if (!name.trim()) return setError("Type your full name.");
    if (!agree) return setError("Tick the box to confirm.");
    setSubmitting(true);
    setError(null);
    try {
      const res = await signApi.submit(token, { signature, name: name.trim(), agree: true });
      const file = await signApi.file(token).catch(() => null);
      setDone({ signedAt: res.signedAt, file });
    } catch (err) {
      if (err instanceof HrApiError && err.status === 409) {
        await load();
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't submit your signature.");
    } finally {
      setSubmitting(false);
    }
  };

  const header = (company?: string) => (
    <div className="sign-brand">
      <img loading="lazy" decoding="async" src="/images/logo.png" alt="" />
      <span>{company ?? "The Nura Care"}</span>
    </div>
  );

  if (state.kind === "loading") {
    return (
      <div className="sign-page">
        {header()}
        <div className="sign-card sign-center">
          <Loader2 className="spin-icon" size={26} />
          <p>Opening your document…</p>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="sign-page">
        {header()}
        <div className="sign-card sign-center">
          <span className="sign-status-icon is-bad"><AlertCircle size={26} /></span>
          <h1>{state.title}</h1>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const { session, pdf } = state;
  const docName = session.document.templateName;
  const fileName = `${docName} - ${session.recipient.fullName}${session.document.status === "signed" || done ? " (signed)" : ""}.pdf`;

  if (done) {
    return (
      <div className="sign-page">
        {header(session.companyName)}
        <div className="sign-card sign-center">
          <span className="sign-status-icon"><Check size={28} /></span>
          <h1>Signed. Thank you, {session.recipient.firstName}!</h1>
          <p>
            Your signed {docName.toLowerCase()} has been sent to {session.companyName}. A copy is on its way to your inbox.
          </p>
          {done.file && (
            <button type="button" className="sign-btn" onClick={() => downloadBlob(done.file!, fileName)}>
              <Download size={16} /> Download signed copy
            </button>
          )}
        </div>
      </div>
    );
  }

  const alreadySigned = session.document.status === "signed";
  const canSign = session.document.requiresSignature && !alreadySigned && session.signatureBox;

  return (
    <div className="sign-page">
      {header(session.companyName)}
      <div className="sign-card">
        <p className="sign-eyebrow">{session.document.number}</p>
        <h1>{docName}</h1>
        <p className="sign-lead">
          {alreadySigned
            ? `Signed by ${session.document.signerName ?? session.recipient.fullName}${session.document.signedAt ? ` on ${new Date(session.document.signedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}` : ""}.`
            : canSign
              ? `Hi ${session.recipient.firstName}, please read the document below, then sign at the end of this page.`
              : `Hi ${session.recipient.firstName}, here is your document from ${session.companyName}.`}
        </p>
        <button type="button" className="sign-btn is-ghost" onClick={() => downloadBlob(state.file, fileName)}>
          <Download size={15} /> Download PDF
        </button>
      </div>

      <PdfPages pdf={pdf} box={canSign ? session.signatureBox : null} signature={signature} />

      {canSign && (
        <form className="sign-card sign-form" onSubmit={submit}>
          <h2>
            <PenLine size={18} /> Your signature
          </h2>
          <SignaturePad value={signature} onChange={setSignature} />
          <label className="sign-field">
            <span>Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
          </label>
          <label className="sign-agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              I have read this document and I agree to sign it electronically. My signature here is as valid as a
              handwritten one.
            </span>
          </label>
          {error && (
            <div className="sign-error">
              <AlertCircle size={16} /> {error}
            </div>
          )}
          <button type="submit" className="sign-btn" disabled={submitting}>
            {submitting ? <Loader2 className="spin-icon" size={16} /> : <Check size={16} />} Sign &amp; submit
          </button>
        </form>
      )}
      <p className="sign-foot">Sent securely by {session.companyName}. Only people with this link can see this document.</p>
    </div>
  );
};

/* ------------------------------ PDF pages ------------------------------ */

const PdfPages: React.FC<{ pdf: LoadedPdf; box: SignSession["signatureBox"]; signature: string | null }> = ({ pdf, box, signature }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.min(820, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="sign-pages" ref={wrapRef}>
      {width > 0 &&
        Array.from({ length: pdf.numPages }, (_, i) => (
          <SignPageCanvas key={i} pdf={pdf} index={i} width={width} box={box && box.page === i ? box : null} signature={signature} />
        ))}
    </div>
  );
};

const SignPageCanvas: React.FC<{
  pdf: LoadedPdf;
  index: number;
  width: number;
  box: SignSession["signatureBox"];
  signature: string | null;
}> = ({ pdf, index, width, box, signature }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!canvasRef.current) return;
    const job = renderPage(pdf, index, canvasRef.current, width);
    job.promise.then((s) => alive && setScale(s)).catch(() => undefined);
    return () => {
      alive = false;
      job.cancel();
    };
  }, [pdf, index, width]);
  return (
    <div className="sign-page-sheet">
      <canvas ref={canvasRef} />
      {box && scale > 0 && (
        <div
          className={`sign-box ${signature ? "has-signature" : ""}`}
          style={{ left: box.x * scale, top: box.y * scale, width: box.width * scale, height: box.height * scale }}
        >
          {signature ? <img loading="lazy" decoding="async" src={signature} alt="Your signature" /> : <span>Sign here</span>}
        </div>
      )}
    </div>
  );
};

/* ---------------------------- Signature pad ---------------------------- */

const SignaturePad: React.FC<{ value: string | null; onChange: (dataUrl: string | null) => void }> = ({ value, onChange }) => {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Size the canvas to its box at device resolution.
  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#1B1B3A";
    hasInk.current = false;
  }, [mode]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const exportInk = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) return;
    // Downscale very wide canvases so the upload stays small.
    if (canvas.width > MAX_SIGNATURE_WIDTH) {
      const out = document.createElement("canvas");
      out.width = MAX_SIGNATURE_WIDTH;
      out.height = Math.round((canvas.height / canvas.width) * MAX_SIGNATURE_WIDTH);
      out.getContext("2d")?.drawImage(canvas, 0, 0, out.width, out.height);
      onChange(out.toDataURL("image/png"));
    } else onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    onChange(null);
  };

  const upload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const w = Math.min(MAX_SIGNATURE_WIDTH, img.naturalWidth);
      const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      // Turn a white paper background transparent so it sits on the letter.
      const data = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < data.data.length; i += 4) {
        const [r, g, b] = [data.data[i], data.data[i + 1], data.data[i + 2]];
        if (r > 225 && g > 225 && b > 225) data.data[i + 3] = 0;
      }
      ctx.putImageData(data, 0, 0);
      onChange(out.toDataURL("image/png"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="sign-pad">
      <div className="sign-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "draw"} className={mode === "draw" ? "is-active" : ""} onClick={() => { setMode("draw"); onChange(null); }}>
          <PenLine size={14} /> Draw
        </button>
        <button type="button" role="tab" aria-selected={mode === "upload"} className={mode === "upload" ? "is-active" : ""} onClick={() => { setMode("upload"); onChange(null); }}>
          <Upload size={14} /> Upload a photo
        </button>
      </div>

      {mode === "draw" ? (
        <>
          <canvas
            ref={canvasRef}
            className="sign-canvas"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              last.current = point(e);
            }}
            onPointerMove={(e) => {
              if (!drawing.current || !last.current) return;
              const ctx = e.currentTarget.getContext("2d");
              const p = point(e);
              if (!ctx) return;
              ctx.beginPath();
              ctx.moveTo(last.current.x, last.current.y);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
              last.current = p;
              hasInk.current = true;
            }}
            onPointerUp={() => {
              drawing.current = false;
              last.current = null;
              exportInk();
            }}
            onPointerLeave={() => {
              if (drawing.current) exportInk();
              drawing.current = false;
            }}
          />
          <div className="sign-pad-foot">
            <span>Sign with your finger or mouse</span>
            <button type="button" className="sign-link" onClick={clear}>
              <Eraser size={14} /> Clear
            </button>
          </div>
        </>
      ) : (
        <label className="sign-upload">
          {value ? <img loading="lazy" decoding="async" src={value} alt="Your signature" /> : <span>Sign on white paper, take a photo, and choose it here.</span>}
          <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0] ?? null)} />
        </label>
      )}
    </div>
  );
};
