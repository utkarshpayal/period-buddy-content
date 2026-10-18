import React from "react";
import { Smartphone, Store } from "lucide-react";
import type { PushData, PushTap } from "../../api/adminApi";

/*
 * "Tap opens an app store" for update pushes. The checks mirror the backend's
 * allowlist (period-buddy-be src/utils/notificationRoute.js: isAllowedStoreUrl,
 * parseNotificationStoreLink), so a bad link is caught before sending:
 *   https://play.google.com/…   market://…   https://apps.apple.com/…
 * No credentials, ports or whitespace; at most 500 characters.
 */

export type TapMode = "route" | "store";

export const STORE_URL_MAX = 500;

export const isAllowedStoreUrl = (value: string): boolean => {
  if (!value || value.length > STORE_URL_MAX || /\s/.test(value)) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.port) return false;
  if (parsed.protocol === "market:") return /^market:\/\/[A-Za-z0-9]/.test(value);
  if (parsed.protocol !== "https:") return false;
  return parsed.hostname === "play.google.com" || parsed.hostname === "apps.apple.com";
};

export const isIosStoreUrl = (value: string): boolean =>
  isAllowedStoreUrl(value) && new URL(value).hostname === "apps.apple.com";

/** Same messages as the backend's 400s. */
export const storeUrlError = (value: string): string | null => {
  const url = value.trim();
  if (!url || isAllowedStoreUrl(url)) return null;
  return "Store link must be a Play Store (https://play.google.com/… or market://…) or App Store (https://apps.apple.com/…) link";
};

export const iosStoreUrlError = (value: string): string | null => {
  const url = value.trim();
  if (!url || isIosStoreUrl(url)) return null;
  return "iPhone store link must be an https://apps.apple.com/… link";
};

/** The tap fields a send carries: a route, or kind + store links. Blank = left out. */
export const tapPayload = (mode: TapMode, route: string, storeUrl: string, iosStoreUrl: string): PushTap =>
  mode === "store"
    ? {
        kind: "app_update",
        storeUrl: storeUrl.trim() || undefined,
        iosStoreUrl: iosStoreUrl.trim() || undefined
      }
    : { route: route || undefined };

/** Composer state from a saved push's data (reuse / edit). */
export const tapFromData = (data?: PushData | null) => {
  const isStore = !!data && (data.kind === "app_update" || !!data.storeUrl || !!data.iosStoreUrl);
  if (!isStore) return { mode: "route" as TapMode, route: data?.route ?? "", storeUrl: "", iosStoreUrl: "" };
  const ios = data.iosStoreUrl ?? "";
  // The server copies an iPhone-only link into storeUrl; don't show it twice.
  const store = data.storeUrl && data.storeUrl !== ios ? data.storeUrl : "";
  return { mode: "store" as TapMode, route: "", storeUrl: store, iosStoreUrl: ios };
};

/** Short label of a store link, e.g. "Play Store + App Store". */
export const storeLinkLabel = (data?: Pick<PushData, "storeUrl" | "iosStoreUrl"> | null) => {
  const urls = [data?.storeUrl, data?.iosStoreUrl].filter((u): u is string => !!u);
  const play = urls.some((u) => !isIosStoreUrl(u));
  const apple = urls.some(isIosStoreUrl);
  if (play && apple) return "Play Store + App Store";
  if (play) return "Play Store";
  if (apple) return "App Store";
  return "App store (App settings links)";
};

/** "Opens" chip for history / schedule rows; null when the tap opens the default list. */
export const TapChip: React.FC<{ data?: PushData | null; routeLabel: (route: string) => string }> = ({
  data,
  routeLabel
}) => {
  if (data?.storeUrl || data?.iosStoreUrl || data?.kind === "app_update") {
    const links = [data.storeUrl, data.iosStoreUrl !== data.storeUrl ? data.iosStoreUrl : undefined]
      .filter(Boolean)
      .join("\n");
    return (
      <span className="pn-item-aud" title={links || undefined}>
        <Store size={13} /> {storeLinkLabel(data)}
      </span>
    );
  }
  if (data?.route) {
    return (
      <span className="pn-item-aud" title={data.route}>
        <Smartphone size={13} /> {routeLabel(data.route)}
      </span>
    );
  }
  return null;
};

export const StoreLinkFields: React.FC<{
  storeUrl: string;
  iosStoreUrl: string;
  onStoreUrl: (v: string) => void;
  onIosStoreUrl: (v: string) => void;
}> = ({ storeUrl, iosStoreUrl, onStoreUrl, onIosStoreUrl }) => {
  const playErr = storeUrlError(storeUrl);
  const iosErr = iosStoreUrlError(iosStoreUrl);
  return (
    <div className="pn-store">
      <label className="pn-field">
        <span className="pn-label-row">
          <span>Play Store link</span>
          <span className="pn-muted">Optional</span>
        </span>
        <input
          type="url"
          value={storeUrl}
          maxLength={STORE_URL_MAX}
          placeholder="https://play.google.com/store/apps/details?id=…"
          aria-invalid={!!playErr}
          onChange={(e) => onStoreUrl(e.target.value)}
        />
        {playErr ? (
          <small className="pn-error">{playErr}</small>
        ) : (
          <small className="pn-muted">https://play.google.com/… or market://…</small>
        )}
      </label>
      <label className="pn-field">
        <span className="pn-label-row">
          <span>App Store link</span>
          <span className="pn-muted">Optional</span>
        </span>
        <input
          type="url"
          value={iosStoreUrl}
          maxLength={STORE_URL_MAX}
          placeholder="https://apps.apple.com/app/…"
          aria-invalid={!!iosErr}
          onChange={(e) => onIosStoreUrl(e.target.value)}
        />
        {iosErr ? (
          <small className="pn-error">{iosErr}</small>
        ) : (
          <small className="pn-muted">https://apps.apple.com/… (opened on iPhones)</small>
        )}
      </label>
      <small className="pn-muted pn-store-note">
        Leave empty to use the store links from App settings (Update prompt). An empty App Store field
        always falls back to the App settings link.
      </small>
    </div>
  );
};
