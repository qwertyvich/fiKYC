import { currencyTotals, money, type Product } from './domain.ts';
import { t } from './i18n.ts';

export function sellerChatLink(username: string, text: string): string | null {
  const handle = username.trim().replace(/^@/, '');
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(handle) || handle.toLowerCase() === 'duriv' || Array.from(text).length > 4096) return null;
  return `https://t.me/${handle}?text=${encodeURIComponent(text)}`;
}

export function cartMessage(lines: { product: Product; quantity: number }[], note = '', useBalance = false) {
  return [t('Здравствуйте! Хочу оформить заказ в фиКУС:'), '', ...lines.map(({ product: p, quantity }, i) => `${i + 1}. ${t(p.title)}${p.subtitle ? ` — ${t(p.subtitle)}` : ''}\n   ${quantity} ${t('шт.')} × ${money(p.price, p.currency)} = ${money(p.price * quantity, p.currency)}\n   ${t('Артикул:')} ${p.id}`), '', `${t('Итого:')} ${currencyTotals(lines.map(({ product: p, quantity }) => ({ price: p.price, currency: p.currency, quantity }))).join(' + ')}`, ...(useBalance ? ['', t('Хочу оплатить с баланса магазина. Пожалуйста, проверьте доступную сумму.')] : []), ...(note.trim() ? ['', `${t('Комментарий:')} ${note.trim()}`] : []), '', t('Подтвердите, пожалуйста, наличие, условия и способ оплаты.')].join('\n');
}

export function topupMessage(amount: string, currency: 'RUB' | 'USD') {
  const value = Number(amount.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000 || !/^\d+(?:[.,]\d{1,2})?$/.test(amount.trim())) throw new Error('Укажите сумму от 0,01 до 1 000 000, не больше двух знаков после запятой');
  return t(`Здравствуйте! Хочу пополнить баланс в магазине фиКУС на ${money(value, currency)}.\nПришлите, пожалуйста, реквизиты и условия пополнения.`);
}
