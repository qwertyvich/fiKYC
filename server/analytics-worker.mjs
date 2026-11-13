import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {analytics} from './analytics.mjs';
const db=new DatabaseSync(workerData.dbPath,{readOnly:true});
db.exec('PRAGMA busy_timeout=5000');
parentPort.on('message',({id,query})=>{
  try{parentPort.postMessage({id,value:analytics(db,query)});}
  catch(error){parentPort.postMessage({id,error:error.message,status:error.status??400});}
});
