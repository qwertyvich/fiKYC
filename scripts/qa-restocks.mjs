import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.mjs';
const calls=[];
const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,restockWorker:false,
 env:{NODE_ENV:'test',BOT_TOKEN:'123456789:'+ 'a'.repeat(35),GATEWAY_BOT_TOKEN:'',ADMIN_PASSWORD:'fixture'},
 shopBotCall:async(_,method,payload,files)=>{calls.push({method,payload,files});return {photo:[{file_id:'fixture-photo'}],animation:{file_id:'fixture-animation'}};}});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
app.db.prepare('INSERT INTO visitors(id,token,created_at,telegram_id,verified_at) VALUES(?,?,?,?,?)').run('fixture-user','fixture-token',Date.now(),'777',Date.now());
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
await mkdir('qa/restocks',{recursive:true});
const context=await browser.newContext({viewport:{width:1360,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
try {
 await context.request.post(base+'/api/admin/login',{data:{password:'fixture'}});
 await page.goto(base+'/#/admin/products');
 await page.getByRole('button',{name:'Редактировать Почта России',exact:true}).click();
 let drawer=page.getByRole('dialog');
 const stock=drawer.getByLabel('Остаток',{exact:true}), before=Number(await stock.inputValue());await stock.fill(String(before+5));
 await drawer.getByRole('button',{name:'Уведомить о пополнении',exact:true}).click();
 await expect(drawer.getByLabel('Сколько добавили')).toHaveValue('5');
 await drawer.getByRole('button',{name:'Предпросмотр рассылки',exact:true}).click();
 await expect(drawer.getByRole('button',{name:'Отправить 1 пользователю',exact:true})).toBeVisible({timeout:20000});
 assert.equal(calls.length,0);assert.equal(JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.id==='mail-setup').stock,before+5);
 const c=app.db.prepare('SELECT * FROM restock_campaigns').get();assert.equal(c.quantity,5);assert.ok(c.media.length>10000);assert.equal(c.media_kind,'photo');
 await page.screenshot({path:'qa/restocks/photo-preview-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'qa/restocks/photo-preview-mobile.png'});
 assert.equal(await drawer.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await drawer.getByRole('button',{name:'Отправить 1 пользователю',exact:true}).click();
 await expect(drawer.getByText('Отправляем уведомления',{exact:false})).toBeVisible();
 app.restocks.start();await app.restocks.tick();
 await expect(drawer.getByText('Рассылка завершена',{exact:false})).toBeVisible({timeout:7000});
 assert.equal(calls.filter(c=>c.method==='sendPhoto').length,1);assert.equal(calls[0].payload.chat_id,'777');
 await drawer.getByRole('button',{name:'Отмена',exact:true}).click();
 await page.getByRole('button',{name:'Редактировать Claude Pro',exact:true}).click();drawer=page.getByRole('dialog');
 await drawer.getByRole('button',{name:'Уведомить о пополнении',exact:true}).click();await drawer.getByLabel('Сколько добавили').fill('2');
 await drawer.getByRole('button',{name:'Предпросмотр рассылки',exact:true}).click();
 await expect(drawer.getByRole('button',{name:'Отправить 1 пользователю',exact:true})).toBeVisible();
 await expect(drawer.getByLabel('Анимация рассылки')).toBeVisible();
 await expect.poll(()=>drawer.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
 await page.screenshot({path:'qa/restocks/claude-preview-mobile.png'});
 assert.equal(calls.length,1);assert.deepEqual(errors,[]);
 await writeFile('qa/restocks/result.json',JSON.stringify({checks:['saved stock delta','cover capture','no sends before launch','mobile layout','explicit launch','delivery progress','Claude animation preview'],errors},null,2));
 console.log('Restock admin browser scenarios passed; all Telegram calls were simulated');
} catch(e){await page.screenshot({path:'qa/restocks/failure.png'});throw e;}
finally{await browser.close();await new Promise(r=>app.server.close(r));}
