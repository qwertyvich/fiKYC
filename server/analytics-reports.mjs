import {Worker} from 'node:worker_threads';
import {analytics} from './analytics.mjs';
export function createAnalyticsReports(db,dbPath,{ttl=15000,timeout=20000}={}){
  let worker=null,serial=0,closed=false;
  const jobs=new Map(),pending=new Map(),cache=new Map();
  const unavailable=()=>Object.assign(new Error('Не удалось обновить статистику. Повторите через несколько секунд.'),{status:503});
  function failWorker(instance){if(worker!==instance)return;worker=null;for(const job of jobs.values()){clearTimeout(job.timer);job.reject(unavailable());}jobs.clear();void instance.terminate();}
  function start(){
    if(worker)return worker;
    const instance=new Worker(new URL('./analytics-worker.mjs',import.meta.url),{workerData:{dbPath},resourceLimits:{maxOldGenerationSizeMb:128}});worker=instance;instance.unref();
    instance.on('message',message=>{const job=jobs.get(message.id);if(!job)return;jobs.delete(message.id);clearTimeout(job.timer);if(message.error)job.reject(Object.assign(new Error(message.error),{status:message.status}));else job.resolve(message.value);});
    instance.on('error',()=>failWorker(instance));instance.on('exit',()=>failWorker(instance));return instance;
  }
  async function get(input={}){
    if(closed)throw unavailable();
    const query=Object.fromEntries(['days','productId','sessionId','from','to','timeZone','eventPage','sessionPage'].filter(key=>input[key]!==undefined).map(key=>[key,input[key]]));
    const key=JSON.stringify(query),saved=cache.get(key);if(saved&&saved.expires>Date.now())return saved.value;
    if(pending.has(key))return pending.get(key);
    if(jobs.size>=4)throw unavailable();
    const work=dbPath===':memory:'?Promise.resolve().then(()=>analytics(db,query)):new Promise((resolve,reject)=>{const instance=start(),id=++serial,timer=setTimeout(()=>failWorker(instance),timeout);timer.unref();jobs.set(id,{resolve,reject,timer});instance.postMessage({id,query});});
    const result=work.then(value=>{cache.delete(key);cache.set(key,{value,expires:Date.now()+ttl});while(cache.size>8)cache.delete(cache.keys().next().value);return value;}).finally(()=>pending.delete(key));
    pending.set(key,result);return result;
  }
  function close(){closed=true;cache.clear();if(worker)failWorker(worker);}
  return{get,close};
}
