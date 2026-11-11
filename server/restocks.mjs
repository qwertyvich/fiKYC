import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { imageInfo } from './product-images.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const privateId = id => /^[1-9]\d{0,15}$/.test(String(id)) && Number.isSafeInteger(Number(id));
const escape = value => String(value).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const snapshot = p => JSON.stringify(['id','title','brand','groupId','stock','price','currency','imageId','imageFit','visible','saleMode'].map(k => p[k] ?? null));
const fingerprint = p => createHash('sha256').update(snapshot(p)).digest('hex');
export function claudeRestockVariant(p) {
  const name = `${p.id} ${p.title}`.toLowerCase();
  return /warmed|прогрет/.test(name) ? 'ready' : /kyc|верификац/.test(name) ? 'kyc' : /team|команд/.test(name) ? 'team' : /setup|настрой/.test(name) ? 'setup' : /max/.test(name) ? 'max' : /cdk|код активации/.test(name) ? 'cdk' : 'pro';
}

export function createRestocks({db, state, bots, blocked, assetsRoot, now = Date.now}) {
  db.exec(`CREATE TABLE IF NOT EXISTS shop_contacts(bot_id TEXT NOT NULL,telegram_id TEXT NOT NULL,username TEXT NOT NULL DEFAULT '',last_seen INTEGER NOT NULL,reachable INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(bot_id,telegram_id));
    CREATE TABLE IF NOT EXISTS restock_preferences(telegram_id TEXT PRIMARY KEY,muted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS restock_campaigns(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,title TEXT NOT NULL,quantity INTEGER NOT NULL,fingerprint TEXT NOT NULL,caption TEXT NOT NULL,plain_caption TEXT NOT NULL,emoji_id TEXT NOT NULL,media_kind TEXT NOT NULL,media BLOB NOT NULL,product_url TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',created_at INTEGER NOT NULL,started_at INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS restock_deliveries(campaign_id TEXT NOT NULL,telegram_id TEXT NOT NULL,bots TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',sent_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(campaign_id,telegram_id));
    CREATE INDEX IF NOT EXISTS restock_pending ON restock_deliveries(status,next_at);
    CREATE TABLE IF NOT EXISTS restock_file_ids(campaign_id TEXT NOT NULL,bot_id TEXT NOT NULL,file_id TEXT NOT NULL,PRIMARY KEY(campaign_id,bot_id));`);
  // Telegram has no idempotency key for sends. An interrupted in-flight request is not sent twice.
  db.prepare("UPDATE restock_deliveries SET status='uncertain',error='Доставка не подтверждена после перезапуска' WHERE status='sending'").run();
  let timer, stopped = true, working = false, nextSend = 0;

  function observe(bot, update) {
    const member = update.my_chat_member, msg = update.callback_query?.message ?? update.message ?? member;
    const from = update.callback_query?.from ?? msg?.from;
    if (msg?.chat?.type !== 'private' || !privateId(msg.chat.id) || !from || from.is_bot || String(from.id) !== String(msg.chat.id)) return;
    const reachable = member ? !['kicked','left'].includes(member.new_chat_member?.status) : true;
    db.prepare(`INSERT INTO shop_contacts VALUES(?,?,?,?,?) ON CONFLICT(bot_id,telegram_id) DO UPDATE SET username=excluded.username,last_seen=excluded.last_seen,reachable=excluded.reachable`).run(bot.id,String(msg.chat.id),from.username ?? '',now(),Number(reachable));
  }
  function observeProof(initData) {
    const proof = bots.proof(initData);
    if (proof && privateId(proof.user.id) && !proof.user.is_bot)
      observe(proof.bot,{message:{chat:{id:proof.user.id,type:'private'},from:proof.user}});
  }
  async function handle(bot, update) {
    const cb=update.callback_query, msg=cb?.message ?? update.message, value=msg?.text ?? '';
    const mute=cb?.data === 'stock:mute' || /^\/stop(?:@[\w]+)?(?:\s|$)/i.test(value);
    const unmute=/^\/notify(?:@[\w]+)?(?:\s|$)/i.test(value);
    if (!mute && !unmute) return false;
    db.prepare('INSERT INTO restock_preferences VALUES(?,?) ON CONFLICT(telegram_id) DO UPDATE SET muted=excluded.muted').run(String(msg.chat.id),Number(mute));
    const text=mute ? 'Уведомления о пополнении выключены. Включить снова: /notify' : 'Уведомления о пополнении включены.';
    if (cb) await bots.call(bot,'answerCallbackQuery',{callback_query_id:cb.id,text,show_alert:true});
    else await bots.call(bot,'sendMessage',{chat_id:msg.chat.id,text});
    return true;
  }
  const product = id => {
    const s=state(), p=s.catalog.products.find(p=>p.id===id);
    if (!p || !p.visible || !s.catalog.groups.some(g=>g.id===p.groupId&&g.visible)) fail('Товар скрыт или не найден',404);
    if (p.saleMode==='request' || p.stock<1) fail('Для рассылки укажите наличие товара');
    return p;
  };
  const muted = id => !!db.prepare('SELECT muted FROM restock_preferences WHERE telegram_id=?').get(id)?.muted;
  function audience() {
    const enabled=bots.list().bots.filter(b=>b.enabled), users=new Map();
    // Historical verified visitors predate contact tracking. Try their store bots, never the gateway.
    for (const v of db.prepare("SELECT telegram_id,telegram_username,MAX(verified_at) at FROM visitors WHERE telegram_id<>'' AND verified_at>0 GROUP BY telegram_id").all())
      if (privateId(v.telegram_id)) users.set(v.telegram_id,{username:v.telegram_username,ids:[]});
    for (const c of db.prepare('SELECT * FROM shop_contacts ORDER BY last_seen DESC,bot_id').all()) {
      if (!privateId(c.telegram_id)) continue;
      const u=users.get(c.telegram_id) ?? {username:c.username,ids:[]};
      if (!u.ids.length) u.username=c.username || u.username;
      if (c.reachable && enabled.some(b=>b.id===c.bot_id)) u.ids.push(c.bot_id);
      users.set(c.telegram_id,u);
    }
    return [...users].filter(([id,u])=>!muted(id)&&!blocked({id,username:u.username})).map(([id,u])=>({id,ids:[...new Set([...u.ids,...enabled.filter(b=>{
      const known=db.prepare('SELECT reachable FROM shop_contacts WHERE bot_id=? AND telegram_id=?').get(b.id,id);
      return !known || known.reachable;
    }).map(b=>b.id)])]})).filter(u=>u.ids.length);
  }
  function summary(id) {
    const c=db.prepare('SELECT id,product_id,title,quantity,status,created_at,started_at,error,media_kind,plain_caption,product_url FROM restock_campaigns WHERE id=?').get(id);
    if (!c) fail('Рассылка не найдена',404);
    const counts=Object.fromEntries(db.prepare('SELECT status,COUNT(*) n FROM restock_deliveries WHERE campaign_id=? GROUP BY status').all(id).map(r=>[r.status,r.n]));
    return {id:c.id,productId:c.product_id,title:c.title,quantity:c.quantity,status:c.status,createdAt:c.created_at,startedAt:c.started_at,error:c.error,mediaKind:c.media_kind,caption:c.plain_caption,productUrl:c.product_url,total:Object.values(counts).reduce((a,b)=>a+b,0),sent:counts.sent??0,failed:counts.failed??0,skipped:counts.skipped??0,uncertain:counts.uncertain??0,pending:(counts.pending??0)+(counts.sending??0)};
  }
  async function preview(input) {
    const p=product(input.productId), quantity=input.quantity;
    if (!Number.isInteger(quantity)||quantity<1||quantity>p.stock) fail('Укажите количество пополнения: от 1 до текущего остатка');
    if (!input.product || snapshot(input.product)!==snapshot(p)) fail('Карточка изменилась. Сохраните её и обновите предпросмотр',409);
    const manifest=JSON.parse(await readFile(resolve(assetsRoot,'branding/telegram/emoji-manifest.json'),'utf8'));
    const icon=manifest[p.brand] ?? manifest[p.groupId] ?? manifest.catalog, emoji=icon?.id ?? '';
    let media,kind='photo';
    if (p.brand==='claude'&&!p.imageId) {
      kind='animation';media=await readFile(resolve(assetsRoot,'restocks/claude-'+claudeRestockVariant(p)+'.mp4'));
    } else {
      if (typeof input.image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.image)||input.image.length>1900000) fail('Не удалось подготовить обложку товара');
      media=Buffer.from(input.image.split(',')[1],'base64');if(imageInfo(media).mime!=='image/jpeg')fail('Нужна обложка в формате JPG');
    }
    if (media.length>8*1024*1024) fail('Обложка слишком большая');
    const heading='Снова в наличии', line=`Добавили ${quantity.toLocaleString('ru-RU')} шт.`, plain=`${heading}\n\n${p.title}\n${line}\n\nПосмотрите условия и оформите заказ в карточке товара.`;
    const caption=`${emoji?`<tg-emoji emoji-id="${emoji}">🟢</tg-emoji>`:'🟢'} <b>${heading}</b>\n\n<blockquote><b>${escape(p.title)}</b>\n${line}</blockquote>\n\nПосмотрите условия и оформите заказ в карточке товара.`;
    const id=randomUUID(), users=audience(), url=bots.productUrl(p.id);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO restock_campaigns(id,product_id,title,quantity,fingerprint,caption,plain_caption,emoji_id,media_kind,media,product_url,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,p.id,p.title,quantity,fingerprint(p),caption,plain,emoji,kind,media,url,now());
      const insert=db.prepare('INSERT INTO restock_deliveries(campaign_id,telegram_id,bots) VALUES(?,?,?)');
      for (const u of users) insert.run(id,u.id,JSON.stringify(u.ids));
      db.exec('COMMIT');
    } catch(e) {db.exec('ROLLBACK');throw e;}
    return summary(id);
  }
  function launch(id) {
    const c=db.prepare('SELECT * FROM restock_campaigns WHERE id=?').get(id);if(!c)fail('Рассылка не найдена',404);
    if(c.status!=='draft')return summary(id);
    if(fingerprint(product(c.product_id))!==c.fingerprint)fail('Товар изменился. Подготовьте новый предпросмотр',409);
    if(now()-c.created_at>3600000)fail('Предпросмотр устарел. Подготовьте новый',409);
    if(!summary(id).total)fail('Пока нет получателей для этой рассылки');
    db.prepare("UPDATE restock_campaigns SET status='running',started_at=? WHERE id=? AND status='draft'").run(now(),id);
    return summary(id);
  }
  function cancel(id) {
    if(!db.prepare('SELECT id FROM restock_campaigns WHERE id=?').get(id))fail('Рассылка не найдена',404);
    db.prepare("UPDATE restock_campaigns SET status='cancelled' WHERE id=? AND status IN ('draft','running')").run(id);
    return summary(id);
  }
  function finish() {
    db.prepare("UPDATE restock_campaigns SET status='done' WHERE status='running' AND NOT EXISTS(SELECT 1 FROM restock_deliveries d WHERE d.campaign_id=restock_campaigns.id AND d.status IN ('pending','sending'))").run();
  }
  async function tick() {
    if (working || stopped || now()<nextSend) return;
    working=true;
    try {
      finish();
      const d=db.prepare("SELECT d.* FROM restock_deliveries d JOIN restock_campaigns c ON c.id=d.campaign_id WHERE c.status='running' AND d.status='pending' AND d.next_at<=? AND NOT EXISTS(SELECT 1 FROM restock_deliveries recent WHERE recent.telegram_id=d.telegram_id AND recent.sent_at>?) ORDER BY c.started_at,d.rowid LIMIT 1").get(now(),now()-1200);
      if(!d)return;
      const c=db.prepare('SELECT * FROM restock_campaigns WHERE id=?').get(d.campaign_id);
      try {product(c.product_id);} catch {db.prepare("UPDATE restock_campaigns SET status='cancelled',error='Товар больше недоступен' WHERE id=?").run(c.id);return;}
      const contact=db.prepare('SELECT username FROM shop_contacts WHERE telegram_id=? ORDER BY last_seen DESC LIMIT 1').get(d.telegram_id);
      const username=contact?.username ?? db.prepare('SELECT telegram_username FROM visitors WHERE telegram_id=? ORDER BY verified_at DESC LIMIT 1').get(d.telegram_id)?.telegram_username;
      const update=(status,error='')=>db.prepare('UPDATE restock_deliveries SET status=?,error=? WHERE campaign_id=? AND telegram_id=?').run(status,error,c.id,d.telegram_id);
      if(!privateId(d.telegram_id)||muted(d.telegram_id)||blocked({id:d.telegram_id,username})) {update('skipped');return;}
      const candidates=JSON.parse(d.bots).map(id=>bots.getRow(id)).filter(b=>b?.enabled);
      if(!candidates.length){update('skipped','Боты отключены');return;}
      update('sending');nextSend=now()+600;
      for (const bot of candidates) {
        if(stopped){update('pending');return;}
        let premium=!bot.emoji_warning;
        for (;;) {
          if(db.prepare('SELECT status FROM restock_campaigns WHERE id=?').get(c.id)?.status!=='running'||muted(d.telegram_id)||blocked({id:d.telegram_id,username})) {update('skipped');return;}
          if(!bots.getRow(bot.id)?.enabled)break;
          try {
            const cached=db.prepare('SELECT file_id FROM restock_file_ids WHERE campaign_id=? AND bot_id=?').get(c.id,bot.id)?.file_id;
            const field=c.media_kind==='animation'?'animation':'photo', extension=field==='animation'?'mp4':'jpg';
            const payload={chat_id:d.telegram_id,[field]:cached||'attach://cover',caption:premium?c.caption:c.caption.replace(/<tg-emoji[^>]*>.*?<\/tg-emoji>/g,'🟢'),parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'Открыть карточку товара',web_app:{url:c.product_url},style:'success',...(premium&&c.emoji_id?{icon_custom_emoji_id:c.emoji_id}:{})}],[{text:'Не уведомлять о пополнениях',callback_data:'stock:mute'}]]}};
            const result=await bots.call(bot,field==='animation'?'sendAnimation':'sendPhoto',payload,cached?undefined:{cover:{data:c.media,type:field==='animation'?'video/mp4':'image/jpeg',name:'cover.'+extension}});
            const file=result?.animation?.file_id ?? result?.photo?.at(-1)?.file_id;
            if(file)db.prepare('INSERT INTO restock_file_ids VALUES(?,?,?) ON CONFLICT(campaign_id,bot_id) DO UPDATE SET file_id=excluded.file_id').run(c.id,bot.id,file);
            db.prepare("UPDATE restock_deliveries SET status='sent',sent_at=?,error='' WHERE campaign_id=? AND telegram_id=?").run(now(),c.id,d.telegram_id);return;
          } catch(e) {
            const message=String(e.message).slice(0,300);
            if(premium&&/emoji|premium|icon_custom/i.test(message)){premium=false;db.prepare('UPDATE shop_bots SET emoji_warning=1 WHERE id=?').run(bot.id);continue;}
            if(e.telegramCode===403 || (e.telegramCode===400&&/chat not found|user is deactivated/i.test(message))) {
              db.prepare("INSERT INTO shop_contacts VALUES(?,?, '',?,0) ON CONFLICT(bot_id,telegram_id) DO UPDATE SET reachable=0").run(bot.id,d.telegram_id,now());break;
            }
            if(e.telegramCode===429 || (e.telegramCode>=500&&d.attempts<8)) {
              const delay=Math.max(1,Number(e.retryAfter)||0,Math.min(300,2**d.attempts));nextSend=now()+delay*1000;
              db.prepare("UPDATE restock_deliveries SET status='pending',attempts=attempts+1,next_at=?,error=? WHERE campaign_id=? AND telegram_id=?").run(nextSend,message,c.id,d.telegram_id);return;
            }
            update(e.telegramCode?'failed':'uncertain',message);return;
          }
        }
      }
      update('failed','Бот не может написать пользователю');
    } finally {working=false;finish();}
  }
  function start() {if(!stopped)return;stopped=false;timer=setInterval(()=>void tick().catch(()=>{}),500);timer.unref();}
  function stop() {stopped=true;clearInterval(timer);}
  return {observe,observeProof,handle,preview,launch,cancel,summary,tick,start,stop,list:productId=>db.prepare("SELECT id FROM restock_campaigns WHERE product_id=? AND status<>'draft' ORDER BY created_at DESC LIMIT 5").all(productId).map(c=>summary(c.id)),media:id=>db.prepare('SELECT media,media_kind FROM restock_campaigns WHERE id=?').get(id)};
}
