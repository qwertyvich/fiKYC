import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ipBytes,lookupBuffer,requestCountry,createCountryLookup} from './geoip.mjs';
import {createApp} from './index.mjs';
function fixture(){const records=[['1.1.1.0','1.1.1.255','AU'],['8.8.8.0','8.8.8.255','US'],['2001:4860::','2001:4860:ffff:ffff:ffff:ffff:ffff:ffff','US']];const header=Buffer.alloc(16);header.write('FIKGEO1\n');header.writeUInt32BE(2,8);header.writeUInt32BE(1,12);return Buffer.concat([header,...records.map(([a,b,c])=>Buffer.concat([ipBytes(a),ipBytes(b),Buffer.from(c)]))]);}
test('country lookup supports IPv4, IPv6 and mapped IPv4; private and malformed IPs stay unknown',()=>{
  const data=fixture();for(const ip of ['8.8.8.8','::ffff:8.8.8.8','2001:4860:4860::8888'])assert.equal(lookupBuffer(data,ip),'US');assert.equal(lookupBuffer(data,'1.1.1.1'),'AU');
  for(const ip of ['127.0.0.1','::1','192.168.1.2','10.0.0.1','172.18.0.2','fc00::1','fe80::1','2001:db8::1','203.0.113.2','8.8.8.999','1.1.1.1,8.8.8.8','::ffff:127.0.0.1'])assert.equal(lookupBuffer(data,ip),'');
  assert.equal(lookupBuffer(data,'9.9.9.9'),'');assert.equal(lookupBuffer(data,data.toString()),'');assert.equal(lookupBuffer(Buffer.from('bad'),'8.8.8.8'),'');assert.equal(createCountryLookup('/missing-country-test').status().available,false);
});
test('forwarded IP is used only behind the configured proxy; country headers are ignored',()=>{
  const lookup=ip=>lookupBuffer(fixture(),ip),req={headers:{'x-fikus-client-ip':'1.1.1.1','cf-ipcountry':'RU','x-forwarded-for':'9.9.9.9'},socket:{remoteAddress:'8.8.8.8'}};
  assert.equal(requestCountry(req,lookup),'US');assert.equal(requestCountry(req,lookup,true),'AU');
});
test('analytics stores country without IP, deduplicates sessions and keeps historical unknowns separate',async t=>{
  const app=await createApp({dbPath:':memory:',countryLookup:ip=>lookupBuffer(fixture(),ip),gatewayWorker:false,shopBotWorker:false,restockWorker:false,env:{NODE_ENV:'test',ADMIN_PASSWORD:'fixture',TRUST_FIKUS_PROXY:'true'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));const base='http://127.0.0.1:'+app.server.address().port;
  const initial=await fetch(base+'/api/public'),cookie=initial.headers.get('set-cookie').split(';')[0];
  async function event(ip,sessionId){const response=await fetch(base+'/api/events',{method:'POST',headers:{cookie,'content-type':'application/json','x-fikus-client-ip':ip,'cf-ipcountry':'CN'},body:JSON.stringify({events:[{id:randomUUID(),sessionId,type:'session_start',at:Date.now(),country:'CN'}]})});assert.equal(response.status,200);}
  const session=randomUUID();await event('8.8.8.8',session);await event('8.8.8.8',session);await event('1.1.1.1',randomUUID());await event('127.0.0.1',randomUUID());
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'fixture'})});assert.equal(login.status,200);const admin=login.headers.get('set-cookie').split(';')[0];const data=await fetch(base+'/api/admin/analytics',{headers:{cookie:admin}}).then(r=>r.json());
  assert.equal(data.summary.sessions,3);assert.equal(data.countries.find(c=>c.country==='US').sessions,1);assert.equal(data.countries.find(c=>c.country==='AU').sessions,1);assert.equal(data.countries.find(c=>c.country==='').sessions,1);assert.ok(!JSON.stringify(data).includes('8.8.8.8'));assert.ok(app.db.prepare('SELECT country FROM events').all().every(r=>r.country!=='CN'));
});
