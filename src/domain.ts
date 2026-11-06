export type Theme = 'fikus' | 'claude';
export const brands = ['claude', 'mail', 'cdek', 'ai', 'figma', 'notion', 'payment', 'gift', 'verification', 'crypto', 'wallet', 'car', 'travel', 'gaming'] as const;
export type Brand = typeof brands[number];
export interface Group { id: string; title: string; icon: Brand; theme: Theme; visible: boolean }
export type Currency = 'RUB' | 'USD';
export interface OfferDetails { result: string; includes: string; requirements: string; region: string; term: string; fulfillment: string; refund: string }
export interface Product { id: string; groupId: string; title: string; subtitle: string; description: string; price: number; currency?: Currency; stock: number; brand: Brand; badge: string; visible: boolean; saleMode?: 'fixed' | 'request'; requestKind?: RequestKind; acceptingRequests?: boolean; aliases?: string; buyerCount?: number; offer?: OfferDetails }
export interface Catalog { version: 1; groups: Group[]; products: Product[] }
export type Sort = 'manual' | 'price-asc' | 'price-desc' | 'name';
export interface CartItem { productId: string; quantity: number }
export type OrderStatus = 'awaiting_details' | 'awaiting_quote' | 'awaiting_confirmation' | 'awaiting_payment' | 'processing' | 'completed' | 'failed' | 'cancelled';
export interface OrderEvent { at: string; text: string }
export interface OrderProgress { updatedAt?: string; demo?: boolean; note?: string; events?: OrderEvent[]; estimatedCompletion?: string; paymentUrl?: string; result?: string; issue?: string; quoteTotal?: number; quoteCurrency?: Currency }
export interface Order extends OrderProgress { id: string; createdAt: string; items: { productId?: string; title: string; subtitle?: string; price: number; quantity: number; currency?: Currency; offer?: OfferDetails }[]; total: number | null; status: OrderStatus | 'demo' }
export function currencyTotals(items: { price: number; quantity: number; currency?: Currency }[]): string[] {
  const totals = new Map<Currency, number>();
  for (const item of items) { const currency = item.currency ?? 'RUB'; totals.set(currency, Math.round(((totals.get(currency) ?? 0) + item.price * item.quantity) * 100) / 100); }
  return [...totals].map(([currency, total]) => money(total, currency));
}
export type RequestKind = 'topup' | 'gift' | 'verification' | 'finance' | 'profile' | 'rental' | 'travel' | 'general';
export interface ServiceRequest extends OrderProgress { id: string; productId: string; title: string; createdAt: string; details: Record<string, string>; status: OrderStatus | 'demo-request' }
export interface ShopSettings { supportTelegram: string; workingHours: string; responseTime: string; about: string; refundPolicy: string }
export const requestKinds: RequestKind[] = ['topup', 'gift', 'verification', 'finance', 'profile', 'rental', 'travel', 'general'];
export const isRequest = (p: Product) => p.saleMode === 'request';
export const isAvailable = (p: Product) => isRequest(p) ? p.acceptingRequests !== false : p.stock > 0;
export const priceLabel = (p: Product) => isRequest(p) ? 'По запросу' : money(p.price, p.currency);
export interface RequestField { key: string; label: string; placeholder?: string; type?: 'text' | 'date' | 'number'; required?: boolean }
export function requestFields(p: Product): RequestField[] {
  const region: RequestField = { key: 'region', label: 'Страна / регион', placeholder: 'Укажите регион сервиса', required: true };
  const fields: Record<RequestKind, RequestField[]> = {
    topup: [{ key: 'service', label: 'Сервис', placeholder: 'Какой сервис нужно пополнить?', required: true }, region, { key: 'amount', label: 'Сумма и валюта', placeholder: 'Например, 20 USD', required: true }],
    gift: [{ key: 'service', label: 'Сервис / бренд карты', placeholder: 'Для какого сервиса нужна карта?', required: true }, region, { key: 'amount', label: 'Номинал и валюта', placeholder: 'Например, 50 EUR', required: true }],
    verification: [{ key: 'service', label: 'Сервис', placeholder: 'Название сервиса', required: true }, region, { key: 'task', label: 'На каком этапе нужна помощь?', placeholder: 'Кратко опишите задачу', required: true }],
    finance: [region, { key: 'task', label: 'Ваша задача', placeholder: 'Подключение, настройка или консультация', required: true }],
    profile: [{ key: 'task', label: 'Ваша задача', placeholder: 'С чем нужна помощь в вашем профиле?', required: true }],
    rental: [{ key: 'city', label: 'Город / страна', placeholder: 'Где планируете аренду?', required: true }, { key: 'start', label: 'Начало аренды', type: 'date', required: true }, { key: 'end', label: 'Окончание аренды', type: 'date', required: true }],
    travel: [{ key: 'city', label: 'Направление', placeholder: 'Город / страна', required: true }, { key: 'start', label: 'Дата заезда', type: 'date', required: true }, { key: 'end', label: 'Дата выезда', type: 'date', required: true }, { key: 'guests', label: 'Количество гостей', type: 'number', required: true }],
    general: [{ key: 'task', label: 'Ваша задача', placeholder: 'Кратко опишите запрос', required: true }],
  };
  return [...fields[p.requestKind ?? 'general'], { key: 'comment', label: 'Комментарий', placeholder: 'Пожелания и дополнительные условия' }];
}
export function validateRequest(p: Product, details: Record<string, string>) {
  if (!isRequest(p) || !isAvailable(p)) throw new Error('Приём заявок недоступен');
  for (const field of requestFields(p)) {
    const value = details[field.key];
    if (field.required && (typeof value !== 'string' || !value.trim())) throw new Error(`Заполните поле «${field.label}»`);
    if (value !== undefined && (typeof value !== 'string' || value.length > 1000)) throw new Error('Сократите текст заявки');
    if (field.type === 'date' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error('Проверьте даты');
    if (field.type === 'number' && (!Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 100)) throw new Error('Укажите от 1 до 100 гостей');
  }
  if (details.start && details.end && details.end < details.start) throw new Error('Дата окончания должна быть не раньше начала');
}

export function themeFor(locked: Theme | null, group?: Group): Theme { return locked ?? group?.theme ?? 'fikus'; }
export function entryTheme(search: string, startParam?: string): Theme | null {
  const params = new URLSearchParams(search);
  const ref = (params.get('ref') ?? params.get('tgWebAppStartParam') ?? startParam ?? '').toLowerCase();
  return ['klod', 'claude'].includes(ref) || /^(klod|claude)__/.test(ref) ? 'claude' : null;
}
export function entryProduct(search: string, startParam?: string): string | null {
  const params = new URLSearchParams(search);
  const ref = params.get('ref') ?? params.get('tgWebAppStartParam') ?? startParam ?? '';
  const target = params.get('product') ?? ref.match(/^(?:product|klod|claude)__(.+)$/)?.[1] ?? '';
  return /^[a-zA-Z0-9_-]{1,100}$/.test(target) ? target : null;
}
export function selectProducts(catalog: Catalog, groupId: string, query: string, sort: Sort, availableOnly: boolean): Product[] {
  const visibleGroups = new Set(catalog.groups.filter(g => g.visible).map(g => g.id));
  const q = query.trim().toLocaleLowerCase('ru');
  const order = new Map(catalog.groups.map((g, i) => [g.id, i]));
  const result = catalog.products.filter(p => p.visible && visibleGroups.has(p.groupId) && (groupId === 'all' || p.groupId === groupId) && (!availableOnly || isAvailable(p)) && `${p.title} ${p.subtitle} ${p.description} ${p.aliases ?? ''}`.toLocaleLowerCase('ru').includes(q));
  if (sort === 'price-asc' || sort === 'price-desc') result.sort((a, b) => Number(isRequest(a)) - Number(isRequest(b)) || (isRequest(a) ? 0 : (a.currency ?? 'RUB').localeCompare(b.currency ?? 'RUB') || (sort === 'price-asc' ? a.price - b.price : b.price - a.price)));
  if (sort === 'name') result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  if (sort === 'manual') result.sort((a, b) => (order.get(a.groupId) ?? 0) - (order.get(b.groupId) ?? 0));
  return result;
}
export function parseCatalog(input: unknown): Catalog {
  const c = input as Catalog;
  if (!c || c.version !== 1 || !Array.isArray(c.groups) || !Array.isArray(c.products) || c.groups.length > 100 || c.products.length > 2000) throw new Error('Неверный формат каталога');
  const ids = new Set<string>();
  for (const g of c.groups) {
    if (!g || typeof g.id !== 'string' || !g.id || ids.has(g.id) || typeof g.title !== 'string' || !g.title.trim() || !brands.includes(g.icon) || !['fikus', 'claude'].includes(g.theme) || typeof g.visible !== 'boolean') throw new Error('Проверьте группы каталога');
    ids.add(g.id);
  }
  const productIds = new Set<string>();
  for (const p of c.products) {
    if (!p || typeof p.id !== 'string' || !p.id || productIds.has(p.id) || !ids.has(p.groupId) || typeof p.title !== 'string' || !p.title.trim() || !['subtitle', 'description', 'badge'].every(k => typeof p[k as keyof Product] === 'string') || !brands.includes(p.brand) || !Number.isFinite(p.price) || p.price < 0 || !Number.isSafeInteger(p.stock) || p.stock < 0 || typeof p.visible !== 'boolean') throw new Error('Проверьте товары, цены и остатки');
    if ((p.saleMode !== undefined && !['fixed', 'request'].includes(p.saleMode)) || (p.requestKind !== undefined && !requestKinds.includes(p.requestKind)) || (p.acceptingRequests !== undefined && typeof p.acceptingRequests !== 'boolean') || (p.aliases !== undefined && typeof p.aliases !== 'string')) throw new Error('Проверьте параметры услуги');
    if (p.buyerCount !== undefined && (!Number.isSafeInteger(p.buyerCount) || p.buyerCount < 0)) throw new Error('Проверьте число покупателей');
    if (p.currency !== undefined && !['RUB', 'USD'].includes(p.currency)) throw new Error('Проверьте валюту цены');
    if (p.offer !== undefined && (!p.offer || !['result','includes','requirements','region','term','fulfillment','refund'].every(k => typeof p.offer?.[k as keyof OfferDetails] === 'string' && p.offer[k as keyof OfferDetails].length <= 10000))) throw new Error('Проверьте условия предложения');
    productIds.add(p.id);
  }
  return c;
}
export function cartLines(catalog: Catalog, cart: CartItem[]) {
  return cart.flatMap(item => {
    const product = catalog.products.find(p => p.id === item.productId && p.visible && catalog.groups.some(g => g.id === p.groupId && g.visible));
    return product && !isRequest(product) ? [{ product, quantity: item.quantity }] : [];
  });
}
export const money = (value: number, currency: Currency = 'RUB') => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value) + (currency === 'USD' ? ' $' : ' ₽');
