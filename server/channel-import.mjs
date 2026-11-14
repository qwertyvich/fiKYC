import { createHash } from 'node:crypto';
import { ensurePurchaseStats } from './purchase-stats.mjs';

const DAY = 86400000, MOSCOW = 3 * 3600000;
export const nextImportAt = time => Math.floor((time + MOSCOW) / DAY) * DAY + DAY - MOSCOW;
const dayAt = time => Math.floor((time + MOSCOW) / DAY);
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw Object.assign(new Error(message), {status: 400}); };
const text = (value, field, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${field}: укажите текст до ${max} символов`);
  return value.trim();
};
function date(value, field) {
  // Local dates in the template always mean Moscow. Explicit ISO offsets also work.
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)?$/.test(value)) fail(`${field}: формат 2026-11-08 14:30 (Москва) или ISO с часовым поясом`);
  const m = value.match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/);
  const [year, month, day, hour, minute, second] = m.slice(1).map(v => Number(v ?? 0));
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2100 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) fail(`${field}: такой даты или времени не существует`);
  const iso = value.replace(' ', 'T') + (/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? '' : '+03:00');
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) fail(`${field}: некорректный часовой пояс`);
  return time;
}
export function validateChannelFile(input, catalog, now = Date.now()) {
  let data;
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > 1024 * 1024) fail('Загрузите JSON-файл размером до 1 МБ');
  try { data = JSON.parse(input.replace(/^\uFEFF/, '')); } catch { fail('Не удалось прочитать JSON. Проверьте кавычки, запятые и скобки.'); }
  if (!data || data.version !== 1 || !Array.isArray(data.products) || data.products.length > 1000) fail('Нужны version: 1 и массив products (до 1000 товаров)');
  const ids = new Set(); let total = 0, scheduled = 0, placeholders = 0, draftProducts = 0;
  const products = data.products.flatMap((p, index) => {
    const prefix = `Товар ${index + 1}`;
    if (!p || typeof p !== 'object') fail(`${prefix}: проверьте запись`);
    const id = text(p.id, `${prefix}, id`, 100);
    if (!catalog.products.some(product => product.id === id)) fail(`${prefix}: ID «${id}» отсутствует в каталоге. Скопируйте его из вкладки импорта.`);
    if (ids.has(id)) fail(`${prefix}: ID «${id}» повторяется`); ids.add(id);
    const name = text(p.name, `${prefix}, name`, 200);
    const mark = p.mark ?? null;
    if (mark !== null && (typeof mark !== 'number' || !Number.isFinite(mark) || mark < 1 || mark > 5 || Math.abs(mark * 10 - Math.round(mark * 10)) > 1e-8)) fail(`${prefix}, mark: оценка от 1 до 5 с одним знаком после точки или null`);
    if (!Array.isArray(p.reviews) || p.reviews.length > 5000) fail(`${prefix}: нужен массив reviews (до 5000 отзывов)`);
    const reviewIds = new Set();
    const reviews = p.reviews.flatMap((r, i) => {
      const label = `${prefix}, отзыв ${i + 1}`;
      if (!r || typeof r !== 'object') fail(`${label}: проверьте запись`);
      const reviewId = text(r.id, `${label}, id`, 150);
      if (reviewIds.has(reviewId)) fail(`${label}: ID «${reviewId}» повторяется`); reviewIds.add(reviewId);
      if (!Number.isInteger(r.mark) || r.mark < 1 || r.mark > 5) fail(`${label}, mark: целое число от 1 до 5`);
      if (r.name === '' && r.date === '' && r.text === '') { placeholders++; return []; }
      const createdAt = date(r.date, `${label}, date`); if (createdAt > now) scheduled++; total++;
      if (total > 10000) fail('В одном файле допускается до 10 000 отзывов');
      return [{id: reviewId, name: text(r.name, `${label}, name`, 60), mark: r.mark, text: text(r.text, `${label}, text`, 2000), date: r.date, createdAt}];
    });
    if (p.buyers === null && mark === null && !reviews.length) { draftProducts++; return []; }
    if (!Number.isSafeInteger(p.buyers) || p.buyers < 0 || p.buyers > 1000000000) fail(`${prefix}, buyers: заполните реальное число покупателей — целое число от 0 до 1 000 000 000`);
    return [{id, name, buyers: p.buyers, mark, reviews}];
  });
  return {version: 1, products, summary: {products: products.length, reviews: total, scheduled, ...(placeholders ? {placeholders} : {}), ...(draftProducts ? {draftProducts} : {})}};
}

export function createChannelImport({db, state, now = Date.now}) {
  ensurePurchaseStats(db);
  db.exec(`CREATE TABLE IF NOT EXISTS channel_import_file(id INTEGER PRIMARY KEY CHECK(id=1),pending_json TEXT,pending_filename TEXT,pending_at INTEGER,pending_apply_at INTEGER,active_json TEXT,active_filename TEXT,last_check_day INTEGER,last_checked_at INTEGER,last_applied_at INTEGER,error TEXT NOT NULL DEFAULT '');
    INSERT OR IGNORE INTO channel_import_file(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS channel_product_stats(product_id TEXT PRIMARY KEY,name TEXT NOT NULL,buyers INTEGER NOT NULL,mark REAL);
    CREATE TABLE IF NOT EXISTS channel_review_map(review_id TEXT PRIMARY KEY,external_id TEXT NOT NULL,product_id TEXT NOT NULL,data_hash TEXT NOT NULL,present INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX IF NOT EXISTS channel_reviews_product ON channel_review_map(product_id);`);
  const file = () => db.prepare('SELECT * FROM channel_import_file WHERE id=1').get();
  const summary = raw => raw ? validateChannelFile(raw, state().catalog, now()).summary : null;
  const inspect = raw => validateChannelFile(raw, state().catalog, now());
  function status() {
    const f = file(); let pendingSummary = null;
    try { pendingSummary = summary(f.pending_json); } catch { /* Report daily validation errors below. */ }
    return {pending: !!f.pending_json, filename: f.pending_filename, savedAt: f.pending_at, nextApplyAt: f.pending_json ? f.pending_apply_at : nextImportAt(now()), pendingSummary, activeFilename: f.active_filename, lastCheckedAt: f.last_checked_at, lastAppliedAt: f.last_applied_at, error: f.error, importedProducts: db.prepare('SELECT count(*) n FROM channel_product_stats').get().n, importedReviews: db.prepare('SELECT count(*) n FROM channel_review_map WHERE present=1').get().n, scheduledReviews: db.prepare("SELECT count(*) n FROM reviews r JOIN channel_review_map m ON m.review_id=r.id WHERE m.present=1 AND r.status='published' AND r.created_at>?").get(now()).n};
  }
  function stage(raw, filename) {
    const data = inspect(raw), at = now();
    if (!data.products.length && data.summary.draftProducts) fail('В файле пока только незаполненные товары. Заполните данные хотя бы одного товара перед сохранением.');
    const name = typeof filename === 'string' ? filename.replace(/[\x00-\x1f/\\]/g, '').slice(0, 160) : 'channel-import.json';
    db.prepare("UPDATE channel_import_file SET pending_json=?,pending_filename=?,pending_at=?,pending_apply_at=?,error='' WHERE id=1").run(raw, name || 'channel-import.json', at, nextImportAt(at));
    db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run('channel-import.staged', at);
    return {...status(), preview: data.summary};
  }
  function cancel() {
    db.prepare("UPDATE channel_import_file SET pending_json=NULL,pending_filename=NULL,pending_at=NULL,pending_apply_at=NULL,error='' WHERE id=1").run();
    db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run('channel-import.cancelled', now());
    return status();
  }
  function runScheduled() {
    const f = file(), at = now();
    if (!(f.pending_json && f.pending_apply_at <= at) && (f.last_check_day === dayAt(at) || !f.active_json)) return false;
    const pendingDue = f.pending_json && f.pending_apply_at <= at;
    const raw = pendingDue ? f.pending_json : f.active_json;
    try {
      const data = inspect(raw);
      db.exec('BEGIN IMMEDIATE');
      try {
        if (pendingDue) {
          const present = new Set();
          for (const p of data.products) for (const r of p.reviews) present.add('channel-' + hash(p.id + '\0' + r.id).slice(0, 40));
          for (const m of db.prepare('SELECT * FROM channel_review_map WHERE present=1').all()) if (!present.has(m.review_id)) {
            db.prepare("UPDATE reviews SET status='hidden',updated_at=? WHERE id=?").run(at, m.review_id);
            db.prepare('UPDATE channel_review_map SET present=0 WHERE review_id=?').run(m.review_id);
          }
          db.prepare('DELETE FROM channel_product_stats').run();
          for (const p of data.products) {
            db.prepare('INSERT INTO channel_product_stats VALUES(?,?,?,?)').run(p.id,p.name,p.buyers,p.mark);
            for (const r of p.reviews) {
              const id = 'channel-' + hash(p.id + '\0' + r.id).slice(0, 40), fingerprint = hash(JSON.stringify(r));
              const old = db.prepare('SELECT * FROM channel_review_map WHERE review_id=?').get(id);
              if (old?.present && old.data_hash === fingerprint) continue;
              db.prepare(`INSERT INTO reviews(id,visitor_id,product_id,author,rating,text,status,reply,created_at,updated_at) VALUES(?,?,?,?,?,?,'published','',?,?)
                ON CONFLICT(id) DO UPDATE SET author=excluded.author,rating=excluded.rating,text=excluded.text,created_at=excluded.created_at,updated_at=excluded.updated_at,status=CASE WHEN ? THEN reviews.status ELSE 'published' END`).run(id,'channel:'+id,p.id,r.name,r.mark,r.text,r.createdAt,at,old?.present ? 1 : 0);
              db.prepare('INSERT INTO channel_review_map VALUES(?,?,?,?,1) ON CONFLICT(review_id) DO UPDATE SET data_hash=excluded.data_hash,present=1').run(id,r.id,p.id,fingerprint);
            }
          }
          db.prepare('UPDATE channel_import_file SET active_json=pending_json,active_filename=pending_filename,pending_json=NULL,pending_filename=NULL,pending_at=NULL,pending_apply_at=NULL,last_applied_at=? WHERE id=1').run(at);
          db.prepare('UPDATE state SET revision=revision+1 WHERE id=1').run();
          db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run('channel-import.applied', at);
        }
        db.prepare("UPDATE channel_import_file SET last_check_day=?,last_checked_at=?,error='' WHERE id=1").run(dayAt(at), at);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return true;
    } catch (e) {
      db.prepare('UPDATE channel_import_file SET last_check_day=?,last_checked_at=?,error=?,pending_apply_at=CASE WHEN pending_json IS NOT NULL THEN ? ELSE NULL END WHERE id=1').run(dayAt(at),at,e.message,nextImportAt(at));
      return false;
    }
  }
  function enrich(catalog) {
    const stats = new Map(db.prepare('SELECT * FROM channel_product_stats').all().map(s => [s.product_id,s]));
    const purchases = new Map(db.prepare('SELECT product_id,COUNT(*) buyers FROM product_purchases GROUP BY product_id').all().map(s=>[s.product_id,s.buyers]));
    return {...catalog, products: catalog.products.map(p => {
      const s=stats.get(p.id),buyerCount=(s?.buyers??p.buyerCount??0)+(purchases.get(p.id)??0);
      return {...p,buyerCount,...(s?{channelStats:{buyers:buyerCount,mark:s.mark}}:{})};
    })};
  }
  return {inspect,stage,cancel,status,runScheduled,enrich,download: () => {const f=file();return {text:f.pending_json ?? f.active_json,filename:f.pending_filename ?? f.active_filename};}};
}
