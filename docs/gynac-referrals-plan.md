# Gynac Referral Program — Implementation Plan

> Status: **Implemented** (branch `feat/gynac-referrals` in both repos). Decisions taken: Q1 = A (onboarded = referred gynac sets their password), Q2 = credits never expire by default (admin-configurable), Q3 = in-flight referrals are still rewarded when the program is paused, Q4 = new `referrals.read` / `referrals.manage` permissions. **Update:** the admin approval step was removed afterwards: a portal referral emails the colleague their invite at once (profile at the referrer's fee, bookings paused until they join); admins are emailed an FYI and can close the referral or deactivate the gynac. Admin-recorded offline leads still go through approve.
> Repos touched: `The-Nura-Backend` (Express + Mongoose) and `The-Nura-Admin-Website` (React + Vite).

## 1. The feature in one paragraph

A gynac refers a colleague from their portal. A Clinical Admin or Super Admin reviews the referral and sends the invite. When the referred gynac **completes onboarding** (accepts the invite and sets a password), the referrer automatically gets a **credit of 5 commission-free sessions**. On each of the next 5 paid consultations, Nura takes 0% commission, so the gynac keeps 100% of the fee. The patient price doesn't change. Admins can see, approve, reject, reassign, revoke, grant bonus credits and configure the program from the admin portal.

## 2. How this fits what exists today (findings)

| Area | Today | Consequence |
|---|---|---|
| Admin roles | There is no "medical admin" or "doctor admin" role. The existing one is **`clinical_admin`** ("Clinical Admin"), plus `admin` (Super Admin). | Manage access goes to these two roles. |
| Gynac signup | **Invite-only.** The admin sends `POST /api/doctor/invite`, and the gynac then accepts at `/set-password`. There is no public signup, and the mobile app is patient-only. | A referral is a **lead that admin approves → invite**. There's no public code entry, which is also the main anti-fraud gate. |
| "Onboarded" | `setPasswordFromInvite` sets `mustSetPassword=false`. This is the only completion moment. | This is the reward trigger (see Q1). |
| Commission | It is calculated in one place: `recordConsultationEarning` (`utils/doctorWallet.js`). It is idempotent per consultation, rates are in bps, and the result is snapshotted on the `DoctorEarning` row (`commissionSource: default/doctor/none`). | Free sessions plug in there with `bps=0, commissionSource:'referral'`. |
| Cancellations | `reverseConsultationEarnings` runs on cancel/refund before completion, and the reconciler runs every 30 min. | A cancelled free session gives the credit back. |
| Notifications / audit | Email via `sendMail` + templates, a live WS via `notifyUserLive`, and `recordAudit`. | All are reused. |

## 3. Lifecycle

```
Gynac submits referral ──► SUBMITTED ──(admin approves)──► INVITED ──(referred gynac sets password)──► ONBOARDED + reward granted
                              │                              │
                              ├─(admin rejects)─► REJECTED   ├─(admin cancels / invite revoked / doctor deleted)─► CANCELLED
                              └─(referrer withdraws)─► WITHDRAWN
Reward (credit): ACTIVE ──(5 sessions used)──► EXHAUSTED
                   ├─(admin revokes)─► REVOKED  (only unused sessions are revoked; used ones stay free)
                   └─(expiry date, if configured)─► EXPIRED
```

An admin can also create a referral directly. This covers the case where a gynac mentions a colleague offline. There are two ways to do it:
- a "Referred by" picker in the existing **Invite Gynecologist** form, or
- attaching a referrer to an already-invited gynac who hasn't onboarded yet.

## 4. Backend (`The-Nura-Backend`)

### 4.1 Models
**`DoctorReferral`** (new)
- `referrerDoctorId` (ref Doctor, indexed)
- `referredName`, `referredEmail` (lowercased and trimmed), `referredPhone?`, `note?` (max 500 chars)
- `source`: `portal` | `admin`
- `status`: `submitted` | `invited` | `onboarded` | `rejected` | `withdrawn` | `cancelled`
- `referredDoctorId?` (set at invite)
- `reviewedBy`, `reviewedAt`, `rejectionReason`, `invitedAt`, `onboardedAt`
- `rewardSessions` (a snapshot of the setting at grant time), `creditId?`
- Indexes:
  - a unique partial index on `referredEmail` where `status ∈ {submitted, invited, onboarded}`, which allows only one live referral per email;
  - `{referrerDoctorId, createdAt}`.

**`ReferralCredit`** (new): one row per grant, which keeps the ledger auditable.
- `doctorId` (indexed), `referralId?` (null for manual bonus), `kind`: `referral` | `manual`
- `sessionsGranted`, `sessionsUsed`, `usages: [{ consultationId, earningId, usedAt, releasedAt? }]`
- `status`: `active` | `exhausted` | `revoked` | `expired`, `expiresAt?`
- `createdBy?`, `revokedBy?`, `reason?`

**`ClinicalPayoutSettings`** (extend the existing singleton)
- `referralProgramEnabled` (default `true`)
- `referralRewardSessions` (default **5**, range 1–50)
- `referralCreditExpiryDays` (default `null`, meaning never)
- `referralMaxOpenPerDoctor` (default 10, anti-spam)

**`DoctorEarning`**: add `'referral'` to the `commissionSource` enum, plus `referralCreditId?`.

### 4.2 Core logic (`utils/referralCredits.js` with pure helpers unit-tested in `__tests__`)
- **`grantReferralReward(referral)`**
  - Called from `setPasswordFromInvite` when `user.role === 'doctor'` and an `invited` referral exists for that doctor.
  - Idempotent: it does nothing if `creditId` is already set.
  - It skips the grant and records the reason if the program is disabled, if the referrer is deleted, or if the referrer is the same person.
  - It emails the referrer, sends a WS event and writes an audit entry.
- **Consumption, inside `recordConsultationEarning`**
  1. Skip if the computed commission is already 0 (a doctor on a 0% override or a ₹0 consultation), so no credit is wasted.
  2. Atomically reserve **one** session from the oldest active, non-expired credit (FIFO by `expiresAt`, then `createdAt`). This is a `findOneAndUpdate` with `sessionsUsed < sessionsGranted` and `usages.consultationId ≠ id`. It is race-safe and idempotent per consultation.
  3. Upsert the earning with `bps=0, commissionSource:'referral'`.
  4. If the upsert finds an earning that **already existed** (reconciler re-run or race), release the reservation.
- **Eligibility:** only consultations **paid after** the credit was granted. This stops the reconciler from spending credits on old backfills.
- **Release** (`releaseReferralCredit(earning)`): hooked where `reverseConsultationEarnings` and the reconciler reversal run. If a reversed earning was `referral`, the usage is marked released and the session goes back (an exhausted credit becomes active again).
- **Expiry:** checked lazily on reserve. The existing 30-min payout runner also flips expired credits.

### 4.3 Endpoints
**Doctor portal** (`authorize('doctor')`, in `doctorRoutes.js`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/doctor/referrals` | My referrals plus a summary: free sessions remaining, used, total earned, program on/off, reward size |
| POST | `/api/doctor/referrals` | Refer a colleague `{name, email, phone?, note?}` |
| DELETE | `/api/doctor/referrals/:id` | Withdraw (only while `submitted`) |
| GET | `/api/doctor/referrals/credits` | My credits and which sessions used them |

**Admin** (new router `/api/admin/referrals`, permission-gated)
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/` | `referrals.read` | List, filtered by status, referrer and search, paginated |
| GET | `/summary` | `referrals.read` | KPIs: pending review, invited, onboarded, sessions granted, used, commission forgone (₹) |
| POST | `/` | `referrals.manage` | Admin-created referral (attach a referrer to a not-yet-onboarded doctor) |
| POST | `/:id/approve` | `referrals.manage` | Send the invite (reuses the invite logic) and set the status to `invited` |
| POST | `/:id/reject` | `referrals.manage` | Reject with a required reason; the referrer gets an email |
| PATCH | `/:id/referrer` | `referrals.manage` | Reassign the referrer (only before onboarding) |
| POST | `/:id/cancel` | `referrals.manage` | Cancel an invited referral |
| GET | `/credits` | `referrals.read` | All credits, optionally `?doctorId` |
| POST | `/credits` | `referrals.manage` | Manual bonus credit `{doctorId, sessions, reason}` |
| POST | `/credits/:id/revoke` | `referrals.manage` | Revoke the unused sessions `{reason}` |
| GET/PUT | `/settings` | read / manage | Program toggle, reward size, expiry, open-referral cap |

- **`POST /api/doctor/invite`** gains an optional `referrerDoctorId`.
- **`listDoctorsForAdmin`** returns `referredBy` and `freeSessionsRemaining`.

### 4.4 Permissions, audit, notifications
- **New permissions** `referrals.read` / `referrals.manage`:
  - granted to `clinical_admin` and `admin`;
  - mirrored in the frontend `auth/access.ts` (`PERMISSIONS`, `ROLE_META`, `PERMISSION_INFO`);
  - covered by a permissions test.
- **Audit actions:** `REFERRAL_SUBMITTED`, `REFERRAL_APPROVED`, `REFERRAL_REJECTED`, `REFERRAL_CANCELLED`, `REFERRAL_REASSIGNED`, `REFERRAL_REWARD_GRANTED`, `REFERRAL_CREDIT_GRANTED`, `REFERRAL_CREDIT_REVOKED`, `REFERRAL_SETTINGS_UPDATED`.
- **Emails** (new templates):
  - to the referrer: referral rejected, and reward granted ("You've earned 5 commission-free sessions");
  - the invite email to the referred gynac mentions who referred them.
- **WS:** a `referral_updated` event to the referrer refreshes the portal live.
- **Docs:** JSDoc on the routes, a Swagger regen, and updates to `API_DOCUMENTATION.md` and `CLAUDE.md`.

## 5. Admin portal (`The-Nura-Admin-Website`)

### 5.1 New admin page: **Clinical → Gynac Referrals** (`/gynac-referrals`, `referrals.read`)
- **KPI row:** pending review · invited · onboarded · free sessions granted / used / remaining · commission forgone ₹.
- **Tabs:**
  1. **Referrals:** a table showing referrer, referred person, status pill, dates and reward. Row actions are Approve & invite, Reject (with a reason modal), Reassign referrer, and Cancel. Filters cover status, referrer and search.
  2. **Credits:** per-gynac credits showing granted, used, remaining, status and expiry. Expanding a row shows the consultations that used it. Actions are Grant bonus sessions and Revoke.
  3. **Settings:** program on/off, sessions per referral, expiry days and the open-referral cap.
- Manage buttons are hidden without `referrals.manage`.

### 5.2 Changes to existing admin screens
- **DoctorsPage → Invite modal:** an optional "Referred by" gynac picker.
- **DoctorCard:** "Referred by Dr X", plus a "N free sessions" pill when credits are active.
- **Commission & Payouts → Ledger/Sessions:** earnings with `commissionSource:'referral'` show a **"Referral – 0%"** pill.

## 6. Gynac portal

- **New page "Refer & Earn"** (`/referrals`, sidebar → Practice):
  - a hero with the "N commission-free sessions left" counter and a how-it-works strip (refer → we verify → they join → you get 5 free sessions);
  - a **Refer a colleague** form with name, email, optional phone and note;
  - **My referrals**, a list with status pills and a Withdraw action while under review, plus the rejection reason if rejected;
  - **Free-session history**, which lists the consultations that used a credit and the commission saved.
  - If the program is disabled, the form is hidden and a notice is shown. Existing credits still work.
- **Earnings & Wallet:** a "Free sessions left" KPI, and the sessions table shows a "Referral – 0% commission" pill on those rows.
- **Dashboard:** a stat card for free sessions left that links to Refer & Earn.

## 7. Edge cases & rules

| # | Case | Behaviour |
|---|---|---|
| 1 | The gynac refers their own email | Rejected (400). |
| 2 | The email is already a doctor, staff member or user account | Rejected with "already on Nura". The admin can still attach a referral if that doctor hasn't onboarded yet. |
| 3 | The same email is referred twice, by the same or another gynac | Blocked by the unique live index. The first referral wins; the admin can reassign it. |
| 4 | Spam | Max 10 open (`submitted` / `invited`) referrals per gynac (configurable) plus the rate limiter. |
| 5 | The invite expires or is resent | The referral stays `invited`, and resending keeps the link. |
| 6 | The referred doctor is deleted or deactivated before onboarding | The referral becomes `cancelled` and no reward is given. |
| 7 | The referred doctor leaves **after** onboarding | No clawback by default. The admin can revoke the unused sessions manually. |
| 8 | The referrer is deactivated | The credit is still granted but can only be used once they're reactivated (they can't take sessions anyway). |
| 9 | The referrer is deleted | No grant; the referral is marked onboarded with "reward skipped". |
| 10 | The program is disabled | New referrals are blocked, but in-flight referrals still reward on onboarding and existing credits keep working (see Q3). |
| 11 | The reward size changes | It only affects future grants, because the size is snapshotted per credit. |
| 12 | A free session is cancelled or refunded **before completion** | The session is returned to the credit. |
| 13 | A refund **after completion** | The session is not returned, because the consultation was delivered and existing refund handling applies. |
| 14 | The doctor already has 0% commission, or the consultation is ₹0 | No credit is consumed. |
| 15 | Concurrent payments or a reconciler re-run | Atomic reserve plus an idempotent earning upsert means no double-spend and no double-free. |
| 16 | Consultations paid before the grant, or reconciler backfills | Not eligible. |
| 17 | Several credits | Used FIFO, soonest expiry first. |
| 18 | The admin revokes partway through | Only the unused sessions are revoked; sessions already free stay free. |
| 19 | Earnings already snapshotted | Never re-priced retroactively. |

## 8. Delivery order
1. Backend: models, settings and permissions, plus tests.
2. Backend: credit consume/release logic in the wallet, plus unit tests.
3. Backend: doctor and admin endpoints, the invite/set-password hooks, emails, audit and Swagger.
4. Admin portal: API module `src/api/referralApi.ts`, permissions mirror, Gynac Referrals page, invite picker, DoctorCard and ledger pills.
5. Gynac portal: Refer & Earn page, wallet/dashboard KPIs, sidebar link, and `styles/referrals.css` (`rf-*`, `--ui-*` tokens).
6. Verify: `npm test` in the backend, `npm run build` in the admin portal, and a manual run of the end-to-end flow locally.

The work goes on a new branch `feat/gynac-referrals` in both repos. Your current uncommitted changes on `fix/user-feedback-bugs` won't be touched, and I'll branch off after you've committed or stashed them.

## 9. Decisions needed from you
- **Q1 — What counts as "successful onboarding"?** **(A) The referred gynac sets their password and the account is active** (recommended, because the admin already vets them at approval) or **(B) the referred gynac completes their first paid consultation** (stronger anti-fraud, slower reward).
- **Q2 — Should free-session credits expire?** The default is **never** (configurable by the admin).
- **Q3 — If the program is switched off, should pending invited referrals still be rewarded?** The default is **yes**.
- **Q4 — Is it OK to use new `referrals.read/manage` permissions** (given to Clinical Admin and Super Admin) rather than reusing `doctors.manage`?
