// Copies catalog/settings only. Existing production data and authentication are never replaced.
import { readFile, stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/index.mjs';
import { parseCatalog } from '../src/domain.ts';
import { parseShop } from '../src/commerce.ts';
import { parseSettings } from '../server/settings.mjs';
const input = process.argv[2];
if (!input || !process.env.DATABASE_PATH) throw new Error('Supply seed file and DATABASE_PATH');
const path = process.env.DATABASE_PATH;
let initialized = false;
if (await stat(path).catch(() => null)) {
  const existing = new DatabaseSync(path, { readOnly: true });
  try {
    initialized = !!existing.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='state'").get() && !!existing.prepare('SELECT id FROM state WHERE id=1').get();
  } finally { existing.close(); }
}
if (initialized) {
  console.log('Existing production state preserved; bootstrap skipped.');
} else {
  const seed = JSON.parse(await readFile(input, 'utf8'));
  const catalog = parseCatalog(seed.catalog), shop = parseShop(seed.shop), settings = parseSettings(seed.settings);
  const app = await createApp({ gatewayWorker: false });
  try {
    app.db.prepare('UPDATE state SET catalog=?,shop=?,settings=?,revision=revision+1 WHERE id=1').run(JSON.stringify(catalog), JSON.stringify(shop), JSON.stringify(settings));
    console.log('Initial catalog and shop settings imported.');
  } finally { app.gateway.stop(); app.db.close(); }
}
