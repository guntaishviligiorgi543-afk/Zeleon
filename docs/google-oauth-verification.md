# Google OAuth verification — 2026-11-12

## Investigation and root cause

The initial local checkout was `6bd931f`, seven commits behind remote `master` at the requested OAuth commit `f9b72018048d7065e19e3cda6eceac6cec3af528`. The older checkout had no Google buttons. It was fast-forwarded without overwriting local changes.

The reported production absence was **not reproducible on the latest deployed version**: [Pages run 43212740849](https://github.com/guntaishviligiorgi543-afk/Zeleon/actions/runs/43212740849) had succeeded. Its six preceding OAuth runs were cancelled by the workflow's concurrency policy, not failed builds. Both templates contained unconditional Google buttons, their CSS did not hide them, and a fresh headless Chrome session confirmed both buttons visible and enabled at 390, 768 and 1440 pixels. The exact state of the user's earlier browser/cache cannot be established from this evidence.

A confirmed architecture defect was found independently: session initialization awaited preferred-name import, which called public methods that awaited the same `ready` promise. Restoring an existing account with `preferred_name` could therefore deadlock auth initialization and route guards. The existing regression test reproduced the timeout. This is fixed without overwriting existing profile preferences.

## Implementation

- `src/app/services/auth.ts`: remove the initialization deadlock; preserve existing preferred-name records with conflict-safe import; start Google through the existing PKCE client and current origin; preserve an allowlisted Profile destination in short-lived, one-use session storage; deduplicate callback exchanges; verify that the returned session and server-verified user match; display Google name metadata without changing existing profile data.
- `src/app/pages/auth-callback/auth-callback.ts`: safe cancellation feedback, validated intended destination, generic account-confirmation heading, recovery routing retained, URL query/fragment credentials removed before feedback/navigation. Existing email-confirmation flow identifiers remain supported.
- `src/app/pages/login/login.ts` and `src/app/pages/signup/signup.ts`: pass intended Profile destinations, retain duplicate-submit protection, and re-enable buttons when browser Back restores a page from the back-forward cache. Signup also restores document scrolling when its existing result/OTP dialogs close or the page is destroyed.
- `src/app/pages/login/login.html`, `src/app/pages/signup/signup.html`, `src/app/pages/auth-form.css`: retain the existing Google button/icon/layout, expose busy state, and respect reduced-motion preferences. Google remains independent of email/password form validation.
- Tests: `src/app/services/auth.spec.ts`, `src/app/pages/auth-callback/auth-callback.spec.ts`, `src/app/pages/signup/signup.spec.ts`, `src/app/pages/google-sign-in.spec.ts`, `src/app/testing/auth-stub.ts`. The recovery test in `src/app/pages/forgot-password/forgot-password.spec.ts` now checks the existing `Router.navigate` call rather than an obsolete string-only `navigateByUrl` expectation; recovery implementation was unchanged.
- `scripts/verify-google-oauth.mjs`: reusable headless Chrome verification for production UI, PKCE startup and callback allowlist. `OAUTH_TEST_CALLBACKS=1` additionally exercises isolated mocked session exchange, refresh, all three Staff MFA boundaries, cancellation and unauthenticated route rejection. All mocked Supabase requests are intercepted; no actual account or privileged operation is created by these tests.

## Supabase and Google configuration

Read-only verification through the public Auth settings and `supabase config pull` confirmed:

- Google provider enabled; Email enabled; signup enabled with email confirmation still required.
- Site URL: `https://zeleon.store`.
- All requested callbacks allowlisted: `https://zeleon.store/auth/callback`, `http://localhost:4200/auth/callback`, `http://localhost:52720/auth/callback`. Existing www and localhost entries remain unchanged.
- TOTP enrollment and verification enabled.
- Clicking Google produces a PKCE S256 authorization request, redirects to Google Accounts, and uses `https://nunxmgltzvknnmkdvjsw.supabase.co/auth/v1/callback` as Google's callback. The provider landing page was titled `Sign in - Google Accounts`, with no observed redirect/client configuration error.
- Cancelling the provider callback redirects to each requested application callback, verified without entering Google credentials or creating users.

No remote authentication configuration, RLS policy, Staff assignment, permission, grant rule or account-restriction policy was changed. The downloaded remote config is kept only in the isolated verification worktree, not committed to the application.

## Staff and account security

Read-only database checks confirmed the live Staff helper still requires AAL2 and a live unexpired server grant; grant opening still requires fresh password and TOTP authentication; the 15-minute inactivity extension remains; all nine account-restriction triggers remain; both account-management tables retain RLS. Mocked Chrome sessions for Support, Admin and Manager at AAL1 all reached `/staff-auth`, never a protected workspace. Anonymous sessions were rejected from all Staff routes.

OAuth does not assign roles or merge accounts by email. Supabase continues to own its supported identity-linking behavior. Google-only Staff members still need to satisfy the existing password plus TOTP Staff verification policy; this policy was deliberately preserved.

## Validation results

- `npm ci`: passed in the isolated `zeleon-oauth-verification` worktree.
- `npx ng build --configuration production --base-href /`: passed. Existing initial-bundle, Home CSS and AOS CommonJS warnings remain.
- Focused authentication, recovery, profile initialization and Staff-guard suite: **73 passed, 0 failed**, across 11 files.
- Full Angular suite: **207 passed, 31 failed**, across 46 files. Remaining failures are in unchanged support-rating, manager-navigation, dashboard/support and Users/sidebar tests, including timeout-sensitive checks. The OAuth-focused suite is green.
- Production browser UI: Login and Signup buttons visible/enabled with empty forms at **390, 768, 1440 px**, with Google icons and no horizontal overflow; screenshots visually inspected.
- Built-app browser integration: mocked Customer/Support/Admin/Manager callbacks each exchanged once, reached Profile, survived refresh without code replay, and retained Staff MFA requirements. Cancellation feedback cleared secrets from history and anonymous Staff routes were rejected.
- No real Google login, Google consent, customer registration, account linking, email send or customer restriction was performed.

The test script uses an externally installed Playwright package via `PLAYWRIGHT_MODULE_PATH` and the installed Chrome channel; no production dependency was added. `OAUTH_TEST_BASE_URL` selects the built local app or production; screenshots are written to a temporary directory or `OAUTH_SCREENSHOT_DIR`.

## Deployment and remaining manual check

The final task response records the commit SHA, exact Pages run and post-deployment production verification. Google buttons must be rechecked against the deployed assets, not inferred from a successful push.

A user must still complete a real Google account selection/consent and return session to prove the Google client secret/token exchange, account linking for that particular account, and any Google consent-screen publishing/test-user restrictions end to end. No missing Supabase callback configuration was found. Real Google login is not claimed as tested.
