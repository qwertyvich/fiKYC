import test from 'node:test';
import assert from 'node:assert/strict';
import { cartLines, entryTheme, parseCatalog, selectProducts, themeFor, type Catalog } from './domain.ts';
import { currencyTotals, isAvailable, priceLabel, validateRequest } from './domain.ts';
import { addClaudeOffers, expandSavedCatalog, initialCatalog, serviceProducts, subscriptionProducts } from './catalog.ts';
const catalog: Catalog = { version: 1, groups: [
  { id: 'main', title: 'Main', theme: 'fikus', icon: 'ai', visible: true },
  { id: 'claude', title: 'Claude', theme: 'claude', icon: 'claude', visible: true },
], products: [
  { id: 'c', groupId: 'claude', title: 'Claude', subtitle: '', description: '', price: 100, stock: 2, brand: 'claude', badge: '', visible: true },
  { id: 'a', groupId: 'main', title: 'Почта', subtitle: '', description: '', price: 200, stock: 0, brand: 'mail', badge: '', visible: true },
  { id: 'b', groupId: 'main', title: 'Настройка', subtitle: '', description: 'Почта', price: 50, stock: 5, brand: 'mail', badge: '', visible: true },
] };
test('ordinary entry uses section theme; referral theme persists on every screen', () => {
  assert.equal(themeFor(null), 'fikus'); assert.equal(themeFor(null, catalog.groups[1]), 'claude');
  assert.equal(themeFor(null, catalog.groups[0]), 'fikus'); assert.equal(themeFor('claude', catalog.groups[0]), 'claude');
  assert.equal(entryTheme('?ref=klod'), 'claude'); assert.equal(entryTheme('?tgWebAppStartParam=claude'), 'claude');
  assert.equal(entryTheme('', 'klod'), 'claude'); assert.equal(entryTheme('?ref=other'), null);
});
test('manual order follows both group order and product order', () => { assert.deepEqual(selectProducts(catalog, 'all', '', 'manual', false).map(p => p.id), ['a', 'b', 'c']); });
test('search, price sorting and stock filter compose', () => { assert.deepEqual(selectProducts(catalog, 'all', ' ПОЧТА ', 'price-asc', true).map(p => p.id), ['b']); assert.deepEqual(selectProducts(catalog, 'all', '', 'price-desc', false).map(p => p.id), ['a', 'c', 'b']); });
test('hiding Claude removes its items from catalog and cart without deleting data', () => {
  const hidden = structuredClone(catalog); hidden.groups[1].visible = false;
  assert.equal(hidden.products.length, 3); assert.equal(selectProducts(hidden, 'all', '', 'manual', false).length, 2);
  assert.equal(cartLines(hidden, [{ productId: 'c', quantity: 1 }]).length, 0);
});
test('import rejects broken IDs, unknown groups and invalid numbers', () => {
  assert.equal(parseCatalog(catalog), catalog);
  for (const mutate of [(c: Catalog) => { c.products[0].price = NaN; }, (c: Catalog) => { c.products[0].stock = -1; }, (c: Catalog) => { c.products[0].stock = 1.5; }, (c: Catalog) => { c.products[0].groupId = 'missing'; }, (c: Catalog) => { c.groups[1].id = c.groups[0].id; }, (c: Catalog) => { c.products[1].id = c.products[0].id; }]) { const copy = structuredClone(catalog); mutate(copy); assert.throws(() => parseCatalog(copy)); }
});

test('expanded assortment covers services and requested USD tariffs, without jailbreak listings', () => {
  parseCatalog(initialCatalog);
  assert.equal(initialCatalog.products.length, 53);
  assert.equal(subscriptionProducts.length, 11);
  assert.equal(serviceProducts.length, 28);
  assert.ok(!initialCatalog.products.some(p => /jailbreak/i.test(p.title)));
  for (const [query, id] of [['байбит', 'bybit'], ['криптобот', 'kb'], ['валлет', 'wallet'], ['Япэй', 'yapay'], ['vrbo', 'vrbo']]) assert.ok(selectProducts(initialCatalog, 'all', query, 'manual', false).some(p => p.id === id));
  assert.equal(priceLabel(subscriptionProducts.find(p => p.id === 'capcut-pro-7d')!), '0,5 $');
});
test('migration appends missing offerings once and preserves custom prices and hidden groups', () => {
  const saved = structuredClone(catalog); saved.groups[1].visible = false; saved.products[0].price = 123;
  const expanded = expandSavedCatalog(saved);
  parseCatalog(expanded);
  assert.equal(expanded.products[0].price, 123);
  assert.equal(expanded.groups[1].visible, false);
  assert.deepEqual(expandSavedCatalog(expanded), expanded);
});

test('Claude KYC offers reach existing catalogs without resetting saved edits', () => {
  const saved = structuredClone(initialCatalog);
  saved.products = saved.products.filter(p => !['claude-kyc', 'claude-warmed-kyc'].includes(p.id));
  saved.products[0].price = 4321;
  saved.groups.find(g => g.id === 'mail')!.visible = false;
  const migrated = addClaudeOffers(saved);
  parseCatalog(migrated);
  assert.deepEqual(selectProducts(migrated, 'claude', '', 'manual', true).slice(0, 2).map(p => p.id), ['claude-kyc', 'claude-warmed-kyc']);
  assert.equal(migrated.products.find(p => p.id === 'claude-kyc')!.badge, 'Хит');
  assert.equal(migrated.products.find(p => p.id === saved.products[0].id)!.price, 4321);
  assert.equal(migrated.groups.find(g => g.id === 'mail')!.visible, false);
  const edited = migrated.products.find(p => p.id === 'claude-kyc')!;
  edited.visible = false; edited.description = 'Custom';
  assert.deepEqual(addClaudeOffers(migrated), migrated);
});
test('quote services use request availability, stay outside cart and sort after priced products', () => {
  const service = serviceProducts[0];
  assert.equal(isAvailable(service), true); assert.equal(priceLabel(service), 'По запросу');
  assert.equal(isAvailable({ ...service, acceptingRequests: false }), false);
  assert.equal(cartLines(initialCatalog, [{ productId: service.id, quantity: 1 }]).length, 0);
  for (const sort of ['price-asc', 'price-desc'] as const) {
    const products = selectProducts(initialCatalog, 'all', '', sort, true);
    assert.ok(products.slice(-serviceProducts.length).every(p => p.saleMode === 'request'));
  }
});
test('request parameters validate required fields, dates and guest count', () => {
  const rental = serviceProducts.find(p => p.id === 'movly')!;
  assert.throws(() => validateRequest(rental, {}));
  assert.throws(() => validateRequest(rental, { city: 'Москва', start: '2026-12-10', end: '2026-12-09' }));
  assert.throws(() => validateRequest(rental, { city: 'Москва', start: '2026-02-30', end: '2026-12-09' }));
  assert.doesNotThrow(() => validateRequest(rental, { city: 'Москва', start: '2026-12-09', end: '2026-12-10' }));
  const travel = serviceProducts.find(p => p.id === 'booking')!;
  assert.throws(() => validateRequest(travel, { city: 'Париж', start: '2026-12-09', end: '2026-12-10', guests: '0' }));
});
test('currency totals do not mix rubles with dollars or accumulate fractional rounding errors', () => {
  assert.deepEqual(currencyTotals([{ price: 1990, quantity: 1 }, { price: 0.5, quantity: 1, currency: 'USD' }, { price: 16, quantity: 1, currency: 'USD' }]), ['1 990 ₽', '16,5 $']);
  assert.deepEqual(currencyTotals([{ price: 0.1, quantity: 3, currency: 'USD' }]), ['0,3 $']);
});
