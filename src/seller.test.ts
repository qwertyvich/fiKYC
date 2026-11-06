import test from 'node:test';
import assert from 'node:assert/strict';
import { cartMessage, sellerChatLink, topupMessage } from './seller.ts';
import type { Product } from './domain.ts';

test('cart draft includes every item, quantities, currency totals, comment and balance preference', () => {
  const base: Product = { id: 'one', groupId: 'ai', title: 'Сервис & Pro', subtitle: '1 месяц', description: '', price: 1990, stock: 10, brand: 'ai', badge: '', visible: true };
  const message = cartMessage([{ product: base, quantity: 2 }, { product: { ...base, id: 'two', title: 'USD-сервис', price: 0.5, currency: 'USD' }, quantity: 3 }], 'Связь после 18:00', true);
  assert.ok(message.includes('2 шт.'));
  assert.ok(message.includes('3 шт.'));
  assert.ok(message.includes('3 980 ₽ + 1,5 $'));
  assert.ok(message.includes('Артикул: two'));
  assert.ok(message.includes('Связь после 18:00'));
  assert.ok(message.includes('с баланса магазина'));
  const url = new URL(sellerChatLink('@fikus_shop', message)!);
  assert.equal(url.pathname, '/fikus_shop');
  assert.equal(url.searchParams.get('text'), message);
  assert.equal(url.searchParams.has('profile'), false);
});

test('placeholder, unsafe contacts and oversized drafts never open a chat', () => {
  for (const name of ['', 'duriv', '@DURIV', 'https://example.com', 'shop/name', 'a?text=evil']) assert.equal(sellerChatLink(name, 'Заказ'), null);
  assert.equal(sellerChatLink('fikus_shop', 'x'.repeat(4097)), null);
});

test('topup requests validate decimal amounts without crediting any funds', () => {
  assert.ok(topupMessage('1250,50', 'RUB').includes('1 250,5 ₽'));
  assert.ok(topupMessage('20.25', 'USD').includes('20,25 $'));
  for (const amount of ['', '0', '-1', '1.234', '1e3', 'Infinity', '1000001']) assert.throws(() => topupMessage(amount, 'RUB'));
});
