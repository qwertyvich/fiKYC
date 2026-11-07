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
import { analytics } from './analytics.mjs';

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
  function isAdmin(req) {
    const t = cookies(req).fikus_admin;
    return (
      !!t &&
      !!db
        .prepare('SELECT token FROM admins WHERE token=? AND expires>?')
        .get(digest(t), Date.now())
    );
  }
  function visitor(req, res) {
    const t = cookies(req).fikus_visitor;
    let v = t ? db.prepare('SELECT id FROM visitors WHERE token=?').get(digest(t)) : null;
    if (!v) {
      const id = token().slice(0, 16),
        secret = token();
      db.prepare('INSERT INTO visitors VALUES(?,?,?)').run(id, digest(secret), Date.now());
      setCookie(res, 'fikus_visitor', secret, 15552000);
      v = { id };
    }
    return v.id;
  }
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
  });
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
      if (path === '/api/public' && method === 'GET') {
        visitor(req, res);
        const s = state();
        const { botUsername, appShortName, adminTelegramIds, ...publicSettings } = s.settings;
        return send(res, {
          revision: s.revision,
          catalog: publicCatalog(s.catalog),
          shop: s.shop,
          settings: publicSettings,
        });
      }
      if (path === '/api/admin/session' && method === 'GET')
        return send(res, { authenticated: isAdmin(req), telegramAvailable: !!env.BOT_TOKEN });
      if (path === '/api/admin/login' && method === 'POST') {
        limit('login:' + (req.socket.remoteAddress ?? ''), 10, 15 * 60000);
        const b = await body(req);
        const s = state();
        const user = telegramUser(b.initData, env.BOT_TOKEN);
        const allowedIds = [
          ...(env.ADMIN_TELEGRAM_IDS ?? '').split(','),
          ...(s.settings.adminTelegramIds ?? '').split(','),
        ]
          .map((s) => s.trim())
          .filter(Boolean);
        const passwordOk =
          !!env.ADMIN_PASSWORD &&
          typeof b.password === 'string' &&
          b.password.length <= 1024 &&
          equal(b.password, env.ADMIN_PASSWORD);
        if (!passwordOk && !(user && allowedIds.includes(String(user.id))))
          fail('Неверный пароль или нет доступа к панели', 401);
        const secret = token();
        db.prepare('DELETE FROM admins WHERE expires<?').run(Date.now());
        db.prepare('INSERT INTO admins VALUES(?,?)').run(digest(secret), Date.now() + 12 * 3600000);
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
            db.prepare('SELECT * FROM reviews ORDER BY updated_at DESC').all().map(reviewRow),
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
            "SELECT * FROM reviews WHERE status='published' OR visitor_id=? ORDER BY created_at DESC",
          )
          .all(v);
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
        if (!s.settings.analyticsEnabled || isAdmin(req)) return send(res, { ok: true });
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
      if (status >= 500) console.error(error);
      send(res, { error: error.message ?? 'Ошибка сервера' }, status);
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
    db.close();
  });
  return { server, db };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = await createApp();
  const host = process.env.HOST ?? '127.0.0.1',
    port = Number(process.env.PORT ?? 8787);
  server.listen(port, host, () => console.log(`фиКУС API: http://${host}:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
}
