import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';
export const token = () => randomBytes(24).toString('base64url');
export const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
export function equal(a, b) {
  return timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
}
export function telegramUser(initData, botToken, now = Date.now()) {
  if (!botToken || typeof initData !== 'string' || initData.length > 16000) return null;
  try {
    const params = new URLSearchParams(initData);
    if (new Set(params.keys()).size !== [...params.keys()].length) return null;
    const hash = params.get('hash');
    if (!/^[a-f0-9]{64}$/.test(hash ?? '')) return null;
    params.delete('hash');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const check = [...params]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const expected = createHmac('sha256', secret).update(check).digest('hex');
    const age = now / 1000 - Number(params.get('auth_date'));
    if (!equal(hash, expected) || !Number.isFinite(age) || age < -30 || age > 3600) return null;
    const user = JSON.parse(params.get('user') ?? 'null');
    return Number.isSafeInteger(user?.id) && user.id > 0 ? user : null;
  } catch {
    return null;
  }
}
