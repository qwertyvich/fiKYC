import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Copy, CreditCard, FileUp, Info, LoaderCircle, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, mutation } from './api';
import { rawMoney as money, type Product, type ShopSettings } from './domain';
import { t } from './i18n';
import { configurePricing,exchangeRate,paymentMethod,setPaymentMethod,russianPayments } from './pricing';
import { loadPublic } from './api';
import { usdTotalMinor,rubTotalMinor,rubUnitMinor,usdtNetworks,type UsdtNetwork } from './usdt';
import {UsdtCheckout,UsdtNetworkPicker} from './UsdtCheckout';
import { paymentTitles, type Payment,type PaymentOptions } from './payments';
import {AlternativePayments,SbpPayment} from './SbpPayment';
import { SellerMessage } from './SellerMessage';
import { readLocal, writeLocal } from './store';
import { sellerChatLink } from './seller';
import './payments.css';

export function PaymentWarning({busy,accepted,error,onAccepted,onConfirm,onClose,detail,backLabel='Вернуться к заказу',acceptLabel='Всё понятно, готовлюсь к переводу'}: {busy:boolean;accepted:boolean;error:string;onAccepted(value:boolean):void;onConfirm():void|Promise<void>;onClose():void;detail?:string;backLabel?:string;acceptLabel?:string}) {
  return <div className="payment-modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-warning" tabIndex={-1} onKeyDown={e=>{
    if(e.key==='Escape'&&!busy)onClose();
    if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input,button:not(:disabled)')),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }}>
    <span className="payment-icon large"><Clock3 size={27}/></span><h2 id="payment-warning">{t('15 минут на перевод')}</h2>{detail&&<p>{t(detail)}</p>}
    <p>{t('Реквизиты выдаются на 15 минут. Переведите точную сумму и вернитесь сюда, чтобы прикрепить квитанцию.')}</p>
    <div className="payment-notice"><Info size={18}/><p>{t('Карта может стать недоступна раньше. Перед переводом проверьте этот экран. Если появится предупреждение — не переводите по прежним реквизитам.')}</p></div>
    <label className="confirm-check"><input autoFocus type="checkbox" checked={accepted} onChange={e=>onAccepted(e.target.checked)}/><span>{t(acceptLabel)}</span></label>
    <button className="primary-button" disabled={!accepted||busy} onClick={()=>void onConfirm()}>{busy?<><LoaderCircle size={18} className="spin"/>{t('Подбираем реквизиты…')}</>:<>{t('Получить реквизиты')}<ArrowRight size={18}/></>}</button>
    <button className="secondary-button" disabled={busy} onClick={onClose}>{t(backLabel)}</button>{error&&<p className="form-failure" role="alert">{t(error)}</p>}
  </section></div>;
}

export function CardCheckout({ lines, shop, navigate }: { lines: { product: Product; quantity: number }[]; shop: ShopSettings; navigate(path: string): void }) {
  const [note, setNote] = useState(() => { const saved = readLocal<{note?: unknown}>('checkout-draft', {}); return typeof saved?.note === 'string' ? saved.note.slice(0, 1000) : ''; });
  const [warning, setWarning] = useState(false), [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [options,setOptions]=useState<PaymentOptions|null>(null);
  const total = rubTotalMinor(lines.map(l=>({...l.product,quantity:l.quantity})),exchangeRate())/100;
  const currencies = ['RUB' as const];
  const invalid = !lines.length || lines.some(l => l.quantity > l.product.stock || l.product.stock < 1);
  useEffect(() => { try { writeLocal('checkout-draft', { note }); } catch {} }, [note]);
  async function begin(){if(busy)return;setBusy(true);setError('');try{const options=await api<PaymentOptions>('/payment-options?amount='+total);setOptions(options);if(options.card){setAccepted(false);setWarning(true);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function submitSbp(){if(busy)return;setBusy(true);setError('');try{const p=await mutation<Payment>('/payments','POST',{items:lines.map(l=>({productId:l.product.id,quantity:l.quantity})),note,method:'sbp',expectedRate:exchangeRate(),expectedAmount:total});navigate('/payment/'+p.id);}catch(e){setError((e as Error).message);setOptions(null);}finally{setBusy(false);}}
  async function submit() {
    if (!accepted || busy) return; setBusy(true); setError('');
    try {
      const p = await mutation<Payment>('/payments', 'POST', { items: lines.map(l => ({ productId: l.product.id, quantity: l.quantity })), note, expectedAmount: total, accepted: true,method:'card',settlementCurrency:'RUB',expectedRate:exchangeRate() });
      navigate('/payment/' + p.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function submitUsdt(network:UsdtNetwork) {
    if(busy)return;setBusy(true);setError('');
    try {const p=await mutation<Payment>('/payments','POST',{items:lines.map(l=>({productId:l.product.id,quantity:l.quantity})),note,method:'usdt',network,expectedRate:exchangeRate(),expectedAmount:usdTotalMinor(lines.map(l=>({...l.product,quantity:l.quantity})),exchangeRate())/100});navigate('/payment/'+p.id);}
    catch(e){setError((e as Error).message);void loadPublic(true).then(data=>configurePricing(data.settings)).catch(()=>{});}finally{setBusy(false);}
  }
  if(paymentMethod()==='usdt')return <><div className="page-title"><button className="back-link" onClick={()=>navigate('/cart')}><ArrowLeft size={17}/>{t('В корзину')}</button><h1>{t('Оплата USDT')}</h1><p>{t('Проверьте заказ и выберите сеть перевода')}</p></div><UsdtCheckout lines={lines} note={note} setNote={setNote} busy={busy} error={error} onSelect={network=>void submitUsdt(network)} onCard={()=>{setPaymentMethod('card');void begin();}}/><div className="payment-support"><a className="secondary-button" href={sellerChatLink(shop.supportTelegram || 'tcmai', '') || 'https://t.me/tcmai'} target="_blank" rel="noreferrer"><MessageCircle size={17}/>{t('Связаться с менеджером')}</a></div></>;
  return <><div className="page-title"><button className="back-link" onClick={() => navigate('/cart')}><ArrowLeft size={17}/>{t("В корзину")}</button><h1>{t("Оформление заказа")}</h1><p>{t("Проверьте детали — и перейдём к оплате")}</p></div>
    <div className="checkout-steps"><span className="done"><Check size={14}/>{t("Корзина")}</span><span className="active">{t("2 · Проверка")}</span><span>{t("3 · Оплата")}</span></div>
    {!lines.length ? <div className="context-notice"><p>{t("В корзине пока пусто.")}<button className="inline-link" onClick={() => navigate('/catalog')}>{t("Выбрать товары")}</button></p></div> : <div className="checkout-form">
      <section className="content-card payment-summary"><div className="payment-eyebrow"><ShieldCheck size={16}/>{t("ВАШ ЗАКАЗ")}</div>{lines.map(({product: p, quantity}) => <div className="payment-line" key={p.id}><div><b>{t(p.title)}</b><small>{quantity} {t("шт.")}</small></div><strong>{money(rubUnitMinor(p.price,p.currency,exchangeRate())*quantity/100,'RUB')}</strong></div>)}<div className="payment-line payment-total"><span>{t("К оплате")}</span><strong>{currencies.length === 1 ? money(total, currencies[0]) : t('В разных валютах')}</strong></div></section>
      <label className="standalone-field">{t("Комментарий")}<span>{t("Необязательно")}</span><textarea rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder={t("Что нам нужно знать о вашем заказе?")}/></label>
      {invalid && <p className="form-failure" role="alert">{t("Количество превышает остаток. Измените состав корзины.")}</p>}
      {options&&!options.card?<AlternativePayments options={options} amount={total} busy={busy} onSbp={()=>void submitSbp()} onCrypto={()=>setPaymentMethod('usdt')}/>:currencies.length === 1 ? <><div className="payment-method"><span className="payment-icon"><CreditCard size={22}/></span><div><b>{t("Перевод на карту")}</b><p>{t("Реквизиты под вашу сумму · квитанция после перевода")}</p></div><CheckCircle2 size={18}/></div><button className="primary-button" disabled={invalid||busy} onClick={() => void begin()}>{t("Оплатить")} {money(total, currencies[0])}<ArrowRight size={18}/></button><p className="fine-print">{t("Если подходящей карты сейчас нет, менеджер поможет с оплатой.")}</p></> : <SellerMessage username={shop.supportTelegram} text={t('Здравствуйте! Помогите оформить заказ в разных валютах:\n') + lines.map(l => `${l.product.title} × ${l.quantity}`).join('\n')} />}
      <button hidden={!!options&&!options.card} type="button" className="payment-text-button" onClick={()=>setPaymentMethod('usdt')}>{t('Оплатить USDT')}</button>
      {error && <p className="form-failure" role="alert">{t(error)}</p>}
    </div>}
    {warning && <PaymentWarning busy={busy} accepted={accepted} error={error} onAccepted={setAccepted} onConfirm={submit} onClose={() => setWarning(false)}/>}
  </>;
}

function CryptoPaymentDetails({payment:p,online,onUpdate,navigate,shop}:{payment:Payment;online:boolean;onUpdate(p:Payment):void;navigate(path:string):void;shop:ShopSettings}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[txid,setTxid]=useState(''),[copied,setCopied]=useState(false),[cardWarning,setCardWarning]=useState(false),[accepted,setAccepted]=useState(false),[networks,setNetworks]=useState(false),[notPaid,setNotPaid]=useState(false);
  const quote=p.crypto!,paid=p.status==='paid',review=p.status==='receipt_review'||!!quote.reportedAt;
  async function copyAddress(){setError('');try{const fresh=await api<Payment>('/payments/'+p.id);if(!online||fresh.status!=='awaiting_transfer'||!fresh.crypto?.address||fresh.crypto.address!==quote.address)throw Error('Адрес изменился. Обновите способ оплаты.');await navigator.clipboard.writeText(fresh.crypto.address);setCopied(true);}catch(e){setError((e as Error).message);}}
  async function report(){if(busy)return;setBusy(true);setError('');try{onUpdate(await mutation<Payment>('/payments/'+p.id+'/reported','POST',{txid}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function change(method:'card'|'usdt',network?:UsdtNetwork){setBusy(true);setError('');try{const next=await mutation<Payment>('/payments/'+p.id+'/retry','POST',{method,network,notPaid:true,accepted:method==='card'?accepted:undefined,expectedRate:exchangeRate()});setPaymentMethod(method);navigate('/payment/'+next.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <><div className="page-title"><button className="back-link" onClick={()=>navigate('/orders')}><ArrowLeft size={17}/>{t('Мои заказы')}</button><h1>{t(paid?t('Оплата подтверждена'):t('Оплата USDT'))}</h1><p className="payment-order-id">{p.id}</p></div>
    <section className="payment-amount-card"><div className="payment-eyebrow">{t('СУММА ПЕРЕВОДА')}</div><strong dir="ltr">{p.amount.toFixed(2)} USDT</strong><p>{usdtNetworks[quote.network]}</p><small>{t('Курс')}: 1 USD = {quote.rate} RUB</small></section>
    {paid||review?<section className="payment-state" role="status"><span className="payment-icon large">{paid?<CheckCircle2 size={28}/>:<ShieldCheck size={28}/>}</span><h2>{t(paid?t('Оплата подтверждена'):t('Проверяем перевод'))}</h2><p>{t(paid?t('Поступление денег подтверждено. Менеджер свяжется с вами для передачи покупки.'):t('Сообщение об оплате сохранено. Менеджер проверит перевод. Повторно отправлять USDT не нужно.'))}</p>{p.deliveryPending&&<p>{t('Доставляем сообщение менеджеру.')}</p>}{paid&&p.purpose==='topup'&&<button className="primary-button" onClick={()=>navigate('/profile')}>{t('Посмотреть баланс')}</button>}</section>:<>
      <section className="usdt-detail">
        <small>{t('Адрес для перевода')} · {usdtNetworks[quote.network]}</small>
        {p.status==='awaiting_transfer'&&quote.address&&online?<button className="usdt-address" onClick={()=>void copyAddress()} aria-label={t('Скопировать адрес')}><span dir="ltr">{quote.address}</span>{copied?<Check size={20}/>:<Copy size={20}/>}</button>:<p role="status">{t(p.reason==='wallet_changed'?t('Адрес изменился. Выберите сеть заново.'):p.status==='superseded'?t('Выданы новые реквизиты. Откройте актуальную оплату в заказах.'):t('Проверяем адрес. Дождитесь обновления перед переводом.'))}</p>}
        <p>{t('Переведите точную сумму USDT в выбранной сети. После перевода нажмите «Я оплатил».')}</p>
        {p.status!=='superseded'&&<><label className="standalone-field">{t('Хеш транзакции (необязательно)')}<input value={txid} maxLength={66} onChange={e=>setTxid(e.target.value)} placeholder="TXID"/></label><button className="primary-button" disabled={busy} onClick={()=>void report()}>{busy?<LoaderCircle size={18} className="spin"/>:<CheckCircle2 size={18}/>} {t('Я оплатил')}</button></>}
      </section>
      {p.status!=='superseded'&&<><button hidden={!russianPayments()} className="secondary-button usdt-alternative" disabled={busy} onClick={()=>{setAccepted(false);setCardWarning(true);}}><CreditCard size={18}/>{t('Оплатить картой в рублях')}</button>
      <button className="payment-text-button" onClick={()=>setNetworks(!networks)}>{t('Выбрать другую сеть')}</button>
      {networks&&<><label className="confirm-check"><input type="checkbox" checked={notPaid} onChange={e=>setNotPaid(e.target.checked)}/><span>{t('Я ещё не отправлял USDT по этому заказу')}</span></label><UsdtNetworkPicker amount={p.amount} busy={busy} disabled={!notPaid} onSelect={network=>void change('usdt',network)}/></>}</>}
    </>}
    {error&&<p className="form-failure" role="alert">{t(error)}</p>}
    <div className="payment-support"><a className="secondary-button" href={sellerChatLink(shop.supportTelegram || 'tcmai', `Здравствуйте! Нужна помощь с оплатой USDT заказа ${p.id}. Сеть: ${usdtNetworks[quote.network]}. Сумма: ${p.amount.toFixed(2)} USDT.`) || 'https://t.me/tcmai'} target="_blank" rel="noreferrer"><MessageCircle size={17}/>{t('Связаться с менеджером')}</a></div>
    {cardWarning&&<PaymentWarning busy={busy} accepted={accepted} error={error} onAccepted={setAccepted} onConfirm={()=>change('card')} onClose={()=>setCardWarning(false)} detail={`${t('К оплате')}: ${money(rubTotalMinor(p.items,quote.rate)/100,'RUB')}`} acceptLabel={t("Я ещё не отправлял USDT и хочу оплатить картой")}/>}
  </>;
}

export function PaymentPage({ id, shop, navigate }: { id: string; shop: ShopSettings; navigate(path: string): void }) {
  const [cryptoChoice,setCryptoChoice]=useState(false);
  const [payment, setPayment] = useState<Payment | null>(null), [online, setOnline] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [retryWarning, setRetryWarning] = useState(false), [notPaid, setNotPaid] = useState(false);
  const [time, setTime] = useState(Date.now());
  const receivedAt = useRef(0), offset = useRef(0), input = useRef<HTMLInputElement>(null), streamVersion = useRef(0);
  const mounted = useRef(true), latest = useRef<Payment | null>(null);
  useEffect(() => {
    let disposed = false; mounted.current = true; setPayment(null); latest.current = null; setOnline(false); receivedAt.current = 0;setCryptoChoice(false);setRetryWarning(false);
    const accept = (p: Payment) => { if (disposed) return; const previous = latest.current; if (previous && (p.serverNow < previous.serverNow || p.receiptCount < previous.receiptCount || (previous.status !== 'awaiting_transfer' && p.status === 'awaiting_transfer') || (previous.status === 'paid' && p.status !== 'paid'))) return; receivedAt.current = Date.now(); offset.current = p.serverNow - Date.now(); latest.current = p; setPayment(p); setOnline(true); setError(''); streamVersion.current++; };
    const stream = new EventSource(`${import.meta.env.BASE_URL}api/payments/${id}/events`);
    stream.onmessage = e => { try { accept(JSON.parse(e.data)); } catch { setOnline(false); } };
    stream.onerror = () => { setOnline(false); };
    const version = streamVersion.current;
    api<Payment>('/payments/' + id).then(p => { if (streamVersion.current === version) accept(p); }).catch(e => { if (!disposed) setError(e.message); });
    const timer = setInterval(() => { setTime(Date.now()); if (Date.now() - receivedAt.current > 2500 || document.visibilityState === 'hidden') setOnline(false); }, 250);
    const visibility = () => { setOnline(false); receivedAt.current = 0; };
    document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; mounted.current = false; clearInterval(timer); stream.close(); document.removeEventListener('visibilitychange', visibility); };
  }, [id]);
  const remaining = payment?.expiresAt ? Math.max(0, Math.ceil((payment.expiresAt - time - offset.current) / 1000)) : 0;
  const active = payment?.status === 'awaiting_transfer' && online && remaining > 0 && !!payment.card;
  async function copy() {
    setError('');
    try {
      const fresh = await api<Payment>('/payments/' + id);
      // A stop received while checking always wins over an older HTTP response.
      if (!mounted.current || !online || document.visibilityState === 'hidden' || Date.now() - receivedAt.current > 2500 || fresh.card?.number !== latest.current?.card?.number || fresh.status !== 'awaiting_transfer' || !fresh.card || fresh.expiresAt! <= fresh.serverNow || latest.current?.status !== 'awaiting_transfer') throw new Error('Проверяем доступность карты. Дождитесь обновления перед переводом.');
      await navigator.clipboard.writeText(fresh.card.number); setCopied(true); setTimeout(() => { if (mounted.current) setCopied(false); }, 2000);
    } catch (e) { setError((e as Error).message); }
  }
  async function upload(file?: File) {
    if (!file || busy) return;
    if (file.size > 12 * 1024 * 1024) { setError('Выберите квитанцию до 12 МБ'); return; }
    setBusy(true); setError('');
    try { const p = await api<Payment>(`/payments/${id}/receipt`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } }); latest.current = p; setPayment(p); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  async function retry() {
    setBusy(true); setError('');
    try { const p = await mutation<Payment>(`/payments/${id}/retry`, 'POST', { notPaid, accepted: true }); setRetryWarning(false); setNotPaid(false); navigate('/payment/' + p.id); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function switchToUsdt(network:UsdtNetwork){if(!notPaid)return;setBusy(true);setError('');try{const p=await mutation<Payment>(`/payments/${id}/retry`,'POST',{method:'usdt',network,notPaid:true,expectedRate:exchangeRate()});setPaymentMethod('usdt');navigate('/payment/'+p.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  if(payment?.provider==='sbp')return <SbpPayment payment={payment} shop={shop} navigate={navigate} onUpdate={p=>{if(latest.current?.status==='paid'&&p.status!=='paid')return;latest.current=p;setPayment(p);}}/>;
  if(payment?.provider==='usdt')return <CryptoPaymentDetails shop={shop} key={payment.id} payment={payment} online={online} navigate={navigate} onUpdate={p=>{if(latest.current?.status==='paid'&&p.status!=='paid')return;latest.current=p;setPayment(p);}}/>;
  if (!payment) return <><div className="page-title"><button className="back-link" onClick={() => navigate('/orders')}><ArrowLeft size={17}/>{t("К заказам")}</button><h1>{t("Оплата заказа")}</h1></div><div className="context-notice">{error ? <p role="alert">{t(error)}</p> : <><LoaderCircle className="spin" size={20}/><p>{t("Проверяем ваш заказ…")}</p></>}</div></>;
  const expired = payment.status === 'awaiting_receipt' || (payment.status === 'awaiting_transfer' && remaining <= 0);
  const invalidated = payment.status === 'invalidated';
  const receipt = <section className="payment-receipt"><div className="payment-receipt-heading"><FileUp size={21}/><h2>{payment.receiptCount ? t('Квитанция прикреплена') : t('После оплаты')}</h2></div><p>{t("Прикрепите развёрнутый скриншот перевода или квитанцию. На ней должны быть видны сумма, дата и получатель.")}</p><input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden aria-label={t("Квитанция об оплате")} onChange={e => void upload(e.target.files?.[0])}/><button className="primary-button" disabled={busy} onClick={() => input.current?.click()}>{busy ? <><LoaderCircle size={18} className="spin"/>{t("Сохраняем квитанцию…")}</> : <><FileUp size={18}/>{payment.receiptCount ? t('Прикрепить ещё квитанцию') : t('Прикрепить квитанцию')}</>}</button><a className="payment-text-button" href={sellerChatLink(shop.supportTelegram || 'tcmai', `Здравствуйте! Прикреплю квитанцию к заказу ${payment.id}. Сумма: ${money(payment.amount, payment.currency)}.`) || 'https://t.me/tcmai'} target="_blank" rel="noreferrer"><MessageCircle size={16}/>{t("Отправить менеджеру в Telegram")}</a><small>{t("PDF, JPG, PNG или WebP · до 12 МБ")}</small>{payment.deliveryPending && <p className="fine-print">{t("Квитанция сохранена. Доставляем её менеджеру.")}</p>}</section>;
  return <><div className="page-title"><button className="back-link" onClick={() => navigate('/orders')}><ArrowLeft size={17}/>{t("Мои заказы")}</button><h1>{payment.status === 'paid' ? (payment.purpose === 'topup' ? t('Баланс пополнен') : t('Спасибо за оплату')) : payment.purpose === 'topup' ? t('Пополнение баланса') : t('Оплата на карту')}</h1><p className="payment-order-id">{payment.id}</p></div>
    <section className="payment-amount-card"><div className="payment-eyebrow">{payment.purpose === 'topup' ? t('СУММА ПОПОЛНЕНИЯ') : t('СУММА ПЕРЕВОДА')}</div><strong>{money(payment.amount, payment.currency)}</strong><p>{payment.items.map(i => `${i.title}${i.quantity > 1 ? ' × ' + i.quantity : ''}`).join(' · ')}</p></section>
    {active ? <div className="payment-requisites">
      <section className="payment-number-card">
        <span className="payment-number-label">{t("Номер карты для перевода")}</span>
        <button className="payment-card-number" onClick={() => void copy()} aria-label={t("Скопировать номер карты")}><span>{payment.card!.number.replace(/(.{4})/g, '$1 ').trim()}</span><span className="payment-copy-icon">{copied ? <Check size={21}/> : <Copy size={21}/>}</span></button>
        {copied && <small className="payment-copy-feedback" role="status">{t("Номер карты скопирован")}</small>}
      </section>
      <section className="payment-bank-card payment-details-card">
        <dl className="payment-bank-details"><div><dt>{t("Банк")}</dt><dd>{payment.card!.bank}</dd></div><div><dt>{t("Получатель")}</dt><dd>{payment.card!.holder}</dd></div></dl>
        <div className={`payment-timer ${remaining < 120 ? 'urgent' : ''}`}><Clock3 size={17}/><span>{t("Время на перевод")}</span><strong role="timer">{Math.floor(remaining / 60).toString().padStart(2, '0')}:{(remaining % 60).toString().padStart(2, '0')}</strong></div><div className="payment-progress"><i style={{width: `${remaining / 900 * 100}%`}}/></div>
        <div className="payment-transfer-note"><Info size={16}/><p>{t("Переведите точную сумму одним платежом. Если реквизиты станут недоступны, не переводите по прежнему номеру.")}</p></div>
        {receipt}
      </section>
    </div> : <section className={`payment-state ${invalidated ? 'attention' : ''}`} role="status"><span className="payment-icon large">{payment.status === 'paid' ? <CheckCircle2 size={28}/> : payment.status === 'receipt_review' ? <ShieldCheck size={28}/> : <Clock3 size={28}/>}</span><h2>{!online && payment.status === 'awaiting_transfer' && !expired ? t('Проверяем реквизиты') : expired ? t('Ожидаем квитанцию') : payment.status === 'paid' && payment.purpose === 'topup' ? t('Средства зачислены') : t(paymentTitles[payment.status])}</h2><p>{invalidated ? t('Пожалуйста, не переводите по прежнему номеру. Если вы уже оплатили, прикрепите квитанцию — поможем проверить перевод.') : expired ? t('Время на перевод истекло. Если оплатили — пришлите квитанцию. Если ещё нет — получите новые реквизиты перед переводом.') : payment.status === 'manual_review' ? (payment.reason === 'limits' || payment.reason === 'currency' ? t('Для вашей суммы менеджер подберёт подходящий способ оплаты. Не разбивайте платёж на несколько переводов.') : t('Реквизиты пока недоступны. Можно проверить их ещё раз или связаться с менеджером. Если вы уже оплатили по выданным менеджером реквизитам, прикрепите квитанцию здесь.')) : payment.status === 'receipt_review' ? t('Квитанция сохранена. Проверим поступление денег и сообщим результат. Повторно переводить деньги не нужно.') : payment.status === 'paid' ? (payment.purpose === 'topup' ? t(`Зачислили ${money(payment.amount)} на ваш баланс магазина. Его можно посмотреть в профиле.`) : t('Поступление денег подтверждено. Менеджер свяжется с вами для передачи покупки.')) : payment.status === 'superseded' ? t('Актуальная оплата находится в списке ваших заказов. По прежним реквизитам переводить не нужно.') : t('Уточняем, можно ли сейчас перевести деньги. Дождитесь появления реквизитов или обратитесь к менеджеру.')}</p></section>}
    {!active && payment.status !== 'paid' && receipt}
    {russianPayments()&&(invalidated || expired || payment.status === 'manual_review') && !payment.receiptCount && <section className="payment-retry">{!retryWarning ? <button className="secondary-button" onClick={() => setRetryWarning(true)}><RefreshCw size={17}/>{payment.status === 'manual_review' ? t('Проверить реквизиты') : t('Не успел оплатить')}</button> : <><h3>{t("Получить новые реквизиты?")}</h3><p>{t("На новый перевод будет 15 минут. Если деньги уже отправлены или перевод обрабатывается банком, прикрепите квитанцию.")}</p><label className="confirm-check"><input type="checkbox" checked={notPaid} onChange={e => setNotPaid(e.target.checked)}/><span>{t("Я ещё не переводил деньги по этому заказу")}</span></label><button className="primary-button" disabled={!notPaid || busy} onClick={() => void retry()}>{t("Получить новые реквизиты")}</button></>}</section>}
    {russianPayments()&&!payment.receiptCount&&['manual_review','invalidated','awaiting_receipt'].includes(payment.status)&&<CardSbpFallback payment={payment} navigate={navigate}/>}
    {!payment.receiptCount&&!['paid','receipt_review','superseded'].includes(payment.status)&&<><button className="payment-text-button" onClick={()=>{setCryptoChoice(!cryptoChoice);setNotPaid(false);}}>{t('Оплатить USDT')}</button>{cryptoChoice&&<><label className="confirm-check"><input type="checkbox" checked={notPaid} onChange={e=>setNotPaid(e.target.checked)}/><span>{t('Я ещё не переводил деньги по этому заказу')}</span></label><UsdtNetworkPicker amount={usdTotalMinor(payment.items,exchangeRate())/100} busy={busy} disabled={!notPaid} onSelect={network=>void switchToUsdt(network)}/></>}</>}
    {error && <p className="form-failure" role="alert">{t(error)}</p>}
    {payment.purpose === 'topup' && payment.status === 'paid' && <button className="primary-button" style={{marginTop:18}} onClick={() => navigate('/profile')}>{t("Посмотреть баланс")}<ArrowRight size={18}/></button>}
    <div className="payment-support"><a className="secondary-button" href={sellerChatLink(shop.supportTelegram || 'tcmai', `Здравствуйте! Нужна помощь с оплатой заказа ${payment.id}. Сумма: ${money(payment.amount, payment.currency)}.`) || 'https://t.me/tcmai'} target="_blank" rel="noreferrer"><MessageCircle size={17}/>{t("Связаться с менеджером")}</a></div>
  </>;
}
export function PaymentHistory({navigate}: {navigate(path: string): void}) {
  const [payments, setPayments] = useState<Payment[]>([]), [error, setError] = useState('');
  useEffect(() => { let alive = true; const refresh = () => api<Payment[]>('/payments').then(p => { if (alive) { setPayments(p); setError(''); } }).catch(e => { if (alive) setError(e.message); }); void refresh(); const timer = setInterval(refresh, 10000); return () => { alive = false; clearInterval(timer); }; }, []);
  return <><div className="page-title"><h1>{t("Мои заказы")}</h1><p>{t("Статус оплаты и квитанции — всегда под рукой")}</p></div>{!payments.length && !error && <div className="context-notice"><p>{t("Здесь пока нет заказов. Выберите товар в каталоге — мы поможем с оплатой.")}</p></div>}{error && <p className="form-failure" role="alert">{t("Не удалось обновить оплаты:")}{error}</p>}{payments.length > 0 && <section className="payment-history" aria-label={t("Оплаты заказов")}><h2>{t("Ваши оплаты")}</h2>{payments.map(p => <button className="payment-history-row" key={p.id} onClick={() => navigate('/payment/' + p.id)}><span className="payment-icon"><CreditCard size={20}/></span><span><b>{t(p.items[0]?.title)}</b><small>{p.purpose === 'topup' && p.status === 'paid' ? t('Баланс пополнен') : t(paymentTitles[p.status])}</small><small>{p.id}</small></span><strong>{p.provider==='usdt'?`${p.amount.toFixed(2)} USDT`:money(p.amount,p.currency)}<ArrowRight size={15}/></strong></button>)}</section>}</>;
}

function CardSbpFallback({payment,navigate}:{payment:Payment;navigate(path:string):void}){
 const [options,setOptions]=useState<PaymentOptions|null>(null),[notPaid,setNotPaid]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;void api<PaymentOptions>('/payment-options?amount='+payment.amount).then(v=>{if(alive)setOptions(v);}).catch(()=>{});return()=>{alive=false;};},[payment.id,payment.amount]);
 if(!options?.sbp.available||options.card)return null;
 return <section className="content-card"><h3>Оплата по СБП</h3><p>Можно получить ссылку для оплаты через приложение банка.</p><label className="confirm-check"><input type="checkbox" checked={notPaid} onChange={e=>setNotPaid(e.target.checked)}/><span>Я ещё не переводил деньги по этому заказу</span></label><button className="primary-button" disabled={!notPaid||busy} onClick={async()=>{setBusy(true);setError('');try{const p=await mutation<Payment>('/payments/'+payment.id+'/retry','POST',{method:'sbp',notPaid:true,expectedRate:exchangeRate()});navigate('/payment/'+p.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Перейти к оплате по СБП</button>{error&&<p className="form-failure">{error}</p>}</section>;
}
