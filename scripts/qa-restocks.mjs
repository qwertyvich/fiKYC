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
page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
try {
 await context.request.post(base+'/api/admin/login',{data:{password:'fixture'}});
 await page.goto(base+'/#/admin/products');
 await page.getByRole('button',{name:'Редактировать Почта России',exact:true}).click();
 let drawer=page.getByRole('dialog');
 const stock=drawer.getByLabel('Остаток',{exact:true}), before=Number(await stock.inputValue());await stock.fill(String(before+5));
 await drawer.getByRole('button',{name:'Уведомить о пополнении',exact:true}).click();
 await expect(drawer.getByLabel('Сколько добавили')).toHaveValue('5');
 await drawer.getByLabel('Заголовок сообщения',{exact:true}).fill('Новая поставка — успейте забрать');
 await drawer.getByLabel('Текст сообщения',{exact:false}).fill('Снова доступны!\nПодробности и оформление — в карточке товара.');
 await drawer.getByLabel('Кому отправить',{exact:false}).selectOption('200');
 await drawer.getByRole('button',{name:'Предпросмотр рассылки',exact:true}).click();
 await expect(drawer.getByRole('button',{name:'Отправить 1 пользователю',exact:true})).toBeVisible({timeout:20000});
 assert.equal(calls.length,0);assert.equal(JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.id==='mail-setup').stock,before+5);
 const c=app.db.prepare('SELECT * FROM restock_campaigns').get();assert.equal(c.quantity,5);assert.ok(c.media.length>10000);assert.equal(c.media_kind,'photo');
 assert.equal(c.message_title,'Новая поставка — успейте забрать');assert.equal(c.audience_mode,'latest');assert.equal(c.audience_limit,200);
 await expect(drawer.locator('.a-restock-copy')).toContainText(c.message_title);await expect(drawer.locator('.a-restock-copy')).toContainText(c.message_text);
 // Editing any field invalidates the previously frozen draft, including its audience.
 await drawer.getByLabel('Кому отправить',{exact:false}).selectOption('custom');
 await expect(drawer.getByRole('button',{name:'Предпросмотр рассылки',exact:true})).toBeVisible();
 await expect(drawer.getByRole('button',{name:'Отправить 1 пользователю',exact:true})).toHaveCount(0);
 await drawer.getByLabel('Количество новых клиентов',{exact:true}).fill('0');
 await expect(drawer.getByRole('button',{name:'Предпросмотр рассылки',exact:true})).toBeDisabled();
 await drawer.getByLabel('Количество новых клиентов',{exact:true}).fill('1');
 await drawer.getByRole('button',{name:'Предпросмотр рассылки',exact:true}).click();
 await expect(drawer.getByRole('button',{name:'Отправить 1 пользователю',exact:true})).toBeVisible();
 await drawer.getByLabel('Заголовок сообщения',{exact:true}).fill('');
 await expect(drawer.getByRole('button',{name:'Предпросмотр рассылки',exact:true})).toBeDisabled();
 await drawer.getByLabel('Заголовок сообщения',{exact:true}).fill('Почта снова в наличии');
 await drawer.getByRole('button',{name:'Предпросмотр рассылки',exact:true}).click();
 await expect(drawer.getByRole('button',{name:'Отправить 1 пользователю',exact:true})).toBeVisible();assert.equal(calls.length,0);
 await page.screenshot({path:'qa/restocks/photo-preview-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'qa/restocks/photo-preview-mobile.png'});
 assert.equal(await drawer.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await drawer.getByLabel('Заголовок сообщения',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'qa/restocks/custom-fields-mobile.png'});
 await drawer.getByRole('button',{name:'Отправить 1 пользователю',exact:true}).click();
 await expect(drawer.getByText('Отправляем уведомления',{exact:false})).toBeVisible();
 app.restocks.start();await app.restocks.tick();
 await expect(drawer.getByText('Рассылка завершена',{exact:false})).toBeVisible({timeout:7000});
 assert.equal(calls.filter(c=>c.method==='sendPhoto').length,1);assert.equal(calls[0].payload.chat_id,'777');assert.ok(calls[0].payload.caption.includes('<b>Почта снова в наличии</b>'));assert.ok(calls[0].payload.caption.includes(c.message_text));
 await drawer.getByRole('button',{name:'Отмена',exact:true}).click();
 await page.getByRole('button',{name:'Редактировать Claude Pro',exact:true}).click();drawer=page.getByRole('dialog');
 await drawer.getByRole('button',{name:'Уведомить о пополнении',exact:true}).click();await drawer.getByLabel('Сколько добавили').fill('2');
 await drawer.getByRole('button',{name:'Предпросмотр рассылки',exact:true}).click();
 await expect(drawer.getByRole('button',{name:'Отправить 1 пользователю',exact:true})).toBeVisible();
 await expect(drawer.getByLabel('Анимация рассылки')).toBeVisible();
 await expect.poll(()=>drawer.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
 await page.screenshot({path:'qa/restocks/claude-preview-mobile.png'});
 assert.equal(calls.length,1);assert.deepEqual(errors,[]);
 await writeFile('qa/restocks/result.json',JSON.stringify({checks:['saved stock delta','custom heading and multiline body','latest 200 preset','custom audience count','changing audience/text invalidates preview','blank heading and zero count disable preview','cover capture','no sends before launch','mobile layout','explicit launch with exact custom copy','delivery progress','Claude animation preview'],errors},null,2));
 console.log('Restock admin browser scenarios passed; all Telegram calls were simulated');
} catch(e){await page.screenshot({path:'qa/restocks/failure.png'});throw e;}
finally{await browser.close();await new Promise(r=>app.server.close(r));}
