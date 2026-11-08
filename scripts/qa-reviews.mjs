import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.QA_URL ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = []; const checks = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir('qa', { recursive: true });
await mkdir('previews', { recursive: true });
async function check(name, run) { await run(); checks.push(name); console.log('PASS', name); }
const reviews = page.locator('#product-reviews');
const ownText = 'Всё подключили быстро. Спасибо за помощь!';
try {
  await check('empty state and required fields; stars support keyboard selection', async () => {
    await page.goto(base + '/#/product/claude-pro');
    await expect(reviews.getByRole('heading', { name: 'Отзывы 0' })).toBeAttached();
    await expect(page.locator('.offer-page>.product-stats')).toContainText('Покупателей: —');
    await reviews.getByRole('button', { name: 'Оставить отзыв' }).click();
    await reviews.getByRole('button', { name: 'Сохранить отзыв', exact: true }).click();
    await expect(reviews.locator('.field-error')).toHaveCount(3);
    await reviews.getByLabel('Ваше имя').fill('Тимофей');
    await reviews.getByLabel('Ваш отзыв', { exact: true }).fill(ownText);
    await reviews.getByRole('radio', { name: '1 из 5' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(reviews.getByRole('radio', { name: '2 из 5' })).toBeChecked();
    await reviews.getByRole('radio', { name: '5 из 5' }).check();
    await page.screenshot({ path: 'previews/reviews-form-dark.png' });
    await reviews.getByRole('button', { name: 'Сохранить отзыв', exact: true }).click();
    await expect(reviews.locator('.review-card')).toHaveCount(1);
    await expect(reviews.getByRole('status')).toContainText('сохранён');
    await expect(page.locator('.offer-page>.product-stats')).toContainText('5,0');
  });
  await check('reload, catalog rating and product isolation', async () => {
    await page.reload(); await expect(reviews.locator('.review-card')).toContainText(ownText);
    await page.goto(base + '/#/catalog');
    const card = page.locator('.product-card').filter({ has: page.getByRole('button', { name: 'Claude Pro', exact: true }) });
    await expect(card.locator('.product-stats')).toContainText('5,0');
    await page.goto(base + '/#/product/booking');
    await expect(reviews.getByRole('heading', { name: 'Отзывы 0' })).toBeAttached();
    await reviews.getByRole('button', { name: 'Оставить отзыв' }).click();
    await expect(reviews.getByLabel('Ваш отзыв', { exact: true })).toHaveValue('');
  });
  await check('average uses this product only; edits replace own review; cross-tab updates', async () => {
    const second = await context.newPage();
    await second.goto(base + '/#/product/claude-pro');
    await expect(second.locator('.reviews-overview>strong')).toHaveText('5,0');
    await page.evaluate(() => {
      const now = new Date().toISOString();
      const data = JSON.parse(localStorage.getItem('fikus:reviews:v1'));
      data.push({ id: 'qa-external', productId: 'claude-pro', author: 'Анна', rating: 4, text: 'Поддержка помогла с настройкой.', createdAt: now, updatedAt: now });
      data.push({ id: 'qa-other', productId: 'booking', author: 'Иван', rating: 1, text: 'Отзыв о другом предложении.', createdAt: now, updatedAt: now });
      data.push({ id: 'qa-invalid', productId: 'claude-pro', author: 'Ошибка', rating: 99, text: 'Некорректная оценка', createdAt: now, updatedAt: now });
      data.push({ id: 'qa-bad-date', productId: 'claude-pro', author: 'QA', rating: 5, text: 'Invalid stored date', createdAt: 2026, updatedAt: 2026 });
      localStorage.setItem('fikus:reviews:v1', JSON.stringify(data));
    });
    await expect(second.locator('.reviews-overview>strong')).toHaveText('4,5');
    await page.goto(base + '/#/product/claude-pro');
    await reviews.getByRole('button', { name: 'Изменить отзыв' }).click();
    await reviews.getByRole('radio', { name: '3 из 5' }).check();
    await reviews.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await expect(reviews.locator('.review-card')).toHaveCount(2);
    await expect(reviews.locator('.reviews-overview>strong')).toHaveText('3,5');
    await expect(second.locator('.reviews-overview>strong')).toHaveText('3,5');
    await second.close();
  });
  await check('storage failure keeps entered text and does not change rating', async () => {
    await reviews.getByRole('button', { name: 'Изменить отзыв' }).click();
    await reviews.getByLabel('Ваш отзыв', { exact: true }).fill('Текст сохраняется при ошибке');
    await reviews.getByRole('radio', { name: '1 из 5' }).check();
    await page.evaluate(() => { window.originalStorageSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === 'fikus:reviews:v1') throw new DOMException('Quota exceeded', 'QuotaExceededError'); return window.originalStorageSetItem.call(this, k, v); }; });
    await reviews.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await expect(reviews.getByRole('alert')).toContainText('Не удалось сохранить');
    await expect(reviews.getByLabel('Ваш отзыв', { exact: true })).toHaveValue('Текст сохраняется при ошибке');
    await expect(reviews.locator('.reviews-overview>strong')).toHaveText('3,5');
    await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageSetItem; });
    await reviews.getByRole('button', { name: 'Закрыть форму' }).click();
  });
  await check('single-store buyer count editable in admin, persists and appears on catalog and detail', async () => {
    await page.goto(base + '/#/admin');
    await page.locator('.admin-product').getByRole('button', { name: /^Claude Pro/ }).first().click();
    const count = page.getByLabel('Число покупателей', { exact: false });
    await count.fill('128');
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await page.getByRole('button', { name: 'Всё сохранено', exact: true }).waitFor();
    await page.goto(base + '/#/product/claude-pro');
    await expect(page.locator('.offer-page>.product-stats')).toContainText('Покупателей: 128');
    await page.reload(); await expect(page.locator('.offer-page>.product-stats')).toContainText('Покупателей: 128');
    await page.goto(base + '/#/catalog');
    await expect(page.locator('.product-card').filter({ has: page.getByRole('button', { name: 'Claude Pro', exact: true }) }).locator('.product-stats')).toContainText('Покупателей: 128');
  });
  await check('light/dark, both brands, mobile and desktop fit without overflow', async () => {
    for (const mode of ['light', 'dark']) {
      await page.evaluate(mode => localStorage.setItem('fikus:appearance-v2', JSON.stringify(mode)), mode);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 960 });
        for (const product of ['claude-pro', 'booking']) {
          await page.goto(base + '/#/product/' + product);
          await reviews.waitFor();
          await reviews.scrollIntoViewIfNeeded();
          await page.evaluate(() => document.fonts.ready);
          assert.ok(await page.locator('.app-scroll').evaluate(e => e.scrollWidth <= e.clientWidth), `${product} ${width} ${mode}`);
          if (width === 390) await page.screenshot({ path: `previews/reviews-${product}-${mode}.png` });
        }
        await page.goto(base + '/#/catalog');
        await page.locator('.product-card').first().waitFor();
        assert.ok(await page.locator('.app-scroll').evaluate(e => e.scrollWidth <= e.clientWidth));
        if (width === 390) {
          await page.locator('.product-card').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: `previews/reviews-catalog-${mode}.png` });
        }
      }
    }
  });
  assert.deepEqual(errors, []);
  await writeFile('qa/reviews-result.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
