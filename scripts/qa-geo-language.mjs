import {chromium,expect} from '@playwright/test';
import {createHmac,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createApp} from '../server/index.mjs';
const token='isolated-language-fixture';
const lookup=()=> 'US';lookup.status=()=>({available:true,release:'2026-11',source:'DB-IP Lite'});
const app=await createApp({dbPath:':memory:',countryLookup:lookup,gatewayWorker:false,shopBotWorker:false,restockWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:token,ADMIN_PASSWORD:'fixture',TRUST_FIKUS_PROXY:'true'}});
const catalog=JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog),product=catalog.products.find(p=>p.id==='claude-kyc');product.saleMode='fixed';product.price=1500;product.stock=10;product.currency='RUB';app.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),errors=[];
await mkdir('qa/geo-language',{recursive:true});const user={id:990001,first_name:'Test',language_code:'en'};
const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify(user)}),secret=createHmac('sha256','WebAppData').update(token).digest();params.set('hash',createHmac('sha256',secret).update([...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));
const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',extraHTTPHeaders:{'X-Fikus-Client-IP':'8.8.8.8'}});
await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
await context.addInitScript(({user,signed})=>{
 localStorage.setItem('fikus:language:v1:tg:'+user.id,'"ru"');
 localStorage.setItem('fikus:language:v2:tg:'+user.id,JSON.stringify({choice:'ru',context:'ru'}));
 localStorage.setItem('fikus:payment-method:'+user.id,'card');
 const events={};window.preferenceEvents=events;
 window.Telegram={WebApp:{initData:signed,initDataUnsafe:{user},colorScheme:'dark',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(n,fn){(events[n]??=[]).push(fn);},offEvent(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}}}};
},{user,signed:params.toString()});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByRole('button',{name:'Market',exact:true})).toBeVisible();await expect(page.locator('.product-card').first()).toContainText('$');await page.screenshot({path:'qa/geo-language/english-with-old-russian-preference.png',fullPage:true});
 await page.evaluate(()=>{window.Telegram.WebApp.initDataUnsafe.user.language_code='ru';for(const fn of window.preferenceEvents.activated??[])fn();});await expect(page.locator('html')).toHaveAttribute('lang','ru');await expect(page.getByRole('button',{name:'Маркет',exact:true})).toBeVisible();await expect(page.locator('.product-card').first()).toContainText('₽');
 const insert=app.db.prepare('INSERT INTO events(id,visitor_id,session_id,type,at,country) VALUES(?,?,?,?,?,?)');for(const [country,visitor] of [['RU','russian-fixture'],['US','american-fixture'],['','historical-fixture']])insert.run(randomUUID(),visitor,randomUUID(),'session_start',Date.now(),country);
 const adminContext=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU'});await adminContext.route('https://telegram.org/**',r=>r.fulfill({body:''}));const admin=await adminContext.newPage();admin.on('pageerror',e=>errors.push(e.message));
 await admin.goto(base+'/#/admin/overview');await admin.getByLabel(/Пароль/).fill('fixture');await admin.getByRole('button',{name:/Войти/}).click();await expect(admin.getByRole('heading',{name:'Страны посетителей',exact:true})).toBeVisible();await expect(admin.getByRole('cell',{name:'Россия RU',exact:true})).toBeVisible();await expect(admin.getByRole('cell',{name:'Соединенные Штаты US',exact:true})).toBeVisible();await expect(admin.getByRole('cell',{name:'Не определена',exact:true})).toBeVisible();await admin.screenshot({path:'qa/geo-language/country-report-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);await writeFile('qa/geo-language/result.json',JSON.stringify({ok:true,checks:['English Telegram overrides stale Russian storage even on a Russian device','Russian Telegram selects Russian and RUB under a foreign VPN IP','Country report shows countries and historical unknowns on mobile'],browserErrors:errors},null,2));console.log('Language and country browser checks passed');
}catch(e){await page.screenshot({path:'qa/geo-language/failure.png',fullPage:true});throw e;}finally{await browser.close();await new Promise(r=>app.server.close(r));}
