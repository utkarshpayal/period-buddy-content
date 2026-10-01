# Doctor commission, wallet & payouts

Nura keeps a commission on every paid consultation. The rest is the
gynecologist's: it collects in their **wallet** and they withdraw it to a bank
account or UPI ID. Clinical Admins (and Super Admins) set the rules and pay
withdrawals out.

| Who | Where |
|---|---|
| Gynecologist | Clinician portal → **Earnings & Wallet** (`/payments`) |
| Clinical Admin, Super Admin | Admin Workspace → Clinical → **Commission & Payouts** (`/commission-payouts`) |
| Code (UI) | `src/pages/gynac/GynacPayments.tsx`, `GynacWallet.tsx`, `src/pages/clinicalFinance/*`, `src/api/financeApi.ts`, `src/components/financeUi.tsx`, `src/styles/finance.css` |
| Code (API) | period-buddy-be: `utils/doctorWallet.js`, `utils/payoutMath.js`, `utils/cashfreePayoutClient.js`, `controllers/{doctorWallet,clinicalFinance,payoutWebhook}Controller.js` |

Only `payouts.read` / `payouts.manage` open the admin page, and only Clinical
Admin and Super Admin hold them (a backend test pins this). The sidebar hides
it for everyone else, and the API refuses them with 403 regardless.

## Money in: earnings

- Every **paid consultation** gets one earning row: gross (what the patient
  paid), the commission rate **at that moment**, commission, and the doctor's
  **net**. Changing a rate later never rewrites past rows.
- Rate = the doctor's own rate if a Clinical Admin set one, else the default.
- Amounts are stored as whole paise and rates as basis points, so 12.5% of
  ₹333 is exact and commission + net always equals gross.
- An earning is **on hold** until it can be withdrawn:
  - the session is completed, plus the **hold period** (refund window, default 3 days); or
  - nobody completed it, but **auto-release** days have passed since payment (default 7; 0 = off).
- A session **cancelled** before completion (by patient, doctor, deactivation
  or account deletion) reverses its earning.
- **All history counts:** sessions paid before this feature existed were
  brought in automatically, at each doctor's current rate.
- Admins can **reverse** any earning (e.g. a refund) or post an **adjustment**
  (credit or debit with a note the doctor sees). A debit may take the wallet
  below zero; new earnings then cover it before anything can be withdrawn.

## Money out: withdrawals

1. The doctor adds a **payout method**: UPI ID or bank account (name,
   account number twice, IFSC). They confirm with their password, get a
   security email, and the method can't be paid to for **24 hours** (adjustable),
   so someone who got into the account can't drain it unnoticed. Up to 3
   methods; the full account number is encrypted at rest.
2. They request a withdrawal (min ₹100, max ₹1,00,000 per request by
   default; one open request at a time). It's checked against the balance
   inside a database transaction, so double clicks or two tabs can't overdraw.
3. A Clinical Admin pays it, depending on **Settings → Payment method**:

| | Manual bank transfer (default) | Cashfree Payouts |
|---|---|---|
| Needs | Nothing | `CASHFREE_PAYOUT_*` keys on the API, Payouts activated and funded in Cashfree |
| Admin does | Opens **Pay & mark paid**, sees the full bank/UPI details, transfers the money, enters the UTR | Clicks **Approve** (or turns approval off) |
| Money moves | From your bank/UPI app | Automatically, via Cashfree |
| Status | Paid as soon as it's marked | Processing → Paid, from Cashfree's webhook (backup: a check every few minutes) |

The doctor is emailed when a withdrawal is paid, declined, fails or is
returned by the bank. A failed, declined, cancelled or returned withdrawal
puts the money straight back in the wallet.

**Manual mode cautions:** nobody checks the account details (send ₹1 first
for a new doctor); the UTR is recorded as typed; "Mark as paid" can't be
undone (fix a mistake with a credit adjustment).

**Switching to Cashfree:** add the keys, restart the API, then choose
"Cashfree Payouts" in Settings. Nothing switches by itself. Methods added
earlier are registered with Cashfree on their first payout; requests made
under manual mode stay manual.

## Why it's built this way

- **Balances aren't stored.** They're summed from earnings and withdrawals on
  every read, so they can't drift out of step.
- **Every status change is compare-and-set** along a fixed set of moves, so
  the webhook, the background check and two admins clicking at once can't
  move a withdrawal twice.
- **Cashfree retries are safe.** Each withdrawal has one fixed transfer id.
  After a timeout we ask Cashfree whether it exists before sending again.
  The webhook only tells us *which* withdrawal changed; its status is then
  fetched from Cashfree, so a forged or replayed webhook can't change anything.
- **Hooks can't break bookings.** The consultation flows record earnings
  best-effort, and a background reconcile (every 30 min) repairs anything
  they missed.

## Settings reference

| Setting | Default | Meaning |
|---|---|---|
| Payment method | Manual | Manual bank transfer or Cashfree Payouts |
| Accept withdrawal requests | On | Pause new requests (in-flight ones continue) |
| Approve each withdrawal | On | Cashfree only; manual always needs an admin |
| Default commission | 20% | Doctors without a custom rate |
| Hold after completion | 3 days | Refund window |
| Auto-release unfinished sessions | 7 days | 0 = only after completion |
| New payout method wait | 24 h | Security cooldown |
| Minimum / maximum withdrawal | ₹100 / ₹1,00,000 | Per request |

API reference: period-buddy-be `docs/API_DOCUMENTATION.md` → "Doctor Wallet & Payouts".
Keys and Cashfree setup: period-buddy-be `.env.example` and `docs/INFRASTRUCTURE.md`.
