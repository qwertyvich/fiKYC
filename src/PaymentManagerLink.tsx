import {ArrowUpRight,CreditCard,MessageCircle} from 'lucide-react';
import {t} from './i18n';
import {sellerChatLink} from './seller';
import {telegram} from './telegram';

export function PaymentManagerLink({username,message,requestCard=true}:{username:string;message:string;requestCard?:boolean}){
  // Always leave a way to contact the operator, including very large baskets.
  const chars=Array.from(message),draft=chars.length>4000?chars.slice(0,3900).join('')+'\n'+t('Остальные товары уточню в чате.'):message;
  const href=sellerChatLink(username,draft)??sellerChatLink('phiKYC',draft)!;
  return <a className="alternative-payment payment-manager-link" href={href} target="_blank" rel="noreferrer" onClick={e=>{if(telegram?.openTelegramLink){e.preventDefault();telegram.openTelegramLink(href);}}}>
    <span className="payment-manager-icon">{requestCard?<CreditCard size={23}/>:<MessageCircle size={23}/>}</span>
    <span><b>{t(requestCard?'Запросить карту у оператора':'Помощь с оплатой')}</b><small>{t(requestCard?'Помощь с реквизитами и оплатой':'Свяжитесь с оператором удобным способом')}</small></span><ArrowUpRight size={20}/>
  </a>;
}
