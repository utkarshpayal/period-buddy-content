/**
 * Loads the Jitsi IFrame API (`external_api.js`) from our own Jitsi server
 * (the domain comes from the API's join response, e.g. meet.thenura.care).
 * Only the bits of the API the portal uses are typed.
 */

export type JitsiEventHandler = (payload: any) => void;

export type JitsiApi = {
  executeCommand: (command: string, ...args: unknown[]) => void;
  addListener: (event: string, handler: JitsiEventHandler) => void;
  removeListener: (event: string, handler: JitsiEventHandler) => void;
  getNumberOfParticipants: () => number;
  dispose: () => void;
};

type JitsiConstructor = new (
  domain: string,
  options: {
    roomName: string;
    jwt: string;
    parentNode: HTMLElement;
    width?: string | number;
    height?: string | number;
    configOverwrite?: Record<string, unknown>;
    interfaceConfigOverwrite?: Record<string, unknown>;
    userInfo?: { displayName?: string };
  }
) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor;
  }
}

const loads = new Map<string, Promise<JitsiConstructor>>();

// A hostname, optionally with a port (e.g. a local test server on meet.localtest.me:8443).
const isHostname = (domain: string) => /^[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?$/i.test(domain);

export function loadJitsiApi(domain: string): Promise<JitsiConstructor> {
  if (!isHostname(domain)) return Promise.reject(new Error("Invalid video server."));
  const existing = loads.get(domain);
  if (existing) return existing;
  const promise = new Promise<JitsiConstructor>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve(window.JitsiMeetExternalAPI);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    // A failed load is never cached: Retry must try the network again.
    const fail = (message: string) => {
      loads.delete(domain);
      script.remove();
      reject(new Error(message));
    };
    script.onload = () =>
      window.JitsiMeetExternalAPI
        ? resolve(window.JitsiMeetExternalAPI)
        : fail("The video service didn't load. Check your connection and try again.");
    script.onerror = () => fail("Couldn't reach the video service. Check your connection and try again.");
    document.head.appendChild(script);
  });
  loads.set(domain, promise);
  return promise;
}

/** Everything the doctor and patient don't need is off; our own buttons replace Jitsi's toolbar. */
export const JITSI_CONFIG_OVERWRITE: Record<string, unknown> = {
  prejoinConfig: { enabled: false },
  toolbarButtons: [],
  disableInviteFunctions: true,
  disableDeepLinking: true,
  hideConferenceSubject: true,
  hideConferenceTimer: false,
  enableInsecureRoomNameWarning: false,
  disableThirdPartyRequests: true,
  p2p: { enabled: false },
  startWithAudioMuted: false,
  startWithVideoMuted: false,
  remoteVideoMenu: { disableGrantModerator: true, disablePrivateChat: true },
  securityUi: { hideLobbyButton: true },
  breakoutRooms: { hideAddRoomButton: true },
  recordingService: { enabled: false },
  liveStreaming: { enabled: false },
  localRecording: { disable: true },
  transcription: { enabled: false },
  giphy: { enabled: false },
  whiteboard: { enabled: false }
};

export const JITSI_INTERFACE_OVERWRITE: Record<string, unknown> = {
  SHOW_JITSI_WATERMARK: false,
  SHOW_BRAND_WATERMARK: false,
  MOBILE_APP_PROMO: false,
  SHOW_PROMOTIONAL_CLOSE_PAGE: false,
  HIDE_INVITE_MORE_HEADER: true
};
