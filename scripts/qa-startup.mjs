import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../server/index.mjs';
const botToken = 'isolated-startup-test-token';
function proof(user, startParam = '') {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user), ...(startParam ? {start_param: startParam} : {}) });
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  p.set('hash', createHmac('sha256', secret).update([...p].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex'));
  return p.toString();
}
const {server} = await createApp({ dbPath: ':memory:', gatewayWorker: false, env: { NODE_ENV: 'production', BOT_TOKEN: botToken, GATEWAY_BOT_TOKEN: '', SELLER_TELEGRAM_USERNAME: '', ADMIN_TELEGRAM_IDS: '' } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {}) });
const errors = [], checks = [];
await mkdir('qa/startup', {recursive: true});
let serial = 0;
async function buyer(storage = {}, startParam = '') {
  const user = {id: 810000 + serial++, first_name: 'Покупатель', language_code: 'ru'};
  const signed = proof(user, startParam);
  const context = await browser.newContext({ viewport: {width: 390, height: 844}, colorScheme: 'dark', reducedMotion: 'reduce' });
  await context.route('https://telegram.org/**', r => r.fulfill({contentType: 'text/javascript', body: ''}));
  await context.addInitScript(({storage, user, signed, startParam}) => {
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    window.Telegram = {WebApp: {initData: signed, initDataUnsafe: {user, start_param: startParam}, colorScheme: 'dark', ready() {}, expand() {}, setHeaderColor(color) { window.lastTelegramHeaderColor = color; }, setBackgroundColor(color) {window.lastTelegramBackgroundColor = color;}, onEvent() {}, offEvent() {}, BackButton: {show() {}, hide() {}, onClick() {}, offClick() {}}, HapticFeedback: {impactOccurred() {}}}};
    window.startupModes = [];
    new MutationObserver(records => {for (const r of records) if (r.target.nodeName === 'HTML' && r.attributeName === 'data-mode') window.startupModes.push(r.target.getAttribute('data-mode'));}).observe(document, {attributes: true, subtree: true, attributeFilter: ['data-mode']});
  }, {storage, user, signed, startParam});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const fragment = '#tgWebAppData=' + encodeURIComponent(signed) + '&tgWebAppVersion=9.2&tgWebAppPlatform=android&tgWebAppThemeParams=' + encodeURIComponent(JSON.stringify({bg_color: '#17212b', text_color: '#ffffff'}));
  return {context, page, url: base + '/' + fragment};
}
async function catalog(page, mode = 'light') {
  await expect(page.locator('.app-frame')).toHaveAttribute('data-page', 'catalog');
  await expect(page.locator('.product-card').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
  await expect(page.getByText('Эта страница потерялась', {exact: true})).toHaveCount(0);
}
try {
  for (const [name, storage] of [
    ['fresh-dark-Telegram', {}],
    ['legacy-dark-choice', {'fikus:appearance': '"dark"'}],
    ['legacy-auto-and-cached-dark-default', {'fikus:appearance': '"auto"', 'fikus:shop-default-appearance': '"dark"'}],
    ['malformed-current-choice', {'fikus:appearance-v2': '{broken'}],
  ]) {
    const {context, page, url} = await buyer(storage);
    await page.goto(url); await catalog(page);
    assert.ok(!(await page.evaluate(() => window.startupModes)).includes('dark'), name + ': dark flash');
    assert.equal(await page.evaluate(() => window.lastTelegramHeaderColor), '#f4f5f1');
    await page.screenshot({path: `qa/startup/${name}.png`, fullPage: true});
    checks.push(name); await context.close();
  }
  const {context, page, url} = await buyer();
  await page.goto(url); await catalog(page);
  await page.getByRole('button', {name: 'Включить тёмную тему', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.reload(); await catalog(page, 'dark');
  await page.getByRole('button', {name: 'Включить светлую тему', exact: true}).click();
  await page.reload(); await catalog(page);
  checks.push('manual choices survive reload without changing initial light default');
  await page.getByRole('button', {name: 'Профиль', exact: true}).first().click();
  await expect(page.getByRole('heading', {name: 'Профиль', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Как в системе', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.reload(); await expect(page.getByRole('heading', {name: 'Профиль', exact: true})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  checks.push('explicit app routes and intentional system appearance remain available');
  await context.close();
  const product = await buyer({}, 'product__claude-pro');
  await product.page.goto(product.url);
  await expect(product.page.getByRole('heading', {name: 'Claude Pro', exact: true})).toBeVisible();
  await expect(product.page.locator('html')).toHaveAttribute('data-mode', 'light');
  checks.push('product referral is preserved with Telegram launch fragment');
  await product.context.close();
  const root = await buyer(); await root.page.goto(base + '/#/'); await catalog(root.page); await root.context.close();
  checks.push('empty root route opens catalog');
  assert.deepEqual(errors, []);
  await writeFile('qa/startup/result.json', JSON.stringify({checks, pageErrors: errors}, null, 2));
  console.log(`${checks.length} startup browser scenarios passed`);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
