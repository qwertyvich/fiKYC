import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../server/index.mjs';

const token='isolated-usdt-browser-token',calls=[];
const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,restockWorker:false,gatewayBotCall:async(method,payload)=>{calls.push({method,payload});return{};},env:{NODE_ENV:'test',BOT_TOKEN:token,GATEWAY_BOT_TOKEN:'isolated-gateway',ADMIN_PASSWORD:'isolated-password'}});
const {db,gateway:g,server}=app;
const payload=Buffer.concat([Buffer.from([0x41]),Buffer.alloc(20,7)]),checksum=createHash('sha256').update(createHash('sha256').update(payload).digest()).digest().subarray(0,4);
let n=BigInt('0x'+Buffer.concat([payload,checksum]).toString('hex')),tron='';while(n){tron='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(n%58n)]+tron;n/=58n;}
const current=db.prepare('SELECT settings,catalog FROM state').get(),settings={...JSON.parse(current.settings),usdtRubRate:88,usdtTrc20Address:tron,usdtBep20Address:'0x'+'a'.repeat(40)},catalog=JSON.parse(current.catalog),product=catalog.products.find(p=>p.id==='mail-setup');
product.price=1500;product.currency='RUB';product.stock=30;product.visible=true;product.saleMode='fixed';catalog.groups.find(v=>v.id===product.groupId).visible=true;
db.prepare('UPDATE state SET settings=?,catalog=?').run(JSON.stringify(settings),JSON.stringify(catalog));g.saveConfig({enabled:true,receiptRecipient:'777'});g.setConnected();
g.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(Date.now()/1000),text:'Реквизиты №1\n🇷🇺 Россия\n🏦 Банк: Сбер\n┗ ФИО: Тест Т\n💳 Карта: 2200000000000001\n✅ Мин: 1 000 ₽\n⛔️ Макс: 8 000 ₽'},1);
const heartbeat=setInterval(()=>g.setConnected(),1000);
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),errors=[],checks=[];
await mkdir('qa/usdt',{recursive:true});let serial=900000;
async function buyer(language='en',quantity=2){
  const user={id:serial++,first_name:'Test',language_code:language},params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify(user)}),secret=createHmac('sha256','WebAppData').update(token).digest();params.set('hash',createHmac('sha256',secret).update([...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',reducedMotion:'reduce'});
  await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
  await context.addInitScript(({user,signed,productId,quantity})=>{localStorage.setItem('fikus:cart',JSON.stringify([{productId,quantity}]));window.Telegram={WebApp:{initData:signed,initDataUnsafe:{user},colorScheme:'dark',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},offEvent(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}}}};},{user,signed:params.toString(),productId:product.id,quantity});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return{context,page};
}
let active;
try{
  const english=await buyer();active=english.page;const p=active;
  await p.goto(base+'/#/checkout');await expect(p.getByRole('heading',{name:'Pay with USDT',exact:true})).toBeVisible();
  await expect(p.locator('.payment-total')).toContainText('34.1');await expect(p.getByRole('dialog')).toHaveCount(0);
  await p.screenshot({path:'qa/usdt/networks-en.png',fullPage:true});
  await p.getByRole('button',{name:/USDT TRC20/}).click();await expect(p.getByRole('button',{name:'Copy address',exact:true})).toContainText(tron);
  assert.equal(calls.length,0);await expect(p.getByRole('timer')).toHaveCount(0);assert.ok(!(await p.locator('body').innerText()).includes('15 minutes'));
  const id=p.url().split('/').at(-1);await p.screenshot({path:'qa/usdt/transfer-en.png',fullPage:true});await p.setViewportSize({width:320,height:780});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.getByRole('button',{name:'I have paid',exact:true}).click();await expect(p.getByRole('heading',{name:'Checking your transfer',exact:true})).toBeVisible();
  assert.equal(JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog).products.find(v=>v.id===product.id).stock,30);
  await g.flush();assert.equal(calls.filter(c=>c.method==='sendMessage').length,1);assert.equal(calls[0].payload.chat_id,'777');await g.confirm(id,'777');
  await expect(p.getByRole('heading',{name:'Payment confirmed',exact:true}).first()).toBeVisible();assert.equal(JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog).products.find(v=>v.id===product.id).stock,28);
  checks.push('EN: per-unit USD rounding, TRC20, no timer, 320px, Gateway claim, manual inventory deduction');
  const fallback=await buyer('en',1);active=fallback.page;await active.goto(base+'/#/checkout');await active.getByRole('button',{name:'Pay by card in rubles',exact:true}).click();
  await expect(active.getByRole('dialog')).toContainText('15 minutes');await active.getByRole('checkbox').check();await active.getByRole('button',{name:'Get bank details',exact:true}).click();
  await expect(active.getByRole('button',{name:'Copy card number',exact:true})).toBeVisible();const card=db.prepare('SELECT * FROM payments WHERE id=?').get(active.url().split('/').at(-1));assert.equal(card.amount_minor,150000);assert.equal(card.expires_at-card.created_at,900000);
  await active.screenshot({path:'qa/usdt/card-fallback-en.png',fullPage:true});checks.push('English Telegram: explicit RUB card fallback with full 15 minutes');
  const wallet=await buyer('en',1);active=wallet.page;await active.goto(base+'/#/profile');await active.getByRole('button',{name:'Top up balance',exact:true}).click();await active.getByLabel('Top-up amount, USD',{exact:true}).fill('10');await active.getByRole('button',{name:'Continue to top-up',exact:true}).click();await expect(active.getByRole('dialog')).toHaveCount(0);
  await active.getByRole('button',{name:/USDT BEP20/}).click();await expect(active.getByRole('button',{name:'Copy address',exact:true})).toBeVisible();const topup=active.url().split('/').at(-1);await active.getByRole('button',{name:'I have paid',exact:true}).click();await expect(active.getByRole('heading',{name:'Checking your transfer',exact:true})).toBeVisible();await g.confirm(topup,'777');await active.getByRole('button',{name:'View balance',exact:true}).click();await expect(active.locator('.wallet-amount strong')).toHaveText('10 $');checks.push('BEP20 wallet: USD input, no timer, manual 880 RUB credit displayed as $10.00');
  const chinese=await buyer('zh-Hans',1);active=chinese.page;await active.goto(base+'/#/checkout');await expect(active.locator('html')).toHaveAttribute('lang','zh');await expect(active.locator('.payment-total')).toContainText('17.05');await active.screenshot({path:'qa/usdt/networks-zh.png',fullPage:true});checks.push('Chinese Telegram automatically selects USD and localized crypto checkout');
  settings.usdtTrc20Address='';settings.usdtBep20Address='';db.prepare('UPDATE state SET settings=?').run(JSON.stringify(settings));await active.reload();await expect(active.getByRole('button',{name:/USDT TRC20/})).toBeDisabled();await expect(active.getByRole('button',{name:/USDT BEP20/})).toBeDisabled();checks.push('Empty placeholders disable both networks while retaining card fallback');
  assert.deepEqual(errors,[]);await writeFile('qa/usdt/result.json',JSON.stringify({ok:true,checks,browserErrors:errors},null,2));console.log(JSON.stringify({ok:true,checks},null,2));
}catch(e){await active?.screenshot({path:'qa/usdt/failure.png',fullPage:true});throw e;}finally{clearInterval(heartbeat);await browser.close();await new Promise(r=>server.close(r));}
