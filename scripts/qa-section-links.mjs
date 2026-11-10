import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createApp} from '../server/index.mjs';
const app=await createApp({dbPath:':memory:',gatewayWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:'',GATEWAY_BOT_TOKEN:'',ADMIN_PASSWORD:'fixture'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.route('https://telegram.org/**',r=>r.fulfill({body:''}));
const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const out=new URL('../qa/section-links/',import.meta.url);await mkdir(out,{recursive:true});
try{
 await ctx.request.post(base+'/api/admin/login',{data:{password:'fixture'}});const state=await(await ctx.request.get(base+'/api/admin/state')).json();await ctx.request.put(base+'/api/admin/state',{data:{revision:state.revision,settings:{...state.settings,botUsername:'fixture_shop_bot'}}});
 await page.goto(base+'/#/admin/links');await page.getByRole('button',{name:'Раздел',exact:true}).click();await expect(page.locator('.a-link-card')).toHaveCount(state.catalog.groups.length);
 await page.getByRole('combobox',{name:'Раздел для ссылки'}).selectOption('mail');await expect(page.locator('.a-link-card')).toHaveCount(1);await expect(page.locator('.a-link-card')).toContainText('Почтовые сервисы');await expect(page.locator('.a-url code')).toContainText('?startapp=g_');
 await page.getByLabel('Название / источник').fill('Поставка почтовых сервисов');await page.getByRole('button',{name:'Создать ссылку',exact:true}).click();await expect(page.locator('.a-link-card')).toHaveCount(2);
 const card=page.locator('.a-link-card').filter({has:page.getByRole('heading',{name:'Поставка почтовых сервисов',exact:true})});await expect(card).toBeVisible();assert.match(await card.locator('.a-url code').innerText(),/startapp=g_/);
 await card.getByRole('switch').click();await expect(card.getByRole('switch')).toHaveAttribute('aria-checked','false');
 await page.screenshot({path:new URL('admin-mobile.png',out).pathname,fullPage:true});await page.setViewportSize({width:320,height:780});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:new URL('admin-desktop.png',out).pathname,fullPage:true});
 await page.getByRole('button',{name:'Товар',exact:true}).click();await page.getByRole('combobox',{name:'Товар для ссылки'}).selectOption('cdek-id');await page.getByLabel('Название / источник').fill('Ссылка на СДЭК');await page.getByRole('button',{name:'Создать ссылку',exact:true}).click();await expect(page.locator('.a-link-card')).toHaveCount(1);await expect(page.locator('.a-url code')).toContainText('?startapp=p_');
 assert.deepEqual(errors,[]);await writeFile(new URL('result.json',out),JSON.stringify({ok:true,checks:['ready section links','category filter','extra campaign link','disable','320px','desktop','product links preserved'],browserErrors:errors},null,2));console.log('Section link admin browser checks passed');
}finally{await browser.close();await new Promise(r=>app.server.close(r));}
