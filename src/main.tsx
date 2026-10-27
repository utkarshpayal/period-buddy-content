import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installEscapeToClose } from "./lib/escapeToClose";
import "./styles/tokens.css";
import "./styles.css";
import "./styles/portal.css";
import "./styles/hr.css";
import "./styles/finance.css";
import "./styles/availability.css";
import "./styles/referrals.css";
import "./styles/support.css";
import "./styles/richText.css";
import "./styles/portal-consistency.css";

installEscapeToClose();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Lets staff install the Admin Workspace as an app (see public/sw.js).
// Production only, so Vite's dev server never gets served stale files.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
