import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './index.mjs';
import {migrateInstance} from './migrate-instance.mjs';
import {createShopBots} from './shop-bots.mjs';
const oldToken='123456789:'+ 'a'.repeat(35),newToken='234567890:'+ 'b'.repeat(35),key='12'.repeat(32);
const input={oldToken,newToken,newUsername:'new_shop_bot',operatorUsername:'phiKYC',encryptionKey:key,origin:'https://kyc.example.test'};
async function fixture(t){
 const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:oldToken,GATEWAY_BOT_TOKEN:'',BOTS_ENCRYPTION_KEY:key}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const s=app.db.prepare('SELECT * FROM state').get(),catalog=JSON.parse(s.catalog),settings=JSON.parse(s.settings);
 catalog.products[0].price=4321;catalog.products[0].stock=11;settings.sellerUsername='original_seller';settings.adminTelegramIds='333';
 app.db.prepare('UPDATE state SET catalog=?,settings=?').run(JSON.stringify(catalog),JSON.stringify(settings));app.db.prepare('INSERT INTO seller_bindings VALUES(?,?)').run('original_seller','333');app.db.prepare("INSERT INTO gateway_meta VALUES('recipientId','333')").run();
 app.db.prepare('INSERT INTO visitors(id,token,created_at,telegram_id) VALUES(?,?,?,?)').run('buyer','buyer-token',Date.now(),'4000');
 app.db.prepare('INSERT INTO reviews(id,visitor_id,product_id,author,rating,text,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('review','buyer',catalog.products[0].id,'Real buyer',5,'Original review','published',Date.now(),Date.now());
 app.db.prepare('INSERT INTO payments(id,visitor_id,telegram_id,items,note,amount_minor,currency,provider,status,created_at,purpose) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('FK-EXISTING','tg:4000','4000','[]','Original payment',150000,'RUB','card','paid',Date.now(),'topup');
 app.db.prepare('INSERT INTO wallet_ledger VALUES(?,?,?,?,?)').run('FK-EXISTING','tg:4000','RUB',150000,Date.now());
 app.db.prepare('INSERT INTO gateway_receipts VALUES(?,?,?,?,?)').run('receipt','FK-EXISTING','file','document',Date.now());app.db.prepare('INSERT INTO gateway_receipt_files VALUES(?,?,?)').run('receipt',Buffer.from([1,2,3,4]),'image/png');
 return app;
}
test('offline migration preserves catalog, real data and owner, replaces operator and keeps old bot compatible',async t=>{
 const app=await fixture(t),db=app.db,before=db.prepare('SELECT * FROM state').get();
 const result=migrateInstance(db,input);const after=db.prepare('SELECT * FROM state').get();assert.equal(after.catalog,before.catalog);assert.equal(JSON.parse(after.catalog).products[0].price,4321);assert.equal(JSON.parse(after.catalog).products[0].stock,11);
 const settings=JSON.parse(after.settings);assert.equal(settings.botUsername,'new_shop_bot');assert.equal(settings.sellerUsername,'original_seller');assert.equal(settings.adminTelegramIds,'333');assert.equal(JSON.parse(after.shop).supportTelegram,'phiKYC');assert.equal(db.prepare('SELECT * FROM seller_bindings').get().telegram_id,'333');
 assert.equal(JSON.parse(db.prepare('SELECT json FROM gateway_config').get().json).receiptRecipient,'@phiKYC');assert.equal(db.prepare("SELECT * FROM gateway_meta WHERE key='recipientId'").get(),undefined);
 assert.equal(db.prepare('SELECT text FROM reviews').get().text,'Original review');assert.equal(db.prepare('SELECT note FROM payments').get().note,'Original payment');assert.equal(db.prepare('SELECT amount_minor FROM wallet_ledger').get().amount_minor,150000);assert.deepEqual(Buffer.from(db.prepare('SELECT data FROM gateway_receipt_files').get().data),Buffer.from([1,2,3,4]));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_bots WHERE primary_bot=1').get().n,1);const old=db.prepare('SELECT * FROM shop_bots WHERE id=?').get('123456789');assert.equal(old.primary_bot,0);assert.ok(!old.encrypted_token.includes(oldToken));
 const bots=createShopBots({db,env:{BOT_TOKEN:newToken,BOTS_ENCRYPTION_KEY:key},state:()=>({settings,shop:JSON.parse(after.shop),catalog:JSON.parse(after.catalog)}),assetsRoot:'.'});assert.deepEqual(bots.tokens(),[newToken,oldToken]);assert.equal(result.recipientNeedsStart,true);
 const again=migrateInstance(db,input);assert.equal(again.revision,result.revision);assert.equal(again.createdPrimary,false);assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_bots').get().n,2);
});
test('active transfers or a missing encryption key stop migration without altering live settings',async t=>{
 const app=await fixture(t),db=app.db,before=db.prepare('SELECT * FROM state').get();
 assert.throws(()=>migrateInstance(db,{...input,encryptionKey:''}),/ENCRYPTION_KEY/);
 db.prepare("UPDATE payments SET status='awaiting_transfer',expires_at=?").run(Date.now()+900000);assert.throws(()=>migrateInstance(db,input),/active transfer/);
 assert.deepEqual(db.prepare('SELECT * FROM state').get(),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM shop_bots').get().n,1);assert.equal(db.prepare("SELECT value FROM gateway_meta WHERE key='recipientId'").get().value,'333');
});
