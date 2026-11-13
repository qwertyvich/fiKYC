import {ArrowRight,CreditCard,LoaderCircle,ShieldCheck,WalletCards} from 'lucide-react';
import {t} from './i18n';
import {rawMoney,lineMoney,type Product} from './domain';
import {exchangeRate,paymentNetworks,russianPayments} from './pricing';
import {usdTotalMinor,usdtNetworks,type UsdtNetwork} from './usdt';
import './usdt.css';
export function UsdtNetworkPicker({amount,busy,onSelect,disabled=false}:{amount:number;busy:boolean;onSelect(network:UsdtNetwork):void;disabled?:boolean}) {
  const enabled=paymentNetworks();
  return <section className="usdt-networks"><h2>{t('Выберите сеть перевода')}</h2><p>{t('Отправляйте USDT только в выбранной сети.')}</p>
    {(Object.keys(usdtNetworks) as UsdtNetwork[]).map(network=><button type="button" key={network} className="usdt-network" disabled={disabled||busy||!enabled[network]} onClick={()=>onSelect(network)}><span className="usdt-token">₮</span><span><b>{usdtNetworks[network]}</b><small>{enabled[network]?`${amount.toFixed(2)} USDT`:t('Скоро будет доступно')}</small></span>{busy?<LoaderCircle className="spin" size={18}/>:<ArrowRight size={18}/>}</button>)}
    {!enabled.trc20&&!enabled.bep20&&<p className="fine-print">{t('Оплата USDT пока не настроена. Можно оплатить картой или обратиться к менеджеру.')}</p>}
  </section>;
}
export function UsdtCheckout({lines,note,setNote,busy,error,onSelect,onCard}:{lines:{product:Product;quantity:number}[];note:string;setNote(value:string):void;busy:boolean;error:string;onSelect(network:UsdtNetwork):void;onCard():void}) {
  const total=usdTotalMinor(lines.map(l=>({...l.product,quantity:l.quantity})),exchangeRate())/100;
  const invalid=!lines.length||lines.some(l=>l.quantity>l.product.stock||l.product.stock<1);
  return <div className="checkout-form usdt-checkout">
    <section className="content-card payment-summary"><div className="payment-eyebrow"><ShieldCheck size={16}/>{t('ВАШ ЗАКАЗ')}</div>
      {lines.map(({product:p,quantity})=><div className="payment-line" key={p.id}><div><b>{t(p.title)}</b><small>{quantity} {t('шт.')}</small></div><strong>{lineMoney(p.price,quantity,p.currency)}</strong></div>)}
      <div className="payment-line payment-total"><span>{t('К оплате')}</span><strong>{rawMoney(total,'USD')}</strong></div>
      <p className="fine-print">{t('Курс')}: 1 USD = {exchangeRate()} RUB</p>
    </section>
    <label className="standalone-field">{t('Комментарий')} <span>{t('Необязательно')}</span><textarea rows={3} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <div className="payment-method"><span className="payment-icon"><WalletCards size={22}/></span><div><b>{t('Оплата USDT')}</b><p>{t('Выберите сеть — покажем точную сумму и адрес.')}</p></div></div>
    <UsdtNetworkPicker amount={total} busy={busy} disabled={invalid} onSelect={onSelect}/>
    {invalid&&<p className="form-failure">{t('Количество превышает остаток. Измените состав корзины.')}</p>}
    {error&&<p className="form-failure" role="alert">{t(error)}</p>}
    <button hidden={!russianPayments()} type="button" className="secondary-button usdt-alternative" disabled={busy} onClick={onCard}><CreditCard size={18}/>{t('Оплатить картой в рублях')}</button>
  </div>;
}
