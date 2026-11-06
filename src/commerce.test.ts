import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultShop, enrichOffers, offerFor, parseShop, safeWebUrl, statusOf, supportText, validStatus } from './commerce.ts';
import { entryProduct, entryTheme, parseCatalog, type Catalog, type Order } from './domain.ts';
const product = { id:'claude-pro',groupId:'claude',title:'Claude Pro',subtitle:'1 месяц',description:'Собственное описание',price:20,currency:'USD' as const,stock:3,brand:'claude' as const,badge:'',visible:true };
test('offer enrichment preserves prices, currencies and custom operator content', () => {
  const catalog: Catalog = { version:1,groups:[{id:'claude',title:'Claude',theme:'claude',icon:'claude',visible:true}],products:[product] };
  const first = enrichOffers(catalog); first.products[0].offer!.region = 'Custom';
  const next = enrichOffers(first);
  assert.equal(next.products[0].price,20); assert.equal(next.products[0].currency,'USD'); assert.equal(next.products[0].description,'Собственное описание'); assert.equal(offerFor(next.products[0]).region,'Custom');
  assert.doesNotThrow(()=>parseCatalog(next));
  next.products[0].offer!.term = 99 as unknown as string; assert.throws(()=>parseCatalog(next));
});
test('deep links select an offer and preserve campaign branding',()=>{
  assert.equal(entryProduct('?ref=klod&product=claude-pro-cdk'),'claude-pro-cdk');
  assert.equal(entryProduct('', 'klod__claude-pro-cdk'),'claude-pro-cdk');
  assert.equal(entryTheme('', 'klod__claude-pro-cdk'),'claude');
  assert.equal(entryProduct('?product=../admin'),null);
});
test('legacy orders remain visible; unknown states and unsafe payment links are rejected',()=>{
  assert.equal(statusOf({status:'demo'} as Order),'awaiting_payment');
  assert.equal(validStatus('processing'),true); assert.equal(validStatus('toString'),false);
  assert.equal(safeWebUrl('javascript:alert(1)'),null); assert.equal(safeWebUrl('http://example.com'),null); assert.equal(safeWebUrl('https://example.com/pay'),'https://example.com/pay');
});
test('support configuration and composed message preserve context without fabricating business terms',()=>{
  assert.equal(parseShop({...defaultShop,supportTelegram:'@fikus_shop'}).supportTelegram,'fikus_shop');
  assert.equal(parseShop({...defaultShop,supportTelegram:'@duriv'}).supportTelegram,'');
  assert.throws(()=>parseShop({...defaultShop,supportTelegram:'https://example.com'}));
  assert.ok(supportText('ORDER-123','Claude Pro','Вопрос',' Что дальше? ').includes('ORDER-123'));
  assert.equal(defaultShop.responseTime,''); assert.equal(defaultShop.refundPolicy,'');
});

test('buyer counts distinguish missing data from zero and reject invalid imports', () => {
  const catalog: Catalog = { version: 1, groups: [{ id: 'claude', title: 'Claude', theme: 'claude', icon: 'claude', visible: true }], products: [{ ...product }] };
  for (const buyerCount of [undefined, 0, 128]) {
    catalog.products[0].buyerCount = buyerCount;
    assert.doesNotThrow(() => parseCatalog(catalog));
  }
  for (const buyerCount of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '128']) {
    catalog.products[0].buyerCount = buyerCount as number;
    assert.throws(() => parseCatalog(catalog));
  }
});
