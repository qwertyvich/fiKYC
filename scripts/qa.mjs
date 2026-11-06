import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const baseURL = process.env.QA_URL ?? 'http://127.0.0.1:5174';
await mkdir('qa', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const checks = [];
async function check(label, run) { await run(); checks.push(label); console.log('PASS', label); }
async function theme(expected) { await expect(page.locator('html')).toHaveAttribute('data-theme', expected); }
try {
  await page.goto(baseURL);
  await page.getByRole('heading', { name: 'Каталог', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await check('catalog: 51 products, no horizontal overflow', async () => { assert.equal(await page.locator('.product-card').count(), 51); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); });
  await page.screenshot({ path: 'qa/01-market-mobile.png' });
  await check('ordinary entry: Claude group and product use Claude; other group restores Ficus', async () => {
    await page.getByRole('button', { name: 'Знакомься, Claude' }).click(); await theme('claude');
    await page.screenshot({ path: 'qa/02-claude-mobile.png' });
    await page.getByRole('button', { name: 'Подробнее: Claude Pro', exact: true }).click(); await page.getByRole('heading', { name: 'Claude Pro', exact: true }).waitFor(); await theme('claude');
    await page.screenshot({ path: 'qa/03-product-mobile.png' });
    await page.getByRole('button', { name: 'Claude', exact: true }).click();
    await page.getByRole('button', { name: 'Почта', exact: true }).click(); await theme('fikus');
  });
  await check('search and empty state', async () => {
    await page.getByRole('button', { name: 'Все', exact: true }).click();
    await page.getByRole('textbox', { name: 'Поиск по товарам' }).fill('СДЭК'); await expect(page.locator('.product-card')).toHaveCount(2);
    await page.getByRole('textbox', { name: 'Поиск по товарам' }).fill('ничего-такого-нет'); await page.getByRole('heading', { name: 'Пока ничего не нашлось' }).waitFor();
    await page.getByRole('button', { name: 'Очистить поиск' }).click();
  });
  await check('filters, stock toggle, sorting and list layout', async () => {
    await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Только в наличии' }).check();
    await page.getByRole('radio', { name: 'Сначала дешевле' }).check();
    await page.screenshot({ path: 'qa/04-filters-mobile.png' });
    await page.getByRole('button', { name: 'Показать товары' }).click();
    await expect(page.locator('.product-card')).toHaveCount(50);
    assert.equal(await page.locator('.product-title').first().innerText(), 'Почта России');
    await page.getByRole('button', { name: 'Списком', exact: true }).click(); assert.ok(await page.locator('.products').evaluate(e => e.classList.contains('products-list')));
    await page.getByRole('button', { name: 'Плиткой', exact: true }).click();
  });
  await check('favorites persist across reload', async () => {
    await page.getByRole('button', { name: 'В избранное: Claude Pro', exact: true }).click();
    await page.getByRole('button', { name: 'Избранное', exact: true }).click();
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.reload(); await page.getByRole('button', { name: 'Подробнее: Claude Pro', exact: true }).waitFor(); assert.equal(await page.locator('.product-card').count(), 1);
  });
  await check('cart, quantity, demo checkout, persistent order', async () => {
    await page.getByRole('button', { name: 'Добавить в корзину: Claude Pro', exact: true }).click();
    await page.getByRole('button', { name: /Корзина, 1 товаров/ }).click();
    await page.getByRole('button', { name: 'Увеличить Claude Pro', exact: true }).click();
    await page.screenshot({ path: 'qa/05-cart-mobile.png' });
    assert.equal((await page.locator('.summary-total strong').last().innerText()).replace(/\s/g, ' '), '3 980 ₽');
    await page.getByRole('button', { name: 'Создать демо-заказ', exact: true }).click();
    await page.locator('.order-card').waitFor(); assert.equal(await page.locator('.order-card').count(), 1);
    await page.reload(); await page.locator('.order-card').waitFor(); assert.equal((await page.locator('.order-total b').innerText()).replace(/\s/g, ' '), '3 980 ₽');
  });
  await check('admin edits description, price and order; hides Claude without deleting it', async () => {
    await page.goto(baseURL + '/#/admin'); await page.getByRole('heading', { name: 'Редактор каталога', exact: true }).waitFor();
    await page.locator('.admin-product').filter({ hasText: 'Claude Pro' }).first().getByRole('button', { name: /Claude Pro/ }).first().click();
    await page.getByRole('textbox', { name: 'Описание', exact: true }).fill('Описание для проверки подключения панели.');
    await page.getByRole('spinbutton', { name: 'Цена, ₽', exact: true }).fill('1790');
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.getByRole('button', { name: 'Поднять Настройка Claude', exact: true }).click();
    await page.getByRole('button', { name: 'Опустить группу Claude', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await page.getByRole('button', { name: 'Всё сохранено', exact: true }).waitFor();
    await page.screenshot({ path: 'qa/06-admin-mobile.png' });
    await page.reload(); await page.locator('.admin-product').first().waitFor();
    assert.ok((await page.locator('.admin-product').filter({ hasText: 'Claude Pro' }).first().innerText()).replace(/\s/g, ' ').includes('1 790 ₽'));
    assert.ok((await page.locator('.admin-group').first().innerText()).includes('Почта'));
    await page.locator('.admin-group').filter({ hasText: 'Claude' }).getByRole('button', { name: /Claude/ }).first().click();
    await page.getByRole('checkbox', { name: 'Показывать группу и её товары' }).uncheck();
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await page.getByRole('button', { name: 'Всё сохранено', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Маркет', exact: true }).click(); await expect(page.locator('.product-card')).toHaveCount(46);
    await page.goto(baseURL + '/#/product/claude-pro'); await page.getByRole('heading', { name: 'Товар недоступен' }).waitFor();
  });
  await check('admin adds groups and products, exports and validates JSON imports', async () => {
    await page.goto(baseURL + '/#/admin'); await page.getByRole('heading', { name: 'Редактор каталога', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Добавить', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Новая группа');
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).nth(1).click();
    await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Тестовый сервис');
    await page.getByRole('textbox', { name: 'Описание', exact: true }).fill('Тестовое описание');
    await page.getByRole('spinbutton', { name: 'Цена, ₽', exact: true }).fill('120');
    await page.getByRole('spinbutton', { name: 'В наличии', exact: true }).fill('3');
    await page.getByRole('combobox', { name: 'Группа', exact: true }).selectOption({ label: 'Новая группа' });
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await page.getByRole('button', { name: 'Всё сохранено', exact: true }).waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Экспорт JSON', exact: true }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(exported.groups.length, 13); assert.equal(exported.products.length, 52);
    await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":7}') });
    await expect(page.getByRole('alert')).toContainText('Неверный формат');
    exported.products.find(p => p.title === 'Тестовый сервис').title = 'Импортированный сервис';
    await page.locator('input[type=file]').setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
    await page.getByRole('button', { name: 'Всё сохранено', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Маркет', exact: true }).click();
    await page.getByRole('textbox', { name: 'Поиск по товарам' }).fill('Импортированный');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Подробнее: Импортированный сервис', exact: true }).click();
    await expect(page.locator('.description')).toHaveText('Тестовое описание');
  });
  await check('Claude referral falls back to catalog when group is hidden', async () => {
    await page.goto(baseURL + '/?ref=klod');
    await page.getByRole('heading', { name: 'Каталог', exact: true }).waitFor();
    await theme('claude');
  });
  const referral = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const refPage = await referral.newPage();
  await check('referral locks Claude on catalog, other categories, cart and profile', async () => {
    await refPage.goto(baseURL + '/?ref=klod'); await refPage.getByRole('heading', { name: 'Claude', exact: true }).waitFor();
    for (const route of ['/catalog', '/group/mail', '/product/cdek-id', '/cart', '/profile', '/orders', '/help']) {
      await refPage.goto(baseURL + '/?ref=klod#' + route);
      await refPage.waitForFunction(() => document.documentElement.dataset.theme === 'claude');
      assert.equal(await refPage.locator('html').getAttribute('data-theme'), 'claude');
    }
    await refPage.goto(baseURL + '/?tgWebAppStartParam=klod#/group/mail'); await refPage.getByRole('heading', { name: 'Почта', exact: true }).waitFor();
    assert.equal(await refPage.locator('html').getAttribute('data-theme'), 'claude');
  });
  await check('320px, 440px and desktop do not overflow', async () => {
    const widths = [320, 440, 1280];
    for (const width of widths) {
      await refPage.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
      await refPage.goto(baseURL + '/#/catalog'); await refPage.getByRole('heading', { name: 'Каталог', exact: true }).waitFor();
      assert.ok(await refPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      await refPage.screenshot({ path: `qa/market-${width}.png` });
    }
  });
  await check('fixed frame: same height across content, internal scroll, contained navigation and sheets', async () => {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1280, height: 1000 }, { width: 1280, height: 420 }, { width: 390, height: 844 }]) {
      await refPage.setViewportSize(viewport);
      await refPage.goto(baseURL + '/#/catalog'); await refPage.getByRole('heading', { name: 'Каталог', exact: true }).waitFor();
      const frame = await refPage.locator('.app-frame').boundingBox();
      assert.ok(frame && frame.y >= 0 && frame.y + frame.height <= viewport.height + 1, 'frame must fit viewport');
      assert.ok(await refPage.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'document must not scroll');
      const navBefore = await refPage.locator('.bottom-nav').boundingBox();
      await refPage.locator('.app-scroll').evaluate(el => el.scrollTop = el.scrollHeight);
      assert.ok(await refPage.locator('.app-scroll').evaluate(el => el.scrollTop > 0), 'catalog must scroll internally');
      const navAfter = await refPage.locator('.bottom-nav').boundingBox();
      assert.deepEqual(navAfter, navBefore, 'navigation must stay in place during scroll');
      assert.ok(navAfter.y + navAfter.height <= frame.y + frame.height, 'navigation must stay inside frame');
      await refPage.getByRole('button', { name: 'Заказы', exact: true }).click();
      await refPage.getByRole('heading', { name: 'Мои заказы', exact: true }).waitFor();
      assert.equal((await refPage.locator('.app-frame').boundingBox()).height, frame.height, 'short and long screens must have the same frame height');
      assert.equal(await refPage.locator('.app-scroll').evaluate(el => el.scrollTop), 0, 'navigation resets internal scroll');
      await refPage.getByRole('button', { name: 'Маркет', exact: true }).click();
      await refPage.getByRole('button', { name: 'Фильтры', exact: true }).click();
      const scrim = await refPage.locator('.sheet-scrim').boundingBox();
      assert.deepEqual(scrim, frame, 'sheet overlay must cover exactly the frame');
      await refPage.screenshot({ path: `qa/frame-filter-${viewport.width}x${viewport.height}.png` });
      await refPage.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await refPage.screenshot({ path: `qa/frame-${viewport.width}x${viewport.height}.png` });
    }
  });
  await check('dark/light palettes, persisted switch, independent Claude branding and system appearance', async () => {
    const appearanceContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'reduce' });
    const appearancePage = await appearanceContext.newPage();
    await appearancePage.goto(baseURL);
    await expect(appearancePage.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(appearancePage).toHaveTitle('фиКУС · Маркет');
    await appearancePage.getByRole('heading', { name: 'Каталог', exact: true }).waitFor();
    await expect(appearancePage.getByRole('button', { name: 'фиКУС — на главную', exact: true })).toBeVisible();
    assert.equal(await appearancePage.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--accent').trim()), '#d1fe17');
    for (const mode of ['dark', 'light']) {
      if (mode === 'light') await appearancePage.getByRole('button', { name: 'Включить светлую тему', exact: true }).click();
      await expect(appearancePage.locator('html')).toHaveAttribute('data-mode', mode);
      await appearancePage.screenshot({ path: `qa/palette-${mode}.png` });
      await appearancePage.getByRole('button', { name: 'Знакомься, Claude' }).click();
      await expect(appearancePage.locator('html')).toHaveAttribute('data-theme', 'claude');
      await expect(appearancePage.locator('html')).toHaveAttribute('data-mode', mode);
      const official = mode === 'dark'
        ? { '--bg': '#141413', '--surface': '#1a1918', '--accent': '#c46849', '--ink': '#faf9f5', '--primary': '#faf9f5' }
        : { '--bg': '#faf9f5', '--surface': '#fff', '--accent': '#d97757', '--ink': '#141413', '--primary': '#141413' };
      for (const [token, expected] of Object.entries(official)) {
        assert.equal(await appearancePage.locator('html').evaluate((el, key) => getComputedStyle(el).getPropertyValue(key).trim(), token), expected, `${mode} Claude ${token}`);
      }
      await expect(appearancePage.locator('meta[name="theme-color"]')).toHaveAttribute('content', official['--bg']);
      await appearancePage.screenshot({ path: `qa/palette-claude-${mode}.png` });
      await appearancePage.getByRole('button', { name: 'Маркет', exact: true }).click();
      await expect(appearancePage.locator('html')).toHaveAttribute('data-theme', 'fikus');
    }
    await appearancePage.reload();
    await expect(appearancePage.locator('html')).toHaveAttribute('data-mode', 'light');
    await appearancePage.goto(baseURL + '/?ref=klod#/profile');
    await appearancePage.getByRole('heading', { name: 'Профиль', exact: true }).waitFor();
    await appearancePage.getByRole('button', { name: 'Тёмная', exact: true }).click();
    await expect(appearancePage.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(appearancePage.locator('html')).toHaveAttribute('data-theme', 'claude');
    await appearancePage.getByRole('button', { name: 'Как в системе', exact: true }).click();
    await expect(appearancePage.locator('html')).toHaveAttribute('data-mode', 'light');
    await appearancePage.emulateMedia({ colorScheme: 'dark' });
    await expect(appearancePage.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(appearancePage.locator('html')).toHaveAttribute('data-theme', 'claude');
    await appearanceContext.close();
  });
  assert.deepEqual(errors, []);
  await writeFile('qa/result.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, pageErrors: errors }, null, 2));
  console.log(`${checks.length} browser checks passed`);
} finally { await browser.close(); }
