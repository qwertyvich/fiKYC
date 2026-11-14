import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createApp} from '../server/index.mjs';

// Isolated in-memory shop: no Telegram network requests or real payments.
const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,restockWorker:false,gatewayBotCall:async()=>({}),env:{NODE_ENV:'test',GATEWAY_BOT_TOKEN:'isolated-gateway',BOT_TOKEN:''}});
const {db,gateway:g,server}=app;
const catalog=JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog),product=catalog.products.find(p=>p.saleMode!=='request');
Object.assign(product,{price:1500,currency:'RUB',stock:30,visible:true});catalog.groups.find(v=>v.id===product.groupId).visible=true;
db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));db.prepare('INSERT INTO channel_product_stats VALUES(?,?,?,?)').run(product.id,product.title,123,4.9);
g.saveConfig({enabled:true,receiptRecipient:'777'});g.setConnected();
let update=0;
const feed=text=>g.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(Date.now()/1000),text},++update);
const phone='+79991234567',announcement='Реквизиты №1\n🏦 Банк: Сбербанк\n┗ ФИО: Получатель Т\n💳 Карта: 8 (999) 123-45-67\n✅ Мин: 1 000 ₽\n⛔️ Макс: 8 000 ₽';feed(announcement);
const heartbeat=setInterval(()=>g.setConnected(),1000);
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});
await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
await context.addInitScript(id=>localStorage.setItem('fikus:cart',JSON.stringify([{productId:id,quantity:1}])),product.id);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const dir=new URL('../qa/phone-payments/',import.meta.url);await mkdir(dir,{recursive:true});
try {
  await page.goto(base+'/#/checkout');await page.getByRole('button',{name:/Оплатить 1/}).click();
  await page.getByRole('checkbox',{name:'Всё понятно, готовлюсь к переводу'}).check();await page.getByRole('button',{name:'Получить реквизиты',exact:true}).click();
  const copy=page.getByRole('button',{name:'Скопировать номер телефона'});
  await expect(copy).toHaveText('+7 (999) 123-45-67');await expect(page.getByRole('heading',{name:'Оплата по СБП на телефон'})).toBeVisible();
  await expect(page.getByRole('note')).toHaveText('Переведите по СБП только в банк «Сбербанк». В другой банк не переводите.');
  await expect(page.getByText('Банк для перевода по СБП',{exact:true})).toBeVisible();await expect(page.getByRole('timer')).toHaveText(/1[45]:\d{2}/);
  await copy.click();await expect(page.getByText('Номер телефона скопирован',{exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(phone);
  assert.equal(await page.locator('a[href*="pay-provider"],a[href*="GatewayReqBot"]').count(),0);
  await page.screenshot({path:new URL('phone-light.png',dir).pathname,fullPage:true});
  await page.setViewportSize({width:320,height:780});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>{document.documentElement.dataset.mode='dark';});await page.screenshot({path:new URL('phone-dark-narrow.png',dir).pathname,fullPage:true});
  feed('💳 Реквизиты 8 999 123 45 67\nвременно недоступны ⛔️');
  await expect(page.getByRole('heading',{name:'Реквизиты больше недоступны'})).toBeVisible();await expect(copy).toHaveCount(0);assert.ok(!(await page.locator('body').innerText()).includes('+7 (999)'));
  feed(announcement);await page.getByRole('button',{name:'Не успел оплатить'}).click();await page.getByRole('checkbox',{name:'Я ещё не переводил деньги по этому заказу'}).check();await page.getByRole('button',{name:'Получить новые реквизиты',exact:true}).click();
  await expect(copy).toBeVisible();const paymentId=page.url().split('/').at(-1);
  await page.locator('input[type=file]').setInputFiles({name:'receipt.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nfixture')});
  await expect(page.getByRole('heading',{name:'Проверяем оплату'})).toBeVisible();await g.confirm(paymentId,'777');await g.confirm(paymentId,'777');await expect(page.getByRole('heading',{name:'Спасибо за оплату'})).toBeVisible();
  const publicProduct=(await(await context.request.get(base+'/api/public')).json()).catalog.products.find(p=>p.id===product.id);assert.equal(publicProduct.buyerCount,124);assert.equal(publicProduct.channelStats.buyers,124);
  await page.goto(base+'/#/product/'+product.id);await expect(page.getByText('Покупателей: 124',{exact:true})).toBeVisible();
  await page.goto(base+'/#/profile');await page.getByRole('button',{name:'Пополнить баланс',exact:true}).click();await page.getByLabel('Сумма пополнения, ₽',{exact:true}).fill('1500');await page.getByRole('button',{name:'Перейти к пополнению',exact:true}).click();await page.getByRole('checkbox',{name:'Всё понятно, готовлюсь к переводу'}).check();await page.getByRole('button',{name:'Получить реквизиты',exact:true}).click();
  await expect(copy).toBeVisible();await expect(page.getByRole('note')).toContainText('только в банк «Сбербанк»');assert.equal(db.prepare('SELECT purpose FROM payments ORDER BY created_at DESC LIMIT 1').get().purpose,'topup');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM gateway_outbox WHERE kind='source'").get().n,0);assert.deepEqual(errors,[]);
  console.log('Phone checkout, bank warning, copy, 320px/dark layout, stop, retry, receipt, unique buyers and 1500 RUB topup passed. No external messages.');
} finally {await browser.close();clearInterval(heartbeat);g.stop();await new Promise(r=>server.close(r));}
