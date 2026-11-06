import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.QA_URL ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width:390, height:844 }, reducedMotion:'reduce' });
await context.route('https://telegram.org/**', route => route.abort());
await context.addInitScript(() => {
  const user = JSON.parse(sessionStorage.getItem('qa-user') ?? '{"id":101,"first_name":"Alex","language_code":"en-GB"}');
  window.Telegram = { WebApp: { initData:'qa', initDataUnsafe:{user}, colorScheme:'dark', ready(){}, expand(){}, setHeaderColor(){}, setBackgroundColor(){}, onEvent(){}, offEvent(){}, BackButton:{show(){},hide(){},onClick(){},offClick(){}} } };
});
const page = await context.newPage();
const errors = [], checks = [], untranslated = {};
page.on('pageerror', e => errors.push(e.message));
const selector = () => page.locator('#interface-language');
async function lang(value) { await expect(page.locator('html')).toHaveAttribute('lang',value); }
try {
  await page.goto(base+'/#/profile'); await lang('en');
  await expect(selector()).toHaveValue('auto');
  await expect(page.getByRole('heading',{name:'Profile',exact:true})).toBeVisible();
  checks.push('Telegram en-GB defaults to English');
  for (const language of ['ru','en','zh','fa']) {
    await selector().selectOption(language); await lang(language);
    await expect(page.locator('html')).toHaveAttribute('dir',language==='fa'?'rtl':'ltr');
    await page.reload(); await lang(language); await expect(selector()).toHaveValue(language);
    await selector().scrollIntoViewIfNeeded();
    await mkdir('previews/localization',{recursive:true});
    await page.screenshot({path:`previews/localization/settings-${language}.png`});
    checks.push(`${language}: switching, direction, persistence`);
  }
  await selector().selectOption('zh');
  await page.evaluate(()=>sessionStorage.setItem('qa-user',JSON.stringify({id:202,first_name:'Sara',language_code:'fa-IR'})));
  await page.reload(); await lang('fa'); await expect(selector()).toHaveValue('auto');
  await selector().selectOption('en');
  await page.evaluate(()=>sessionStorage.setItem('qa-user',JSON.stringify({id:101,first_name:'Alex',language_code:'en'})));
  await page.reload(); await lang('zh');
  checks.push('two Telegram IDs retain independent choices');
  await selector().selectOption('auto'); await lang('en');
  checks.push('automatic selection restores Telegram language');
  await page.goto(base+'/#/product/claude-pro');
  await page.getByRole('button',{name:'Add to cart',exact:true}).click();
  await page.goto(base+'/#/checkout');
  await page.locator('textarea:not([readonly])').fill('My comment — یادداشت — 我的备注');
  const cart = await page.evaluate(()=>localStorage.getItem('fikus:cart'));
  for (const language of ['en','zh','fa']) {
    await page.goto(base+'/#/profile'); await selector().selectOption(language);
    assert.equal(await page.evaluate(()=>localStorage.getItem('fikus:cart')),cart);
    for (const route of ['/catalog','/group/claude','/product/claude-pro','/product/foreign-topup','/cart','/checkout','/orders','/support/new']) {
      await page.goto(base+'/#'+route); await expect(page.locator('main')).toBeVisible();
      const text = await page.locator('main').innerText();
      const russian = text.replace(/фиКУС[а-яё]*/gi,'').match(/[а-яё][а-яё\s.,:!?«»—–()-]*/gi);
      if(russian) untranslated[language+route] = russian;
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth), `${language} ${route}: horizontal overflow`);
      assert.ok(await page.locator('.app-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth), `${language} ${route}: content overflow`);
      if(route==='/checkout') {
        await expect(page.locator('textarea:not([readonly])')).toHaveValue('My comment — یادداشت — 我的备注');
        await expect(page.locator('textarea[readonly]')).toHaveValue(/My comment — یادداشت — 我的备注/);
      }
      if(route==='/catalog'||route==='/product/claude-pro') await page.screenshot({path:`previews/localization/${language}-${route.includes('product')?'product':'catalog'}.png`});
    }
  }
  for(const width of [320,1280]) {
    await page.setViewportSize({width,height:844});
    await page.goto(base+'/#/profile'); await selector().selectOption('fa');
    await selector().scrollIntoViewIfNeeded();
    assert.ok(await page.locator('.app-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth));
    await page.screenshot({path:`previews/localization/fa-settings-${width}.png`});
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(untranslated,{}, 'storefront screens contain untranslated Russian copy');
  checks.push('catalog, product, service, cart, orders and support render in all new languages without errors or viewport overflow');
  checks.push('cart and entered checkout comment survive language switching; Persian settings fit 320 and 1280 pixels');
  await writeFile('docs/localization-checks.json',JSON.stringify({checks,errors,untranslated},null,2));
  console.log(JSON.stringify({checks,untranslated},null,2));
} finally {await browser.close();}
