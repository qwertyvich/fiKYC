import {rateMinor} from '../src/usdt.ts';
import {validateUsdtAddress} from './usdt-settings.mjs';
export const defaultSettings = {
  usdtRubRate:88,
  usdtTrc20Address:'',
  usdtBep20Address:'',
  botUsername: '',
  appShortName: '',
  adminTelegramIds: '',
  sellerUsername: '',
  defaultAppearance: 'light',
  heroTitle: 'Всё нужное. В одном месте.',
  heroSubtitle: 'Пополнения, карты, сервисы и поездки — выбирай под свою задачу.',
  announcement: '',
  announcementEnabled: false,
  analyticsEnabled: true,
  moderateReviews: true,
};
export function parseSettings(value) {
  const s = { ...defaultSettings, ...value };
  rateMinor(s.usdtRubRate);
  s.usdtTrc20Address=validateUsdtAddress(s.usdtTrc20Address,'trc20');
  s.usdtBep20Address=validateUsdtAddress(s.usdtBep20Address,'bep20');
  for (const key of [
    'botUsername',
    'appShortName',
    'adminTelegramIds',
    'sellerUsername',
    'heroTitle',
    'heroSubtitle',
    'announcement',
  ]) {
    if (typeof s[key] !== 'string' || s[key].length > (key === 'announcement' ? 1000 : 300))
      throw new Error('Проверьте настройки магазина');
    s[key] = s[key].trim();
  }
  s.sellerUsername = s.sellerUsername.replace(/^@/, '').toLowerCase();
  if (s.sellerUsername && !/^[a-z][a-z0-9_]{4,31}$/.test(s.sellerUsername))
    throw new Error('Укажите username продавца');
  s.botUsername = s.botUsername.replace(/^@/, '');
  if (s.botUsername && !/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(s.botUsername))
    throw new Error('Укажите корректный username бота');
  if (s.adminTelegramIds && !/^\d+(?:\s*,\s*\d+)*$/.test(s.adminTelegramIds))
    throw new Error('Telegram ID — числа через запятую');
  if (s.appShortName && !/^[a-zA-Z0-9_]{1,64}$/.test(s.appShortName))
    throw new Error('Проверьте короткое имя Mini App');
  if (
    !['light', 'dark', 'auto'].includes(s.defaultAppearance) ||
    !['announcementEnabled', 'analyticsEnabled', 'moderateReviews'].every(
      (k) => typeof s[k] === 'boolean',
    )
  )
    throw new Error('Проверьте настройки');
  return Object.fromEntries(Object.keys(defaultSettings).map((k) => [k, s[k]]));
}
export function directLink(settings, code, kind = 'product') {
  if (!settings.botUsername) return null;
  return `https://t.me/${settings.botUsername}${settings.appShortName ? '/' + settings.appShortName : ''}?startapp=${kind === 'group' ? 'g' : 'p'}_${code}`;
}
export const eventTypes = [
  'session_start',
  'product_click',
  'product_view',
  'product_time',
  'cart_add',
  'cart_remove',
  'cart_quantity',
  'checkout_view',
  'seller_open',
  'message_copy',
  'request_submit',
  'favorite_add',
  'link_open',
];
