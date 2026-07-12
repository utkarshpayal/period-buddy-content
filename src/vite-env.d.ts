/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TOKEN?: string;
  readonly VITE_CONTENT_ENDPOINT?: string;
  readonly VITE_LOGIN_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
