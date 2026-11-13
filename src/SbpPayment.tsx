import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,CheckCircle2,Clock3,FileUp,LoaderCircle,MessageCircle,Smartphone,RefreshCw,WalletCards} from 'lucide-react';
import {api,mutation} from './api';
import {rawMoney,type ShopSettings} from './domain';
import {t} from './i18n';
import {exchangeRate,russianPayments,setPaymentMethod} from './pricing';
import {UsdtNetworkPicker} from './UsdtCheckout';
import {usdTotalMinor,type UsdtNetwork} from './usdt';
import {sellerChatLink} from './seller';
import {telegram} from './telegram';
import {PaymentWarning} from './PaymentFlow';
import type {Payment,PaymentOptions} from './payments';
import './sbp.css';

export function AlternativePayments({options,amount,busy,onSbp,onCrypto}:{options:PaymentOptions;amount:number;busy:boolean;onSbp():void;onCrypto():void}){
  return <section className="alternative-payments"><h2>{t('Выберите способ оплаты')}</h2><p>{t('Подходящей карты сейчас нет. Можно выбрать другой способ оплаты.')}</p>
    {options.russian&&<><button className="alternative-payment" type="button" disabled={busy||!options.sbp.available} onClick={onSbp}><span className="sbp-mark"><Smartphone size={24}/></span><span><b>СБП</b><small>{options.sbp.available?'Оплата в приложении банка':options.sbp.min?'Для сумм от '+rawMoney(options.sbp.min)+(options.sbp.max?' до '+rawMoney(options.sbp.max):''):'Сейчас недоступно'}</small></span><ArrowUpRight size={20}/></button></>}
    <button className="alternative-payment" type="button" disabled={busy} onClick={onCrypto}><span className="usdt-token">₮</span><span><b>{t('Криптовалюта USDT')}</b><small>TRC20 · BEP20</small></span><ArrowUpRight size={20}/></button>
    <p className="fine-print">{t('К оплате')}: {rawMoney(amount)}</p>
  </section>;
}

export function SbpPayment({payment:p,onUpdate,navigate,shop}:{payment:Payment;onUpdate(p:Payment):void;navigate(path:string):void;shop:ShopSettings}){
 const updated=useRef(onUpdate);updated.current=onUpdate;
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[time,setTime]=useState(Date.now()),[clockOffset,setClockOffset]=useState(()=>p.serverNow-Date.now()),[notPaid,setNotPaid]=useState(false),[alternatives,setAlternatives]=useState(false),[networks,setNetworks]=useState(false),[cardWarning,setCardWarning]=useState(false),[cardAccepted,setCardAccepted]=useState(false);
 const q=p.qr!,paid=p.status==='paid',expires=p.expiresAt??null,seconds=expires?Math.max(0,Math.ceil((expires-time-clockOffset)/1000)):null;
 const terminal=['failed','rejected','expired','cancelled'].includes(q.status)||seconds!==null&&seconds<=0;
 useEffect(()=>setClockOffset(p.serverNow-Date.now()),[p.serverNow]);
 const canOpen=!paid&&!terminal&&!!q.paymentUrl&&['created','pending','review'].includes(q.status);
 useEffect(()=>{const timer=setInterval(()=>setTime(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(paid)return;let alive=true;const timer=setInterval(()=>{if(document.visibilityState==='visible')void mutation<Payment>('/payments/'+p.id+'/check','POST',{}).then(v=>{if(alive)updated.current(v);}).catch(()=>{});},10000);return()=>{alive=false;clearInterval(timer);};},[p.id,paid]);
 async function check(){if(busy)return;setBusy(true);setError('');try{onUpdate(await mutation<Payment>('/payments/'+p.id+'/check','POST',{}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function upload(file?:File){if(!file||busy)return;if(file.size>10*1024*1024){setError('Прикрепите квитанцию до 10 МБ');return;}setBusy(true);setError('');try{onUpdate(await api<Payment>('/payments/'+p.id+'/receipt',{method:'POST',body:file,headers:{'Content-Type':file.type||'application/octet-stream'}}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function switchTo(method:'card'|'sbp'|'usdt',network?:UsdtNetwork){setBusy(true);setError('');try{const next=await mutation<Payment>('/payments/'+p.id+'/retry','POST',{method,network,notPaid,accepted:method==='card'?cardAccepted:undefined,expectedRate:exchangeRate()});if(method==='usdt'||method==='card')setPaymentMethod(method);navigate('/payment/'+next.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const instructions=(q.methodDescription??'').split('\n').map(line=>line.trim()).filter(line=>/банк|сбер|райф|нельзя|запрещ|не принима|не проход|sberpay/i.test(line)).map(line=>/газпром/i.test(line)?'Оплата через Газпромбанк недоступна. Используйте другой банк.':line).join('\n');
 return <><div className="page-title"><button className="back-link" onClick={()=>navigate('/orders')}><ArrowLeft size={17}/>{t('Мои заказы')}</button><h1>{paid?(p.purpose==='topup'?t('Баланс пополнен'):t('Оплата подтверждена')):'Оплата по СБП'}</h1><p className="payment-order-id">{p.id}</p></div>
  <section className="payment-amount-card"><div className="payment-eyebrow">{t('СУММА ПЕРЕВОДА')}</div><strong>{rawMoney(p.amount,'RUB')}</strong><p>{p.items.map(i=>t(i.title)+(i.quantity>1?' × '+i.quantity:'')).join(' · ')}</p></section>
  <section className="sbp-payment-card"><span className="sbp-mark large">{paid?<CheckCircle2 size={32}/>:<Smartphone size={32}/>}</span>
    <h2>{paid?'Спасибо, оплата получена':terminal?(q.status==='failed'?'СБП сейчас недоступен':'Ссылка на оплату больше не действует'):q.creating?'Подготавливаем оплату':'Оплатите через приложение банка'}</h2>
    <p>{paid?(p.purpose==='topup'?'Средства зачислены на баланс магазина.':'Менеджер свяжется с вами для передачи покупки.'):terminal?'Если уже перевели деньги, не платите повторно. Прикрепите чек — проверим поступление.':q.creating?'Проверяем создание ссылки. Не создавайте новый платёж, пока проверка не завершена.':'Откройте защищённую страницу оплаты и перейдите в приложение банка. Сумму менять не нужно.'}</p>
    {!paid&&expires&&<div className="sbp-expiry"><Clock3 size={17}/><span>{terminal?'Время истекло':'Оплатите до '+new Date(expires).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span><strong role="timer">{seconds===null?'—':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}</strong></div>}
    {!paid&&!expires&&!terminal&&<p className="fine-print">Срок действия ссылки будет указан на странице оплаты. Переводите только по действующей ссылке.</p>}
    {instructions&&!paid&&<div className="payment-notice"><p style={{whiteSpace:'pre-line'}}>{instructions}</p></div>}
    {canOpen&&<a className="primary-button" href={q.paymentUrl!} target="_blank" rel="noreferrer" onClick={e=>{if(telegram?.openLink){e.preventDefault();telegram.openLink(q.paymentUrl!,{try_instant_view:false});}}}>Перейти к оплате по СБП<ArrowUpRight size={19}/></a>}
    {!paid&&<button className="secondary-button" disabled={busy} onClick={()=>void check()}>{busy?<LoaderCircle className="spin" size={18}/>:<RefreshCw size={18}/>}Проверить оплату</button>}
    {p.reason==='sbp_amount_review'&&<p className="form-failure">Проверяем сумму поступления. Повторно переводить деньги не нужно.</p>}
  </section>
  <section className="payment-receipt"><div className="payment-receipt-heading"><FileUp size={21}/><h2>{p.receiptCount?'Квитанция сохранена':'После оплаты прикрепите чек'}</h2></div><p>Пришлите развёрнутый чек: на нём должны быть видны сумма, дата и получатель. Передадим его менеджеру и платёжной системе.</p><label className="primary-button sbp-upload"><FileUp size={18}/>{busy?'Сохраняем…':'Прикрепить квитанцию'}<input type="file" disabled={busy} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label><small>PDF, JPG, PNG или WebP · до 10 МБ · не более 5 чеков</small>{q.receiptDelivery==='pending'&&<p className="fine-print">Квитанция сохранена. Доставляем её в платёжную систему.</p>}{q.receiptDelivery==='failed'&&<p className="fine-print">Квитанция сохранена. Менеджер проверит доставку в платёжную систему.</p>}</section>
  {terminal&&!paid&&!p.receiptCount&&<><button className="payment-text-button" onClick={()=>setAlternatives(!alternatives)}>Выбрать другой способ оплаты</button>{alternatives&&<><label className="confirm-check"><input type="checkbox" checked={notPaid} onChange={e=>setNotPaid(e.target.checked)}/><span>Я ещё не переводил деньги по этому заказу</span></label>{russianPayments()&&<button className="secondary-button" disabled={!notPaid||busy} onClick={()=>{setCardAccepted(false);setCardWarning(true);}}>Оплатить картой в рублях</button>}{russianPayments()&&<button className="secondary-button" disabled={!notPaid||busy} onClick={()=>void switchTo('sbp')}>Получить новую ссылку СБП</button>}<button className="secondary-button" disabled={!notPaid||busy} onClick={()=>setNetworks(true)}><WalletCards size={18}/>Оплатить USDT</button>{networks&&<UsdtNetworkPicker amount={usdTotalMinor(p.items,exchangeRate())/100} busy={busy} disabled={!notPaid} onSelect={network=>void switchTo('usdt',network)}/>}</>}</>}
  {cardWarning&&<PaymentWarning busy={busy} accepted={cardAccepted} error={error} onAccepted={setCardAccepted} onConfirm={()=>switchTo('card')} onClose={()=>setCardWarning(false)}/>}
  {paid&&p.purpose==='topup'&&<button className="primary-button" onClick={()=>navigate('/profile')}>{t('Посмотреть баланс')}</button>}
  {error&&<p className="form-failure" role="alert">{t(error)}</p>}
  <div className="payment-support"><a className="secondary-button" href={sellerChatLink(shop.supportTelegram,`Здравствуйте! Нужна помощь с оплатой СБП ${p.id}.`)??'https://t.me/phiKYC'} target="_blank" rel="noreferrer"><MessageCircle size={17}/>{t('Связаться с менеджером')}</a></div>
 </>;
}
