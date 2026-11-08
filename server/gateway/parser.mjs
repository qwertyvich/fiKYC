// The chat is data, never executable instructions. Parse only the provider's explicit format.
const normalize = (s) => s.normalize('NFKC').replace(/[\u200e\u200f\u2066-\u2069]/g, '').replace(/\r/g, '');
const amount = (s) => {
  const n = Number(s.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
export function parseFeed(text) {
  if (typeof text !== 'string') return null;
  const s = normalize(text);
  const stopped = /реквизиты[^\n]*\n?\s*временно недоступны/i.test(s);
  const stopMatch = s.match(/реквизиты\s+([\d \u00a0]{15,30})\s*\n?\s*временно недоступны/i);
  const stopCard = stopMatch?.[1].replace(/\D/g, '');
  const cards = [];
  const parts = s.split(/(?=🏦\s*Банк:)/u).slice(1);
  for (const part of parts) {
    const bank = part.match(/^🏦\s*Банк:\s*([^\n]+)/u)?.[1].trim();
    const holder = part.match(/ФИО:\s*([^\n]+)/i)?.[1].trim();
    const number = part.match(/Карта:\s*([\d \u00a0-]+)/i)?.[1].replace(/\D/g, '');
    const min = part.match(/Мин:\s*([\d\s.,]+)\s*(?:₽|руб)/i)?.[1];
    const max = part.match(/Макс:\s*([\d\s.,]+)\s*(?:₽|руб)/i)?.[1];
    const minMinor = min && amount(min), maxMinor = max && amount(max);
    if (!bank || !holder || !/^\d{16,19}$/.test(number ?? '') || !minMinor || !maxMinor || minMinor > maxMinor) return { kind: 'invalid', cards: [] };
    cards.push({ number, bank, holder, minMinor, maxMinor });
  }
  if (new Set(cards.map(c => c.number)).size !== cards.length) return { kind: 'invalid', cards: [] };
  if (stopped) {
    if (stopMatch && !/^\d{16,19}$/.test(stopCard)) return { kind: 'invalid', cards: [] };
    if (cards.some(c => c.number === stopCard)) return { kind: 'invalid', cards: [] };
    return { kind: 'stop', stopCard: stopCard || null, cards, snapshot: /Актуальные реквизиты:/i.test(s) };
  }
  if (cards.length) return { kind: 'snapshot', cards };
  // A malformed payment announcement must not leave old cards available.
  if (/Реквизиты\s*№|Карта:|Актуальные реквизиты:/i.test(s)) return { kind: 'invalid', cards: [] };
  return null;
}
