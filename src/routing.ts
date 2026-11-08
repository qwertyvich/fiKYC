import { entryProduct, entryTheme } from './domain.ts';

// Telegram owns the launch fragment (#tgWebAppData=...); only #/... is an app route.
export function resolveRoute(hash: string, search: string, startParam?: string): string {
  const candidate = hash.replace(/^#/, '');
  if (candidate.startsWith('/') && candidate !== '/' && !candidate.startsWith('/?')) return candidate;
  const product = entryProduct(search, startParam);
  if (product) return `/product/${product}`;
  return entryTheme(search, startParam) === 'claude' ? '/group/claude' : '/catalog';
}
