# ZELEON authentication

Implemented against the existing Supabase project `nunxmgltzvknnmkdvjsw` using the
existing publishable key and shared `SUPABASE_CLIENT`. No additional client,
dependencies, database tables, policies, admin keys, or custom token storage were
introduced. Product catalog queries and data are unchanged. Name is display-only
user metadata, never an authorization claim.

## Behavior

- `Auth` centralizes signup, sign-in, sign-out, current user/session, reset email,
  password update, and confirmation resend. Signals synchronize through a
  synchronous `onAuthStateChange` listener, unsubscribed on destruction.
- Guards wait for `Auth.ready`. A restored session is checked with `getUser()`;
  failed initialization denies Profile access. Profile also reacts to external
  logout while already open. Both parent and child Profile routes are protected.
- Browser-only SDK session persistence and automatic refresh use the SDK's
  supported storage. Server rendering does not read browser globals or restore
  browser credentials. This app is a browser SPA, not a cookie-based SSR auth
  implementation. RLS must enforce data access independently of route guards.
- Signup retains existing validation and does not treat a user object without a
  session as authenticated. Signup/recovery feedback avoids unnecessary account
  existence disclosure. Forms prevent repeated pending submissions and translate
  SDK errors without rendering raw server details.
- Confirmation resend is available on Login and after unconfirmed signup; a
  60-second UI cooldown complements server rate limits and is cleaned up when
  the component is destroyed. Rate-limit errors show a retry-later message.
- `/auth/callback` exchanges a PKCE code once through the existing SDK, including
  `sb_flow_id` when supplied by the installed SDK. URL credentials/provider errors
  are removed from history. Supabase's PASSWORD_RECOVERY event determines the
  recovery flow; an untrusted URL parameter cannot mark a session as recovery.
- Recovery redirects to `/reset-password`. A valid signed-in session can update
  its own password; missing sessions show a new-email link. Expired, missing,
  reused, or invalid callback codes never enter the update flow based on an old
  session. Password and confirmation are validated and cleared after success.
- PKCE emails must be opened in the same browser/profile used to request them,
  because the SDK stores the verifier there. Old implicit-flow links are rejected;
  request a fresh email after this deployment. Session restoration on a refreshed
  password-update page is supported by the same SDK session persistence.
- Header and mobile menu reactively switch account access to Profile and expose
  real Logout. Logout failures retain the current UI and show an error; success
  clears Auth state and navigates home. Existing layout, icons, and animations
  are retained. Profile's existing placeholder content is not redesigned here.

## Supabase configuration

Read-only live check on 2026-10-15 via `/auth/v1/settings` confirmed:

- Email provider enabled: **true**.
- Signup disabled: **false**.
- Email auto-confirm: **false** (confirmation required).

This was a public settings API check, not dashboard inspection. Available tools
do not expose Site URL, redirect allowlist, SMTP configuration, or email templates.
No dashboard settings were changed. Check these manually:

1. Open https://supabase.com/dashboard/project/nunxmgltzvknnmkdvjsw/auth/url-configuration
   (Authentication → URL Configuration).
2. Set **Site URL** to your actual production origin, e.g. `https://YOUR-DOMAIN`.
   If still local-only, temporarily use `http://localhost:57755`.
3. Add these exact **Redirect URLs** for the origins you actually use:
   - `http://localhost:57755/auth/callback`
   - `http://localhost:4200/auth/callback` if using Angular's default port.
   - `http://127.0.0.1:57755/auth/callback` only if accessing the app by that host.
   - `https://YOUR-DOMAIN/auth/callback` with your real production domain.
   Add each additional development port explicitly. Avoid broad production
   wildcards. The app derives the redirect from the current browser origin;
   no localhost URL is hardcoded into production requests.
4. Under Authentication → Providers → Email (or Sign In / Providers), keep
   Email enabled, signup enabled, and **Confirm email** enabled. Set the server
   password minimum to at least 8 to match the UI (UI allows 8–128 characters).
5. Confirmation/recovery templates should preserve Supabase's supported
   `{{ .ConfirmationURL }}` destination. Do not replace it with a direct Profile
   link or expose raw tokens in page text. No custom verification endpoint is
   needed for the standard templates used by this PKCE flow.
6. Check SMTP and Auth email rate limits. Configure production SMTP if needed;
   successful API responses alone do not prove delivery. These settings were not
   inspected or changed. Check inbox/spam in the real email smoke test.
7. Production hosting must rewrite `/auth/callback`, `/reset-password` and other
   Angular routes to `index.html`. Keep production HTTPS enabled.
8. Confirm catalog SELECT policies permit the intended reads for both `anon`
   and `authenticated` roles. Do not disable RLS or create broad user-data access
   policies. No profile database queries/policies were added by this change.

## Files created

- `src/app/guards/auth.guard.ts` and `.spec.ts`
- `src/app/pages/auth-callback/auth-callback.ts` and `.spec.ts`
- `src/app/pages/reset-password/reset-password.ts`, `.html`, and `.spec.ts`
- `src/app/components/confirmation-resend/confirmation-resend.ts` and `.spec.ts`
- `src/app/testing/auth-stub.ts` (automated tests only)
- `scripts/verify-auth-config.mjs` (read-only public Auth configuration check)
- `docs/authentication.md`

## Files modified

- `src/app/services/auth.ts`, `auth.spec.ts`, `supabase.ts`
- `src/app/pages/login/login.ts`, `.html`, `.spec.ts`
- `src/app/pages/signup/signup.ts`, `.html`, `.spec.ts`
- `src/app/pages/forgot-password/forgot-password.ts`, `.html`, `.spec.ts`
- `src/app/pages/auth-form.css` (disabled submit feedback only)
- `src/app/pages/profile/profile.ts`, `.spec.ts`
- `src/app/components/header/header.ts`, `.html`, `.css`, `.spec.ts`
- `src/app/components/burger-menu/burger-menu.ts`, `.html`, `.css`
- `src/app/app.routes.ts`
- `src/app/pages/home/home.spec.ts` (selector follows existing category anchors;
  no Home runtime code/styles changed in this task)
- `docs/supabase-catalog.md` (shared-client authentication note)

## Automated verification results

- Development build: passed; TypeScript and Angular templates compile.
- Focused Auth/navigation/catalog/Home regression run: **60 tests passed across
  15 files**. Includes registration validation, unconfirmed signup, login errors,
  SDK event synchronization, restoration, guards, callback errors, recovery,
  password update, resend throttling, Header state and logout cleanup.
- Public read-only Auth settings check: passed (values documented above).
- Public read-only catalog smoke test: passed for 6 active products, 6 public
  images, 12 ID/slug lookups and the invalid-product case.
- Production build: compiled but failed the existing Home component CSS budget:
  11.33 kB exceeds the 8 kB maximum. Also reports initial bundle and Contact CSS
  warnings and the existing AOS CommonJS warning. Unrelated styling and budgets
  were not changed to hide this failure.
- Final full suite: **79 passed, 2 failed** (31 passing files, 1 failing file).
  The two failures are legacy `app.spec.ts` scaffold tests lacking router
  providers and expecting the removed `Hello, zeleon` starter title. These are
  separate from the passing focused regression suite.

## Manual acceptance checks still required

Automated Auth tests mock Supabase; no real account was created and no email
was sent during implementation. Browser/email behavior was not visually tested.

1. Sign up with a test inbox you own. Check required fields, password mismatch,
   repeated-submit prevention, confirmation message, and logged-out Header.
2. Open the delivered confirmation in the same browser. Verify success feedback,
   Profile access, and reactive Header/mobile menu state. Reopen the consumed
   link and test an expired link: neither should claim new verification success.
3. Log out; open `/profile/security` while logged out. Expect Login with a return
   destination. Test incorrect password, then a valid password; expect Profile.
4. Refresh Profile. Expect session restoration; open another tab and sign out,
   then confirm protected content is no longer accessible in the first tab.
5. Request recovery. Check neutral success feedback for submitted emails, spam
   folder, same-browser callback, password mismatch/weak-password errors, and
   successful update. Sign out and log in with the new password.
6. Test expired/reused recovery links while logged in and logged out. Invalid
   callbacks must show an error rather than silently accepting a prior session.
7. Resend confirmation repeatedly: verify the cooldown and server rate-limit
   feedback. Test a network failure during Login, Logout and password update.
8. Verify all six catalog products still load both signed out and signed in;
   check desktop/mobile Header, Burger menu, cart, and existing page animations.

## References checked

- https://supabase.com/changelog.md
- https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/guides/auth/redirect-urls
- Installed `@supabase/auth-js` source for PKCE flow IDs and PASSWORD_RECOVERY.
