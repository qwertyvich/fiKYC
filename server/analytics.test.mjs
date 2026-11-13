import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {analytics} from './analytics.mjs';
import {createAnalyticsReports} from './analytics-reports.mjs';
import {createApp} from './index.mjs';

test('streamed reports preserve local days and hours across a daylight-saving transition',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE events(id TEXT,type TEXT,product_id TEXT,session_id TEXT,visitor_id TEXT,at INTEGER,duration_ms INTEGER,quantity INTEGER,link_id TEXT,view_id TEXT,product_ids TEXT,country TEXT)");
 const insert=db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
 const events=[['2026-11-01T05:30:00Z','product_view',0],['2026-11-01T06:30:00Z','product_time',7000],['2026-11-01T07:30:00Z','cart_add',0],['2026-11-02T05:30:00Z','product_click',0]];
 events.forEach(([at,type,duration],i)=>insert.run(String(i),type,'p','s','v',Date.parse(at),duration,type==='cart_add'?3:0,'','view','[]','US'));
 const report=analytics(db,{from:'2026-10-31',to:'2026-11-03',timeZone:'America/New_York'});
 assert.equal(report.daily.find(d=>d.date==='2026-11-01').views,1);assert.equal(report.daily.find(d=>d.date==='2026-11-01').carts,1);assert.equal(report.daily.find(d=>d.date==='2026-11-02').sessions,1);assert.equal(report.hours[1].events,1);assert.equal(report.hours[2].events,1);assert.equal(report.hours[0].events,1);assert.equal(report.summary.averageSeconds,7);assert.equal(report.summary.units,3);assert.equal(report.events.find(e=>e.type==='product_view').activeSeconds,7);db.close();
});

test('180,000 timing events are computed outside the API thread, with bounded pages and cached repeated requests',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'fikus-analytics-')),dbPath=join(dir,'fixture.sqlite');
 const app=await createApp({dbPath,gatewayWorker:false,shopBotWorker:false,restockWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:'',GATEWAY_BOT_TOKEN:''}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const reports=createAnalyticsReports(app.db,dbPath);t.after(async()=>{reports.close();await new Promise(r=>app.server.close(r));await rm(dir,{recursive:true,force:true});});
 const at=Date.now()-3600000;
 app.db.exec(`WITH RECURSIVE n(i) AS(SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<179999) INSERT INTO events(id,visitor_id,session_id,type,product_id,at,duration_ms,view_id,country) SELECT 'time-'||i,'v-'||(i%400),'s-'||(i%400),'product_time','p',${at}+i,10000,'view-'||(i%400),CASE WHEN i%2=0 THEN 'US' ELSE 'RU' END FROM n`);
 const insert=app.db.prepare('INSERT INTO events(id,visitor_id,session_id,type,product_id,at,view_id,country) VALUES(?,?,?,?,?,?,?,?)');for(let i=0;i<400;i++)insert.run('view-'+i,'v-'+i,'s-'+i,'product_view','p',at-1,'view-'+i,i%2?'RU':'US');
 let complete=false;const query={days:7,timeZone:'Europe/Moscow'};const pending=reports.get(query).then(value=>{complete=true;return value;});
 await new Promise(r=>setTimeout(r,1));assert.equal(complete,false);
 const started=performance.now(),health=await fetch('http://127.0.0.1:'+app.server.address().port+'/api/health').then(r=>r.json());assert.equal(health.ok,true);assert.ok(performance.now()-started<1500,'health endpoint remains responsive while statistics are calculated');
 const report=await pending;assert.equal(report.summary.views,400);assert.equal(report.summary.sessions,400);assert.equal(report.summary.visitors,400);assert.equal(report.summary.averageSeconds,4500);assert.equal(report.events.length,200);assert.equal(report.sessions.length,100);assert.equal(report.totalEvents,400);assert.equal(report.countries.find(c=>c.country==='US').sessions,200);assert.equal(await reports.get(query),report);
});
