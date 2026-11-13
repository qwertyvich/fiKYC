import {useEffect,useState} from 'react';
import {Copy,RefreshCw,Save} from 'lucide-react';
import {api,mutation} from '../api';
import {rawMoney} from '../domain';
import {SectionHeading,Toggle} from './shared';
interface SbpAdmin {enabled:boolean;preferred:string;apiConfigured:boolean;webhookConfigured:boolean;webhookUrl:string;lastWebhookAt:number|null;error:string;methods:{code:string;name:string;description:string;available:boolean;providerMethodId:string|null;min:number|null;max:number|null}[]}
export function SbpSettings(){
 const [data,setData]=useState<SbpAdmin|null>(null),[enabled,setEnabled]=useState(false),[preferred,setPreferred]=useState('mc9'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){setBusy(true);setError('');try{const d=await api<SbpAdmin>('/admin/sbp');setData(d);setEnabled(d.enabled);setPreferred(d.preferred);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void refresh();},[]);
 return <section className="a-card a-form"><SectionHeading title="СБП по ссылке" description="Резерв после карты из Telegram · только для русского языка"/>
  {!data?<p>{error||'Проверяем подключение СБП…'}</p>:<>
   <div className="a-setting-line"><span><b>Оплата по СБП</b><small>Если подходящей карты нет, покупателю предложат СБП или USDT.</small></span><Toggle checked={enabled} onChange={setEnabled} label="Оплата по СБП"/></div>
   <p className="a-note">Используется только выбранный ниже метод. Переключение вручную; действующие ссылки сохраняют свой метод. Карты платёжной системы и Вьетнам не используются.</p>
   <fieldset style={{border:0,padding:0,margin:'20px 0'}}><legend style={{fontWeight:600,marginBottom:12}}>Метод для новых платежей</legend>{data.methods.map(m=><label key={m.code} style={{display:'block',padding:18,marginBottom:12,border:'1px solid var(--a-line)',borderRadius:16}}><span style={{display:'flex',gap:10,alignItems:'center'}}><input style={{width:18,height:18}} type="radio" name="sbp-method" value={m.code} checked={preferred===m.code} disabled={!m.available} onChange={()=>setPreferred(m.code)}/><b>{m.code.toUpperCase()} · {m.name}</b></span><small style={{display:'block',whiteSpace:'pre-line',lineHeight:1.7,marginTop:10}}>{m.description}</small><small style={{display:'block',marginTop:10}}>{m.available?'Доступен · от '+rawMoney(m.min??0)+(m.max===null?' · без верхнего лимита':' до '+rawMoney(m.max))+' · ID провайдера: '+m.providerMethodId:'Сейчас недоступен'}</small></label>)}</fieldset>
   <p>API: <b>{data.apiConfigured?'ключ настроен':'ключ не настроен'}</b> · Подпись вебхука: <b>{data.webhookConfigured?'настроена':'не настроена'}</b></p>
   <label>Адрес для вебхуков<input readOnly value={data.webhookUrl}/><small>Этот адрес нужно указать у платёжной системы. До подключения уведомлений статус также проверяется через API.</small></label>
   <button type="button" className="a-secondary" onClick={()=>void navigator.clipboard.writeText(data.webhookUrl).then(()=>setNotice('Адрес вебхука скопирован')).catch(()=>setError('Не удалось скопировать адрес'))}><Copy size={15}/>Скопировать адрес</button>
   <p className="a-note">{data.lastWebhookAt?'Последнее уведомление: '+new Date(data.lastWebhookAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':'Уведомления от провайдера ещё не поступали.'}</p>
   {data.error&&<p className="a-error">{data.error}</p>}
   <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button type="button" className="a-btn" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await mutation('/admin/sbp','PUT',{enabled,preferred});setNotice('Настройки СБП сохранены');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><Save size={15}/>Сохранить СБП</button><button type="button" className="a-secondary" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={15}/>Обновить методы и лимиты</button></div>
  </>}{error&&data&&<p className="a-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
}
