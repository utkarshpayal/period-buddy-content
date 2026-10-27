# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules (all Nura repos)

The full flow is in [docs/WORKFLOW.md](https://github.com/utkarshpayal/period-buddy/blob/main/docs/WORKFLOW.md) in the app repo. The guard hook in `.claude/hooks/guard.mjs` enforces the 🔒 rules.

1. **Branch first:** `git switch -c <type>/<name> origin/staging` (`feat`, `fix`, `chore`, `docs`, `refactor`). 🔒 No commits on `main`.
2. 🔒 **Never push to `main` or force-push `main`/`staging`.** Push your branch only when asked, then a PR goes to `staging`. `main` changes only through a reviewed `staging` → `main` release PR, or a hotfix PR (branch from `origin/main`, then merge `main` back into `staging`).
3. **Leave other people's uncommitted changes alone.** Don't commit, stash, reset or discard them; use a `git worktree` from `origin/staging` instead.
4. 🔒 **Secrets:** never read, print, copy or commit `.env*` (except `.env.example`), keystores or credentials, or read secret values from AWS. Name the key and let the person set the value. A new env var goes in `.env.example` and in every environment (prod and staging).
5. 🔒 **Production is opt-in:** read-only checks are fine. Changing AWS, Vercel, EAS production or live data needs the person's explicit go-ahead, and the hook asks each time. Do it on staging first.
6. **Verify before done:** run `npm run build` (type-check + build), the same checks CI runs. Report failures with their output.
7. **Docs in the same change:** keep this file, the API docs and the cross-repo contracts (WORKFLOW.md §7) in sync with the code.
8. **Stay in scope**, and list other problems you spot instead of fixing them unasked. Work inline: no subagents unless asked.
9. **Commits and PR titles:** `<type>(<scope>): <summary>`, imperative, lowercase, ≤ 72 characters. Fill in the PR template.

## This repo: Admin Workspace

Staff dashboard plus the Clinician portal for doctors, at `admin.thenura.care` (staging: `staging.admin.thenura.care`). React 18 · TypeScript · Vite 6 · React Router 7. Frontend only; everything goes to `period-buddy-be` (`/api/admin/*`, `/api/doctor/*`, `/api/content`). How it fits the system: [ARCHITECTURE.md](https://github.com/utkarshpayal/period-buddy/blob/main/docs/ARCHITECTURE.md). Product and setup detail: `README.md`, `docs/README.md`.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc --noEmit + vite build; this is the CI check
```

- **Backend:** `VITE_API_BASE_URL` (prod `https://www.backend.thenura.care`, staging `https://stage.backend.thenura.care`, local `http://localhost:5000`), set per environment in Vercel. `VITE_API_TOKEN` is dev-only. Every `VITE_*` value is public: never put a secret in one.
- **Layout:** `src/pages/` (one file per page; `subscriptions/`, `hr/`, `gynac/` = Clinician portal), `src/api/` (backend clients), `src/auth/` (roles and permission keys; must mirror the backend's `config/permissions.js`), `src/components/`.
- **Rich text editor:** `src/components/richText/` (TipTap + `tiptap-markdown`, lazy-loaded) on Blog body, Q&A answer, guide points and the condition fields. It saves Markdown plus the allowlist in `src/lib/richText.ts`: palette-named `<span data-color>` / `<mark data-color>`, `<u>`, and ` ```chart ` JSON blocks. The website, app and backend each have a `richText` file mirroring it (WORKFLOW.md §7). Variants: `full` (headings, images, tables, charts), `compact` (styling and lists), `points` (one point per line, inline styling only; the value stays `point\npoint` because the app splits on lines).
- **Automatic notifications** (`src/pages/AutoNotificationsPage.tsx`, App & Growth → Automatic Notifications, `push.read`; switches need `push.broadcast`): the cycle reminders the app sends on its own (backend `utils/autoNotifications.js`). One row per category with how many people have it on and sends/opens in the last 7 days; the switch turns it off for everyone (`PUT /api/admin/notifications/automatic`), keeping each person's own choice.
- **Permissions** come from the backend at login. Hiding a button is UX only: the backend enforces every permission, and lower-tier staff edits go through approval.
- **Video calls** are Jitsi only (`src/lib/jitsi.ts`, `src/pages/gynac/JitsiConsultationCall.tsx`). If a CSP is ever added, allow `https://meet.thenura.care` in `script-src` and `frame-src`.
- **PWA:** `public/sw.js` caches only the shell and hashed assets. Bump `CACHE` there to force installed copies to refresh.
- **Deploy:** Vercel; `main` → production, `staging` → staging. The backend's `ALLOWED_ORIGINS` must list each site, and its `ADMIN_APP_URL` must point at the production site (invite and signing emails link to it).
