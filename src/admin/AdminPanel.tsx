import { GatewayPage } from './GatewayPage';
import { ChannelImportPage } from './ChannelImportPage';
import { BotsPage } from './BotsPage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Layers3,
  MessageSquare,
  Link2,
  Activity,
  Settings2,
  BarChart3,
  ArrowUpRight,
  LogOut,
  RefreshCw,
  CalendarDays,
  ChevronDown,
  Moon,
  Sun,
  LockKeyhole,
  ArrowRight,
  Check,
  ShieldCheck,
  LoaderCircle,
  X,
  Search,
  Ban,
  FileUp,
} from 'lucide-react';
import { api, mutation, invalidatePublic, type AdminState, type SiteSettings } from '../api';
import { telegram } from '../telegram';
import { loadAnalytics, type AnalyticsData } from '../analytics';
import type { Product } from '../domain';
import type { Review } from '../review-store';
import { CatalogManager, CategoriesManager, ProductEditor, type SaveState } from './CatalogManager';
import { ReviewsManager, LinksManager, type ProductLink } from './ModerationLinks';
import { SettingsPage } from './SettingsPage';
import { Overview, AnalyticsPage, ActivityPage } from './AnalyticsPages';
import { BlacklistManager } from './BlacklistManager';
import './admin.css';
const pages = [
  { id: 'overview', label: 'Обзор', icon: LayoutDashboard, caption: 'Ваш магазин сегодня' },
  {
    id: 'products',
    label: 'Товары',
    icon: Package,
    caption: 'Ассортимент, цены и порядок в ленте',
  },
  { id: 'categories', label: 'Категории', icon: Layers3, caption: 'Разделы вашего магазина' },
  {
    id: 'reviews',
    label: 'Отзывы',
    icon: MessageSquare,
    caption: 'Обратная связь под вашим контролем',
  },
  { id: 'links', label: 'Прямые ссылки', icon: Link2, caption: 'Из сообщения — к товару или разделу' },
  { id: 'channel-import', label: 'Импорт из Telegram', icon: FileUp, caption: 'Отзывы и покупки из вашего канала' },
  {
    id: 'analytics',
    label: 'Аналитика',
    icon: BarChart3,
    caption: 'Как покупатели взаимодействуют с магазином',
  },
  {
    id: 'activity',
    label: 'Действия клиентов',
    icon: Activity,
    caption: 'Каждое действие — в понятной ленте',
  },
  { id: 'blacklist', label: 'Чёрный список', icon: Ban, caption: 'Кому доступен ваш магазин' },
  { id: 'gateway', label: 'Оплаты', icon: ShieldCheck, caption: 'Реквизиты, квитанции и проверка оплат' },
  { id: 'bots', label: 'Боты и оформление', icon: MessageSquare, caption: 'Воронки, меню и оформление Telegram' },
  { id: 'settings', label: 'Настройки', icon: Settings2, caption: 'Общие настройки в одном месте' },
];
export function AdminPanel({
  page,
  onExit,
  mode,
  onToggleTheme,
}: {
  page: string;
  onExit(): void;
  mode: 'light' | 'dark';
  onToggleTheme(): void;
}) {
  const current = pages.find((p) => p.id === page) ?? pages[0];
  const [localLoginAllowed, setLocalLoginAllowed] = useState(false);
  const [auth, setAuth] = useState<boolean | null>(null),
    [state, setState] = useState<AdminState | null>(null),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]),
    [links, setLinks] = useState<ProductLink[]>([]),
    [metrics, setMetrics] = useState<AnalyticsData | null>(null),
    [metricsError, setMetricsError] = useState(''),
    [refreshing, setRefreshing] = useState(false),
    [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [days, setDays] = useState('7'),
    [productFilter, setProductFilter] = useState(''),
    [sessionFilter, setSessionFilter] = useState('');
  const [eventPage, setEventPage] = useState(1),
    [sessionPage, setSessionPage] = useState(1);
  const analyticsRequest = useRef(0);
  useEffect(() => {
    setEventPage(1);
    setSessionPage(1);
  }, [days, productFilter, sessionFilter]);
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [editing, setEditing] = useState<Product | null>(null),
    [linkProduct, setLinkProduct] = useState(''),
    [notice, setNotice] = useState('');
  const navigate = (id: string) => {
    location.hash = '/admin/' + id;
  };
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [current.id]);
  const notify = (message: string) => setNotice(message);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const loadReviews = useCallback(
    async () => setReviews(await api<Review[]>('/admin/reviews')),
    [],
  );
  const loadLinks = useCallback(async () => setLinks(await api<ProductLink[]>('/admin/links')), []);
  async function bootstrap() {
    const data = await api<AdminState>('/admin/state');
    setState(data);
    setAuth(true);
    await Promise.all([loadReviews(), loadLinks()]);
  }
  useEffect(() => {
    let live = true;
    api<{ authenticated: boolean; seller: boolean; localAdminLogin: boolean }>('/admin/session')
      .then(async (s) => {
        if (!live) return;
        setLocalLoginAllowed(s.localAdminLogin);
        if (s.authenticated) await bootstrap();
        else if (s.seller) {
          await mutation('/admin/login', 'POST', { initData: telegram?.initData });
          await bootstrap();
        } else setAuth(false);
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setAuth(false);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    const requestId = ++analyticsRequest.current;
    try {
      const params = new URLSearchParams({ days, timeZone: 'Europe/Moscow' });
      if (productFilter && current.id !== 'overview') params.set('productId', productFilter);
      if (sessionFilter && current.id === 'activity') params.set('sessionId', sessionFilter);
      if (from && to && current.id !== 'overview') {
        params.set('from', from);
        params.set('to', to);
      }
      if (current.id === 'activity') {
        params.set('eventPage', String(eventPage));
        params.set('sessionPage', String(sessionPage));
      }
      const data = await loadAnalytics(params);
      if (requestId !== analyticsRequest.current) return;
      setMetrics(data);
      setMetricsError('');
      setUpdatedAt(new Date());
    } catch (err) {
      if (requestId === analyticsRequest.current) setMetricsError((err as Error).message);
    } finally {
      if (requestId === analyticsRequest.current) setRefreshing(false);
    }
  }, [days, productFilter, sessionFilter, current.id, from, to, eventPage, sessionPage]);
  useEffect(() => {
    if (!auth || !['overview','analytics','activity'].includes(current.id)) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, [auth, refresh]);
  useEffect(() => {
    if (!auth) return;
    const load = () => {
      void Promise.all([loadReviews(), loadLinks()]).catch((err) => setError(err.message));
    };
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [auth, current.id, loadReviews, loadLinks]);
  const save: SaveState = async (patch) => {
    if (!state || busy) return false;
    setBusy(true);
    setError('');
    try {
      const next = await mutation<AdminState>('/admin/state', 'PUT', {
        revision: state.revision,
        ...patch,
      });
      setState(next);
      invalidatePublic();
      notify('Изменения сохранены');
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const openLinks = (id: string) => {
    setLinkProduct(id);
    navigate('links');
  };
  async function login(useTelegram = false) {
    setBusy(true);
    setError('');
    try {
      await mutation(
        '/admin/login',
        'POST',
        useTelegram ? { initData: telegram?.initData } : { password },
      );
      setPassword('');
      await bootstrap();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (auth === null)
    return (
      <div className="admin-app a-login-wrap">
        <div className="a-loading">
          <LoaderCircle className="spin" />
          <p>Открываем панель…</p>
        </div>
      </div>
    );
  if (!auth)
    return (
      <div className="admin-app a-login-wrap">
        <div className="a-login-card">
          <div className="a-login-logo">
            <img className="ficus-mark" src={`${import.meta.env.BASE_URL}ficus-mascot.png`} alt="" />
            <b>
              фиКУС<span>ПАНЕЛЬ ВЛАДЕЛЬЦА</span>
            </b>
          </div>
          <span className="a-login-icon">
            <LockKeyhole size={25} />
          </span>
          <h1>
            Всё начинается
            <br />с вашего входа<span>.</span>
          </h1>
          <p>
            Товары, отзывы и действия покупателей.
            <br />В одном месте. Под вашим контролем.
          </p>
          <form
            className="a-form"
            onSubmit={(e) => {
              e.preventDefault();
              void login(!localLoginAllowed);
            }}
          >
            {localLoginAllowed && (
              <label>
                Пароль администратора
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                />
              </label>
            )}
            {error && (
              <div className="a-error" role="alert">
                {error}
              </div>
            )}
            <button className="a-btn" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <>
                  {localLoginAllowed ? 'Войти в панель' : 'Войти через Telegram'}{' '}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
            {localLoginAllowed && telegram?.initData && (
              <button
                className="a-btn secondary"
                type="button"
                disabled={busy}
                onClick={() => void login(true)}
              >
                Войти как владелец через Telegram
              </button>
            )}
          </form>
          <small>
            <ShieldCheck size={14} />
            Доступ только для администратора
          </small>
          <button className="a-link" onClick={onExit}>
            Вернуться в магазин <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    );
  if (!state)
    return (
      <div className="admin-app a-login-wrap">
        <div className="a-loading">
          <LoaderCircle className="spin" />
          <p>Загружаем магазин…</p>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
    );
  const analyticsView = ['overview', 'analytics', 'activity'].includes(current.id),
    pendingReviews = reviews.filter((r) => r.status === 'pending').length;
  return (
    <div className="admin-app">
      <aside className="a-sidebar">
        <a className="a-admin-logo" href="#/admin/overview">
          <img className="ficus-mark" src={`${import.meta.env.BASE_URL}ficus-mascot.png`} alt="" />
          <span>
            фиКУС<small>ПАНЕЛЬ ВЛАДЕЛЬЦА</small>
          </span>
        </a>
        <div className="a-workspace">
          <span>
            <span className="a-workspace-avatar">ф</span>
            <span>
              <b>Мой магазин</b>
              <small>
                <i />
                Рабочее пространство
              </small>
            </span>
          </span>
          <ChevronDown size={14} />
        </div>
        <span className="a-nav-label">УПРАВЛЕНИЕ</span>
        <nav className="a-side-nav" aria-label="Разделы админки">
          {pages.map((p, i) => (
            <button
              key={p.id}
              className={current.id === p.id ? 'active' : ''}
              aria-current={current.id === p.id ? 'page' : undefined}
              onClick={() => navigate(p.id)}
            >
              <p.icon size={19} />
              <span>{p.label}</span>
              {p.id === 'products' ? (
                <small>{state.catalog.products.length}</small>
              ) : p.id === 'reviews' && pendingReviews > 0 ? (
                <small className="a-pending-count">{pendingReviews}</small>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="a-sidebar-bottom">
          <div className="a-sidebar-tip">
            <span>
              Маленькие изменения.
              <br />
              <b>Большие возможности.</b>
            </span>
            <img className="ficus-mark" src={`${import.meta.env.BASE_URL}ficus-mascot.png`} alt="" />
          </div>
          <button className="a-open-store" onClick={onExit}>
            Открыть магазин <ArrowUpRight size={17} />
          </button>
          <div className="a-owner">
            <span className="a-owner-avatar">В</span>
            <div>
              <b>Владелец магазина</b>
              <small>Администратор</small>
            </div>
            <button
              className="a-icon"
              title="Выйти"
              aria-label="Выйти из админки"
              onClick={async () => {
                try {
                  await mutation('/admin/logout', 'POST', {});
                  setState(null);
                  setAuth(false);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="a-main">
        <header className="a-topbar">
          <div className="a-breadcrumb">
            Рабочее пространство <span>/</span>
            <b>{current.label}</b>
          </div>
          <div className="a-topbar-actions">
            <span className="a-live">
              <i />
              Данные магазина
            </span>
            <button className="a-icon" aria-label="Переключить тему панели" onClick={onToggleTheme}>
              {mode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <span className="a-owner-avatar">В</span>
          </div>
        </header>
        <main className="a-content">
          <div className="a-page-heading">
            <div>
              <span className="a-eyebrow">ФИКУС · РАБОЧЕЕ ПРОСТРАНСТВО</span>
              <h1>
                {current.label}
                <span>{current.id === 'overview' ? ' магазина' : ''}</span>
              </h1>
              <p>{current.caption}</p>
            </div>
            {analyticsView && (
              <div className="a-period">
                <CalendarDays size={16} />
                <select
                  aria-label="Период аналитики"
                  value={from && to && current.id !== 'overview' ? 'custom' : days}
                  onChange={(e) => {
                    setDays(e.target.value);
                    setFrom('');
                    setTo('');
                  }}
                >
                  {from && to && current.id !== 'overview' && (
                    <option value="custom">Свой период</option>
                  )}
                  <option value="1">За 24 часа</option>
                  <option value="7">За 7 дней</option>
                  <option value="30">За 30 дней</option>
                  <option value="90">За 90 дней</option>
                </select>
                <button
                  className="a-icon"
                  disabled={refreshing}
                  aria-label="Обновить аналитику"
                  onClick={() => void refresh()}
                >
                  <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
                </button>
              </div>
            )}
          </div>
          {error && (
            <div className="a-error a-global-error" role="alert">
              <p>{error}</p>
              <button
                className="a-link"
                disabled={busy}
                onClick={async () => {
                  if (
                    confirm('Обновить данные? Несохранённые поля останутся в открытом редакторе.')
                  ) {
                    await bootstrap().catch((err) => setError(err.message));
                  }
                }}
              >
                Обновить данные
              </button>
              <button className="a-icon" aria-label="Закрыть ошибку" onClick={() => setError('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {analyticsView && current.id !== 'overview' && (
            <div className="a-analytics-filters">
              <select
                className="a-select"
                aria-label="Товар в аналитике"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
              >
                <option value="">Все товары</option>
                {state.catalog.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <label>
                С
                <input
                  type="date"
                  aria-label="Начало периода"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                По
                <input
                  type="date"
                  aria-label="Конец периода"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              {(from || to) && (
                <button
                  className="a-link"
                  onClick={() => {
                    setFrom('');
                    setTo('');
                  }}
                >
                  Сбросить даты
                </button>
              )}
              <small>Время на графиках — Москва</small>
            </div>
          )}
          {analyticsView && metricsError && (
            <div className="a-error" role="alert">
              {metricsError}
              <button className="a-link" onClick={() => void refresh()}>
                Повторить
              </button>
            </div>
          )}
          {analyticsView && !metrics && !metricsError && (
            <div className="a-loading">
              <LoaderCircle className="spin" />
              <p>Собираем картину магазина…</p>
            </div>
          )}
          {current.id === 'overview' && metrics && (
            <Overview
              data={metrics}
              catalog={state.catalog}
              onEdit={(id) => setEditing(state.catalog.products.find((p) => p.id === id) ?? null)}
              onAnalytics={() => navigate('analytics')}
            />
          )}
          {current.id === 'analytics' && metrics && (
            <AnalyticsPage
              data={metrics}
              catalog={state.catalog}
              onEdit={(id) => setEditing(state.catalog.products.find((p) => p.id === id) ?? null)}
            />
          )}
          {current.id === 'activity' && metrics && (
            <ActivityPage
              data={metrics}
              catalog={state.catalog}
              selectedSession={sessionFilter}
              onSession={setSessionFilter}
              onEventPage={setEventPage}
              onSessionPage={setSessionPage}
            />
          )}
          {current.id === 'products' && (
            <CatalogManager
              state={state}
              busy={busy}
              save={save}
              onEdit={setEditing}
              onLinks={openLinks}
            />
          )}
          {current.id === 'categories' && (
            <CategoriesManager state={state} busy={busy} save={save} />
          )}
          {current.id === 'reviews' && (
            <ReviewsManager state={state} reviews={reviews} reload={loadReviews} notify={notify} />
          )}
          {current.id === 'links' && (
            <LinksManager
              state={state}
              links={links}
              reload={loadLinks}
              productId={linkProduct}
              onProduct={setLinkProduct}
              notify={notify}
            />
          )}
          {current.id === 'blacklist' && <BlacklistManager notify={notify} />}
          {current.id === 'gateway' && <GatewayPage/>}
          {current.id === 'bots' && <BotsPage/>}
          {current.id === 'channel-import' && <ChannelImportPage state={state}/>}
          {current.id === 'settings' && <SettingsPage state={state} busy={busy} save={save} />}
          <footer className="a-page-footer">
            <span>
              фиКУС <i>·</i> Сделано для удобного управления
            </span>
            {analyticsView && updatedAt && (
              <span>
                Обновлено{' '}
                {updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} ·
                автообновление 30 с
              </span>
            )}
          </footer>
        </main>
      </div>
      {editing && (
        <ProductEditor
          key={editing.id}
          product={editing}
          catalog={state.catalog}
          save={save}
          busy={busy}
          onClose={() => setEditing(null)}
          onLinks={openLinks}
        />
      )}
      <div className={`a-toast ${notice ? 'show' : ''}`} role="status" aria-live="polite">
        {notice && (
          <>
            <Check size={17} />
            {notice}
          </>
        )}
      </div>
    </div>
  );
}
