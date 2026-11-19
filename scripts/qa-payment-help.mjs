import{chromium,expect}from'@playwright/test';
import assert from'node:assert/strict';
import{mkdir}from'node:fs/promises';
import{createApp}from'../server/index.mjs';
const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,restockWorker:false,sbpWorker:false,gatewayBotCall:async()=>({}),env:{NODE_ENV:'test',BOT_TOKEN:'',GATEWAY_BOT_TOKEN:'isolated'}});
const {db,gateway:g}=app;const state=db.prepare('SELECT catalog,shop FROM state').get(),catalog=JSON.parse(state.catalog),shop={...JSON.parse(state.shop),supportTelegram:'phiKYC'},p=catalog.products.find(p=>p.id==='mail-setup');Object.assign(p,{title:'Верификация KYC на ваш аккаунт | Европа',price:7900,currency:'RUB',visible:true,saleMode:'fixed',stock:7});catalog.groups.find(v=>v.id===p.groupId).visible=true;db.prepare('UPDATE state SET catalog=?,shop=?').run(JSON.stringify(catalog),JSON.stringify(shop));app.sbp.saveConfig({enabled:false,preferred:'mc9'});g.setConnected();
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});await mkdir('qa/payment-help',{recursive:true});
try{
 for(const lang of ['ru','en','zh','fa']){
  const context=await browser.newContext({locale:lang==='ru'?'ru-RU':lang==='fa'?'fa-IR':lang==='zh'?'zh-CN':'en-US',viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
  await context.addInitScript(({language,id})=>{localStorage.setItem('fikus:cart',JSON.stringify([{productId:id,quantity:1}]));window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:100,first_name:'Buyer',language_code:language}},colorScheme:'light',ready(){},expand(){},onEvent(){},offEvent(){},setHeaderColor(){},setBackgroundColor(){},openTelegramLink(url){window.__managerOpened=url;},BackButton:{show(){},hide(){},onClick(){},offClick(){}}}};},{language:lang,id:p.id});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#/checkout');await expect(page.locator('html')).toHaveAttribute('lang',lang);const help=page.locator('.payment-manager-link');await expect(help).toHaveCount(1);await expect(help).toBeVisible();
  await page.locator('textarea').fill('Франция — https://example.com/verification?key=a&country=fr');
  if(lang==='ru'){
   await page.getByRole('button',{name:/Оплатить 7/}).click();await expect(page.locator('.alternative-payments')).toBeVisible();await expect(page.locator('.alternative-payment').filter({hasText:'СБП'})).toHaveCount(0);await expect(page.getByRole('link',{name:/Запросить карту у оператора/})).toBeVisible();
  }
  const href=await help.getAttribute('href'),url=new URL(href),text=url.searchParams.get('text');assert.equal(url.pathname,'/phiKYC');assert.ok(text.includes(p.id));assert.ok(text.includes('https://example.com/verification?key=a&country=fr'));if(lang==='ru')assert.match(text.replace(/\s/g,''),/7900/);
  await help.click();assert.equal(await page.evaluate(()=>window.__managerOpened),href);assert.equal(db.prepare('SELECT COUNT(*) n FROM payments').get().n,0,'contact does not create or confirm a payment');
  await page.setViewportSize({width:320,height:780});await help.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'qa/payment-help/'+lang+'-checkout.png'});
  if(lang==='ru'){
   await page.route('**/api/payment-options?*',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Payment options unavailable'})}));await page.reload();await page.getByRole('button',{name:/Оплатить 7/}).click();await expect(help).toBeVisible();await page.unroute('**/api/payment-options?*');
   await page.goto(base+'/#/profile');await page.getByRole('button',{name:'Пополнить баланс',exact:true}).click();await page.getByLabel('Сумма пополнения, ₽',{exact:true}).fill('7900');await page.getByRole('button',{name:'Перейти к пополнению',exact:true}).click();await expect(page.locator('.alternative-payments')).toBeVisible();await expect(help).toHaveCount(1);assert.ok(new URL(await help.getAttribute('href')).searchParams.get('text').includes('7900.00 RUB'));await help.scrollIntoViewIfNeeded();await page.screenshot({path:'qa/payment-help/wallet.png'});
  }
  assert.deepEqual(errors,[]);await context.close();console.log(lang+': visible operator contact, correct recipient/order/amount/comment, native Telegram open, narrow viewport, no payment side effects');
 }
}finally{await browser.close();await new Promise(r=>app.server.close(r));}
