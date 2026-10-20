// Escape closes the topmost dialog marked `data-esc-close`, by clicking its
// overlay, so it goes through the same close handler as a backdrop click
// (including any "busy, don't close" guard that handler has). Dialogs that
// handle Escape themselves, and calls, aren't marked.
let installed = false;

export function installEscapeToClose() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const overlays = document.querySelectorAll<HTMLElement>("[data-esc-close]");
    const top = overlays[overlays.length - 1];
    if (!top) return;
    event.preventDefault();
    top.click();
  });
}
