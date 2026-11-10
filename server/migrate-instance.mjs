// Offline migration only. Never starts Telegram workers or replaces the catalog.
import {createCipheriv,randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

export function migrateInstance(db,{oldToken,newToken,newUsername,operatorUsername,encryptionKey,origin,now=Date.now()}) {
  const pattern=/^[1-9]\d{4,15}:[A-Za-z0-9_-]{25,100}$/;
  if(!pattern.test(oldToken??'')||!pattern.test(newToken??''))throw Error('Valid source and destination bot tokens are required');
  if(!/^[a-f0-9]{64}$/i.test(encryptionKey??''))throw Error('Keep the original BOTS_ENCRYPTION_KEY');
  const username=String(newUsername??'').replace(/^@/,'');
  const operator=String(operatorUsername??'').replace(/^@/,'');
  if(!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username)||!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(operator))throw Error('Invalid bot or operator username');
  const url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.origin!==origin.replace(/\/$/,''))throw Error('Use the exact HTTPS origin');
  const oldId=oldToken.split(':')[0],newId=newToken.split(':')[0];
  if(oldId===newId)throw Error('This migration expects a new primary bot');
  if(db.prepare("SELECT COUNT(*) n FROM payments WHERE status='awaiting_transfer' AND expires_at>?").get(now).n)throw Error('Wait for active transfer timers before migrating');
  const original=db.prepare('SELECT * FROM state WHERE id=1').get();
  const oldBot=db.prepare('SELECT * FROM shop_bots WHERE id=?').get(oldId);
  if(!original||!oldBot)throw Error('The source database does not match the source bot');
  const catalogSha=createHash('sha256').update(original.catalog).digest('hex');
  const shop={...JSON.parse(original.shop),supportTelegram:operator};
  const settings={...JSON.parse(original.settings),botUsername:username,appShortName:''};
  const gatewayRow=db.prepare('SELECT json FROM gateway_config WHERE id=1').get();
  const gateway=JSON.parse(gatewayRow.json),nextRecipient='@'+operator;
  const stateChanged=original.shop!==JSON.stringify(shop)||original.settings!==JSON.stringify(settings);
  const recipientChanged=gateway.receiptRecipient.replace(/^@/,'').toLowerCase()!==operator.toLowerCase();
  let createdPrimary=false;
  db.exec('BEGIN IMMEDIATE');
  try {
    let main=db.prepare('SELECT * FROM shop_bots WHERE id=?').get(newId);
    if(main&&!main.primary_bot)throw Error('Destination bot is already registered as a different funnel');
    if(!main){
      const values={...oldBot,id:newId,username,primary_bot:1,encrypted_token:'',enabled:1,created_at:now,enabled_at:now,
        offset:0,last_poll:0,error:'',emoji_warning:0,applied_at:0,main_app:0,animation_file:''};
      const columns=db.prepare('PRAGMA table_info(shop_bots)').all().map(c=>c.name);
      db.prepare('INSERT INTO shop_bots('+columns.map(c=>'"'+c+'"').join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(c=>values[c]));
      const avatar=db.prepare('SELECT data FROM shop_bot_avatars WHERE bot_id=?').get(oldId);
      if(avatar)db.prepare('INSERT OR IGNORE INTO shop_bot_avatars VALUES(?,?,?)').run(newId,avatar.data,now);
      createdPrimary=true;
    }
    if(oldBot.primary_bot){
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(encryptionKey,'hex'),iv);
      const encrypted=Buffer.concat([cipher.update(oldToken,'utf8'),cipher.final()]);
      const stored=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
      db.prepare('UPDATE shop_bots SET primary_bot=0,encrypted_token=? WHERE id=?').run(stored,oldId);
    }
    if(stateChanged)db.prepare('UPDATE state SET revision=revision+1,shop=?,settings=? WHERE id=1').run(JSON.stringify(shop),JSON.stringify(settings));
    if(gateway.receiptRecipient!==nextRecipient)db.prepare('UPDATE gateway_config SET json=? WHERE id=1').run(JSON.stringify({...gateway,receiptRecipient:nextRecipient}));
    if(recipientChanged)db.prepare("DELETE FROM gateway_meta WHERE key='recipientId'").run();
    if(stateChanged||recipientChanged||createdPrimary)db.prepare('INSERT INTO audit(action,at) VALUES(?,?)').run('instance.migrate:'+newId+':'+url.hostname,now);
    const after=db.prepare('SELECT catalog FROM state WHERE id=1').get().catalog;
    if(after!==original.catalog)throw Error('Catalog must remain byte-for-byte unchanged');
    db.exec('COMMIT');
  } catch(e){db.exec('ROLLBACK');throw e;}
  return {catalogSha,revision:db.prepare('SELECT revision FROM state WHERE id=1').get().revision,newBotId:newId,newUsername:username,operator,
    legacyBotPreserved:true,adminIdentityPreserved:true,recipientNeedsStart:!db.prepare("SELECT value FROM gateway_meta WHERE key='recipientId'").get(),createdPrimary};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=JSON.parse(await readFile(process.argv[2],'utf8'));
  const db=new DatabaseSync(process.env.DATABASE_PATH??'/app/data/fikus.sqlite');
  try {console.log(JSON.stringify(migrateInstance(db,{...input,newToken:process.env.BOT_TOKEN,encryptionKey:process.env.BOTS_ENCRYPTION_KEY})));}
  finally {db.close();}
}
