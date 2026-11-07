import { api, mutation } from './api';
export type EventType =
  | 'session_start'
  | 'product_click'
  | 'product_view'
  | 'product_time'
  | 'cart_add'
  | 'cart_remove'
  | 'cart_quantity'
  | 'checkout_view'
  | 'seller_open'
  | 'message_copy'
  | 'request_submit'
  | 'favorite_add'
  | 'link_open';
interface ClientEvent {
  id: string;
  sessionId: string;
  type: EventType;
  at: number;
  productId?: string;
  productIds?: string[];
  quantity?: number;
  durationMs?: number;
  linkId?: string;
  viewId?: string;
}
const queue: ClientEvent[] = [];
let enabled = true,
  sending = false,
  started = false;
let accountOnExit: (() => void) | null = null;
let sessionId = crypto.randomUUID(),
  lastEvent = Date.now();
try {
  const saved = JSON.parse(sessionStorage.getItem('fikus:analytics-session') ?? 'null');
  if (saved && Date.now() - saved.at < 1800000) sessionId = saved.id;
} catch {
  /* Fresh session. */
}
function session() {
  if (Date.now() - lastEvent > 1800000) sessionId = crypto.randomUUID();
  lastEvent = Date.now();
  try {
    sessionStorage.setItem(
      'fikus:analytics-session',
      JSON.stringify({ id: sessionId, at: lastEvent }),
    );
  } catch {
    /* In-memory session. */
  }
  return sessionId;
}
export function configureAnalytics(value: boolean) {
  enabled = value;
  if (!value) queue.length = 0;
}
export function track(
  type: EventType,
  data: Partial<Omit<ClientEvent, 'id' | 'sessionId' | 'type' | 'at'>> = {},
) {
  if (!enabled || location.hash.startsWith('#/admin')) return;
  queue.push({ id: crypto.randomUUID(), sessionId: session(), type, at: Date.now(), ...data });
  if (queue.length > 500) queue.splice(0, queue.length - 500);
  if (!started) {
    started = true;
    setInterval(() => void flushEvents(), 5000);
    window.addEventListener('pagehide', () => {
      accountOnExit?.();
      if (queue.length)
        navigator.sendBeacon(
          `${import.meta.env.BASE_URL}api/events`,
          new Blob([JSON.stringify({ events: queue.slice(0, 50) })], { type: 'application/json' }),
        );
    });
  }
  if (queue.length >= 20) void flushEvents();
}
export async function flushEvents() {
  if (sending || !enabled || !queue.length) return;
  sending = true;
  const events = queue.slice(0, 50);
  try {
    await mutation('/events', 'POST', { events });
    const ids = new Set(events.map((e) => e.id));
    for (let i = queue.length - 1; i >= 0; i--) if (ids.has(queue[i].id)) queue.splice(i, 1);
  } catch {
    /* Retry the same IDs: the server deduplicates events. */
  } finally {
    sending = false;
  }
}
export function productVisit(productId: string) {
  const viewId = crypto.randomUUID();
  track('product_view', { productId, viewId });
  let tick = performance.now(),
    lastInput = tick;
  let visible = document.visibilityState === 'visible' && document.hasFocus();
  function account() {
    const now = performance.now();
    const elapsed = visible ? Math.max(0, Math.min(now, lastInput + 60000) - tick) : 0;
    tick = now;
    if (elapsed > 0)
      track('product_time', {
        productId,
        viewId,
        durationMs: Math.min(15000, Math.round(elapsed)),
      });
  }
  const input = () => {
    account();
    lastInput = performance.now();
  };
  const visibility = () => {
    account();
    visible = document.visibilityState === 'visible' && document.hasFocus();
    if (visible) lastInput = performance.now();
    void flushEvents();
  };
  accountOnExit = account;
  const interval = setInterval(account, 10000);
  for (const name of ['pointerdown', 'keydown', 'scroll', 'touchstart'])
    window.addEventListener(name, input, { passive: true, capture: true });
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('focus', visibility);
  window.addEventListener('blur', visibility);
  return () => {
    account();
    clearInterval(interval);
    for (const name of ['pointerdown', 'keydown', 'scroll', 'touchstart'])
      window.removeEventListener(name, input, true);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('focus', visibility);
    window.removeEventListener('blur', visibility);
    if (accountOnExit === account) accountOnExit = null;
    void flushEvents();
  };
}
export const eventLabels: Record<EventType, string> = {
  session_start: 'Открыл магазин',
  product_click: 'Нажал на товар',
  product_view: 'Открыл карточку',
  product_time: 'Читал карточку',
  cart_add: 'Добавил в корзину',
  cart_remove: 'Убрал из корзины',
  cart_quantity: 'Изменил количество',
  checkout_view: 'Перешёл к оформлению',
  seller_open: 'Открыл чат продавца',
  message_copy: 'Скопировал сообщение',
  request_submit: 'Подготовил заявку',
  favorite_add: 'Добавил в избранное',
  link_open: 'Пришёл по прямой ссылке',
};
export interface Metrics {
  visitors: number;
  sessions: number;
  views: number;
  clicks: number;
  cartAdds: number;
  units: number;
  checkoutViews: number;
  sellerOpens: number;
  requests: number;
  averageSeconds: number;
  conversion: number;
}
export interface ProductMetrics {
  productId: string;
  views: number;
  clicks: number;
  cartAdds: number;
  units: number;
  activeMs: number;
  visitors: number;
  averageSeconds: number;
}
export interface ActivityEvent {
  activeSeconds: number;
  id: string;
  type: EventType;
  productId: string;
  sessionId: string;
  visitorId: string;
  at: number;
  quantity: number;
  linkId: string;
}
export interface SessionMetrics {
  sessionId: string;
  visitorId: string;
  startedAt: number;
  lastAt: number;
  events: number;
  views: number;
  cartAdds: number;
  activeMs: number;
}
export interface AnalyticsData {
  pagination: {
    eventPage: number;
    eventPages: number;
    sessionPage: number;
    sessionPages: number;
    totalSessions: number;
  };
  period: { start: number; end: number; timeZone: string };
  summary: Metrics;
  daily: { date: string; views: number; carts: number; sessions: number }[];
  hours: { hour: number; events: number }[];
  products: ProductMetrics[];
  sessions: SessionMetrics[];
  events: ActivityEvent[];
  totalEvents: number;
}
export const loadAnalytics = (query: URLSearchParams) =>
  api<AnalyticsData>('/admin/analytics?' + query);
