<!--
Title: <type>(<scope>): <summary>   type = feat | fix | refactor | perf | docs | chore | test | ci | revert
       imperative, lowercase, no trailing period, ≤ 72 chars. Release PRs (staging → main): "release: <yyyy-mm-dd> — <theme>"
Feature PRs target `staging`. Flow: https://github.com/utkarshpayal/period-buddy/blob/main/docs/WORKFLOW.md
Delete what doesn't apply.
-->

## Summary

<!-- What and why, in 1–3 sentences. -->

## Changes

-

## Impact

<!-- "None" where nothing applies. -->

- **Backend changes needed / merged first:**
- **New or changed env vars** (Vercel, every environment):
- **Permissions touched** (`src/auth/`, mirrors the backend's `config/permissions.js`):

## How to test

1.

## Checklist

- [ ] Targets `staging` (or is a `staging` → `main` release / hotfix)
- [ ] `npm run build` passes
- [ ] Tested on `staging.admin.thenura.care` or locally against the stage backend
- [ ] Checked as a lower-tier role if the page is permission-gated
- [ ] No secrets, `.env*` or credentials committed
