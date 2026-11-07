import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStatistics } from './demo-statistics.ts';
test('admin-only demo data is bounded, normally distributed, deterministic and has an 80/20 rating split', () => {
  const ids = Array.from({ length: 1000 }, (_, i) => 'product-' + i),
    before = [...ids],
    rows = demoStatistics(ids);
  assert.deepEqual(ids, before);
  assert.deepEqual(rows, demoStatistics([...ids].reverse()));
  assert.equal(rows.length, 1000);
  assert.equal(rows.filter((r) => r.rating === 4.9).length, 800);
  assert.equal(rows.filter((r) => r.rating === 5).length, 200);
  assert.ok(
    rows.every((r) => Number.isInteger(r.buyerCount) && r.buyerCount >= 30 && r.buyerCount <= 190),
  );
  const average = rows.reduce((s, r) => s + r.buyerCount, 0) / rows.length;
  assert.ok(average > 105 && average < 115);
  const center = rows.filter((r) => r.buyerCount >= 80 && r.buyerCount <= 140).length;
  assert.ok(center > 550 && center < 750);
  const small = demoStatistics(ids.slice(0, 53));
  assert.equal(small.filter((r) => r.rating === 4.9).length, 42);
  assert.equal(small.filter((r) => r.rating === 5).length, 11);
});
