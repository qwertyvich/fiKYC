import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.QA_URL ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
async function check(name, run) { await run(); checks.push(name); console.log('PASS', name); }
await mkdir('qa', { recursive: true }); await mkdir('previews', { recursive: true });
try {
  await check('cart builds mixed-currency draft, preserves basket and comment on reload; placeholder has no outgoing link', async () => {
    for (const id of ['claude-pro', 'chatgpt-plus-cdk']) {
      await page.goto(base + '/#/product/' + id);
      await page.getByRole('button', { name: 'В корзину', exact: true }).click();
    }
    await page.goto(base + '/#/cart');
    await page.getByRole('button', { name: 'Перейти к оформлению' }).click();
    await expect(page.getByRole('heading', { name: 'Заказ в Telegram' })).toBeVisible();
    await page.getByLabel(/Комментарий к заказу/).fill('После 18:00');
    await page.getByRole('checkbox', { name: /Хочу оплатить с баланса магазина/ }).check();
    const message = page.getByLabel('Сообщение продавцу');
    await expect(message).toHaveValue(/Claude Pro[\s\S]+ChatGPT Plus CDK[\s\S]+Итого: 1 990 ₽ \+ 16 \$/);
    await expect(message).toHaveValue(/с баланса магазина/);
    await expect(page.getByRole('button', { name: 'Контакт продавца скоро появится' })).toBeDisabled();
    assert.equal(await page.locator('.seller-message a').count(), 0);
    await page.getByRole('button', { name: 'Скопировать сообщение' }).click();
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), await message.inputValue());
    await page.reload();
    await expect(page.getByLabel(/Комментарий к заказу/)).toHaveValue('После 18:00');
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('fikus:cart')))).length, 2);
    assert.equal(await page.evaluate(() => localStorage.getItem('fikus:orders')), null);
    await page.locator('.seller-message').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'previews/seller-checkout-placeholder.png' });
  });
  await check('configured contact gets complete URL-encoded message without sending anything', async () => {
    await page.evaluate(() => {
      const shop = JSON.parse(localStorage.getItem('fikus:shop') ?? '{}');
      localStorage.setItem('fikus:shop', JSON.stringify({ workingHours: '', responseTime: '', about: '', refundPolicy: '', ...shop, supportTelegram: 'fikus_qa_seller' }));
    });
    await page.reload();
    const link = page.getByRole('link', { name: 'Открыть чат продавца' });
    await expect(link).toBeAttached();
    const url = new URL(await link.getAttribute('href'));
    assert.equal(url.pathname, '/fikus_qa_seller');
    assert.equal(url.searchParams.get('text'), await page.getByLabel('Сообщение продавцу').inputValue());
    // Inspect the link only; never contact a real Telegram user.
  });
  await check('service parameters become a seller draft and survive reload', async () => {
    await page.goto(base + '/#/product/foreign-topup');
    await page.getByLabel(/^Сервис$/).fill('Steam');
    await page.getByLabel(/^Страна \/ регион/).fill('США');
    await page.getByLabel(/^Сумма и валюта/).fill('20 USD');
    await page.getByRole('button', { name: 'Подготовить заявку', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Заявка в Telegram' })).toBeVisible();
    await expect(page.getByLabel('Сообщение продавцу')).toHaveValue(/Steam[\s\S]+США[\s\S]+20 USD/);
    await page.reload(); await expect(page.getByLabel('Сообщение продавцу')).toHaveValue(/Steam/);
  });
  await check('customer balance validates topup; preparing/copying request never credits money', async () => {
    await page.evaluate(() => localStorage.removeItem('fikus:shop'));
    await page.goto(base + '/#/profile'); await page.reload();
    const wallet = page.locator('.wallet-card');
    await expect(wallet.getByRole('heading', { name: 'Баланс магазина' })).toBeVisible();
    await expect(wallet.locator('.wallet-amount')).toHaveText('0 ₽0 $');
    await wallet.getByRole('button', { name: 'Пополнить баланс' }).click();
    await wallet.getByLabel('Сумма пополнения').fill('-10');
    await wallet.getByRole('button', { name: 'Подготовить запрос' }).click();
    await expect(wallet.getByRole('alert')).toContainText('Укажите сумму');
    await wallet.getByLabel('Сумма пополнения').fill('1000');
    await wallet.getByRole('button', { name: 'Подготовить запрос' }).click();
    await expect(wallet.getByLabel('Сообщение продавцу')).toHaveValue(/пополнить баланс[\s\S]+1 000 ₽/);
    await wallet.getByRole('button', { name: 'Скопировать сообщение' }).click();
    await expect(wallet.locator('.wallet-amount')).toHaveText('0 ₽0 $');
    await expect(wallet.getByRole('button', { name: 'Контакт продавца скоро появится' })).toBeDisabled();
    await wallet.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'previews/customer-balance-topup.png' });
    await page.reload(); await expect(wallet.locator('.wallet-amount')).toHaveText('0 ₽0 $');
  });
  await check('checkout and customer wallet fit light/dark at 320, 390 and 1280 pixels', async () => {
    for (const mode of ['light', 'dark']) {
      await page.evaluate(m => localStorage.setItem('fikus:appearance-v2', JSON.stringify(m)), mode); await page.reload();
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 960 });
        for (const route of ['checkout', 'profile']) {
          await page.goto(base + '/#/' + route);
          await page.getByRole('heading', { name: route === 'checkout' ? 'Заказ в Telegram' : 'Профиль', exact: true }).waitFor();
          if (route === 'profile') await page.locator('.wallet-card').scrollIntoViewIfNeeded();
          assert.ok(await page.locator('.app-scroll').evaluate(e => e.scrollWidth <= e.clientWidth));
          if (width === 390) await page.screenshot({ path: `previews/seller-${route}-${mode}.png` });
        }
      }
    }
  });
  assert.deepEqual(errors, []);
  await writeFile('qa/seller-result.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
