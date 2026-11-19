import{chromium,expect}from'@playwright/test';
import assert from'node:assert/strict';
import{readFile,mkdir}from'node:fs/promises';
import{createApp}from'../server/index.mjs';
const app=await createApp({dbPath:':memory:',gatewayWorker:false,shopBotWorker:false,restockWorker:false,sbpWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:''}});
if(process.env.CATALOG_SNAPSHOT){const data=JSON.parse(await readFile(process.env.CATALOG_SNAPSHOT,'utf8'));app.db.prepare('UPDATE state SET catalog=?,shop=?').run(JSON.stringify(data.catalog),JSON.stringify(data.shop));}
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const dir='qa/catalog-layout';await mkdir(dir,{recursive:true});
try{
 for(const lang of ['ru','en','zh','fa']){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:lang==='fa'?'fa-IR':lang==='zh'?'zh-CN':lang==='ru'?'ru-RU':'en-US',reducedMotion:'reduce'});
  await context.route('https://telegram.org/**',r=>r.fulfill({body:''}));
  await context.addInitScript(language=>{window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:100,first_name:'Buyer',language_code:language}},colorScheme:'light',ready(){},expand(){},onEvent(){},offEvent(){},setHeaderColor(){},setBackgroundColor(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}}}};},lang);
  const page=await context.newPage(),errors=[],untranslated=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#/catalog');await expect(page.locator('.product-card').first()).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang',lang);
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>document.fonts.ready);
   const positions=await page.locator('.products:not(.products-list) .product-card').evaluateAll(cards=>cards.map(card=>{const box=card.getBoundingClientRect(),button=card.querySelector('.product-price button').getBoundingClientRect(),title=card.querySelector('.product-title');return{top:box.top,bottom:box.bottom,buttonBottom:button.bottom,titleClipped:title.scrollHeight>title.clientHeight+1};}));
   assert.ok(positions.length>1);for(let i=0;i+1<positions.length;i+=2){const a=positions[i],b=positions[i+1];assert.ok(Math.abs(a.top-b.top)<1);assert.ok(Math.abs(a.bottom-b.bottom)<1);assert.ok(Math.abs(a.buttonBottom-b.buttonBottom)<1,`${lang}/${width}: purchase buttons differ`);}assert.ok(positions.every(p=>!p.titleClipped));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),lang+' horizontal overflow');
  }
  await page.locator('.products').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/'+lang+'-catalog.png'});
  {
   const catalog=JSON.parse(app.db.prepare('SELECT catalog FROM state').get().catalog);
   for(const product of catalog.products.filter(p=>p.visible&&catalog.groups.some(g=>g.id===p.groupId&&g.visible))){
    await page.goto(base+'/#/product/'+product.id);await expect(page.locator('.offer-page')).toBeVisible();
    await expect(page.locator('.offer-block a[href="https://claude.com/pricing"]')).toHaveCount(0);
    const text=await page.locator('.offer-page').innerText();assert.ok(!text.includes('Важно о проверках Anthropic'));if(lang!=='ru'&&/[А-Яа-яЁё]/.test(text))untranslated.push(...text.split('\n').filter(s=>/[А-Яа-яЁё]/.test(s)));
   }
  }
  assert.deepEqual([...new Set(untranslated)],[],lang+' untranslated detail strings');
  await page.goto(base+'/#/profile');await expect(page.locator('.wallet-card')).toBeVisible();
  const aligns=await page.locator('.wallet-card>p').evaluateAll(ps=>ps.map(p=>getComputedStyle(p).textAlign));assert.ok(aligns.length>=1&&aligns.every(a=>a==='start'||a===(lang==='fa'?'right':'left')));
  await page.locator('.wallet-card').screenshot({path:dir+'/'+lang+'-wallet.png'});assert.deepEqual(errors,[]);await context.close();console.log(lang+': aligned prices/buttons, full titles, translated product details, wallet text alignment');
 }
}finally{await browser.close();await new Promise(r=>app.server.close(r));}
