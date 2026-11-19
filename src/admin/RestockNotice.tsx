import { useEffect, useRef, useState } from 'react';
import { BellRing, Send, Square, CheckCircle2 } from 'lucide-react';
import { toJpeg } from 'html-to-image';
import { api, mutation } from '../api';
import type { Product } from '../domain';
import { ProductCover } from '../ProductCover';
import { ClawdProductArt } from '../ClaudeSection';
import { number } from './shared';
import './restocks.css';

interface Campaign {
  id:string;title:string;quantity:number;status:'draft'|'running'|'done'|'cancelled';total:number;sent:number;failed:number;skipped:number;uncertain:number;pending:number;caption:string;mediaKind:'photo'|'animation';error:string;
  messageTitle:string;messageText:string;audience:{mode:'all'|'latest';limit:number|null};
}
export function RestockNotice({product,added,busy,save}:{product:Product;added:number;busy:boolean;save:()=>Promise<boolean>}) {
  const [open,setOpen]=useState(false),[quantity,setQuantity]=useState(Math.max(1,added)),[pending,setPending]=useState(false),[error,setError]=useState('');
  const [preview,setPreview]=useState<Campaign|null>(null),[history,setHistory]=useState<Campaign[]>([]);
  const [messageTitle,setMessageTitle]=useState('Снова в наличии'),[messageText,setMessageText]=useState('Посмотрите условия и оформите заказ в карточке товара.');
  const [audience,setAudience]=useState('all'),[customLimit,setCustomLimit]=useState(200);
  const art=useRef<HTMLDivElement>(null);
  const signature=JSON.stringify(product);
  useEffect(()=>{setPreview(null);},[signature,quantity,messageTitle,messageText,audience,customLimit]);
  const limit=audience==='custom'?customLimit:Number(audience);
  const captionLength=`🟢 ${messageTitle.trim()}\n\n${product.title.trim()}\nДобавили ${number(quantity||0)} шт.\n\n${messageText.trim()}`.length;
  const validMessage=!!messageTitle.trim()&&!!messageText.trim()&&captionLength<=1024;
  const validAudience=audience==='all'||Number.isInteger(limit)&&limit>=1&&limit<=100000;
  const audienceLabel=(c:Campaign)=>c.audience.mode==='all'?'Все доступные клиенты':`Последние ${number(c.audience.limit??0)} новых клиентов`;
  useEffect(()=>{
    if(!open)return;
    let active=true;
    const load=()=>api<Campaign[]>('/admin/restocks?productId='+encodeURIComponent(product.id)).then(rows=>{if(active)setHistory(rows.filter(c=>c.status!=='draft'));}).catch(e=>{if(active)setError(e.message);});
    void load();const timer=setInterval(()=>void load(),2500);return()=>{active=false;clearInterval(timer);};
  },[open,product.id]);
  async function prepare() {
    setPending(true);setError('');setPreview(null);
    try {
      if(!await save())throw Error('Не удалось сохранить товар. Проверьте его настройки.');
      if(!art.current)throw Error('Обложка ещё загружается');
      let image;
      if(product.brand!=='claude'||product.imageId) {
        await document.fonts.ready;
        await Promise.all([...art.current.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
        image=await toJpeg(art.current,{quality:.92,pixelRatio:2,backgroundColor:'#f4f5f1',cacheBust:false,style:{borderRadius:'0',margin:'0'}});
      }
      setPreview(await mutation<Campaign>('/admin/restocks/preview','POST',{productId:product.id,product:{...product,title:product.title.trim()},quantity,image,messageTitle,messageText,audience:audience==='all'?{mode:'all'}:{mode:'latest',limit}}));
    } catch(e){setError((e as Error).message);}finally{setPending(false);}
  }
  async function send() {
    if(!preview)return;setPending(true);setError('');
    try {const result=await mutation<Campaign>('/admin/restocks/'+preview.id+'/send','POST',{});setHistory(rows=>[result,...rows.filter(r=>r.id!==result.id)]);setPreview(null);}
    catch(e){setError((e as Error).message);}finally{setPending(false);}
  }
  async function cancel(id:string) {
    setPending(true);setError('');
    try {const result=await mutation<Campaign>('/admin/restocks/'+id+'/cancel','POST',{});setHistory(rows=>rows.map(r=>r.id===id?result:r));}
    catch(e){setError((e as Error).message);}finally{setPending(false);}
  }
  if(product.saleMode==='request')return null;
  return <section className="a-form-section a-restock">
    <button type="button" className="a-btn secondary" disabled={busy||pending} onClick={()=>{setOpen(!open);if(!open)setQuantity(Math.max(1,added));}}><BellRing size={17}/>Уведомить о пополнении</button>
    {open&&<>
      <p className="a-restock-intro">Сообщите покупателям о новой поставке. Товар сохраним перед предпросмотром, а рассылку запустим только по кнопке отправки.</p>
      <label>Сколько добавили<input type="number" min="1" max={product.stock} step="1" value={quantity} disabled={pending} onChange={e=>setQuantity(Number(e.target.value))}/><small>Количество в этой поставке, а не общий остаток.</small></label>
      <label>Заголовок сообщения<input type="text" maxLength={100} value={messageTitle} disabled={pending} onChange={e=>setMessageTitle(e.target.value)}/></label>
      <label>Текст сообщения<textarea rows={4} maxLength={800} value={messageText} disabled={pending} onChange={e=>setMessageText(e.target.value)}/><small className={captionLength>1024?'a-error':undefined}>Всё сообщение с названием товара: {number(captionLength)} / 1 024 символов.</small></label>
      <label>Кому отправить<select value={audience} disabled={pending} onChange={e=>setAudience(e.target.value)}>
        <option value="all">Всем доступным клиентам</option>
        <option value="200">Последним 200 новым клиентам</option>
        <option value="500">Последним 500 новым клиентам</option>
        <option value="1000">Последним 1 000 новым клиентам</option>
        <option value="custom">Своё количество новых клиентов</option>
      </select><small>По первому известному обращению в магазин, а не по последней активности.</small></label>
      {audience==='custom'&&<label>Количество новых клиентов<input type="number" min="1" max="100000" step="1" value={customLimit||''} disabled={pending} onChange={e=>setCustomLimit(Number(e.target.value))}/></label>}
      <div className={`a-restock-message${preview?' prepared':''}`}>
        <div className="a-restock-art" ref={art} data-restock-art>{product.brand==='claude'&&!product.imageId?<ClawdProductArt product={product}/>:<ProductCover product={product}/>}</div>
        {preview?<>
          <div className="a-restock-saved-media">{preview.mediaKind==='animation'?<video src={`${import.meta.env.BASE_URL}api/admin/restocks/${preview.id}/media`} autoPlay loop muted playsInline aria-label="Анимация рассылки"/>:<img src={`${import.meta.env.BASE_URL}api/admin/restocks/${preview.id}/media`} alt="Обложка рассылки"/>}</div>
          <div className="a-restock-copy"><b>{preview.messageTitle}</b><blockquote><strong>{preview.title}</strong><span>Добавили {number(preview.quantity)} шт.</span></blockquote><p>{preview.messageText}</p></div>
        </>:<div className="a-restock-copy"><b>{messageTitle}</b><blockquote><strong>{product.title}</strong><span>Добавили {number(quantity||0)} шт.</span></blockquote><p>{messageText}</p></div>}
        <div className="a-restock-link">Открыть карточку товара ↗</div>
      </div>
      {preview?<>
        <p className="a-restock-audience">{audienceLabel(preview)}. Получателей: <b>{number(preview.total)}</b>. Список зафиксирован для этого предпросмотра; каждый человек получит одно уведомление.</p>
        <button type="button" className="a-btn" disabled={pending||busy||!preview.total} onClick={()=>void send()}><Send size={16}/>{pending?'Запускаем…':`Отправить ${number(preview.total)} ${preview.total%10===1&&preview.total%100!==11?'пользователю':'пользователям'}`}</button>
        <button type="button" className="a-link" disabled={pending} onClick={()=>setPreview(null)}>Изменить рассылку</button>
      </>:<button type="button" className="a-btn" disabled={pending||busy||!validMessage||!validAudience||!Number.isInteger(quantity)||quantity<1||quantity>product.stock||!product.visible} onClick={()=>void prepare()}><BellRing size={16}/>{pending?'Готовим предпросмотр…':'Предпросмотр рассылки'}</button>}
      <small>Уведомления получат пользователи магазина, которым бот может написать. Чёрный список и отключённые уведомления учитываются.</small>
      {history.map(c=><div className="a-restock-progress" key={c.id} role="status">
        <b>{c.status==='running'?<BellRing size={16}/>:<CheckCircle2 size={16}/>} {c.status==='running'?'Отправляем уведомления':c.status==='cancelled'?'Рассылка остановлена':'Рассылка завершена'} · +{number(c.quantity)} шт.</b>
        <span>{c.messageTitle} · {audienceLabel(c)}</span>
        <span>Доставлено {c.sent} из {c.total}{c.failed?` · Недоступны: ${c.failed}`:''}{c.skipped?` · Пропущено: ${c.skipped}`:''}{c.uncertain?` · Без подтверждения: ${c.uncertain}`:''}</span>
        {c.error&&<span>{c.error}</span>}
        {c.status==='running'&&<button type="button" className="a-link" disabled={pending} onClick={()=>void cancel(c.id)}><Square size={12}/>Остановить рассылку</button>}
      </div>)}
      {error&&<p className="a-error" role="alert">{error}</p>}
    </>}
  </section>;
}
