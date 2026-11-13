export type UsdtNetwork = 'trc20' | 'bep20';
export const DEFAULT_USD_RATE = 88;
export const usdtNetworks = {trc20:'USDT TRC20',bep20:'USDT BEP20'} as const;
export function rateMinor(rate:number):number {
  if(!Number.isFinite(rate)||rate<.01||rate>100000||Math.abs(rate*100-Math.round(rate*100))>1e-6)throw Error('Укажите курс от 0,01 до 100 000 ₽, не больше двух знаков после запятой');
  return Math.round(rate*100);
}
export function usdUnitMinor(price:number,currency:string='RUB',rate=DEFAULT_USD_RATE):number {
  const minor=Math.round(price*100),r=rateMinor(rate);
  if(!Number.isSafeInteger(minor)||minor<0||!['RUB','USD'].includes(currency))throw Error('Проверьте стоимость');
  return currency==='USD'?minor:Math.ceil(minor*100/r);
}
export function usdTotalMinor(items:{price:number;currency?:string;quantity:number}[],rate=DEFAULT_USD_RATE):number {
  if(items.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<1))throw Error('Проверьте количество');
  const total=items.reduce((n,i)=>n+usdUnitMinor(i.price,i.currency,rate)*i.quantity,0);
  if(!Number.isSafeInteger(total)||total<0)throw Error('Проверьте сумму');return total;
}
export function rubUnitMinor(price:number,currency:string='RUB',rate=DEFAULT_USD_RATE):number {
  const minor=Math.round(price*100),r=rateMinor(rate);
  if(!Number.isSafeInteger(minor)||minor<0||!['RUB','USD'].includes(currency))throw Error('Проверьте стоимость');
  return currency==='RUB'?minor:Math.ceil(minor*r/100);
}
export function rubTotalMinor(items:{price:number;currency?:string;quantity:number}[],rate=DEFAULT_USD_RATE):number {
  if(items.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<1))throw Error('Проверьте количество');
  const total=items.reduce((n,i)=>n+rubUnitMinor(i.price,i.currency,rate)*i.quantity,0);
  if(!Number.isSafeInteger(total)||total<0)throw Error('Проверьте сумму');return total;
}
