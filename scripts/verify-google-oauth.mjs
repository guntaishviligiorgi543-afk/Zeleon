// Run with PLAYWRIGHT_MODULE_PATH pointing at an installed playwright package.
// No Google credentials, consent, account creation, or real session exchange.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.OAUTH_TEST_BASE_URL || 'https://zeleon.store';
const supabase = 'https://nunxmgltzvknnmkdvjsw.supabase.co';
const output = process.env.OAUTH_SCREENSHOT_DIR || join(tmpdir(), 'zeleon-oauth-verification');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const route of ['/login', '/signup']) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      const button = page.getByRole('button', { name: 'Continue with Google', exact: true });
      await button.waitFor({ state: 'visible', timeout: 30_000 });
      assert(await button.isEnabled());
      const dimensions = await button.boundingBox();
      assert(dimensions && dimensions.width > 100 && dimensions.height >= 44);
      assert(dimensions.x >= 0 && dimensions.x + dimensions.width <= width + 1);
      assert.equal(await page.locator('.google-oauth-button svg').count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await button.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(output, `${route.slice(1)}-${width}.png`), fullPage: true });
      results.push({ route, width, buttonVisible: true, enabledWithoutForm: true, noOverflow: true });
    }
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('https://accounts.google.com/**', async route => {
    await route.fulfill({ contentType: 'text/html', body: '<p>OAuth initiation verified. Google login intentionally not performed.</p>' });
  });
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  const authorization = page.waitForRequest(request => request.url().startsWith(supabase + '/auth/v1/authorize'));
  const authorizationResponse = page.waitForResponse(response => response.url().startsWith(supabase + '/auth/v1/authorize'));
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  const request = new URL((await authorization).url());
  assert.equal(request.searchParams.get('provider'), 'google');
  assert(request.searchParams.get('code_challenge'));
  assert.equal(request.searchParams.get('code_challenge_method'), 's256');
  const redirect = new URL(request.searchParams.get('redirect_to'));
  assert.equal(redirect.origin, new URL(base).origin);
  assert.equal(redirect.pathname, '/auth/callback');
  const providerUrl = new URL(await (await authorizationResponse).headerValue('location'));
  const google = { host: providerUrl.host, callback: providerUrl.searchParams.get('redirect_uri'), hasClientId: !!providerUrl.searchParams.get('client_id') };
  await page.waitForURL('https://accounts.google.com/**');
  await page.waitForLoadState('domcontentloaded');
  const providerText = await page.locator('body').innerText();
  const providerError = providerText.match(/redirect_uri_mismatch|invalid_client|invalid_request/);
  assert(!providerError, `Google rejected OAuth configuration: ${providerError?.[0]}`);
  assert.equal(google.callback, supabase + '/auth/v1/callback', JSON.stringify(google));
  results.push({ oauthStarts: true, pkce: true, applicationCallback: redirect.origin + redirect.pathname, google, providerLandingTitle: await page.title() });
  await context.close();

  // A cancelled provider callback lets us verify the effective redirect allowlist
  // without signing in, creating a user, or obtaining tokens.
  for (const callback of ['https://zeleon.store/auth/callback', 'http://localhost:4200/auth/callback', 'http://localhost:52720/auth/callback']) {
    const context = await browser.newContext();
    const start = new URL(supabase + '/auth/v1/authorize');
    start.searchParams.set('provider', 'google');
    start.searchParams.set('redirect_to', callback);
    const response = await context.request.get(start.toString(), { maxRedirects: 0 });
    assert.equal(response.status(), 302);
    const provider = new URL(response.headers()['location']);
    const cancel = new URL(supabase + '/auth/v1/callback');
    cancel.searchParams.set('error', 'access_denied');
    cancel.searchParams.set('state', provider.searchParams.get('state'));
    const cancelled = await context.request.get(cancel.toString(), { maxRedirects: 0 });
    assert([302, 303].includes(cancelled.status()));
    const target = new URL(cancelled.headers()['location']);
    assert.equal(target.origin + target.pathname, callback);
    results.push({ allowedCallback: callback, cancellationRedirectVerified: true });
    await context.close();
  }
  if (process.env.OAUTH_TEST_CALLBACKS === '1') {
    const customerId = '00000000-0000-4000-8000-000000000001';
    for (const role of [null, 'support', 'admin', 'manager']) {
      const context = await browser.newContext();
      const user = { id: customerId, aud: 'authenticated', role: 'authenticated', email: 'oauth-test@example.invalid', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { given_name: 'Google', family_name: 'Test' }, factors: [{ id: '00000000-0000-4000-8000-000000000002', factor_type: 'totp', status: 'verified' }] };
      const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, aal: 'aal1', session_id: '00000000-0000-4000-8000-000000000003', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test-signature'].join('.');
      let exchanges = 0;
      let restrictedWrites = 0;
      await context.route(supabase + '/**', async route => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        let body;
        if (url.pathname === '/auth/v1/token') {
          exchanges++;
          await new Promise(resolve => setTimeout(resolve, 250));
          body = { access_token: jwt, refresh_token: 'test-refresh-token', expires_in: 3600, token_type: 'bearer', user };
        } else if (url.pathname === '/auth/v1/user') body = user;
        else if (url.pathname === '/rest/v1/staff_roles') body = role ? [{ user_id: user.id, role, status: 'active' }] : [];
        else if (method === 'GET') body = [];
        else {
          restrictedWrites++;
          return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Protected operations are blocked in this test' }) });
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      });
      await context.addInitScript(() => {
        localStorage.setItem('sb-nunxmgltzvknnmkdvjsw-auth-token-code-verifier', JSON.stringify('test-code-verifier'));
        globalThis.callbackConfirmationFlashed = false;
        new MutationObserver(() => {
          if (location.pathname === '/auth/callback' && document.querySelector('app-auth-callback .form-panel')) globalThis.callbackConfirmationFlashed = true;
        }).observe(document, { childList: true, subtree: true });
      });
      const page = await context.newPage();
      await page.goto(base + '/auth/callback?code=mock-oauth-code', { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/profile(?:\/info)?$/, { timeout: 30_000 });
      assert.equal(exchanges, 1);
      assert.equal(await page.evaluate(() => globalThis.callbackConfirmationFlashed), false, 'Confirmation form flashed during callback processing');
      assert.equal(new URL(page.url()).search, '');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/profile(?:\/info)?$/);
      assert.equal(exchanges, 1);
      if (role) {
        await page.goto(base + '/' + role, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(url => url.pathname === '/staff-auth', { timeout: 30_000 });
        assert.equal(new URL(page.url()).searchParams.get('returnUrl'), '/' + role);
        assert.equal(restrictedWrites, 0);
      }
      results.push({ mockedGoogleCallback: true, role: role ?? 'customer', exchanges, refreshDoesNotReplay: true, noConfirmationFlash: true, staffMfaStillRequired: !!role });
      await context.close();
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base + '/auth/callback?error=access_denied&error_description=private-detail#access_token=test-secret', { waitUntil: 'domcontentloaded' });
    await page.getByText('Google sign-in was cancelled.', { exact: false }).waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).search, '');
    assert.equal(new URL(page.url()).hash, '');
    assert(!(await page.locator('.form-status').innerText()).includes('private-detail'));
    for (const role of ['support', 'admin', 'manager']) {
      await page.goto(base + '/' + role, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(url => url.pathname === '/login', { timeout: 30_000 });
    }
    results.push({ cancellationFeedbackSafe: true, unauthenticatedStaffRoutesRejected: true });
    await context.close();
  }
  console.log(JSON.stringify({ results, screenshots: output, realGoogleLoginPerformed: false }, null, 2));
} finally { await browser.close(); }
