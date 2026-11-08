export const MAX_TOPUP_MINOR = 100_000_000;
export function parseTopupAmount(value: unknown): number {
  if (typeof value !== 'string' || value.length > 32) throw new Error('Введите сумму пополнения от 0,01 до 1 000 000 ₽');
  const normalized = value.trim().replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Введите сумму в рублях, не больше двух знаков после запятой');
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor < 1 || minor > MAX_TOPUP_MINOR) throw new Error('Сумма пополнения — от 0,01 до 1 000 000 ₽');
  return minor;
}
export interface WalletState {
  currency: 'RUB';
  balance: number;
  entries: { paymentId: string; amount: number; createdAt: number }[];
}
