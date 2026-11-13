import { useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Plus, RefreshCw, WalletCards } from 'lucide-react';
import { money, type ShopSettings } from './domain';
import { api, mutation } from './api';
import { PaymentWarning } from './PaymentFlow';
import type { Payment } from './payments';
import { parseTopupAmount, type WalletState } from './wallet-domain';
import { readLocal, writeLocal } from './store';
import { telegram } from './telegram';
import {t,getLocale} from './i18n';
import {paymentMethod,setPaymentMethod,exchangeRate} from './pricing';
import {UsdtNetworkPicker} from './UsdtCheckout';
import type {UsdtNetwork} from './usdt';
import './wallet.css';

export function Wallet({navigate}: {shop: ShopSettings; navigate(path:string):void}) {
  const method=paymentMethod(),cryptoMode=method==='usdt';
  const draftKey = 'wallet-topup:' + (telegram?.initDataUnsafe?.user?.id ?? 'guest')+':'+method;
  const [draft] = useState(() => readLocal<{amount?:unknown;requestKey?:unknown}>(draftKey,{}));
  const [open,setOpen] = useState(false), [amount,setAmount] = useState(() => typeof draft?.amount === 'string' ? draft.amount.slice(0,32) : '');
  const [requestKey,setRequestKey] = useState(() => typeof draft?.requestKey === 'string' && /^[a-f0-9-]{36}$/i.test(draft.requestKey) ? draft.requestKey : crypto.randomUUID());
  const [wallet,setWallet] = useState<WalletState|null>(null), [loadError,setLoadError] = useState(''), [error,setError] = useState('');
  const [warning,setWarning] = useState(false), [accepted,setAccepted] = useState(false), [busy,setBusy] = useState(false), [refreshKey,setRefreshKey] = useState(0);
  const [networks,setNetworks]=useState(false);
  const previousMethod=useRef(method);
  useEffect(()=>{if(previousMethod.current===method)return;previousMethod.current=method;setAmount('');setRequestKey(crypto.randomUUID());setNetworks(false);setWarning(false);setError('');},[method]);
  useEffect(() => {try {writeLocal(draftKey,{amount,requestKey});}catch{}},[draftKey,amount,requestKey]);
  useEffect(() => {
    let alive=true;
    const refresh=()=>{if(document.visibilityState==='hidden')return;void api<WalletState>('/wallet').then(data=>{if(alive){setWallet(data);setLoadError('');}}).catch(e=>{if(alive)setLoadError(e.message);});};
    refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[refreshKey]);
  const amountMinor = (()=>{try{return parseTopupAmount(amount);}catch{return null;}})();
  async function submit(network?:UsdtNetwork) {
    if((!cryptoMode&&!accepted)||busy)return;setBusy(true);setError('');
    try {
      parseTopupAmount(amount);
      const p=await mutation<Payment>('/wallet/topups','POST',{amount,requestKey,accepted:!cryptoMode,method,network,currency:cryptoMode?'USD':'RUB',expectedRate:exchangeRate()});
      try{writeLocal(draftKey,{});}catch{}
      navigate('/payment/'+p.id);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="wallet-card" aria-labelledby="wallet-heading">
    <div className="wallet-heading"><span><WalletCards size={19}/><h2 id="wallet-heading">{t('Баланс магазина')}</h2></span><span className="wallet-currency">{cryptoMode?'USD · $':'RUB · ₽'}</span></div>
    <div className="wallet-amount" aria-live="polite"><strong>{wallet ? money(wallet.balance) : loadError ? '—' : t('Загружаем…')}</strong></div>
    <p>{t('Пополнение зачисляется после проверки перевода менеджером.')}</p>
    {cryptoMode&&<p className="fine-print">{t('Баланс хранится в рублях. Эквивалент в долларах рассчитан по текущему курсу.')} 1 USD = {exchangeRate()} RUB</p>}
    {loadError && <p className="field-error" role="alert">{t("Не удалось обновить баланс.")}<button className="inline-link" onClick={()=>setRefreshKey(v=>v+1)}><RefreshCw size={13}/>{t("Повторить")}</button></p>}
    <button className="secondary-button" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setError('');}}><Plus size={17}/>{t(open?'Закрыть':'Пополнить баланс')}</button>
    {open && <form className="edit-form wallet-topup" noValidate onSubmit={e=>{e.preventDefault();setError('');try{parseTopupAmount(amount);setAccepted(false);if(cryptoMode)setNetworks(true);else setWarning(true);}catch(err){setError((err as Error).message);}}}>
      <label>{t(cryptoMode?'Сумма пополнения, USD':'Сумма пополнения, ₽')}<input required inputMode="decimal" value={amount} maxLength={32} placeholder={cryptoMode?'10.00':t('Например, 1500')} aria-invalid={!!error} aria-describedby={error?'wallet-amount-error':undefined} onChange={e=>{setAmount(e.target.value);setRequestKey(crypto.randomUUID());setNetworks(false);setError('');}}/></label>
      <p className="form-help">{t(cryptoMode?t('Введите сумму в долларах. Для перевода выберите сеть USDT.'):t('Введите сумму в рублях. Подберём карту с подходящими лимитами; если её нет, менеджер поможет с оплатой.'))}</p>
      {error && <p className="field-error" id="wallet-amount-error" role="alert">{t(error)}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy?<LoaderCircle size={17} className="spin"/>:<>{t('Перейти к пополнению')}<ArrowRight size={17}/></>}</button>
      {cryptoMode&&networks&&amountMinor!==null&&<UsdtNetworkPicker amount={amountMinor/100} busy={busy} onSelect={network=>void submit(network)}/>}
      <button type="button" className="payment-text-button" onClick={()=>setPaymentMethod(cryptoMode?'card':'usdt')}>{t(cryptoMode?'Оплатить картой в рублях':'Оплатить USDT')}</button>
    </form>}
    {wallet?.entries.length ? <div className="wallet-history"><h3>{t('Последние пополнения')}</h3>{wallet.entries.slice(0,3).map(e=><button key={e.paymentId} onClick={()=>navigate('/payment/'+e.paymentId)}><span>{new Date(e.createdAt).toLocaleDateString(getLocale(),{day:'numeric',month:'long'})}<small>{t('Зачислено')}</small></span><strong>+{money(e.amount)}</strong></button>)}</div>:null}
    {warning && amountMinor !== null && <PaymentWarning busy={busy} accepted={accepted} error={error} onAccepted={setAccepted} onConfirm={()=>submit()} onClose={()=>{if(!busy)setWarning(false);}} detail={`Пополнение баланса · ${money(amountMinor/100)}`} backLabel={t("Вернуться к сумме")}/>}
  </section>;
}
