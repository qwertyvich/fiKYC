import { entryProduct, entryTheme } from './domain.ts';

// Telegram owns the launch fragment (#tgWebAppData=...); only #/... is an app route.
export function resolveRoute(hash: string, search: string, startParam?: string): string {
  const candidate = hash.replace(/^#/, '');
  if (candidate.startsWith('/') && candidate !== '/' && !candidate.startsWith('/?')) return candidate;
  const launch=new URLSearchParams(search).get('tgWebAppStartParam')??startParam;
  const payment=launch?.match(/^pay_(FK-[A-F0-9-]{1,64})$/)?.[1];
  if(payment)return '/payment/'+payment;
  const product = entryProduct(search, startParam);
  if (product) return `/product/${product}`;
  return entryTheme(search, startParam) === 'claude' ? '/group/claude' : '/catalog';
}
