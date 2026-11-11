import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { createApp } from './index.mjs';
import { createRestocks } from './restocks.mjs';
const primary='123456789:'+ 'a'.repeat(35), secondary='234567890:'+ 'b'.repeat(35);
const assets=new URL('../public',import.meta.url).pathname;
const jpg=await readFile(new URL('../public/branding/telegram/general-bot.jpg',import.meta.url));
const image='data:image/jpeg;base64,'+jpg.toString('base64');
function proof(id=777) {
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Fixture'})});
 const key=createHmac('sha256','WebAppData').update(primary).digest();p.set('hash',createHmac('sha256',key).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();
}
async function fixture(t,handler) {
 let at=Date.now();const calls=[];
 const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,restockWorker:false,restockAssetsRoot:assets,restockNow:()=>at,
 env:{NODE_ENV:'test',BOT_TOKEN:primary,GATEWAY_BOT_TOKEN:'',BOTS_ENCRYPTION_KEY:'12'.repeat(32),ADMIN_PASSWORD:'fixture',PUBLIC_ORIGIN:'http://127.0.0.1'},
 shopBotCall:async(token,method,payload,files)=>{calls.push({token,method,payload,files});const custom=await handler?.(token,method,payload);if(custom!==undefined)return custom;if(method==='getMe')return {id:Number(token.split(':')[0]),username:'fixture_bot',is_bot:true};if(method==='getWebhookInfo')return {url:''};return {photo:[{file_id:'photo-'+token.split(':')[0]}],animation:{file_id:'animation-'+token.split(':')[0]}};}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 function visitor(id,username='fixture_user') {app.db.prepare('INSERT INTO visitors(id,token,created_at,telegram_id,telegram_username,verified_at) VALUES(?,?,?,?,?,?)').run('v'+id,'t'+id,at,String(id),username,at);}
 const product=id=>JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.id===id);
 const preview=(id='mail-setup',quantity=1)=>app.restocks.preview({productId:id,quantity,product:product(id),image});
 return {...app,calls,visitor,product,preview,advance:()=>{at+=2000;},sends:()=>calls.filter(c=>['sendPhoto','sendAnimation','sendMessage'].includes(c.method)),base:'http://127.0.0.1:'+app.server.address().port};
}
test('restock preview and media require seller access; opening a preview never sends',async t=>{
 const app=await fixture(t);app.visitor(777);const c=await app.preview();assert.equal(c.total,1);assert.equal(c.status,'draft');
 assert.equal((await fetch(app.base+'/api/admin/restocks')).status,401);assert.equal((await fetch(app.base+'/api/admin/restocks/'+c.id+'/media')).status,401);
 app.restocks.start();await app.restocks.tick();assert.equal(app.sends().length,0);
 await assert.rejects(()=>app.preview('mail-setup',0),/количество/);await assert.rejects(()=>app.preview('mail-setup',999999),/количество/);
});
test('one notification across funnels, private destinations, saved cover, premium emoji and direct product link',async t=>{
 const app=await fixture(t);await app.shopBots.save({token:secondary});app.visitor(777);
 for(const id of ['123456789','234567890'])app.restocks.observe(app.shopBots.getRow(id),{message:{chat:{id:777,type:'private'},from:{id:777,username:'buyer'}}});
 app.visitor(888);app.visitor(999,'blocked_user');app.db.prepare("INSERT INTO blacklist(id,type,value,active,created_at) VALUES('blocked','username','blocked_user',1,?)").run(Date.now());
 const c=await app.preview();assert.equal(c.total,2);app.restocks.launch(c.id);app.restocks.launch(c.id);app.restocks.start();await app.restocks.tick();app.advance();await app.restocks.tick();app.advance();await app.restocks.tick();
 assert.equal(app.sends().length,2);assert.equal(new Set(app.sends().map(c=>c.payload.chat_id)).size,2);assert.ok(app.sends().every(c=>Number(c.payload.chat_id)>0));
 const send=app.sends()[0];assert.equal(send.method,'sendPhoto');assert.equal(send.files.cover.data.length,jpg.length);assert.match(send.payload.caption,/<blockquote>/);assert.match(send.payload.caption,/<tg-emoji/);
 const url=new URL(send.payload.reply_markup.inline_keyboard[0][0].web_app.url),code=url.searchParams.get('ref').slice(2);
 assert.equal(app.db.prepare('SELECT product_id FROM links WHERE token=?').get(code).product_id,'mail-setup');assert.equal(app.restocks.summary(c.id).sent,2);
});
test('blocked primary bot falls back to the other store bot without duplicating a successful delivery',async t=>{
 const app=await fixture(t,(token,method)=>{if(method==='sendPhoto'&&token===primary)throw Object.assign(Error('Forbidden: bot was blocked'),{telegramCode:403});});
 await app.shopBots.save({token:secondary});app.visitor(777);const c=await app.preview();app.restocks.launch(c.id);app.restocks.start();await app.restocks.tick();
 assert.equal(app.sends().length,2);assert.equal(app.restocks.summary(c.id).sent,1);assert.equal(app.db.prepare('SELECT reachable FROM shop_contacts WHERE bot_id=? AND telegram_id=?').get('123456789','777').reachable,0);
});
test('Claude uses the matching card animation, custom covers use photos and premium rejection falls back',async t=>{
 let rejected=false;const app=await fixture(t,(_,method,payload)=>{if(method==='sendAnimation'&&!rejected&&payload.caption.includes('tg-emoji')){rejected=true;throw Object.assign(Error('CUSTOM_EMOJI_INVALID'),{telegramCode:400});}});
 app.visitor(777);const c=await app.preview('claude-pro');assert.equal(c.mediaKind,'animation');app.restocks.launch(c.id);app.restocks.start();await app.restocks.tick();
 assert.equal(app.restocks.summary(c.id).sent,1);assert.equal(app.sends().at(-1).files.cover.type,'video/mp4');assert.doesNotMatch(app.sends().at(-1).payload.caption,/tg-emoji/);
 const s=app.db.prepare('SELECT catalog FROM state').get(),catalog=JSON.parse(s.catalog);catalog.products.find(p=>p.id==='claude-pro').imageId='a'.repeat(64);app.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));
 assert.equal((await app.preview('claude-pro')).mediaKind,'photo');
});
test('429 respects retry_after; cancellation and opt-out prevent remaining deliveries',async t=>{
 let rejected=false;const app=await fixture(t,(_,method)=>{if(method==='sendPhoto'&&!rejected){rejected=true;throw Object.assign(Error('Too Many Requests'),{telegramCode:429,retryAfter:1});}});
 app.visitor(777);app.visitor(888);const c=await app.preview();app.restocks.launch(c.id);app.restocks.start();await app.restocks.tick();assert.equal(app.restocks.summary(c.id).sent,0);await app.restocks.tick();assert.equal(app.sends().length,1);
 app.advance();await app.restocks.tick();assert.equal(app.restocks.summary(c.id).sent,1);
 await app.shopBots.reply(app.shopBots.getRow('123456789'),{callback_query:{id:'mute',from:{id:888},data:'stock:mute',message:{chat:{id:888,type:'private'},message_id:42}}});
 app.advance();await app.restocks.tick();assert.equal(app.restocks.summary(c.id).skipped,1);assert.equal(app.restocks.summary(c.id).status,'done');
 const second=await app.preview();app.restocks.launch(second.id);app.restocks.cancel(second.id);app.advance();await app.restocks.tick();assert.equal(app.restocks.summary(second.id).sent,0);
});
test('unknown delivery result is not retried; interrupted in-flight jobs stay uncertain after recovery',async t=>{
 const app=await fixture(t,(_,method)=>{if(method==='sendPhoto')throw Error('Connection lost after upload');});app.visitor(777);
 const c=await app.preview();app.restocks.launch(c.id);app.restocks.start();await app.restocks.tick();app.advance();await app.restocks.tick();assert.equal(app.sends().length,1);assert.equal(app.restocks.summary(c.id).uncertain,1);
 app.db.prepare("UPDATE restock_deliveries SET status='sending' WHERE campaign_id=?").run(c.id);
 const recovered=createRestocks({db:app.db,state:()=>({}),bots:app.shopBots,blocked:()=>false,assetsRoot:assets});assert.equal(recovered.summary(c.id).uncertain,1);recovered.stop();
});
test('stale or hidden products cannot start; active blacklist changes stop queued notices',async t=>{
 const app=await fixture(t);app.visitor(777);let c=await app.preview();const s=app.db.prepare('SELECT catalog FROM state').get(),catalog=JSON.parse(s.catalog);catalog.products.find(p=>p.id==='mail-setup').stock+=1;app.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));
 assert.throws(()=>app.restocks.launch(c.id),/изменился/);c=await app.preview();app.restocks.launch(c.id);app.db.prepare("INSERT INTO blacklist(id,type,value,active,created_at) VALUES('later','id','777',1,?)").run(Date.now());app.restocks.start();await app.restocks.tick();assert.equal(app.sends().length,0);assert.equal(app.restocks.summary(c.id).skipped,1);
});
test('only signed Mini App identity and private updates are recorded as contacts; opt-out persists',async t=>{
 const app=await fixture(t);const bot=app.shopBots.getRow('123456789');
 app.restocks.observe(bot,{message:{chat:{id:-1002278926769,type:'supergroup'},from:{id:777}}});app.restocks.observeProof(proof().replace('user=','forged='));assert.equal(app.db.prepare('SELECT COUNT(*) n FROM shop_contacts').get().n,0);
 const r=await fetch(app.base+'/api/access',{headers:{'X-Telegram-Init-Data':proof()}});assert.equal(r.status,200);assert.equal(app.db.prepare('SELECT telegram_id FROM shop_contacts').get().telegram_id,'777');
 await app.shopBots.reply(bot,{message:{chat:{id:777,type:'private'},from:{id:777},text:'/stop'}});assert.equal((await app.preview()).total,0);
 await app.shopBots.reply(bot,{message:{chat:{id:777,type:'private'},from:{id:777},text:'/notify'}});assert.equal((await app.preview()).total,1);
});
test('cancellation during a failed request prevents fallback to another bot',async t=>{
 let cancel=()=>{};const app=await fixture(t,(_,method)=>{if(method==='sendPhoto'){cancel();throw Object.assign(Error('Forbidden: bot was blocked'),{telegramCode:403});}});
 await app.shopBots.save({token:secondary});app.visitor(777);const c=await app.preview();app.restocks.launch(c.id);cancel=()=>app.restocks.cancel(c.id);
 app.restocks.start();await app.restocks.tick();assert.equal(app.sends().length,1);assert.equal(app.restocks.summary(c.id).status,'cancelled');assert.equal(app.restocks.summary(c.id).sent,0);
});
