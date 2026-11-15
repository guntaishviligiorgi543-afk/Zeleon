import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4200';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
try {
  const page = await browser.newPage();
  for (const width of [320, 375, 430, 768]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.menu-toggle').waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const scroll of [0, 1200]) {
      await page.evaluate(y => window.scrollTo(0, y), scroll);
      for (let repeat = 0; repeat < 3; repeat++) {
        const frames = await page.evaluate(async () => {
          const dialog = document.querySelector('.menu-dialog');
          const panel = dialog.querySelector('.menu-panel');
          const sample = () => ({
            x: panel.getBoundingClientRect().x,
            width: panel.getBoundingClientRect().width,
            scroll: dialog.scrollLeft,
            page: window.scrollY,
          });
          document.querySelector('.menu-toggle').click();
          const frames = [sample()];
          const start = performance.now();
          await new Promise(resolve => {
            function frame(now) {
              frames.push(sample());
              if (now - start < 500) requestAnimationFrame(frame);
              else resolve();
            }
            requestAnimationFrame(frame);
          });
          return frames;
        });
        assert.ok(frames[0].x >= width - 1, 'Panel should start outside the viewport, not jump into place');
        for (let i = 0; i < frames.length; i++) {
          assert.equal(frames[i].scroll, 0, 'Autofocus scrolled the dialog during the slide');
          assert.ok(Math.abs(frames[i].width - frames[0].width) < 0.1, 'Panel resized during the slide');
          assert.equal(frames[i].page, frames[0].page, 'Opening moved the underlying page');
          if (i) assert.ok(frames[i].x <= frames[i - 1].x + 0.1, 'Panel reversed direction (jitter)');
        }
        assert.ok(Math.abs(frames.at(-1).x - (width - frames[0].width)) < 1);
        assert.equal(await page.evaluate(() => document.activeElement.classList.contains('menu-close')), true);
        const exit = await page.evaluate(async () => {
          const dialog = document.querySelector('.menu-dialog');
          const panel = dialog.querySelector('.menu-panel');
          const frames = [];
          dialog.querySelector('.menu-close').click();
          const start = performance.now();
          await new Promise(resolve => {
            function frame(now) {
              if (dialog.open) frames.push({
                x: panel.getBoundingClientRect().x,
                scroll: dialog.scrollLeft,
                locked: document.body.style.overflow === 'hidden',
              });
              if (now - start < 450) requestAnimationFrame(frame);
              else resolve();
            }
            requestAnimationFrame(frame);
          });
          return { frames, open: dialog.open };
        });
        assert.equal(exit.open, false, 'Exit never released the modal');
        assert.ok(exit.frames.length > 4, 'Menu disappeared without an exit animation');
        assert.ok(exit.frames.at(-1).x > width - 20, 'Exit did not slide offscreen');
        for (let i = 0; i < exit.frames.length; i++) {
          assert.equal(exit.frames[i].scroll, 0);
          assert.equal(exit.frames[i].locked, true);
          if (i) assert.ok(exit.frames[i].x + 0.1 >= exit.frames[i - 1].x, 'Exit reversed direction (jitter)');
        }
        await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
        assert.equal(await page.evaluate(() => document.activeElement.classList.contains('menu-toggle')), true);
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.menu-toggle').click();
    assert.equal(await page.locator('.menu-panel').evaluate(el => el.getAnimations().length), 0);
    assert.equal(await page.locator('.menu-dialog').evaluate(el => el.scrollLeft), 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    console.log(`PASS ${width}px: six smooth openings/exits, focus, Escape, and reduced motion`);
  }
} finally {
  await browser.close();
}
