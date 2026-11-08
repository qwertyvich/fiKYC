import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTopupAmount } from './wallet-domain.ts';
test('manual topup amounts parse to exact kopecks and reject ambiguous or unsafe inputs', () => {
  assert.equal(parseTopupAmount('1500'),150000);
  assert.equal(parseTopupAmount('1 500,50'),150050);
  assert.equal(parseTopupAmount('0.01'),1);
  assert.equal(parseTopupAmount('1000000.00'),100000000);
  for(const input of ['', '0', '-1', 'NaN', 'Infinity', '1e3', '1.001', '1000000.01', '1,2,3', 1500, null, {}, '1'.repeat(50)]) assert.throws(()=>parseTopupAmount(input));
});
