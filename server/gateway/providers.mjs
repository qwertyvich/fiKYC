import { randomInt } from 'node:crypto';

/**
 * Cached payment providers select an instrument without network I/O inside a DB transaction.
 * Async acquirers should create/check an external intent before committing the order;
 * they must supply their own authenticated webhook and status verification adapter.
 */
export function createCardProvider({ db, available }) {
  return {
    id: 'telegram-card',
    supports: currency => currency === 'RUB',
    select(amountMinor) {
      if (!available()) return null;
      const cards = db.prepare('SELECT * FROM gateway_cards WHERE active=1 AND min_minor<=? AND max_minor>=?').all(amountMinor, amountMinor);
      return cards.length ? cards[randomInt(cards.length)] : null;
    },
  };
}
export function createProviderRegistry(initial = []) {
  const providers = new Map();
  function register(provider) {
    if (!provider?.id || providers.has(provider.id) || typeof provider.supports !== 'function' || typeof provider.select !== 'function') throw new Error('Invalid or duplicate payment provider');
    providers.set(provider.id, provider);
  }
  initial.forEach(register);
  return {
    register,
    choose({ amountMinor, currency }) {
      for (const provider of providers.values()) {
        if (!provider.supports(currency)) continue;
        const card = provider.select(amountMinor);
        if (card) return { provider, card };
      }
      return null;
    },
  };
}
