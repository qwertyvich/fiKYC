import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const base = process.env.QA_URL ?? 'http://127.0.0.1:5174';
const folder = `qa/form-spacing/${baseline ? 'before' : 'after'}`;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'msedge' }) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const failures = [], checks = [], pageErrors = [];
page.on('pageerror', error => { pageErrors.push(error.message); console.error('PAGE ERROR:', error.message); });
async function visit(route) {
  await page.goto(`${base}/#${route}`);
  await page.locator('.app-frame').waitFor();
  await page.locator('.loading').waitFor({ state: 'hidden' });
  await page.evaluate(() => document.fonts.ready);
}
async function inspect(name) {
  const issues = await page.evaluate(() => {
    const issues = [];
    for (const card of document.querySelectorAll('.request-form, .content-card, .offer-editor')) {
      const bounds = card.getBoundingClientRect();
      const first = card.firstElementChild?.getBoundingClientRect();
      if (first && (first.left - bounds.left < 12 || bounds.right - first.right < 12)) issues.push(`Missing card gutter: ${card.className}`);
    }
    for (const control of document.querySelectorAll('.edit-form input:not([type=checkbox]), .edit-form textarea, .edit-form select, .standalone-field textarea')) {
      const field = control.getBoundingClientRect(), parent = control.parentElement.getBoundingClientRect();
      if (field.left < parent.left - 1 || field.right > parent.right + 1 || field.width < 80) issues.push(`Field overflow: ${control.id || control.tagName}`);
      if (parseFloat(getComputedStyle(control).paddingLeft) < 10) issues.push('Missing input text inset');
      if (field.height < 44) issues.push('Small input target');
    }
    for (const form of document.querySelectorAll('.edit-form, .checkout-form')) {
      if (parseFloat(getComputedStyle(form).rowGap) < 12) issues.push('Missing field row gap');
    }
    if (document.documentElement.scrollWidth > innerWidth) issues.push('Horizontal page overflow');
    return issues;
  });
  failures.push(...issues.map(issue => `${name}: ${issue}`));
  checks.push(name);
}
async function capture(name, target) {
  await page.locator('.toast').waitFor({ state: 'hidden' });
  if (target) await page.locator(target).first().evaluate(el => {
    el.scrollIntoView({ block: 'start' });
    el.closest('.sheet, .app-scroll')?.scrollBy(0, -18);
  });
  await page.screenshot({ path: `${folder}/${name}.png` });
}
try {
  await visit('/catalog');
  const products = await page.evaluate(() => JSON.parse(localStorage.getItem('fikus:catalog')).products.filter(p => p.visible && p.saleMode === 'request'));
  console.log('Request forms:', products.length);
  for (const width of [320, 390, 1280]) for (const mode of ['dark', 'light']) {
    console.log(`Checking ${width}px / ${mode}`);
    await page.setViewportSize({ width, height: 844 });
    await visit('/catalog');
    if (await page.locator('html').getAttribute('data-mode') !== mode) await page.locator('.appearance-toggle').click();
    for (const product of products) {
      await visit(`/product/${product.id}`);
      await page.locator('.request-form').waitFor();
      await inspect(`request/${product.id}/${width}/${mode}`);
      if (width <= 390 && product.id === 'foreign-verification') {
        await capture(`01-kyc-${width}-${mode}`, '.request-form');
        await page.locator('.request-form button[type=submit]').evaluate(el => el.scrollIntoView({ block: 'center' }));
        await capture(`02-kyc-bottom-${width}-${mode}`);
      }
      const submit = page.locator('.request-form button[type=submit]');
      await page.locator('.app-scroll').evaluate(el => el.scrollTo(0, el.scrollHeight));
      const button = await submit.boundingBox(), nav = await page.locator('.bottom-nav').boundingBox();
      if (button.y + button.height > nav.y) failures.push(`request/${product.id}/${width}/${mode}: submit hidden by navigation at end of scroll`);
      if (product.id === 'foreign-verification') {
        await submit.click();
        const invalid = page.locator('[aria-invalid=true]').first();
        try { await expect(invalid).toBeFocused({ timeout: 3000 }); } catch { failures.push(`request/validation/${width}/${mode}: invalid field not focused`); }
        await inspect(`request/validation/${width}/${mode}`);
        if (width === 390) await capture(`08-validation-${mode}`, '.request-form');
      }
    }
    await visit('/support/new'); await inspect(`support/${width}/${mode}`);
    if (width === 390) await capture(`03-support-${mode}`, '.support-form');
    await visit('/product/claude-pro');
    await page.getByRole('button', { name: 'В корзину', exact: true }).click();
    await page.locator('.nav-cart b').waitFor();
    await visit('/checkout'); await page.locator('.checkout-form').waitFor(); await inspect(`checkout/${width}/${mode}`);
    if (width === 390) await capture(`04-checkout-${mode}`, '.standalone-field');
    await visit('/profile'); await page.getByRole('button', { name: 'Контакты и условия магазина', exact: true }).click();
    await page.locator('.sheet .edit-form').waitFor(); await inspect(`shop-editor/${width}/${mode}`);
    if (width === 390) await capture(`05-shop-editor-${mode}`);
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await visit('/admin');
    await page.locator('.admin-product').filter({ hasText: 'Claude Pro' }).first().locator('.admin-name').click();
    await page.locator('.offer-editor summary').click(); await inspect(`offer-editor/${width}/${mode}`);
    if (width === 390) await capture(`06-offer-editor-${mode}`, '.offer-editor');
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.locator('.admin-group .admin-name').first().click(); await inspect(`group-editor/${width}/${mode}`);
    if (width === 390) await capture(`07-group-editor-${mode}`);
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  }
  assert.deepEqual(pageErrors, []);
  await writeFile(`${folder}/result.json`, JSON.stringify({ checkedAt: new Date().toISOString(), requestProducts: products.length, checks, failures, pageErrors }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, requestProducts: products.length, failures: failures.length, examples: failures.slice(0, 5), report: `${folder}/result.json` }));
  if (!baseline) assert.deepEqual(failures, []);
} catch (error) {
  await page.screenshot({ path: `${folder}/failed.png` });
  await writeFile(`${folder}/partial.json`, JSON.stringify({checks, failures, pageErrors}, null, 2));
  console.error('Page errors:', pageErrors);
  throw error;
} finally {
  await browser.close();
}
