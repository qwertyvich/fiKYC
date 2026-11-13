import {isIP} from 'node:net';
import {readFileSync,statSync} from 'node:fs';
export function ipBytes(raw) {
  if(typeof raw!=='string')return null;
  let ip=raw.trim();if(/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip))ip=ip.slice(7);
  const family=isIP(ip);if(!family)return null;
  if(family===4){const bytes=Buffer.from(ip.split('.').map(Number)),[a,b,c]=bytes;
    if(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===192&&b===0)||(a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113))return null;
    return bytes;
  }
  if(ip.includes('.')){const pos=ip.lastIndexOf(':'),v4=ip.slice(pos+1).split('.').map(Number);ip=ip.slice(0,pos+1)+((v4[0]<<8)|v4[1]).toString(16)+':'+((v4[2]<<8)|v4[3]).toString(16);}
  const parts=ip.split('::'),left=parts[0]?parts[0].split(':'):[],right=parts[1]?parts[1].split(':'):[];
  const words=parts.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
  const bytes=Buffer.alloc(16);words.forEach((v,i)=>bytes.writeUInt16BE(parseInt(v,16),i*2));
  if(bytes.subarray(0,10).every(b=>b===0)&&bytes[10]===255&&bytes[11]===255)return ipBytes([...bytes.subarray(12)].join('.'));
  if((bytes[0]&0xe0)!==0x20||(bytes[0]===0x20&&bytes[1]===1&&bytes[2]===0x0d&&bytes[3]===0xb8))return null;
  return bytes;
}
export function lookupBuffer(data,ip) {
  const bytes=ipBytes(ip);if(!bytes||data.length<16||data.toString('ascii',0,8)!=='FIKGEO1\n')return '';
  const v4=data.readUInt32BE(8),v6=data.readUInt32BE(12),width=bytes.length,size=width*2+2,count=width===4?v4:v6,offset=width===4?16:16+v4*10;
  if(data.length!==16+v4*10+v6*34)return '';
  let low=0,high=count-1;
  while(low<=high){const mid=(low+high)>>>1,start=offset+mid*size;
    if(Buffer.compare(bytes,data.subarray(start,start+width))<0)high=mid-1;
    else if(Buffer.compare(bytes,data.subarray(start+width,start+width*2))>0)low=mid+1;
    else{const country=data.toString('ascii',start+width*2,start+size);return /^[A-Z]{2}$/.test(country)&&country!=='ZZ'?country:'';}
  }return '';
}
export function createCountryLookup(path) {
  let checked=0,stamp=0,data=Buffer.alloc(0),release='';
  function reload(){if(Date.now()-checked<60000)return;checked=Date.now();try{const next=statSync(path).mtimeMs;if(next!==stamp){const bytes=readFileSync(path);if(bytes.length<16||bytes.toString('ascii',0,8)!=='FIKGEO1\n'||bytes.length!==16+bytes.readUInt32BE(8)*10+bytes.readUInt32BE(12)*34)throw Error('Invalid country database');data=bytes;stamp=next;try{release=JSON.parse(readFileSync(path+'.json','utf8')).release??'';}catch{release='';}}}catch{/* Missing database means unknown country; checkout remains available. */}}
  const lookup=ip=>{reload();return lookupBuffer(data,ip);};
  lookup.status=()=>{reload();return{available:!!data.length,release,source:'DB-IP Lite'};};return lookup;
}
export function requestCountry(req,lookup,trustProxy=false) {
  const ip=trustProxy?req.headers['x-fikus-client-ip']:req.socket.remoteAddress;
  const result=lookup(typeof ip==='string'?ip:'');return /^[A-Z]{2}$/.test(result)&&result!=='ZZ'?result:'';
}
