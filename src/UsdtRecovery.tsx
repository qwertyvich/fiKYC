import {useState} from 'react';
import {ArrowRight,LoaderCircle} from 'lucide-react';
import {mutation} from './api';
import {t} from './i18n';
import {exchangeRate} from './pricing';
import {usdTotalMinor,usdtNetworks,type UsdtNetwork} from './usdt';
import type {Payment} from './payments';

export function needsUsdtRecovery(payment:Payment,network:UsdtNetwork) {
  if(payment.status==='paid'||payment.status==='receipt_review'||payment.receiptCount||payment.crypto?.reportedAt)return false;
  return payment.provider!=='usdt'||payment.status!=='awaiting_transfer'||!payment.crypto?.address||payment.crypto.network!==network;
}

export function UsdtRecovery({payment,network,navigate,onBack,onResolved}:{payment:Payment;network:UsdtNetwork;navigate(path:string):void;onBack():void;onResolved?():void}) {
  const [current,setCurrent]=useState(payment);
  const [accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const rate=current.crypto?.rate??exchangeRate();
  const amount=current.provider==='usdt'?current.amount:usdTotalMinor(current.items,rate)/100;
  async function renew(){
    if(!accepted||busy)return;setBusy(true);setError('');
    try{const next=await mutation<Payment>('/payments/'+current.id+'/retry','POST',{method:'usdt',network,notPaid:true,expectedRate:exchangeRate()});if(needsUsdtRecovery(next,network)){setCurrent(next);setAccepted(false);return;}onResolved?.();navigate('/payment/'+next.id);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="content-card usdt-recovery" aria-labelledby="usdt-recovery-title">
    <h2 id="usdt-recovery-title">{t('Получить новые реквизиты')}</h2>
    <p>{t(current.reason==='wallet_changed'?'Адрес изменился. Выберите сеть заново.':'Проверьте заказ и выберите сеть перевода')}</p>
    <p><strong dir="ltr">{amount.toFixed(2)} USDT · {usdtNetworks[network]}</strong></p>
    <label className="confirm-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>{t('Я ещё не переводил деньги по этому заказу')}</span></label>
    <button type="button" className="primary-button" disabled={!accepted||busy} onClick={()=>void renew()}>{busy?<LoaderCircle size={18} className="spin"/>:<>{t('Получить новые реквизиты')}<ArrowRight size={18}/></>}</button>
    <button type="button" className="payment-text-button" disabled={busy} onClick={()=>navigate('/payment/'+current.id)}>{t('Вернуться к заказу')}</button>
    <button type="button" className="payment-text-button" disabled={busy} onClick={onBack}>{t('Выбрать другую сеть')}</button>
    {error&&<p className="form-failure" role="alert">{t(error)}</p>}
  </section>;
}
