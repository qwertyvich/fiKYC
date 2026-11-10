// Reproducible motion design. Generated avatar originals are kept unchanged.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=root+'public/branding/telegram/';
const ffmpeg=process.env.FFMPEG_PATH;
if(!ffmpeg)throw new Error('Set FFMPEG_PATH to a local ffmpeg executable');
await mkdir(out,{recursive:true});
const font=(await readFile(root+'public/fonts/geologica-cyrillic-wght-normal.woff2')).toString('base64');
const mascot=(await readFile(root+'public/ficus-mascot.png')).toString('base64');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:640,height:360},deviceScaleFactor:1});
await page.setContent(`<style>@font-face{font-family:Geo;src:url(data:font/woff2;base64,${font})}*{box-sizing:border-box}body{margin:0;background:#f4f2ea;font-family:Geo,sans-serif}svg{display:block}text{font-family:Geo,sans-serif}</style><div id=art></div>`);
await page.evaluate(()=>document.fonts.ready);
function banner(theme,kind,t){
 const claude=theme==='claude',accent=claude?'#d58058':'#7c9f30',wave=Math.sin(t*Math.PI*2),pulse=(Math.sin(t*Math.PI*2)+1)/2;
 const creature=claude?`<g transform="translate(373 ${145+wave*3})"><path d="M0 26h22V4h89v22h22v32h-22v39H96V75H79v22H61V75H44v22H22V58H0Z" fill="#d58058"/><path d="M37 19h10v10H37zm50 0h10v10H87z" fill="#292d29"/></g>`:`<image href="data:image/png;base64,${mascot}" x="367" y="${113+wave*3}" width="145" height="145" style="mix-blend-mode:multiply"/>`;
 const arrowY=wave*3;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#f4f2ea"/><rect x="16" y="16" width="608" height="328" rx="28" fill="#eeede5"/>
 <circle cx="42" cy="43" r="5" fill="#739d3f"/><text x="57" y="49" font-size="18" font-weight="700" fill="#233225">фиКУС</text><text x="135" y="48" font-size="10" letter-spacing="1.2" fill="#797e71">ЦИФРОВОЙ МАРКЕТ</text>
 <rect x="38" y="83" width="${claude?133:66}" height="27" rx="13.5" fill="${claude?'#ead4c6':'#dfe8c6'}"/><text x="51" y="101" font-size="11" font-weight="600" letter-spacing="1" fill="${claude?'#8b4b2e':'#4a652a'}">${claude?'CLAUDE · KYC':'KYC'}</text>
 <text x="38" y="151" font-size="32" font-weight="600" letter-spacing="-1.5" fill="#20281f">Верификация</text><text x="38" y="190" font-size="32" font-weight="600" letter-spacing="-1.5" fill="#20281f">на ваш аккаунт</text>
 <text x="40" y="224" font-size="12" fill="#777e70">${claude?'Claude · Условия и заказ в каталоге':'Claude и другие цифровые сервисы'}</text>
 <path d="M376 90h210" stroke="#d7d9cc"/><text x="379" y="79" font-size="9" letter-spacing="1.7" fill="#8b9082">ПРОСТО. ПО ПОРЯДКУ.</text>
 ${creature}<path d="M493 190h28" stroke="#a6ad99" stroke-width="4"/><circle cx="${499+pulse*19}" cy="190" r="3" fill="${accent}"/>
 <g transform="translate(520 144)"><rect width="80" height="63" rx="4" fill="#222824"/><rect x="5" y="5" width="70" height="48" rx="2" fill="#353e35"/><rect x="10" y="12" width="24" height="3" rx="1" fill="#98b95b"/><path d="M11 24h54m-54 6h37" stroke="#596851" stroke-width="3"/><path d="M-7 65h94l-9 6H2Z" fill="#939d87"/></g>
 <g transform="translate(561 225) scale(${.97+pulse*.03})"><circle r="24" fill="#749b49"/><path d="m-10 0 7 7 15-16" fill="none" stroke="#f4f2ea" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>
 <rect x="36" y="282" width="568" height="43" rx="14" fill="#e0e7cd"/><circle cx="58" cy="303.5" r="4" fill="#759a46"/><text x="73" y="308" font-size="11" font-weight="500" fill="#40522d">${kind==='menu'?'Выберите раздел кнопкой ниже':claude?'Верификация KYC · Аккаунты Claude':'Верификации · Аккаунты · Цифровые сервисы'}</text>
 ${kind==='menu'?`<path d="M575 ${295+arrowY}v16m-6-6 6 6 6-6" stroke="#587637" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`:''}</svg>`;
}
async function command(args){const p=spawn(ffmpeg,args,{stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',d=>error+=d);const [code]=await once(p,'close');if(code)throw new Error(error.slice(-2000));}
async function render(name,width,height,svg){
 await page.setViewportSize({width,height});
 const dest=out+name+'.mp4';
 const proc=spawn(ffmpeg,['-y','-loglevel','error','-f','image2pipe','-vcodec','png','-r','15','-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',dest],{stdio:['pipe','ignore','pipe']});
 let error='';proc.stderr.on('data',d=>error+=d);
 const finished=once(proc,'close');
 for(let i=0;i<90;i++){
  const art=svg(i/90);await page.evaluate(s=>{document.querySelector('#art').innerHTML=s;},art);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
  const png=await page.screenshot({type:'png'});if(i===0)await writeFile(out+name+'-preview.png',png);
  if(!proc.stdin.write(png))await once(proc.stdin,'drain');
 }
 proc.stdin.end();const [code]=await finished;if(code)throw new Error(error);
 console.log('Rendered '+name);
}
try{
 for(const theme of ['general','claude']){
  for(const role of ['bot','operator']){
   const name=theme+'-'+role,data=(await readFile(out+name+'.png')).toString('base64');
   await render(name,512,512,t=>`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#f4f2ea"/><g transform="translate(256 256) scale(${.80+.008*Math.sin(t*2*Math.PI)}) translate(-256 -256)"><image href="data:image/png;base64,${data}" width="512" height="512"/></g></svg>`);
   await command(['-y','-loglevel','error','-i',out+name+'-preview.png','-frames:v','1','-q:v','2',out+name+'.jpg']);
  }
  for(const kind of ['description','menu'])await render(theme+'-'+kind,640,360,t=>banner(theme,kind,t));
  await command(['-y','-loglevel','error','-i',out+theme+'-description.mp4','-filter_complex','fps=12,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0',out+theme+'-description.gif']);
 }
}finally{await browser.close();}
