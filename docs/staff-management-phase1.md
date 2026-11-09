# Staff Management Phase 1

Phase 1 adds protected staff route infrastructure without changing customer-facing pages.

## Authorization

`staff_roles` stores one role per user (`manager`, `admin`, or `support`) and one status (`active`, `suspended`, or `on_leave`). Direct client writes are denied by table privileges and RLS. The prepared `staff-management` Edge Function validates the JWT with `getClaims` and calls `staff_manage` in the caller's JWT context. The database independently enforces the current hierarchy, existing target role, status, live Supabase session, verified TOTP factor, `aal2`, and an unexpired private access grant. The function and reconciliation migration have NOT been deployed/applied; see `phase1-production-verification.md`.

The initial manager is not assigned automatically. The operator must first identify the account, configure `STAFF_BOOTSTRAP_USER_ID`, and securely generate `STAFF_BOOTSTRAP_SECRET` (at least 32 characters, preferably 32 random bytes encoded as hex). The bootstrap request requires that account's valid Bearer token and the secret in `x-staff-bootstrap-secret`; there is no frontend bootstrap UI. The server records at most five attempts per account and thirty globally in fifteen minutes. Assignment and audit are one transaction protected by an advisory lock; a prior bootstrap audit also prevents reuse. Remove the secret after success. No account has been selected or promoted.

## Secondary authentication

The staff entry route requires the ordinary ZELEON session and an active role before checking the current password and a verified Supabase TOTP factor. Password sign-in creates a fresh Supabase session; TOTP raises it to `aal2`. `staff_open_session` checks signed password/TOTP AMR timestamps and session creation time before issuing one grant bound to that session. Passwords and OTPs remain in memory and form values are reset after submission.

The server grant expires after fifteen minutes. Real workspace input can renew a still-valid grant, throttled to once every thirty seconds; expired/revoked grants cannot renew. Role/status changes revoke all grants, including across suspension/reactivation. The browser idle handler clears staff access and requests revocation without signing the customer out. General customer session settings are unchanged. Browser timers are supplementary; protected SQL always checks the grant and current session.

## Database drift

The production project already contained the staff tables and private access table. The old `202611070001_staff_management_phase1.sql` draft is unsafe for production: it replaces the grant predicate with an MFA-only predicate and has a target-role escalation flaw. It now raises an exception to prevent accidental use. The CLI-generated `20261108062403_staff_phase1_production_reconciliation.sql` is the reviewable replacement. Do not run a blanket `db push`: production history and local history differ. Apply only the approved reconciliation through the migration API after re-inspecting drift. No production migration was applied during this verification.
