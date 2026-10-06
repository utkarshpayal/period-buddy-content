import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `npm run dev` against a deployed API: set DEV_API_PROXY_TARGET (e.g.
 * https://www.backend.thenura.care) and VITE_API_BASE_URL=/backend in .env.
 * The API's CORS list and SameSite=Strict staff cookie only accept our own
 * sites, so the browser talks to this dev server and it forwards /backend/*.
 */
function backendProxy(target: string, origin: string): Record<string, ProxyOptions> {
  return {
    "/backend": {
      target,
      changeOrigin: true,
      secure: true,
      ws: true,
      rewrite: (path) => path.replace(/^\/backend\/?/, "/"),
      cookiePathRewrite: { "/api": "/backend/api" },
      // The API's CSRF check wants an allowed Origin on cookie-authenticated writes.
      headers: { origin }
    }
  };
}

export default defineConfig(({ command, mode }) => {
  const target = loadEnv(mode, process.cwd(), "").DEV_API_PROXY_TARGET;
  return {
    plugins: [react()],
    server:
      command === "serve" && target
        ? { proxy: backendProxy(target, "https://admin.thenura.care") }
        : undefined
  };
});
