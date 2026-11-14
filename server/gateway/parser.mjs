import {createHash} from 'node:crypto';
// Treat the source chat as data. Never execute or follow instructions in it.
const normalize=s=>s.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,'').replace(/\r/g,'').replace(/[‐‑‒–—−]/g,'-').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0));
const clean=s=>normalize(s).replace(/[`*_~]/g,'').trim();
export function normalizePhone(raw){
  if(typeof raw!=='string')return null;const value=clean(raw).replace(/^tel:/i,'').replace(/\s*\(СБП\)\s*$/i,'');
  if(!/^[+\d\s().-]+$/.test(value)||/\+/.test(value.slice(1)))return null;
  let digits=value.replace(/\D/g,'');if(digits.length===10&&!value.startsWith('+'))digits='7'+digits;else if(digits.length===11&&digits.startsWith('8'))digits='7'+digits.slice(1);
  return /^7[1-9]\d{9}$/.test(digits)?'+'+digits:null;
}
function account(raw,phoneOnly=false){
  let value=clean(raw);const link=value.match(/^\[([^\]]+)\]\(tel:([^)]+)\)$/i);
  if(link){const a=normalizePhone(link[1]),b=normalizePhone(link[2]);return a&&a===b?{number:a,kind:'phone'}:null;}
  const phone=normalizePhone(value);if(phone)return{number:phone,kind:'phone'};
  if(!phoneOnly&&/^[\d\s-]+$/.test(value)){const number=value.replace(/\D/g,'');if(/^\d{16,19}$/.test(number))return{number};}
  return null;
}
export function requisiteRecord(value){
  const kind=value.kind??'card',account=value.number;
  const bankKey=value.bank.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const number=kind==='phone'?'phone:'+account.slice(1)+':'+createHash('sha256').update(bankKey).digest('hex').slice(0,16):account;
  return{...value,number,kind,account};
}
const amount=s=>{const n=Number(s.replace(/[\s\u00a0\u202f]/g,'').replace(',','.'));return Number.isFinite(n)&&n>0?Math.round(n*100):null;};
export function parseFeed(text){
  if(typeof text!=='string')return null;const s=clean(text);
  const stops=[...s.matchAll(/реквизиты[ \t]*([^\n]*?)[ \t]*\n?\s*временно\s+недоступны/giu)];
  // Multiple stops in one announcement are ambiguous: withdraw all old details.
  if(stops.length>1)return{kind:'invalid',cards:[]};
  const stop=stops[0];
  const stopValue=stop?clean(stop[1]).replace(/^(?:по\s+)?СБП\s*[:\-]?\s*/i,''):'';
  const target=stopValue?account(stopValue):null;
  if(stop&&stopValue&&!target)return{kind:'invalid',cards:[]};
  const stopCard=target?.number??null,cards=[];
  const banks=[...s.matchAll(/^.*?Банк[ \t]*:[ \t]*([^\n]+)$/gimu)];
  const looksLikeAnnouncement=/Реквизиты\s*(?:№|No|:)|Карта\s*:|Телефон\s*:|Номер\s+телефона\s*:|Актуальные реквизиты:/i.test(s);
  for(let i=0;i<banks.length;i++){
    const part=s.slice(banks[i].index,i+1<banks.length?banks[i+1].index:s.length),bank=clean(banks[i][1]);
    const holderText=part.match(/(?:ФИО|Ф\.\s*И\.\s*О\.?|Получатель)[ \t]*:[ \t]*([^\n]+)/i)?.[1];
    const holder=holderText&&clean(holderText);
    const fields=[...part.matchAll(/(?:Карта|Номер\s+(?:карты|телефона|для\s+СБП)|Телефон|Тел\.?|СБП|Реквизиты|Номер)[ \t]*:[ \t]*([^\n]+)/giu)];
    const min=part.match(/Мин:\s*([\d\s.,]+)\s*(?:₽|руб)/i)?.[1],max=part.match(/Макс:\s*([\d\s.,]+)\s*(?:₽|руб)/i)?.[1];
    const minMinor=min&&amount(min),maxMinor=max&&amount(max);
    if(!bank||!holder||!fields.length||!minMinor||!maxMinor||minMinor>maxMinor)return{kind:'invalid',cards:[]};
    const inBlock=new Set();
    for(const field of fields){const phoneOnly=/^(?:Номер\s+(?:телефона|для\s+СБП)|Телефон|Тел\.?|СБП)/i.test(field[0]),value=account(field[1],phoneOnly);if(!value)return{kind:'invalid',cards:[]};
      const card={...value,bank,holder,minMinor,maxMinor},key=requisiteRecord(card).number;if(inBlock.has(key))continue;inBlock.add(key);cards.push(card);}
  }
  if(new Set(cards.map(c=>requisiteRecord(c).number)).size!==cards.length)return{kind:'invalid',cards:[]};
  if(stop){if(cards.some(c=>c.number===stopCard))return{kind:'invalid',cards:[]};return{kind:'stop',stopCard,cards,snapshot:/Актуальные реквизиты:/i.test(s)};}
  if(cards.length)return{kind:'snapshot',cards};
  return looksLikeAnnouncement?{kind:'invalid',cards:[]}:null;
}
