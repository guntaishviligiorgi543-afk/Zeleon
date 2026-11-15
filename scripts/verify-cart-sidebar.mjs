import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4200';
const output = process.env.CART_TEST_OUTPUT || 'tmp/cart-sidebar';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const results = [];
const errors = [];
async function eventually(read, expected) {
  for (let i = 0; i < 100; i++) {
    if (await read() === expected) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await read(), expected);
}
const amount = text => Number(text.replace(/[^0-9.]/g, ''));
try {
  for (const motion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ reducedMotion: motion, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[320,812],[375,812],[430,812],[768,900],[1024,900],[1366,900],[1920,900],[320,568],[768,430]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}/shop`, { waitUntil:'domcontentloaded' });
      await page.locator('.productsContainer[aria-busy="false"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const products = page.locator('.productCard');
      assert.ok(await products.count() >= 3, 'Public catalog must load');
      const prices = (await products.locator('.prodPrice').allTextContents()).map(amount);
      for (let i = 0; i < 3; i++) {
        await products.nth(i).locator('.cart-action').click();
        await eventually(() => products.nth(i).locator('.cart-action').getAttribute('aria-label').then(s => s.startsWith('Remove ')), true);
      }
      const trigger = page.locator(width <= 900 ? '.mobile-cart-toggle' : '.cart-toggle');
      if (width <= 900) {
        const cart = await trigger.boundingBox();
        const burger = await page.locator('.menu-toggle').boundingBox();
        assert.ok(cart && burger && cart.x + cart.width <= burger.x && cart.width >= 44 && cart.height >= 44, 'Mobile cart must remain left of burger');
      }
      await trigger.click();
      await page.waitForTimeout(motion === 'reduce' ? 80 : 550);
      const dialog = page.locator('#cart-sidebar');
      const lines = dialog.locator('.cart-line');
      assert.equal(await lines.count(), 3);
      assert.equal(await dialog.evaluate(el => el.open), true);
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      const metrics = await dialog.evaluate(el => {
        const panel = el.querySelector('.cart-panel');
        const list = el.querySelector('.cart-items');
        const footer = el.querySelector('.cart-footer').getBoundingClientRect();
        const header = el.querySelector('.cart-heading').getBoundingClientRect();
        const controls = [...el.querySelectorAll('button, a')].map(button => {
          const r = button.getBoundingClientRect();
          return { width:r.width, height:r.height, left:r.left, right:r.right };
        });
        return {
          dialogScroll:el.scrollLeft, panelScroll:panel.scrollHeight-panel.clientHeight,
          listOverflow:list.scrollWidth-list.clientWidth, footerBottom:footer.bottom,
          footerTop:footer.top, headerTop:header.top,
          radius:getComputedStyle(panel).borderRadius,
          radii:[...el.querySelectorAll('.quantity-control,.remove-item,.estimated-total,.checkout-button,.view-cart')].map(node => getComputedStyle(node).borderRadius),
          controls,
          imageFits:[...el.querySelectorAll('.cart-image img')].every(img => getComputedStyle(img).objectFit === 'contain'),
        };
      });
      assert.equal(metrics.dialogScroll,0);
      assert.ok(metrics.listOverflow <= 1 && metrics.panelScroll <= 1);
      assert.ok(metrics.footerBottom <= height + 1 && metrics.headerTop >= 0 && metrics.footerTop > 60);
      assert.equal(metrics.radius,'0px');
      assert.ok(metrics.radii.every(value => parseFloat(value) >= 12 && parseFloat(value) <= 16));
      assert.ok(metrics.controls.every(r => r.width >= 43 && r.height >= 43 && r.left >= -1 && r.right <= width + 1));
      assert.equal(metrics.imageFits,true);
      assert.equal(await dialog.locator('.checkout-button').isDisabled(),true);
      const total = () => dialog.locator('.total-values').textContent().then(amount);
      const initial = prices[0]+prices[1]+prices[2];
      assert.equal(await total(),initial);
      await lines.first().locator('.quantity-plus').click();
      await eventually(total,initial+prices[0]);
      assert.equal(await lines.first().locator('.quantity-value').textContent(),'2');
      await lines.first().locator('.quantity-minus').click();
      await eventually(total,initial);
      assert.equal(await lines.first().locator('.quantity-minus').isDisabled(),true);
      await lines.nth(1).locator('.remove-item').click();
      await eventually(() => lines.count(),2);
      await eventually(total,prices[0]+prices[2]);
      const positions = await dialog.evaluate(el => ({ header:el.querySelector('.cart-heading').getBoundingClientRect().y,footer:el.querySelector('.cart-footer').getBoundingClientRect().y }));
      await dialog.locator('.cart-items').evaluate(el => el.scrollTop = el.scrollHeight);
      assert.deepEqual(await dialog.evaluate(el => ({ header:el.querySelector('.cart-heading').getBoundingClientRect().y,footer:el.querySelector('.cart-footer').getBoundingClientRect().y })),positions);
      await dialog.locator('.cart-items').evaluate(el => el.scrollTop = 0);
      await page.screenshot({ path:`${output}/cart-${width}x${height}-${motion}.png` });
      await dialog.locator('.cart-close').focus();
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(el => el.contains(el.ownerDocument.activeElement)),true);
      if (width >= 768) await page.mouse.click(8,Math.floor(height/2));
      else await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#cart-sidebar').open);
      assert.notEqual(await page.evaluate(() => document.body.style.overflow),'hidden');
      assert.equal(await trigger.evaluate(el => el === el.ownerDocument.activeElement),true);
      await trigger.click();
      await page.waitForTimeout(motion === 'reduce' ? 50 : 450);
      await dialog.locator('.view-cart').click();
      await page.waitForURL('**/cart');
      await page.waitForFunction(() => !document.querySelector('#cart-sidebar').open);
      await trigger.click();
      await page.waitForTimeout(motion === 'reduce' ? 50 : 500);
      assert.equal(await lines.count(),2,'Navigation must preserve shared cart state');
      for (let remaining = 2; remaining > 0; remaining--) {
        await lines.first().locator('.remove-item').click();
        await eventually(() => lines.count(),remaining-1);
      }
      assert.equal(await total(),0);
      assert.equal(await dialog.locator('.cart-empty').isVisible(),true);
      await dialog.locator('.continue-shopping').click();
      await page.waitForURL('**/shop');
      await page.waitForFunction(() => !document.querySelector('#cart-sidebar').open);
      results.push({width,height,motion,passed:true});
      console.log(`PASS cart ${width}x${height} ${motion}`);
    }
    await context.close();
  }
  assert.deepEqual(errors,[], 'Unexpected JavaScript errors');
} finally {
  await writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));
  await browser.close();
}
