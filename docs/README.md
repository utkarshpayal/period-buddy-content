# Documentation — Admin Workspace (`period-buddy-content`)

This repo's docs live in this folder; [`../README.md`](../README.md) stays at
the root and covers setup, scripts, project structure and deployment.

| Doc | What's in it |
|---|---|
| [../README.md](../README.md) | What the three portals (Admin Workspace, People & Letters, clinician portal) do, env vars, scripts, project structure, deployment. |
| [hr-documents.md](hr-documents.md) | People & Letters: templates from Canva PDFs, filling, emailing and online signing. |
| [doctor-payouts.md](doctor-payouts.md) | Commission on consultations, gynecologists' wallets and withdrawals (manual or Cashfree Payouts). |

## Access and security

- Staff sign in with their Admin Workspace account; what they see comes from
  their role's permissions (`src/auth/access.ts`, backed by the API's
  `src/config/permissions.js`). The role table is in the system
  [ARCHITECTURE.md](https://github.com/utkarshpayal/period-buddy/blob/main/docs/ARCHITECTURE.md#who-can-use-which-portal).
- Two-step sign-in, cookie sessions, audit logging and what staff can and
  can't see about users: the API's
  [SECURITY.md](https://github.com/utkarshpayal/period-buddy-be/blob/main/docs/SECURITY.md).

## All Nura repos

| Repo | What | Its docs |
|---|---|---|
| [period-buddy](https://github.com/utkarshpayal/period-buddy) (`The-Nura-App`) | Mobile app | [docs/](https://github.com/utkarshpayal/period-buddy/tree/main/docs), including the system [ARCHITECTURE.md](https://github.com/utkarshpayal/period-buddy/blob/main/docs/ARCHITECTURE.md) |
| [period-buddy-be](https://github.com/utkarshpayal/period-buddy-be) (`The-Nura-Backend`) | API | [docs/](https://github.com/utkarshpayal/period-buddy-be/tree/main/docs), including [SECURITY.md](https://github.com/utkarshpayal/period-buddy-be/blob/main/docs/SECURITY.md) and [INFRASTRUCTURE.md](https://github.com/utkarshpayal/period-buddy-be/blob/main/docs/INFRASTRUCTURE.md) |
| [period-buddy-content](https://github.com/utkarshpayal/period-buddy-content) (`The-Nura-Admin-Website`) | Admin Workspace, clinician portal | this folder |
| [the-nura-care-cms](https://github.com/utkarshpayal/the-nura-care-cms) (`The-Nura-CMS`) | App CMS | [docs/](https://github.com/utkarshpayal/the-nura-care-cms/tree/main/docs) |
| [The-Nura-website](https://github.com/utkarshpayal/The-Nura-website) (`The-Nura-Marketing-Website`) | Marketing site | [docs/](https://github.com/utkarshpayal/The-Nura-website/tree/main/docs) |
