import test from 'node:test';
import assert from 'node:assert/strict';
import {usdUnitMinor,usdTotalMinor,rubTotalMinor,rateMinor} from './usdt.ts';
import {initPricing,paymentMethod,setPaymentMethod,configurePricing,usdDisplay} from './pricing.ts';
import {money,lineMoney,currencyTotals} from './domain.ts';
test('conversion rounds each product once so displayed unit prices, quantities and checkout totals agree',()=>{
  assert.equal(usdUnitMinor(1500,'RUB',88),1705);assert.equal(usdTotalMinor([{price:1500,quantity:2},{price:10,currency:'USD',quantity:1}],88),4410);
  assert.equal(rubTotalMinor([{price:20,currency:'USD',quantity:1},{price:1500,quantity:2}],88),476000);
  for(const rate of [0,Infinity,88.555])assert.throws(()=>rateMinor(rate));
  assert.throws(()=>usdTotalMinor([{price:1,quantity:-1}],88));
});
test('Telegram language chooses an initial method while card override is account-specific',()=>{
  const data=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
  initPricing({id:1,language_code:'ru-RU'});assert.equal(paymentMethod(),'card');
  initPricing({id:2,language_code:'en-GB'});assert.equal(paymentMethod(),'usdt');setPaymentMethod('card');
  initPricing({id:3,language_code:'zh-Hant'});assert.equal(paymentMethod(),'usdt');
  initPricing({id:2,language_code:'en-GB'});assert.equal(paymentMethod(),'usdt');
  initPricing({id:1,language_code:'ru'});delete(globalThis as {localStorage?:unknown}).localStorage;
});
test('USD display never changes stored product prices and cart totals match rounded line prices',()=>{
  initPricing({language_code:'zh'});configurePricing({usdtRubRate:88});assert.ok(usdDisplay());
  assert.match(money(1500),/17,05 \$/);assert.match(lineMoney(1500,2),/34,1 \$/);assert.deepEqual(currencyTotals([{price:1500,quantity:2},{price:10,currency:'USD',quantity:1}]),['44,1 $']);
  initPricing({language_code:'ru'});assert.match(money(1500),/₽/);
});
