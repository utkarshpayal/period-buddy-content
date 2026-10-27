import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks image uploads across a form's rich text editors. `report(key)` gives
 * each editor a stable `onBusyChange`; `uploading` is true while any is busy,
 * so the form can hold off saving until every image has a URL.
 */
export function useUploadGuard() {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const reporters = useRef(new Map<string, (value: boolean) => void>());

  const report = useCallback((key: string) => {
    let fn = reporters.current.get(key);
    if (!fn) {
      fn = (value: boolean) => setBusy((prev) => (Boolean(prev[key]) === value ? prev : { ...prev, [key]: value }));
      reporters.current.set(key, fn);
    }
    return fn;
  }, []);

  return { uploading: Object.values(busy).some(Boolean), report };
}

/**
 * Remembers a draft as it was when its editor opened. `confirmDiscard()` asks
 * before throwing away edits (backdrop click, Cancel, ×), and closing the tab
 * warns too while there are unsaved changes.
 */
export function useUnsavedChanges<T>(draft: T, isOpen: boolean) {
  const snapshot = useRef<string | null>(null);
  const current = JSON.stringify(draft);

  useEffect(() => {
    snapshot.current = isOpen ? current : null;
    // Only when the editor opens or closes: that's the baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const dirty = isOpen && snapshot.current !== null && snapshot.current !== current;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return useCallback(
    () => !dirty || window.confirm("Discard your unsaved changes? Anything you've written since opening this will be lost."),
    [dirty]
  );
}
