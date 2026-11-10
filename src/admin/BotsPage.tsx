import { useEffect, useState } from 'react';
import { Bot, Download, ExternalLink, Plus, Save, Palette } from 'lucide-react';
import { api, mutation } from '../api';
import { SectionHeading, Toggle, dateTime } from './shared';
import { uploadBotAvatar } from './bot-avatar-upload';
type Theme = 'general' | 'claude';
interface BotProfile { id:string;username:string;name:string;theme:Theme;priority:string;description:string;shortDescription:string;enabled:boolean;primary:boolean;lastPoll:number|null;error:string;emojiWarning:boolean;appliedAt:number|null;mainApp:boolean;customAvatarAt:number|null }
interface Draft { token?:string;name:string;theme:Theme;priority:string;description:string;shortDescription:string;enabled:boolean }
interface Data { bots:BotProfile[];entries:{key:string;label:string}[];presets:Record<Theme,Omit<Draft,'theme'|'enabled'>>;encryptionReady:boolean }
const asset = (name:string) => '/branding/telegram/'+name;
export function BotsPage() {
  const [data,setData]=useState<Data|null>(null),[editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState<Draft|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function load(){setData(await api<Data>('/admin/bots'));}
  useEffect(()=>{void load().catch(e=>setError(e.message));const timer=setInterval(()=>void load().catch(()=>{}),15000);return()=>clearInterval(timer);},[]);
  async function action(work:()=>Promise<unknown>,message:string){setBusy(true);setError('');setNotice('');try{await work();await load();setNotice(message);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
  function open(bot?:BotProfile){if(!data)return;setEditing(bot?.id??'new');setDraft(bot?{name:bot.name,theme:bot.theme,priority:bot.priority,description:bot.description,shortDescription:bot.shortDescription,enabled:bot.enabled}:{...data.presets.general,theme:'general',enabled:true,token:''});setError('');setNotice('');}
  return <div className="a-form a-settings-form">
    <section className="a-link-intro"><span className="a-link-intro-icon"><Bot size={26}/></span><div><h2>Разные боты — один фиКУС</h2><p>Настройте оформление и первый раздел для каждой воронки. Каталог, покупки и баланс остаются общими.</p></div></section>
    {error&&<div className="a-error" role="alert">{error}</div>}{notice&&<div className="a-hint" role="status">{notice}</div>}
    <div className="a-bots-toolbar"><button className="a-btn" disabled={busy||!data?.encryptionReady} onClick={()=>open()}><Plus size={17}/>Подключить бота</button><a className="a-btn secondary" href={asset('fikus-telegram-branding.zip')} download><Download size={17}/>Скачать всё оформление</a></div>
    {data&&!data.encryptionReady&&<p className="a-hint">Для дополнительных ботов настройте BOTS_ENCRYPTION_KEY на сервере.</p>}
    <div className="a-settings-grid">{data?.bots.map(bot=><section className="a-card a-bot-card" key={bot.id}>
      <div className="a-bot-identity"><img src={bot.customAvatarAt?'/api/admin/bots/'+bot.id+'/avatar?t='+bot.customAvatarAt:asset(bot.theme+'-bot.jpg')} alt="Аватар бота"/><div><h3>{bot.name}</h3><a href={'https://t.me/'+bot.username} target="_blank" rel="noreferrer">@{bot.username}<ExternalLink size={13}/></a><small>{bot.primary?'Основной бот':'Дополнительный бот'} · {bot.theme==='claude'?'Claude':'Общее оформление'}</small></div></div>
      <div className="a-setting-line"><span><b>Меню бота</b><small>{bot.enabled?'Отвечает на «Старт» и /menu':'Выключено'}</small></span><Toggle checked={bot.enabled} label={'Включить меню @'+bot.username} onChange={enabled=>void action(()=>mutation('/admin/bots/'+bot.id,'PATCH',{enabled}),'Состояние бота сохранено')}/></div>
      <p>Первым: <b>{data.entries.find(e=>e.key===bot.priority)?.label??'Выберите раздел'}</b></p>
      <p className="a-bot-status">{bot.lastPoll?'Связь: '+dateTime(new Date(bot.lastPoll).toISOString()):'Ожидаем подключения к Telegram'}</p>
      {bot.error&&<p className="a-error">{bot.error}</p>}{bot.emojiWarning&&<p className="a-hint">Telegram не разрешил премиум-эмодзи. Меню работает с обычными значками. Для премиум-значков владельцу бота нужна Telegram Premium или дополнительный username из Fragment.</p>}
      <div className="a-bots-toolbar"><button className="a-btn secondary" disabled={busy} onClick={()=>open(bot)}><Palette size={16}/>Настроить</button><button className="a-btn" disabled={busy} onClick={()=>void action(()=>mutation('/admin/bots/'+bot.id+'/branding','POST',{}),'Аватар, тексты, команды и кнопка каталога обновлены')}><Save size={16}/>Применить оформление</button></div>
      {bot.appliedAt&&<small>Оформление обновлено {dateTime(new Date(bot.appliedAt).toISOString())}</small>}
      {!bot.mainApp&&<p className="a-hint">Чтобы каталог появился и в профиле бота, включите Main Mini App в BotFather с адресом {window.location.origin}/. Кнопки меню уже открывают приложение.</p>}
    </section>)}</div>
    {draft&&data&&<section className="a-card"><SectionHeading title={editing==='new'?'Подключить нового бота':'Настройки бота'} description="Сначала сохраните настройки, затем примените оформление"/><form onSubmit={async e=>{e.preventDefault();if(await action(()=>mutation(editing==='new'?'/admin/bots':'/admin/bots/'+editing,editing==='new'?'POST':'PATCH',draft),'Настройки сохранены')){setDraft(null);setEditing(null);}}}>
      {editing==='new'&&<label>Токен из BotFather<input aria-label="Токен из BotFather" type="password" autoComplete="new-password" value={draft.token??''} onChange={e=>setDraft({...draft,token:e.target.value.trim()})} required maxLength={130}/><small>Токен сохраняется в зашифрованном виде и больше не показывается. Используйте отдельного бота без подключения к другому сервису.</small></label>}
      <div className="a-settings-grid"><label>Оформление<select aria-label="Оформление" value={draft.theme} onChange={e=>{const theme=e.target.value as Theme;setDraft({...draft,...data.presets[theme],theme});}}><option value="general">фиКУС · зелёное</option><option value="claude">Claude · оранжевые акценты</option></select></label><label>Первый раздел<select aria-label="Первый раздел" value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value})}>{data.entries.map(e=><option key={e.key} value={e.key}>{e.label}</option>)}</select></label></div>
      <label>Название бота<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} maxLength={64} required/></label>
      <label>Описание до нажатия «Старт»<textarea rows={4} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} maxLength={512} required/></label>
      <label>Краткое описание профиля<textarea rows={2} value={draft.shortDescription} onChange={e=>setDraft({...draft,shortDescription:e.target.value})} maxLength={120} required/></label>
      {editing!=='new'&&<label>Свой аватар бота<input type="file" aria-label="Свой аватар бота" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';if(file&&editing)void action(()=>uploadBotAvatar(editing,file),'Аватар загружен. Примените оформление после сохранения.');}}/><small>PNG, JPG или WebP до 12 МБ. Изображение поместится в квадрат без обрезки. Без загрузки используется готовый анимированный аватар выбранной темы.</small>{data.bots.find(b=>b.id===editing)?.customAvatarAt&&<button className="a-btn secondary" type="button" disabled={busy} onClick={()=>void action(()=>mutation('/admin/bots/'+editing+'/avatar','DELETE',{}),'Возвращён аватар выбранной темы. Примените оформление.')}>Вернуть аватар темы</button>}</label>}
      <div className="a-bots-toolbar"><button className="a-btn" disabled={busy}><Save size={17}/>Сохранить настройки</button><button type="button" className="a-btn secondary" disabled={busy} onClick={()=>setDraft(null)}>Закрыть</button></div>
    </form></section>}
    <section className="a-card"><SectionHeading title="Графика и анимация" description="Общая версия и оформление под Claude"/>
      <p>Анимацию в блоке описания Telegram позволяет загрузить через BotFather: /mybots → ваш бот → Edit Bot → Edit Description Picture. Скачайте GIF нужной версии ниже. Личную аватарку оператора установите в его профиле Telegram.</p>
      <div className="a-settings-grid">{(['general','claude'] as const).map(theme=><div key={theme} className="a-bot-assets"><h3>{theme==='general'?'фиКУС':'Claude'}</h3><video src={asset(theme+'-description.mp4')} autoPlay loop muted playsInline controls/><div className="a-bots-toolbar"><a href={asset(theme+'-description.gif')} download>Описание · GIF</a><a href={asset(theme+'-description.mp4')} download>Описание · MP4</a><a href={asset(theme+'-bot.mp4')} download>Аватар бота · MP4</a><a href={asset(theme+'-operator.jpg')} download>Оператор · JPG</a><a href={asset(theme+'-operator.mp4')} download>Оператор · MP4</a></div></div>)}</div>
      <p className="a-hint">Telegram поддерживает зелёные, синие и красные кнопки. Для Claude используются оранжевые значки и графика, для общих действий — зелёные кнопки. Меню отвечает только в личных чатах.</p>
    </section>
  </div>;
}
