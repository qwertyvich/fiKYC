// Keep actual purchases separate from imported historical buyer totals. Reimporting
// reviews must not erase purchases made in the shop or count them twice.
export function ensurePurchaseStats(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS product_purchases(
    root_id TEXT NOT NULL,product_id TEXT NOT NULL,buyer_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity>0),confirmed_at INTEGER NOT NULL,
    PRIMARY KEY(root_id,product_id));
    CREATE INDEX IF NOT EXISTS product_purchases_buyers ON product_purchases(product_id,buyer_id);`);
}
export function recordPurchase(db, payment, root, at) {
  if (payment.purpose !== 'order') return;
  const buyer = /^\d+$/.test(payment.telegram_id ?? '') ? 'tg:' + payment.telegram_id : 'visitor:' + payment.visitor_id;
  const insert = db.prepare('INSERT OR IGNORE INTO product_purchases VALUES(?,?,?,?,?)');
  for (const item of JSON.parse(payment.items)) insert.run(root,item.productId,buyer,item.quantity,at);
}
export function migratePurchaseStats(db, now) {
  ensurePurchaseStats(db);
  if (db.prepare("SELECT value FROM secrets WHERE key='migration.purchase-stats-v1'").get()) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const parents = new Map(db.prepare('SELECT id,retry_of FROM payments').all().map(p=>[p.id,p.retry_of]));
    for (const p of db.prepare("SELECT * FROM payments WHERE status='paid' AND purpose='order' ORDER BY paid_at,created_at").all()) {
      let root=p.id;const seen=new Set();
      while(parents.get(root)&&!seen.has(root)){seen.add(root);root=parents.get(root);}
      recordPurchase(db,p,root,p.paid_at??p.created_at);
    }
    db.prepare("INSERT INTO secrets VALUES('migration.purchase-stats-v1',?)").run(String(now));
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK');throw e; }
}
