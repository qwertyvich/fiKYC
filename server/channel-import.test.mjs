import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './index.mjs';
import {nextImportAt,validateChannelFile} from './channel-import.mjs';
const START=Date.parse('2026-11-09T12:00:00+03:00');
async function fixture(t,{dbPath=':memory:',clock={at:START}}={}){
  const app=await createApp({dbPath,gatewayWorker:false,importNow:()=>clock.at,env:{NODE_ENV:'test',BOT_TOKEN:'',GATEWAY_BOT_TOKEN:'',ADMIN_PASSWORD:'fixture'}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
  const base='http://127.0.0.1:'+app.server.address().port;
  const product=JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.visible);
  const data={version:1,products:[{id:product.id,name:product.title,mark:4.7,buyers:128,reviews:[{id:'comment-101',name:'Анна',mark:5,date:'2026-11-08 14:30',text:'Реальный исторический отзыв'},{id:'comment-102',name:'Михаил',mark:4,date:'2026-11-11 14:30',text:'Будущая дата'}]}]};
  const request=(path,method='GET',body,cookie='')=>fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {...app,base,product,data,clock,request,raw:()=>JSON.stringify(data),catalog:()=>JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog)};
}
test('channel file validates real calendar dates, IDs, ratings and duplicates; Moscow midnight is explicit',async t=>{
  const f=await fixture(t);const validate=()=>validateChannelFile(f.raw(),f.catalog(),START);
  assert.equal(new Date(nextImportAt(START)).toISOString(),'2026-11-09T21:00:00.000Z');
  assert.equal(nextImportAt(Date.parse('2026-11-09T21:00:00Z')),Date.parse('2026-11-10T21:00:00Z'));
  assert.deepEqual(validate().summary,{products:1,reviews:2,scheduled:1});
  const r=f.data.products[0].reviews[0];r.date='2026-02-31 14:30';assert.throws(validate,/не существует/);
  r.date='2026-11-08 24:00';assert.throws(validate,/не существует/);
  r.date='2026-11-08T14:30+25:00';assert.throws(validate,/часовой пояс/);
  r.date='2026-11-08T11:30:00Z';assert.equal(validate().products[0].reviews[0].createdAt,Date.parse('2026-11-08T14:30:00+03:00'));
  f.data.products[0].reviews[1].id=r.id;assert.throws(validate,/повторяется/);
  f.data.products[0].reviews.pop();f.data.products[0].id='missing';assert.throws(validate,/отсутствует/);
  f.data.products[0].id=f.product.id;f.data.products[0].mark=4.77;assert.throws(validate,/одним знаком/);
  f.data.products[0].mark=null;assert.equal(validate().products[0].mark,null);
  assert.throws(()=>validateChannelFile('{broken',f.catalog()),/JSON/);
});
test('staging is private and midnight applies automatically; future content is never returned until its exact time',async t=>{
  const f=await fixture(t),ci=f.channelImport;
  const staged=ci.stage(f.raw(),'channel.json');assert.ok(staged.pending);assert.equal(ci.runScheduled(),false);
  assert.equal((await(await f.request('/api/reviews')).json()).length,0);
  f.clock.at=staged.nextApplyAt;assert.equal(ci.runScheduled(),true);assert.equal(ci.status().pending,false);
  const publicData=await(await f.request('/api/public')).json();const p=publicData.catalog.products.find(p=>p.id===f.product.id);
  assert.equal(p.buyerCount,128);assert.deepEqual(p.channelStats,{buyers:128,mark:4.7});
  let reviews=await(await f.request('/api/reviews')).json();assert.equal(reviews.length,1);assert.equal(reviews[0].source,'telegram');assert.equal(reviews[0].own,false);
  assert.ok(!JSON.stringify(reviews).includes('Будущая дата'));assert.equal(ci.status().scheduledReviews,1);
  // Midnight scan is not needed to expose a review at its already accepted exact date.
  f.clock.at=Date.parse('2026-11-11T14:29:59+03:00');assert.equal((await(await f.request('/api/reviews')).json()).length,1);
  f.clock.at+=1000;reviews=await(await f.request('/api/reviews')).json();assert.equal(reviews.length,2);assert.equal(ci.status().scheduledReviews,0);
  assert.equal(ci.runScheduled(),true);assert.equal(ci.runScheduled(),false);assert.equal(f.db.prepare('SELECT count(*) n FROM reviews').get().n,2);
});
test('same IDs update without duplicates, moderation survives rereads, missing imports hide and native reviews remain',async t=>{
  const f=await fixture(t),ci=f.channelImport;f.data.products[0].reviews.pop();ci.stage(f.raw(),'one.json');f.clock.at=nextImportAt(f.clock.at);ci.runScheduled();
  const imported=f.db.prepare('SELECT id FROM reviews').get().id;
  f.db.prepare("UPDATE reviews SET status='hidden',reply='Ответ магазина' WHERE id=?").run(imported);
  f.db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?,?,?)').run('native','visitor',f.product.id,'Новый клиент',5,'Отзыв из приложения','published','',START,START);
  f.data.products[0].reviews[0].text='Исправленный текст';f.data.products[0].reviews[0].date='2026-11-15 15:00';f.data.products[0].buyers=130;
  ci.stage(f.raw(),'two.json');f.clock.at=nextImportAt(f.clock.at);ci.runScheduled();
  assert.equal(f.db.prepare('SELECT count(*) n FROM reviews').get().n,2);
  const updated=f.db.prepare('SELECT * FROM reviews WHERE id=?').get(imported);assert.equal(updated.text,'Исправленный текст');assert.equal(updated.status,'hidden');assert.equal(updated.reply,'Ответ магазина');
  f.data.products=[];ci.stage(f.raw(),'empty.json');f.clock.at=nextImportAt(f.clock.at);ci.runScheduled();
  assert.equal(ci.status().importedProducts,0);assert.equal(ci.status().importedReviews,0);assert.equal(f.db.prepare('SELECT status FROM reviews WHERE id=?').get('native').status,'published');
});
test('invalid upload and midnight catalog conflict preserve the active snapshot; cancellation preserves live reviews',async t=>{
  const f=await fixture(t),ci=f.channelImport;ci.stage(f.raw(),'valid.json');const staged=ci.download().text;
  assert.throws(()=>ci.stage('{}','broken.json'),/version/);assert.equal(ci.download().text,staged);
  f.clock.at=nextImportAt(f.clock.at);ci.runScheduled();const id=f.db.prepare('SELECT id FROM reviews').get().id;
  ci.stage(f.raw(),'cancelled.json');ci.cancel();assert.equal(ci.status().pending,false);assert.equal(f.db.prepare('SELECT status FROM reviews WHERE id=?').get(id).status,'published');
  ci.stage(f.raw(),'conflict.json');const c=f.catalog();c.products=c.products.filter(p=>p.id!==f.product.id);f.db.prepare('UPDATE state SET catalog=?').run(JSON.stringify(c));
  f.clock.at=nextImportAt(f.clock.at);assert.equal(ci.runScheduled(),false);assert.match(ci.status().error,/отсутствует/);assert.equal(ci.status().activeFilename,'valid.json');assert.equal(ci.status().pending,true);assert.equal(f.db.prepare('SELECT count(*) n FROM reviews').get().n,2);
});
test('only administrators can inspect or replace import files; saving does not publish immediately',async t=>{
  const f=await fixture(t);
  for(const [path,method] of [['/api/admin/channel-import','GET'],['/api/admin/channel-import','PUT'],['/api/admin/channel-import/preview','POST'],['/api/admin/channel-import/file','GET'],['/api/admin/channel-import','DELETE']]) assert.equal((await f.request(path,method,method==='GET'?undefined:{text:f.raw()})).status,401);
  const login=await f.request('/api/admin/login','POST',{password:'fixture'});const cookie=login.headers.getSetCookie()[0].split(';')[0];
  const preview=await f.request('/api/admin/channel-import/preview','POST',{text:f.raw()},cookie);assert.equal(preview.status,200);assert.equal((await preview.json()).summary.reviews,2);
  const saved=await f.request('/api/admin/channel-import','PUT',{text:f.raw(),filename:'channel.json'},cookie);assert.equal(saved.status,200);assert.equal((await saved.json()).pending,true);
  assert.equal(f.db.prepare('SELECT count(*) n FROM reviews').get().n,0);
  assert.equal((await(await f.request('/api/admin/channel-import/file','GET',undefined,cookie)).json()).text,f.raw());
  f.clock.at=nextImportAt(f.clock.at);f.channelImport.runScheduled();
  const adminReviews=await(await f.request('/api/admin/reviews','GET',undefined,cookie)).json();assert.equal(adminReviews.length,2);assert.ok(adminReviews.some(r=>r.scheduled));
  assert.equal((await f.request('/api/admin/channel-import','DELETE',{},cookie)).status,200);
});
test('saved files survive restarts and a missed midnight is caught up on startup; filled example validates',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'fikus-channel-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=join(dir,'state.sqlite'),clock={at:START};
  const one=await createApp({dbPath,gatewayWorker:false,importNow:()=>clock.at,env:{NODE_ENV:'test',BOT_TOKEN:'',GATEWAY_BOT_TOKEN:''}});
  const catalog=JSON.parse(one.db.prepare('SELECT catalog FROM state').get().catalog);
  const raw=await readFile(new URL('../examples/channel-import-example.json',import.meta.url),'utf8');assert.ok(validateChannelFile(raw,catalog,clock.at));
  one.channelImport.stage(raw,'example.json');await new Promise(r=>one.server.listen(0,'127.0.0.1',r));await new Promise(r=>one.server.close(r));
  clock.at=nextImportAt(clock.at)+3600000;
  const two=await fixture(t,{dbPath,clock});assert.equal(two.channelImport.status().pending,false);assert.equal(two.channelImport.status().activeFilename,'example.json');assert.equal(two.db.prepare('SELECT count(*) n FROM reviews').get().n,2);
});

test('all-product template follows the catalog, varies slot counts from 50 to 7 and never publishes blank placeholders',async t=>{
  const f=await fixture(t);
  const {channelImportTemplate}=await import('../src/channel-import-template.ts');
  const catalog=f.catalog();catalog.productOrder=[...catalog.products].reverse().map(p=>p.id);
  const template=channelImportTemplate(catalog);const counts=template.products.map(p=>p.reviews.length);
  assert.equal(template.products.length,catalog.products.length);assert.equal(template.products[0].id,catalog.productOrder[0]);
  assert.equal(counts[0],50);assert.equal(counts.at(-1),7);assert.ok(counts.every(n=>n>=7&&n<=50));assert.ok(counts.some((n,i)=>i>0&&n>counts[i-1]));assert.equal(counts[Math.floor(counts.length*.45)],40);
  const raw=()=>JSON.stringify(template);let parsed=f.channelImport.inspect(raw());assert.equal(parsed.products.length,0);assert.equal(parsed.summary.reviews,0);assert.equal(parsed.summary.placeholders,counts.reduce((s,n)=>s+n,0));
  assert.throws(()=>f.channelImport.stage(raw(),'blank.json'),/незаполненные товары/);
  const p=template.products[0];p.buyers=12;Object.assign(p.reviews[0],{name:'Анна',mark:4,date:'2026-11-08 14:30',text:'Перенесённый реальный отзыв'});
  parsed=f.channelImport.inspect(raw());assert.equal(parsed.products.length,1);assert.equal(parsed.summary.reviews,1);assert.equal(parsed.products[0].reviews.length,1);
  f.channelImport.stage(raw(),'filled.json');f.clock.at=nextImportAt(f.clock.at);f.channelImport.runScheduled();
  assert.equal(f.db.prepare('SELECT count(*) n FROM reviews').get().n,1);assert.equal(f.channelImport.status().importedProducts,1);
});
test('partly filled placeholders report errors and cannot silently turn into imported reviews',async t=>{
  const f=await fixture(t);const p=f.data.products[0];p.reviews=[{id:'blank',name:'',mark:5,date:'',text:''}];p.buyers=null;p.mark=null;
  assert.equal(f.channelImport.inspect(f.raw()).summary.reviews,0);
  p.reviews[0].name='Анна';assert.throws(()=>f.channelImport.inspect(f.raw()),/date/);
  Object.assign(p.reviews[0],{date:'2026-11-08 14:30',text:'Реальный текст'});assert.throws(()=>f.channelImport.inspect(f.raw()),/buyers/);
  p.buyers=0;assert.equal(f.channelImport.inspect(f.raw()).summary.reviews,1);
});
