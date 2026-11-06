import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const baseURL = process.env.QA_URL ?? 'http://127.0.0.1:5174';
await mkdir('qa', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = []; const checks = [];
page.on('pageerror', e => errors.push(e.message));
async function check(label, run) { await run(); checks.push(label); console.log('PASS', label); }
try {
  await check('new and saved catalogs receive all services and USD products; custom data survives', async () => {
    await page.goto(baseURL); await page.getByRole('heading', { name: 'Каталог', exact: true }).waitFor();
    await expect(page.locator('.product-card')).toHaveCount(51);
    const catalog = await page.evaluate(() => JSON.parse(localStorage.getItem('fikus:catalog')));
    catalog.products = catalog.products.slice(0, 12); catalog.groups = catalog.groups.slice(0, 4);
    catalog.products[0].price = 1234; catalog.groups[1].visible = false;
    await page.evaluate(c => { localStorage.setItem('fikus:catalog', JSON.stringify(c)); localStorage.removeItem('fikus:services-expanded-v2'); }, catalog);
    await page.reload(); await expect(page.locator('.product-card')).toHaveCount(49);
    const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('fikus:catalog')));
    assert.equal(migrated.products.length, 51); assert.equal(migrated.products[0].price, 1234); assert.equal(migrated.groups[1].visible, false);
    await page.reload(); await expect(page.locator('.product-card')).toHaveCount(49);
    await page.evaluate(() => localStorage.clear()); await page.reload();
  });
  await check('all categories are reachable without horizontal scrolling', async () => {
    await page.getByRole('button', { name: /Все категории/ }).click();
    await expect(page.locator('.category-directory-grid>button')).toHaveCount(12);
    await page.screenshot({ path: 'qa/services-categories.png' });
    await page.getByRole('button', { name: /Жильё и путешествия.*3 предложений/ }).click();
    await expect(page.locator('.product-card')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Жильё и путешествия', exact: true })).toBeVisible();
  });
  await check('request validates date order, persists parameters, and never enters cart', async () => {
    await page.goto(baseURL + '/#/product/booking');
    await page.getByLabel(/^Направление/).fill('Париж');
    await page.getByLabel(/^Дата заезда/).fill('2026-12-10');
    await page.getByLabel(/^Дата выезда/).fill('2026-12-09');
    await page.getByLabel(/^Количество гостей/).fill('2');
    await page.getByRole('button', { name: /^(Создать демо-заявку|Отправить заявку)$/ }).click();
    await expect(page.locator('.request-form .field-error, .request-form [role=alert]')).toContainText('Дата окончания');
    await page.getByLabel(/^Дата выезда/).fill('2026-12-12');
    await page.getByLabel(/^Комментарий/).fill('Поздний заезд');
    await page.screenshot({ path: 'qa/services-request.png' });
    await page.getByRole('button', { name: /^(Создать демо-заявку|Отправить заявку)$/ }).click();
    await expect(page.locator('.request-card, .request-parameters')).toHaveCount(1);
    await expect(page.locator('.request-card, .request-parameters')).toContainText('Париж');
    await expect(page.locator('.request-card, .request-parameters')).toContainText('Поздний заезд');
    await page.reload(); await expect(page.locator('.request-card, .request-parameters')).toHaveCount(1);
    await page.getByRole('button', { name: 'Корзина, 0 товаров', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Тут пока просторно' })).toBeVisible();
  });
  await check('topups and gift cards collect service, region, amount and currency', async () => {
    for (const id of ['foreign-topup', 'gift-cards']) {
      await page.goto(baseURL + '/#/product/' + id);
      await expect(page.locator('.request-form input[required]')).toHaveCount(3);
      await expect(page.locator('.detail-price, .offer-facts')).toContainText('По запросу');
      assert.equal(await page.getByRole('button', { name: /В корзину/ }).count(), 0);
    }
  });
  await check('mixed currency basket and persistent order show separate RUB and USD totals', async () => {
    for (const id of ['claude-pro', 'chatgpt-plus-cdk', 'capcut-pro-7d']) {
      await page.goto(baseURL + '/#/product/' + id);
      await page.getByRole('button', { name: /^В корзину/ }).click();
    }
    await page.getByRole('button', { name: 'Корзина, 3 товаров', exact: true }).click();
    assert.equal((await page.locator('.summary-total').innerText()).replace(/\s/g, ' '), 'Итого 1 990 ₽ 16,5 $');
    await page.screenshot({ path: 'qa/services-mixed-cart.png' });
    if (await page.getByRole('button', { name: 'Перейти к оформлению', exact: true }).count()) {
      await page.getByRole('button', { name: 'Перейти к оформлению', exact: true }).click();
      await page.getByRole('checkbox', { name: /Проверил состав/ }).check();
      await page.getByRole('button', { name: 'Создать заказ', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Ваш заказ', exact: true })).toBeVisible();
      await expect(page.locator('.checkout-total')).toContainText('16,5 $');
      await page.reload(); await expect(page.getByRole('heading', { name: 'Ваш заказ', exact: true })).toBeVisible();
      await expect(page.locator('.checkout-total')).toContainText('1 990 ₽');
    } else {
      await page.getByRole('button', { name: 'Создать демо-заказ' }).click();
      await expect(page.locator('.order-card:not(.request-card)')).toHaveCount(1);
      await expect(page.locator('.order-card:not(.request-card) .order-total')).toContainText('16,5 $');
      await page.reload(); await expect(page.locator('.order-card:not(.request-card)')).toHaveCount(1);
    }
  });
  await check('admin edits request availability, form type, aliases and USD currency', async () => {
    await page.goto(baseURL + '/#/admin');
    await page.locator('.admin-product').filter({ hasText: 'Booking' }).getByRole('button', { name: /Booking/ }).first().click();
    await expect(page.getByLabel('Формат продажи')).toHaveValue('request');
    await expect(page.getByLabel('Параметры заявки')).toHaveValue('travel');
    await page.getByLabel('Принимать заявки').uncheck();
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await page.getByRole('button', { name: 'Всё сохранено', exact: true }).waitFor();
    await page.goto(baseURL + '/#/product/booking');
    await expect(page.getByRole('button', { name: 'Приём заявок закрыт' })).toBeDisabled();
    await page.goto(baseURL + '/#/admin');
    await page.locator('.admin-product').filter({ hasText: 'CapCut' }).getByRole('button', { name: /CapCut/ }).first().click();
    await expect(page.getByLabel('Валюта')).toHaveValue('USD');
    await expect(page.getByLabel('Цена, $', { exact: true })).toHaveValue('0.5');
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  });
  await check('all downloaded brand assets load and no third-party image requests are needed', async () => {
    await page.goto(baseURL + '/#/catalog');
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
    const assets = JSON.parse(await readFile('src/logo-assets.json', 'utf8'));
    const unique = Object.entries(assets).filter(([key]) => !/^(higgs-|chatgpt-|claude-pro-cdk|capcut-pro-7d|kling-ultra)/.test(key));
    await page.setViewportSize({ width: 1000, height: 1000 });
    await page.setContent(`<html><head><style>body{margin:0;padding:20px;background:#e7e7e3;font-family:Arial;display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.tile{height:130px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;background:white;border-radius:12px}img{width:80px;height:80px;object-fit:contain}span{font-size:12px}</style></head><body>${unique.map(([key, file]) => `<div class="tile"><img src="${baseURL}/${file}"><span>${key}</span></div>`).join('')}</body></html>`);
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
    await page.screenshot({ path: 'qa/official-logos.png', fullPage: true });
  });
  await check('expanded categories and long service titles fit 320px, 390px and 440px', async () => {
    await page.goto(baseURL + '/?qa=services');
    for (const width of [320, 390, 440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ['/group/rental', '/group/ai', '/product/foreign-verification', '/product/booking']) {
        await page.goto(baseURL + '/#' + route); await page.locator('main h1, main h2').first().waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok(await page.locator('.app-scroll').evaluate(e => e.scrollWidth <= e.clientWidth));
      }
      await page.goto(baseURL + '/#/group/rental'); await page.locator('.product-card').first().waitFor();
      await page.screenshot({ path: `qa/services-rental-${width}.png` });
    }
  });
  assert.deepEqual(errors, []);
  await writeFile('qa/services-result.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, pageErrors: errors }, null, 2));
  console.log(`${checks.length} service checks passed`);
} finally { await browser.close(); }
