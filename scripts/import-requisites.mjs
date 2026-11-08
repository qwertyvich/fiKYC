// Private initial setup only. This script performs no Telegram API calls.
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { bootstrapRequisites } from '../server/gateway/bootstrap.mjs';
if (!process.env.DATABASE_PATH || !process.argv[2] || !process.argv.includes('--confirmed-current')) throw new Error('Supply DATABASE_PATH, a private text file and --confirmed-current');
const db = new DatabaseSync(process.env.DATABASE_PATH);
db.exec('PRAGMA busy_timeout=5000');
try { console.log(JSON.stringify(bootstrapRequisites(db, await readFile(process.argv[2], 'utf8'), { confirmed: true, actor: 'owner-private-import' }))); }
finally { db.close(); }
