import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.QA_URL ?? 'http://127.0.0.1:5174';
await mkdir('qa', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const checks = [];
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && /\/(covers|logos)\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  const decodeCovers = () => page.locator('.product-cover img').evaluateAll(imgs => Promise.all(imgs.map(async img => { img.loading = 'eager'; await img.decode(); })));
  await page.goto(`${url}/#/catalog`);
  await expect(page.locator('.product-cover')).toHaveCount(46);
  await expect(page.locator('.product-art .clawd-product')).toHaveCount(7);
  await decodeCovers();
  const ids = await page.locator('.product-cover').evaluateAll(elements => elements.map(e => [...e.classList].find(c => c.startsWith('cover-') && !['cover-photo', 'cover-graphic', 'cover-invert'].includes(c)).slice(6)));
  const mail = page.locator('.product-card').filter({ has: page.locator('.cover-mail-setup') });
  const favorite = mail.locator('.favorite-button');
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await favorite.click();
  await mail.locator('.art-link').click();
  await expect(page).toHaveURL(/#\/product\/mail-setup$/);
  checks.push('Cover click opens the offer; favorite toggles independently');
  await page.goto(`${url}/#/catalog`);
  for (const width of [320, 390, 440, 1255]) {
    await page.setViewportSize({ width, height: 844 });
    for (const mode of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-mode') !== mode) await page.locator('.appearance-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      const geometry = await page.locator('.product-art .product-cover').evaluateAll(covers => covers.every(cover => {
        const c = cover.getBoundingClientRect(), a = cover.closest('.art-link').getBoundingClientRect();
        return Math.abs(c.width - a.width) < 1 && Math.abs(c.height - a.height) < 1 && c.width > 90;
      }));
      assert.ok(geometry, `Covers fill cards at ${width}px, ${mode}`);
      assert.ok(await page.locator('.app-scroll').evaluate(e => e.scrollWidth <= e.clientWidth));
      checks.push(`${width}px ${mode}: full cover area, no horizontal overflow`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const group of ['ai', 'exchanges', 'wallets', 'rental', 'travel', 'mail']) {
    await page.goto(`${url}/#/group/${group}`);
    await page.locator('.product-cover').first().waitFor();
    await decodeCovers();
    await page.locator('.product-art').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `qa/covers-${group}-390.png` });
  }
  await page.locator('.layout-toggle button').last().click();
  await expect(page.locator('.products-list')).toHaveCount(1);
  await decodeCovers();
  assert.ok(await page.locator('.product-cover').first().evaluate(e => e.getBoundingClientRect().width > 90));
  checks.push('List view: covers fill the thumbnail');
  await page.screenshot({ path: 'qa/covers-list-390.png' });
  // Check every offer, including image decoding inside the larger detail artwork.
  for (const id of ids) {
    await page.goto(`${url}/#/product/${id}`);
    await expect(page.locator('.detail-art .product-cover')).toHaveCount(1);
    await decodeCovers();
    const geometry = await page.locator('.detail-art .product-cover').evaluate(e => {
      const c = e.getBoundingClientRect(), a = e.parentElement.getBoundingClientRect();
      return Math.abs(c.width - a.width) <= 2 && Math.abs(c.height - a.height) <= 2;
    });
    assert.ok(geometry, `Detail cover fills ${id}`);
  }
  checks.push(`${ids.length} non-Claude detail covers load and fill the artwork`);
  await page.goto(`${url}/#/product/booking`);
  await decodeCovers();
  await page.screenshot({ path: 'qa/covers-booking-detail-390.png' });
  await page.goto(`${url}/#/product/claude-pro`);
  await expect(page.locator('.detail-art .clawd-product')).toHaveCount(1);
  await expect(page.locator('.detail-art .product-cover')).toHaveCount(0);
  checks.push('Claude artwork remains on the original renderer');
  assert.deepEqual(errors, []);
  await writeFile('qa/covers-result.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, errors }, null, 2));
  console.log(checks.join('\n'));
} finally { await browser.close(); }
