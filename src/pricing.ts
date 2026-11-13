import { DEFAULT_USD_RATE, usdUnitMinor } from './usdt.ts';
type Method='card'|'usdt';
let method:Method='card',rate=DEFAULT_USD_RATE,account:number|undefined,automatic:Method='card';
let networks={trc20:false,bep20:false},version=0;
const listeners=new Set<()=>void>();
const key=()=>`fikus:payment-method:${account??'guest'}`;
const changed=()=>{version++;listeners.forEach(fn=>fn());};
export const subscribePricing=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const pricingSnapshot=()=>version;
export const paymentMethod=()=>method;
export const usdDisplay=()=>method==='usdt';
export const exchangeRate=()=>rate;
export const paymentNetworks=()=>networks;
export function initPricing(user?:{id?:number;language_code?:string}) {
  account=user?.id;
  const language=user?.language_code || (typeof navigator!=='undefined'?navigator.language:'ru');
  automatic=language.toLowerCase().split(/[-_]/)[0]==='ru'?'card':'usdt';method=automatic;
  try{const saved=localStorage.getItem(key());if(saved==='card'||saved==='usdt')method=saved;}catch{}
  changed();
}
export function setPaymentMethod(value:Method){method=value;try{localStorage.setItem(key(),value);}catch{}changed();}
export function configurePricing(settings:{usdtRubRate?:number;usdtNetworks?:{trc20:boolean;bep20:boolean}}){rate=settings.usdtRubRate??DEFAULT_USD_RATE;networks=settings.usdtNetworks??{trc20:false,bep20:false};changed();}
export function displayedUnit(price:number,currency:'RUB'|'USD'):{amount:number;currency:'RUB'|'USD'} {
  return usdDisplay()?{amount:usdUnitMinor(price,currency,rate)/100,currency:'USD'}:{amount:price,currency};
}
