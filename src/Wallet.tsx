import { useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle, Plus, RefreshCw, WalletCards } from 'lucide-react';
import { money, type ShopSettings } from './domain';
import { api, mutation } from './api';
import { PaymentWarning } from './PaymentFlow';
import type { Payment } from './payments';
import { parseTopupAmount, type WalletState } from './wallet-domain';
import { readLocal, writeLocal } from './store';
import { telegram } from './telegram';
import './wallet.css';

export function Wallet({navigate}: {shop: ShopSettings; navigate(path:string):void}) {
  const draftKey = 'wallet-topup:' + (telegram?.initDataUnsafe?.user?.id ?? 'guest');
  const [draft] = useState(() => readLocal<{amount?:unknown;requestKey?:unknown}>(draftKey,{}));
  const [open,setOpen] = useState(false), [amount,setAmount] = useState(() => typeof draft?.amount === 'string' ? draft.amount.slice(0,32) : '');
  const [requestKey,setRequestKey] = useState(() => typeof draft?.requestKey === 'string' && /^[a-f0-9-]{36}$/i.test(draft.requestKey) ? draft.requestKey : crypto.randomUUID());
  const [wallet,setWallet] = useState<WalletState|null>(null), [loadError,setLoadError] = useState(''), [error,setError] = useState('');
  const [warning,setWarning] = useState(false), [accepted,setAccepted] = useState(false), [busy,setBusy] = useState(false), [refreshKey,setRefreshKey] = useState(0);
  useEffect(() => {try {writeLocal(draftKey,{amount,requestKey});}catch{}},[draftKey,amount,requestKey]);
  useEffect(() => {
    let alive=true;
    const refresh=()=>{if(document.visibilityState==='hidden')return;void api<WalletState>('/wallet').then(data=>{if(alive){setWallet(data);setLoadError('');}}).catch(e=>{if(alive)setLoadError(e.message);});};
    refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[refreshKey]);
  const amountMinor = (()=>{try{return parseTopupAmount(amount);}catch{return null;}})();
  async function submit() {
    if(!accepted||busy)return;setBusy(true);setError('');
    try {
      parseTopupAmount(amount);
      const p=await mutation<Payment>('/wallet/topups','POST',{amount,requestKey,accepted:true});
      try{writeLocal(draftKey,{});}catch{}
      navigate('/payment/'+p.id);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="wallet-card" aria-labelledby="wallet-heading">
    <div className="wallet-heading"><span><WalletCards size={19}/><h2 id="wallet-heading">Баланс магазина</h2></span><span className="wallet-currency">RUB · ₽</span></div>
    <div className="wallet-amount" aria-live="polite"><strong>{wallet ? money(wallet.balance) : loadError ? '—' : 'Загружаем…'}</strong></div>
    <p>Пополнение зачисляется после проверки перевода менеджером.</p>
    {loadError && <p className="field-error" role="alert">Не удалось обновить баланс. <button className="inline-link" onClick={()=>setRefreshKey(v=>v+1)}><RefreshCw size={13}/>Повторить</button></p>}
    <button className="secondary-button" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setError('');}}><Plus size={17}/>{open?'Закрыть':'Пополнить баланс'}</button>
    {open && <form className="edit-form wallet-topup" noValidate onSubmit={e=>{e.preventDefault();setError('');try{parseTopupAmount(amount);setAccepted(false);setWarning(true);}catch(err){setError((err as Error).message);}}}>
      <label>Сумма пополнения, ₽<input required inputMode="decimal" value={amount} maxLength={32} placeholder="Например, 1500" aria-invalid={!!error} aria-describedby={error?'wallet-amount-error':undefined} onChange={e=>{setAmount(e.target.value);setRequestKey(crypto.randomUUID());setError('');}}/></label>
      <p className="form-help">Введите сумму в рублях. Подберём карту с подходящими лимитами; если её нет, менеджер поможет с оплатой.</p>
      {error && <p className="field-error" id="wallet-amount-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy?<LoaderCircle size={17} className="spin"/>:<>Перейти к пополнению<ArrowRight size={17}/></>}</button>
    </form>}
    {wallet?.entries.length ? <div className="wallet-history"><h3>Последние пополнения</h3>{wallet.entries.slice(0,3).map(e=><button key={e.paymentId} onClick={()=>navigate('/payment/'+e.paymentId)}><span>{new Date(e.createdAt).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}<small>Зачислено</small></span><strong>+{money(e.amount)}</strong></button>)}</div>:null}
    {warning && amountMinor !== null && <PaymentWarning busy={busy} accepted={accepted} error={error} onAccepted={setAccepted} onConfirm={submit} onClose={()=>{if(!busy)setWarning(false);}} detail={`Пополнение баланса · ${money(amountMinor/100)}`} backLabel="Вернуться к сумме"/>}
  </section>;
}
