import { DEFAULT_USD_RATE, usdUnitMinor } from './usdt.ts';
type Method='card'|'usdt';
let preferredLanguage:string|undefined;
let lastUser:{id?:number;language_code?:string}|undefined;
let method:Method='card',rate=DEFAULT_USD_RATE,account:number|undefined,automatic:Method='card',context='';
let networks={trc20:false,bep20:false},version=0;
const listeners=new Set<()=>void>();
const key=()=>`fikus:payment-method:v2:${account??'guest'}`;
const changed=()=>{version++;listeners.forEach(fn=>fn());};
export const subscribePricing=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const pricingSnapshot=()=>version;
export const paymentMethod=()=>method;
export const russianPayments=()=>context.split('-')[0]==='ru';
export function configureMenuLanguage(language?:string){if(preferredLanguage===language)return;preferredLanguage=language;initPricing(lastUser);}
export const usdDisplay=()=>method==='usdt';
export const exchangeRate=()=>rate;
export const paymentNetworks=()=>networks;
export function initPricing(user?:{id?:number;language_code?:string}) {
  lastUser=user;account=user?.id;
  const language=preferredLanguage || user?.language_code || (typeof navigator!=='undefined'?navigator.language:'ru');
  context=language.toLowerCase().replaceAll('_','-');
  automatic=language.toLowerCase().split(/[-_]/)[0]==='ru'?'card':'usdt';method=automatic;
  try{const saved=JSON.parse(localStorage.getItem(key())??'null');if(saved?.context===context&&(saved?.method==='usdt'||(saved?.method==='card'&&automatic==='card')))method=saved.method;}catch{}
  changed();
}
export function setPaymentMethod(value:Method){if(value==='card'&&!russianPayments())return;method=value;try{localStorage.setItem(key(),JSON.stringify({method:value,context}));}catch{}changed();}
export function refreshTelegramPricing(user?:{id?:number;language_code?:string}){const next=(preferredLanguage||user?.language_code||(typeof navigator!=='undefined'?navigator.language:'ru')).toLowerCase().replaceAll('_','-');if(next!==context||user?.id!==account)initPricing(user);}
export function configurePricing(settings:{usdtRubRate?:number;usdtNetworks?:{trc20:boolean;bep20:boolean}}){rate=settings.usdtRubRate??DEFAULT_USD_RATE;networks=settings.usdtNetworks??{trc20:false,bep20:false};changed();}
export function displayedUnit(price:number,currency:'RUB'|'USD'):{amount:number;currency:'RUB'|'USD'} {
  return usdDisplay()?{amount:usdUnitMinor(price,currency,rate)/100,currency:'USD'}:{amount:price,currency};
}
