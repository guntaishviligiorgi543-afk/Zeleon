import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Run against a local server; submissions are intercepted so this check sends no messages.
const baseURL = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4200';
const output = 'tmp/responsive/verified';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const results = [];
async function equalEventually(read, expected) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await read() === expected) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await read(), expected);
}
try {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    const context = await browser.newContext({ reducedMotion, hasTouch: true });
    const page = await context.newPage();
    for (const width of [320, 375, 430, 768, 1024, 1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/', '/shop', '/our-story', '/contact']) {
        await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' });
        await page.locator('app-footer').waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (route === '/shop') await page.locator('.productsContainer[aria-busy="false"]').waitFor();
        await page.waitForTimeout(1200);
        const sections = page.locator('main section, .footer');
        for (const section of await sections.all()) {
          await section.scrollIntoViewIfNeeded();
          await page.waitForTimeout(reducedMotion === 'reduce' ? 80 : 350);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow: ${route}, ${width}, ${reducedMotion}`);
        }
        assert.equal(await page.locator('.footer').evaluate(el => el.scrollHeight > el.clientHeight + 1), false, `Footer traps content: ${width}`);
        if (route === '/') {
          assert.ok(await page.evaluate(() => document.querySelector('.heroBox').getBoundingClientRect().bottom <= document.querySelector('.hero').getBoundingClientRect().bottom + 1), `Hero panel escapes: ${width}`);
          const form = page.locator('.subscriptionForm form');
          await form.scrollIntoViewIfNeeded();
          assert.equal(await form.evaluate(el => el.checkValidity()), false);
          await form.locator('input[type=email]').fill('responsive@example.test');
          await form.locator('input[type=checkbox]').check();
          assert.equal(await form.evaluate(el => el.checkValidity()), true);
          await form.evaluate(el => el.addEventListener('submit', event => { event.preventDefault(); el.dataset.submitted = 'true'; }, { once:true }));
          await form.locator('button[type=submit]').click();
          await equalEventually(() => form.getAttribute('data-submitted'), 'true');
        }
        if (route === '/shop') {
          const cards = page.locator('.productCard');
          assert.ok(await cards.count() > 0, 'Public catalog must load for product checks');
          for (const card of await cards.all()) {
            await card.scrollIntoViewIfNeeded();
          }
          assert.equal(await page.locator('.productsContainer').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width <= 600 ? 1 : width <= 1024 ? 2 : 3);
          await page.locator('.filters .classic').click();
          await equalEventually(() => page.locator('.filterdCategoryTagName').textContent().then(s => s.trim()), 'Classic');
          await page.locator('.filters .allProducts').click();
          await equalEventually(() => page.locator('.filterdCategoryTagName').textContent().then(s => s.trim()), 'All Products');
          await page.locator('.sort-toggle').click();
          await page.getByRole('option', { name:'Price: Low to High', exact:true }).click();
          await equalEventually(() => page.locator('#sort-value').textContent(), 'Price: Low to High');
          const prices = await page.locator('.prodPrice').allTextContents();
          const amounts = prices.map(s => Number(s.replace(/[^0-9.]/g, '')));
          assert.deepEqual(amounts, [...amounts].sort((a,b) => a-b));
          const action = cards.first().locator('.cart-action');
          await action.click();
          await equalEventually(() => action.getAttribute('aria-label').then(s => s.startsWith('Remove ')), true);
          assert.match(await action.getAttribute('aria-label'), /^Remove /);
          await action.click();
          await equalEventually(() => action.getAttribute('aria-label').then(s => s.startsWith('Add ')), true);
          await page.locator('.sort-toggle').focus();
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Escape');
          await equalEventually(() => page.locator('.sort-toggle').getAttribute('aria-expanded'), 'false');
        }
        if (route === '/contact') {
          for (const toggle of await page.locator('.faqItem h5 button').all()) {
            const answer = page.locator('#' + await toggle.getAttribute('aria-controls'));
            await toggle.click();
            await answer.waitFor({state:'visible'});
            assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
            await toggle.click();
            await answer.waitFor({state:'hidden'});
            assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          }
          const form = page.locator('.contactUsForm form');
          await form.locator('input[type=email]').fill('responsive@example.test');
          await form.locator('textarea').fill('Responsive layout verification.');
          await form.evaluate(el => el.addEventListener('submit', event => { event.preventDefault(); el.dataset.submitted = 'true'; }, { once:true }));
          await form.locator('button[type=submit]').click();
          await equalEventually(() => form.getAttribute('data-submitted'), 'true');
        }
        await page.evaluate(() => window.scrollTo(0,0));
        if (width <= 900) {
          await page.locator('.menu-toggle').click();
          await equalEventually(() => page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
          await page.keyboard.press('Tab');
          assert.ok(await page.locator('.menu-dialog').evaluate(el => el.contains(document.activeElement)), 'Focus escapes menu');
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
          assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
          assert.ok(await page.locator('.menu-toggle').evaluate(el => el === document.activeElement));
          await page.locator('.menu-toggle').click();
          await page.locator('.menu-dialog .cart-link').click();
        } else await page.locator('.cart-toggle').click();
        await page.waitForFunction(() => document.querySelector('#cart-sidebar').open);
        assert.ok(await page.locator('#cart-sidebar').evaluate(el => el.open));
        await page.keyboard.press('Escape');
        await page.locator('#cart-sidebar[open]').waitFor({state:'hidden'});
        await page.screenshot({ path:`${output}/${route.slice(1)||'home'}-${width}-${reducedMotion}.png`, fullPage:true });
        results.push({ route, width, reducedMotion, passed:true });
        console.log(`PASS ${route} ${width}px ${reducedMotion}`);
      }
    }
    await context.close();
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results,null,2));
  await browser.close();
}
