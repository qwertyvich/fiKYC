import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createApp} from './index.mjs';
import {methodCode} from './sbp.mjs';
const key='fixture-provider-key',secret='fixture-webhook-secret',botToken='123456789:'+'a'.repeat(35);
const list=[{method:'qr',qr_method_id:'3',name:'MS-9 Авто + чек',description:'Газпромбанк - возврат',min_amount:'3000.00',max_amount:'100000.00'},{method:'qr',qr_method_id:'7',name:'ms10 + чек',description:'',min_amount:'5000.00',max_amount:'100000.00'},{method:'qr',qr_method_id:'5',name:'🇻🇳 QR Vietnam',description:'MS9',min_amount:'150.00',max_amount:'100000.00'},{method:'card',qr_method_id:null,name:'Карта Узбекистана',description:'',min_amount:'1000',max_amount:'100000'}];
async function fixture(t){
 let now=Date.now(),loseReply=false,failDelivery=false;const remote=new Map(),calls=[],botCalls=[];
 const fetchImpl=async(url,options={})=>{const u=new URL(url),path=u.pathname.replace('/api/v1/','');assert.equal(options.headers.Authorization,'Bearer '+key);calls.push({path,method:options.method,body:options.body});
  if(path==='methods/')return Response.json(list);
  if(path==='payments/'&&options.method==='POST'){const input=JSON.parse(options.body);assert.equal(input.method,'qr');assert.ok(['3','7'].includes(input.qr_method_id));const id=randomUUID(),p={id,status:'pending',method:'qr',amount:input.amount,paid_amount:null,currency:'RUB',order_id:input.order_id,customer_id:input.customer_id,payment_url:'https://pay-provider.casa/pay/'+id+'/',created_at:new Date(now).toISOString(),expires_at:new Date(now+600000).toISOString(),receipts_count:0};remote.set(id,p);if(loseReply){loseReply=false;throw Error('Connection lost after create');}return Response.json(p,{status:201});}
  if(path==='payments/'){const order=u.searchParams.get('order_id');return Response.json([...remote.values()].filter(p=>!order||p.order_id===order));}
  const id=path.split('/')[1],p=remote.get(id);if(!p)return Response.json({error:'not_found'},{status:404});
  if(path.endsWith('/receipt/')){assert.ok(options.body instanceof FormData);assert.equal(options.body.get('file').type,'application/pdf');p.receipts_count++;return Response.json(p,{status:201});}
  return Response.json(p);
 };
 const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,sbpWorker:false,gatewayNow:()=>now,sbpNow:()=>now,sbpFetch:fetchImpl,gatewayBotCall:async(method,payload)=>{botCalls.push({method,payload});if(failDelivery)throw Error('Temporary Telegram delivery failure');return{};},env:{NODE_ENV:'test',ADMIN_PASSWORD:'fixture',BOT_TOKEN:botToken,GATEWAY_BOT_TOKEN:'fake-gateway',PAY_PROVIDER_API_KEY:key,PAY_PROVIDER_WEBHOOK_SECRET:secret}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const s=app.db.prepare('SELECT catalog FROM state').get(),catalog=JSON.parse(s.catalog),p=catalog.products.find(p=>p.id==='mail-setup');p.price=5000;p.stock=20;p.currency='RUB';p.saleMode='fixed';app.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));app.gateway.saveConfig({receiptRecipient:'777'});app.gateway.setConnected();
 const input={items:[{productId:p.id,quantity:1}],note:'',method:'sbp',expectedAmount:5000,expectedRate:88};
 const reserve=()=>app.gateway.create('alice','111',input),pay=async()=>app.sbp.issue(reserve().id);
 return{...app,remote,calls,botCalls,p,input,pay,reserve,failDelivery:value=>{failDelivery=value;},lose:()=>{loseReply=true;},advance:ms=>{now+=ms;},now:()=>now,stock:()=>JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog).products.find(v=>v.id===p.id).stock};
}
test('methods are matched by name; MC9 is internal ID 3, Vietnam/card are excluded, limits are inclusive and selection is manual',async t=>{
 const f=await fixture(t);assert.equal(methodCode(list[1]),'mc10');assert.equal(methodCode(list[2]),null);assert.equal(methodCode(list[3]),null);
 assert.equal((await f.sbp.options(299999)).available,false);assert.equal((await f.sbp.options(300000)).available,true);assert.equal((await f.sbp.options(800000)).available,true);assert.equal((await f.sbp.options(800001)).available,false);assert.equal((await f.sbp.options(10000000)).available,false);assert.equal((await f.sbp.options(500000)).max,8000);assert.equal((await f.sbp.options(10000001)).available,false);
 f.sbp.saveConfig({enabled:true,preferred:'mc27'});assert.equal((await f.sbp.options(500000)).available,false);f.sbp.saveConfig({enabled:true,preferred:'mc10'});assert.equal((await f.sbp.options(400000)).available,false);const p=await f.pay();assert.equal(p.qr.methodCode,'mc10');assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('chat cards have priority over SBP; no external payment is created while a matching card is available',async t=>{
 const f=await fixture(t);f.gateway.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(f.now()/1000),text:'Реквизиты №1\n🇷🇺 Россия\n🏦 Банк: Сбер\n┗ ФИО: Тест Т\n💳 Карта: 2200000000000001\n✅ Мин: 1 000 ₽\n⛔️ Макс: 8 000 ₽'},1);
 assert.throws(()=>f.reserve(),/Реквизиты снова доступны/);const p=f.gateway.create('alice','111',{...f.input,method:'card',accepted:true});assert.equal(p.provider,'telegram-card');assert.equal(p.expiresAt-p.serverNow,900000);assert.equal(f.calls.length,0);
});
test('SBP stores the actual expiration and link; a receipt or manual callback cannot confirm the payment',async t=>{
 const f=await fixture(t),p=await f.pay();assert.equal(p.provider,'sbp');assert.equal(p.expiresAt-p.serverNow,600000);assert.match(p.qr.paymentUrl,/^https:\/\/pay-provider.casa\/pay\//);assert.equal(p.card,null);assert.equal(f.stock(),20);
 f.gateway.upload(p.id,'alice',Buffer.from('%PDF-1.4\nfixture'));await assert.rejects(()=>f.gateway.confirm(p.id,'777'),/платёжная система/);assert.equal(f.stock(),20);assert.equal(f.gateway.view(f.gateway.own(p.id,'alice')).status,'awaiting_transfer');
 f.sbp.enqueueReceipts();await f.sbp.pump();await f.gateway.flush();assert.equal(f.remote.get(p.qr.externalId).receipts_count,1);assert.equal(f.db.prepare('SELECT status FROM sbp_receipt_jobs').get().status,'sent');const sent=f.botCalls.find(c=>c.method==='sendDocument');assert.ok(sent.payload instanceof FormData);assert.equal(sent.payload.get('chat_id'),'777');assert.equal(sent.payload.get('caption').includes(p.qr.paymentUrl),true);assert.deepEqual(JSON.parse(sent.payload.get('reply_markup')),{inline_keyboard:[[{text:'Открыть страницу оплаты',url:p.qr.paymentUrl}]]});
});
test('raw signed webhooks are durable, timestamp-checked and deduplicated; payment is verified through API and fulfilled once',async t=>{
 const f=await fixture(t),p=await f.pay(),r=f.remote.get(p.qr.externalId);r.status='success';r.paid_amount='5000.00';
 const raw=Buffer.from(JSON.stringify({id:'event-1',event:'payment.success',data:r})),ts=String(Math.floor(f.now()/1000)),headers={'x-timestamp':ts,'x-webhook-id':'event-1','x-signature':'sha256='+createHmac('sha256',secret).update(ts+'.').update(raw).digest('hex')};
 assert.throws(()=>f.sbp.receiveWebhook(Buffer.concat([raw,Buffer.from(' ')]),headers),/подпись/);assert.throws(()=>f.sbp.receiveWebhook(raw,{...headers,'x-timestamp':String(Number(ts)-301)}),/подпись/);
 f.sbp.receiveWebhook(raw,headers);f.sbp.receiveWebhook(raw,headers);await f.sbp.pump();assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sbp_webhooks').get().n,1);
 await f.sbp.apply(r);await f.sbp.apply(r);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM product_purchases').get().n,1);assert.equal(f.stock(),19);assert.equal(f.gateway.view(f.gateway.own(p.id,'alice')).status,'paid');await f.sbp.apply({...r,status:'pending'});assert.equal(f.gateway.view(f.gateway.own(p.id,'alice')).status,'paid');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM gateway_outbox WHERE kind='provider_notice'").get().n,1);
});
test('underpayment and mismatched order/customer/currency do not deliver a product',async t=>{
 const f=await fixture(t),p=await f.pay(),r=f.remote.get(p.qr.externalId);r.status='success';r.paid_amount='4999.99';await f.sbp.apply(r);assert.equal(f.stock(),20);assert.equal(f.gateway.view(f.gateway.own(p.id,'alice')).reason,'sbp_amount_review');
 for(const patch of [{customer_id:'other'},{order_id:'other'},{currency:'USD'},{amount:'1.00'}])await assert.rejects(()=>f.sbp.apply({...r,paid_amount:'5000.00',...patch}),/не совпадают/);assert.equal(f.stock(),20);
});
test('creation timeout is recovered by order ID without a duplicate POST; live QR cannot be replaced',async t=>{
 const f=await fixture(t);f.lose();const p=await f.pay();assert.equal(p.qr.status,'unknown');const recovered=await f.sbp.issue(p.id);assert.equal(recovered.qr.status,'pending');assert.equal(f.calls.filter(c=>c.path==='payments/'&&c.method==='POST').length,1);await assert.rejects(()=>f.sbp.assertCanSwitch(p.id),/ещё действует/);
});
test('late success after expiration and another payment method fulfils a related order only once',async t=>{
 const f=await fixture(t),p=await f.pay(),r=f.remote.get(p.qr.externalId);f.advance(601000);r.status='expired';await f.sbp.apply(r);await f.sbp.assertCanSwitch(p.id);
 const settings=JSON.parse(f.db.prepare('SELECT settings FROM state').get().settings);settings.usdtBep20Address='0x'+'a'.repeat(40);f.db.prepare('UPDATE state SET settings=?').run(JSON.stringify(settings));
 const crypto=f.gateway.retry(p.id,'alice',{method:'usdt',network:'bep20',notPaid:true,expectedRate:88});r.status='success';r.paid_amount='5000.00';await f.sbp.apply(r);assert.equal(f.gateway.view(f.gateway.own(crypto.id,'alice')).status,'paid');assert.equal(f.stock(),19);await f.sbp.apply(r);assert.equal(f.stock(),19);
});
test('SBP wallet credit uses RUB and is idempotent',async t=>{
 const f=await fixture(t),p=f.gateway.createTopup('alice','111',{amount:'5000',currency:'RUB',requestKey:randomUUID(),method:'sbp'});const issued=await f.sbp.issue(p.id),r=f.remote.get(issued.qr.externalId);assert.equal(f.gateway.wallet('alice').balance,0);r.status='success';r.paid_amount='5000.00';await f.sbp.apply(r);await f.sbp.apply(r);assert.equal(f.gateway.wallet('alice').balance,5000);
});

function proof(language){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:222,first_name:'Test',language_code:language})});const key=createHmac('sha256','WebAppData').update(botToken).digest();p.set('hash',createHmac('sha256',key).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
test('foreign users cannot create card/SBP payments even by calling the API; a deliberate Russian menu choice changes the audience',async t=>{
 const f=await fixture(t),base='http://127.0.0.1:'+f.server.address().port,headers={'content-type':'application/json','x-telegram-init-data':proof('en'),'x-fikus-client-ip':'8.8.8.8'};
 for(const method of ['sbp','card']){const res=await fetch(base+'/api/payments',{method:'POST',headers,body:JSON.stringify({...f.input,method,accepted:true})});assert.equal(res.status,403);}
 const first=await fetch(base+'/api/payment-options?amount=5000',{headers}).then(r=>r.json());assert.equal(first.sbp.available,false);assert.equal(first.russian,false);
 assert.equal((await fetch(base+'/api/language',{method:'POST',headers,body:JSON.stringify({language:'ru'})})).status,200);
 const access=await fetch(base+'/api/access',{headers}).then(r=>r.json());assert.equal(access.languageSelection.language,'ru');const options=await fetch(base+'/api/payment-options?amount=5000',{headers}).then(r=>r.json());assert.equal(options.russian,true);assert.equal(options.sbp.available,true);
});
test('webhook HTTP endpoint accepts signed provider requests without Telegram auth and public/admin responses do not leak secrets',async t=>{
 const f=await fixture(t),p=await f.pay(),r=f.remote.get(p.qr.externalId),base='http://127.0.0.1:'+f.server.address().port;r.status='success';r.paid_amount='5000.00';const raw=JSON.stringify({id:'delivery-http',event:'payment.success',data:r}),ts=String(Math.floor(f.now()/1000)),signature='sha256='+createHmac('sha256',secret).update(ts+'.'+raw).digest('hex');
 const response=await fetch(base+'/api/webhooks/pay-provider',{method:'POST',headers:{'content-type':'application/json','x-timestamp':ts,'x-signature':signature,origin:'https://pay-provider.casa'},body:raw});assert.equal(response.status,200);
 const invalid=await fetch(base+'/api/webhooks/pay-provider',{method:'POST',headers:{'content-type':'application/json'},body:raw});assert.equal(invalid.status,401);
 assert.equal((await fetch(base+'/api/admin/sbp')).status,401);const publicData=await fetch(base+'/api/public').then(r=>r.text()),adminData=JSON.stringify(await f.sbp.admin());for(const value of [key,secret]){assert.ok(!publicData.includes(value));assert.ok(!adminData.includes(value));}
});

test('chat phone transfer prevents an SBP provider request, including wallet topups',async t=>{
 const f=await fixture(t);f.gateway.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(f.now()/1000),text:'Реквизиты №1\n🏦 Банк: Сбербанк\n┗ ФИО: Тест Т\n💳 Карта: +7 (999) 123-45-67\n✅ Мин: 1 000 ₽\n⛔️ Макс: 8 000 ₽'},1);
 assert.throws(()=>f.reserve(),/Реквизиты снова доступны/);assert.throws(()=>f.gateway.createTopup('wallet','222',{amount:'5000',requestKey:randomUUID(),method:'sbp'}),/Реквизиты снова доступны/);
 assert.equal(f.gateway.create('phone','111',{...f.input,method:'card',accepted:true}).card.type,'phone');assert.equal(f.calls.length,0);
});

test('fresh checkout replaces expired SBP with current phone only after explicit unpaid consent; late callbacks stay idempotent',async t=>{
 const f=await fixture(t),owner='tg:222',base='http://127.0.0.1:'+f.server.address().port;
 const first=await f.sbp.issue(f.gateway.create(owner,'222',f.input).id),remote=f.remote.get(first.qr.externalId);
 f.gateway.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(f.now()/1000),text:'Реквизиты №1\nБанк: Сбербанк\nФИО: Тест Т\nКарта: +7 (999) 123-45-67\nМин: 1 000 ₽\nМакс: 8 000 ₽'},1);
 const headers={'content-type':'application/json','x-telegram-init-data':proof('ru')},body={...f.input,method:'card',accepted:true,notPaid:true};
 const request=()=>fetch(base+'/api/payments',{method:'POST',headers,body:JSON.stringify(body)});
 let res=await request();assert.equal((await res.json()).id,first.id,'live SBP link must not be replaced');
 f.advance(601000);f.gateway.setConnected();remote.status='expired';await f.sbp.apply(remote);
 delete body.notPaid;res=await request();assert.equal((await res.json()).id,first.id,'no silent replacement without consent');
 body.notPaid=true;res=await request();assert.equal(res.status,201);const next=await res.json();assert.equal(next.card.type,'phone');assert.equal(next.expiresAt-next.serverNow,900000);assert.equal(f.gateway.externalRow(next.id).retry_of,first.id);
 await f.sbp.apply(remote);assert.equal(f.gateway.externalRow(first.id).status,'superseded');assert.equal((await(await request()).json()).id,next.id);
 f.gateway.disconnect();f.gateway.setConnected();res=await request();const recovered=await res.json();assert.equal(f.gateway.externalRow(recovered.id).retry_of,next.id);
 remote.status='success';remote.paid_amount='5000.00';await f.sbp.apply(remote);await f.sbp.apply(remote);assert.equal(f.stock(),19);assert.equal(f.gateway.externalRow(next.id).status,'paid');assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});

test('new QR orders and wallet topups stop at 8000 RUB inclusive, including direct calls and retries',async t=>{
 const f=await fixture(t),s=JSON.parse(f.db.prepare('SELECT catalog FROM state').get().catalog);s.products.find(p=>p.id===f.p.id).price=8000;f.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(s));
 const input={...f.input,expectedAmount:8000};const p=f.gateway.create('limit','333',input);await f.sbp.issue(p.id);
 assert.throws(()=>f.gateway.create('large','444',{...input,items:[{productId:f.p.id,quantity:2}],expectedAmount:16000}),/8 000/);
 assert.throws(()=>f.gateway.createTopup('wallet','555',{amount:'8000.01',requestKey:randomUUID(),method:'sbp'}),/8 000/);
 const topup=f.gateway.createTopup('wallet','555',{amount:'8000',requestKey:randomUUID(),method:'sbp'});await f.sbp.issue(topup.id);
 const manual=f.gateway.create('manual','666',{...input,method:'card',accepted:true,items:[{productId:f.p.id,quantity:2}],expectedAmount:16000});
 assert.throws(()=>f.gateway.retry(manual.id,'manual',{method:'sbp',notPaid:true,expectedRate:88}),/8 000/);assert.equal(f.gateway.externalRow(manual.id).status,'manual_review');
 // A legacy reservation without a provider intent must not bypass issuance policy.
 f.db.prepare("UPDATE payments SET provider='sbp' WHERE id=?").run(manual.id);await assert.rejects(()=>f.sbp.issue(manual.id),/8 000/);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 assert.equal((await f.sbp.options(800000)).max,8000);assert.equal((await f.sbp.admin()).methods.find(m=>m.code==='mc9').max,8000);
});
test('QR cap leaves chat requisites above 8000 and previously issued provider links working',async t=>{
 const f=await fixture(t),old=await f.pay(),remote=f.remote.get(old.qr.externalId);
 // Represent a link issued before the shop cap was introduced.
 f.db.prepare('UPDATE payments SET amount_minor=?,items=? WHERE id=?').run(1000000,JSON.stringify([{productId:f.p.id,title:f.p.title,quantity:1,price:10000,currency:'RUB'}]),old.id);remote.amount='10000.00';
 await f.sbp.issue(old.id);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);f.gateway.upload(old.id,'alice',Buffer.from('%PDF-1.4\nlegacy receipt'));remote.status='success';remote.paid_amount='10000.00';await f.sbp.apply(remote);assert.equal(f.stock(),19);
 f.gateway.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(f.now()/1000),text:'Реквизиты №1\nБанк: Сбербанк\nФИО: Тест Т\nКарта: +79991234567\nМин: 1 000 ₽\nМакс: 20 000 ₽'},1);
 const p=f.gateway.create('chat','777',{...f.input,method:'card',accepted:true,items:[{productId:f.p.id,quantity:2}],expectedAmount:10000});assert.equal(p.card.type,'phone');assert.equal(p.amount,10000);
});

test('SBP receipts retain the original payment URL on retry, even after expiry and a new attempt',async t=>{
 const f=await fixture(t),first=await f.pay(),firstUrl=first.qr.paymentUrl,remote=f.remote.get(first.qr.externalId);
 f.advance(601000);remote.status='expired';await f.sbp.apply(remote);
 const second=await f.sbp.issue(f.gateway.retry(first.id,'alice',{method:'sbp',notPaid:true}).id);assert.notEqual(second.qr.paymentUrl,firstUrl);
 assert.equal(f.gateway.view(f.gateway.externalRow(first.id)).qr.paymentUrl,null,'customer cannot use expired link');
 f.gateway.upload(first.id,'alice',Buffer.from('%PDF-1.4\nreceipt for earlier transfer'));
 const job=f.db.prepare("SELECT * FROM gateway_outbox WHERE kind='receipt' AND payment_id=?").get(first.id);assert.equal(JSON.parse(job.payload).paymentUrl,firstUrl);
 f.failDelivery(true);await f.gateway.flush();assert.equal(f.db.prepare('SELECT attempts FROM gateway_outbox WHERE id=?').get(job.id).attempts,1);
 const intent=f.db.prepare('SELECT snapshot FROM sbp_intents WHERE payment_id=?').get(first.id),snapshot=JSON.parse(intent.snapshot);snapshot.paymentUrl=firstUrl+'?later=1';f.db.prepare('UPDATE sbp_intents SET snapshot=? WHERE payment_id=?').run(JSON.stringify(snapshot),first.id);
 f.failDelivery(false);f.advance(3000);await f.gateway.flush();const sent=f.botCalls.filter(c=>c.method==='sendDocument').at(-1).payload;
 assert.ok(sent.get('caption').includes(firstUrl));assert.ok(!sent.get('caption').includes(second.qr.paymentUrl));assert.equal(JSON.parse(sent.get('reply_markup')).inline_keyboard[0][0].url,firstUrl);assert.equal(f.db.prepare('SELECT status FROM gateway_outbox WHERE id=?').get(job.id).status,'sent');
});

test('paid SBP receipts and verified payment notifications include the exact private payment link',async t=>{
 const f=await fixture(t),p=await f.pay(),url=p.qr.paymentUrl,remote=f.remote.get(p.qr.externalId);remote.status='success';remote.paid_amount='5000.00';await f.sbp.apply(remote);
 assert.equal(f.gateway.view(f.gateway.externalRow(p.id)).qr.paymentUrl,null);
 // Very long line items cannot truncate the link or remove its URL button.
 const row=f.gateway.externalRow(p.id),items=JSON.parse(row.items);items[0].title='Товар '.repeat(400);f.db.prepare('UPDATE payments SET items=? WHERE id=?').run(JSON.stringify(items),p.id);
 f.gateway.upload(p.id,'alice',Buffer.from('%PDF-1.4\npaid receipt'));await f.gateway.flush();
 const receipt=f.botCalls.find(c=>c.method==='sendDocument').payload;assert.ok(receipt.get('caption').includes(url));assert.ok(receipt.get('caption').length<=1000);assert.equal(JSON.parse(receipt.get('reply_markup')).inline_keyboard[0][0].url,url);
 const notice=f.botCalls.find(c=>c.method==='sendMessage').payload;assert.ok(notice.text.includes(url));assert.equal(notice.reply_markup.inline_keyboard[0][0].url,url);assert.equal(notice.link_preview_options.is_disabled,true);assert.equal(f.gateway.externalRow(p.id).status,'paid');assert.equal(f.stock(),19);
});

test('Telegram photo/document receipts carry SBP URL buttons without manual payment confirmation',async t=>{
 const f=await fixture(t),p=await f.pay(),token=f.gateway.externalRow(p.id).receipt_token;
 await f.gateway.processUpdate({update_id:1,message:{chat:{id:111,type:'private'},from:{id:111},text:'/start receipt_'+token}});
 for(const [i,attachment] of [{photo:[{file_id:'photo-receipt',file_size:100}]},{document:{file_id:'pdf-receipt',mime_type:'application/pdf',file_size:100}}].entries())await f.gateway.processUpdate({update_id:2+i,message:{chat:{id:111,type:'private'},from:{id:111},...attachment}});
 await f.gateway.flush();const receipts=f.botCalls.filter(c=>['sendPhoto','sendDocument'].includes(c.method));assert.equal(receipts.length,2);
 for(const r of receipts){assert.ok(r.payload.caption.includes(p.qr.paymentUrl));assert.equal(r.payload.reply_markup.inline_keyboard[0][0].url,p.qr.paymentUrl);assert.equal(r.payload.reply_markup.inline_keyboard[0][0].callback_data,undefined);assert.equal(r.payload.chat_id,'777');}
 assert.equal(f.gateway.externalRow(p.id).status,'awaiting_transfer');await assert.rejects(f.gateway.confirm(p.id,'777'),/платёжная система/);
});

test('old queued receipts acquire the stored link at delivery; corrupted external URLs never become payment buttons',async t=>{
 const f=await fixture(t),p=await f.pay();f.gateway.upload(p.id,'alice',Buffer.from('%PDF-1.4\nold queued receipt'));
 const job=f.db.prepare("SELECT * FROM gateway_outbox WHERE kind='receipt'").get(),payload=JSON.parse(job.payload);delete payload.paymentUrl;delete payload.sbp;f.db.prepare('UPDATE gateway_outbox SET payload=? WHERE id=?').run(JSON.stringify(payload),job.id);
 await f.gateway.flush();assert.equal(JSON.parse(f.botCalls.at(-1).payload.get('reply_markup')).inline_keyboard[0][0].url,p.qr.paymentUrl);
 f.gateway.upload(p.id,'alice',Buffer.from('%PDF-1.4\nsecond receipt'));
 const next=f.db.prepare("SELECT * FROM gateway_outbox WHERE status='pending' AND kind='receipt'").get(),corrupt=JSON.parse(next.payload);corrupt.paymentUrl='https://untrusted.invalid/pay/'+p.qr.externalId+'/';f.db.prepare('UPDATE gateway_outbox SET payload=? WHERE id=?').run(JSON.stringify(corrupt),next.id);
 const snapshot=JSON.parse(f.db.prepare('SELECT snapshot FROM sbp_intents WHERE payment_id=?').get(p.id).snapshot);snapshot.paymentUrl=corrupt.paymentUrl;f.db.prepare('UPDATE sbp_intents SET snapshot=? WHERE payment_id=?').run(JSON.stringify(snapshot),p.id);
 await f.gateway.flush();const sent=f.botCalls.at(-1).payload;assert.ok(!sent.get('caption').includes('untrusted.invalid'));assert.equal(sent.has('reply_markup'),false);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM gateway_outbox WHERE kind='source'").get().n,0);
});
