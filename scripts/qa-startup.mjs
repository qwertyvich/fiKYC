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
const {server,db} = await createApp({ dbPath: ':memory:', gatewayWorker: false, env: { NODE_ENV: 'production', BOT_TOKEN: botToken, GATEWAY_BOT_TOKEN: '', SELLER_TELEGRAM_USERNAME: '', ADMIN_TELEGRAM_IDS: '' } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {}) });
const errors = [], checks = [];
await mkdir('qa/startup', {recursive: true});
let serial = 0;
async function buyer(storage = {}, startParam = '', preferences = {}) {
  const user = {id: 810000 + serial++, first_name: 'Покупатель', language_code: preferences.language ?? 'ru'};
  const signed = proof(user, startParam);
  const context = await browser.newContext({ viewport: {width: 390, height: 844}, colorScheme: preferences.system ?? 'dark', locale:preferences.locale ?? 'ru-RU', reducedMotion: 'reduce' });
  await context.route('https://telegram.org/**', r => r.fulfill({contentType: 'text/javascript', body: ''}));
  await context.addInitScript(({storage, user, signed, startParam, scheme, blockedStorage}) => {
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    if(blockedStorage)Object.defineProperty(window,'localStorage',{get(){throw Error('Storage blocked');}});
    const events = {}; window.telegramPreferenceEvents=events;
    window.Telegram = {WebApp: {initData: signed, initDataUnsafe: {user, start_param: startParam}, colorScheme: scheme, ready() {}, expand() {}, setHeaderColor(color) { window.lastTelegramHeaderColor = color; }, setBackgroundColor(color) {window.lastTelegramBackgroundColor = color;}, onEvent(name,cb) {(events[name]??=new Set()).add(cb);}, offEvent(name,cb) {events[name]?.delete(cb);}, BackButton: {show() {}, hide() {}, onClick() {}, offClick() {}}, HapticFeedback: {impactOccurred() {}}}};
    window.startupModes = [];
    new MutationObserver(records => {for (const r of records) if (r.target.nodeName === 'HTML' && r.attributeName === 'data-mode') window.startupModes.push(r.target.getAttribute('data-mode'));}).observe(document, {attributes: true, subtree: true, attributeFilter: ['data-mode']});
  }, {storage, user, signed, startParam,scheme:preferences.scheme ?? 'dark',blockedStorage:preferences.blockedStorage});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const fragment = '#tgWebAppData=' + encodeURIComponent(signed) + '&tgWebAppVersion=9.2&tgWebAppPlatform=android&tgWebAppThemeParams=' + encodeURIComponent(JSON.stringify({bg_color: preferences.scheme==='light'?'#ffffff':'#17212b', text_color: '#ffffff'}));
  return {context, page, url: base + '/' + fragment};
}
async function catalog(page, mode = 'dark') {
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
    assert.ok(!(await page.evaluate(() => window.startupModes)).includes('light'), name + ': white flash');
    assert.equal(await page.evaluate(() => window.lastTelegramHeaderColor), '#131517');
    await page.screenshot({path: `qa/startup/${name}.png`, fullPage: true});
    checks.push(name); await context.close();
  }
  const light=await buyer({},'',{scheme:'light',system:'dark'});await light.page.goto(light.url);await catalog(light.page,'light');
  checks.push('light Telegram overrides dark device appearance');await light.context.close();
  const dark=await buyer({},'',{scheme:'dark',system:'light',blockedStorage:true});await dark.page.goto(dark.url);await catalog(dark.page,'dark');
  assert.ok(!(await dark.page.evaluate(()=>window.startupModes)).includes('light'));checks.push('dark Telegram overrides light device with blocked storage and no white flash');await dark.context.close();
  const chinese=await buyer({},'',{scheme:'dark',system:'light',language:'zh-Hans'});
  let loadingRoute;const loadingSeen=new Promise(resolve=>chinese.context.route('**/api/access',r=>{loadingRoute=r;resolve();}));
  await chinese.page.goto(chinese.url);await loadingSeen;await expect(chinese.page.getByRole('status')).toHaveText('加载中');await expect(chinese.page.locator('html')).toHaveAttribute('lang','zh');await expect(chinese.page.locator('html')).toHaveAttribute('data-mode','dark');
  await chinese.page.screenshot({path:'qa/startup/chinese-dark-loading.png'});await loadingRoute.continue();await catalog(chinese.page,'dark');
  await chinese.page.screenshot({path:'qa/startup/chinese-dark-catalog.png'});await chinese.context.close();checks.push('Chinese Telegram automatically localizes both loading and catalog');
  const early=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light'});
  let sdkRoute;const sdkSeen=new Promise(resolve=>early.route('https://telegram.org/**',r=>{sdkRoute=r;resolve();}));
  const earlyPage=await early.newPage(),user={id:895555,first_name:'Fixture',language_code:'zh'},signed=proof(user);
  const earlyUrl=base+'/#tgWebAppData='+encodeURIComponent(signed)+'&tgWebAppThemeParams='+encodeURIComponent(JSON.stringify({bg_color:'#17212b'}));
  const navigation=earlyPage.goto(earlyUrl);await sdkSeen;
  await expect(earlyPage.locator('html')).toHaveAttribute('data-mode','dark');await expect(earlyPage.locator('html')).toHaveCSS('background-color','rgb(19, 21, 23)');
  await sdkRoute.fulfill({contentType:'text/javascript',body:`window.Telegram={WebApp:{initData:${JSON.stringify(signed)},initDataUnsafe:{user:${JSON.stringify(user)}},colorScheme:'dark',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},offEvent(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}}}};`});
  await navigation;await catalog(earlyPage,'dark');await early.close();checks.push('dark launch background applies before a delayed Telegram SDK loads');
  const {context, page, url} = await buyer();
  await page.goto(url); await catalog(page);
  await page.getByRole('button', {name: 'Включить светлую тему', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await page.reload(); await catalog(page, 'light');
  await page.getByRole('button', {name: 'Включить тёмную тему', exact: true}).click();
  await page.reload(); await catalog(page, 'dark');
  checks.push('manual choices survive reload while Telegram is the default');
  await page.getByRole('button', {name: 'Профиль', exact: true}).first().click();
  await expect(page.getByRole('heading', {name: 'Профиль', exact: true})).toBeVisible();
  await page.getByRole('group', {name:'Тема оформления'}).getByRole('button', {name: 'Как в Telegram', exact: true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.reload(); await expect(page.getByRole('heading', {name: 'Профиль', exact: true})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  checks.push('explicit app routes and intentional system appearance remain available');
  await page.evaluate(()=>{window.Telegram.WebApp.colorScheme='light';for(const cb of window.telegramPreferenceEvents.themeChanged??[])cb();});
  await expect(page.locator('html')).toHaveAttribute('data-mode','light');
  await page.getByRole('group',{name:'Тема оформления'}).getByRole('button',{name:'Тёмная',exact:true}).click();
  await page.evaluate(()=>{window.Telegram.WebApp.colorScheme='light';for(const cb of window.telegramPreferenceEvents.themeChanged??[])cb();});await expect(page.locator('html')).toHaveAttribute('data-mode','dark');
  await page.getByRole('group',{name:'Тема оформления'}).getByRole('button',{name:'Как в Telegram',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-mode','light');
  await page.evaluate(()=>{window.Telegram.WebApp.initDataUnsafe.user.language_code='zh';for(const cb of window.telegramPreferenceEvents.activated??[])cb();});await expect(page.locator('html')).toHaveAttribute('lang','zh');
  checks.push('live Telegram theme and language changes apply in auto mode, while manual appearance wins');

  await context.close();
  const product = await buyer({}, 'product__claude-pro');
  await product.page.goto(product.url);
  await expect(product.page.getByRole('heading', {name: 'Claude Pro', exact: true})).toBeVisible();
  await expect(product.page.locator('html')).toHaveAttribute('data-mode', 'dark');
  checks.push('product referral is preserved with Telegram launch fragment');
  await product.context.close();
  db.prepare("INSERT INTO links(id,token,product_id,label,active,created_at,target_kind,group_id) VALUES('section-fixture','section-code','','Почтовые сервисы',1,?,'group','mail')").run(Date.now());
  db.prepare("INSERT INTO links(id,token,product_id,label,active,created_at) VALUES('product-fixture','product-code','claude-pro','Товар',1,?)").run(Date.now());
  const section = await buyer({}, 'g_section-code');await section.page.goto(section.url);
  await expect(section.page.getByRole('heading',{name:'Почтовые сервисы',exact:true})).toBeVisible();await expect(section.page.locator('.product-card')).toHaveCount(4);await expect(section.page.getByRole('button',{name:'Подробнее: СДЭК ID',exact:true})).toBeVisible();await expect(section.page.getByRole('button',{name:'Подробнее: Почта России',exact:true})).toBeVisible();await expect(section.page.locator('html')).toHaveAttribute('data-mode','dark');
  await section.page.screenshot({path:'qa/startup/section-link.png',fullPage:true});await section.context.close();checks.push('opaque section link opens postal services through signed Telegram launch');
  const opaque = await buyer({}, 'p_product-code');await opaque.page.goto(opaque.url);await expect(opaque.page.getByRole('heading',{name:'Claude Pro',exact:true})).toBeVisible();await opaque.context.close();checks.push('existing opaque product links still open products');
  db.prepare("UPDATE links SET active=0 WHERE id='section-fixture'").run();const revoked=await buyer({}, 'g_section-code');await revoked.page.goto(revoked.url);await expect(revoked.page.getByRole('heading',{name:'Ссылка недоступна',exact:true})).toBeVisible();await expect(revoked.page.locator('.product-card')).toHaveCount(0);await revoked.context.close();checks.push('disabled section link does not expose the category');
  const root = await buyer(); await root.page.goto(base + '/#/'); await catalog(root.page); await root.context.close();
  checks.push('empty root route opens catalog');
  assert.deepEqual(errors, []);
  await writeFile('qa/startup/result.json', JSON.stringify({checks, pageErrors: errors}, null, 2));
  console.log(`${checks.length} startup browser scenarios passed`);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
