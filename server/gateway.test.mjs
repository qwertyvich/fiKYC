import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.mjs';
import { parseFeed } from './gateway/parser.mjs';

const A = '2200000000000001', B = '2200000000000002';
const card = (number = A, max = '8 000', bank = 'Т банк', holder = 'Иван С') => `Реквизиты №1\n🇷🇺 Россия\n🏦 Банк: ${bank}\n┗ ФИО: ${holder}\n💳 Карта: ${number}\n✅ Мин: 1 000 ₽\n⛔️ Макс: ${max} ₽`;
const stop = (number = '') => `💳 Реквизиты ${number}\nвременно недоступны ⛔️\n\nНе совершайте перевод. Дождитесь уведомления о новых реквизитах.`;
async function fixture(t) {
  let clock = Date.now(), update = 0;
  const calls = [];
  const app = await createApp({ dbPath: ':memory:', gatewayWorker: false, gatewayNow: () => clock, gatewayBotCall: async (method, payload) => { calls.push({ method, payload }); return {}; }, env: { NODE_ENV: 'test', GATEWAY_BOT_TOKEN: 'test-token' } });
  const {db, gateway: g} = app;
  t.after(() => {g.stop(); db.close();});
  g.saveConfig({ enabled: true, receiptRecipient: '777' }); g.setConnected();
  const s = JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog);
  const p = s.products.find(p => p.saleMode !== 'request');
  p.price = 5000; p.currency = 'RUB'; p.stock = 50; p.visible = true;
  s.groups.find(v => v.id === p.groupId).visible = true;
  db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(s));
  const feed = (text, extra = {}) => g.receiveFeed({chat: {id: -1002278926769}, from: {id: 333, username: 'feweqw34234_bot'}, date: Math.floor(clock / 1000), text, ...extra}, ++update);
  const input = (qty = 1) => ({items: [{productId: p.id, quantity: qty}], note: '', expectedAmount: p.price * qty, accepted: true});
  const pay = (visitor = 'alice', qty = 1) => g.create(visitor, visitor === 'alice' ? '111' : '222', input(qty));
  return {...app, g, calls, feed, input, pay, p, clock: () => clock, advance: ms => {clock += ms;g.setConnected();}};
}
test('parser handles cards, formatted digits, stops with remaining cards, global stop and malformed announcements', () => {
  assert.equal(parseFeed('/card@feweqw34234_bot'), null);
  assert.equal(parseFeed('погоди, не стоп'), null);
  assert.equal(parseFeed(card()).cards[0].maxMinor, 800000);
  assert.equal(parseFeed(card(A) + '\n────────\n' + card(B)).cards.length, 2);
  assert.equal(parseFeed(card(A.replace(/(.{4})/g, '$1 '))).cards[0].number, A);
  assert.deepEqual(parseFeed(stop(A)), {kind: 'stop',stopCard:A,cards:[],snapshot:false});
  assert.equal(parseFeed(stop()).stopCard, null);
  const remaining = parseFeed(stop(B) + '\nАктуальные реквизиты:\n' + card(A));
  assert.equal(remaining.snapshot, true); assert.equal(remaining.cards[0].number,A);
  assert.equal(parseFeed(card().replace('8 000','500')).kind,'invalid');
  assert.equal(parseFeed('Реквизиты №1\n🏦 Банк: Сбер').kind,'invalid');
});
test('random eligible selection, authoritative replacement, trust and idempotent order creation', async t => {
  const f = await fixture(t); const {g,feed,pay} = f;
  feed(card(A) + '\n' + card(B));
  const chosen = new Set(Array.from({length:60}, (_, i) => pay('visitor-' + i).card.number));
  assert.equal(chosen.size, 2);
  const p = pay(); assert.equal(pay().id, p.id);
  assert.throws(() => g.own(p.id,'other'), /не найден/);
  feed(stop(p.card.number), {from: {id:555,username:'attacker'}});
  assert.ok(g.view(g.own(p.id,'alice')).card);
  feed(stop(p.card.number), {chat: {id:-1005555555555}});
  assert.ok(g.view(g.own(p.id,'alice')).card);
  feed(stop(p.card.number));
  const stopped = g.view(g.own(p.id,'alice')); assert.equal(stopped.status,'invalidated'); assert.equal(stopped.card,null);
  feed(card(p.card.number)); // Reactivation never revives an old issued session.
  assert.equal(g.view(g.own(p.id,'alice')).status,'invalidated');
  const next = g.retry(p.id,'alice',{notPaid:true,accepted:true}); assert.ok(next.card);
  assert.equal(g.retry(p.id,'alice',{notPaid:true,accepted:true}).id,next.id);
  assert.equal(g.view(g.own(p.id,'alice')).status,'superseded');
});
test('limit increases preserve sessions, reductions only revoke incompatible amounts; no eligible card goes to manager', async t => {
  const {g,feed,pay,advance} = await fixture(t);
  feed(card()); const p = pay();
  advance(1000); feed(card(A,'10 000')); assert.ok(g.view(g.own(p.id,'alice')).card);
  const big = pay('big',2); assert.ok(big.card);
  advance(1000); feed(card(A,'8 000'));
  assert.equal(g.view(g.own(big.id,'big')).status,'invalidated'); assert.ok(g.view(g.own(p.id,'alice')).card);
  const manual = pay('large',2); assert.equal(manual.status,'manual_review'); assert.equal(manual.card,null);
  assert.equal(g.admin().payments.find(v => v.id === manual.id).amount,10000);
});
test('expiration hides number, receipt accepted after expiry, upload persists and retries delivery, confirmation is atomic', async t => {
  const {g,feed,pay,advance,db,calls} = await fixture(t);
  feed(card()); const p = pay(); advance(900001);
  const expired = g.view(g.own(p.id,'alice')); assert.equal(expired.status,'awaiting_receipt'); assert.equal(expired.card,null);
  assert.throws(() => g.retry(p.id,'alice',{notPaid:false,accepted:true}),/Подтвердите/);
  assert.throws(() => g.upload(p.id,'alice',Buffer.from('bad file')),/Прикрепите/);
  const uploaded = g.upload(p.id,'alice',Buffer.from('%PDF-1.4\nfixture'));
  assert.equal(uploaded.status,'receipt_review'); assert.equal(uploaded.deliveryPending,true);
  assert.throws(() => g.retry(p.id,'alice',{notPaid:true,accepted:true}),/недоступна/);
  await g.flush(); assert.ok(calls.some(c=> c.method === 'sendDocument')); assert.equal(g.view(g.own(p.id,'alice')).deliveryPending,false);
  const stock = JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog).products.find(v => v.id===p.items[0].productId).stock;
  await g.confirm(p.id,'777'); await g.confirm(p.id,'777');
  assert.equal(g.view(g.own(p.id,'alice')).status,'paid');
  assert.equal(JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog).products.find(v => v.id===p.items[0].productId).stock,stock-1);
});
test('connection loss and malformed feed revoke all issued cards; unavailable feed never supplies persisted details', async t => {
  const {g,feed,pay,advance} = await fixture(t);
  feed(card()); const p = pay(); g.disconnect();
  assert.equal(g.view(g.own(p.id,'alice')).card,null);
  g.setConnected(); assert.ok(pay('new').card); // The drained update stream can recover a known card; old attempts stay revoked.
  advance(1001); feed(card()); assert.ok(pay('after').card);
  feed('Реквизиты №1\n🏦 Банк: Сбер'); assert.equal(g.view(g.own(p.id,'alice')).card,null); assert.equal(pay('invalid').status,'manual_review');
});
test('Telegram receipt belongs to signed order owner, username recipient binds to ID and does not follow renamed accounts', async t => {
  const {g,feed,pay,db} = await fixture(t);
  g.saveConfig({receiptRecipient:'@tcmai'});
  await g.processUpdate({update_id:99,message:{message_id:1,chat:{id:777,type:'private'},from:{id:777,username:'tcmai'},text:'/start'}});
  assert.equal(g.admin().recipientReady,true);
  feed(card()); const p = pay();
  const token = db.prepare('SELECT receipt_token FROM payments WHERE id=?').get(p.id).receipt_token;
  await g.processUpdate({update_id:100,message:{chat:{id:222,type:'private'},from:{id:222},text:'/start receipt_'+token}});
  assert.equal(db.prepare('SELECT * FROM gateway_bindings WHERE telegram_id=?').get('222'),undefined);
  await g.processUpdate({update_id:101,message:{message_id:2,chat:{id:111,type:'private'},from:{id:111},text:'/start receipt_'+token}});
  const receipt = {update_id:102,message:{message_id:3,chat:{id:111,type:'private'},from:{id:111},photo:[{file_id:'receipt-file',file_size:12}]}};
  await g.processUpdate(receipt); await g.processUpdate(receipt);
  assert.equal(g.view(g.own(p.id,'alice')).receiptCount,1);
  await g.processUpdate({update_id:103,callback_query:{id:'attack',from:{id:888,username:'tcmai'},message:{chat:{id:888}},data:'confirm:'+p.id}});
  assert.equal(g.view(g.own(p.id,'alice')).status,'receipt_review');
  await g.processUpdate({update_id:104,callback_query:{id:'ok',from:{id:777},message:{chat:{id:777}},data:'confirm:'+p.id}});
  assert.equal(g.view(g.own(p.id,'alice')).status,'paid');
});
test('stale messages cannot resurrect a stopped card and snapshots remove absent cards', async t => {
  const {g,feed,pay,advance,clock} = await fixture(t);
  feed(card(A)+'\n'+card(B)); const p = pay();
  advance(2000); feed(stop(p.card.number));
  feed(card(p.card.number), {date: Math.floor((clock()-1000)/1000)});
  assert.equal(g.admin().cards.find(c=>c.last4===p.card.number.slice(-4)).active,false);
  advance(1000); feed(card(A)); assert.equal(g.admin().cards.find(c=>c.last4===B.slice(-4)).active,false);
  feed(stop()); assert.equal(g.admin().cards.some(c=>c.active),false);
});
test('receipt delivery failures stay durable and back off without losing files', async t => {
  let fail = true, at = Date.now();
  const app = await createApp({dbPath:':memory:',gatewayWorker:false,gatewayNow:()=>at,gatewayBotCall:async()=>{if(fail) throw new Error('network');return{};},env:{NODE_ENV:'test',GATEWAY_BOT_TOKEN:'test'}});
  t.after(()=>{app.gateway.stop();app.db.close();});
  const g=app.gateway; g.saveConfig({receiptRecipient:'777'});
  const s=JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog),p=s.products.find(p=>p.saleMode!=='request');p.stock=10;p.price=1000;p.currency='RUB';app.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(s));
  const pay=g.create('v','123',{items:[{productId:p.id,quantity:1}],expectedAmount:1000,note:'',accepted:true});
  g.upload(pay.id,'v',Buffer.from('%PDF-1.4\nreceipt'));await g.flush();
  assert.equal(g.view(g.own(pay.id,'v')).deliveryPending,true);
  assert.equal(app.db.prepare('SELECT count(*) n FROM gateway_receipt_files').get().n,1);
  fail=false;at+=300000;await g.flush();assert.equal(g.view(g.own(pay.id,'v')).deliveryPending,false);
});
test('replays all sanitized announcements from the supplied Nov 4–8 chat export, ending with every card stopped', async t => {
  const {g,feed,advance} = await fixture(t);
  const scenarios = JSON.parse(await readFile(new URL('./fixtures/feed-scenarios.json',import.meta.url),'utf8'));
  for (const [index, scenario] of scenarios.entries()) {
    advance(1000); assert.equal(feed(scenario.text),true,`event ${index}`);
    const active = g.admin().cards.filter(c=>c.active).map(c=>'220000000000'+c.last4).sort();
    assert.deepEqual(active,scenario.active,`source event ${index}: ${scenario.text.split('\n')[0]}`);
  }
  assert.equal(g.admin().cards.some(c=>c.active),false);
});
test('a receipt for an earlier attempt freezes the new transfer and confirmation across attempts deducts stock once', async t => {
  const {g,feed,pay,advance,db} = await fixture(t);
  feed(card()); const first=pay();advance(900001);g.view(g.own(first.id,'alice'));feed(card());
  const next=g.retry(first.id,'alice',{notPaid:true,accepted:true});assert.ok(next.card);
  g.upload(first.id,'alice',Buffer.from('%PDF-1.4\nearlier receipt'));
  assert.equal(g.view(g.own(next.id,'alice')).card,null);
  assert.throws(()=>g.retry(next.id,'alice',{notPaid:true,accepted:true}),/недоступна/);
  g.upload(next.id,'alice',Buffer.from('%PDF-1.4\nsame transfer'));
  const getStock=()=>JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.id===first.items[0].productId).stock;
  const stock=getStock();await g.confirm(first.id,'777');await g.confirm(next.id,'777');assert.equal(getStock(),stock-1);assert.equal(g.view(g.own(next.id,'alice')).status,'paid');
});

test('payment HTTP endpoints enforce ownership, server prices, private settings and binary receipt format', async t => {
  const {server,db,gateway:g} = await createApp({dbPath:':memory:',gatewayWorker:false,env:{NODE_ENV:'test',GATEWAY_BOT_TOKEN:'must-not-leak',ADMIN_PASSWORD:'fixture'}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  const publicRes=await fetch(base+'/api/public');const publicText=await publicRes.text();assert.ok(!publicText.includes('must-not-leak'));assert.ok(!publicText.includes('receiptRecipient'));
  const cookie=publicRes.headers.getSetCookie()[0].split(';')[0];
  const catalog=JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog),product=catalog.products.find(p=>p.saleMode!=='request');product.price=5000;product.currency='RUB';product.stock=20;db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));
  const input={items:[{productId:product.id,quantity:1}],note:'',expectedAmount:5000,accepted:true};
  const request=(path,method='GET',data)=>fetch(base+'/api'+path,{method,headers:{Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  assert.equal((await request('/payments','POST',{...input,expectedAmount:1})).status,409);
  const created=await request('/payments','POST',input);assert.equal(created.status,201);const p=await created.json();assert.ok(!JSON.stringify(p).includes('GatewayReqBot'));assert.equal(p.receiptUrl,undefined);
  assert.equal((await fetch(base+'/api/payments/'+p.id)).status,404);
  assert.equal((await fetch(base+'/api/payments/'+p.id+'/receipt',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/pdf'},body:'not-a-pdf'})).status,400);
  assert.equal((await fetch(base+'/api/payments/'+p.id+'/receipt',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/pdf'},body:'%PDF-1.4\nreceipt'})).status,201);
  assert.equal((await request('/payments/'+p.id)).status,200);
  assert.equal((await request('/admin/gateway')).status,401);
  const fileId=g.receipts(p.id)[0].id;
  assert.equal((await request('/admin/gateway/receipts/'+fileId)).status,401);
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'fixture'})});
  assert.equal(login.status,200);const adminCookie=login.headers.getSetCookie().find(v=>v.startsWith('fikus_admin=')).split(';')[0];
  const file=await fetch(base+'/api/admin/gateway/receipts/'+fileId,{headers:{Cookie:adminCookie}});assert.equal(file.status,200);assert.equal(await file.text(),'%PDF-1.4\nreceipt');

});

test('signed Telegram owners can resume payments across devices while another Telegram account is denied', async t => {
  const botToken='isolated-shop-token';
  const {server,db} = await createApp({dbPath:':memory:',gatewayWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:botToken,GATEWAY_BOT_TOKEN:''}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  const proof=id=>{const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Buyer'})});const secret=createHmac('sha256','WebAppData').update(botToken).digest();p.set('hash',createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));return p.toString();};
  const catalog=JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog),p=catalog.products.find(p=>p.saleMode!=='request');p.price=5000;p.currency='RUB';p.stock=20;db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));
  const created=await fetch(base+'/api/payments',{method:'POST',headers:{'X-Telegram-Init-Data':proof(123),'Content-Type':'application/json'},body:JSON.stringify({items:[{productId:p.id,quantity:1}],expectedAmount:5000,note:'',accepted:true})});assert.equal(created.status,201);const payment=await created.json();
  const device=await fetch(base+'/api/payments/'+payment.id,{headers:{'X-Telegram-Init-Data':proof(123)}});assert.equal(device.status,200);
  const cookie=device.headers.getSetCookie()[0].split(';')[0];assert.equal((await fetch(base+'/api/payments/'+payment.id,{headers:{Cookie:cookie}})).status,200);
  const other=await fetch(base+'/api/payments/'+payment.id,{headers:{'X-Telegram-Init-Data':proof(456)}});assert.equal(other.status,404);
});
test('a quiet read-only source does not expire a valid 15-minute transfer while Telegram remains connected', async t => {
  const {g,feed,pay,advance} = await fixture(t);
  feed(card()); const p=pay();advance(90001);
  assert.equal(g.view(g.own(p.id,'alice')).status,'awaiting_transfer');
  assert.ok(g.view(g.own(p.id,'alice')).card);
  assert.equal(g.admin().pendingDeliveries,0);
});

test('source group is strictly read-only: old command jobs are cancelled and transport blocks all outbound messages to it', async t => {
  const {g,db,calls,feed,input}=await fixture(t);
  assert.throws(()=>g.saveConfig({receiptRecipient:'-1002278926769'}),/только для чтения/);
  db.prepare("INSERT INTO gateway_outbox(id,kind,payment_id,payload) VALUES(?,?,?,?)").run('legacy-source','source','',JSON.stringify({chat_id:'-1002278926769',text:'/card@feweqw34234_bot'}));
  feed(card());g.create('invalid-target','-1002278926769',input());g.disconnect();await g.flush();
  assert.equal(db.prepare("SELECT status FROM gateway_outbox WHERE id='legacy-source'").get().status,'cancelled');
  assert.equal(calls.some(c=>String(c.payload?.chat_id ?? '')==='-1002278926769'),false);
  assert.equal(db.prepare("SELECT count(*) n FROM gateway_outbox WHERE kind='customer' AND status='sent'").get().n,0);
});

test('owner bootstrap makes an in-range card available without a connected receipt recipient and has a bounded lifetime', async t => {
  const {g,pay,advance,db} = await fixture(t);
  g.saveConfig({receiptRecipient:'@not_connected'});
  assert.equal(g.admin().recipientReady,false);
  assert.throws(()=>g.bootstrap(card(A,'7 000'),'owner',false),/Подтвердите/);
  g.bootstrap(card(A,'7 000'),'owner',true);
  const p=pay();assert.equal(p.status,'awaiting_transfer');assert.ok(p.card);assert.equal(p.receiptUrl,undefined);
  g.upload(p.id,'alice',Buffer.from('%PDF-1.4\nreceipt'));await g.flush();
  assert.equal(g.view(g.own(p.id,'alice')).deliveryPending,true);
  assert.equal(g.receipts(p.id).length,1);assert.equal(g.receiptFile(g.receipts(p.id)[0].id).mime,'application/pdf');
  const another=pay('another');advance(900001);assert.equal(g.view(g.own(another.id,'another')).card,null);
  assert.equal(pay('after-expiry').status,'manual_review');
  assert.equal(db.prepare('SELECT count(*) n FROM gateway_cards WHERE active=1').get().n,0);
});

test('incoming stop overrides a private bootstrap and cannot be undone by importing the old card again', async t => {
  const {g,feed,pay}=await fixture(t);
  g.bootstrap(card(),'owner',true);const p=pay();feed(stop(A));
  assert.equal(g.view(g.own(p.id,'alice')).card,null);
  assert.throws(()=>g.bootstrap(card(),'owner',true),/уже передал/);
});

test('manual fallback can be retried explicitly when details arrive, without duplicating unavailable requests', async t => {
  const {g,pay,db}=await fixture(t);
  const p=pay();assert.equal(p.reason,'source_unseen');
  const jobs=db.prepare("SELECT count(*) n FROM gateway_outbox WHERE kind='manual'").get().n;
  assert.throws(()=>g.retry(p.id,'alice',{accepted:true,notPaid:true}),/пока недоступны/);
  assert.equal(db.prepare("SELECT count(*) n FROM gateway_outbox WHERE kind='manual'").get().n,jobs);
  g.bootstrap(card(),'owner',true);
  assert.throws(()=>g.retry(p.id,'alice',{accepted:true,notPaid:false}),/Подтвердите/);
  const next=g.retry(p.id,'alice',{accepted:true,notPaid:true});assert.ok(next.card);
  assert.equal(g.retry(p.id,'alice',{accepted:true,notPaid:true}).id,next.id);
});

test('delayed genuine updates are applied, rejected source messages are diagnosable, and stale snapshots cannot undo a stop', async t => {
  const {g,feed,pay,clock,db}=await fixture(t);
  feed(card(),{date:Math.floor((clock()-180000)/1000)});assert.ok(pay().card);
  feed(stop(A));
  feed(card(),{date:Math.floor((clock()-120000)/1000)});assert.equal(pay('after-stop').status,'manual_review');
  feed(card(),{from:{id:999,username:'other_bot'}});
  const inbox=db.prepare('SELECT outcome FROM gateway_inbox ORDER BY update_id DESC LIMIT 1').get();assert.equal(inbox.outcome,'untrusted_sender');
  assert.ok(g.admin().lastSourceMessageAt);assert.ok(!JSON.stringify(g.admin().inbox).includes(A));
});

test('known source cards survive a short restart after catch-up, but old attempts and stale checkpoints never revive', async t => {
  const dir=await mkdtemp(join(tmpdir(),'fikus-source-cache-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'db.sqlite');let at=Date.now();
  const options={dbPath:path,gatewayWorker:false,gatewayNow:()=>at,env:{NODE_ENV:'test',GATEWAY_BOT_TOKEN:'test'}};
  let app=await createApp(options);app.gateway.setConnected();
  app.gateway.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(at/1000),text:card()},1);
  app.gateway.stop();app.db.close();at+=30000;
  app=await createApp(options);app.gateway.setConnected();assert.equal(app.gateway.admin().cards[0].active,true);
  app.gateway.stop();app.db.close();at+=24*3600000;
  app=await createApp(options);app.gateway.setConnected();assert.equal(app.gateway.admin().cards[0].active,false);
  app.gateway.stop();app.db.close();
});

test('a transfer issued ten minutes after bootstrap still gets a full 15 minutes; bootstrap admission closes separately', async t => {
  const {g,pay,advance,feed,clock}=await fixture(t);
  g.bootstrap(card(),'owner',true);
  advance(10*60000);
  const p=pay();assert.equal(p.expiresAt-p.serverNow,15*60000);
  advance(6*60000);
  const ongoing=g.view(g.own(p.id,'alice'));assert.equal(ongoing.status,'awaiting_transfer');assert.ok(ongoing.card);assert.equal(ongoing.expiresAt-clock(),9*60000);
  const next=pay('later');assert.equal(next.status,'manual_review');assert.equal(next.reason,'source_confirmation_expired');
  feed(stop(A));assert.equal(g.view(g.own(p.id,'alice')).status,'invalidated');assert.equal(g.view(g.own(p.id,'alice')).card,null);
});

test('bootstrap admission expiry never shortens an issued transfer and refresh never extends its 15 minutes', async t => {
  const {g,pay,advance,db}=await fixture(t);
  g.bootstrap(card(),'owner',true);advance(14*60000);
  const p=pay();assert.equal(p.expiresAt-p.serverNow,900000);
  advance(2*60000);assert.ok(g.view(g.own(p.id,'alice')).card);assert.equal(pay().expiresAt,p.expiresAt);
  advance(13*60000+1);const expired=g.view(g.own(p.id,'alice'));assert.equal(expired.status,'awaiting_receipt');assert.equal(expired.card,null);
  assert.equal(db.prepare('SELECT count(*) n FROM gateway_cards WHERE active=1').get().n,0);
  assert.equal(pay('after').status,'manual_review');
});

test('legacy five-minute cap is corrected to the original issue time plus 15 minutes without reopening admission', async t => {
  const {g,pay,advance,db,clock}=await fixture(t);
  g.bootstrap(card(),'owner',true);advance(10*60000);const p=pay();
  const cutoff=Number(db.prepare("SELECT value FROM gateway_meta WHERE key='bootstrapExpiresAt'").get().value);
  db.prepare('UPDATE payments SET expires_at=? WHERE id=?').run(cutoff,p.id);
  g.disconnect('restart');g.setConnected();assert.equal(g.repairShortenedTimers(),1);
  const fixed=g.view(g.own(p.id,'alice'));assert.equal(fixed.expiresAt-fixed.createdAt,900000);assert.ok(fixed.card);
  advance(6*60000);assert.ok(g.view(g.own(p.id,'alice')).card);assert.equal(pay('new').status,'manual_review');
  assert.equal(g.repairShortenedTimers(),0);
});

test('legacy internally expired cap can be repaired only within its original 15-minute window; source stops never revive', async t => {
  const {g,pay,advance,db,feed}=await fixture(t);
  g.bootstrap(card(),'owner',true);advance(10*60000);const p=pay();
  const cutoff=Number(db.prepare("SELECT value FROM gateway_meta WHERE key='bootstrapExpiresAt'").get().value);
  db.prepare("UPDATE payments SET expires_at=?,status='awaiting_receipt',reason='expired' WHERE id=?").run(cutoff,p.id);
  db.prepare('UPDATE gateway_cards SET active=0,version=version+1').run();
  db.prepare("DELETE FROM gateway_meta WHERE key='bootstrapExpiresAt'").run();advance(6*60000);
  assert.equal(g.repairShortenedTimers(),1);assert.ok(g.view(g.own(p.id,'alice')).card);
  feed(stop(A));assert.equal(g.repairShortenedTimers(),0);assert.equal(g.view(g.own(p.id,'alice')).card,null);
});

test('topups use the same 15-minute card flow and credit exactly once only after receipt confirmation', async t => {
  const {g,feed,db}=await fixture(t);feed(card());
  const catalogBefore=db.prepare('SELECT catalog,revision FROM state').get();
  const input={amount:'1 500,50',requestKey:randomUUID(),accepted:true};
  const p=g.createTopup('alice','111',input);assert.equal(p.purpose,'topup');assert.equal(p.amount,1500.5);assert.ok(p.card);assert.equal(p.expiresAt-p.createdAt,900000);
  assert.equal(g.createTopup('alice','111',input).id,p.id);
  assert.equal(g.createTopup('alice','111',{...input,requestKey:input.requestKey.toUpperCase()}).id,p.id);
  assert.throws(()=>g.createTopup('alice','111',{...input,amount:'2000'}),/Сумма изменилась/);
  assert.equal(g.wallet('alice').balance,0);assert.throws(()=>g.own(p.id,'bob'),/не найден/);
  await assert.rejects(g.confirm(p.id,'777'),/квитанции/);
  g.upload(p.id,'alice',Buffer.from('%PDF-1.4\nreceipt'));assert.equal(g.wallet('alice').balance,0);
  await g.confirm(p.id,'777');await g.confirm(p.id,'777');
  assert.equal(g.wallet('alice').balance,1500.5);assert.equal(g.wallet('alice').entries.length,1);assert.equal(g.wallet('bob').balance,0);
  assert.equal(g.createTopup('alice','111',input).id,p.id);assert.equal(g.wallet('alice').balance,1500.5);
  assert.deepEqual(db.prepare('SELECT catalog,revision FROM state').get(),catalogBefore);
});

test('topup stops, amount limits, expiry and retries preserve the purpose and never duplicate a wallet credit', async t => {
  const {g,feed,advance}=await fixture(t);feed(card());
  assert.equal(g.createTopup('large','222',{amount:'10000',requestKey:randomUUID(),accepted:true}).status,'manual_review');
  const first=g.createTopup('alice','111',{amount:'3500',requestKey:randomUUID(),accepted:true});
  feed(stop(first.card.number));assert.equal(g.view(g.own(first.id,'alice')).card,null);
  feed(card());const next=g.retry(first.id,'alice',{notPaid:true,accepted:true});assert.equal(next.purpose,'topup');assert.ok(next.card);
  g.upload(first.id,'alice',Buffer.from('%PDF-1.4\nreceipt'));assert.equal(g.view(g.own(next.id,'alice')).card,null);
  g.upload(next.id,'alice',Buffer.from('%PDF-1.4\nsecond scan'));await g.confirm(next.id,'777');await g.confirm(first.id,'777');
  assert.equal(g.wallet('alice').balance,3500);assert.equal(g.wallet('alice').entries.length,1);
  const late=g.createTopup('alice','111',{amount:'1250',requestKey:randomUUID(),accepted:true});advance(900001);assert.equal(g.view(g.own(late.id,'alice')).status,'awaiting_receipt');
  g.upload(late.id,'alice',Buffer.from('%PDF-1.4\nlate receipt'));await g.confirm(late.id,'777');assert.equal(g.wallet('alice').balance,4750);
});

test('invalid topup input cannot create an intent or affect balances', async t => {
  const {g,db}=await fixture(t);
  for(const amount of ['0','-5','Infinity','1e3','1.234','1000001'])assert.throws(()=>g.createTopup('alice','111',{amount,accepted:true,requestKey:randomUUID()}));
  assert.throws(()=>g.createTopup('alice','111',{amount:'1500',accepted:false,requestKey:randomUUID()}),/Подтвердите/);
  assert.throws(()=>g.createTopup('alice','111',{amount:'1500',accepted:true,currency:'USD',requestKey:randomUUID()}),/рублях/);
  assert.throws(()=>g.createTopup('alice','111',{amount:'1500',accepted:true,requestKey:'bad'}),/Обновите/);
  assert.equal(db.prepare("SELECT count(*) n FROM payments WHERE purpose='topup'").get().n,0);assert.equal(g.wallet('alice').balance,0);
});

test('topup HTTP routes bind balances to signed Telegram owners across devices and reject buyer confirmation', async t => {
  const botToken='isolated-wallet-auth';
  const {server,gateway:g}=await createApp({dbPath:':memory:',gatewayWorker:false,env:{NODE_ENV:'production',BOT_TOKEN:botToken,GATEWAY_BOT_TOKEN:''}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  const proof=id=>{const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Buyer'})});const secret=createHmac('sha256','WebAppData').update(botToken).digest();p.set('hash',createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));return p.toString();};
  const request=(id,path,method='GET',body)=>fetch(base+'/api'+path,{method,headers:{'X-Telegram-Init-Data':proof(id),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await fetch(base+'/api/wallet')).status,401);
  const key=randomUUID();const created=await request(123,'/wallet/topups','POST',{amount:'1200.55',requestKey:key,accepted:true,ownerId:'tg:456',purpose:'order'});
  assert.equal(created.status,201);const p=await created.json();assert.equal(p.purpose,'topup');assert.equal(p.amount,1200.55);assert.equal(p.receiptUrl,undefined);
  assert.equal((await request(456,'/payments/'+p.id)).status,404);
  assert.equal((await request(123,'/admin/gateway/'+p.id+'/confirm','POST',{})).status,401);
  g.upload(p.id,'tg:123',Buffer.from('%PDF-1.4\nconfirmed transfer'));await g.confirm(p.id,'test-admin');
  assert.equal((await (await request(123,'/wallet')).json()).balance,1200.55);
  assert.equal((await (await request(456,'/wallet')).json()).balance,0);
  const repeated=await request(123,'/wallet/topups','POST',{amount:'1200.55',requestKey:key,accepted:true});assert.equal((await repeated.json()).id,p.id);
});

test('confirmed topups and idempotency keys survive a restart without another credit', async t => {
  const dir=await mkdtemp(join(tmpdir(),'fikus-wallet-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const options={dbPath:join(dir,'db.sqlite'),gatewayWorker:false,env:{NODE_ENV:'test',GATEWAY_BOT_TOKEN:''}};
  let app=await createApp(options);const input={amount:'1500,25',accepted:true,requestKey:randomUUID()};
  const p=app.gateway.createTopup('tg:123','123',input);app.gateway.upload(p.id,'tg:123',Buffer.from('%PDF-1.4\nverified'));await app.gateway.confirm(p.id,'test-admin');
  app.gateway.stop();app.db.close();app=await createApp(options);
  try {assert.equal(app.gateway.wallet('tg:123').balance,1500.25);assert.equal(app.gateway.createTopup('tg:123','123',input).id,p.id);await app.gateway.confirm(p.id,'test-admin');assert.equal(app.gateway.wallet('tg:123').entries.length,1);}finally{app.gateway.stop();app.db.close();}
});
