import { parseFeed, requisiteRecord } from './parser.mjs';
export const BOOTSTRAP_TTL = 15 * 60_000;
export function bootstrapRequisites(db, text, { confirmed, actor, now = Date.now() } = {}) {
  if (confirmed !== true || !actor) throw new Error('Подтвердите актуальность реквизитов и отсутствие более позднего стопа');
  const parsed = parseFeed(text);
  if (parsed?.kind !== 'snapshot' || !parsed.cards.length) throw new Error('Нужны полные реквизиты с банком, получателем и лимитами');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare("SELECT value FROM gateway_meta WHERE key='lastFeedAt'").get()) throw new Error('Источник уже передал обновления. Начальная загрузка не должна заменять его состояние.');
    const put = (key, value) => db.prepare('INSERT INTO gateway_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
    db.prepare("UPDATE payments SET status='invalidated',reason='bootstrap_updated' WHERE status='awaiting_transfer' AND provider IN ('telegram-card','card')").run();
    db.prepare('UPDATE gateway_cards SET active=0,version=version+1').run();
    for (const c of parsed.cards.map(requisiteRecord)) db.prepare('INSERT INTO gateway_cards(number,bank,holder,min_minor,max_minor,active,version,kind,account) VALUES(?,?,?,?,?,1,1,?,?) ON CONFLICT(number) DO UPDATE SET bank=excluded.bank,holder=excluded.holder,min_minor=excluded.min_minor,max_minor=excluded.max_minor,kind=excluded.kind,account=excluded.account,active=1,version=gateway_cards.version+1').run(c.number,c.bank,c.holder,c.minMinor,c.maxMinor,c.kind,c.account);
    put('bootstrapAt', now); put('bootstrapExpiresAt', now + BOOTSTRAP_TTL);
    db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run('gateway.bootstrap:' + actor, now);
    db.exec('COMMIT');
    return { cards: parsed.cards.length, expiresAt: now + BOOTSTRAP_TTL };
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}
