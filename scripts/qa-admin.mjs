import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../server/index.mjs';
const password = 'isolated-browser-qa-password';
const { server, db } = await createApp({
  dbPath: ':memory:',
  env: { ADMIN_PASSWORD: password, NODE_ENV: 'test', BOT_TOKEN: '', ADMIN_TELEGRAM_IDS: '' },
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const adminContext = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: 'reduce',
});
const buyerContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const otherContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
for (const context of [adminContext, buyerContext, otherContext])
  await context.route('https://telegram.org/**', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: '' }),
  );
const admin = await adminContext.newPage(),
  buyer = await buyerContext.newPage(),
  other = await otherContext.newPage();
const errors = [],
  checks = [];
for (const page of [admin, buyer, other]) page.on('pageerror', (e) => errors.push(e.message));
await mkdir('qa/admin', { recursive: true });
async function check(name, run) {
  await run();
  checks.push(name);
  console.log('PASS', name);
}
const nav = (label) =>
  admin
    .getByRole('navigation', { name: 'Разделы админки' })
    .getByRole('button', { name: label, exact: false });
const card = (title) =>
  buyer
    .locator('.product-card')
    .filter({ has: buyer.getByRole('button', { name: title, exact: true }) });
try {
  await check('admin login protects catalog editing and opens the workspace', async () => {
    await admin.goto(base + '/#/admin');
    await expect(admin.getByLabel('Пароль администратора')).toBeVisible();
    await admin.getByLabel('Пароль администратора').fill(password);
    await admin.getByRole('button', { name: 'Войти в панель', exact: true }).click();
    await expect(admin.getByRole('heading', { name: 'Всё под контролем.' })).toBeVisible();
    await expect(admin.locator('.a-metric')).toHaveCount(4);
    assert.equal((await buyer.request.get(base + '/api/admin/state')).status(), 401);
  });
  await check('product price and description save to the server and another browser', async () => {
    await nav('Товары').click();
    await admin.getByRole('button', { name: 'Редактировать Claude Pro', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Настройки товара' });
    await dialog.getByLabel('Цена', { exact: true }).fill('2100');
    await dialog
      .getByLabel('Короткое описание', { exact: true })
      .fill('Подписка · проверка общей базы');
    await dialog.getByRole('button', { name: 'Сохранить товар', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await buyer.goto(base + '/#/catalog');
    await expect(card('Claude Pro')).toContainText('2 100 ₽');
    await expect(card('Claude Pro')).toContainText('проверка общей базы');
  });
  await check(
    'one-click hiding removes the product from catalog and direct routes; showing restores it',
    async () => {
      const toggle = admin.getByRole('switch', { name: 'Показывать Claude Pro', exact: true });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await buyer.reload();
      await expect(card('Claude Pro')).toHaveCount(0);
      await buyer.goto(base + '/#/product/claude-pro');
      await expect(buyer.getByRole('heading', { name: 'Предложение недоступно' })).toBeVisible();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await buyer.reload();
      await expect(buyer.getByRole('heading', { name: 'Claude Pro', exact: true })).toBeVisible();
    },
  );
  await check(
    'feed arrows persist global product order; duplicate opens an independent hidden draft',
    async () => {
      await admin.getByRole('button', { name: 'Поднять Claude Pro', exact: true }).click();
      await expect.poll(() => db.prepare('SELECT catalog FROM state').get()).toBeTruthy();
      await expect
        .poll(() =>
          JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog).productOrder?.indexOf(
            'claude-pro',
          ),
        )
        .toBe(1);
      await buyer.goto(base + '/#/catalog');
      await expect(buyer.locator('.product-card').nth(1)).toContainText('Claude Pro');
      await admin.getByRole('button', { name: 'Дублировать Claude Pro', exact: true }).click();
      await expect(admin.getByRole('dialog')).toContainText('Новый товар');
      await expect(admin.getByLabel('Название', { exact: true })).toHaveValue('Claude Pro · копия');
      await expect(
        admin.getByRole('switch', { name: 'Показывать товар', exact: true }),
      ).toHaveAttribute('aria-checked', 'false');
      await admin.getByRole('button', { name: 'Закрыть редактор' }).click();
    },
  );
  await check(
    'global settings configure bot links, announcements and storefront theme',
    async () => {
      await nav('Настройки').click();
      await admin.getByLabel('@username бота', { exact: false }).fill('fixture_shop_bot');
      await admin.getByLabel('Текст объявления').fill('Работаем каждый день · тестовая проверка');
      await admin.getByRole('switch', { name: 'Показывать объявление' }).click();
      await admin.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
      await expect(admin.getByText('Настройки сохранены', { exact: true })).toBeVisible();
      await buyer.reload();
      await expect(buyer.locator('.store-announcement')).toContainText('Работаем каждый день');
    },
  );
  let link;
  await check(
    'links are generated only by admin, open the correct product and can be revoked',
    async () => {
      await nav('Прямые ссылки').click();
      await admin.getByLabel('Товар для ссылки').selectOption('claude-pro');
      await admin.getByLabel('Название / источник').fill('Тестовый канал');
      await admin.getByRole('button', { name: 'Создать ссылку', exact: true }).click();
      await expect(admin.locator('.a-link-card')).toHaveCount(1);
      link = db.prepare('SELECT * FROM links').get();
      assert.match(
        await admin.locator('.a-url').innerText(),
        /t.me\/fixture_shop_bot\?startapp=p_/,
      );
      assert.equal((await buyer.request.get(base + '/api/admin/links')).status(), 401);
      await buyer.goto(base + '/?tgWebAppStartParam=p_' + link.token);
      await expect(buyer.getByRole('heading', { name: 'Claude Pro', exact: true })).toBeVisible();
      await admin.getByRole('switch', { name: 'Включить ссылку Тестовый канал' }).click();
      await expect(
        admin.getByRole('switch', { name: 'Включить ссылку Тестовый канал' }),
      ).toHaveAttribute('aria-checked', 'false');
      await other.goto(base + '/?tgWebAppStartParam=p_' + link.token);
      await expect(other.getByRole('heading', { name: 'Предложение недоступно' })).toBeVisible();
    },
  );
  await check(
    'reviews are shared and moderated; shop replies are visible in another browser',
    async () => {
      await buyer.goto(base + '/#/product/claude-pro');
      await buyer.getByRole('button', { name: 'Оставить отзыв', exact: true }).click();
      await buyer.getByLabel('Ваше имя').fill('Тестовый покупатель');
      await buyer
        .getByLabel('Ваш отзыв', { exact: true })
        .fill('Всё получилось, спасибо за помощь.');
      await buyer.getByRole('radio', { name: '5 из 5' }).check();
      await buyer.getByRole('button', { name: 'Сохранить отзыв', exact: true }).click();
      await expect(buyer.getByRole('status')).toContainText('на проверку');
      await other.goto(base + '/#/product/claude-pro');
      await expect(other.locator('.review-card')).toHaveCount(0);
      await nav('Отзывы').click();
      await expect(admin.locator('.a-review-card')).toHaveCount(1);
      await admin.getByRole('button', { name: 'Опубликовать', exact: true }).click();
      await admin.getByRole('button', { name: /Опубликованы/ }).click();
      await expect(admin.locator('.a-review-card')).toHaveCount(1);
      await admin.getByRole('button', { name: 'Ответить', exact: true }).click();
      await admin.getByLabel('Ответ магазина', { exact: true }).fill('Спасибо за обратную связь!');
      await admin.getByRole('button', { name: 'Сохранить ответ' }).click();
      await expect(admin.getByRole('dialog')).toHaveCount(0);
      await other.reload();
      await expect(other.locator('.review-card')).toContainText('Всё получилось');
      await expect(other.locator('.review-reply')).toContainText('Спасибо за обратную связь');
    },
  );
  await check(
    'real catalog click, foreground dwell, cart and checkout actions reach shared analytics',
    async () => {
      await buyer.bringToFront();
      await buyer.goto(base + '/#/catalog');
      await card('Claude Pro')
        .getByRole('button', { name: 'Подробнее: Claude Pro', exact: true })
        .click();
      await expect(buyer.getByRole('heading', { name: 'Claude Pro', exact: true })).toBeVisible();
      await buyer.waitForTimeout(1500);
      await other.bringToFront();
      await expect
        .poll(
          () =>
            db
              .prepare(
                "SELECT coalesce(sum(duration_ms),0) AS n FROM events WHERE type='product_time'",
              )
              .get().n,
        )
        .toBeGreaterThan(0);
      await buyer.waitForTimeout(300);
      const beforeBackground = db
        .prepare("SELECT sum(duration_ms) AS n FROM events WHERE type='product_time'")
        .get().n;
      await buyer.waitForTimeout(1200);
      assert.equal(
        db.prepare("SELECT sum(duration_ms) AS n FROM events WHERE type='product_time'").get().n,
        beforeBackground,
        'background dwell must not accumulate',
      );
      await buyer.bringToFront();
      await buyer.getByRole('button', { name: 'В корзину', exact: true }).click();
      await buyer.getByRole('button', { name: /Корзина, 1 товаров/ }).click();
      await buyer.getByRole('button', { name: 'Перейти к оформлению', exact: true }).click();
      await expect(buyer.getByRole('heading', { name: 'Оформление заказа' })).toBeVisible();
      await expect
        .poll(() => db.prepare("SELECT count(*) AS n FROM events WHERE type='cart_add'").get().n, {
          timeout: 15000,
        })
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            db.prepare("SELECT sum(duration_ms) AS n FROM events WHERE type='product_time'").get()
              .n,
          { timeout: 15000 },
        )
        .toBeGreaterThan(0);
      await nav('Аналитика').click();
      await admin.getByRole('button', { name: 'Обновить аналитику' }).click();
      await expect
        .poll(async () => await admin.locator('.a-metric').nth(2).innerText())
        .toContain('1');
      await nav('Действия клиентов').click();
      await expect(admin.locator('.a-timeline')).toContainText('Добавил в корзину');
      await expect(admin.locator('.a-session')).not.toHaveCount(0);
    },
  );
  await check('admin preview never inflates customer metrics', async () => {
    const before = db.prepare("SELECT count(*) AS n FROM events WHERE type='cart_add'").get().n;
    const preview = await adminContext.newPage();
    await preview.goto(base + '/#/product/claude-pro');
    await preview.getByRole('button', { name: 'В корзину', exact: true }).click();
    await preview.waitForTimeout(5500);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM events WHERE type='cart_add'").get().n,
      before,
    );
    await preview.close();
  });
  await check(
    'dashboard, catalog, settings and login fit mobile and desktop in both themes',
    async () => {
      for (const width of [320, 390, 768, 1440]) {
        await admin.setViewportSize({ width, height: 1050 });
        for (const section of [
          'Обзор',
          'Товары',
          'Категории',
          'Отзывы',
          'Прямые ссылки',
          'Аналитика',
          'Действия клиентов',
          'Настройки',
        ]) {
          await nav(section).click();
          await expect(admin.locator('.a-page-heading h1')).toBeVisible();
          assert.ok(
            await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `overflow ${section} ${width}`,
          );
          assert.ok(
            await admin.evaluate(
              () =>
                document.documentElement.scrollHeight <=
                Math.max(innerHeight, document.querySelector('.admin-app').scrollHeight) + 2,
            ),
            `excess page height ${section} ${width}`,
          );
          if (width === 1440 && section === 'Обзор') {
            await admin.getByRole('button', { name: 'Обновить аналитику' }).click();
            await admin.screenshot({ path: 'qa/admin/overview-desktop.png', fullPage: true });
          }
          if (width === 390 && ['Обзор', 'Товары', 'Отзывы', 'Настройки'].includes(section))
            await admin.screenshot({
              path: `qa/admin/${section === 'Обзор' ? 'overview' : section === 'Товары' ? 'products' : section === 'Отзывы' ? 'reviews' : 'settings'}-mobile.png`,
              fullPage: true,
            });
        }
      }
      await nav('Обзор').click();
      await admin.getByRole('button', { name: 'Переключить тему панели' }).click();
      await expect(admin.locator('html')).toHaveAttribute('data-mode', 'dark');
      await admin.screenshot({ path: 'qa/admin/overview-dark.png', fullPage: true });
      assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    },
  );
  assert.deepEqual(errors, []);
  await writeFile('qa/admin/result.json', JSON.stringify({ checks, pageErrors: errors }, null, 2));
  console.log(`${checks.length} admin browser scenarios passed`);
} catch (error) {
  await admin.screenshot({ path: 'qa/admin/failure-admin.png', fullPage: true });
  await buyer.screenshot({ path: 'qa/admin/failure-buyer.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
