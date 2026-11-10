import { token, digest, telegramUser } from './security.mjs';
export function normalizeUsername(value) {
  return String(value ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}
export function blacklistValue(value) {
  if (typeof value !== 'string') throw new Error('Укажите username или Telegram ID');
  const normalized = value.trim();
  if (/^[1-9]\d{0,15}$/.test(normalized) && Number.isSafeInteger(Number(normalized)))
    return { type: 'id', value: normalized };
  const username = normalizeUsername(normalized);
  if (!/^[a-z][a-z0-9_]{4,31}$/.test(username))
    throw new Error('Укажите @username или числовой Telegram ID');
  return { type: 'username', value: username };
}
export function createAccess({ db, env, state, cookies, setCookie, botTokens = () => env.BOT_TOKEN }) {
  const addColumns = (table, columns) => {
    const existing = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((c) => c.name);
    for (const [name, type] of Object.entries(columns))
      if (!existing.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  };
  addColumns('visitors', {
    telegram_id: "TEXT NOT NULL DEFAULT ''",
    telegram_username: "TEXT NOT NULL DEFAULT ''",
    verified_at: 'INTEGER NOT NULL DEFAULT 0',
  });
  addColumns('admins', {
    telegram_id: "TEXT NOT NULL DEFAULT ''",
    telegram_username: "TEXT NOT NULL DEFAULT ''",
    method: "TEXT NOT NULL DEFAULT 'password'",
  });
  db.exec(`CREATE TABLE IF NOT EXISTS blacklist(id TEXT PRIMARY KEY,type TEXT NOT NULL,value TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,UNIQUE(type,value));
    CREATE TABLE IF NOT EXISTS seller_bindings(username TEXT PRIMARY KEY,telegram_id TEXT NOT NULL);`);
  const proofKey = Symbol('telegram-proof');
  function proof(req) {
    if (!(proofKey in req))
      req[proofKey] = telegramUser(req.headers['x-telegram-init-data'], botTokens());
    return req[proofKey];
  }
  const visitorRow = (req) => {
    const secret = cookies(req).fikus_visitor;
    return secret ? db.prepare('SELECT * FROM visitors WHERE token=?').get(digest(secret)) : null;
  };
  function identity(req) {
    const user = proof(req);
    if (user) return { id: String(user.id), username: normalizeUsername(user.username) };
    const v = visitorRow(req);
    return v?.telegram_id && v.verified_at > Date.now() - 12 * 3600000
      ? { id: v.telegram_id, username: v.telegram_username }
      : null;
  }
  function owners() {
    const s = state().settings;
    return {
      ids: [...(env.ADMIN_TELEGRAM_IDS ?? '').split(','), ...(s.adminTelegramIds ?? '').split(',')]
        .map((v) => v.trim())
        .filter(Boolean),
      names: [env.SELLER_TELEGRAM_USERNAME, s.sellerUsername]
        .map(normalizeUsername)
        .filter(Boolean),
    };
  }
  function seller(user) {
    if (!user) return false;
    const configured = owners();
    const id = String(user.id),
      username = normalizeUsername(user.username);
    if (configured.ids.includes(id)) return true;
    for (const name of configured.names) {
      const binding = db
        .prepare('SELECT telegram_id FROM seller_bindings WHERE username=?')
        .get(name);
      if (binding?.telegram_id === id) return true;
      if (!binding && name === username) {
        db.prepare('INSERT OR IGNORE INTO seller_bindings VALUES(?,?)').run(name, id);
        return (
          db.prepare('SELECT telegram_id FROM seller_bindings WHERE username=?').get(name)
            ?.telegram_id === id
        );
      }
    }
    return false;
  }
  const localAdminAllowed = (req) =>
    env.NODE_ENV !== 'production' &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  function admin(req) {
    const t = cookies(req).fikus_admin;
    if (!t) return false;
    const session = db
      .prepare('SELECT * FROM admins WHERE token=? AND expires>?')
      .get(digest(t), Date.now());
    if (!session) return false;
    return session.method === 'password'
      ? localAdminAllowed(req)
      : seller({ id: session.telegram_id, username: session.telegram_username });
  }
  function visitor(req, res) {
    const user = proof(req);
    let v = visitorRow(req);
    if (!v || (user && v.telegram_id && v.telegram_id !== String(user.id))) {
      const id = token().slice(0, 16),
        secret = token();
      db.prepare('INSERT INTO visitors(id,token,created_at) VALUES(?,?,?)').run(
        id,
        digest(secret),
        Date.now(),
      );
      setCookie(res, 'fikus_visitor', secret, 15552000);
      v = { id };
    }
    if (user)
      db.prepare(
        'UPDATE visitors SET telegram_id=?,telegram_username=?,verified_at=? WHERE id=?',
      ).run(String(user.id), normalizeUsername(user.username), Date.now(), v.id);
    return v.id;
  }
  function blocked(user) {
    return (
      !!user &&
      !!db
        .prepare(
          "SELECT id FROM blacklist WHERE active=1 AND ((type='id' AND value=?) OR (type='username' AND value=?)) LIMIT 1",
        )
        .get(String(user.id), normalizeUsername(user.username))
    );
  }
  function status(req) {
    const user = identity(req),
      owner = admin(req) || seller(proof(req));
    return {
      isSeller: owner,
      localAdminLogin: localAdminAllowed(req),
      blocked: !owner && blocked(user),
      telegramRequired: env.NODE_ENV === 'production' && !owner && !user,
      botUrl: state().settings.botUsername ? `https://t.me/${state().settings.botUsername}` : null,
    };
  }
  function guard(req) {
    const result = status(req);
    if (result.blocked)
      throw Object.assign(new Error('Магазин временно недоступен'), {
        status: 503,
        code: 'maintenance',
      });
    if (result.telegramRequired)
      throw Object.assign(new Error('Откройте магазин через Telegram'), {
        status: 401,
        code: 'telegram_required',
      });
  }
  function protectedOwner(entry) {
    const o = owners();
    return entry.type === 'username'
      ? o.names.includes(entry.value)
      : o.ids.includes(entry.value) ||
          !!db
            .prepare('SELECT username FROM seller_bindings WHERE telegram_id=?')
            .all(entry.value)
            .find((b) => o.names.includes(b.username));
  }
  return {
    proof,
    identity,
    seller,
    admin,
    visitor,
    blocked,
    status,
    guard,
    localAdminAllowed,
    protectedOwner,
  };
}
