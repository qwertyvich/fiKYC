import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {existsSync} from 'node:fs';
import {createApp} from './index.mjs';
import {telegramUser} from './security.mjs';
const primary='123456789:'+ 'a'.repeat(35),secondary='234567890:'+ 'b'.repeat(35),gateway='9089232910:'+ 'c'.repeat(35);
const publicAssets=new URL('../public/branding/telegram',import.meta.url).pathname;
const assetsRoot=existsSync(publicAssets)?publicAssets:new URL('../dist/branding/telegram',import.meta.url).pathname;
function initData(secret,id=456){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Test'})});const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');const key=createHmac('sha256','WebAppData').update(secret).digest();p.set('hash',createHmac('sha256',key).update(check).digest('hex'));return p.toString();}
async function fixture(t,extra={}){
 const calls=[];const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:primary,GATEWAY_BOT_TOKEN:gateway,ADMIN_PASSWORD:'fixture',BOTS_ENCRYPTION_KEY:'12'.repeat(32),PUBLIC_ORIGIN:'https://example.test'},botAssetsRoot:assetsRoot,shopBotCall:async(secret,method,payload,files)=>{calls.push({secret,method,payload,files});if(extra.call){const r=await extra.call(secret,method,payload);if(r!==undefined)return r;}if(method==='getMe')return {id:Number(secret.split(':')[0]),is_bot:true,username:'fixture_bot',has_main_web_app:true};if(method==='getWebhookInfo')return {url:''};if(method==='getUpdates')return new Promise(()=>{});return {animation:{file_id:'fixture-animation'}};}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 t.after(()=>new Promise(r=>app.server.close(r)));
 return {...app,calls,base};
}
test('tokens are encrypted, excluded from admin/public output and shared identity verifies all enabled funnels',async t=>{
 const app=await fixture(t);await app.shopBots.save({token:secondary,theme:'claude'});
 assert.equal(app.shopBots.tokens().length,2);const stored=app.db.prepare('SELECT encrypted_token FROM shop_bots WHERE primary_bot=0').get().encrypted_token;
 assert.ok(stored&&!stored.includes(secondary));assert.ok(!JSON.stringify(app.shopBots.list()).includes(secondary));
 assert.equal(telegramUser(initData(secondary),app.shopBots.tokens()).id,456);assert.equal(telegramUser(initData(gateway),app.shopBots.tokens()),null);
 const access=await fetch(app.base+'/api/access',{headers:{'x-telegram-init-data':initData(secondary)}}).then(r=>r.json());assert.equal(access.telegramRequired,false);
 await app.shopBots.save({enabled:false},'234567890');assert.equal(telegramUser(initData(secondary),app.shopBots.tokens()),null);
});
test('menu links resolve to exact product/section and priority changes only the chosen funnel',async t=>{
 const app=await fixture(t);const bot=app.shopBots.getRow('123456789');app.shopBots.setEmojiManifest({claude:{id:'5208665212483310136'},next:{id:'5354815888639942120'}});
 const m=app.shopBots.menu(bot);assert.deepEqual(m.reply_markup.inline_keyboard.slice(0,4).map(r=>r[0].text),['Верификация Claude','Аккаунты Claude','✨ Аккаунты нейросетей','✉️ Аккаунты почтовых сервисов']);
 const first=m.reply_markup.inline_keyboard[0][0];assert.equal(first.icon_custom_emoji_id,'5208665212483310136');const code=new URL(first.web_app.url).searchParams.get('ref').slice(2);const resolved=await fetch(app.base+'/api/links/'+code).then(r=>r.json());assert.equal(resolved.productId,'claude-kyc');
 await app.shopBots.save({token:secondary,theme:'claude',priority:'group:mail'});const m2=app.shopBots.menu(app.shopBots.getRow('234567890'));assert.match(m2.reply_markup.inline_keyboard[0][0].text,/почтовых/);
 assert.equal(app.shopBots.menu(bot).reply_markup.inline_keyboard[0][0].text,'Верификация Claude');
 for(const b of m.reply_markup.inline_keyboard.flat())assert.ok(!b.style||b.style==='success');
 assert.match(app.shopBots.menu(bot,999).caption,/4 \/ 4$/);
});
test('only private human requests produce replies, groups and requisites source are hard blocked',async t=>{
 const app=await fixture(t),r=app.shopBots.getRow('123456789');
 for(const chat of [{id:-1002278926769,type:'supergroup'},{id:-123,type:'group'}])await app.shopBots.reply(r,{message:{chat,from:{id:777},text:'/start'}});
 assert.equal(app.calls.length,0);await assert.rejects(()=>app.shopBots.call(r,'sendMessage',{chat_id:-1002278926769,text:'never'}),/группы запрещена/);
 await app.shopBots.reply(r,{message:{chat:{id:777,type:'private'},from:{id:777},text:'/start'}});assert.equal(app.calls.at(-1).method,'sendMessage');assert.deepEqual(app.calls.at(-1).payload.reply_markup.inline_keyboard.map(r=>r[0].text),['Русский','English','中文']);await app.shopBots.reply(r,{callback_query:{id:'choose',from:{id:777},data:'language:ru',message:{message_id:1,chat:{id:777,type:'private'}}}});assert.equal(app.calls.at(-2).method,'sendAnimation');assert.ok(app.calls.at(-2).files.menu.data.length>0);
 await app.shopBots.reply(r,{callback_query:{id:'cb',from:{id:777},data:'menu:1',message:{message_id:42,chat:{id:777,type:'private'}}}});assert.equal(app.calls.at(-2).method,'editMessageCaption');assert.equal(app.calls.at(-1).method,'answerCallbackQuery');
 const n=app.calls.length;await app.shopBots.reply(r,{callback_query:{id:'bad',from:{id:888},data:'menu:1',message:{message_id:42,chat:{id:777,type:'private'}}}});assert.equal(app.calls.length,n);
});
test('premium rejection falls back and gateway/webhook conflicts cannot be connected',async t=>{
 let rejectPremium=true;const app=await fixture(t,{call:async(_,method,payload)=>{if(method==='sendAnimation'&&rejectPremium){rejectPremium=false;throw Object.assign(new Error('CUSTOM_EMOJI_INVALID'),{telegramCode:400});}}});
 app.shopBots.setEmojiManifest({claude:{id:'5208665212483310136'}});await app.shopBots.reply(app.shopBots.getRow('123456789'),{message:{chat:{id:777,type:'private'},from:{id:777},text:'/start'}});
 await app.shopBots.reply(app.shopBots.getRow('123456789'),{callback_query:{id:'choose',from:{id:777},data:'language:ru',message:{message_id:1,chat:{id:777,type:'private'}}}});
 assert.equal(app.shopBots.getRow('123456789').emoji_warning,1);assert.ok(!app.calls.filter(c=>c.method==='sendAnimation').at(-1).payload.reply_markup.inline_keyboard.flat().some(b=>b.icon_custom_emoji_id));
 await assert.rejects(()=>app.shopBots.save({token:gateway}),/реквизитов/);
 const conflicting=await fixture(t,{call:async(_,method)=>method==='getWebhookInfo'?{url:'https://old.example/hook'}:undefined});await assert.rejects(()=>conflicting.shopBots.save({token:secondary}),/webhook/);assert.equal(conflicting.shopBots.list().bots.length,1);
});
test('old/group updates ignored, incoming requests durable and duplicates deduplicated',async t=>{
 const app=await fixture(t),r=app.shopBots.getRow('123456789'),date=Math.floor(r.enabled_at/1000);
 const update={update_id:111,message:{date,chat:{id:777,type:'private'},from:{id:777},text:'/start'}};
 app.shopBots.accept(r,{...update,update_id:1,message:{...update.message,date:date-3600}});app.shopBots.accept(r,{...update,update_id:2,message:{...update.message,chat:{id:-1002278926769,type:'supergroup'}}});
 app.shopBots.accept(r,update);app.shopBots.accept(r,update);assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM shop_bot_jobs').get().n,1);
});
test('profile apply changes bot settings only and is protected by seller login',async t=>{
 const app=await fixture(t);assert.equal((await fetch(app.base+'/api/admin/bots')).status,401);
 await app.shopBots.apply('123456789');assert.deepEqual(app.calls.map(c=>c.method),['setMyProfilePhoto','setMyName','setMyDescription','setMyShortDescription','setMyCommands','setChatMenuButton']);
 assert.ok(app.calls.every(c=>!('chat_id' in c.payload)));assert.equal(app.shopBots.getRow('123456789').applied_at>0,true);
});
test('manager button follows the public support contact without changing the seller identity',async t=>{
 const app=await fixture(t);const s=app.db.prepare('SELECT shop,settings FROM state').get();
 const shop={...JSON.parse(s.shop),supportTelegram:'phiKYC'},settings={...JSON.parse(s.settings),sellerUsername:'original_seller'};
 app.db.prepare('UPDATE state SET shop=?,settings=?').run(JSON.stringify(shop),JSON.stringify(settings));
 const menu=app.shopBots.menu(app.shopBots.getRow('123456789'));assert.equal(menu.reply_markup.inline_keyboard.at(-1)[0].url,'https://t.me/phiKYC');assert.equal(JSON.parse(app.db.prepare('SELECT settings FROM state').get().settings).sellerUsername,'original_seller');
});
test('a blocked recipient does not block another private menu and custom avatars remain private',async t=>{
 const app=await fixture(t,{call:async(_,method,payload)=>{if(method==='sendMessage'&&payload.chat_id===777)throw Object.assign(new Error('Forbidden: bot was blocked'),{telegramCode:403});}});
 const r=app.shopBots.getRow('123456789'),date=Math.floor(Date.now()/1000);
 for(const id of [777,888])app.shopBots.accept(r,{update_id:id,message:{date,chat:{id,type:'private'},from:{id},text:'/start'}});
 await app.shopBots.start();
 for(let i=0;i<30&&app.db.prepare("SELECT COUNT(*) n FROM shop_bot_jobs WHERE status='pending'").get().n;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(app.db.prepare('SELECT status FROM shop_bot_jobs WHERE update_id=777').get().status,'failed');
 assert.equal(app.db.prepare('SELECT status FROM shop_bot_jobs WHERE update_id=888').get().status,'done');
 assert.equal((await fetch(app.base+'/api/admin/bots/123456789/avatar')).status,401);
 assert.throws(()=>app.shopBots.saveAvatar('123456789',Buffer.from('<svg/>')),/PNG/);
 app.shopBots.stop();
});
test('private menus follow each sender language without changing other users or the app language',async t=>{
 const app=await fixture(t),r=app.shopBots.getRow('123456789');
 for(const [language,label] of [['en','Claude verification'],['zh-Hans','Claude 验证'],['de','Claude verification'],['ru','Верификация Claude']]){
  await app.shopBots.reply(r,{callback_query:{id:'choose-'+language,from:{id:777,language_code:language},data:'language:'+(language==='zh-Hans'?'zh':language==='de'?'en':language),message:{message_id:1,chat:{id:777,type:'private'}}}});
  const sent=app.calls.filter(c=>c.method==='sendAnimation').at(-1).payload;assert.ok(sent.reply_markup.inline_keyboard[0][0].text.includes(label));
  if(language==='en'||language==='de')assert.match(sent.caption,/digital services/);
 }
 assert.match(app.shopBots.menu(r).caption,/цифровые сервисы/);
});
