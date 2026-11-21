import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createApp} from '../server/index.mjs';
function tron(byte){const payload=Buffer.concat([Buffer.from([0x41]),Buffer.alloc(20,byte)]),check=createHash('sha256').update(createHash('sha256').update(payload).digest()).digest().subarray(0,4);let n=BigInt('0x'+Buffer.concat([payload,check]).toString('hex')),s='';while(n){s='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(n%58n)]+s;n/=58n;}return s;}
const oldAddress=tron(7),address=tron(8),evm='0x'+'a'.repeat(40),calls=[];
const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,restockWorker:false,sbpWorker:false,gatewayBotCall:async(...args)=>{calls.push(args);return{};},env:{NODE_ENV:'test',BOT_TOKEN:'',GATEWAY_BOT_TOKEN:'isolated'}});
const {db,gateway:g}=app;const raw=db.prepare('SELECT catalog,settings FROM state').get(),catalog=JSON.parse(raw.catalog),settings={...JSON.parse(raw.settings),usdtRubRate:80,usdtTrc20Address:address,usdtBep20Address:evm},product=catalog.products.find(p=>p.id==='mail-setup');Object.assign(product,{price:1600,currency:'RUB',stock:30,visible:true});db.prepare('UPDATE state SET catalog=?,settings=?').run(JSON.stringify(catalog),JSON.stringify(settings));g.saveConfig({receiptRecipient:'777'});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});await mkdir('qa/usdt-recovery',{recursive:true});
try{
 for(const scenario of ['changed-wallet','expired-card','network-change','topup','topup-chain','stale-retry','new-order']){
  const topup=scenario.startsWith('topup');
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
  await context.addInitScript(id=>localStorage.setItem('fikus:cart',JSON.stringify([{productId:id,quantity:1}])),product.id);
  const access=await context.request.get(base+'/api/access'),cookies=await context.cookies(),secret=cookies.find(c=>c.name==='fikus_visitor').value,owner=db.prepare('SELECT id FROM visitors WHERE token=?').get(createHash('sha256').update(secret).digest('hex')).id;
  const input={items:[{productId:product.id,quantity:1}],note:'',method:'usdt',network:'trc20',expectedRate:80,expectedAmount:20};let previous;
  if(scenario==='changed-wallet'||topup||scenario==='stale-retry')db.prepare('UPDATE state SET settings=?').run(JSON.stringify({...settings,usdtTrc20Address:oldAddress}));
  if(topup){
   const requestKey=randomUUID();previous=g.createTopup(owner,'',{method:'usdt',network:'trc20',expectedRate:80,amount:'20',currency:'USD',requestKey});
   await context.addInitScript(({key})=>localStorage.setItem('fikus:wallet-topup:guest:usdt',JSON.stringify({amount:'20',requestKey:key})),{key:requestKey});
   if(scenario==='topup-chain')for(const changed of [tron(9),tron(10)]){db.prepare('UPDATE state SET settings=?').run(JSON.stringify({...settings,usdtTrc20Address:changed}));previous=g.retry(previous.id,owner,{method:'usdt',network:'trc20',notPaid:true,expectedRate:80});}
  }else if(scenario==='expired-card'){
   previous=g.create(owner,'',{...input,method:'card',accepted:true,expectedAmount:1600});db.prepare("UPDATE payments SET provider='telegram-card',status='awaiting_receipt',reason='expired',expires_at=? WHERE id=?").run(Date.now()-1000,previous.id);
  }else if(scenario!=='new-order')previous=g.create(owner,'',input);
  db.prepare('UPDATE state SET settings=?').run(JSON.stringify(settings));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base+(topup?'/#/profile':'/#/checkout'));
  if(topup){await page.getByRole('button',{name:'Top up balance',exact:true}).click();await page.locator('form.wallet-topup button[type="submit"]').click();}
  const network=scenario==='network-change'?'bep20':'trc20',networkName=network==='bep20'?'USDT BEP20':'USDT TRC20';
  await page.locator('.usdt-network').filter({hasText:networkName}).click();
  if(previous){
   const recover=page.locator('.usdt-recovery');await expect(recover).toBeVisible();const renew=recover.locator('.primary-button');await expect(renew).toBeDisabled();await page.setViewportSize({width:320,height:780});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(scenario==='stale-retry'){
    db.prepare('UPDATE state SET settings=?').run(JSON.stringify({...settings,usdtTrc20Address:tron(11)}));previous=g.retry(previous.id,owner,{method:'usdt',network:'trc20',notPaid:true,expectedRate:80});db.prepare('UPDATE state SET settings=?').run(JSON.stringify(settings));
    await recover.getByRole('checkbox').check();await renew.click();await expect(recover.getByRole('checkbox')).not.toBeChecked();await expect(renew).toBeDisabled();await expect(page.locator('.usdt-address')).toHaveCount(0);
   }
   await recover.getByRole('checkbox').check();await renew.click();
  }
  const expected=network==='bep20'?evm:address;await expect(page.locator('.usdt-address')).toContainText(expected);assert.ok(!(await page.locator('body').innerText()).includes(oldAddress));await expect(page.getByRole('timer')).toHaveCount(0);
  const id=page.url().split('/').at(-1),payment=g.externalRow(id);assert.equal(payment.provider,'usdt');assert.equal(payment.status,'awaiting_transfer');assert.equal(payment.expires_at,null);assert.equal(JSON.parse(payment.crypto).network,network);
  if(previous)assert.equal(payment.retry_of,previous.id);await page.locator('.usdt-address').click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(expected);
  if(scenario==='changed-wallet'){
   await page.screenshot({path:'qa/usdt-recovery/address.png',fullPage:true});g.reportCryptoPaid(id,owner,{});await g.confirm(id,'777');await g.confirm(previous.id,'777');assert.equal(JSON.parse(db.prepare('SELECT catalog FROM state').get().catalog).products.find(p=>p.id===product.id).stock,29);
  }
  if(topup){assert.equal(await page.evaluate(()=>localStorage.getItem('fikus:wallet-topup:guest:usdt')),'{}');g.reportCryptoPaid(id,owner,{});await g.confirm(id,'777');await g.confirm(previous.id,'777');assert.equal(g.wallet(owner).balance,1600);assert.equal(db.prepare('SELECT COUNT(*) n FROM wallet_ledger WHERE owner_id=?').get(owner).n,1);}
  assert.deepEqual(errors,[]);await context.close();console.log(scenario+': current address and chosen network; no expiry; repeat confirmation is idempotent');
 }
 assert.ok(calls.every(([,payload])=>String(payload.chat_id)==='777'));assert.equal(db.prepare("SELECT COUNT(*) n FROM gateway_outbox WHERE kind='source'").get().n,0);await writeFile('qa/usdt-recovery/result.json',JSON.stringify({scenarios:7,simulatedTelegramCalls:calls.length,realTelegramCalls:0}));
}finally{await browser.close();await new Promise(r=>app.server.close(r));}
