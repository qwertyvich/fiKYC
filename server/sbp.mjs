import {createHmac,timingSafeEqual} from 'node:crypto';
const codes=['mc9','mc10','mc27'],phases=['created','pending','review','success','failed','rejected','expired','cancelled'];
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function decimalMinor(value){const text=String(value);if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(text))throw Error('Некорректная сумма платежа');const [whole,fraction='']=text.split('.'),minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(minor))throw Error('Некорректная сумма платежа');return minor;}
export function methodCode(method){if(method?.method!=='qr'||/вьет|viet\s?nam|vietnam|🇻🇳/iu.test((method.name??'')+' '+(method.description??'')))return null;const match=String(method.name).match(/(?:^|\W)(?:ms|mc|мс)[\s-]*(9|10|27)(?=\D|$)/i);return match?'mc'+match[1]:null;}
export function createSbp({db,env,gateway,state,now=Date.now,fetchImpl=fetch}){
  db.exec(`CREATE TABLE IF NOT EXISTS sbp_config(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL,preferred TEXT NOT NULL);
    INSERT OR IGNORE INTO sbp_config VALUES(1,1,'mc9');
    CREATE TABLE IF NOT EXISTS sbp_webhooks(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sbp_receipt_jobs(receipt_id TEXT PRIMARY KEY,payment_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '');`);
  const apiKey=env.PAY_PROVIDER_API_KEY??'',secret=env.PAY_PROVIDER_WEBHOOK_SECRET??'',base='https://pay-provider.casa/api/v1/';
  const config=()=>{const r=db.prepare('SELECT * FROM sbp_config WHERE id=1').get();return{enabled:!!r.enabled,preferred:r.preferred};};
  const intent=id=>db.prepare('SELECT * FROM sbp_intents WHERE payment_id=?').get(id);
  const safeError=e=>String(e.message??'Ошибка платёжной системы').split(apiKey||'\0').join('[key]').split(secret||'\0').join('[secret]').slice(0,800);
  let stopped=false,timer=null,running=false,methodsPending=null;const creating=new Map(),checking=new Map(),callsAt=[];
  async function api(path,{method='GET',body,form}={}){
    if(!apiKey)fail('Оплата СБП пока не подключена',503);
    while(callsAt.length&&callsAt[0]<=now()-60000)callsAt.shift();if(callsAt.length>=100)fail('Платёжная система занята. Повторите через минуту.',429);callsAt.push(now());
    let response;try{response=await fetchImpl(base+path,{method,redirect:'error',headers:{Authorization:'Bearer '+apiKey,...(body?{'Content-Type':'application/json'}:{})},body:form??(body?JSON.stringify(body):undefined),signal:AbortSignal.timeout(20000)});}catch{throw Object.assign(new Error('Нет ответа платёжной системы. Проверяем созданный платёж.'),{uncertain:method==='POST',status:503});}
    const data=await response.json().catch(()=>null);if(!response.ok)throw Object.assign(new Error(safeError({message:data?.message??'Платёжная система временно недоступна'})),{status:response.status,providerCode:data?.error,uncertain:method==='POST'&&response.status>=500});
    if(!data||typeof data!=='object')throw Object.assign(new Error('Некорректный ответ платёжной системы'),{uncertain:method==='POST',status:502});return data;
  }
  async function loadMethods(){const list=await api('methods/');if(!Array.isArray(list))fail('Не удалось проверить способы оплаты СБП',502);return list.map(m=>({...m,code:methodCode(m)})).filter(m=>m.code&&typeof m.qr_method_id==='string'&&/^[-\w]{1,64}$/.test(m.qr_method_id)).map(m=>({...m,min:decimalMinor(m.min_amount),max:m.max_amount===null?null:decimalMinor(m.max_amount)}));}
  function methods(){if(!methodsPending)methodsPending=loadMethods().finally(()=>{methodsPending=null;});return methodsPending;}
  const fits=(m,minor)=>minor>=m.min&&(m.max===null||minor<=m.max);
  async function options(minor){const c=config();if(!apiKey||!c.enabled)return{available:false,configured:!!apiKey};try{const m=(await methods()).find(m=>m.code===c.preferred);return{available:!!m&&fits(m,minor),configured:true,min:m?m.min/100:null,max:m?.max===null?null:m?m.max/100:null};}catch{return{available:false,configured:true,unavailable:true};}}
  async function admin(){let list=[],error='';if(apiKey)try{list=await methods();}catch(e){error=safeError(e);}return{...config(),apiConfigured:!!apiKey,webhookConfigured:!!secret,webhookUrl:(env.PUBLIC_ORIGIN??'').replace(/\/$/,'')+'/api/webhooks/pay-provider',lastWebhookAt:db.prepare('SELECT MAX(created_at) at FROM sbp_webhooks').get().at??null,error,methods:codes.map(code=>{const m=list.find(m=>m.code===code);return{code,name:m?.name??code.toUpperCase(),description:m?.description??'Сейчас не предоставляется платёжной системой',available:!!m,providerMethodId:m?.qr_method_id??null,min:m?m.min/100:null,max:m?.max===null?null:m?m.max/100:null};})};}
  function saveConfig(input){if(typeof input.enabled!=='boolean'||!codes.includes(input.preferred))fail('Выберите MC9, MC10 или MC27');db.prepare('UPDATE sbp_config SET enabled=?,preferred=? WHERE id=1').run(Number(input.enabled),input.preferred);return config();}
  function paymentUrl(value,id){try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='pay-provider.casa'&&u.pathname===`/pay/${id}/`&&!u.username&&!u.password)return u.href;}catch{}return null;}
  async function apply(remote){
    if(stopped)return false;
    if(!remote||!uuid.test(remote.id??''))fail('Некорректный ID платежа провайдера',502);
    let stored=db.prepare('SELECT * FROM sbp_intents WHERE external_id=?').get(remote.id);
    if(!stored&&typeof remote.order_id==='string'){const candidate=intent(remote.order_id);if(candidate&&!candidate.external_id)stored=candidate;}
    if(!stored)return false;
    const p=gateway.externalRow(stored.payment_id);
    if(remote.method!=='qr'||remote.currency!=='RUB'||remote.order_id!==p.id||remote.customer_id!==p.visitor_id||decimalMinor(remote.amount)!==p.amount_minor||!phases.includes(remote.status))fail('Данные платежа не совпадают с заказом',409);
    if(stored.phase==='success'&&remote.status!=='success')return true;
    const previous=JSON.parse(stored.snapshot),url=paymentUrl(remote.payment_url,remote.id)??previous.paymentUrl??null;
    const expires=remote.expires_at?Date.parse(remote.expires_at):null;if(expires!==null&&!Number.isFinite(expires))fail('Некорректный срок оплаты',502);
    const snapshot={...previous,paymentUrl:url,expiresAt:expires,externalId:remote.id,paidAmount:remote.paid_amount===null||remote.paid_amount===undefined?null:String(remote.paid_amount),receiptsCount:Number(remote.receipts_count??previous.receiptsCount??0),comment:String(remote.comment??'').slice(0,1000)};
    if(stored.external_id===remote.id&&stored.phase===remote.status&&stored.snapshot===JSON.stringify(snapshot)&&p.expires_at===expires&&(remote.status!=='success'||p.status==='paid'||p.reason==='sbp_amount_review')){db.prepare('UPDATE sbp_intents SET updated_at=?,next_at=? WHERE payment_id=?').run(now(),now()+10000,p.id);return true;}
    db.exec('BEGIN IMMEDIATE');try{
      db.prepare('UPDATE sbp_intents SET external_id=?,phase=?,snapshot=?,error=\'\',updated_at=?,next_at=? WHERE payment_id=?').run(remote.id,remote.status,JSON.stringify(snapshot),now(),now()+10000,p.id);
      db.prepare('UPDATE payments SET expires_at=? WHERE id=?').run(expires,p.id);
      if(['failed','rejected','cancelled'].includes(remote.status))db.prepare("UPDATE payments SET status='invalidated',reason='sbp_failed' WHERE id=? AND status!='paid'").run(p.id);
      if(remote.status==='expired')db.prepare("UPDATE payments SET status='awaiting_receipt',reason='expired' WHERE id=? AND status!='paid'").run(p.id);
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    if(remote.status==='success'){
      if(remote.paid_amount===null||remote.paid_amount===undefined||decimalMinor(remote.paid_amount)<p.amount_minor){db.prepare("UPDATE payments SET status='receipt_review',reason='sbp_amount_review' WHERE id=? AND status!='paid'").run(p.id);gateway.notifyExternal(p.id,`СБП · ${p.id}\nПоступление требует проверки суммы. Ожидали ${p.amount_minor/100} RUB. Получено: ${remote.paid_amount??'не указано'}. Товар не выдан.`,remote.id+':amount');}
      else{
        let note=p.status==='paid'&&stored.phase!=='success'?'В заказе уже была подтверждена другая оплата. Дополнительный перевод СБП проверьте вручную.':'Оплата подтверждена платёжной системой.';try{await gateway.confirmExternal(p.id);}catch(e){note='Деньги поступили, но заказ требует ручной обработки: '+safeError(e);}
        gateway.notifyExternal(p.id,`фиКУС · СБП\nЗаказ: ${p.id}\nСумма: ${p.amount_minor/100} RUB\nПолучено: ${remote.paid_amount} RUB\nTelegram ID: ${p.telegram_id||'—'}\n${JSON.parse(p.items).map(i=>i.title+' × '+i.quantity).join('\n')}\nМетод: ${stored.method_code.toUpperCase()}\n${note}`,remote.id+':success');
      }
    }
    gateway.events.emit('change');return true;
  }
  async function recover(id){const list=await api('payments/?order_id='+encodeURIComponent(id)+'&limit=200');if(!Array.isArray(list))fail('Не удалось проверить создание платежа',502);if(list.length>1)fail('Найдены повторные платежи. Требуется проверка менеджера.',409);if(list[0])await apply(list[0]);return gateway.view(gateway.externalRow(id));}
  async function issue(id){if(creating.has(id))return creating.get(id);const work=(async()=>{
    const p=gateway.externalRow(id);if(p?.provider!=='sbp')return gateway.view(p);const old=intent(id);if(old){if(!old.external_id&&['creating','unknown'].includes(old.phase))return recover(id);return gateway.view(p);}
    const c=config();if(!c.enabled)fail('Оплата СБП временно приостановлена',409);if(gateway.cardAvailable(p.amount_minor))fail('Карта снова доступна. Выберите оплату картой.',409);
    const method=(await methods()).find(m=>m.code===c.preferred);if(!method||!fits(method,p.amount_minor))fail('СБП недоступен для этой суммы. Выберите криптовалюту или свяжитесь с менеджером.',409);
    if(!config().enabled)fail('Оплата СБП временно приостановлена',409);
    if(gateway.cardAvailable(p.amount_minor))fail('Карта снова доступна. Выберите оплату картой.',409);
    db.prepare('INSERT INTO sbp_intents(payment_id,method_code,method_id,snapshot,updated_at) VALUES(?,?,?,?,?)').run(id,method.code,method.qr_method_id,JSON.stringify({methodName:method.name,methodDescription:method.description??''}),now());
    const settings=state?.().settings,bot=settings?.botUsername;
    const back=bot&&/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(bot)?'https://t.me/'+bot+(settings.appShortName?'/'+settings.appShortName:'')+'?startapp=pay_'+id:(env.PUBLIC_ORIGIN??'').replace(/\/$/,'')+'/#/payment/'+id;
    try{const remote=await api('payments/',{method:'POST',body:{method:'qr',qr_method_id:method.qr_method_id,amount:(p.amount_minor/100).toFixed(2),order_id:id,customer_id:p.visitor_id,description:JSON.parse(p.items).map(i=>i.title+' × '+i.quantity).join(' · ').slice(0,500),success_url:back,fail_url:back}});await apply(remote);}
    catch(e){const phase=e.uncertain||e.status>=500?'unknown':'failed';db.prepare('UPDATE sbp_intents SET phase=?,error=?,next_at=? WHERE payment_id=?').run(phase,safeError(e),now()+10000,id);if(phase==='failed')db.prepare("UPDATE payments SET status='invalidated',reason='sbp_failed' WHERE id=?").run(id);gateway.events.emit('change');}
    return gateway.view(gateway.externalRow(id));
  })().finally(()=>creating.delete(id));creating.set(id,work);return work;}
  async function check(id){if(checking.has(id))return checking.get(id);const stored=intent(id);if(!stored)return issue(id);if(now()-stored.updated_at<5000)return gateway.view(gateway.externalRow(id));const work=(async()=>{if(stored.external_id)await apply(await api('payments/'+stored.external_id+'/'));else await recover(id);return gateway.view(gateway.externalRow(id));})().finally(()=>checking.delete(id));checking.set(id,work);return work;}
  async function assertCanSwitch(id){const stored=intent(id);if(!stored)return;await check(id);const live=intent(id),p=gateway.externalRow(id);if(p.status==='paid')fail('Оплата уже подтверждена',409);if(['creating','unknown'].includes(live.phase)||(['created','pending','review'].includes(live.phase)&&(!p.expires_at||p.expires_at>now())))fail('Ссылка СБП ещё действует. Сначала проверьте платёж или дождитесь окончания срока.',409);}
  function receiveWebhook(raw,headers){
    const ts=headers['x-timestamp'],signature=headers['x-signature'];if(!secret||typeof ts!=='string'||!/^\d{1,12}$/.test(ts)||Math.abs(now()/1000-Number(ts))>300||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))fail('Неверная подпись уведомления',401);
    const expected='sha256='+createHmac('sha256',secret).update(ts+'.').update(raw).digest('hex');if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))fail('Неверная подпись уведомления',401);
    let event;try{event=JSON.parse(raw);}catch{fail('Некорректное уведомление');}
    if(!/^[-\w]{1,128}$/.test(String(event.id??''))||!uuid.test(event.data?.id??'')||!phases.includes(event.data?.status)||event.event!=='payment.'+event.data.status||(headers['x-webhook-id']&&headers['x-webhook-id']!==String(event.id))||(headers['x-event']&&headers['x-event']!==event.event))fail('Некорректное уведомление');
    const known=db.prepare('SELECT payment_id FROM sbp_intents WHERE external_id=?').get(event.data.id)||db.prepare("SELECT id FROM payments WHERE id=? AND provider='sbp'").get(String(event.data.order_id??''));
    db.prepare('INSERT OR IGNORE INTO sbp_webhooks(id,payload,created_at,status) VALUES(?,?,?,?)').run(String(event.id),raw.toString('utf8'),now(),known?'pending':'ignored');if(!stopped)setImmediate(()=>void pump());return{ok:true};
  }
  function enqueueReceipts(){db.prepare("INSERT OR IGNORE INTO sbp_receipt_jobs(receipt_id,payment_id) SELECT r.id,r.payment_id FROM gateway_receipts r JOIN sbp_intents i ON i.payment_id=r.payment_id JOIN gateway_receipt_files f ON f.id=r.id WHERE i.external_id IS NOT NULL").run();}
  async function pump(){if(stopped||running||!apiKey)return;running=true;try{
    enqueueReceipts();
    for(const job of db.prepare("SELECT * FROM sbp_webhooks WHERE status='pending' AND next_at<=? ORDER BY created_at LIMIT 8").all(now())){
      try{const event=JSON.parse(job.payload),remote=await api('payments/'+event.data.id+'/');if(event.data.status==='success'&&remote.status!=='success')throw Error('Ожидаем подтверждение статуса API');if(!await apply(remote))throw Error('Ожидаем привязку платежа');db.prepare("UPDATE sbp_webhooks SET status='done' WHERE id=?").run(job.id);}catch{if(stopped)return;db.prepare('UPDATE sbp_webhooks SET attempts=attempts+1,next_at=? WHERE id=?').run(now()+Math.min(300000,2000*2**Math.min(job.attempts,7)),job.id);}
    }
    for(const job of db.prepare("SELECT * FROM sbp_receipt_jobs WHERE status='pending' AND next_at<=? LIMIT 4").all(now())){
      try{const file=db.prepare('SELECT * FROM gateway_receipt_files WHERE id=?').get(job.receipt_id),i=intent(job.payment_id),form=new FormData();form.set('file',new Blob([file.data],{type:file.mime}),'receipt.'+(file.mime==='application/pdf'?'pdf':file.mime.split('/')[1]));await apply(await api('payments/'+i.external_id+'/receipt/',{method:'POST',form}));db.prepare("UPDATE sbp_receipt_jobs SET status='sent',error='' WHERE receipt_id=?").run(job.receipt_id);}catch(e){if(stopped)return;const permanent=[400,404,409,413].includes(e.status)||e.providerCode==='too_many_receipts';db.prepare('UPDATE sbp_receipt_jobs SET status=?,attempts=attempts+1,next_at=?,error=? WHERE receipt_id=?').run(permanent?'failed':'pending',now()+Math.min(300000,2000*2**Math.min(job.attempts,7)),safeError(e),job.receipt_id);if(permanent)gateway.notifyExternal(job.payment_id,'Не удалось доставить квитанцию в платёжную систему. Заказ '+job.payment_id+'. Квитанция сохранена в приложении. Причина: '+safeError(e),'receipt-failed:'+job.receipt_id);}
    }
    const recent=db.prepare("SELECT i.payment_id FROM sbp_intents i JOIN payments p ON p.id=i.payment_id WHERE p.status!='paid' AND (p.created_at>? OR i.phase IN ('creating','unknown','created','pending','review')) LIMIT 1").get(now()-48*3600000);if(recent){try{const list=await api('payments/?limit=200');if(Array.isArray(list))for(const remote of list)try{await apply(remote);}catch{}}catch{}}
    if(stopped)return;
    const stale=db.prepare("SELECT * FROM sbp_intents WHERE next_at<=? AND payment_id IN (SELECT id FROM payments WHERE created_at>?) AND phase IN ('creating','unknown','created','pending','review','expired','failed') ORDER BY next_at LIMIT 1").get(now(),now()-48*3600000);if(stale){try{if(stale.external_id)await apply(await api('payments/'+stale.external_id+'/'));else await recover(stale.payment_id);}catch{}if(stopped)return;db.prepare('UPDATE sbp_intents SET next_at=? WHERE payment_id=?').run(now()+60000,stale.payment_id);}
  }catch{/* Durable jobs remain pending for the next pass. */}finally{running=false;}}
  function start(){stopped=false;if(timer)return;timer=setInterval(()=>void pump(),10000);timer.unref();void pump();}
  function stop(){stopped=true;clearInterval(timer);timer=null;}
  return{config,saveConfig,admin,options,issue,check,apply,receiveWebhook,assertCanSwitch,enqueueReceipts,pump,start,stop};
}
