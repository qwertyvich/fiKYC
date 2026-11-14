import { randomUUID } from 'node:crypto';
import { parseTopupAmount } from '../../src/wallet-domain.ts';
import { EventEmitter } from 'node:events';
import { parseFeed, requisiteRecord } from './parser.mjs';
import { migratePurchaseStats, recordPurchase } from '../purchase-stats.mjs';
import { bootstrapRequisites } from './bootstrap.mjs';
import { createCardProvider, createProviderRegistry } from './providers.mjs';
import {usdTotalMinor,rubTotalMinor,rateMinor,usdtNetworks} from '../../src/usdt.ts';

export const PAYMENT_TTL = 15 * 60_000;
const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export function createGateway({ db, env, state, now = Date.now, botCall }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gateway_config(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gateway_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gateway_cards(number TEXT PRIMARY KEY,bank TEXT NOT NULL,holder TEXT NOT NULL,min_minor INTEGER NOT NULL,max_minor INTEGER NOT NULL,active INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,visitor_id TEXT NOT NULL,telegram_id TEXT NOT NULL,items TEXT NOT NULL,note TEXT NOT NULL,amount_minor INTEGER NOT NULL,currency TEXT NOT NULL,provider TEXT NOT NULL,status TEXT NOT NULL,card TEXT,card_version INTEGER,expires_at INTEGER,created_at INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT '',retry_of TEXT UNIQUE,receipt_token TEXT UNIQUE,paid_at INTEGER);
    CREATE INDEX IF NOT EXISTS payments_visitor ON payments(visitor_id,created_at);
    CREATE TABLE IF NOT EXISTS gateway_outbox(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payment_id TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS gateway_receipts(id TEXT PRIMARY KEY,payment_id TEXT NOT NULL,file_id TEXT NOT NULL,kind TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(payment_id,file_id));
    CREATE TABLE IF NOT EXISTS gateway_receipt_files(id TEXT PRIMARY KEY,data BLOB NOT NULL,mime TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gateway_inbox(update_id INTEGER PRIMARY KEY,message_id INTEGER,sender_id TEXT,sender_username TEXT,event_at INTEGER,received_at INTEGER NOT NULL,outcome TEXT NOT NULL,text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wallet_ledger(payment_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,currency TEXT NOT NULL CHECK(currency='RUB'),amount_minor INTEGER NOT NULL CHECK(amount_minor>0),created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS wallet_ledger_owner ON wallet_ledger(owner_id,created_at);
    CREATE TABLE IF NOT EXISTS sbp_intents(payment_id TEXT PRIMARY KEY,external_id TEXT UNIQUE,method_code TEXT NOT NULL,method_id TEXT NOT NULL,snapshot TEXT NOT NULL DEFAULT '{}',phase TEXT NOT NULL DEFAULT 'creating',error TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL,next_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS gateway_bindings(telegram_id TEXT PRIMARY KEY,payment_id TEXT NOT NULL);
  `);
  const paymentColumns = db.prepare('PRAGMA table_info(payments)').all().map(c => c.name);
  if (!paymentColumns.includes('purpose')) db.exec("ALTER TABLE payments ADD COLUMN purpose TEXT NOT NULL DEFAULT 'order'");
  if (!paymentColumns.includes('request_key')) db.exec('ALTER TABLE payments ADD COLUMN request_key TEXT');
  if (!paymentColumns.includes('crypto')) db.exec('ALTER TABLE payments ADD COLUMN crypto TEXT');
  if (!paymentColumns.includes('crypto_reported_at')) db.exec('ALTER TABLE payments ADD COLUMN crypto_reported_at INTEGER');
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS payment_request_key ON payments(visitor_id,purpose,request_key) WHERE request_key IS NOT NULL");
  const cardColumns=db.prepare('PRAGMA table_info(gateway_cards)').all().map(c=>c.name);
  if(!cardColumns.includes('kind'))db.exec("ALTER TABLE gateway_cards ADD COLUMN kind TEXT NOT NULL DEFAULT 'card'");
  if(!cardColumns.includes('account'))db.exec("ALTER TABLE gateway_cards ADD COLUMN account TEXT NOT NULL DEFAULT ''");
  migratePurchaseStats(db,now());
  const defaults = { enabled: true, sourceChatId: '-1002278926769', sourceSender: '@feweqw34234_bot', receiptRecipient: '@tcmai', botUsername: 'GatewayReqBot' };
  db.prepare('INSERT OR IGNORE INTO gateway_config VALUES(1,?)').run(JSON.stringify(defaults));
  const config = () => ({ ...defaults, ...JSON.parse(db.prepare('SELECT json FROM gateway_config WHERE id=1').get().json) });
  const meta = (k) => db.prepare('SELECT value FROM gateway_meta WHERE key=?').get(k)?.value;
  const setMeta = (k, v) => db.prepare('INSERT INTO gateway_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
  // Correct the legacy fallback reason when no source details had ever arrived.
  if (!meta('lastFeedAt') && !db.prepare('SELECT number FROM gateway_cards WHERE active=1 LIMIT 1').get()) db.prepare("UPDATE payments SET reason='source_unseen' WHERE status='manual_review' AND reason='limits'").run();
  const events = new EventEmitter();
  events.setMaxListeners(500);
  let lastPoll = 0, connected = false, closed = false, worker = null, flushing = false;
  const checkpoint = Number(meta('lastPollAt') ?? 0);
  if (!checkpoint || now() - checkpoint >= 23 * 3600_000) db.prepare('UPDATE gateway_cards SET active=0,version=version+1 WHERE active=1').run();
  const recipient = () => /^-?\d+$/.test(config().receiptRecipient) ? config().receiptRecipient : meta('recipientId');
  const healthy = () => connected && now() - lastPoll < 8_000;
  const ready = () => config().enabled && !!env.GATEWAY_BOT_TOKEN && healthy();
  const bootstrapOpen = () => !Number(meta('bootstrapExpiresAt') ?? 0) || now() < Number(meta('bootstrapExpiresAt'));
  const issuable = () => ready() && bootstrapOpen();
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const queue = (kind, paymentId, payload, id = randomUUID()) => db.prepare('INSERT OR IGNORE INTO gateway_outbox(id,kind,payment_id,payload) VALUES(?,?,?,?)').run(id, kind, paymentId, JSON.stringify(payload));
  function invalidate(reason, number = null, predicate = () => true) {
    const rows = db.prepare("SELECT * FROM payments WHERE provider IN ('telegram-card','card') AND status='awaiting_transfer'" + (number ? ' AND card=?' : '')).all(...(number ? [number] : []));
    for (const p of rows.filter(predicate)) {
      db.prepare("UPDATE payments SET status='invalidated',reason=? WHERE id=?").run(reason, p.id);

    }
  }
  function disconnect(reason = 'connection_lost') {
    connected = false;
    transaction(() => { invalidate(reason); });
    events.emit('change');
  }
  // Persisted cards are never assumed current after a restart.
  disconnect('restart');
  const providers = createProviderRegistry([createCardProvider({ db, available: issuable })]);
  function saveConfig(input) {
    const c = { ...config(), ...input };
    if (typeof c.enabled !== 'boolean' || !/^-100\d{5,20}$/.test(c.sourceChatId ?? '') || !/^(?:@?[a-zA-Z][a-zA-Z0-9_]{4,31}|\d{1,20})$/.test(c.sourceSender ?? '') || !/^(?:@?[a-zA-Z][a-zA-Z0-9_]{4,31}|-?\d{1,20})$/.test(c.receiptRecipient ?? '') || !/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(c.botUsername ?? '')) error('Проверьте чат, отправителя и получателя квитанций');
    if (c.receiptRecipient === c.sourceChatId) error('Чат с реквизитами доступен только для чтения. Выберите отдельного получателя квитанций.');
    const old = config();
    transaction(() => {
      db.prepare('UPDATE gateway_config SET json=? WHERE id=1').run(JSON.stringify(Object.fromEntries(Object.keys(defaults).map(k => [k, c[k]]))));
      if (old.receiptRecipient !== c.receiptRecipient) db.prepare("DELETE FROM gateway_meta WHERE key='recipientId'").run();
      if (!c.enabled || old.sourceSender !== c.sourceSender || old.sourceChatId !== c.sourceChatId) db.prepare("UPDATE gateway_outbox SET status='cancelled' WHERE kind='source' AND status='pending'").run();
      if (old.sourceSender !== c.sourceSender) db.prepare("DELETE FROM gateway_meta WHERE key='senderId'").run();
    });
    if (old.enabled !== c.enabled || old.sourceChatId !== c.sourceChatId || old.sourceSender !== c.sourceSender) disconnect('configuration_changed');
    events.emit('change');
    return admin();
  }
  function expire() {
    const r = db.prepare("UPDATE payments SET status='awaiting_receipt',reason='expired' WHERE status='awaiting_transfer' AND expires_at<=?").run(now());
    if (r.changes) events.emit('change');
  }
  function reconcile() {
    expire();
    for(const p of db.prepare("SELECT * FROM payments WHERE provider='usdt' AND status='awaiting_transfer'").all()) {
      const quote=JSON.parse(p.crypto),address=cryptoAddress(quote.network);
      if(!address||address!==quote.address)db.prepare("UPDATE payments SET status='invalidated',reason='wallet_changed' WHERE id=?").run(p.id);
    }
    const bootstrapExpiry = Number(meta('bootstrapExpiresAt') ?? 0);
    if (bootstrapExpiry && bootstrapExpiry <= now() && !db.prepare("SELECT id FROM payments WHERE provider IN ('telegram-card','card') AND status='awaiting_transfer' LIMIT 1").get()) {
      // Admission closes at the bootstrap deadline. Already issued transfers keep
      // their own 15-minute lease; explicit source stops still revoke immediately.
      const result = db.prepare('UPDATE gateway_cards SET active=0,version=version+1 WHERE active=1').run();
      if (result.changes) events.emit('change');
    }
    if (connected && !healthy()) disconnect();

  }
  function repairShortenedTimers() {
    const bootAt = Number(meta('bootstrapAt') ?? 0), cutoff = bootAt + PAYMENT_TTL;
    // Repair only the old bootstrap cap, never a source stop, receipt, retry or a
    // genuinely elapsed 15-minute transfer. Run after draining Telegram updates.
    if (!bootAt || meta('lastFeedAt')) return 0;
    if (!meta('bootstrapExpiresAt')) setMeta('bootstrapExpiresAt', cutoff);
    const candidates = db.prepare(`SELECT p.*,c.active AS card_active,c.version AS current_card_version
      FROM payments p JOIN gateway_cards c ON c.number=p.card
      WHERE p.created_at>=? AND p.created_at<? AND p.expires_at=? AND p.created_at+?>?
      AND p.expires_at<p.created_at+?
      AND (p.status='awaiting_transfer' OR (p.status='awaiting_receipt' AND p.reason='expired') OR (p.status='invalidated' AND p.reason='restart'))
      AND NOT EXISTS(SELECT 1 FROM gateway_receipts r WHERE r.payment_id=p.id)
      AND NOT EXISTS(SELECT 1 FROM payments child WHERE child.retry_of=p.id)`).all(bootAt,cutoff,cutoff,PAYMENT_TTL,now(),PAYMENT_TTL);
    let count = 0;
    transaction(() => {
      for (const p of candidates) {
        const unchanged = p.card_active && p.current_card_version === p.card_version;
        const legacyExpiry = !p.card_active && p.current_card_version === p.card_version + 1;
        if (!unchanged && !legacyExpiry) continue;
        db.prepare('UPDATE gateway_cards SET active=1 WHERE number=?').run(p.card);
        db.prepare("UPDATE payments SET status='awaiting_transfer',reason='',expires_at=?,card_version=? WHERE id=?").run(p.created_at+PAYMENT_TTL,p.current_card_version,p.id);
        db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run('payment.timer_cap_repaired:'+p.id,now());
        count++;
      }
    });
    return count;
  }
  function row(id) { return db.prepare('SELECT * FROM payments WHERE id=?').get(id); }
  function view(p) {
    reconcile(); p = row(p.id);
    const c = p.card && db.prepare('SELECT * FROM gateway_cards WHERE number=?').get(p.card);
    const show = p.status === 'awaiting_transfer' && ready() && c?.active && c.version === p.card_version && p.expires_at > now();
    const crypto=p.crypto?JSON.parse(p.crypto):null;
    const intent=p.provider==='sbp'?db.prepare('SELECT * FROM sbp_intents WHERE payment_id=?').get(p.id):null;
    const receiptJobs=p.provider==='sbp'?db.prepare('SELECT status,COUNT(*) n FROM sbp_receipt_jobs WHERE payment_id=? GROUP BY status').all(p.id):[];
    const qr=intent?{...JSON.parse(intent.snapshot),status:intent.phase,methodCode:intent.method_code,creating:!intent.external_id,error:!!intent.error}:p.provider==='sbp'?{status:p.status==='invalidated'?'failed':'creating',creating:p.status!=='invalidated'}:null;
    return { id: p.id, provider:p.provider,purpose: p.purpose, items: JSON.parse(p.items), amount: p.amount_minor / 100, currency: p.currency, status: p.status, reason: p.reason, createdAt: p.created_at, expiresAt: p.expires_at, serverNow: now(), requisitesType:c?.kind??'card', card: show ? { id:c.number, type:c.kind, number: c.account||c.number, bank: c.bank, holder: c.holder } : null,
      qr:qr?{...qr,receiptDelivery:receiptJobs.some(r=>r.status==='failed')?'failed':receiptJobs.some(r=>r.status==='pending')?'pending':receiptJobs.length?'sent':null,paymentUrl:['awaiting_transfer','receipt_review'].includes(p.status)&&(!p.expires_at||p.expires_at>now())?qr.paymentUrl??null:null}:null,
      crypto:crypto?{...crypto,address:p.status==='awaiting_transfer'?crypto.address:null,reportedAt:p.crypto_reported_at??null}:null,
      receiptCount: db.prepare('SELECT count(*) n FROM gateway_receipts WHERE payment_id=?').get(p.id).n, deliveryPending: !!db.prepare("SELECT id FROM gateway_outbox WHERE payment_id=? AND kind IN ('receipt','crypto_claim') AND status='pending'").get(p.id) };
  }
  function own(id, visitorId) { const p = row(id); if (!p || p.visitor_id !== visitorId) error('Заказ не найден', 404); return p; }
  function family(id) {
    let p = row(id);
    while (p?.retry_of) p = row(p.retry_of);
    const ids = []; while (p) { ids.push(p.id); p = db.prepare('SELECT * FROM payments WHERE retry_of=?').get(p.id); }
    return ids;
  }
  function freezeOtherAttempts(id) {
    for (const relatedId of family(id)) {
      if (relatedId !== id) {
        const related = row(relatedId);
        if (['awaiting_transfer','manual_review'].includes(related.status)) db.prepare("UPDATE payments SET status='invalidated',reason='receipt_on_related_attempt' WHERE id=?").run(relatedId);
      }
    }
  }
  function create(visitorId, telegramId, input) {
    const crypto=method(input)==='usdt';
    if (!crypto&&method(input)!=='sbp'&&input.accepted !== true) error('Подтвердите условия оплаты');
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100 || new Set(input.items.map(i => i?.productId)).size !== input.items.length) error('Проверьте состав заказа');
    if (typeof input.note !== 'string' || input.note.length > 1000) error('Комментарий — до 1000 символов');
    const catalog = state().catalog;
    const items = input.items.map(i => {
      const p = catalog.products.find(p => p.id === i?.productId && p.visible && catalog.groups.some(g => g.id === p.groupId && g.visible));
      if (!p || p.saleMode === 'request' || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > p.stock || !Number.isFinite(p.price) || p.price <= 0) error('Цена или наличие изменились. Обновите корзину.', 409);
      return { productId: p.id, title: p.title, quantity: i.quantity, price: p.price, currency: p.currency ?? 'RUB' };
    });
    const currencies = [...new Set(items.map(i => i.currency))];
    const settleRub=(input.method==='card'&&input.settlementCurrency==='RUB')||input.method==='sbp';
    if (!crypto&&!settleRub&&currencies.length !== 1) error('Для товаров в разных валютах оформите отдельные заказы');
    const amountMinor = crypto?usdTotalMinor(items,cryptoRate()):settleRub?rubTotalMinor(items,cryptoRate()):items.reduce((s, i) => s + Math.round(i.price * 100) * i.quantity, 0);
    if(crypto&&input.expectedRate!==cryptoRate())error('Курс изменился. Обновите сумму оплаты.',409);
    if(settleRub&&items.some(i=>i.currency==='USD')&&input.expectedRate!==cryptoRate())error('Курс изменился. Обновите сумму оплаты.',409);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 100_000_000_00) error('Проверьте сумму заказа');
    if (typeof input.expectedAmount !== 'number' || Math.round(input.expectedAmount * 100) !== amountMinor) error('Стоимость изменилась. Обновите корзину и проверьте сумму.', 409);
    reconcile();
    const existing = db.prepare("SELECT * FROM payments WHERE visitor_id=? AND purpose='order' AND (status IN ('awaiting_transfer','awaiting_receipt','receipt_review','manual_review') OR (provider='sbp' AND status='invalidated' AND created_at>?)) ORDER BY created_at DESC").all(visitorId,now()-48*3600000).find(p => p.items === JSON.stringify(items) && p.note === input.note.trim());
    if (existing) return view(existing);
    return transaction(() => method(input)==='sbp'?issueSbp(visitorId,telegramId,items,input.note.trim(),amountMinor):crypto?issueCrypto(visitorId,telegramId,items,input.note.trim(),amountMinor,input.network):issue(visitorId, telegramId, items, input.note.trim(), amountMinor, settleRub?'RUB':currencies[0]));
  }
  function wallet(ownerId) {
    const total = db.prepare("SELECT COALESCE(sum(amount_minor),0) amount FROM wallet_ledger WHERE owner_id=? AND currency='RUB'").get(ownerId).amount;
    if (!Number.isSafeInteger(total)) error('Не удалось отобразить баланс. Обратитесь к менеджеру.', 500);
    return {currency:'RUB', balance:total/100, entries:db.prepare('SELECT payment_id AS paymentId,amount_minor,created_at AS createdAt FROM wallet_ledger WHERE owner_id=? ORDER BY created_at DESC LIMIT 20').all(ownerId).map(e=>({paymentId:e.paymentId,amount:e.amount_minor/100,createdAt:e.createdAt}))};
  }
  function createTopup(ownerId, telegramId, input) {
    const crypto=method(input)==='usdt';
    if (!crypto&&method(input)!=='sbp'&&input.accepted !== true) error('Подтвердите условия пополнения');
    if (input.currency !== undefined && input.currency !== (crypto?'USD':'RUB')) error(crypto?'Проверьте валюту пополнения':'Пополнение на карту доступно в рублях');
    if (typeof input.requestKey !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.requestKey)) error('Обновите форму пополнения и повторите попытку');
    const requestKey = input.requestKey.toLowerCase();
    const minor = parseTopupAmount(input.amount);
    const creditMinor=crypto?Math.round(minor*rateMinor(cryptoRate())/100):minor;
    if(crypto&&(input.expectedRate!==cryptoRate()||creditMinor<1||creditMinor>100000000))error('Проверьте курс и сумму пополнения',409);
    reconcile();
    return transaction(() => {
      const existing = db.prepare("SELECT * FROM payments WHERE visitor_id=? AND purpose='topup' AND request_key=?").get(ownerId,requestKey);
      if (existing) {
        if(existing.amount_minor!==minor)error('Сумма изменилась. Откройте новое пополнение.',409);
        if((existing.provider==='usdt')!==crypto||(input.method==='sbp'&&existing.provider!=='sbp'))error('Способ оплаты изменился. Откройте новое пополнение.',409);
        return view(existing);
      }
      const items=[{productId:'__wallet_topup__',title:'Пополнение баланса',quantity:1,price:creditMinor/100,currency:'RUB'}];
      return method(input)==='sbp'?issueSbp(ownerId,telegramId,items,'',minor,null,'topup',requestKey):crypto?issueCrypto(ownerId,telegramId,items,'',minor,input.network,null,'topup',requestKey,{rubCreditMinor:creditMinor}):issue(ownerId,telegramId,items,'',minor,'RUB',null,'topup',requestKey);
    });
  }
  function issue(visitorId, telegramId, items, note, amountMinor, currency, retryOf = null, purpose = 'order', requestKey = null) {
    const chosen = providers.choose({ amountMinor, currency });
    const id = 'FK-' + randomUUID().slice(0, 12).toUpperCase();
    const reason = chosen ? '' : !ready() ? 'gateway_unavailable' : !bootstrapOpen() ? 'source_confirmation_expired' : currency !== 'RUB' ? 'currency' : !db.prepare('SELECT number FROM gateway_cards WHERE active=1 LIMIT 1').get() ? (meta('lastFeedAt') ? 'source_stopped' : 'source_unseen') : 'limits';
    db.prepare('INSERT INTO payments(id,visitor_id,telegram_id,items,note,amount_minor,currency,provider,status,card,card_version,expires_at,created_at,reason,retry_of,receipt_token,purpose,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, visitorId, telegramId ?? '', JSON.stringify(items), note, amountMinor, currency, chosen?.provider.id ?? 'manual', chosen ? 'awaiting_transfer' : 'manual_review', chosen?.card.number ?? null, chosen?.card.version ?? null, chosen ? now() + PAYMENT_TTL : null, now(), reason, retryOf, randomUUID().replaceAll('-', ''),purpose,requestKey);
    if (!chosen) queue('manual', id, { text: `Нужна помощь с оплатой · ${id}\nСумма: ${amountMinor / 100} ${currency}\nПокупатель Telegram ID: ${telegramId || 'не определён'}\n${items.map(i => `${i.title} × ${i.quantity}`).join('\n')}\nКомментарий: ${note || '—'}\nПричина: ${{gateway_unavailable: 'Автоматическая выдача сейчас недоступна', currency: 'Нужно согласовать валюту и способ оплаты', limits: 'Нет карты с подходящими лимитами', source_unseen: 'Ещё не получено объявление реквизитов из источника', source_stopped: 'Источник остановил реквизиты', source_confirmation_expired: 'Срок начальной проверки истёк. Нужны новые реквизиты источника или подтверждение владельца'}[reason]}` }, 'manual:' + id);
    return view(row(id));
  }
  function issueSbp(visitorId,telegramId,items,note,amountMinor,retryOf=null,purpose='order',requestKey=null){
    if(providers.choose({amountMinor,currency:'RUB'}))error('Реквизиты снова доступны. Выберите перевод по реквизитам.',409);
    const id='FK-'+randomUUID().slice(0,12).toUpperCase();
    db.prepare("INSERT INTO payments(id,visitor_id,telegram_id,items,note,amount_minor,currency,provider,status,created_at,retry_of,receipt_token,purpose,request_key) VALUES(?,?,?,?,?,?,'RUB','sbp','awaiting_transfer',?,?,?,?,?)").run(id,visitorId,telegramId??'',JSON.stringify(items),note,amountMinor,now(),retryOf,randomUUID().replaceAll('-',''),purpose,requestKey);
    return view(row(id));
  }
  function method(input) {
    if(input.method!==undefined&&!['card','usdt','sbp'].includes(input.method))error('Выберите способ оплаты');
    return input.method??'card';
  }
  const cryptoRate=()=>state().settings.usdtRubRate??88;
  function cryptoAddress(network) {
    const key={trc20:'usdtTrc20Address',bep20:'usdtBep20Address'}[network];
    return key?(state().settings[key]??''):'';
  }
  const hasProof=id=>family(id).some(related=>row(related).crypto_reported_at||db.prepare('SELECT id FROM gateway_receipts WHERE payment_id=?').get(related));
  function issueCrypto(visitorId,telegramId,items,note,amountMinor,network,retryOf=null,purpose='order',requestKey=null,frozen={}) {
    const address=cryptoAddress(network);
    if(!['trc20','bep20'].includes(network)||!address)error('Эта сеть пока недоступна. Выберите другую сеть или оплату картой.',409);
    if(!env.GATEWAY_BOT_TOKEN||!recipient()||!config().enabled)error('Приём USDT временно недоступен. Свяжитесь с менеджером.',409);
    if(!Number.isSafeInteger(amountMinor)||amountMinor<1||amountMinor>10000000000)error('Проверьте сумму USDT');
    const rate=frozen.rate??cryptoRate();rateMinor(rate);
    const quote={network,address,rate,...(purpose==='topup'?{rubCreditMinor:frozen.rubCreditMinor}:{}),txid:''};
    const id='FK-'+randomUUID().slice(0,12).toUpperCase();
    db.prepare("INSERT INTO payments(id,visitor_id,telegram_id,items,note,amount_minor,currency,provider,status,created_at,retry_of,receipt_token,purpose,request_key,crypto) VALUES(?,?,?,?,?,?,'USD','usdt','awaiting_transfer',?,?,?,?,?,?)").run(id,visitorId,telegramId??'',JSON.stringify(items),note,amountMinor,now(),retryOf,randomUUID().replaceAll('-',''),purpose,requestKey,JSON.stringify(quote));
    return view(row(id));
  }
  function switchMethod(p,input,nextMethod) {
    if(input.notPaid!==true||(nextMethod==='card'&&input.accepted!==true))error('Подтвердите, что перевод ещё не отправлен');
    if(!['awaiting_transfer','invalidated','awaiting_receipt','manual_review'].includes(p.status)||hasProof(p.id))error('Повторный перевод недоступен: проверяем вашу оплату',409);
    const items=JSON.parse(p.items),quote=p.crypto?JSON.parse(p.crypto):null;
    if(nextMethod==='usdt'&&p.provider!=='usdt'&&input.expectedRate!==cryptoRate())error('Курс изменился. Обновите сумму оплаты.',409);
    return transaction(()=>{
      db.prepare("UPDATE payments SET status='superseded' WHERE id=?").run(p.id);
      if(nextMethod==='usdt') {
        const amount=p.provider==='usdt'?p.amount_minor:usdTotalMinor(items,cryptoRate());
        return issueCrypto(p.visitor_id,p.telegram_id,items,p.note,amount,input.network,p.id,p.purpose,null,quote??(p.purpose==='topup'?{rubCreditMinor:p.amount_minor}:{}));
      }
      const amount=rubTotalMinor(items,quote?.rate??cryptoRate());
      if(nextMethod==='sbp')return issueSbp(p.visitor_id,p.telegram_id,items,p.note,amount,p.id,p.purpose);
      return issue(p.visitor_id,p.telegram_id,items,p.note,amount,'RUB',p.id,p.purpose);
    });
  }
  function reportCryptoPaid(id,visitorId,input) {
    reconcile();
    const p=own(id,visitorId);if(p.provider!=='usdt')error('Этот способ оплаты не использует USDT');
    if(p.status==='paid'||p.crypto_reported_at)return view(p);
    const txid=typeof input.txid==='string'?input.txid.trim():'';
    if(input.txid!==undefined&&(typeof input.txid!=='string'||(txid&&!/^(?:0x)?[a-fA-F0-9]{64}$/.test(txid))))error('Проверьте хеш транзакции');
    return transaction(()=>{
      const quote=JSON.parse(p.crypto);quote.txid=txid;freezeOtherAttempts(id);
      db.prepare("UPDATE payments SET status='receipt_review',crypto_reported_at=?,crypto=? WHERE id=?").run(now(),JSON.stringify(quote),id);
      const text=`фиКУС · Покупатель сообщил об оплате USDT\nЗаказ: ${id}\nСеть: ${usdtNetworks[quote.network]}\nК получению: ${(p.amount_minor/100).toFixed(2)} USDT\nАдрес: ${quote.address}\nКурс заказа: ${quote.rate} RUB/USD\nTelegram ID: ${p.telegram_id||'не определён'}\n${JSON.parse(p.items).map(i=>`${i.title} × ${i.quantity}`).join('\n')}\n${p.purpose==='topup'?`Зачислить: ${quote.rubCreditMinor/100} RUB\n`:''}TXID: ${txid||'не указан'}\nКомментарий: ${p.note||'—'}\nПроверьте фактическое поступление USDT в указанной сети перед подтверждением.`;
      queue('crypto_claim',id,{text},'crypto_claim:'+id);events.emit('change');return view(row(id));
    });
  }
  function retry(id, visitorId, input) {
    reconcile(); const p = own(id, visitorId);
    const previous = db.prepare('SELECT * FROM payments WHERE retry_of=?').get(id);
    if (previous) return view(previous);
    const nextMethod=method(input),switching=['usdt','sbp'].includes(p.provider)||['usdt','sbp'].includes(nextMethod);
    if(switching)return switchMethod(p,input,nextMethod);
    if (input.notPaid !== true || input.accepted !== true) error('Подтвердите, что перевод ещё не выполнен, и согласитесь с новыми 15 минутами');
    if (!['invalidated', 'awaiting_receipt', 'manual_review'].includes(p.status) || hasProof(id)) error('Для этого заказа повторная оплата недоступна', 409);
    if (p.status === 'manual_review' && !providers.choose({amountMinor: p.amount_minor, currency: p.currency})) error('Реквизиты пока недоступны. Можно связаться с менеджером и уточнить способ оплаты.', 409);
    return transaction(() => {
      db.prepare("UPDATE payments SET status='superseded' WHERE id=?").run(id);
      return issue(p.visitor_id, p.telegram_id, JSON.parse(p.items), p.note, p.amount_minor, p.currency, id, p.purpose);
    });
  }
  let restoringPhoneFeed=false;
  function receiveFeed(message, updateId) {
    const c = config();
    if (String(message.chat?.id) !== c.sourceChatId) return false;
    const from = String(message.from?.id ?? message.sender_chat?.id ?? '');
    const username = (message.from?.username ?? '').toLowerCase();
    const trusted = /^\d+$/.test(c.sourceSender) ? from === c.sourceSender : meta('senderId') ? from === meta('senderId') : username === c.sourceSender.replace(/^@/, '').toLowerCase();
    const text = (message.text ?? message.caption ?? '').slice(0, 16000);
    const raw = parseFeed(text);
    const parsed = raw ? {...raw,cards:raw.cards.map(requisiteRecord)} : null;
    const outcome = !trusted ? 'untrusted_sender' : !parsed ? 'not_requisites' : parsed.kind;
    db.prepare('INSERT OR IGNORE INTO gateway_inbox VALUES(?,?,?,?,?,?,?,?)').run(updateId,message.message_id ?? 0,from,username,(message.edit_date ?? message.date ?? 0)*1000,now(),outcome,text);
    db.prepare('DELETE FROM gateway_inbox WHERE update_id NOT IN (SELECT update_id FROM gateway_inbox ORDER BY received_at DESC,update_id DESC LIMIT 500)').run();
    setMeta('lastSourceMessageAt', now());
    if (!trusted || !parsed) return false;
    if (!meta('senderId')) setMeta('senderId', from);
    const at = (message.edit_date ?? message.date) * 1000;
    if (!Number.isFinite(at)) { db.prepare("UPDATE gateway_inbox SET outcome='invalid_date' WHERE update_id=?").run(updateId); return false; }
    const cursor = JSON.parse(meta('feedCursor') ?? '[0,0]');
    if (!restoringPhoneFeed && (at < cursor[0] || (at === cursor[0] && updateId <= cursor[1]))) { db.prepare("UPDATE gateway_inbox SET outcome='out_of_order' WHERE update_id=?").run(updateId); return false; }
    // A drained updates queue includes later stops. Don't discard genuine delayed
    // snapshots merely because the process restarted or delivery took over a minute.
    const fresh = now() - at < 23 * 3600_000 && at <= now() + 30_000 && at >= Number(meta('bootstrapAt') ?? 0) - 1000;
    if (!fresh && parsed.kind === 'snapshot') db.prepare("UPDATE gateway_inbox SET outcome='stale_snapshot' WHERE update_id=?").run(updateId);
    transaction(() => {
      setMeta('feedCursor', JSON.stringify([at, updateId]));
      if (parsed.kind === 'invalid' || (parsed.kind === 'stop' && !parsed.stopCard && !parsed.cards.length)) {
        db.prepare('UPDATE gateway_cards SET active=0,version=version+1 WHERE active=1').run(); invalidate(parsed.kind === 'invalid' ? 'feed_unrecognized' : 'stopped');
      } else {
        if (parsed.kind === 'stop' && parsed.stopCard) {
          for(const stopped of db.prepare("SELECT number FROM gateway_cards WHERE number=? OR (kind='phone' AND account=?)").all(parsed.stopCard,parsed.stopCard)){
            db.prepare('UPDATE gateway_cards SET active=0,version=version+1 WHERE number=?').run(stopped.number);
            invalidate('stopped',stopped.number);
          }
        }
        if (fresh && (parsed.kind === 'snapshot' || parsed.snapshot)) {
          for (const card of db.prepare('SELECT * FROM gateway_cards WHERE active=1').all()) {
            const next = parsed.cards.find(c => c.number === card.number);
            if (!next || next.bank !== card.bank || next.holder !== card.holder) {
              db.prepare('UPDATE gateway_cards SET active=0,version=version+1 WHERE number=?').run(card.number); invalidate(next ? 'details_changed' : 'replaced', card.number);
            } else if (next.minMinor !== card.min_minor || next.maxMinor !== card.max_minor) {
              invalidate('limits_changed', card.number, p => p.amount_minor < next.minMinor || p.amount_minor > next.maxMinor);
              db.prepare('UPDATE gateway_cards SET min_minor=?,max_minor=? WHERE number=?').run(next.minMinor, next.maxMinor, card.number);
            }
          }
        }
        if (fresh) for (const card of parsed.cards) {
          const existing = db.prepare('SELECT * FROM gateway_cards WHERE number=?').get(card.number);
          if (existing && existing.active && existing.bank === card.bank && existing.holder === card.holder && existing.min_minor === card.minMinor && existing.max_minor === card.maxMinor) continue;
          db.prepare('INSERT INTO gateway_cards(number,bank,holder,min_minor,max_minor,active,version,kind,account) VALUES(?,?,?,?,?,1,1,?,?) ON CONFLICT(number) DO UPDATE SET bank=excluded.bank,holder=excluded.holder,min_minor=excluded.min_minor,max_minor=excluded.max_minor,kind=excluded.kind,account=excluded.account,active=1,version=gateway_cards.version+1').run(card.number, card.bank, card.holder, card.minMinor, card.maxMinor,card.kind,card.account);
        }
      }
      if (fresh || parsed.kind === 'stop' || parsed.kind === 'invalid') setMeta('lastFeedAt', at);
      if (fresh && (parsed.kind === 'snapshot' || parsed.snapshot)) db.prepare("DELETE FROM gateway_meta WHERE key IN ('bootstrapExpiresAt','bootstrapAt')").run();
    });
    events.emit('change'); return true;
  }
  function receiptMethod(p) {
    if(p.provider==='sbp')return 'СБП по ссылке';
    if(p.provider==='usdt')return 'USDT';
    const c=p.card&&db.prepare('SELECT * FROM gateway_cards WHERE number=?').get(p.card);
    return c?.kind==='phone'?'СБП на телефон •••• '+c.account.slice(-4)+' · '+c.bank:p.card?'карта •••• '+p.card.slice(-4):'выдан менеджером';
  }
  function upload(id, visitorId, buffer) {
    const p = own(id, visitorId);
    if (p.status === 'paid'&&p.provider!=='sbp') error('Оплата уже подтверждена', 409);
    if(p.provider==='sbp'&&(buffer.length>10*1024*1024||db.prepare('SELECT COUNT(*) n FROM gateway_receipts WHERE payment_id=?').get(id).n>=5))error('Для СБП можно прикрепить до 5 квитанций, каждая до 10 МБ');
    const mime = buffer.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 ? 'image/jpeg' : buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!mime || buffer.length > 12 * 1024 * 1024) error('Прикрепите PDF, JPG, PNG или WebP до 12 МБ');
    const receiptId = randomUUID();
    transaction(() => {
      db.prepare('INSERT INTO gateway_receipts VALUES(?,?,?,?,?)').run(receiptId, id, 'upload:' + receiptId, 'upload', now());
      db.prepare('INSERT INTO gateway_receipt_files VALUES(?,?,?)').run(receiptId, buffer, mime);
      freezeOtherAttempts(id);
      if(p.provider!=='sbp')db.prepare("UPDATE payments SET status='receipt_review' WHERE id=?").run(id);
      queue('receipt', id, { uploadId: receiptId, sbp:p.provider==='sbp', text: `фиКУС · Квитанция к ${id}\nСумма: ${p.amount_minor / 100} ${p.currency}\nTelegram ID: ${p.telegram_id || 'не определён'}\n${JSON.parse(p.items).map(i => `${i.title} × ${i.quantity}`).join('\n')}\nСпособ: ${receiptMethod(p)}\nСостояние при загрузке: ${p.status}\nКомментарий: ${p.note || '—'}\nПроверьте поступление денег перед подтверждением.` }, 'receipt:' + receiptId);
    });
    events.emit('change'); return view(row(id));
  }
  const transport = botCall ?? (async (method, payload, signal) => {
    const response = await fetch(`https://api.telegram.org/bot${env.GATEWAY_BOT_TOKEN}/${method}`, { method: 'POST', ...(payload instanceof FormData ? { body: payload } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), signal: signal ?? AbortSignal.timeout(12_000) });
    const result = await response.json();
    // Never expose URLs containing the bot token in logs or API errors.
    if (!result.ok) throw Object.assign(new Error('Telegram API request failed'), { retryAfter: result.parameters?.retry_after, telegramCode: result.error_code });
    return result.result;
  });
  // Defense in depth: the source group is read-only for every outgoing API call,
  // including malformed receipt configuration and jobs left by older releases.
  const readOnlyMethods = new Set(['getChat', 'getChatMember', 'getChatAdministrators', 'getChatMemberCount']);
  const call = async (method, payload, signal) => {
    const destination = payload instanceof FormData ? payload.get('chat_id') : payload?.chat_id;
    if (String(destination ?? '') === config().sourceChatId && !readOnlyMethods.has(method)) {
      throw Object.assign(new Error('Исходный чат доступен только для чтения'), { code: 'source_chat_read_only' });
    }
    return transport(method, payload, signal);
  };
  async function receivePrivate(message) {
    if (message.chat?.type !== 'private' || message.from?.is_bot) return;
    const id = String(message.from.id), c = config();
    if (!/^-?\d+$/.test(c.receiptRecipient) && !meta('recipientId') && (message.from.username ?? '').toLowerCase() === c.receiptRecipient.replace(/^@/, '').toLowerCase()) setMeta('recipientId', id);
    if (/^\/start(?:@\w+)?(?:\s|$)/.test(message.text ?? '')) {
      const key = message.text.match(/\sreceipt_([a-f0-9]{32})$/)?.[1];
      if (key) {
        const p = db.prepare('SELECT * FROM payments WHERE receipt_token=?').get(key);
        if (!p || !p.telegram_id || p.telegram_id !== id || p.status === 'paid') return;
        db.prepare('INSERT INTO gateway_bindings VALUES(?,?) ON CONFLICT(telegram_id) DO UPDATE SET payment_id=excluded.payment_id').run(id, p.id);

      } else if (id === recipient()) queue('admin_notice', '', { chat_id: id, text: 'фиКУС · Получатель квитанций подключён. Новые квитанции и заявки на ручную оплату будут приходить сюда.' }, 'recipient:' + id);
      return;
    }
    const binding = db.prepare('SELECT payment_id FROM gateway_bindings WHERE telegram_id=?').get(id);
    const p = binding && row(binding.payment_id);
    if (!p || p.telegram_id !== id) return;
    const photo = message.photo?.at(-1), doc = message.document;
    const file = photo ?? doc;
    if (!file || (doc && !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(doc.mime_type)) || (file.file_size ?? 0) > 20 * 1024 * 1024) {
      return;
    }
    const receiptId = randomUUID();
    transaction(() => {
      const inserted = db.prepare('INSERT OR IGNORE INTO gateway_receipts VALUES(?,?,?,?,?)').run(receiptId, p.id, file.file_id, photo ? 'photo' : 'document', now());
      if (!inserted.changes) return;
      freezeOtherAttempts(p.id);
      if (p.status !== 'paid') db.prepare("UPDATE payments SET status='receipt_review' WHERE id=?").run(p.id);
      queue('receipt', p.id, { file_id: file.file_id, kind: photo ? 'photo' : 'document', receiptId, text: `фиКУС · Квитанция к ${p.id}\nСумма заказа: ${p.amount_minor / 100} ${p.currency}\nПокупатель: ${message.from.username ? '@' + message.from.username : id} · ID ${id}\n${JSON.parse(p.items).map(i => `${i.title} × ${i.quantity}`).join('\n')}\nСпособ: ${receiptMethod(p)}\nСостояние при загрузке: ${p.status}\nКомментарий: ${p.note || '—'}\nПроверьте поступление денег перед подтверждением.` }, 'receipt:' + receiptId);

    });
    events.emit('change');
  }
  async function confirm(id, actorId,verifiedExternal=false) {
    const p = row(id); if (!p) error('Заказ не найден', 404);
    if (p.status === 'paid') return;
    if(p.provider==='sbp'&&!verifiedExternal)error('Оплату СБП подтверждает платёжная система',409);
    if (p.status !== 'receipt_review') error('Сначала дождитесь квитанции', 409);
    transaction(() => {
      const latest = row(id);
      if (latest.status === 'paid') return;
      if (latest.status !== 'receipt_review') error('Сначала дождитесь квитанции',409);
      // Credits and stock changes are atomic; a receipt alone never confirms payment.
      if (p.purpose === 'topup') {
        const creditMinor=p.provider==='usdt'?JSON.parse(p.crypto).rubCreditMinor:p.amount_minor;
        if(!Number.isSafeInteger(creditMinor)||creditMinor<1)error('Проверьте сумму зачисления',409);
        const root = family(id)[0];
        const credited = db.prepare('SELECT * FROM wallet_ledger WHERE payment_id=?').get(root);
        if (credited && (credited.owner_id !== p.visitor_id || credited.amount_minor !== creditMinor)) error('Проверьте зачисление с менеджером',409);
        const balanceMinor = db.prepare('SELECT COALESCE(sum(amount_minor),0) amount FROM wallet_ledger WHERE owner_id=?').get(p.visitor_id).amount;
        if (!Number.isSafeInteger(balanceMinor + (credited ? 0 : creditMinor))) error('Сумма баланса слишком велика. Обратитесь к менеджеру.',409);
        db.prepare('INSERT OR IGNORE INTO wallet_ledger VALUES(?,?,?,?,?)').run(root,p.visitor_id,'RUB',creditMinor,now());
        if (!credited) db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run('wallet.credit:'+root+':'+actorId,now());
      } else {
        const s = state(), items = JSON.parse(p.items);
        for (const i of items) {
          const product = s.catalog.products.find(p => p.id === i.productId);
          if (!product || product.stock < i.quantity) error('Остатка недостаточно. Свяжитесь с покупателем перед подтверждением.', 409);
          product.stock -= i.quantity;
        }
        db.prepare('UPDATE state SET catalog=?,revision=revision+1 WHERE id=1').run(JSON.stringify(s.catalog));
        recordPurchase(db,p,family(id)[0],now());
      }
      for (const relatedId of family(id)) db.prepare("UPDATE payments SET status='paid',paid_at=? WHERE id=?").run(now(), relatedId);
      db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run('payment.confirm:' + id + ':' + actorId, now());

    });
    events.emit('change');
  }
  async function processUpdate(update) {
    const message = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
    if (message) {
      if (String(message.chat?.id) === config().sourceChatId) receiveFeed(message, update.update_id);
      else if (!update.edited_message) await receivePrivate(message);
    }
    const cb = update.callback_query;
    const approvers = [...(env.ADMIN_TELEGRAM_IDS ?? '').split(','), ...(state().settings.adminTelegramIds ?? '').split(',')].map(v => v.trim());
    if (cb && (String(cb.from.id) === recipient() || (recipient()?.startsWith('-') && approvers.includes(String(cb.from.id)))) && String(cb.message?.chat.id) === recipient()) {
      const id = cb.data?.match(/^confirm:(FK-[A-F0-9-]+)$/)?.[1];
      if (id) {
        let text = 'Оплата подтверждена';
        try { await confirm(id, String(cb.from.id)); } catch (e) { text = e.message; }
        queue('callback', id, { callback_query_id: cb.id, text }, 'cb:' + cb.id);
      }
    }
  }
  async function flush() {
    if (flushing || closed || !env.GATEWAY_BOT_TOKEN) return;
    flushing = true;
    try {
      const jobs = db.prepare("SELECT * FROM gateway_outbox WHERE status='pending' AND next_at<=? ORDER BY CASE WHEN id LIKE 'stop:%' THEN 0 WHEN kind='customer' THEN 1 WHEN kind='receipt' THEN 2 WHEN kind='manual' THEN 3 ELSE 4 END,rowid LIMIT 12").all(now());
      for (const job of jobs) {
        const payload = JSON.parse(job.payload);
        const approvalText = row(job.payment_id)?.purpose === 'topup' ? 'Подтвердить и зачислить на баланс' : 'Подтвердить поступление денег';
        if (['receipt', 'manual','crypto_claim','provider_notice'].includes(job.kind) && !recipient()) continue;
        if (['source','customer'].includes(job.kind)) { db.prepare("UPDATE gateway_outbox SET status='cancelled' WHERE id=?").run(job.id); continue; }
        try {
          let result;
          if (job.kind === 'callback') result = await call('answerCallbackQuery', payload);
          else if(job.kind==='crypto_claim')result=await call('sendMessage',{chat_id:recipient(),text:payload.text.slice(0,4000),reply_markup:{inline_keyboard:[[{text:approvalText,callback_data:'confirm:'+job.payment_id}]]}});
          else if (job.kind === 'receipt' && payload.uploadId) {
            const file = db.prepare('SELECT * FROM gateway_receipt_files WHERE id=?').get(payload.uploadId);
            const form = new FormData();
            form.set('chat_id', recipient()); form.set('caption', payload.text.slice(0, 1000));
            if(!payload.sbp)form.set('reply_markup', JSON.stringify({ inline_keyboard: [[{ text: approvalText, callback_data: 'confirm:' + job.payment_id }]] }));
            form.set('document', new Blob([file.data], { type: file.mime }), 'receipt.' + (file.mime === 'application/pdf' ? 'pdf' : file.mime.split('/')[1]));
            result = await call('sendDocument', form);
          }
          else if (job.kind === 'receipt') result = await call(payload.kind === 'photo' ? 'sendPhoto' : 'sendDocument', { chat_id: recipient(), [payload.kind]: payload.file_id, caption: payload.text.slice(0, 1000), reply_markup: { inline_keyboard: [[{ text: approvalText, callback_data: 'confirm:' + job.payment_id }]] } });
          else result = await call('sendMessage', { ...payload, chat_id: ['manual','provider_notice'].includes(job.kind) ? recipient() : payload.chat_id, text: payload.text.slice(0, 4000) });
          if (closed) return;
          db.prepare("UPDATE gateway_outbox SET status='sent' WHERE id=?").run(job.id);
        } catch (e) {
          if (closed) return;
          if (e.code === 'source_chat_read_only') { db.prepare("UPDATE gateway_outbox SET status='cancelled' WHERE id=?").run(job.id); continue; }
          db.prepare('UPDATE gateway_outbox SET attempts=attempts+1,next_at=? WHERE id=?').run(now() + Math.max((e.retryAfter ?? 0) * 1000, Math.min(300_000, 2000 * 2 ** Math.min(job.attempts, 7))), job.id);
        }
      }
    } finally { flushing = false; }
  }
  let abort, catchupCleared = false;
  async function poll() {
    if (closed || !env.GATEWAY_BOT_TOKEN) return;
    abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 6500);
    try {
      const updates = await call('getUpdates', { offset: Number(meta('offset') ?? 0), timeout: 1, limit: 100, allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'callback_query'] }, abort.signal);
      if (closed) return;
      const previousPoll = Number(meta('lastPollAt') ?? 0);
      connected = false;
      if (!catchupCleared && previousPoll && now() - previousPoll >= 23 * 3600_000) { db.prepare('UPDATE gateway_cards SET active=0,version=version+1 WHERE active=1').run(); catchupCleared = true; }
      for (const update of updates) {
        if (update.update_id < Number(meta('offset') ?? 0)) continue;
        await processUpdate(update);
        setMeta('offset', update.update_id + 1);
      }
      lastPoll = now(); connected = updates.length < 100;
      if (connected) { catchupCleared = false; setMeta('lastPollAt', now()); setMeta('pollError', ''); repairShortenedTimers(); events.emit('change'); }
    } catch (e) {
      if (!closed) { setMeta('pollError', e.telegramCode ?? e.code ?? 'connection_error'); disconnect(); }
    } finally {
      clearTimeout(timeout);
      if (!closed) worker = setTimeout(poll, 350);
    }
  }
  function restorePhoneFeed() {
    const c=config(),cursor=JSON.parse(meta('feedCursor')??'[0,0]');
    const bound=meta('senderId');
    const history=db.prepare('SELECT * FROM gateway_inbox ORDER BY event_at DESC,update_id DESC').all();
    const candidate=history.find(m=>(bound?m.sender_id===bound:/^\d+$/.test(c.sourceSender)?m.sender_id===c.sourceSender:m.sender_username===c.sourceSender.replace(/^@/,'').toLowerCase())&&parseFeed(m.text));
    if(!candidate||candidate.outcome!=='invalid'||candidate.event_at!==cursor[0]||candidate.update_id!==cursor[1])return;
    const parsed=parseFeed(candidate.text),at=candidate.event_at;
    if(parsed.kind!=='snapshot'||!parsed.cards.some(c=>c.kind==='phone')||now()-at>=23*3600_000||at>now()+30_000||at<Number(meta('bootstrapAt')??0)-1000)return;
    restoringPhoneFeed=true;
    try {
      receiveFeed({chat:{id:c.sourceChatId},from:{id:candidate.sender_id,username:candidate.sender_username},date:at/1000,message_id:candidate.message_id,text:candidate.text},candidate.update_id);
      db.prepare("UPDATE gateway_inbox SET outcome='snapshot' WHERE update_id=?").run(candidate.update_id);
      db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run('gateway.phone-feed-restored:'+candidate.update_id,now());
    } finally { restoringPhoneFeed=false; }
  }
  restorePhoneFeed();
  const tick = setInterval(() => { if (!closed) { reconcile(); void flush(); } }, 1000);
  tick.unref();
  function start() { if (env.GATEWAY_BOT_TOKEN && !worker) { worker = setTimeout(poll, 0); worker.unref(); } }
  function stop() { closed = true; clearTimeout(worker); clearInterval(tick); abort?.abort(); events.removeAllListeners(); }
  function admin() {
    reconcile();
    return { config: config(), tokenConfigured: !!env.GATEWAY_BOT_TOKEN, connected: healthy(), recipientReady: !!recipient(), lastFeedAt: Number(meta('lastFeedAt') ?? 0), lastSourceMessageAt: Number(meta('lastSourceMessageAt') ?? 0), lastPollAt: Number(meta('lastPollAt') ?? 0), pollError: meta('pollError') ?? '', bootstrapExpiresAt: Number(meta('bootstrapExpiresAt') ?? 0), inbox: db.prepare('SELECT update_id AS updateId,message_id AS messageId,sender_username AS senderUsername,event_at AS eventAt,received_at AS receivedAt,outcome FROM gateway_inbox ORDER BY received_at DESC,update_id DESC LIMIT 10').all(), senderBound: !!meta('senderId'), pendingDeliveries: db.prepare("SELECT count(*) n FROM gateway_outbox WHERE status='pending'").get().n, cards: db.prepare('SELECT * FROM gateway_cards').all().map(c => ({ bank: c.bank, holder: c.holder, type:c.kind,last4: (c.account||c.number).slice(-4), min: c.min_minor / 100, max: c.max_minor / 100, active: !!c.active && issuable() })), payments: db.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 100').all().map(p => ({ ...view(p), crypto:p.crypto?JSON.parse(p.crypto):null,telegramId: p.telegram_id, note: p.note })) };
  }
  return { externalRow:row,cardAvailable:(amountMinor)=>!!providers.choose({amountMinor,currency:'RUB'}),notifyExternal:(id,text,key)=>queue('provider_notice',id,{text},'provider:'+key),confirmExternal:async id=>{const p=row(id);if(!p||p.provider!=='sbp')error('Платёж СБП не найден',404);if(p.status==='paid')return;db.prepare("UPDATE payments SET status='receipt_review',reason='provider_success' WHERE id=?").run(id);await confirm(id,'sbp-provider',true);},wallet, createTopup, reportCryptoPaid, repairShortenedTimers, receipts: id => db.prepare('SELECT r.id,r.created_at AS createdAt,f.mime FROM gateway_receipts r LEFT JOIN gateway_receipt_files f ON f.id=r.id WHERE payment_id=? ORDER BY r.created_at').all(id), receiptFile: id => db.prepare('SELECT data,mime FROM gateway_receipt_files WHERE id=?').get(id), bootstrap: (text, actor, confirmed) => { const result = bootstrapRequisites(db,text,{actor,confirmed,now:now()}); events.emit('change'); return result; }, config, saveConfig, create, retry, upload, view, own, admin, confirm, receiveFeed, processUpdate, flush, start, stop, disconnect, events, list: (visitorId) => { reconcile(); return db.prepare('SELECT * FROM payments WHERE visitor_id=? ORDER BY created_at DESC LIMIT 100').all(visitorId).map(view); }, setConnected: () => { connected = true; lastPoll = now(); setMeta('lastPollAt', now()); } };
}
