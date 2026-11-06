# ZELEON profile dashboard

## Implemented

- `/profile` is protected by the existing auth guard and contains Profile, Security, and Shop Info sections.
- Signup captures an optional preferred name separately from the immutable first and last name fields. Signup metadata carries the value through confirmation; on a later authenticated session the Auth service imports it into the dedicated table.
- `user_preferred_names` has owner-only RLS select/insert/update policies. The frontend uses only the existing publishable Supabase client.
- Email changes request through `auth.updateUser({ email })` and use `verifyOtp({ email, token, type: 'email_change' })`. The email shown by the app remains the confirmed Supabase user email.
- Password changes reauthenticate using the current account email and current password before calling `updateUser({ password })`.
- The account deletion UI requires current-password reauthentication before calling a trusted Edge Function; users without the password can use the existing recovery-code flow and return to the deletion dialog after signing in. The service-role credential is read only from Edge Function environment variables. On successful deletion the client clears its local auth and in-memory cart state.
- Cart products use the existing in-memory Cart service. Purchased products report that history is unavailable; checkout and Orders are currently placeholders and there is no persistence source.

## Manual Supabase setup

1. Apply `supabase/migrations/202610290001_user_preferred_names.sql` to the connected project. It creates the table, enables RLS, and grants authenticated clients only select/insert/update access constrained by `auth.uid()` ownership.
2. Deploy `supabase/functions/delete-account/index.ts` as `delete-account`. Configure its normal Supabase Edge Function environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The function must have JWT verification enabled at the gateway and independently validates the bearer token with `auth.getUser()` before deleting only that returned user ID. Never place the service-role secret in the Angular environment.
3. Verify project email provider settings and templates before enabling email change in production. This repository's environment and auth docs do not reveal current email templates or whether the project confirms one or both addresses. The UI asks for the new-address OTP and mentions that both addresses may need confirmation. Supabase must issue a six-digit token compatible with the `email_change` verification type; if the project requires two distinct confirmations, a two-code UI and corresponding old-address confirmation need to be enabled based on the live provider flow. No live project behavior was tested here.
4. Account-owned tables beyond the new preferred-name table could not be audited because no schema dump/migration history is present. The Edge Function deletes only the authenticated `auth.users` row and lets declared foreign-key behavior apply; inspect deployed foreign keys and storage ownership before deployment. It does not remove shared product data or storage objects. Accounts with restrictive foreign keys may fail deletion until those relations receive deliberate cleanup/cascade rules; verify this in a staging project first.
5. Real purchase history requires a persisted checkout/order flow and an RLS-protected orders/order-items schema. No orders are fabricated by this dashboard.

## Verification

The requested `npx.cmd tsc --noEmit -p tsconfig.app.json` passed. Build and test commands were attempted but Angular's esbuild process could not resolve workspace files or node_modules and reported access denied to the parent directory. `git diff --check` passed with Git line-ending warnings. No live Supabase account, email delivery, OTP, or deletion request was performed.
