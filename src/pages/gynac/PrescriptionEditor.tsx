import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Pill, Plus, Trash2, X } from "lucide-react";
import { Rx, RxMedicine } from "../../api/doctorApi";

/* Suggestions for the medicine row fields; doctors can type anything. */
const DOSES = ["1 tablet", "½ tablet", "2 tablets", "1 capsule", "5 ml", "10 ml", "1 sachet", "1 injection", "Apply thin layer"];
const FREQUENCIES = ["1-0-0", "0-0-1", "1-0-1", "1-1-1", "0-1-0", "1-1-0", "0-1-1", "Once a day", "Once a week", "SOS (when needed)"];
const TIMINGS = ["After food", "Before food", "With food", "Empty stomach", "At bedtime", "With milk"];
const DURATIONS = ["3 days", "5 days", "7 days", "10 days", "15 days", "1 month", "2 months", "3 months", "Till next visit"];
const FOLLOW_UPS = ["After 1 week", "After 2 weeks", "After 1 month", "After 3 months", "With reports", "If symptoms persist"];

const MAX_MEDICINES = 20;
const emptyMedicine = (): RxMedicine => ({ name: "", dose: "", frequency: "", timing: "", duration: "", notes: "" });

/** The editor's starting point: the saved structured prescription, or an
 * older free-text one carried into Advice so nothing is lost. */
const initialRx = (rx?: Rx | null, text?: string): Rx => {
  if (rx) return { ...rx, medicines: rx.medicines.length ? rx.medicines.map((m) => ({ ...emptyMedicine(), ...m })) : [emptyMedicine()] };
  return { complaints: "", diagnosis: "", medicines: [emptyMedicine()], investigations: "", advice: text ?? "", followUp: "" };
};

/**
 * Write or edit a prescription the way it prints: complaints and diagnosis,
 * a medicine table (dose, 1-0-1 style frequency, food timing, duration),
 * investigations, advice and follow-up. The patient can download it as a PDF.
 */
export const PrescriptionEditor: React.FC<{
  patientName: string;
  rx?: Rx | null;
  text?: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (rx: Rx) => void;
}> = ({ patientName, rx: savedRx, text, saving, onCancel, onSave }) => {
  const [rx, setRx] = useState<Rx>(() => initialRx(savedRx, text));
  const listRef = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // After "Add medicine", put the cursor in the new row's name.
  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    const inputs = listRef.current?.querySelectorAll<HTMLInputElement>("input[data-name]");
    inputs?.[inputs.length - 1]?.focus();
  }, [rx.medicines.length]);

  const set = (patch: Partial<Rx>) => setRx((prev) => ({ ...prev, ...patch }));
  const setMedicine = (index: number, patch: Partial<RxMedicine>) =>
    setRx((prev) => ({ ...prev, medicines: prev.medicines.map((m, i) => (i === index ? { ...m, ...patch } : m)) }));

  const filled = rx.medicines.filter((m) => m.name.trim());
  const nameless = rx.medicines.findIndex((m) => !m.name.trim() && [m.dose, m.frequency, m.timing, m.duration, m.notes].some((v) => v.trim()));
  const problem =
    nameless >= 0
      ? `Medicine ${nameless + 1} needs a name.`
      : !filled.length && !rx.advice.trim() && !rx.investigations.trim()
        ? "Add at least one medicine, investigation or piece of advice."
        : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || saving) return;
    onSave({ ...rx, medicines: filled });
  };

  return (
    <div className="gx-overlay is-centered" onClick={onCancel}>
      <form className="gx-dialog rxe" role="dialog" aria-label={`Prescription for ${patientName}`} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="gx-drawer-head">
          <span>
            <Pill size={16} /> Prescription for {patientName}
          </span>
          <button className="gx-icon-btn" type="button" aria-label="Close" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <p className="gx-muted">Saved prescriptions appear in the patient's app right away, and they can download it as a PDF for the pharmacy.</p>

        <div className="rxe-grid">
          <label className="gx-field">
            <span>Chief complaints</span>
            <textarea className="gx-textarea" rows={2} maxLength={500} value={rx.complaints} placeholder="e.g. Irregular periods for 3 months" onChange={(e) => set({ complaints: e.target.value })} />
          </label>
          <label className="gx-field">
            <span>Diagnosis</span>
            <textarea className="gx-textarea" rows={2} maxLength={500} value={rx.diagnosis} placeholder="Provisional diagnosis" onChange={(e) => set({ diagnosis: e.target.value })} />
          </label>
        </div>

        <section className="rxe-meds" aria-label="Medicines">
          <div className="rxe-meds-head">
            <h3>
              <span className="rxe-rx" aria-hidden>
                &#8478;
              </span>{" "}
              Medicines
            </h3>
            <small>Frequency is morning–noon–night, e.g. 1-0-1</small>
          </div>
          <div className="rxe-cols" aria-hidden>
            <span />
            <span>Medicine</span>
            <span>Dose</span>
            <span>Frequency</span>
            <span>When</span>
            <span>Duration</span>
            <span />
          </div>
          <div ref={listRef} className="rxe-rows">
            {rx.medicines.map((m, i) => (
              <div className="rxe-row" key={i}>
                <span className="rxe-n" aria-hidden>
                  {i + 1}
                </span>
                <input
                  data-name
                  className="rxe-name"
                  value={m.name}
                  maxLength={120}
                  placeholder="Tab. Folic acid 5 mg"
                  aria-label={`Medicine ${i + 1} name`}
                  onChange={(e) => setMedicine(i, { name: e.target.value })}
                />
                <input list="rxe-doses" value={m.dose} maxLength={40} placeholder="1 tablet" aria-label={`Medicine ${i + 1} dose`} onChange={(e) => setMedicine(i, { dose: e.target.value })} />
                <input list="rxe-freq" value={m.frequency} maxLength={30} placeholder="1-0-1" aria-label={`Medicine ${i + 1} frequency`} onChange={(e) => setMedicine(i, { frequency: e.target.value })} />
                <input list="rxe-timing" value={m.timing} maxLength={40} placeholder="After food" aria-label={`Medicine ${i + 1} when to take`} onChange={(e) => setMedicine(i, { timing: e.target.value })} />
                <input list="rxe-duration" value={m.duration} maxLength={40} placeholder="5 days" aria-label={`Medicine ${i + 1} duration`} onChange={(e) => setMedicine(i, { duration: e.target.value })} />
                <button
                  className="gx-icon-btn"
                  type="button"
                  aria-label={`Remove medicine ${i + 1}`}
                  title="Remove"
                  onClick={() => setRx((prev) => ({ ...prev, medicines: prev.medicines.length > 1 ? prev.medicines.filter((_, k) => k !== i) : [emptyMedicine()] }))}
                >
                  <Trash2 size={15} />
                </button>
                <input
                  className="rxe-notes"
                  value={m.notes}
                  maxLength={160}
                  placeholder="Note for the patient (optional), e.g. Not with tea or milk"
                  aria-label={`Medicine ${i + 1} note`}
                  onChange={(e) => setMedicine(i, { notes: e.target.value })}
                />
              </div>
            ))}
          </div>
          <button
            className="gx-btn gx-btn-ghost gx-btn-sm rxe-add"
            type="button"
            disabled={rx.medicines.length >= MAX_MEDICINES}
            onClick={() => {
              focusLast.current = true;
              setRx((prev) => ({ ...prev, medicines: [...prev.medicines, emptyMedicine()] }));
            }}
          >
            <Plus size={15} /> Add medicine
          </button>
        </section>

        <div className="rxe-grid">
          <label className="gx-field">
            <span>Investigations advised</span>
            <textarea className="gx-textarea" rows={3} maxLength={1000} value={rx.investigations} placeholder="CBC, Serum ferritin, Ultrasound pelvis" onChange={(e) => set({ investigations: e.target.value })} />
          </label>
          <label className="gx-field">
            <span>Advice</span>
            <textarea className="gx-textarea" rows={3} maxLength={1000} value={rx.advice} placeholder="Diet, rest, warning signs to watch for" onChange={(e) => set({ advice: e.target.value })} />
          </label>
        </div>

        <label className="gx-field rxe-follow">
          <span>Follow-up</span>
          <input list="rxe-follow" value={rx.followUp} maxLength={80} placeholder="After 2 weeks, with reports" onChange={(e) => set({ followUp: e.target.value })} />
        </label>

        <datalist id="rxe-doses">{DOSES.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="rxe-freq">{FREQUENCIES.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="rxe-timing">{TIMINGS.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="rxe-duration">{DURATIONS.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="rxe-follow">{FOLLOW_UPS.map((v) => <option key={v} value={v} />)}</datalist>

        <div className="gx-dialog-actions rxe-actions">
          <span className={problem ? "rxe-problem" : "gx-muted"}>{problem ?? `${filled.length} medicine${filled.length === 1 ? "" : "s"}`}</span>
          <button className="gx-btn gx-btn-ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="gx-btn gx-btn-primary" type="submit" disabled={saving || Boolean(problem)}>
            {saving ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
            Save prescription
          </button>
        </div>
      </form>
    </div>
  );
};
