import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
await mkdir('previews', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5174/?ref=klod');
  await page.locator('.claude-welcome').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const cards = await page.locator('.product-card').count();
  assert.ok(cards >= 4);
  await expect(page.locator('.product-card .clawd-scene')).toHaveCount(cards);
  assert.ok(await page.locator('.clawd-scene').evaluateAll(imgs => imgs.every(img => img.complete && img.naturalWidth === 192 && img.src.endsWith('.gif'))));
  results.push(`All ${cards} Claude cards and hero use decoded local GIFs`);
  await page.getByRole('button', { name: 'Приостановить анимации Clawd' }).click();
  assert.ok(await page.locator('.clawd-scene').evaluateAll(imgs => imgs.every(img => img.src.endsWith('.png'))));
  results.push('One pause control switches every scene to a static frame');
  for (const mode of ['dark', 'light']) {
    if (mode === 'light') await page.getByRole('button', { name: 'Включить светлую тему' }).click();
    for (const width of [320, 390, 440, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390 || width === 1280) await page.screenshot({ path: `previews/clawd-${mode}-${width}.png`, fullPage: width === 390 });
    }
  }
  results.push('Dark/light layouts fit 320, 390, 440 and 1280 px');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Выбрать своего Claude' }).click();
  await expect.poll(() => page.locator('.catalog-heading').evaluate(el => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(150);
  await page.screenshot({ path: 'previews/clawd-catalog.png' });
  await page.getByRole('button', { name: 'Списком', exact: true }).click();
  await page.screenshot({ path: 'previews/clawd-list.png', fullPage: true });
  await page.getByRole('button', { name: 'Подробнее: Claude Pro', exact: true }).click();
  await page.getByRole('heading', { name: 'Claude Pro', exact: true }).waitFor();
  await expect(page.locator('.detail-art .clawd-scene')).toHaveAttribute('src', /writing\.png$/);
  await page.screenshot({ path: 'previews/clawd-product.png', fullPage: true });
  await page.getByRole('button', { name: 'В корзину', exact: false }).click();
  await page.getByRole('button', { name: /Корзина, 1 товаров/ }).click();
  await page.locator('.cart-row').waitFor();
  results.push('Catalog scroll, list, product scene and add-to-cart work');
  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const rp = await reduced.newPage();
  await rp.goto('http://127.0.0.1:5174/?ref=klod');
  await rp.locator('.claude-welcome').waitFor();
  assert.ok(await rp.locator('.clawd-scene').evaluateAll(imgs => imgs.every(img => img.src.endsWith('.png'))));
  results.push('Reduced-motion preference starts with static scenes');
  await page.goto('http://127.0.0.1:5174/#/group/mail');
  await page.getByRole('heading', { name: 'Почта', exact: true }).waitFor();
  assert.equal(await page.locator('.claude-welcome').count(), 0);
  assert.equal(await page.locator('.clawd-scene').count(), 0);
  results.push('Other sections retain their existing hero and artwork');
  assert.deepEqual(errors, []);
  await writeFile('qa/clawd-checks.json', JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally { await browser.close(); }
