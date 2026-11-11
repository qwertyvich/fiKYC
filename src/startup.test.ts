import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute } from './routing.ts';
import { isAppearance, resolveMode, APPEARANCE_STORAGE_KEY } from './appearance.ts';

test('Telegram launch fragments open the catalog instead of the missing-page screen', () => {
  for (const hash of ['', '#', '#/', '#/?tgWebAppVersion=9.2', '#tgWebAppData=user%3Dtest&tgWebAppVersion=9.2&tgWebAppPlatform=android', '#tgWebAppThemeParams=%7B%22bg_color%22%3A%22%23172212%22%7D']) {
    assert.equal(resolveRoute(hash, ''), '/catalog', hash);
  }
});
test('launch fragments preserve product referrals, Claude entries and explicit navigation', () => {
  const launch = '#tgWebAppData=auth_date%3D123&tgWebAppVersion=9.2';
  assert.equal(resolveRoute(launch, '?product=claude-pro'), '/product/claude-pro');
  assert.equal(resolveRoute(launch, '', 'product__claude-pro'), '/product/claude-pro');
  assert.equal(resolveRoute(launch, '?ref=klod'), '/group/claude');
  assert.equal(resolveRoute('#/profile', '?ref=klod'), '/profile');
  assert.equal(resolveRoute('#/payment/FK-1234', ''), '/payment/FK-1234');
  assert.equal(resolveRoute('#/admin/gateway', ''), '/admin/gateway');
  assert.equal(resolveRoute('#/support/new?product=claude-pro', ''), '/support/new?product=claude-pro');
});
test('explicit appearance choices override automatic Telegram or device appearance', () => {
  assert.equal(APPEARANCE_STORAGE_KEY, 'appearance-v2');
  assert.equal(resolveMode('light', 'dark'), 'light');
  assert.equal(resolveMode('dark', 'light'), 'dark');
  assert.equal(resolveMode('auto', 'dark'), 'dark');
  for (const value of [null, undefined, {}, ['dark'], 0, '', 'system']) assert.equal(isAppearance(value), false);
  for (const value of ['light', 'dark', 'auto']) assert.equal(isAppearance(value), true);
});
