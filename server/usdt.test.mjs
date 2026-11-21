import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createApp} from './index.mjs';
import {parseSettings} from './settings.mjs';
import {validTronAddress} from './usdt-settings.mjs';
function tron(byte){const payload=Buffer.concat([Buffer.from([0x41]),Buffer.alloc(20,byte)]),check=createHash('sha256').update(createHash('sha256').update(payload).digest()).digest().subarray(0,4);let n=BigInt('0x'+Buffer.concat([payload,check]).toString('hex')),s='';while(n){s='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(n%58n)]+s;n/=58n;}return s;}
const A=tron(7),B=tron(8),EVM='0x'+'a'.repeat(40);
async function fixture(t,extraEnv={}){let now=Date.now();const calls=[];const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,restockWorker:false,gatewayNow:()=>now,gatewayBotCall:async(method,payload)=>{calls.push({method,payload});return{};},env:{NODE_ENV:'test',GATEWAY_BOT_TOKEN:'fixture-gateway',ADMIN_PASSWORD:'fixture',...extraEnv}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
const s=app.db.prepare('SELECT settings,catalog FROM state').get(),settings={...JSON.parse(s.settings),usdtRubRate:88,usdtTrc20Address:A,usdtBep20Address:EVM},catalog=JSON.parse(s.catalog);const p=catalog.products.find(p=>p.id==='mail-setup');p.price=1500;p.stock=20;p.currency='RUB';app.db.prepare('UPDATE state SET settings=?,catalog=?').run(JSON.stringify(settings),JSON.stringify(catalog));app.gateway.saveConfig({receiptRecipient:'777'});app.gateway.setConnected();
const change=patch=>{const current=JSON.parse(app.db.prepare('SELECT settings FROM state').get().settings);app.db.prepare('UPDATE state SET settings=?').run(JSON.stringify({...current,...patch}));};
const input=(network='trc20',quantity=1)=>({items:[{productId:p.id,quantity}],note:'',method:'usdt',network,expectedRate:88,expectedAmount:17.05*quantity});
const pay=(network='trc20',owner='alice',qty=1)=>app.gateway.create(owner,'111',input(network,qty));
return {...app,g:app.gateway,p,input,pay,change,calls,advance:ms=>{now+=ms;},base:'http://127.0.0.1:'+app.server.address().port};}
test('USDT settings use 88 by default; placeholders stay empty and invalid wallet formats fail',()=>{
assert.equal(parseSettings({}).usdtRubRate,88);assert.equal(parseSettings({}).usdtTrc20Address,'');assert.ok(validTronAddress(A));assert.ok(!validTronAddress(A.slice(0,-1)+'1'));
for(const usdtRubRate of [0,-1,NaN,88.001])assert.throws(()=>parseSettings({usdtRubRate}));
assert.throws(()=>parseSettings({usdtTrc20Address:'T...'}));assert.throws(()=>parseSettings({usdtBep20Address:'0x...'}));assert.equal(parseSettings({usdtTrc20Address:A,usdtBep20Address:EVM}).usdtBep20Address,EVM);
});
test('USDT quotes have no card or expiry and survive feed disconnect, stops and a full day',async t=>{
const f=await fixture(t),p=f.pay('trc20','alice',2);assert.equal(p.amount,34.1);assert.equal(p.currency,'USD');assert.equal(p.provider,'usdt');assert.equal(p.expiresAt,null);assert.equal(p.card,null);assert.equal(p.crypto.address,A);assert.equal(p.crypto.rate,88);
f.g.disconnect();f.advance(86400000);const live=f.g.view(f.g.own(p.id,'alice'));assert.equal(live.status,'awaiting_transfer');assert.equal(live.crypto.address,A);assert.equal(f.pay('trc20','alice',2).id,p.id);
});
test('claim notifies Gateway once and only manager confirmation deducts inventory',async t=>{
const f=await fixture(t),p=f.pay();assert.throws(()=>f.g.reportCryptoPaid(p.id,'other',{}),/не найден/);assert.throws(()=>f.g.reportCryptoPaid(p.id,'alice',{txid:'invalid'}),/хеш/);
assert.equal(f.g.reportCryptoPaid(p.id,'alice',{txid:'f'.repeat(64)}).status,'receipt_review');f.g.reportCryptoPaid(p.id,'alice',{});assert.equal(f.db.prepare("SELECT COUNT(*) n FROM gateway_outbox WHERE kind='crypto_claim'").get().n,1);
assert.equal(JSON.parse(f.db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.id===f.p.id).stock,20);
await f.g.flush();assert.equal(f.calls.length,1);const sent=f.calls[0];assert.equal(sent.method,'sendMessage');assert.equal(sent.payload.chat_id,'777');assert.match(sent.payload.text,/17.05 USDT/);assert.ok(sent.payload.text.includes(A));assert.equal(sent.payload.reply_markup.inline_keyboard[0][0].callback_data,'confirm:'+p.id);
await f.g.processUpdate({callback_query:{id:'bad',from:{id:888},data:'confirm:'+p.id,message:{chat:{id:777,type:'private'}}}});assert.equal(f.g.view(f.g.own(p.id,'alice')).status,'receipt_review');
await f.g.processUpdate({callback_query:{id:'good',from:{id:777},data:'confirm:'+p.id,message:{chat:{id:777,type:'private'}}}});await f.g.confirm(p.id,'777');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM product_purchases').get().n,1);assert.equal(f.g.view(f.g.own(p.id,'alice')).status,'paid');assert.equal(JSON.parse(f.db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.id===f.p.id).stock,19);
});
test('rate changes do not alter issued quotes; address changes hide the old address and late claims retain its snapshot',async t=>{
const f=await fixture(t),p=f.pay();f.change({usdtRubRate:90});let live=f.g.view(f.g.own(p.id,'alice'));assert.equal(live.amount,17.05);assert.equal(live.crypto.rate,88);assert.equal(live.crypto.address,A);
f.change({usdtTrc20Address:B});live=f.g.view(f.g.own(p.id,'alice'));assert.equal(live.status,'invalidated');assert.equal(live.crypto.address,null);f.g.reportCryptoPaid(p.id,'alice',{});const notice=JSON.parse(f.db.prepare("SELECT payload FROM gateway_outbox WHERE kind='crypto_claim'").get().payload);assert.ok(notice.text.includes(A));assert.ok(!notice.text.includes(B));
});
test('missing networks, forged totals and stale rates cannot create a crypto intent',async t=>{
const f=await fixture(t);f.change({usdtTrc20Address:''});assert.throws(()=>f.pay(),/сеть пока недоступна/);assert.throws(()=>f.g.create('alice','111',{...f.input('bep20'),expectedAmount:1}),/Стоимость изменилась/);assert.throws(()=>f.g.create('alice','111',{...f.input('bep20'),expectedRate:89}),/Курс изменился/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payments').get().n,0);
assert.equal(f.pay('bep20').crypto.address,EVM);
});
test('switch to a card keeps the 15-minute flow; late USDT claims freeze that card and fulfil only once',async t=>{
const f=await fixture(t);f.g.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(Date.now()/1000),text:'Реквизиты №1\n🇷🇺 Россия\n🏦 Банк: Сбер\n┗ ФИО: Иван С\n💳 Карта: 2200000000000001\n✅ Мин: 1 000 ₽\n⛔️ Макс: 8 000 ₽'},1);
const p=f.pay();assert.throws(()=>f.g.retry(p.id,'alice',{method:'card',accepted:true}),/ещё не отправлен/);
const card=f.g.retry(p.id,'alice',{method:'card',accepted:true,notPaid:true});assert.equal(card.currency,'RUB');assert.equal(card.amount,1500);assert.equal(card.expiresAt-card.serverNow,900000);assert.ok(card.card);
f.g.reportCryptoPaid(p.id,'alice',{});assert.equal(f.g.view(f.g.own(card.id,'alice')).card,null);assert.throws(()=>f.g.retry(card.id,'alice',{method:'usdt',network:'bep20',notPaid:true,expectedRate:88}),/проверяем вашу оплату/);
await f.g.confirm(p.id,'777');await f.g.confirm(card.id,'777');assert.equal(JSON.parse(f.db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.id===f.p.id).stock,19);
});
test('USDT wallet topups credit frozen RUB value once after confirmation and retain idempotency',async t=>{
const f=await fixture(t),input={amount:'10',requestKey:randomUUID(),method:'usdt',network:'bep20',currency:'USD',expectedRate:88};const p=f.g.createTopup('alice','111',input);assert.equal(p.amount,10);assert.equal(p.crypto.rubCreditMinor,88000);assert.equal(f.g.wallet('alice').balance,0);assert.equal(f.g.createTopup('alice','111',input).id,p.id);
f.change({usdtRubRate:95});f.g.reportCryptoPaid(p.id,'alice',{});await f.g.confirm(p.id,'777');await f.g.confirm(p.id,'777');assert.equal(f.g.wallet('alice').balance,880);
});
test('public settings expose exchange rate and availability without exposing deposit addresses',async t=>{
const f=await fixture(t),res=await fetch(f.base+'/api/public').then(r=>r.json());assert.equal(res.settings.usdtRubRate,88);assert.deepEqual(res.settings.usdtNetworks,{trc20:true,bep20:true});assert.ok(!JSON.stringify(res).includes(A));assert.ok(!JSON.stringify(res).includes(EVM));
const p=f.pay();assert.equal((await fetch(f.base+'/api/payments/'+p.id+'/reported',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
});
test('explicit RUB card checkout can settle a mixed basket at the configured rate',async t=>{
const f=await fixture(t),catalog=JSON.parse(f.db.prepare('SELECT catalog FROM state').get().catalog),other=catalog.products.find(p=>p.id==='claude-pro');other.currency='USD';other.price=20;other.stock=10;f.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));
const p=f.g.create('alice','111',{items:[{productId:f.p.id,quantity:1},{productId:other.id,quantity:1}],note:'',method:'card',settlementCurrency:'RUB',accepted:true,expectedRate:88,expectedAmount:3260});
assert.equal(p.currency,'RUB');assert.equal(p.amount,3260);assert.equal(p.items[1].currency,'USD');
});

test('reopening a topup after several wallet changes returns its current attempt, not a superseded ancestor',async t=>{
 const f=await fixture(t),input={amount:'10',requestKey:randomUUID(),method:'usdt',network:'trc20',currency:'USD',expectedRate:88};
 const first=f.g.createTopup('alice','111',input);f.change({usdtTrc20Address:B});
 const second=f.g.retry(first.id,'alice',{method:'usdt',network:'trc20',notPaid:true,expectedRate:88});
 f.change({usdtTrc20Address:tron(9)});const third=f.g.retry(second.id,'alice',{method:'usdt',network:'trc20',notPaid:true,expectedRate:88});
 assert.equal(f.g.createTopup('alice','111',input).id,third.id);
 assert.equal(f.g.retry(first.id,'alice',{method:'usdt',network:'trc20',notPaid:true,expectedRate:88}).id,third.id);
 f.g.reportCryptoPaid(first.id,'alice',{});assert.equal(f.g.view(f.g.own(third.id,'alice')).crypto.address,null);
 assert.equal(f.g.createTopup('alice','111',input).status,'receipt_review');assert.equal(f.g.createTopup('alice','111',input).id,first.id);
 assert.throws(()=>f.g.retry(third.id,'alice',{method:'usdt',network:'bep20',notPaid:true,expectedRate:88}),/проверяем вашу оплату/);
 await f.g.confirm(first.id,'777');await f.g.confirm(third.id,'777');assert.equal(f.g.wallet('alice').balance,880);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM wallet_ledger').get().n,1);
});

test('a disabled network hides only its own address and recovery keeps the frozen amount and rate',async t=>{
 const f=await fixture(t),trc=f.pay('trc20','alice'),bep=f.pay('bep20','bob');
 f.change({usdtTrc20Address:'',usdtRubRate:99});f.advance(86400000);
 assert.equal(f.g.view(f.g.own(trc.id,'alice')).crypto.address,null);assert.equal(f.g.view(f.g.own(bep.id,'bob')).crypto.address,EVM);
 const next=f.g.retry(trc.id,'alice',{method:'usdt',network:'bep20',notPaid:true,expectedRate:99});
 assert.equal(next.amount,trc.amount);assert.equal(next.crypto.rate,88);assert.equal(next.crypto.network,'bep20');assert.equal(next.crypto.address,EVM);assert.equal(next.expiresAt,null);
 f.change({usdtTrc20Address:A});assert.equal(f.g.view(f.g.own(trc.id,'alice')).crypto.address,null);
});

test('fresh card checkout honours an explicit switch from an active USDT quote and a late crypto report still settles once',async t=>{
 const f=await fixture(t),access=await fetch(f.base+'/api/access'),cookie=access.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),owner=f.db.prepare('SELECT id FROM visitors WHERE token=?').get(createHash('sha256').update(cookie.split('=')[1]).digest('hex')).id;
 const before=f.g.create(owner,'111',f.input());
 f.g.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(Date.now()/1000),text:'Реквизиты №1\nБанк: Сбербанк\nФИО: Тест Т\nКарта: +7 (999) 123-45-67\nМин: 1 000 ₽\nМакс: 8 000 ₽'},1);f.g.setConnected();
 const input={...f.input(),method:'card',settlementCurrency:'RUB',accepted:true,expectedAmount:1500};
 const request=()=>fetch(f.base+'/api/payments',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(input)});
 assert.equal((await(await request()).json()).id,before.id);
 input.notPaid=true;const response=await request();assert.equal(response.status,201);const next=await response.json();assert.equal(next.card.type,'phone');assert.equal(next.expiresAt-next.serverNow,900000);
 assert.equal((await(await request()).json()).id,next.id);assert.equal(f.g.view(f.g.own(before.id,owner)).replacementId,next.id);
 f.g.reportCryptoPaid(before.id,owner,{});await f.g.confirm(before.id,'777');await f.g.confirm(next.id,'777');assert.equal(JSON.parse(f.db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.id===f.p.id).stock,19);
});

test('renewal cannot issue another address for sold-out or hidden goods; an issued quote keeps its agreed price',async t=>{
 const f=await fixture(t),first=f.pay();f.change({usdtTrc20Address:B});f.g.view(f.g.own(first.id,'alice'));
 const catalog=JSON.parse(f.db.prepare('SELECT catalog FROM state').get().catalog),product=catalog.products.find(p=>p.id===f.p.id),retry=()=>f.g.retry(first.id,'alice',{method:'usdt',network:'trc20',notPaid:true,expectedRate:88});
 product.stock=0;f.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));assert.throws(retry,/наличие/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payments').get().n,1);
 product.stock=20;product.visible=false;f.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));assert.throws(retry,/наличие/);
 product.visible=true;product.price=2000;f.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));const next=retry();assert.equal(next.amount,first.amount);assert.equal(next.crypto.address,B);
});

test('standby masks customer transfer addresses without deleting frozen payment data',async t=>{
 const f=await fixture(t,{INSTANCE_MODE:'standby'}),payment=f.pay();assert.equal(payment.crypto.address,null);assert.equal(payment.status,'awaiting_transfer');assert.equal(payment.expiresAt,null);
 assert.equal(JSON.parse(f.g.externalRow(payment.id).crypto).address,A);assert.equal(f.g.wallet('alice').balance,0);
});
