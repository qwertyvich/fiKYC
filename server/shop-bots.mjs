import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { token, telegramUser } from './security.mjs';
import { imageInfo } from './product-images.mjs';
import {telegramLanguage} from '../src/locale.ts';
import {translate} from '../src/i18n.ts';
import {createLanguageChoices} from './language-choices.mjs';

export const botPresets = {
  general: {
    name: 'фиКУС · KYC и цифровые сервисы',
    description: 'Верификация KYC на ваш аккаунт, аккаунты Claude и других нейросетей, почтовые сервисы. Выберите услугу в каталоге — менеджер поможет с оформлением. Нажмите «Старт», чтобы открыть разделы.',
    shortDescription: 'Верификация KYC, Claude и цифровые сервисы. Каталог и поддержка — в одном месте.',
    priority: 'product:claude-kyc',
  },
  claude: {
    name: 'фиКУС · Claude и верификация KYC',
    description: 'Помощь с верификацией KYC на вашем аккаунте Claude и готовые аккаунты. Выберите подходящую услугу, ознакомьтесь с условиями и оформите заказ. Нажмите «Старт», чтобы открыть каталог фиКУС.',
    shortDescription: 'Claude: верификация KYC и аккаунты. Условия, заказ и помощь менеджера в фиКУС.',
    priority: 'product:claude-kyc',
  },
};
const bad = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const tokenPattern = /^[1-9]\d{4,15}:[A-Za-z0-9_-]{25,100}$/;
const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) bad(`${label}: от 1 до ${max} символов`);
  return value.trim();
};

export function createShopBots({ db, env, state, botCall, now = Date.now, assetsRoot }) {
  db.exec(`CREATE TABLE IF NOT EXISTS shop_bots(
    id TEXT PRIMARY KEY, username TEXT NOT NULL, name TEXT NOT NULL, theme TEXT NOT NULL,
    priority TEXT NOT NULL, description TEXT NOT NULL, short_description TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, primary_bot INTEGER NOT NULL DEFAULT 0,
    encrypted_token TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, enabled_at INTEGER NOT NULL,
    offset INTEGER NOT NULL DEFAULT 0, last_poll INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '', emoji_warning INTEGER NOT NULL DEFAULT 0,
    applied_at INTEGER NOT NULL DEFAULT 0, main_app INTEGER NOT NULL DEFAULT 0,
    animation_file TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS shop_bot_jobs(bot_id TEXT NOT NULL, update_id INTEGER NOT NULL,
      payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      next_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(bot_id,update_id));
    CREATE TABLE IF NOT EXISTS shop_bot_avatars(bot_id TEXT PRIMARY KEY,data BLOB NOT NULL,updated_at INTEGER NOT NULL);`);
  const languageChoices=createLanguageChoices(db);
  let stopped = true;
  let restocks;
  const loops = new Map(), controllers = new Set(), retryTimers = new Map();
  const cipherKey = /^[a-f0-9]{64}$/i.test(env.BOTS_ENCRYPTION_KEY ?? '')
    ? Buffer.from(env.BOTS_ENCRYPTION_KEY, 'hex') : null;
  const seedId = tokenPattern.test(env.BOT_TOKEN ?? '') ? env.BOT_TOKEN.split(':')[0] : '';
  const gatewayId = (env.GATEWAY_BOT_TOKEN ?? '').split(':')[0];
  if (seedId && seedId !== gatewayId) {
    const p = botPresets.general;
    db.prepare(`INSERT OR IGNORE INTO shop_bots(id,username,name,theme,priority,description,short_description,primary_bot,created_at,enabled_at)
      VALUES(?,?,?,'general',?,?,?,1,?,?)`).run(seedId, state().settings.botUsername || '', p.name, p.priority, p.description, p.shortDescription, now(), now());
  }
  const row = id => db.prepare('SELECT * FROM shop_bots WHERE id=?').get(String(id));
  function encrypt(secret) {
    if (!cipherKey) bad('На сервере нужно настроить BOTS_ENCRYPTION_KEY перед подключением дополнительных ботов.');
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', cipherKey, iv);
    const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  function decrypt(value) {
    if (!cipherKey) return '';
    try {
      const data = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', cipherKey, data.subarray(0,12));
      cipher.setAuthTag(data.subarray(12,28));
      return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
    } catch { return ''; }
  }
  const secret = r => r.primary_bot ? env.BOT_TOKEN : decrypt(r.encrypted_token);
  const tokens = () => [env.BOT_TOKEN, ...db.prepare('SELECT * FROM shop_bots WHERE enabled=1 AND primary_bot=0').all().map(secret)].filter(Boolean);
  const safe = r => ({ id:r.id, username:r.username, name:r.name, theme:r.theme, priority:r.priority,
    description:r.description, shortDescription:r.short_description, enabled:!!r.enabled, primary:!!r.primary_bot,
    lastPoll:r.last_poll || null, error:r.error, emojiWarning:!!r.emoji_warning, appliedAt:r.applied_at || null,
    mainApp:!!r.main_app, customAvatarAt:db.prepare('SELECT updated_at FROM shop_bot_avatars WHERE bot_id=?').get(r.id)?.updated_at ?? null });
  function entries() {
    const {catalog} = state();
    const visible = catalog.products.filter(p => p.visible && catalog.groups.some(g => g.id === p.groupId && g.visible));
    const result = [
      ...['claude-kyc'].flatMap(id => visible.some(p=>p.id===id) ? [{key:'product:'+id,label:'Верификация Claude',kind:'product',id,icon:'claude',fallback:'🟠'}] : []),
      ...catalog.groups.filter(g=>g.visible).map(g=>({key:'group:'+g.id, label:g.id==='ai'?'Аккаунты нейросетей':g.id==='mail'?'Аккаунты почтовых сервисов':g.id==='claude'?'Аккаунты Claude':g.title,kind:'group',id:g.id,icon:g.id,fallback:g.id==='mail'?'✉️':g.id==='ai'?'✨':g.id==='claude'?'🟠':'▸'})),
    ];
    const first = ['product:claude-kyc','group:claude','group:ai','group:mail'];
    return result.sort((a,b)=>(first.includes(a.key)?first.indexOf(a.key):100)-(first.includes(b.key)?first.indexOf(b.key):100));
  }
  const list = () => ({ bots:db.prepare('SELECT * FROM shop_bots ORDER BY primary_bot DESC,created_at').all().map(safe),
    entries:entries().map(({key,label})=>({key,label})), presets:botPresets, encryptionReady:!!cipherKey });
  async function call(r, method, payload = {}, files) {
    // Shop bots only reply to private chats. This independent guard also blocks the requisites group.
    if ('chat_id' in payload && !/^[1-9]\d{0,15}$/.test(String(payload.chat_id)))
      bad('Отправка в группы запрещена',403);
    const botToken = secret(r);
    if (!botToken) bad('Токен бота недоступен');
    if (botCall) return botCall(botToken,method,payload,files);
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(()=>controller.abort(), method === 'getUpdates' ? 18000 : 30000);
    try {
      let body, headers;
      if (files) {
        body = new FormData();
        for (const [k,v] of Object.entries(payload)) body.set(k,typeof v === 'object'?JSON.stringify(v):String(v));
        for (const [k,v] of Object.entries(files)) body.set(k,new Blob([v.data],{type:v.type}),v.name);
      } else { body=JSON.stringify(payload);headers={'Content-Type':'application/json'}; }
      const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`,{method:'POST',body,headers,signal:controller.signal});
      const result = await res.json();
      if (!result.ok) {
        const error = new Error(String(result.description ?? 'Ошибка Telegram').split(botToken).join('[token]').slice(0,400));
        error.retryAfter = result.parameters?.retry_after; error.telegramCode = result.error_code; throw error;
      }
      return result.result;
    } catch (e) {
      if(e.telegramCode)throw e;
      throw new Error('Нет соединения с Telegram. Повторим автоматически.');
    } finally {clearTimeout(timer);controllers.delete(controller);}
  }
  function validate(input, old) {
    const theme = input.theme ?? old?.theme ?? 'general';
    if (!botPresets[theme]) bad('Выберите оформление');
    const p = botPresets[theme];
    const priority = input.priority ?? old?.priority ?? p.priority;
    if ((input.priority!==undefined || !old) && !entries().some(e=>e.key===priority)) bad('Выберите доступный первый раздел');
    if(input.enabled!==undefined && typeof input.enabled!=='boolean')bad('Проверьте переключатель бота');
    return { theme, priority, name:text(input.name ?? old?.name ?? p.name,64,'Название'),
      description:text(input.description ?? old?.description ?? p.description,512,'Описание'),
      shortDescription:text(input.shortDescription ?? old?.short_description ?? p.shortDescription,120,'Краткое описание'),
      enabled:input.enabled ?? !!(old?.enabled ?? 1) };
  }
  async function save(input, id) {
    const old = id ? row(id) : null;
    if(id && !old)bad('Бот не найден',404);
    if(!old && db.prepare('SELECT COUNT(*) AS n FROM shop_bots').get().n>=20)bad('Можно подключить до 20 ботов');
    const v=validate(input,old);
    if(!old) {
      const supplied = text(input.token,130,'Токен');
      if(!tokenPattern.test(supplied))bad('Проверьте токен из BotFather');
      if(supplied.split(':')[0]===gatewayId || supplied.split(':')[0]==='9089232910')bad('Бот реквизитов не участвует в меню магазина');
      const encrypted=encrypt(supplied),candidate={encrypted_token:encrypted,primary_bot:0};
      const me=await call(candidate,'getMe');
      if(!me.is_bot || String(me.id)!==supplied.split(':')[0])bad('Telegram не подтвердил бота');
      if(row(me.id))bad('Этот бот уже подключён. Откройте его настройки.');
      const webhook=await call(candidate,'getWebhookInfo');
      if(webhook.url)bad('У этого бота уже настроен webhook. Сначала отключите его у прежнего сервиса и подключите бота снова.');
      db.prepare(`INSERT INTO shop_bots(id,username,name,theme,priority,description,short_description,enabled,encrypted_token,created_at,enabled_at,main_app) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(String(me.id),me.username,v.name,v.theme,v.priority,v.description,v.shortDescription,Number(v.enabled),encrypted,now(),now(),Number(!!me.has_main_web_app));
      id=String(me.id);
    } else {
      db.prepare('UPDATE shop_bots SET name=?,theme=?,priority=?,description=?,short_description=?,enabled=?,enabled_at=?,animation_file=CASE WHEN theme<>? THEN \'\' ELSE animation_file END WHERE id=?')
        .run(v.name,v.theme,v.priority,v.description,v.shortDescription,Number(v.enabled),v.enabled&&!old.enabled?now():old.enabled_at,v.theme,id);
    }
    if(!stopped)launch(id);
    return safe(row(id));
  }
  function remove(id) {
    const r=row(id);if(!r)bad('Бот не найден',404);
    if(r.primary_bot)bad('Основного бота можно выключить, но нельзя удалить');
    db.prepare('DELETE FROM shop_bot_jobs WHERE bot_id=?').run(id);
    db.prepare('DELETE FROM shop_bot_avatars WHERE bot_id=?').run(id);
    db.prepare('DELETE FROM shop_bots WHERE id=?').run(id);
    return {ok:true};
  }
  let emojiManifest = {};
  async function asset(name) {
    if(!/^(general|claude)-(bot|menu|description)\.(mp4|jpg|gif)$/.test(name))bad('Файл оформления не найден');
    return readFile(resolve(assetsRoot,name));
  }
  async function apply(id) {
    const r=row(id);if(!r)bad('Бот не найден',404);
    const custom=avatar(id),data=custom?.data ?? await asset(r.theme+'-bot.mp4');
    await call(r,'setMyProfilePhoto',{photo:custom?{type:'static',photo:'attach://avatar'}:{type:'animated',animation:'attach://avatar',main_frame_timestamp:0}},{avatar:{data,type:custom?'image/jpeg':'video/mp4',name:custom?'avatar.jpg':'avatar.mp4'}});
    await call(r,'setMyName',{name:r.name});
    await call(r,'setMyDescription',{description:r.description});
    await call(r,'setMyShortDescription',{short_description:r.short_description});
    await call(r,'setMyCommands',{commands:[{command:'start',description:'Открыть каталог'},{command:'menu',description:'Выбрать раздел'},{command:'help',description:'Помощь менеджера'}]});
    await call(r,'setChatMenuButton',{menu_button:{type:'web_app',text:'Каталог',web_app:{url:origin()}}});
    db.prepare('UPDATE shop_bots SET applied_at=?,error=\'\' WHERE id=?').run(now(),id);
    return safe(row(id));
  }
  const origin = () => {
    const url=new URL(env.PUBLIC_ORIGIN || 'https://kyc.kraken892.rest');
    if(!['https:','http:'].includes(url.protocol))bad('Проверьте адрес магазина');
    return url.origin+'/';
  };
  function target(e) {
    const column=e.kind==='product'?'product_id':'group_id';
    let link=db.prepare(`SELECT token FROM links WHERE target_kind=? AND ${column}=? AND active=1 ORDER BY created_at LIMIT 1`).get(e.kind,e.id);
    if(!link){const code=token();db.prepare('INSERT INTO links(id,token,product_id,label,active,created_at,target_kind,group_id) VALUES(?,?,?,?,1,?,?,?)').run(token().slice(0,16),code,e.kind==='product'?e.id:'','Меню бота: '+e.label,now(),e.kind,e.kind==='group'?e.id:'');link={token:code};}
    return origin()+'?ref='+ (e.kind==='product'?'p_':'g_')+link.token;
  }
  function menu(r, requestedPage=0, premium=true, language='ru') {
    const localize=value=>translate(value,language);
    const items=entries(), index=items.findIndex(e=>e.key===r.priority);
    if(index>0)items.unshift(...items.splice(index,1));
    const pages=Math.max(1,Math.ceil(items.length/4)),page=Math.max(0,Math.min(pages-1,requestedPage));
    const decorate=(button, icon, fallback) => ({...button,text:localize(button.text),...(premium&&emojiManifest[icon]?.id?{icon_custom_emoji_id:emojiManifest[icon].id}:{text:(fallback?fallback+' ':'')+localize(button.text)})});
    const keyboard=items.slice(page*4,page*4+4).map(e=>[decorate({text:e.label,web_app:{url:target(e)}},e.icon,e.fallback)]);
    const nav=[];
    if(page>0)nav.push(decorate({text:'Назад',callback_data:'menu:'+(page-1),style:'success'},'back','←'));
    if(page<pages-1)nav.push(decorate({text:'Далее',callback_data:'menu:'+(page+1),style:'success'},'next','→'));
    if(nav.length)keyboard.push(nav);
    keyboard.push([decorate({text:'Весь каталог',web_app:{url:origin()},style:'success'},'catalog','🟢')]);
    const current=state();
    const support=current.shop?.supportTelegram || current.settings.sellerUsername || 'tcmai';
    keyboard.push([decorate({text:'Change language',callback_data:'language:choose'},'language','🌐')]);
    keyboard.push([decorate({text:'Помощь менеджера',url:'https://t.me/'+support.replace(/^@/,'')},'support','👤')]);
    const caption = r.theme==='claude'
      ? '<b>Claude · верификация и аккаунты</b>\n\n<blockquote><b>Всё для вашего Claude</b>\nВерификация на вашем аккаунте или готовый аккаунт — выберите подходящую услугу.</blockquote>\n\nУсловия и стоимость — в каталоге.\n<b>Выберите услугу ниже ↓</b>'
      : '<b>фиКУС · цифровые сервисы</b>\n\n<blockquote><b>Верификация и готовые аккаунты</b>\nClaude, нейросети и почтовые сервисы — в одном каталоге.</blockquote>\n\nУсловия и стоимость — в карточке услуги.\n<b>Выберите раздел ниже ↓</b>';
    return {caption:localize(caption)+`\n${page+1} / ${pages}`,parse_mode:'HTML',reply_markup:{inline_keyboard:keyboard}};
  }
  async function reply(r, update, premium=true) {
    const cb=update.callback_query,msg=cb?.message ?? update.message;
    if(!msg || msg.chat?.type!=='private' || !Number.isSafeInteger(msg.chat.id) || msg.chat.id<=0 || (cb?.from ?? msg.from)?.is_bot)return;
    if(cb && cb.from?.id!==msg.chat.id)return;
    if(await restocks?.handle(r,update))return;
    const chosen=languageChoices.get(msg.chat.id);
    let language=chosen?.language??telegramLanguage((cb?.from??msg.from)?.language_code);
    const command=(msg.text ?? '').match(/^\/(start|menu|help)(?:@[a-z0-9_]+)?(?:\s|$)/i);
    if(!cb&&!command)return;
    if(cb&&!/^(?:menu:\d{1,3}|language:(?:choose|ru|en|zh))$/.test(cb.data ?? ''))return;
    if(cb?.data==='language:choose'){
      const picker={text:'🌿 фиКУС\n\nВыберите язык меню\nChoose your language\n请选择语言',reply_markup:{inline_keyboard:[[{text:'Русский',callback_data:'language:ru'}],[{text:'English',callback_data:'language:en'}],[{text:'中文',callback_data:'language:zh'}]]}};
      await call(r,'sendMessage',{chat_id:msg.chat.id,...picker});if(cb)await call(r,'answerCallbackQuery',{callback_query_id:cb.id}).catch(()=>{});return;
    }
    if(cb?.data?.match(/^language:(ru|en|zh)$/)){language=cb.data.split(':')[1];languageChoices.set(msg.chat.id,language);}

    if(command?.[1].toLowerCase()==='help') {
      const help=menu(r,0,premium,language);await call(r,'sendMessage',{chat_id:msg.chat.id,text:translate('Поможем выбрать услугу и ответим на вопросы. Напишите менеджеру:',language),reply_markup:{inline_keyboard:[help.reply_markup.inline_keyboard.at(-1)]}});return;
    }
    const languageSelected=cb?.data?.startsWith('language:');
    const content=menu(r,cb&&!languageSelected?Number(cb.data.split(':')[1]):0,premium,language);
    try {
      if(cb&&!languageSelected) {
        await call(r,'editMessageCaption',{chat_id:msg.chat.id,message_id:msg.message_id,...content});
      } else {
        const animation=r.animation_file || 'attach://menu';
        const files=r.animation_file?undefined:{menu:{data:await asset(r.theme+'-menu.mp4'),type:'video/mp4',name:'menu.mp4'}};
        const sent=await call(r,'sendAnimation',{chat_id:msg.chat.id,animation,width:640,height:360,...content},files);
        if(sent?.animation?.file_id&&!stopped)db.prepare('UPDATE shop_bots SET animation_file=? WHERE id=?').run(sent.animation.file_id,r.id);
      }
    } catch(e) {
      if(/message is not modified/i.test(e.message))return;
      if(premium&&/emoji|premium|icon_custom/i.test(e.message)) {
        db.prepare('UPDATE shop_bots SET emoji_warning=1 WHERE id=?').run(r.id);
        return reply(r,update,false);
      }
      throw e;
    } finally {if(cb)await call(r,'answerCallbackQuery',{callback_query_id:cb.id}).catch(()=>{});}
  }
  function accept(r, update) {
    const msg=update.message??update.callback_query?.message??update.my_chat_member;
    if(msg?.chat?.type!=='private'||msg.chat.id<=0)return;
    const at=(update.callback_query?now():Number(msg.date)*1000);
    if(!Number.isFinite(at)||at+1000<r.enabled_at)return;
    restocks?.observe(r,update);
    if(update.my_chat_member)return;
    db.prepare('INSERT OR IGNORE INTO shop_bot_jobs(bot_id,update_id,payload) VALUES(?,?,?)').run(r.id,update.update_id,JSON.stringify(update));
  }
  async function drain(r) {
    const jobs=db.prepare("SELECT * FROM shop_bot_jobs WHERE bot_id=? AND status='pending' AND next_at<=? ORDER BY update_id LIMIT 12").all(r.id,now());
    for(const job of jobs) {
      if(stopped)return;
      try {await reply(r,JSON.parse(job.payload),!r.emoji_warning);if(stopped)return;db.prepare("UPDATE shop_bot_jobs SET status='done',payload='{}' WHERE bot_id=? AND update_id=?").run(r.id,job.update_id);}
      catch(e){
        if(stopped)return;
        if([400,403].includes(e.telegramCode) || job.attempts>=8) {
          db.prepare("UPDATE shop_bot_jobs SET status='failed',payload='{}' WHERE bot_id=? AND update_id=?").run(r.id,job.update_id);
        } else {
          const delay=Math.max(Number(e.retryAfter)||0,Math.min(300,2**Math.min(job.attempts+1,8)));
          db.prepare('UPDATE shop_bot_jobs SET attempts=attempts+1,next_at=? WHERE bot_id=? AND update_id=?').run(now()+delay*1000,r.id,job.update_id);
        }
        db.prepare('UPDATE shop_bots SET error=? WHERE id=?').run(String(e.message).slice(0,400),r.id);
      }
    }
    db.prepare("DELETE FROM shop_bot_jobs WHERE bot_id=? AND status='done' AND update_id<?").run(r.id,r.offset-1000);
  }
  const pause = (id,ms) => new Promise(resolve=>{const timer=setTimeout(()=>{retryTimers.delete(id);resolve();},ms);retryTimers.set(id,{timer,resolve});});
  async function loop(id) {
    try {
      let checked=false;
      while(!stopped) {
        const r=row(id);if(!r?.enabled)return;
        try {
          if(!checked) {
            const hook=await call(r,'getWebhookInfo');if(stopped)return;
            if(hook.url)throw new Error('У бота включён webhook другого сервиса. Отключите его перед запуском меню.');
            const me=await call(r,'getMe');if(stopped)return;
            db.prepare('UPDATE shop_bots SET username=?,main_app=? WHERE id=?').run(me.username,Number(!!me.has_main_web_app),id);checked=true;
          }
          await drain(r);if(stopped)return;
          const updates=await call(r,'getUpdates',{offset:r.offset,timeout:8,limit:30,allowed_updates:['message','callback_query','my_chat_member']});
          if(stopped)return;
          const current=row(id);if(!current?.enabled)return;
          db.exec('BEGIN IMMEDIATE');
          try {
            for(const u of updates)accept(current,u);
            const offset=updates.length?Math.max(current.offset,...updates.map(u=>u.update_id+1)):current.offset;
            db.prepare("UPDATE shop_bots SET offset=?,last_poll=?,error='' WHERE id=?").run(offset,now(),id);db.exec('COMMIT');
          }catch(e){db.exec('ROLLBACK');throw e;}
          await drain(row(id));
        } catch(e) {
          if(stopped)return;
          db.prepare('UPDATE shop_bots SET error=? WHERE id=?').run(String(e.message).slice(0,400),id);
          await pause(id,Math.max(5000,(Number(e.retryAfter)||0)*1000,/409|Conflict|webhook/i.test(e.message)?30000:0));
        }
      }
    } finally {loops.delete(id);}
  }
  function launch(id) {if(!stopped&&!loops.has(id)&&row(id)?.enabled)loops.set(id,loop(id));}
  async function start() {
    if(!stopped)return;stopped=false;
    const ids=db.prepare('SELECT id FROM shop_bots WHERE enabled=1').all();
    if(!ids.length)return;
    try {emojiManifest=JSON.parse(await readFile(resolve(assetsRoot,'emoji-manifest.json'),'utf8'));}catch{}
    if(stopped)return;
    for(const r of ids)launch(r.id);
  }
  function stop() {stopped=true;for(const c of controllers)c.abort();for(const {timer,resolve} of retryTimers.values()){clearTimeout(timer);resolve();}retryTimers.clear();}
  function avatar(id){return db.prepare('SELECT data,updated_at FROM shop_bot_avatars WHERE bot_id=?').get(id);}
  function saveAvatar(id,data){if(!row(id))bad('Бот не найден',404);const info=imageInfo(data);if(info.mime!=='image/jpeg'||info.width!==info.height)bad('Аватар должен быть квадратным JPG');db.prepare('INSERT INTO shop_bot_avatars VALUES(?,?,?) ON CONFLICT(bot_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(id,data,now());return safe(row(id));}
  function resetAvatar(id){if(!row(id))bad('Бот не найден',404);db.prepare('DELETE FROM shop_bot_avatars WHERE bot_id=?').run(id);return safe(row(id));}
  function proof(initData) {
    for(const bot of db.prepare('SELECT * FROM shop_bots WHERE enabled=1').all()) {
      const user=telegramUser(initData,secret(bot));if(user)return {bot,user};
    }
    return null;
  }
  return {list,save,remove,apply,tokens,start,stop,menu,reply,accept,call,drain,avatar,saveAvatar,resetAvatar,proof,
    productUrl(id){return target({kind:'product',id,label:state().catalog.products.find(p=>p.id===id)?.title ?? id});},setRestocks(value){restocks=value;},
    setEmojiManifest(value){emojiManifest=value;},getRow:row};
}
