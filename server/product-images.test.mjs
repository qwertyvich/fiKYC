import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createApp} from './index.mjs';
import {imageInfo,MAX_IMAGE_BYTES} from './product-images.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const token='fixture-image-bot';
const proof=id=>{const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Клиент'})});const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();};
async function fixture(t,production=false){
 const app=await createApp({dbPath:':memory:',gatewayWorker:false,env:{NODE_ENV:production?'production':'test',BOT_TOKEN:token,GATEWAY_BOT_TOKEN:'',ADMIN_PASSWORD:'fixture',ADMIN_TELEGRAM_IDS:'123',SELLER_TELEGRAM_USERNAME:''}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));const base='http://127.0.0.1:'+app.server.address().port;
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(production?{initData:proof(123)}:{password:'fixture'})});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().find(c=>c.startsWith('fikus_admin=')).split(';')[0];
 const request=(path,method='GET',data,auth=true,headers={})=>fetch(base+path,{method,headers:{...(auth?{Cookie:cookie}:{}),...(data?{'Content-Type':Buffer.isBuffer(data)?'image/png':'application/json'}:{}),...headers},...(data?{body:Buffer.isBuffer(data)?data:JSON.stringify(data)}:{})});
 return {...app,request,base};
}
test('product image formats enforce size and dimension limits and reject HTML, SVG and invalid headers',()=>{
 assert.deepEqual(imageInfo(png),{mime:'image/png',width:1,height:1});
 for(const bad of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),Buffer.from('<html>x</html>'),Buffer.from([255,216]),Buffer.alloc(MAX_IMAGE_BYTES+1)])assert.throws(()=>imageInfo(bad));
 const huge=Buffer.from(png);huge.writeUInt32BE(50000,16);assert.throws(()=>imageInfo(huge),/4096/);
});
test('only admin uploads; references validate; customer sees only images used by visible products',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/admin/product-images','POST',png,false)).status,401);
 assert.equal((await f.request('/api/admin/product-images','POST',Buffer.from('<html>bad</html>'))).status,400);
 assert.equal((await f.request('/api/admin/product-images','POST',png,true,{'Content-Type':'image/jpeg'})).status,400);
 assert.equal((await f.request('/api/admin/product-images','POST',Buffer.alloc(MAX_IMAGE_BYTES+1))).status,413);
 const saved=await f.request('/api/admin/product-images','POST',png);assert.equal(saved.status,201);const {id}=await saved.json();assert.match(id,/^[a-f0-9]{64}$/);
 const path='/api/product-images/'+id;assert.equal((await f.request(path,'GET',undefined,false)).status,404);
 const preview=await f.request(path);assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/^image\/png/);assert.equal(preview.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await preview.arrayBuffer()),png);
 assert.equal((await(await f.request('/api/admin/product-images','POST',png)).json()).id,id);assert.equal(f.db.prepare('SELECT count(*) n FROM product_images').get().n,1);
 let s=await(await f.request('/api/admin/state')).json();const p=s.catalog.products[0];p.imageId='0'.repeat(64);assert.equal((await f.request('/api/admin/state','PUT',{revision:s.revision,catalog:s.catalog})).status,400);
 p.imageId=id;p.imageFit='contain';s=await(await f.request('/api/admin/state','PUT',{revision:s.revision,catalog:s.catalog})).json();assert.equal((await f.request(path,'GET',undefined,false)).status,200);
 assert.equal((await(await f.request('/api/public','GET',undefined,false)).json()).catalog.products.find(p=>p.imageId===id).imageFit,'contain');
 s.catalog.products[0].visible=false;s=await(await f.request('/api/admin/state','PUT',{revision:s.revision,catalog:s.catalog})).json();assert.equal((await f.request(path,'GET',undefined,false)).status,404);
 delete s.catalog.products[0].imageId;delete s.catalog.products[0].imageFit;await f.request('/api/admin/state','PUT',{revision:s.revision,catalog:s.catalog});assert.equal((await f.request(path,'GET',undefined,false)).status,404);
});
test('production image requests use the verified visitor cookie and enforce Telegram access and blacklist',async t=>{
 const f=await fixture(t,true),{id}=await(await f.request('/api/admin/product-images','POST',png)).json();let s=await(await f.request('/api/admin/state')).json();s.catalog.products[0].imageId=id;await f.request('/api/admin/state','PUT',{revision:s.revision,catalog:s.catalog});const path='/api/product-images/'+id;
 assert.equal((await f.request(path,'GET',undefined,false)).status,401);
 const entry=await f.request('/api/public','GET',undefined,false,{'X-Telegram-Init-Data':proof(456)});assert.equal(entry.status,200);const cookie=entry.headers.getSetCookie().find(c=>c.startsWith('fikus_visitor=')).split(';')[0];
 assert.equal((await f.request(path,'GET',undefined,false,{Cookie:cookie})).status,200);
 await f.request('/api/admin/blacklist','POST',{value:'456',note:'fixture'});assert.equal((await f.request(path,'GET',undefined,false,{Cookie:cookie})).status,503);
});
