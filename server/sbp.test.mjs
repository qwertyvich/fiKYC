import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createApp} from './index.mjs';
import {methodCode} from './sbp.mjs';
const key='fixture-provider-key',secret='fixture-webhook-secret',botToken='123456789:'+'a'.repeat(35);
const list=[{method:'qr',qr_method_id:'3',name:'MS-9 Авто + чек',description:'Газпромбанк - возврат',min_amount:'3000.00',max_amount:'100000.00'},{method:'qr',qr_method_id:'7',name:'ms10 + чек',description:'',min_amount:'5000.00',max_amount:'100000.00'},{method:'qr',qr_method_id:'5',name:'🇻🇳 QR Vietnam',description:'MS9',min_amount:'150.00',max_amount:'100000.00'},{method:'card',qr_method_id:null,name:'Карта Узбекистана',description:'',min_amount:'1000',max_amount:'100000'}];
async function fixture(t){
 let now=Date.now(),loseReply=false;const remote=new Map(),calls=[],botCalls=[];
 const fetchImpl=async(url,options={})=>{const u=new URL(url),path=u.pathname.replace('/api/v1/','');assert.equal(options.headers.Authorization,'Bearer '+key);calls.push({path,method:options.method,body:options.body});
  if(path==='methods/')return Response.json(list);
  if(path==='payments/'&&options.method==='POST'){const input=JSON.parse(options.body);assert.equal(input.method,'qr');assert.ok(['3','7'].includes(input.qr_method_id));const id=randomUUID(),p={id,status:'pending',method:'qr',amount:input.amount,paid_amount:null,currency:'RUB',order_id:input.order_id,customer_id:input.customer_id,payment_url:'https://pay-provider.casa/pay/'+id+'/',created_at:new Date(now).toISOString(),expires_at:new Date(now+600000).toISOString(),receipts_count:0};remote.set(id,p);if(loseReply){loseReply=false;throw Error('Connection lost after create');}return Response.json(p,{status:201});}
  if(path==='payments/'){const order=u.searchParams.get('order_id');return Response.json([...remote.values()].filter(p=>!order||p.order_id===order));}
  const id=path.split('/')[1],p=remote.get(id);if(!p)return Response.json({error:'not_found'},{status:404});
  if(path.endsWith('/receipt/')){assert.ok(options.body instanceof FormData);assert.equal(options.body.get('file').type,'application/pdf');p.receipts_count++;return Response.json(p,{status:201});}
  return Response.json(p);
 };
 const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,sbpWorker:false,gatewayNow:()=>now,sbpNow:()=>now,sbpFetch:fetchImpl,gatewayBotCall:async(method,payload)=>{botCalls.push({method,payload});return{};},env:{NODE_ENV:'test',ADMIN_PASSWORD:'fixture',BOT_TOKEN:botToken,GATEWAY_BOT_TOKEN:'fake-gateway',PAY_PROVIDER_API_KEY:key,PAY_PROVIDER_WEBHOOK_SECRET:secret}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const s=app.db.prepare('SELECT catalog FROM state').get(),catalog=JSON.parse(s.catalog),p=catalog.products.find(p=>p.id==='mail-setup');p.price=5000;p.stock=20;p.currency='RUB';p.saleMode='fixed';app.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(catalog));app.gateway.saveConfig({receiptRecipient:'777'});app.gateway.setConnected();
 const input={items:[{productId:p.id,quantity:1}],note:'',method:'sbp',expectedAmount:5000,expectedRate:88};
 const reserve=()=>app.gateway.create('alice','111',input),pay=async()=>app.sbp.issue(reserve().id);
 return{...app,remote,calls,botCalls,p,input,pay,reserve,lose:()=>{loseReply=true;},advance:ms=>{now+=ms;},now:()=>now,stock:()=>JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog).products.find(v=>v.id===p.id).stock};
}
test('methods are matched by name; MC9 is internal ID 3, Vietnam/card are excluded, limits are inclusive and selection is manual',async t=>{
 const f=await fixture(t);assert.equal(methodCode(list[1]),'mc10');assert.equal(methodCode(list[2]),null);assert.equal(methodCode(list[3]),null);
 assert.equal((await f.sbp.options(299999)).available,false);assert.equal((await f.sbp.options(300000)).available,true);assert.equal((await f.sbp.options(10000000)).available,true);assert.equal((await f.sbp.options(10000001)).available,false);
 f.sbp.saveConfig({enabled:true,preferred:'mc27'});assert.equal((await f.sbp.options(500000)).available,false);f.sbp.saveConfig({enabled:true,preferred:'mc10'});assert.equal((await f.sbp.options(400000)).available,false);const p=await f.pay();assert.equal(p.qr.methodCode,'mc10');assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('chat cards have priority over SBP; no external payment is created while a matching card is available',async t=>{
 const f=await fixture(t);f.gateway.receiveFeed({chat:{id:-1002278926769},from:{id:333,username:'feweqw34234_bot'},date:Math.floor(f.now()/1000),text:'Реквизиты №1\n🇷🇺 Россия\n🏦 Банк: Сбер\n┗ ФИО: Тест Т\n💳 Карта: 2200000000000001\n✅ Мин: 1 000 ₽\n⛔️ Макс: 8 000 ₽'},1);
 assert.throws(()=>f.reserve(),/Реквизиты снова доступны/);const p=f.gateway.create('alice','111',{...f.input,method:'card',accepted:true});assert.equal(p.provider,'telegram-card');assert.equal(p.expiresAt-p.serverNow,900000);assert.equal(f.calls.length,0);
});
test('SBP stores the actual expiration and link; a receipt or manual callback cannot confirm the payment',async t=>{
 const f=await fixture(t),p=await f.pay();assert.equal(p.provider,'sbp');assert.equal(p.expiresAt-p.serverNow,600000);assert.match(p.qr.paymentUrl,/^https:\/\/pay-provider.casa\/pay\//);assert.equal(p.card,null);assert.equal(f.stock(),20);
 f.gateway.upload(p.id,'alice',Buffer.from('%PDF-1.4\nfixture'));await assert.rejects(()=>f.gateway.confirm(p.id,'777'),/платёжная система/);assert.equal(f.stock(),20);assert.equal(f.gateway.view(f.gateway.own(p.id,'alice')).status,'awaiting_transfer');
 f.sbp.enqueueReceipts();await f.sbp.pump();await f.gateway.flush();assert.equal(f.remote.get(p.qr.externalId).receipts_count,1);assert.equal(f.db.prepare('SELECT status FROM sbp_receipt_jobs').get().status,'sent');const sent=f.botCalls.find(c=>c.method==='sendDocument');assert.ok(sent.payload instanceof FormData);assert.equal(sent.payload.get('chat_id'),'777');assert.equal(sent.payload.has('reply_markup'),false);
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
