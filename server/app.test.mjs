import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.mjs';
import { telegramUser } from './security.mjs';
const password = 'fixture-admin-password';
const botToken = 'fixture-bot-token';
function signed(user = { id: 123456, first_name: 'Owner' }, at = Math.floor(Date.now() / 1000)) {
  const p = new URLSearchParams({
    auth_date: String(at),
    query_id: 'fixture-query',
    user: JSON.stringify(user),
  });
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  p.set(
    'hash',
    createHmac('sha256', secret)
      .update(
        [...p]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      )
      .digest('hex'),
  );
  return p.toString();
}
async function fixture(t, dbPath = ':memory:', extraEnv = {}) {
  const app = await createApp({
    dbPath,
    env: {
      ADMIN_PASSWORD: password,
      BOT_TOKEN: botToken,
      ADMIN_TELEGRAM_IDS: '123456',
      NODE_ENV: 'test',
      SELLER_TELEGRAM_USERNAME: '',
      ...extraEnv,
    },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  function client() {
    let cookie = '';
    return async (path, method = 'GET', data, headers = {}) => {
      const response = await fetch(base + '/api' + path, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(data ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      const set = response.headers.getSetCookie();
      if (set.length) {
        const map = new Map(
          cookie
            .split('; ')
            .filter(Boolean)
            .map((c) => c.split('=')),
        );
        for (const c of set) {
          const [k, v] = c.split(';')[0].split('=');
          map.set(k, v);
        }
        cookie = [...map].map(([k, v]) => k + '=' + v).join('; ');
      }
      return { status: response.status, data: await response.json(), headers: response.headers };
    };
  }
  const admin = client();
  assert.equal(
    (
      await admin(
        '/admin/login',
        'POST',
        extraEnv.NODE_ENV === 'production' ? { initData: signed() } : { password },
      )
    ).status,
    200,
  );
  return { ...app, admin, client };
}
test('protected catalog, server validation, cross-browser data and optimistic conflicts', async (t) => {
  const { admin, client } = await fixture(t),
    guest = client();
  assert.equal((await guest('/admin/state')).status, 401);
  assert.equal((await guest('/admin/state', 'PUT', {})).status, 401);
  assert.equal((await guest('/admin/login', 'POST', { password: 'wrong' })).status, 401);
  assert.equal(
    (await guest('/admin/login', 'POST', { password }, { Origin: 'https://foreign.test' })).status,
    403,
  );
  const { data: s } = await admin('/admin/state');
  const id = s.catalog.products[0].id;
  const changed = structuredClone(s.catalog);
  changed.products[0].visible = false;
  changed.products[1].price = 123.45;
  changed.productOrder = changed.products.map((p) => p.id).reverse();
  const save = await admin('/admin/state', 'PUT', { revision: s.revision, catalog: changed });
  assert.equal(save.status, 200);
  assert.equal(
    (await admin('/admin/state', 'PUT', { revision: s.revision, catalog: s.catalog })).status,
    409,
  );
  const pub = (await guest('/public')).data;
  assert.equal(
    pub.catalog.products.some((p) => p.id === id),
    false,
  );
  assert.equal(pub.catalog.productOrder.includes(id), false);
  assert.equal(pub.catalog.products.find((p) => p.id === changed.products[1].id).price, 123.45);
  assert.equal(pub.settings.adminTelegramIds, undefined);
  const malformed = structuredClone(changed);
  malformed.products[1].price = -1;
  assert.equal(
    (await admin('/admin/state', 'PUT', { revision: save.data.revision, catalog: malformed }))
      .status,
    400,
  );
  assert.equal((await admin('/admin/logout', 'POST', {})).status, 200);
  assert.equal((await admin('/admin/state')).status, 401);
});
test('opaque Telegram links are admin-only, unique, revocable and respect hidden products', async (t) => {
  const { admin, client } = await fixture(t),
    guest = client();
  let s = (await admin('/admin/state')).data;
  const productId = s.catalog.products[0].id;
  assert.equal((await admin('/admin/links', 'POST', { productId, label: 'Channel' })).status, 400);
  s = (
    await admin('/admin/state', 'PUT', {
      revision: s.revision,
      settings: { ...s.settings, botUsername: '@fixture_shop_bot' },
    })
  ).data;
  const first = await admin('/admin/links', 'POST', { productId, label: 'Channel' }),
    second = await admin('/admin/links', 'POST', { productId, label: 'Private chat' });
  assert.equal(first.status, 201);
  assert.notEqual(first.data.url, second.data.url);
  assert.match(first.data.url, /^https:\/\/t.me\/fixture_shop_bot\?startapp=p_[\w-]+$/);
  assert.equal((await guest('/admin/links')).status, 401);
  assert.equal(
    JSON.stringify((await guest('/public')).data).includes(first.data.startParam),
    false,
  );
  const code = first.data.startParam.slice(2);
  assert.equal((await guest('/links/' + code)).data.productId, productId);
  s.catalog.products.find((p) => p.id === productId).visible = false;
  s = (await admin('/admin/state', 'PUT', { revision: s.revision, catalog: s.catalog })).data;
  assert.equal((await guest('/links/' + code)).status, 404);
  s.catalog.products.find((p) => p.id === productId).visible = true;
  await admin('/admin/state', 'PUT', { revision: s.revision, catalog: s.catalog });
  assert.equal((await guest('/links/' + code)).status, 200);
  await admin('/admin/links/' + first.data.id, 'PATCH', { active: false });
  assert.equal((await guest('/links/' + code)).status, 404);
  assert.equal((await guest('/links/' + second.data.startParam.slice(2))).status, 200);
});
test('shared reviews: moderation, replies, own pending reviews and edits returning to moderation', async (t) => {
  const { admin, client } = await fixture(t),
    buyer = client(),
    other = client();
  const s = (await buyer('/public')).data,
    productId = s.catalog.products[0].id;
  const create = await buyer('/reviews', 'POST', {
    productId,
    author: 'Покупатель',
    rating: 5,
    text: 'Всё работает.',
  });
  assert.equal(create.status, 200);
  assert.equal(create.data.status, 'pending');
  assert.equal((await other('/reviews')).data.length, 0);
  assert.equal((await buyer('/reviews')).data[0].own, true);
  assert.equal(
    (await other('/admin/reviews/' + create.data.id, 'PATCH', { status: 'published', reply: '' }))
      .status,
    401,
  );
  await admin('/admin/reviews/' + create.data.id, 'PATCH', {
    status: 'published',
    reply: 'Спасибо!',
  });
  const visible = (await other('/reviews')).data;
  assert.equal(visible[0].rating, 5);
  assert.equal(visible[0].reply, 'Спасибо!');
  assert.equal(visible[0].own, false);
  const edit = await buyer('/reviews', 'POST', {
    productId,
    author: 'Покупатель',
    rating: 4,
    text: 'Дополняю отзыв.',
  });
  assert.equal(edit.data.id, create.data.id);
  assert.equal(edit.data.status, 'pending');
  assert.equal((await other('/reviews')).data.length, 0);
  assert.equal(
    (await buyer('/reviews', 'POST', { productId, author: 'x', rating: 99, text: 'bad' })).status,
    400,
  );
  await admin('/admin/reviews/' + create.data.id, 'PATCH', { status: 'hidden', reply: '' });
  assert.equal((await buyer('/reviews')).data[0].status, 'hidden');
});
test('analytics deduplicates retries, counts quantities and active time, and excludes administrators', async (t) => {
  const { admin, client } = await fixture(t),
    buyer = client();
  const s = (await buyer('/public')).data,
    productId = s.catalog.products[0].id,
    sessionId = randomUUID(),
    viewId = randomUUID(),
    at = Date.now();
  const event = (type, extra = {}) => ({
    id: randomUUID(),
    sessionId,
    type,
    at,
    productId,
    ...extra,
  });
  const events = [
    event('product_click'),
    event('product_view', { viewId }),
    event('product_time', { viewId, durationMs: 7000 }),
    event('cart_add', { quantity: 3 }),
    event('checkout_view', { productId: '', productIds: [productId] }),
  ];
  assert.equal((await buyer('/events', 'POST', { events })).status, 200);
  await buyer('/events', 'POST', { events });
  await admin('/events', 'POST', { events: [event('product_view', { viewId: randomUUID() })] });
  const report = (await admin('/admin/analytics?days=7&timeZone=Europe%2FMoscow')).data;
  assert.equal(report.summary.visitors, 1);
  assert.equal(report.summary.views, 1);
  assert.equal(report.summary.clicks, 1);
  assert.equal(report.summary.cartAdds, 1);
  assert.equal(report.summary.units, 3);
  assert.equal(report.summary.averageSeconds, 7);
  assert.equal(report.summary.conversion, 100);
  assert.equal(report.events.length, 4);
  assert.equal(report.products[0].averageSeconds, 7);
  assert.equal(report.events.find((e) => e.type === 'product_view').activeSeconds, 7);
  assert.equal(
    (await admin('/admin/analytics?productId=' + productId)).data.summary.checkoutViews,
    1,
  );
  const day = (await admin('/admin/analytics?from=2026-11-07&to=2026-11-07')).data.period;
  assert.equal(day.start, Date.parse('2026-11-06T21:00:00Z'));
  assert.equal(day.end, Date.parse('2026-11-07T20:59:59.999Z'));
  assert.equal(
    (await buyer('/events', 'POST', { events: [event('product_click'), event('invalid')] })).status,
    400,
  );
  assert.equal((await admin('/admin/analytics?days=7')).data.summary.clicks, 1);
  assert.equal((await buyer('/admin/analytics')).status, 401);
  assert.equal((await admin('/admin/analytics?timeZone=invalid-zone')).status, 400);
});
test('Telegram login checks signature, freshness and administrator ID', async (t) => {
  const { client } = await fixture(t);
  const guest = client();
  assert.equal(telegramUser(signed(), botToken).id, 123456);
  assert.equal(telegramUser(signed().replace('fixture-query', 'forged-query'), botToken), null);
  assert.equal(
    telegramUser(signed(undefined, Math.floor(Date.now() / 1000) - 3601), botToken),
    null,
  );
  assert.equal(
    telegramUser(signed(undefined, Math.floor(Date.now() / 1000) + 100), botToken),
    null,
  );
  assert.equal(telegramUser(signed() + '&auth_date=1', botToken), null);
  assert.equal(
    (await guest('/admin/login', 'POST', { initData: signed({ id: 999999, first_name: 'Other' }) }))
      .status,
    401,
  );
  assert.equal((await guest('/admin/login', 'POST', { initData: signed() })).status, 200);
  assert.equal((await guest('/admin/state')).status, 200);
});
test('SQLite retains catalog across server restarts', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'fikus-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'store.sqlite');
  const first = await createApp({ dbPath });
  first.db.prepare('UPDATE state SET revision=42').run();
  first.db.close();
  const second = await createApp({ dbPath });
  assert.equal(second.db.prepare('SELECT revision FROM state').get().revision, 42);
  second.db.close();
});
test('only explicitly configured legacy origins retain access after a domain migration',async t=>{
 const {admin}=await fixture(t,':memory:',{NODE_ENV:'production',PUBLIC_ORIGIN:'https://kyc.example.test',PUBLIC_ORIGIN_ALIASES:'https://old.example.test'});
 assert.equal((await admin('/admin/login','POST',{initData:signed()},{Origin:'https://old.example.test'})).status,200);
 assert.equal((await admin('/admin/login','POST',{initData:signed()},{Origin:'https://kyc.example.test'})).status,200);
 for(const origin of ['https://untrusted.test','https://old.example.test.attacker.test','http://old.example.test'])assert.equal((await admin('/admin/login','POST',{initData:signed()},{Origin:origin})).status,403);
});

test('long activity histories expose older events and sessions through pagination', async (t) => {
  const { admin, client } = await fixture(t),
    buyer = client();
  const productId = (await buyer('/public')).data.catalog.products[0].id;
  const events = Array.from({ length: 221 }, () => ({
    id: randomUUID(),
    sessionId: randomUUID(),
    type: 'product_click',
    productId,
    at: Date.now(),
  }));
  for (let i = 0; i < events.length; i += 50)
    assert.equal((await buyer('/events', 'POST', { events: events.slice(i, i + 50) })).status, 200);
  const first = (await admin('/admin/analytics')).data;
  const second = (await admin('/admin/analytics?eventPage=2&sessionPage=2')).data;
  assert.equal(first.totalEvents, 221);
  assert.equal(first.events.length, 200);
  assert.equal(second.events.length, 21);
  assert.equal(first.sessions.length, 100);
  assert.equal(second.sessions.length, 100);
  assert.equal(first.pagination.sessionPages, 3);
  assert.equal(
    second.events.some((e) => first.events.some((f) => f.id === e.id)),
    false,
  );
});

test('production accepts only verified seller identity; password and anonymous public access fail closed', async (t) => {
  const { admin, client } = await fixture(t, ':memory:', { NODE_ENV: 'production' }),
    guest = client();
  assert.equal((await guest('/admin/login', 'POST', { password })).status, 401);
  assert.equal((await guest('/public')).status, 401);
  assert.equal((await guest('/public?username=owner&user_id=123456')).status, 401);
  assert.equal((await guest('/admin/state')).status, 401);
  const access = (await guest('/access')).data;
  assert.equal(access.isSeller, false);
  assert.equal(access.localAdminLogin, false);
  assert.equal(access.telegramRequired, true);
  const forged = signed({ id: 999999, username: 'CustomerOne' }).replace('999999', '123456');
  assert.equal((await guest('/admin/login', 'POST', { initData: forged })).status, 401);
  assert.equal((await admin('/admin/state')).status, 200);
});
test('seller username is verified and bound to stable Telegram ID, not handed to a new username holder', async (t) => {
  const { admin, client } = await fixture(t, ':memory:', { ADMIN_TELEGRAM_IDS: '' });
  let state = (await admin('/admin/state')).data;
  state = (
    await admin('/admin/state', 'PUT', {
      revision: state.revision,
      settings: { ...state.settings, sellerUsername: '@Fixture_Seller' },
    })
  ).data;
  const seller = client(),
    proof = signed({ id: 700001, first_name: 'Seller', username: 'Fixture_Seller' }),
    headers = { 'X-Telegram-Init-Data': proof };
  assert.equal((await seller('/access', 'GET', undefined, headers)).data.isSeller, true);
  assert.equal((await seller('/admin/login', 'POST', { initData: proof })).status, 200);
  assert.equal((await seller('/admin/state')).status, 200);
  const transferred = client(),
    newProof = signed({ id: 700002, first_name: 'Other', username: 'fixture_seller' });
  assert.equal(
    (await transferred('/access', 'GET', undefined, { 'X-Telegram-Init-Data': newProof })).data
      .isSeller,
    false,
  );
  assert.equal((await transferred('/admin/login', 'POST', { initData: newProof })).status, 401);
  const renamed = signed({ id: 700001, first_name: 'Seller', username: 'another_name' });
  assert.equal(
    (await seller('/access', 'GET', undefined, { 'X-Telegram-Init-Data': renamed })).data.isSeller,
    true,
  );
});
test('blacklist enforces ID and case-insensitive username across APIs and cached identities; clearing cookies cannot bypass it', async (t) => {
  const { admin, client } = await fixture(t, ':memory:', { NODE_ENV: 'production' }),
    buyer = client();
  const proof = signed({ id: 800001, first_name: 'Buyer', username: 'CustomerOne' }),
    headers = { 'X-Telegram-Init-Data': proof };
  assert.equal((await buyer('/access', 'GET', undefined, headers)).data.telegramRequired, false);
  assert.equal((await buyer('/public')).status, 200);
  const entry = await admin('/admin/blacklist', 'POST', {
    value: '@CUSTOMERONE',
    note: 'Internal note',
  });
  assert.equal(entry.status, 201);
  assert.equal((await buyer('/access')).data.blocked, true);
  for (const path of ['/public', '/reviews', '/links/unknown']) {
    const response = await buyer(path);
    assert.equal(response.status, 503);
    assert.equal(response.data.code, 'maintenance');
    assert.equal(JSON.stringify(response.data).includes('Internal note'), false);
  }
  assert.equal((await buyer('/events', 'POST', { events: [] })).status, 503);
  assert.equal((await client()('/public')).status, 401);
  assert.equal(
    (await admin('/admin/blacklist', 'POST', { value: '@customerone', note: '' })).status,
    400,
  );
  assert.equal(
    (await admin('/admin/blacklist', 'POST', { value: '123456', note: '' })).status,
    400,
  );
  await admin('/admin/blacklist/' + entry.data.id, 'PATCH', { active: false });
  assert.equal((await buyer('/public')).status, 200);
  await admin('/admin/blacklist/' + entry.data.id, 'DELETE', {});
  assert.equal((await admin('/admin/blacklist')).data.length, 0);
  const idEntry = await admin('/admin/blacklist', 'POST', { value: '800001', note: '' });
  assert.equal(idEntry.status, 201);
  const renamed = signed({ id: 800001, first_name: 'Buyer', username: 'changed_name' });
  assert.equal(
    (await buyer('/public', 'GET', undefined, { 'X-Telegram-Init-Data': renamed })).status,
    503,
  );
  assert.equal((await client()('/admin/blacklist')).status, 401);
});

test('section links are ready for every category, resolve safely, count visits and remain disabled after settings saves',async t=>{
  const {admin,client,db}=await fixture(t);const guest=client();let s=(await admin('/admin/state')).data;
  s=(await admin('/admin/state','PUT',{revision:s.revision,settings:{...s.settings,botUsername:'fixture_shop_bot'}})).data;
  let links=(await admin('/admin/links')).data;assert.equal(links.filter(l=>l.kind==='group').length,s.catalog.groups.length);
  const seeded=links.find(l=>l.groupId==='mail');assert.match(seeded.url,/startapp=g_/);
  const created=await admin('/admin/links','POST',{kind:'group',groupId:'mail',label:'Поставка почтовых сервисов'});assert.equal(created.status,201);assert.notEqual(created.data.url,seeded.url);
  const code=created.data.startParam.slice(2);assert.deepEqual((await guest('/links/'+code)).data,{kind:'group',groupId:'mail',linkId:created.data.id});
  const catalog=(await guest('/public')).data.catalog;assert.ok(catalog.products.some(p=>p.id==='cdek-id'&&p.groupId==='mail'));assert.ok(catalog.products.some(p=>p.id==='mail-setup'&&p.groupId==='mail'));
  assert.equal((await guest('/admin/links','POST',{kind:'group',groupId:'mail',label:''})).status,401);
  for(const body of [{kind:'group',groupId:'missing',label:''},{kind:'other',groupId:'mail',label:''},{kind:'group',groupId:'mail',productId:'cdek-id',label:''}]) assert.ok((await admin('/admin/links','POST',body)).status>=400);
  const event={id:randomUUID(),sessionId:randomUUID(),type:'link_open',at:Date.now(),linkId:created.data.id};assert.equal((await guest('/events','POST',{events:[event]})).status,200);assert.equal(db.prepare("SELECT count(*) n FROM events WHERE link_id=? AND product_id='' AND type='link_open'").get(created.data.id).n,1);
  assert.equal((await admin('/admin/links')).data.find(l=>l.id===created.data.id).opens,1);
  await guest('/events','POST',{events:[{...event,id:randomUUID(),productId:'cdek-id'}]});assert.equal(db.prepare("SELECT count(*) n FROM events WHERE link_id=?").get(created.data.id).n,1);
  s.catalog.groups.find(g=>g.id==='mail').visible=false;s=(await admin('/admin/state','PUT',{revision:s.revision,catalog:s.catalog})).data;assert.equal((await guest('/links/'+code)).status,404);
  s.catalog.groups.find(g=>g.id==='mail').visible=true;s=(await admin('/admin/state','PUT',{revision:s.revision,catalog:s.catalog})).data;assert.equal((await guest('/links/'+code)).status,200);
  await admin('/admin/links/'+seeded.id,'PATCH',{active:false});await admin('/admin/links/'+created.data.id,'PATCH',{active:false});
  await admin('/admin/state','PUT',{revision:s.revision,settings:s.settings});links=(await admin('/admin/links')).data;assert.equal(links.filter(l=>l.kind==='group'&&l.groupId==='mail').length,2);assert.ok(links.filter(l=>l.kind==='group'&&l.groupId==='mail').every(l=>!l.active));assert.equal((await guest('/links/'+code)).status,404);
});

test('legacy links and seller catalog edits survive postal migration and restarts without recreating section links',async t=>{
  const {DatabaseSync}=await import('node:sqlite');const dir=await mkdtemp(join(tmpdir(),'fikus-group-migration-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'state.sqlite');
  const first=await createApp({dbPath:path,gatewayWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:'',GATEWAY_BOT_TOKEN:''}});await new Promise(r=>first.server.listen(0,'127.0.0.1',r));
  const row=first.db.prepare('SELECT * FROM state').get(),catalog=JSON.parse(row.catalog),settings=JSON.parse(row.settings);catalog.groups.find(g=>g.id==='mail').title='Почта';catalog.products.find(p=>p.id==='cdek-id').groupId='identity';catalog.products.find(p=>p.id==='cdek-id').price=1234;settings.botUsername='fixture_shop_bot';
  first.db.prepare('UPDATE state SET catalog=?,settings=? WHERE id=1').run(JSON.stringify(catalog),JSON.stringify(settings));first.db.prepare('DELETE FROM secrets WHERE key=?').run('migration.postal-section-v1');
  first.db.prepare("INSERT INTO links(id,token,product_id,label,active,created_at) VALUES('legacy','legacy-token','cdek-id','Old link',1,1)").run();await new Promise(r=>first.server.close(r));
  const legacy=new DatabaseSync(path);legacy.exec('ALTER TABLE links DROP COLUMN target_kind; ALTER TABLE links DROP COLUMN group_id');legacy.close();
  const second=await createApp({dbPath:path,gatewayWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:'',GATEWAY_BOT_TOKEN:''}});await new Promise(r=>second.server.listen(0,'127.0.0.1',r));
  const updated=JSON.parse(second.db.prepare('SELECT catalog FROM state').get().catalog);assert.equal(updated.groups.find(g=>g.id==='mail').title,'Почтовые сервисы');assert.equal(updated.products.find(p=>p.id==='cdek-id').groupId,'mail');assert.equal(updated.products.find(p=>p.id==='cdek-id').price,1234);
  const response=await fetch('http://127.0.0.1:'+second.server.address().port+'/api/links/legacy-token');assert.equal((await response.json()).productId,'cdek-id');const count=second.db.prepare('SELECT count(*) n FROM links').get().n;
  second.db.prepare("UPDATE links SET active=0 WHERE target_kind='group' AND group_id='mail'").run();updated.groups.find(g=>g.id==='mail').title='Моё название';updated.products.find(p=>p.id==='cdek-id').groupId='identity';second.db.prepare('UPDATE state SET catalog=? WHERE id=1').run(JSON.stringify(updated));await new Promise(r=>second.server.close(r));
  const third=await createApp({dbPath:path,gatewayWorker:false,env:{NODE_ENV:'test',BOT_TOKEN:'',GATEWAY_BOT_TOKEN:''}});await new Promise(r=>third.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>third.server.close(r)));const unchanged=JSON.parse(third.db.prepare('SELECT catalog FROM state').get().catalog);assert.equal(unchanged.groups.find(g=>g.id==='mail').title,'Моё название');assert.equal(unchanged.products.find(p=>p.id==='cdek-id').groupId,'identity');assert.equal(third.db.prepare('SELECT count(*) n FROM links').get().n,count);assert.equal(third.db.prepare("SELECT active FROM links WHERE target_kind='group' AND group_id='mail'").get().active,0);
});
