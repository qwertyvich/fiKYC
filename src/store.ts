import { addClaudeOffers, expandSavedCatalog, initialCatalog } from './catalog';
import { isRequest, parseCatalog, requestFields, validateRequest, type Catalog, type Order, type ServiceRequest, type ShopSettings } from './domain';
import { defaultShop, enrichOffers, offerFor, parseShop, validStatus } from './commerce';

export interface StoreAdapter {
  loadCatalog(): Promise<Catalog>;
  saveCatalog(catalog: Catalog): Promise<void>;
  createOrder(lines: { productId: string; quantity: number }[], note?: string): Promise<Order>;
  loadOrders(): Promise<Order[]>;
  createRequest(productId: string, details: Record<string, string>): Promise<ServiceRequest>;
  loadRequests(): Promise<ServiceRequest[]>;
  loadShop(): Promise<ShopSettings>;
  saveShop(settings: ShopSettings): Promise<void>;
  acceptQuote(id: string): Promise<ServiceRequest>;
}
export function readLocal<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(`fikus:${key}`); return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
export function writeLocal(key: string, value: unknown) { localStorage.setItem(`fikus:${key}`, JSON.stringify(value)); }

// Replace this adapter with authenticated calls to the owner's panel.
// Prices, stock, identity and payment status must be verified by that server.
export const store: StoreAdapter = {
  async loadCatalog() {
    let catalog: Catalog;
    try { catalog = parseCatalog(readLocal('catalog', initialCatalog)); } catch { catalog = structuredClone(initialCatalog); }
    if (!readLocal('services-expanded-v2', false)) {
      catalog = parseCatalog(expandSavedCatalog(catalog));
      try { writeLocal('catalog', catalog); writeLocal('services-expanded-v2', true); } catch { /* Keep the expanded catalog in memory. */ }
    }
    if (!readLocal('claude-offers-v1', false)) {
      catalog = parseCatalog(addClaudeOffers(catalog));
      try { writeLocal('catalog', catalog); writeLocal('claude-offers-v1', true); } catch { /* Keep the new offers in memory when storage is unavailable. */ }
    }
    for (const product of catalog.products) {
      if (product.id === 'claude-warmed-kyc' && product.badge === 'KYC пройдена') product.badge = '';
    }
    return enrichOffers(catalog);
  },
  async saveCatalog(catalog) { writeLocal('catalog', parseCatalog(catalog)); },
  async createOrder(items, note = '') {
    const catalog = await this.loadCatalog();
    const lines = items.map(i => {
      const p = catalog.products.find(p => p.id === i.productId && p.visible && catalog.groups.some(g => g.id === p.groupId && g.visible));
      if (!p || isRequest(p) || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > p.stock) throw new Error('Остатки изменились. Проверьте корзину.');
      return { productId: p.id, title: p.title, subtitle: p.subtitle, price: p.price, currency: p.currency ?? 'RUB', quantity: i.quantity, offer: offerFor(p) };
    });
    if (!lines.length || new Set(items.map(i => i.productId)).size !== items.length) throw new Error('Проверьте состав корзины');
    const total = new Set(lines.map(l => l.currency)).size === 1 ? Math.round(lines.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100 : null;
    const createdAt = new Date().toISOString();
    const order: Order = { id: 'DEMO-' + crypto.randomUUID().slice(0, 8).toUpperCase(), createdAt, updatedAt: createdAt, items: lines, total, status: 'awaiting_payment', demo: true, note: note.trim().slice(0, 1000), events: [{ at: createdAt, text: 'Заказ сохранён на этом устройстве. Оплата не выполнялась.' }] };
    writeLocal('orders', [order, ...await this.loadOrders()]);
    return order;
  },
  async loadOrders() {
    const value = readLocal<unknown>('orders', []);
    return Array.isArray(value) ? value.filter((o): o is Order => !!o && typeof o.id === 'string' && typeof o.createdAt === 'string' && Number.isFinite(Date.parse(o.createdAt)) && validStatus(o.status) && (o.total === null || Number.isFinite(o.total)) && Array.isArray(o.items) && o.items.every((i: Order['items'][number]) => i && typeof i.title === 'string' && Number.isFinite(i.price) && (i.currency === undefined || ['RUB', 'USD'].includes(i.currency)) && Number.isSafeInteger(i.quantity) && i.quantity > 0)) : [];
  },
  async createRequest(productId, details) {
    const catalog = await this.loadCatalog();
    const product = catalog.products.find(p => p.id === productId && p.visible && catalog.groups.some(g => g.id === p.groupId && g.visible));
    if (!product) throw new Error('Услуга недоступна');
    validateRequest(product, details);
    const cleanDetails = Object.fromEntries(requestFields(product).map(f => [f.key, (details[f.key] ?? '').trim()]));
    const createdAt = new Date().toISOString();
    const request: ServiceRequest = { id: 'REQ-' + crypto.randomUUID().slice(0, 8).toUpperCase(), productId, title: product.title, createdAt, updatedAt: createdAt, details: cleanDetails, status: 'awaiting_quote', demo: true, events: [{ at: createdAt, text: 'Заявка сохранена на этом устройстве. Отправка магазину не подключена.' }] };
    writeLocal('requests', [request, ...await this.loadRequests()]);
    return request;
  },
  async loadRequests() {
    const value = readLocal<unknown>('requests', []);
    return Array.isArray(value) ? value.filter((r): r is ServiceRequest => !!r && typeof r.id === 'string' && typeof r.productId === 'string' && typeof r.title === 'string' && Number.isFinite(Date.parse(r.createdAt)) && validStatus(r.status) && r.details && typeof r.details === 'object' && !Array.isArray(r.details) && Object.values(r.details).every(v => typeof v === 'string')) : [];
  },
  async loadShop() { try { return parseShop(readLocal('shop', defaultShop)); } catch { return { ...defaultShop }; } },
  async saveShop(settings) { writeLocal('shop', parseShop(settings)); },
  async acceptQuote() { throw new Error('Подтверждение предложения станет доступно после подключения магазина.'); },
};
