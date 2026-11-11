# The Nura — Admin Workspace

Web dashboard for The Nura team and partner doctors, with two portals in one app:

- **Admin Workspace** (staff): content (blogs, guides, videos, Q&A, health conditions),
  users, help & support tickets from the app (**Support**: queue, reply, assign,
  resolve), doctors, government schemes and applications, push notifications
  (send now, scheduled or repeating),
  subscriptions (features, plans, coupons), company files, analytics, team and
  roles, approvals and audit logs. Clinical Admins also set the commission on
  consultations and pay gynecologists' withdrawals (**Commission & Payouts**,
  see [docs/doctor-payouts.md](docs/doctor-payouts.md)).
- **People & Letters** (Super Admin): your hires and interns, plus offer letters,
  completion letters and certificates filled from Canva PDFs, emailed with an
  online signing link. See [docs/hr-documents.md](docs/hr-documents.md).
- **Clinician portal** (doctors): dashboard, bookings, availability, video
  consultations, prescriptions, payments, earnings & wallet (withdraw to UPI or
  bank), referring colleagues, profile, reels.

Gynac referrals (doctors refer colleagues and earn commission-free sessions; admins
manage referrals, credits and settings) are described in
[docs/gynac-referrals-plan.md](docs/gynac-referrals-plan.md).

All docs: [docs/README.md](docs/README.md). How this fits with the app, API and
CMS: the system [ARCHITECTURE.md](https://github.com/utkarshpayal/period-buddy/blob/main/docs/ARCHITECTURE.md).

What each staff member sees depends on their role's **permissions**, sent by the
backend at login (`src/auth/access.ts`). Roles: Super Admin, Content (super) admin,
App (super) admin, Clinical admin. Lower-tier staff's changes to live items go
through **approval** by a higher tier.

Public pages (no login): `/set-password` (invites) and `/sign/:token` (signing a
letter sent from People & Letters).

React 18 · TypeScript · Vite 6 · React Router 7 · TipTap rich-text editor (content
pages) · pdf.js (template editor and signing page, loaded on demand) · lucide-react icons. Backend:
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
| `npm run dev` | Vite dev server (`--host 0.0.0.0`) |
| `npm run build` | Type-check (`tsc --noEmit`) + production build into `dist/`, also run in CI |
| `npm run preview` | Serve the built `dist/` locally |

There is no test or lint script; CI runs `npm run build`.

---

## Project structure

```
index.html
public/              Static files served as-is: images/logo.png (logo/favicon),
                     icons/, manifest.webmanifest and sw.js (PWA)
src/
├── main.tsx, App.tsx    Entry + app shell
├── pages/               One file per workspace page
│   ├── subscriptions/   Features / plans / coupons / settings tabs
│   ├── hr/              People & Letters, Letter Templates (field editor), send dialog
│   ├── clinicalFinance/ Commission & Payouts (overview, doctors, ledger, payouts, refunds, settings)
│   ├── referrals/       Gynac referrals admin (referrals, credits, settings)
│   ├── notifications/, support/
│   └── gynac/           Clinician portal pages
├── components/          Sidebars, shared UI, richText/ (TipTap editor with images and charts)
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
and its `ADMIN_APP_URL` must be this site's URL, since invite emails and letter-signing links point to it.

## Install as an app

The Admin Workspace is a PWA, so staff can install it from the browser: the
install icon in Chrome/Edge's address bar, or **Share → Add to Home Screen** on
iOS Safari. It opens in its own window with the Nura icon.

- `public/manifest.webmanifest` holds the name, colours and icons (`public/icons/`).
- `public/sw.js` caches only the app shell and hashed `/assets/*`. API calls and
  sign-in always go to the network, so nobody sees stale data. Bump `CACHE` in
  `sw.js` if you ever need to force every installed copy to drop its cache.
- The service worker only registers in production builds (`npm run build`), and
  installing needs HTTPS (or `localhost`).

## Video consultations

Every consultation call runs on the self-hosted Jitsi server (`meet.thenura.care`); there
is no other video path. **Start/Join consultation** on a live booking opens
`src/pages/gynac/JitsiConsultationCall.tsx`: Jitsi's IFrame API (`src/lib/jitsi.ts`,
script loaded from the domain the API returns) with a short-lived moderator token from
`POST /api/doctor/consultations/:id/video/join`. Jitsi's own toolbar is hidden, so the
portal's mic / camera / audio-only / leave buttons are the only controls (no invite,
recording or sharing). The chat button opens the booking's existing chat beside the video,
with the same saved messages as the bookings screen and an unread count for patient messages.
The button is disabled with the reason before the join window
opens, after it closes, or while the API has no Jitsi server (`videoCall.available`), and
the API refuses too. Leaving never completes the session: that's still the **Complete**
button. If the booking is completed or cancelled meanwhile (another tab, the system), the
call closes. When the patient joins first, `GynacIncomingCall` shows "… is waiting"; a
patient declining the doctor's ring shows a banner in the call. If a
Content-Security-Policy is ever added to this site, allow `script-src` and `frame-src
https://meet.thenura.care`.

## Contributing

Branch from `staging` and open a PR to `staging`; releases are `staging` → `main` PRs ([WORKFLOW.md](https://github.com/utkarshpayal/period-buddy/blob/main/docs/WORKFLOW.md)). CI runs `npm ci` + `npm run build`. Never commit `.env*` files.
