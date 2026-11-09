import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sqlite from 'node:sqlite';
import { initialCatalog } from '../src/catalog.ts';
import { parseCatalog } from '../src/domain.ts';
import { defaultShop, parseShop, enrichOffers } from '../src/commerce.ts';
import { token, digest, equal, telegramUser } from './security.mjs';
import { defaultSettings, parseSettings, directLink, eventTypes } from './settings.mjs';
import { createAccess, blacklistValue } from './access.mjs';
import { analytics } from './analytics.mjs';
import { createGateway } from './gateway/gateway.mjs';
import { createChannelImport } from './channel-import.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function createApp(options = {}) {
  const env = { ...process.env, ...options.env };
  const dbPath = options.dbPath ?? env.DATABASE_PATH ?? resolve(root, 'data/fikus.sqlite');
  if (dbPath !== ':memory:') await mkdir(dirname(dbPath), { recursive: true });
  const Database = sqlite.Database ?? sqlite.DatabaseSync;
  const db = new Database(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, catalog TEXT NOT NULL, shop TEXT NOT NULL, settings TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admins (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, product_id TEXT NOT NULL, label TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, product_id TEXT NOT NULL, author TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), text TEXT NOT NULL, status TEXT NOT NULL, reply TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(visitor_id, product_id));
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, session_id TEXT NOT NULL, type TEXT NOT NULL, product_id TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0, quantity INTEGER NOT NULL DEFAULT 0, link_id TEXT NOT NULL DEFAULT '', view_id TEXT NOT NULL DEFAULT '', product_ids TEXT NOT NULL DEFAULT '[]');
    CREATE INDEX IF NOT EXISTS events_at ON events(at);
    CREATE INDEX IF NOT EXISTS events_product_at ON events(product_id, at);
    CREATE INDEX IF NOT EXISTS events_session_at ON events(session_id, at);
    CREATE INDEX IF NOT EXISTS reviews_product_status ON reviews(product_id, status);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, action TEXT NOT NULL, at INTEGER NOT NULL);
  `);
  if (
    !db
      .prepare('PRAGMA table_info(events)')
      .all()
      .some((c) => c.name === 'product_ids')
  )
    db.exec("ALTER TABLE events ADD COLUMN product_ids TEXT NOT NULL DEFAULT '[]'");
  db.prepare('INSERT OR IGNORE INTO state VALUES(1,1,?,?,?)').run(
    JSON.stringify(enrichOffers(structuredClone(initialCatalog))),
    JSON.stringify(defaultShop),
    JSON.stringify(defaultSettings),
  );
  const state = () => {
    const s = db.prepare('SELECT * FROM state WHERE id=1').get();
    return {
      revision: s.revision,
      catalog: JSON.parse(s.catalog),
      shop: JSON.parse(s.shop),
      settings: { ...defaultSettings, ...JSON.parse(s.settings) },
    };
  };
  const publicCatalog = (catalog) => {
    const groups = catalog.groups.filter((g) => g.visible);
    const products = catalog.products.filter(
      (p) => p.visible && groups.some((g) => g.id === p.groupId),
    );
    return {
      ...catalog,
      groups,
      products,
      ...(catalog.productOrder
        ? { productOrder: catalog.productOrder.filter((id) => products.some((p) => p.id === id)) }
        : {}),
    };
  };
  const available = (s, id) =>
    s.catalog.products.some(
      (p) =>
        p.id === id && p.visible && s.catalog.groups.some((g) => g.id === p.groupId && g.visible),
    );
  const audit = (action) =>
    db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run(action, Date.now());
  const limits = new Map();
  function limit(key, maximum, interval = 60000) {
    const now = Date.now();
    let l = limits.get(key);
    if (!l || l.end < now) l = { count: 0, end: now + interval };
    l.count++;
    limits.set(key, l);
    if (limits.size > 10000) for (const [k, v] of limits) if (v.end < now) limits.delete(k);
    if (l.count > maximum)
      throw Object.assign(new Error('Слишком много запросов. Попробуйте позже.'), { status: 429 });
  }
  function fail(message, status = 400) {
    throw Object.assign(new Error(message), { status });
  }
  const cookies = (req) =>
    Object.fromEntries(
      (req.headers.cookie ?? '')
        .split(';')
        .map((p) => p.trim().split('='))
        .filter((p) => p.length === 2),
    );
  function setCookie(res, name, value, seconds) {
    const cookie = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${env.NODE_ENV === 'production' ? '; Secure' : ''}`;
    const old = res.getHeader('set-cookie') ?? [];
    res.setHeader('set-cookie', [...(Array.isArray(old) ? old : [old]), cookie]);
  }
  const access = createAccess({ db, env, state, cookies, setCookie });
  const isAdmin = access.admin;
  const visitor = access.visitor;
  async function body(req) {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json'))
      fail('Ожидается JSON', 415);
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) fail('Слишком большой запрос', 413);
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      fail('Некорректный JSON');
    }
  }
  function send(res, data, status = 200) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data));
  }
  function saveState(req, res, input) {
    const current = state();
    if (input.revision !== current.revision)
      fail('Данные изменились в другой вкладке. Обновите панель и повторите изменение.', 409);
    const catalog = input.catalog ? parseCatalog(input.catalog) : current.catalog;
    if (
      catalog.products.some((p) => p.id.length > 100 || !/^[-a-zA-Z0-9_]+$/.test(p.id)) ||
      catalog.groups.some((g) => g.id.length > 100 || !/^[-a-zA-Z0-9_]+$/.test(g.id))
    )
      fail('ID должен содержать латинские буквы, цифры, дефис или подчёркивание');
    const shop = input.shop ? parseShop(input.shop) : current.shop;
    const settings = input.settings ? parseSettings(input.settings) : current.settings;
    db.prepare('UPDATE state SET revision=revision+1,catalog=?,shop=?,settings=? WHERE id=1').run(
      JSON.stringify(catalog),
      JSON.stringify(shop),
      JSON.stringify(settings),
    );
    audit(input.catalog ? 'catalog.save' : 'settings.save');
    send(res, state());
  }
  const reviewRow = (r) => ({
    id: r.id,
    productId: r.product_id,
    author: r.author,
    rating: r.rating,
    text: r.text,
    status: r.status,
    reply: r.reply,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    ...(r.external_id ? { source: 'telegram', externalId: r.external_id, scheduled: r.status === 'published' && r.created_at > (options.importNow?.() ?? Date.now()) } : {}),
  });
  const paymentOwner = (req, res) => {
    const v = visitor(req, res), user = access.identity(req);
    return user?.id ? 'tg:' + user.id : v;
  };
  const gateway = createGateway({ db, env, state, now: options.gatewayNow, botCall: options.gatewayBotCall });
  const channelImport = createChannelImport({db,state,now:options.importNow});
  channelImport.runScheduled();
  const importTimer = setInterval(() => channelImport.runScheduled(), 30000);
  importTimer.unref();
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const method = req.method;
      if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(method)) {
        const allowed =
          env.PUBLIC_ORIGIN ??
          `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${req.headers.host}`;
        const allowedOrigins = [
          allowed,
          ...(env.NODE_ENV !== 'production'
            ? [env.DEV_ORIGIN ?? 'http://127.0.0.1:5174', 'http://localhost:5174']
            : []),
        ];
        if (req.headers.origin && !allowedOrigins.includes(req.headers.origin))
          fail('Недопустимый источник запроса', 403);
      }
      if (path === '/api/health') return send(res, { ok: true });
      if (path === '/api/access' && method === 'GET') {
        const result = access.status(req);
        if (!result.blocked) visitor(req, res);
        return send(res, result);
      }
      if (path.startsWith('/api/') && !path.startsWith('/api/admin/') && path !== '/api/access')
        access.guard(req);
      if (path === '/api/public' && method === 'GET') {
        visitor(req, res);
        const s = state();
        const { botUsername, appShortName, adminTelegramIds, sellerUsername, ...publicSettings } =
          s.settings;
        return send(res, {
          revision: s.revision,
          catalog: channelImport.enrich(publicCatalog(s.catalog)),
          shop: s.shop,
          settings: publicSettings,
        });
      }
      if (path === '/api/admin/session' && method === 'GET')
        return send(res, {
          authenticated: isAdmin(req),
          seller: access.seller(access.proof(req)),
          localAdminLogin: access.localAdminAllowed(req),
          telegramAvailable: !!env.BOT_TOKEN,
        });
      if (path === '/api/admin/login' && method === 'POST') {
        limit('login:' + (req.socket.remoteAddress ?? ''), 10, 15 * 60000);
        const b = await body(req);
        const user = telegramUser(b.initData ?? req.headers['x-telegram-init-data'], env.BOT_TOKEN);
        const passwordOk =
          access.localAdminAllowed(req) &&
          !!env.ADMIN_PASSWORD &&
          typeof b.password === 'string' &&
          b.password.length <= 1024 &&
          equal(b.password, env.ADMIN_PASSWORD);
        const sellerOk = access.seller(user);
        if (!passwordOk && !sellerOk) fail('Доступ разрешён только продавцу', 401);
        const secret = token();
        db.prepare('DELETE FROM admins WHERE expires<?').run(Date.now());
        db.prepare(
          'INSERT INTO admins(token,expires,telegram_id,telegram_username,method) VALUES(?,?,?,?,?)',
        ).run(
          digest(secret),
          Date.now() + 12 * 3600000,
          sellerOk ? String(user.id) : '',
          sellerOk ? (user.username ?? '').toLowerCase() : '',
          sellerOk ? 'telegram' : 'password',
        );
        setCookie(res, 'fikus_admin', secret, 12 * 3600);
        audit('admin.login');
        return send(res, { ok: true });
      }
      if (path === '/api/admin/logout' && method === 'POST') {
        await body(req);
        db.prepare('DELETE FROM admins WHERE token=?').run(digest(cookies(req).fikus_admin ?? ''));
        setCookie(res, 'fikus_admin', '', 0);
        return send(res, { ok: true });
      }
      if (path.startsWith('/api/admin/')) {
        if (!isAdmin(req)) fail('Войдите в панель администратора', 401);
        if (path === '/api/admin/channel-import' && method === 'GET') return send(res, channelImport.status());
        if (path === '/api/admin/channel-import/preview' && method === 'POST') {
          const b = await body(req); const data = channelImport.inspect(b.text);
          return send(res, {summary:data.summary, products:data.products.map(p=>({id:p.id,name:p.name,buyers:p.buyers,mark:p.mark,reviews:p.reviews.length,scheduled:p.reviews.filter(r=>r.createdAt>(options.importNow?.() ?? Date.now())).length}))});
        }
        if (path === '/api/admin/channel-import' && method === 'PUT') {
          const b = await body(req); return send(res, channelImport.stage(b.text,b.filename));
        }
        if (path === '/api/admin/channel-import' && method === 'DELETE') return send(res, channelImport.cancel());
        if (path === '/api/admin/channel-import/file' && method === 'GET') return send(res, channelImport.download());
        if (path === '/api/admin/blacklist' && method === 'GET')
          return send(
            res,
            db
              .prepare(
                'SELECT id,type,value,note,active,created_at AS createdAt FROM blacklist ORDER BY created_at DESC',
              )
              .all()
              .map((r) => ({ ...r, active: !!r.active })),
          );
        if (path === '/api/admin/blacklist' && method === 'POST') {
          const b = await body(req),
            entry = blacklistValue(b.value);
          if (typeof b.note !== 'string' || b.note.length > 300) fail('Заметка — до 300 символов');
          if (access.protectedOwner(entry)) fail('Продавца нельзя добавить в чёрный список');
          const id = token().slice(0, 20);
          try {
            db.prepare('INSERT INTO blacklist VALUES(?,?,?,?,1,?)').run(
              id,
              entry.type,
              entry.value,
              b.note.trim(),
              Date.now(),
            );
          } catch (e) {
            if (String(e.message).includes('UNIQUE')) fail('Этот пользователь уже есть в списке');
            throw e;
          }
          audit('blacklist.add');
          return send(res, { id }, 201);
        }
        if (/^\/api\/admin\/blacklist\/[\w-]+$/.test(path) && method === 'PATCH') {
          const b = await body(req);
          if (typeof b.active !== 'boolean') fail('Проверьте состояние записи');
          const entry = db
            .prepare('SELECT * FROM blacklist WHERE id=?')
            .get(path.split('/').at(-1));
          if (!entry) fail('Запись не найдена', 404);
          if (b.active && access.protectedOwner(entry))
            fail('Продавца нельзя добавить в чёрный список');
          db.prepare('UPDATE blacklist SET active=? WHERE id=?').run(Number(b.active), entry.id);
          audit('blacklist.toggle');
          return send(res, { ok: true });
        }
        if (/^\/api\/admin\/blacklist\/[\w-]+$/.test(path) && method === 'DELETE') {
          await body(req);
          const r = db.prepare('DELETE FROM blacklist WHERE id=?').run(path.split('/').at(-1));
          if (!r.changes) fail('Запись не найдена', 404);
          audit('blacklist.remove');
          return send(res, { ok: true });
        }
        const receiptFileRoute = path.match(/^\/api\/admin\/gateway\/receipts\/([a-f0-9-]+)$/);
        if (receiptFileRoute && method === 'GET') {
          const file = gateway.receiptFile(receiptFileRoute[1]); if (!file) fail('Файл не найден', 404);
          res.writeHead(200, {'Content-Type': file.mime, 'Content-Disposition': 'inline; filename="receipt.' + (file.mime === 'application/pdf' ? 'pdf' : file.mime.split('/')[1]) + '"', 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox"});
          return res.end(Buffer.from(file.data));
        }
        const receiptListRoute = path.match(/^\/api\/admin\/gateway\/(FK-[A-F0-9-]+)\/receipts$/);
        if (receiptListRoute && method === 'GET') return send(res, gateway.receipts(receiptListRoute[1]));
        if (path === '/api/admin/gateway/bootstrap' && method === 'POST') {
          const b = await body(req); return send(res, gateway.bootstrap(b.text, 'admin-panel', b.confirmed));
        }
        if (path === '/api/admin/gateway' && method === 'GET') return send(res, gateway.admin());
        if (path === '/api/admin/gateway' && method === 'PUT') {
          const result = gateway.saveConfig(await body(req)); audit('gateway.settings'); return send(res, result);
        }
        if (/^\/api\/admin\/gateway\/FK-[A-F0-9-]+\/confirm$/.test(path) && method === 'POST') {
          await body(req); await gateway.confirm(path.split('/')[4], 'panel'); return send(res, { ok: true });
        }
        if (path === '/api/admin/state' && method === 'GET') return send(res, state());
        if (path === '/api/admin/state' && method === 'PUT')
          return saveState(req, res, await body(req));
        if (path === '/api/admin/analytics' && method === 'GET') {
          const zone = url.searchParams.get('timeZone') ?? 'Europe/Moscow';
          try {
            new Intl.DateTimeFormat('ru', { timeZone: zone });
          } catch {
            fail('Некорректный часовой пояс');
          }
          return send(
            res,
            analytics(db, Object.fromEntries([...url.searchParams, ['timeZone', zone]])),
          );
        }
        if (path === '/api/admin/audit' && method === 'GET')
          return send(res, db.prepare('SELECT * FROM audit ORDER BY at DESC LIMIT 50').all());
        if (path === '/api/admin/links' && method === 'GET') {
          const s = state();
          return send(
            res,
            db
              .prepare('SELECT * FROM links ORDER BY created_at DESC')
              .all()
              .map((l) => ({
                id: l.id,
                productId: l.product_id,
                label: l.label,
                active: !!l.active,
                createdAt: l.created_at,
                url: directLink(s.settings, l.token),
                startParam: 'p_' + l.token,
                opens: db
                  .prepare("SELECT count(*) AS n FROM events WHERE type='link_open' AND link_id=?")
                  .get(l.id).n,
              })),
          );
        }
        if (path === '/api/admin/links' && method === 'POST') {
          const b = await body(req),
            s = state();
          if (!s.catalog.products.some((p) => p.id === b.productId)) fail('Товар не найден', 404);
          if (!s.settings.botUsername) fail('Сначала укажите username бота в настройках');
          if (typeof b.label !== 'string' || b.label.length > 100)
            fail('Название ссылки — до 100 символов');
          const id = token().slice(0, 16),
            code = token();
          db.prepare('INSERT INTO links VALUES(?,?,?,?,1,?)').run(
            id,
            code,
            b.productId,
            b.label.trim() || 'Прямая ссылка',
            Date.now(),
          );
          audit('link.create');
          return send(res, { id, url: directLink(s.settings, code), startParam: 'p_' + code }, 201);
        }
        if (/^\/api\/admin\/links\/[\w-]+$/.test(path) && method === 'PATCH') {
          const b = await body(req);
          if (typeof b.active !== 'boolean') fail('Проверьте состояние ссылки');
          const r = db
            .prepare('UPDATE links SET active=? WHERE id=?')
            .run(Number(b.active), path.split('/').at(-1));
          if (!r.changes) fail('Ссылка не найдена', 404);
          audit('link.toggle');
          return send(res, { ok: true });
        }
        if (path === '/api/admin/reviews' && method === 'GET')
          return send(
            res,
            db.prepare('SELECT r.*,m.external_id FROM reviews r LEFT JOIN channel_review_map m ON m.review_id=r.id ORDER BY r.updated_at DESC').all().map(reviewRow),
          );
        if (/^\/api\/admin\/reviews\/[\w-]+$/.test(path) && method === 'PATCH') {
          const b = await body(req);
          if (
            !['published', 'hidden', 'pending'].includes(b.status) ||
            typeof b.reply !== 'string' ||
            b.reply.length > 2000
          )
            fail('Проверьте статус и ответ');
          const r = db
            .prepare('UPDATE reviews SET status=?,reply=?,updated_at=? WHERE id=?')
            .run(b.status, b.reply.trim(), Date.now(), path.split('/').at(-1));
          if (!r.changes) fail('Отзыв не найден', 404);
          audit('review.moderate');
          return send(res, { ok: true });
        }
        fail('Метод панели не найден', 404);
      }
      if (path === '/api/wallet' && method === 'GET') return send(res, gateway.wallet(paymentOwner(req,res)));
      if (path === '/api/wallet/topups' && method === 'POST') {
        const owner = paymentOwner(req,res), user = access.identity(req);
        if (env.NODE_ENV === 'production' && !user) fail('Откройте магазин через Telegram',401);
        limit('payment:'+owner,20);
        return send(res,gateway.createTopup(owner,user?.id ?? '',await body(req)),201);
      }
      if (path === '/api/payments' && method === 'GET') return send(res, gateway.list(paymentOwner(req, res)));
      if (path === '/api/payments' && method === 'POST') {
        const v = paymentOwner(req, res); limit('payment:' + v, 20);
        const user = access.identity(req);
        if (env.NODE_ENV === 'production' && !user) fail('Откройте магазин через Telegram', 401);
        return send(res, gateway.create(v, user?.id ?? '', await body(req)), 201);
      }
      const paymentRoute = path.match(/^\/api\/payments\/(FK-[A-F0-9-]+)(?:\/(retry|events|receipt))?$/);
      if (paymentRoute) {
        const [, id, action] = paymentRoute, v = paymentOwner(req, res);
        const p = gateway.own(id, v);
        if (!action && method === 'GET') return send(res, gateway.view(p));
        if (action === 'retry' && method === 'POST') { limit('payment:' + v, 20); return send(res, gateway.retry(id, v, await body(req)), 201); }
        if (action === 'receipt' && method === 'POST') {
          limit('receipt:' + v, 10, 3600000);
          const chunks = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > 12 * 1024 * 1024) fail('Квитанция — до 12 МБ', 413); chunks.push(chunk); }
          return send(res, gateway.upload(id, v, Buffer.concat(chunks)), 201);
        }
        if (action === 'events' && method === 'GET') {
          limit('payment-stream:' + v, 30);
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
          const push = () => { if (!res.destroyed) res.write('data: ' + JSON.stringify(gateway.view(p)) + '\n\n'); };
          push(); gateway.events.on('change', push);
          const timer = setInterval(push, 1000); timer.unref();
          res.on('close', () => { clearInterval(timer); gateway.events.off('change', push); });
          return;
        }
        fail('Метод оплаты не найден', 404);
      }
      if (path.startsWith('/api/links/') && method === 'GET') {
        const code = path.split('/').at(-1);
        const link = db.prepare('SELECT * FROM links WHERE token=? AND active=1').get(code);
        const s = state();
        if (!link || !available(s, link.product_id)) fail('Ссылка отключена или товар скрыт', 404);
        return send(res, { productId: link.product_id, linkId: link.id });
      }
      if (path === '/api/reviews' && method === 'GET') {
        const v = visitor(req, res),
          s = state();
        const rows = db
          .prepare(
            "SELECT r.*,m.external_id FROM reviews r LEFT JOIN channel_review_map m ON m.review_id=r.id WHERE (r.status='published' AND r.created_at<=?) OR r.visitor_id=? ORDER BY r.created_at DESC",
          )
          .all(options.importNow?.() ?? Date.now(),v);
        return send(
          res,
          rows
            .filter((r) => available(s, r.product_id))
            .map((r) => ({ ...reviewRow(r), own: r.visitor_id === v })),
        );
      }
      if (path === '/api/reviews' && method === 'POST') {
        const b = await body(req),
          v = visitor(req, res),
          s = state();
        limit('review:' + v, 20, 3600000);
        if (!available(s, b.productId)) fail('Предложение недоступно', 404);
        if (
          typeof b.author !== 'string' ||
          !b.author.trim() ||
          b.author.length > 60 ||
          typeof b.text !== 'string' ||
          !b.text.trim() ||
          b.text.length > 2000 ||
          !Number.isInteger(b.rating) ||
          b.rating < 1 ||
          b.rating > 5
        )
          fail('Проверьте имя, текст и оценку');
        const old = db
            .prepare('SELECT * FROM reviews WHERE visitor_id=? AND product_id=?')
            .get(v, b.productId),
          now = Date.now(),
          id = old?.id ?? token().slice(0, 20);
        db.prepare(
          `INSERT INTO reviews VALUES(?,?,?,?,?,?,?,'',?,?) ON CONFLICT(visitor_id,product_id) DO UPDATE SET author=excluded.author,rating=excluded.rating,text=excluded.text,status=excluded.status,updated_at=excluded.updated_at`,
        ).run(
          id,
          v,
          b.productId,
          b.author.trim(),
          b.rating,
          b.text.trim(),
          s.settings.moderateReviews ? 'pending' : 'published',
          now,
          now,
        );
        return send(res, {
          ...reviewRow(db.prepare('SELECT * FROM reviews WHERE id=?').get(id)),
          own: true,
        });
      }
      if (path === '/api/events' && method === 'POST') {
        const b = await body(req);
        const s = state();
        if (!s.settings.analyticsEnabled || isAdmin(req) || access.seller(access.proof(req)))
          return send(res, { ok: true });
        const v = visitor(req, res);
        limit('events:' + v, 120);
        if (!Array.isArray(b.events) || b.events.length > 50) fail('Пакет — до 50 событий');
        const now = Date.now();
        const insert = db.prepare(
          'INSERT OR IGNORE INTO events(id,visitor_id,session_id,type,product_id,at,duration_ms,quantity,link_id,view_id,product_ids) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        );
        const parsed = b.events
          .map((e) => {
            if (
              !e ||
              !eventTypes.includes(e.type) ||
              typeof e.id !== 'string' ||
              !/^[-\w]{10,80}$/.test(e.id) ||
              typeof e.sessionId !== 'string' ||
              !/^[-\w]{10,80}$/.test(e.sessionId)
            )
              fail('Некорректное событие');
            if (e.productId && !available(s, e.productId)) return null;
            if (
              [
                'product_view',
                'product_click',
                'product_time',
                'cart_add',
                'cart_remove',
                'cart_quantity',
                'favorite_add',
                'request_submit',
              ].includes(e.type) &&
              !e.productId
            )
              fail('Укажите товар');
            const at = Number(e.at);
            if (!Number.isFinite(at) || at > now + 60000 || at < now - 86400000) return null;
            const duration =
              e.type === 'product_time'
                ? Math.min(15000, Math.max(0, Math.round(Number(e.durationMs) || 0)))
                : 0;
            const quantity = Math.min(10000, Math.max(0, Math.round(Number(e.quantity) || 0)));
            const viewId =
              typeof e.viewId === 'string' && /^[-\w]{10,80}$/.test(e.viewId) ? e.viewId : '';
            if (e.type === 'product_time' && !viewId) fail('Укажите просмотр');
            let linkId = '';
            if (e.linkId) {
              const l = db
                .prepare('SELECT id FROM links WHERE id=? AND active=1 AND product_id=?')
                .get(String(e.linkId), e.productId ?? '');
              if (l) linkId = l.id;
            }
            const productIds = Array.isArray(e.productIds)
              ? [
                  ...new Set(
                    e.productIds.filter((id) => typeof id === 'string' && available(s, id)),
                  ),
                ].slice(0, 100)
              : [];
            return [
              e.id,
              v,
              e.sessionId,
              e.type,
              e.productId ?? '',
              at,
              duration,
              quantity,
              linkId,
              viewId,
              JSON.stringify(productIds),
            ];
          })
          .filter(Boolean);
        db.exec('BEGIN');
        try {
          for (const event of parsed) insert.run(...event);
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
        return send(res, { ok: true });
      }
      if (path.startsWith('/api/')) fail('Метод не найден', 404);
      if (!['GET', 'HEAD'].includes(method)) fail('Метод не разрешён', 405);
      const file = resolve(
        root,
        'dist',
        '.' + decodeURIComponent(path === '/' ? '/index.html' : path),
      );
      if (!file.startsWith(resolve(root, 'dist') + '/')) fail('Не найдено', 404);
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) fail('Не найдено', 404);
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.woff2': 'font/woff2',
        '.gif': 'image/gif',
        '.avif': 'image/avif',
      };
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': path.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      });
      if (method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
    } catch (error) {
      if (res.headersSent) return res.end();
      const status = error.status ?? 400;
      if (status >= 500 && !error.code) console.error(error);
      send(
        res,
        { error: error.message ?? 'Ошибка сервера', ...(error.code ? { code: error.code } : {}) },
        status,
      );
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const cleanup = setInterval(() => {
    db.prepare('DELETE FROM events WHERE at<?').run(Date.now() - 180 * 86400000);
    db.prepare('DELETE FROM admins WHERE expires<?').run(Date.now());
  }, 3600000);
  cleanup.unref();
  server.on('close', () => {
    clearInterval(cleanup);
    clearInterval(importTimer);
    gateway.stop();
    db.close();
  });
  if (options.gatewayWorker !== false && env.NODE_ENV !== 'test') gateway.start();
  return { server, db, gateway, channelImport };
}
export async function startServer() {
  const { server } = await createApp();
  const host = process.env.HOST ?? '127.0.0.1',
    port = Number(process.env.PORT ?? 8787);
  server.listen(port, host, () => console.log(`фиКУС API: http://${host}:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await startServer();
