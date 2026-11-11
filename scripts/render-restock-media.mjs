// Export the existing Claude card artwork; no new illustrations or production browser dependency.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const variants={ready:'claude-warmed',kyc:'claude-kyc',team:'claude-team',setup:'claude-setup',max:'claude-max',cdk:'claude-cdk',pro:'claude-pro'};
await mkdir('qa/restock-art',{recursive:true});await mkdir('public/restocks',{recursive:true});
await writeFile('qa/restock-art.html','<html lang="ru" data-mode="light"><div id="root"></div><script type="module" src="/qa/restock-art.tsx"></script></html>');
await writeFile('qa/restock-art.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import{ClawdProductArt}from'/src/ClaudeSection.tsx';import'/src/themes.css';import'/src/claude-section.css';import'/src/claude-fonts.css';
const id=new URLSearchParams(location.search).get('id');document.body.style.margin='0';createRoot(document.getElementById('root')).render(<div className="detail-art" style={{position:'relative',width:640,height:400,minHeight:0,borderRadius:0,margin:0,background:'#f0eee6'}}><ClawdProductArt product={{id,title:id}}/></div>);`);
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
try {
 const page=await browser.newPage({viewport:{width:640,height:400},colorScheme:'light'});
 for(const [variant,id] of Object.entries(variants)) {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/qa/restock-art.html?id=${id}`);
  await page.addStyleTag({content:'*{box-sizing:border-box}html,body,#root{margin:0!important;padding:0!important;width:640px;height:400px;overflow:hidden}body{font-family:system-ui,sans-serif}.detail-art{position:relative;overflow:hidden;isolation:isolate}.detail-art>.clawd-product{position:absolute!important;inset:0!important;width:640px!important;height:400px!important;padding:30px!important;gap:18px!important}.detail-art .clawd-scene{max-width:480px}.detail-art .clawd-tier{font-size:28px}.detail-art .clawd-product-label{font-size:14px}'});
  await page.locator('.clawd-scene').waitFor();await page.evaluate(()=>document.fonts.ready);
  const img=page.locator('.clawd-scene');await img.evaluate(img=>img.decode());const box=await img.boundingBox(),artBox=await page.locator('.detail-art').boundingBox();box.x-=artBox.x;box.y-=artBox.y;const src=await img.getAttribute('src');
  await img.evaluate(img=>img.style.visibility='hidden');const background=resolve('qa/restock-art/'+variant+'.png');await page.locator('.detail-art').screenshot({path:background});
  const result=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',['-y','-loglevel','error','-loop','1','-i',background,'-ignore_loop','0','-i',resolve('public',src.replace(/^\//,'')),'-filter_complex',`[1:v]scale=${Math.round(box.width)}:${Math.round(box.height)}:flags=neighbor[mascot];[0:v][mascot]overlay=${Math.round(box.x)}:${Math.round(box.y)}:shortest=1`,'-t','6','-r','15','-an','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',resolve('public/restocks/claude-'+variant+'.mp4')],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr||'FFmpeg failed');console.log('Exported Claude card:',variant);
 }
}finally{await browser.close();await server.close();}
