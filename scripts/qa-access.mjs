import { chromium, expect } from '@playwright/test';
import { createServer as netServer } from 'node:net';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../server/index.mjs';
const botToken = 'isolated-access-test-token';
function proof(user) {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify(user),
    query_id: 'isolated-access-test',
  });
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  p.set(
    'hash',
    createHmac('sha256', secret)
      .update(
        [...p]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      )
      .digest('hex'),
  );
  return p.toString();
}
const probe = netServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = 'http://127.0.0.1:' + port;
const { server, db } = await createApp({
  dbPath: ':memory:',
  env: {
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: base,
    BOT_TOKEN: botToken,
    ADMIN_TELEGRAM_IDS: '',
    SELLER_TELEGRAM_USERNAME: 'fixture_seller',
    ADMIN_PASSWORD: 'must-never-work-in-production',
  },
});
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
async function context(user, displayUser = user) {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  await c.route('https://telegram.org/**', (r) => r.fulfill({ body: '' }));
  if (user)
    await c.addInitScript(
      ({ signed, displayUser }) => {
        window.Telegram = {
          WebApp: {
            initData: signed,
            initDataUnsafe: { user: displayUser },
            ready() {},
            expand() {},
            setHeaderColor() {},
            setBackgroundColor() {},
            onEvent() {},
            offEvent() {},
            BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
            HapticFeedback: { impactOccurred() {} },
          },
        };
      },
      { signed: proof(user), displayUser },
    );
  return c;
}
const ownerContext = await context({
    id: 700100,
    username: 'Fixture_Seller',
    first_name: 'Владелец',
  }),
  buyerContext = await context({ id: 800100, username: 'Fixture_Buyer', first_name: 'Покупатель' }),
  guestContext = await context();
const owner = await ownerContext.newPage(),
  buyer = await buyerContext.newPage(),
  guest = await guestContext.newPage();
const errors = [],
  checks = [];
for (const p of [owner, buyer, guest]) p.on('pageerror', (e) => errors.push(e.message));
await mkdir('qa/access', { recursive: true });
const nav = (name) =>
  owner
    .getByRole('navigation', { name: 'Разделы админки' })
    .getByRole('button', { name, exact: false });
async function check(name, run) {
  await run();
  checks.push(name);
  console.log('PASS', name);
}
try {
  await check(
    'customer profile hides administration and all local-preview copy; direct admin URL does not open the panel',
    async () => {
      await buyer.goto(base + '/#/profile');
      await expect(buyer.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible();
      await expect(
        buyer.getByRole('button', { name: 'Панель администратора', exact: true }),
      ).toHaveCount(0);
      await expect(buyer.getByText('Управление магазином', { exact: true })).toHaveCount(0);
      assert.doesNotMatch(
        await buyer.locator('body').innerText(),
        /локальный предпросмотр|режим предпросмотра|учёт средств ещё не подключён/i,
      );
      await buyer.goto(base + '/#/admin');
      await expect(buyer.getByRole('heading', { name: 'Здесь пока ничего нет.' })).toBeVisible();
      await expect(buyer.getByLabel('Пароль администратора')).toHaveCount(0);
      await buyer.goto(base + '/#/product/claude-pro');
      await expect(buyer.getByRole('heading', { name: 'Claude Pro', exact: true })).toBeVisible();
      await expect(buyer.locator('.product-demo-note')).toHaveCount(0);
      assert.doesNotMatch(await buyer.locator('body').innerText(), /локальный предпросмотр/i);
    },
  );
  await check(
    'seller is identified from signed username and enters administration without a password',
    async () => {
      await owner.goto(base + '/#/profile');
      await expect(
        owner.getByRole('button', { name: 'Панель администратора', exact: true }),
      ).toBeVisible();
      await owner.getByRole('button', { name: 'Панель администратора', exact: true }).click();
      await expect(owner.getByRole('heading', { name: 'Всё под контролем.' })).toBeVisible();
      await expect(owner.getByLabel('Пароль администратора')).toHaveCount(0);
      assert.equal(
        db.prepare('SELECT telegram_id FROM seller_bindings').get().telegram_id,
        '700100',
      );
    },
  );
  await check(
    'moderation stays enabled and demo figures stay inside labelled administrator preview',
    async () => {
      assert.equal(
        JSON.parse(db.prepare('SELECT settings FROM state').get().settings).moderateReviews,
        true,
      );
      const before = db.prepare('SELECT catalog FROM state').get().catalog;
      await nav('Товары').click();
      await owner.getByRole('button', { name: 'Демопоказатели' }).click();
      const dialog = owner.getByRole('dialog', { name: 'Демопредпросмотр показателей' });
      await expect(dialog).toContainText('Демонстрационные данные');
      await expect(dialog.locator('tbody tr')).toHaveCount(53);
      await owner.getByRole('button', { name: 'Закрыть редактор' }).click();
      assert.equal(db.prepare('SELECT catalog FROM state').get().catalog, before);
      assert.equal(db.prepare('SELECT count(*) AS n FROM reviews').get().n, 0);
    },
  );
  await check(
    'blacklisted usernames receive maintenance instead of product data; one click restores access',
    async () => {
      await nav('Чёрный список').click();
      await owner.getByLabel('Username или Telegram ID', { exact: true }).fill('@FIXTURE_BUYER');
      await owner.getByLabel('Заметка для себя', { exact: true }).fill('Скрытая заметка');
      await owner.getByRole('button', { name: 'Добавить', exact: true }).click();
      await expect(owner.getByRole('switch', { name: 'Блокировать fixture_buyer' })).toBeVisible();
      await buyer.reload();
      await expect(buyer.getByText('ТЕХНИЧЕСКИЕ РАБОТЫ', { exact: true })).toBeVisible();
      await expect(buyer.locator('.product-card')).toHaveCount(0);
      await expect(buyer.getByRole('heading', { name: 'Claude Pro', exact: true })).toHaveCount(0);
      assert.doesNotMatch(
        await buyer.locator('body').innerText(),
        /чёрный список|Скрытая заметка/i,
      );
      await buyer.screenshot({ path: 'qa/access/maintenance-mobile.png', fullPage: true });
      await owner.getByRole('switch', { name: 'Блокировать fixture_buyer' }).click();
      await expect(
        owner.getByRole('switch', { name: 'Блокировать fixture_buyer' }),
      ).toHaveAttribute('aria-checked', 'false');
      await buyer.reload();
      await expect(buyer.getByRole('heading', { name: 'Claude Pro', exact: true })).toBeVisible();
    },
  );
  await check(
    'Telegram ID blacklist survives username changes; guest cannot bypass by clearing cookies',
    async () => {
      await owner.getByLabel('Username или Telegram ID', { exact: true }).fill('800100');
      await owner.getByRole('button', { name: 'Добавить', exact: true }).click();
      await expect(owner.getByRole('switch', { name: 'Блокировать 800100' })).toBeVisible();
      const renamed = await context({
          id: 800100,
          username: 'Changed_Buyer',
          first_name: 'Покупатель',
        }),
        page = await renamed.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + '/#/catalog');
      await expect(page.getByText('ТЕХНИЧЕСКИЕ РАБОТЫ', { exact: true })).toBeVisible();
      await renamed.close();
      await guest.goto(base + '/#/catalog');
      await expect(guest.getByRole('heading', { name: 'Встретимся в Telegram.' })).toBeVisible();
      await expect(guest.locator('.product-card')).toHaveCount(0);
    },
  );
  await check('unsigned display username does not grant seller rights', async () => {
    const spoofed = await context(
        { id: 800200, username: 'ordinary_buyer', first_name: 'Покупатель' },
        { id: 700100, username: 'Fixture_Seller', first_name: 'Владелец' },
      ),
      page = await spoofed.newPage();
    await page.goto(base + '/#/profile');
    await expect(page.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Панель администратора', exact: true }),
    ).toHaveCount(0);
    await page.goto(base + '/#/admin');
    await expect(page.getByRole('heading', { name: 'Здесь пока ничего нет.' })).toBeVisible();
    await spoofed.close();
  });
  assert.deepEqual(errors, []);
  await writeFile('qa/access/result.json', JSON.stringify({ checks, pageErrors: errors }, null, 2));
  console.log(`${checks.length} access scenarios passed`);
} catch (e) {
  await owner.screenshot({ path: 'qa/access/failure-owner.png', fullPage: true });
  await buyer.screenshot({ path: 'qa/access/failure-buyer.png', fullPage: true });
  throw e;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
