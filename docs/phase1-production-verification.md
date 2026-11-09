# ZELEON Phase 1 production verification

Verified 8 November 2026, Asia/Tbilisi. Project: `nunxmgltzvknnmkdvjsw`.

Production integration is **not complete**. All production access in this task was read-only. No migrations or Edge Functions were deployed; no Manager was assigned. No commit or push occurred. Customer components, styles and authentication implementation were unchanged. Phase 2 was not implemented.

## 1. Production differences

Inspected columns, table ACLs, RLS, policies, functions and function ACLs, non-internal triggers, indexes, constraints/foreign keys, and migration history for `staff_roles`, `staff_audit_logs`, `private.staff_access_grants`, `products`, `categories`, and `product_images`.

The three staff table shapes match the local draft. Production additionally has `CHECK (expires_at > authenticated_at)` on grants and a full `(user_id, expires_at DESC)` index rather than the draft's partial ascending index. Existing keys and indexes are preserved.

Production `private.has_staff_access(text[])` requires an active role and an unexpired, unrevoked grant matching the JWT session ID. It does not explicitly require `aal2`, a currently verified TOTP factor, or a live `auth.sessions` row. The local draft instead discarded grant checks entirely. Applying it would weaken 17 policies across catalog, product types/flavors, orders/items, support, storage and staff audit access.

Production has no `staff_manage` function, no staff-role revocation trigger, no staff assignments and no grants. The only inspected non-internal trigger on the six requested tables is `products_set_updated_at`; it is preserved.

Production migration history:

- `20261015181747 create_zeleon_product_catalog`
- `20261107064523 zeleon_staff_support_orders_foundation`
- `20261107064537 zeleon_database_hardening_and_indexes`
- `20261107064553 zeleon_support_write_permissions_hardening`
- `20261107064618 zeleon_default_grants_lockdown`
- `20261107064621 zeleon_column_level_write_lockdown`

The local Phase 1 draft is not an applied production migration.

## 2. Migration prepared, intentionally not applied

Exact SQL: [`20261108062403_staff_phase1_production_reconciliation.sql`](../supabase/migrations/20261108062403_staff_phase1_production_reconciliation.sql), generated with the Supabase CLI.

Operations:

1. Replace the existing private access predicate, preserving grant checks and adding `aal2`, verified TOTP and live-session checks.
2. Create authenticated-only `staff_open_session()` and `staff_session(boolean,boolean)`. Issuance checks recent signed password/TOTP AMR and fresh session creation; renewal requires an unexpired grant. Revocation affects only the caller's session.
3. Create the private grant-revocation trigger function and a role/status-update-or-delete trigger on `staff_roles`.
4. Create `staff_manage(text,uuid,text,text)` using `auth.uid()` as actor. Serialize mutations; check existing and requested target roles; allow Manager to manage Admin/Support and Admin to manage Support only; forbid ordinary Manager assignment/modification and self-modification. Role/status writes and audits are atomic. Only assign and set-status operations are exposed.
5. Create service-only atomic bootstrap and durable bootstrap-attempt throttling functions, using existing audit records and advisory locks. No new tables or indexes.
6. Revoke public/anonymous function execution; grant only the required authenticated/service permissions.

No customer tables, existing policies, indexes, foreign keys, data, or Auth settings are changed. There are no `DROP`, `TRUNCATE`, or data deletion statements. The new trigger reacts to deletion but does not delete anything itself. New function/trigger creation deliberately fails if a conflicting object already exists, rather than silently overwriting uninspected drift.

**Approval is required before application** under the request's instruction not to apply potentially breaking changes automatically: strengthening the shared predicate changes authorization for 17 existing policies. Re-inspect production immediately before application. Do not bulk-push local migrations; the historical local draft is guarded against execution and production history differs. Use the approved SQL as one migration transaction, then rerun production catalog/access checks and advisors.

## 3. Production RLS verified

All six requested tables have RLS enabled. Staff table privileges deny ordinary-user writes; private grants are inaccessible to ordinary clients.

| Table | Existing policies verified |
| --- | --- |
| staff_roles | Authenticated user reads only own assignment; no ordinary write policy/privilege |
| staff_audit_logs | Manager grant predicate for SELECT; no ordinary insert/update/delete privileges |
| private.staff_access_grants | Service-role-only policy and ACL |
| products | Public reads active products; staff writes require Manager/Admin access |
| categories | Public reads; staff writes require Manager/Admin access |
| product_images | Public reads only for active parent products; staff writes require Manager/Admin access |

The draft would have revoked authenticated audit SELECT and weakened the shared predicate. The reconciliation leaves existing table ACLs and policies intact.

## 4. Edge Function status

Production lists only `delete-account` (v10) and `send-welcome-email` (v1), both ACTIVE with JWT verification enabled. Neither `staff-management` nor `bootstrap-manager` exists in production. Deployment was intentionally held until SQL approval/application and live verification.

Prepared `staff-management` pins Supabase JS 2.118.0, verifies JWT claims using supported `getClaims`, requires `aal2`, validates inputs, handles CORS preflight including `apikey`/`x-client-info`, suppresses internal errors, and executes SQL in caller JWT context. It needs no service-role key. The database enforces the complete authorization regardless of whether the request comes through the Edge Function or directly to RPC.

Prepared `bootstrap-manager` validates the authenticated target with `getUser`, compares a server secret using hashed fixed-length comparisons, pins the operator-selected account using a server environment variable, throttles authenticated attempts durably, and invokes service-only atomic bootstrap. Service-role credentials remain server-side. The endpoint fails closed if configuration is absent.

Deploy with gateway JWT verification enabled, then test the project's actual signing-key/gateway configuration. Function type checking does not prove gateway compatibility or successful deployment. No production secrets were read or printed. Their presence was not verified.

## 5. Secondary authentication

Local flow now checks active staff before password authentication, signs in with the current password, verifies an enrolled TOTP factor, issues a grant using signed recent password/TOTP AMR, then checks `aal2` and server grant before navigation. Form password/OTP values reset after completion.

Grant issuance requires a session created within five minutes, password AMR within five minutes, and TOTP AMR within one minute. One issuance per session prevents reopening revoked/expired grants without a fresh password login and TOTP verification. Server grants expire after fifteen minutes and can only renew while live. Workspace input can renew at most once per thirty seconds; browser inactivity clears staff access and requests revocation without changing customer login settings. All protected SQL rechecks role, status, session, MFA and expiry. Role/status changes invalidate grants even after reactivation.

**Not verified live:** real Supabase password/TOTP exchange and AMR payload, staff browser navigation, gateway JWT behavior, grant expiry under a real user session, or customer login against production. No credentials or explicitly approved test accounts were supplied. In-memory tests simulate verified JWT context and Postgres tables; they do not validate actual Auth service behavior.

## 6. Manager bootstrap readiness

No account selected. No role assigned. The user must provide the intended existing account's UUID or email for lookup. Do not send passwords, OTP seeds, tokens or the bootstrap secret in chat.

Required server configuration after deployment:

- `STAFF_BOOTSTRAP_USER_ID`: explicitly approved existing account UUID.
- `STAFF_BOOTSTRAP_SECRET`: securely generated high-entropy secret of at least 32 characters; keep outside source/frontend and remove after success.
- Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; runtime availability must be verified. Only bootstrap needs the service-role key.

Call bootstrap using the selected account's valid authenticated Bearer token and the secret header from a trusted environment. Five authenticated attempts/account and thirty globally per fifteen minutes are permitted. Unauthenticated requests are rejected without a bootstrap attempt. Manager creation and its audit record commit atomically under a shared management/bootstrap advisory lock. Existing Manager or prior successful bootstrap prevents reuse.

## 7. Findings and fixes

| Finding | Local fix/status |
| --- | --- |
| Draft overwrites production grant-based predicate | Guarded old unapplied draft; prepared reconciliation preserves and strengthens grants |
| Frontend inactivity only; grants unused | Added server issuance/check/renew/revoke and grant requirement in staff service |
| Admin can demote existing Admin by requesting Support | Database checks existing target role as well as requested role |
| No revocation after role/status changes | Added revocation trigger in prepared SQL |
| Bootstrap count-then-insert race and unchecked audit failure | Atomic locked bootstrap SQL including audit |
| Bootstrap secret alone could nominate arbitrary account | Require authenticated account matching operator-pinned UUID |
| No durable bootstrap attempt throttling | Service-only attempt RPC using existing audit log |
| Unverified JWT payload decoding and unpinned Edge dependency | Supported signature-verifying `getClaims`; pinned 2.118.0 |
| Missing CORS headers and raw DB error exposure | Fixed CORS and generic response errors |
| Password/OTP form values retained | Reset form values in finally block |

Live advisor: leaked-password protection is disabled. Left unchanged to preserve customer auth behavior. [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Health advisor returned no findings. Performance advisor reports 27 unused indexes and 12 multiple-permissive-policy cases; preserved rather than altering existing functionality. [Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), [permissive policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).

## 8. Tests and scope

- 26 isolated PostgreSQL tests passed using temporary PGlite 0.5.15, including customer/support denial, Admin hierarchy and escalation rejection, Manager assignments, suspension/reactivation invalidation, suspended/on-leave denial, aal1 denial, removed TOTP denial, expired-grant renewal denial, session binding/deletion, fresh issuance, old-session rejection, direct table write denial, atomic one-time bootstrap and throttling. Script: `scripts/verify-staff-phase1.mjs`. Fixtures contain no real customer data; no production test writes occurred.
- Angular staff service and guard tests: **10/10 passed**.
- Deno request-validation security tests: **2/2 passed**.
- Both Edge Functions: `deno check` passed, including final throttling changes.
- Full Angular suite before the four new service tests were added: **116 passed, 2 failed (118 total)**. The failures reproduce in an isolated run of the two customer files: **20 passed, 2 failed**. Failures: `auth.spec.ts:177` preferred-name import times out after 5000 ms; `signup.spec.ts:126` expects body overflow to reset but receives `hidden`. Customer files were unchanged.
- No PDF export implementation or report endpoint was found in indexed code. No PDF functionality was added, so Manager-only PDF export cannot be claimed as an implemented or live-tested capability. Existing order/report-source reads are Manager-only through the shared policy. Any future export endpoint must explicitly require Manager access server-side.

## 9. Angular production build

`npm run build` passed outside the filesystem sandbox. Initial bundle 790.57 kB; warnings: initial budget exceeded by 290.57 kB, home component CSS budget exceeded by 197 bytes, and AOS CommonJS dependency. No customer UI/style edits were made. Initial sandbox failures were access-denied errors; the staff PromiseLike typing issue found during that run was corrected before the successful build.

## 10. Remaining steps

1. Review and approve the exact reconciliation SQL and the effect on existing staff policies.
2. Reinspect drift; apply only the approved migration transaction; verify definitions, permissions and advisors.
3. Deploy and smoke-test both staff Edge Functions with JWT gateway verification enabled. Do not deploy the updated frontend before its required RPCs exist.
4. Identify the Manager account; configure bootstrap secrets privately; perform one-time bootstrap as that authenticated user; verify its audit record; remove the bootstrap secret.
5. With approved accounts and their own authenticator apps, run the live customer/Support/Admin/Manager matrix, direct URL checks, current-password/TOTP failure/success, signed AMR inspection, logout/session deletion, expiry/renewal, and suspend/reactivate tests. Do not use real customer accounts as arbitrary fixtures.
6. Resolve or separately authorize investigation of the two unchanged customer test failures before declaring all authentication tests green.

Documentation consulted: [JWT validation](https://supabase.com/docs/guides/auth/jwts), [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa). The changelog markdown URL fetch returned an unsupported-content-type error; no claim is made that its entries were reviewed.
