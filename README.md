# The Nura — Admin Workspace

Web dashboard for The Nura team and partner doctors, with two portals in one app:

- **Admin Workspace** (staff): content (blogs, guides, videos, Q&A, health conditions),
  users, doctors, government schemes and applications, push notifications,
  subscriptions (features, plans, coupons), company files, analytics, team and
  roles, approvals and audit logs.
- **Clinician portal** (doctors): dashboard, bookings, availability, video
  consultations, payments, profile, reels.

What each staff member sees depends on their role's **permissions**, sent by the
backend at login (`src/auth/access.ts`). Roles: Super Admin, Content (super) admin,
App (super) admin, Clinical admin. Lower-tier staff's changes to live items go
through **approval** by a higher tier.

React 18 · TypeScript · Vite 6 · React Router 7. Backend:
[period-buddy-be](https://github.com/utkarshpayal/period-buddy-be) (`/api/admin/*`, `/api/doctor/*`).

---

## Quick start

Requirements: Node.js 20 and npm.

```bash
npm install
cp .env.example .env      # set VITE_API_BASE_URL
npm run dev               # http://localhost:5173 (also reachable on your LAN)
```

| Key | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend URL: `http://localhost:5000` for a local backend, `https://www.backend.thenura.care` for production. Most pages need it. |
| `VITE_LOGIN_ENDPOINT` | Login path (default `/api/auth/login`) |
| `VITE_CONTENT_ENDPOINT` | Content API path (default `/api/content`) |
| `VITE_API_TOKEN` | **Dev only**: a fixed bearer token to skip login while developing. Ignored in production builds. |

Put `.env` in the **project root** (Vite doesn't read `src/.env`). All `VITE_*`
values are bundled into the public JavaScript, so never put secrets in them.

Staff accounts are invited from **Team** and set their password via the emailed
`/set-password` link. Doctors are invited the same way from **Doctors**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc --noEmit`) + production build into `dist/`, also run in CI |
| `npm run preview` | Serve the built `dist/` locally |

---

## Project structure

```
index.html
public/images/       Static files served as-is (logo/favicon: /images/logo.png)
src/
├── main.tsx, App.tsx    Entry + app shell
├── pages/               One file per workspace page
│   ├── subscriptions/   Features / plans / coupons / settings tabs
│   └── gynac/           Clinician portal pages
├── components/          Sidebars, shared UI
├── api/                 Backend clients (auth, admin, content, company files…)
├── auth/                Roles + permission keys (mirrors backend config/permissions.js)
├── context/, data/, lib/, types/
└── styles/              CSS
vercel.json          SPA rewrite for Vercel hosting
```

## Deployment

Hosted on **Vercel** (`vercel.json` rewrites every path to `index.html` for client-side
routing). Set `VITE_API_BASE_URL=https://www.backend.thenura.care` in the Vercel project's
environment variables. The backend must list this site's origin in `ALLOWED_ORIGINS`,
and its `ADMIN_APP_URL` must be this site's URL, since invite emails link to it.

## Contributing

Branch from `main` and open a PR. CI runs `npm ci` + `npm run build`. Never commit `.env*` files.
