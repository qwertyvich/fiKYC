import { resolveRoute } from './routing';
import { AccessScreen } from './AccessScreen';
import { lazy, Suspense } from 'react';
import { api, loadPublic, loadAccess, type AccessState, type PublicState } from './api';
import { configureAnalytics, productVisit, track } from './analytics';
import { refreshReviews } from './review-store';
const AdminPanel = lazy(() => import('./admin/AdminPanel').then(m => ({ default: m.AdminPanel })));
import { t, getLanguage, subscribeLanguage, refreshTelegramLanguage, setLanguageChoice } from './i18n';
import { LanguageSettings } from './LanguageSettings';
import { subscribePricing,pricingSnapshot,configurePricing,refreshTelegramPricing,configureMenuLanguage } from './pricing';
import {lineMoney} from './domain';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, CircleHelp, Download, Grid2X2, Heart, Leaf, List, LoaderCircle, Minus, Moon, Package, Plus, Search, Settings2, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Sun, Trash2, Upload, UserRound, X } from 'lucide-react';
import { brands, cartLines, currencyTotals, entryTheme, isAvailable, isRequest, priceLabel, requestFields, requestKinds, validateRequest, money, parseCatalog, selectProducts, themeFor, type CartItem, type Catalog, type Group, type Order, type Product, type ServiceRequest, type ShopSettings, type Sort } from './domain';
import { readLocal, store, writeLocal } from './store';
import { defaultShop } from './commerce';
import { ProductStats } from './ProductReviews';
import { Wallet } from './Wallet';
import { PaymentPage, PaymentHistory } from './PaymentFlow';
import { RequestCheckoutPage } from './TelegramCheckout';
import { ProductPage, CheckoutPage, OrdersPage, OrderPage, OrderPreview, SupportPage, ShopEditor, OfferEditor } from './CommerceUI';
import { haptic, telegram } from './telegram';
import { BrandArt, Mascot } from './visuals';
import { ProductCover } from './ProductCover';
import { ClaudeHero, ClawdProductArt, useClawdMotion } from './ClaudeSection';
import { APPEARANCE_STORAGE_KEY, isAppearance, resolveMode, type Appearance, type ColorMode } from './appearance';

const systemColorMode = (): ColorMode => (telegram?.initData && telegram.colorScheme) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const routeNow = () => resolveRoute(location.hash, location.search, telegram?.initDataUnsafe?.start_param);
const scrollMemory = new Map<string, number>();
let productReturn = '';
const go = (route: string) => {
  const current = routeNow(); const scroller = document.querySelector('.app-scroll');
  scrollMemory.set(current, scroller?.scrollTop ?? 0);
  if (route.startsWith('/product/') && current !== route) track('product_click', { productId: route.split('/')[2] });
  if (route.startsWith('/product/') && !current.startsWith('/product/')) productReturn = current;
  if (current === route) scroller?.scrollTo({ top: 0, behavior: 'smooth' }); else location.hash = route;
};
function safeSaved<T>(key: string, fallback: T, validate: (x: T) => boolean) { const x = readLocal(key, fallback); return validate(x) ? x : fallback; }
function useSaved<T>(key: string, initial: T, validate: (x: T) => boolean) {
  const [value, setValue] = useState<T>(() => safeSaved(key, initial, validate));
  useEffect(() => { try { writeLocal(key, value); } catch { /* Memory-only operation when WebView storage is unavailable. */ } }, [key, value]);
  return [value, setValue] as const;
}
const validFavorites = (x: string[]) => Array.isArray(x) && x.every(i => typeof i === 'string');
const validCart = (x: CartItem[]) => Array.isArray(x) && x.every(i => i && typeof i.productId === 'string' && Number.isSafeInteger(i.quantity) && i.quantity > 0) && new Set(x.map(i => i.productId)).size === x.length;

export function App() {
  useSyncExternalStore(subscribeLanguage, getLanguage);
  useSyncExternalStore(subscribePricing, pricingSnapshot);
  const [route, setRoute] = useState(routeNow);
  const [access, setAccess] = useState<AccessState | null>(null);
  const [accessError, setAccessError] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [favorites, setFavorites] = useSaved<string[]>('favorites', [], validFavorites);
  const [cart, setCart] = useSaved<CartItem[]>('cart', [], validCart);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('manual');
  const [available, setAvailable] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState(false);
  const [toast, setToast] = useState('');
  const [shop, setShop] = useState<ShopSettings>(defaultShop);
  const [shopEditor, setShopEditor] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const routeRef = useRef(routeNow());
  const [appearance, setAppearanceState] = useState<Appearance>(() => safeSaved(APPEARANCE_STORAGE_KEY, 'auto', isAppearance));
  const setAppearance = (value: Appearance) => { setAppearanceState(value); try { writeLocal(APPEARANCE_STORAGE_KEY, value); } catch {} };
  const [siteSettings, setSiteSettings] = useState<PublicState['settings'] | null>(null);
  const startParam = new URLSearchParams(location.search).get('tgWebAppStartParam') ?? new URLSearchParams(location.search).get('ref') ?? telegram?.initDataUnsafe?.start_param ?? '';
  const [resolvingLink, setResolvingLink] = useState(/^[pg]_/.test(startParam) && !location.hash.startsWith('#/admin'));
  const analyticsStarted = useRef(false);
  const menuLanguageStamp=useRef<number|null>(null);
  const [systemMode, setSystemMode] = useState<ColorMode>(systemColorMode);
  const mode = resolveMode(appearance, systemMode);
  const [lockedTheme] = useState(() => entryTheme(location.search, telegram?.initDataUnsafe?.start_param));
  const [kind, id] = route.split('?')[0].replace(/^\//, '').split('/');
  const currentRecord = [...orders, ...requests].find(o => o.id === id);
  const supportProductId = new URLSearchParams(route.split('?')[1] ?? '').get('product');
  const currentProduct = catalog?.products.find(p => p.id === id && p.visible && catalog.groups.some(g => g.id === p.groupId && g.visible));
  const groupId = kind === 'group' ? id : kind === 'product' ? currentProduct?.groupId : 'all';
  const group = catalog?.groups.find(g => g.id === groupId && g.visible);
  const theme = themeFor(lockedTheme, group);
  const lines = catalog ? cartLines(catalog, cart) : [];
  const cartCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totals = currencyTotals(lines.map(l => ({ price: l.product.price, currency: l.product.currency, quantity: l.quantity })));
  const catalogPage = kind === 'catalog' || kind === 'group' || kind === 'favorites';
  const notify = (message: string) => { setToast(message); haptic(); };

  useEffect(() => {
    let live = true; let accessEpoch = 0;
    const refresh = () => { const epoch = ++accessEpoch; if(document.visibilityState !== 'visible') return; loadAccess().then(data => { if(!live || epoch!==accessEpoch)return; setAccess(data);if(data.languageSelection&&menuLanguageStamp.current!==data.languageSelection.updatedAt){menuLanguageStamp.current=data.languageSelection.updatedAt;setLanguageChoice(data.languageSelection.language);configureMenuLanguage(data.languageSelection.language);}else if(!data.languageSelection&&menuLanguageStamp.current!==null){menuLanguageStamp.current=null;configureMenuLanguage(undefined);refreshTelegramLanguage(telegram?.initDataUnsafe?.user?.language_code);setLanguageChoice('auto');}setAccessError(false);if(data.blocked||data.telegramRequired)configureAnalytics(false); }).catch(()=>{if(live)setAccessError(true);}); };
    const denied = (event:Event) => { ++accessEpoch; const code=(event as CustomEvent).detail; configureAnalytics(false);setAccess(prev=>({...prev,isSeller:false,localAdminLogin:prev?.localAdminLogin??false,botUrl:prev?.botUrl??null,blocked:code==='maintenance',telegramRequired:code==='telegram_required'})); };
    refresh(); const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);window.addEventListener('fikus:access-denied',denied);
    return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('fikus:access-denied',denied);};
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all([store.loadCatalog(), store.loadOrders(), store.loadRequests(), store.loadShop(), loadPublic()]).then(([c, o, r, info, data]) => { if (live) {
      setCatalog(c); setOrders(o); setRequests(r); setShop(info); setSiteSettings(data.settings); setLoadError(false);
      configurePricing(data.settings);
      configureAnalytics(data.settings.analyticsEnabled);
      void refreshReviews().catch(() => {});
    } }).catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
  if (kind === 'admin') return;
    let live = true;
    const refresh = () => { if (document.visibilityState !== 'visible') return; loadPublic(true).then(data => {
      if (!live) return;
      setCatalog(prev => JSON.stringify(prev) === JSON.stringify(data.catalog) ? prev : data.catalog);
      setShop(data.shop); setSiteSettings(data.settings); configurePricing(data.settings); configureAnalytics(data.settings.analyticsEnabled);
      void refreshReviews().catch(() => {});
    }).catch(() => {}); };
    refresh(); const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [kind]);
  useEffect(() => {
    if (!resolvingLink) return;
    let live = true;
    api<{ productId?: string; groupId?: string; linkId: string }>('/links/' + encodeURIComponent(startParam.slice(2))).then(data => {
      if (!live) return;
      location.hash = data.groupId ? '/group/' + data.groupId : '/product/' + data.productId;
      track('link_open', { ...(data.productId ? {productId:data.productId} : {}), linkId: data.linkId });
    }).catch(() => { if (live) location.hash = '/link-unavailable'; }).finally(() => { if (live) setResolvingLink(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!catalog || !siteSettings || kind === 'admin') return;
    if (!analyticsStarted.current) { track('session_start'); analyticsStarted.current = true; }
  }, [catalog, siteSettings, kind]);
  useEffect(() => {
    if (!catalog) return;
    if (kind === 'product' && currentProduct && !resolvingLink) return productVisit(currentProduct.id);
    if (kind === 'checkout') track('checkout_view', { productIds: lines.map(l=>l.product.id) });
  }, [kind, currentProduct?.id, resolvingLink, !!catalog]);
  useEffect(() => {
    if (catalog && kind === 'group' && !catalog.groups.some(g => g.id === id && g.visible)) go('/catalog');
  }, [catalog, kind, id]);
  useEffect(() => {
    const onHash = () => {
      const scroller = document.querySelector('.app-scroll');
      scrollMemory.set(routeRef.current, scroller?.scrollTop ?? 0);
      const next = routeNow(); routeRef.current = next; setRoute(next); setFilters(false); setCategoriesOpen(false);
      requestAnimationFrame(() => scroller?.scrollTo(0, scrollMemory.get(next) ?? 0));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => {setSystemMode(systemColorMode());if(menuLanguageStamp.current===null)refreshTelegramLanguage(telegram?.initDataUnsafe?.user?.language_code);refreshTelegramPricing(telegram?.initDataUnsafe?.user);};
    const visible = () => {if(document.visibilityState==='visible')changed();};
    media.addEventListener('change', changed);
    telegram?.onEvent('themeChanged', changed);
    telegram?.onEvent('activated', changed);
    window.addEventListener('focus',changed);
    document.addEventListener('visibilitychange',visible);
    return () => { media.removeEventListener('change', changed); telegram?.offEvent('themeChanged', changed);telegram?.offEvent('activated',changed);window.removeEventListener('focus',changed);document.removeEventListener('visibilitychange',visible); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    document.documentElement.style.backgroundColor = color;
    document.documentElement.style.colorScheme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    if (telegram?.initData) { telegram.setHeaderColor(color); telegram.setBackgroundColor(color); }
  }, [theme, mode]);
  useEffect(() => {
    if (!telegram?.initData) return;
    const back = () => {
      if (shopEditor) setShopEditor(false);
      else if (categoriesOpen) setCategoriesOpen(false);
      else if (filters) setFilters(false);
      else if (kind === 'product') go(productReturn || (currentProduct ? `/group/${currentProduct.groupId}` : '/catalog'));
      else if (kind === 'order') go('/orders');
      else if (kind === 'checkout') go('/cart');
      else if (kind === 'payment') go('/orders');
      else if (kind === 'request-checkout') go(`/product/${id}`);
      else if (kind === 'support') go(currentRecord ? `/order/${currentRecord.id}` : '/profile');
      else if (kind === 'order-preview') go('/profile');
      else go('/catalog');
    };
    if (kind !== 'catalog' || filters || categoriesOpen || shopEditor) telegram.BackButton.show(); else telegram.BackButton.hide();
    telegram.BackButton.onClick(back);
    return () => telegram?.BackButton.offClick(back);
  }, [kind, id, filters, categoriesOpen, shopEditor, currentProduct?.groupId, currentRecord?.id]);
  const products = useMemo(() => {
    if (!catalog) return [];
    if (kind === 'favorites') return selectProducts(catalog, 'all', '', 'manual', false).filter(p => favorites.includes(p.id));
    const result = selectProducts(catalog, kind === 'group' ? id : 'all', query, sort, available);
    return result;
  }, [catalog, kind, id, query, sort, available, favorites]);

  function toggleFavorite(productId: string) { if (!favorites.includes(productId)) track('favorite_add', { productId }); setFavorites(prev => prev.includes(productId) ? prev.filter(x => x !== productId) : [...prev, productId]); haptic(); }
  function addToCart(p: Product, quantity = 1) {
    if (isRequest(p)) { go(`/product/${p.id}`); return; }
    const existing = cart.find(i => i.productId === p.id)?.quantity ?? 0;
    if (existing + quantity > p.stock) { notify('Больше нет в наличии'); return; }
    setCart(prev => existing ? prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + quantity } : i) : [...prev, { productId: p.id, quantity }]);
    track('cart_add', { productId: p.id, quantity });
    notify('Товар добавлен в корзину');
  }
  function changeQuantity(productId: string, delta: number) {
    const p = catalog?.products.find(p => p.id === productId);
    if (!p) return;
    const oldQuantity = cart.find(i => i.productId === productId)?.quantity ?? 0;
    const nextQuantity = Math.max(0, Math.min(p.stock, oldQuantity + delta));
    if (oldQuantity !== nextQuantity) track(nextQuantity === 0 ? 'cart_remove' : 'cart_quantity', { productId, quantity: nextQuantity === 0 ? oldQuantity : nextQuantity });
    setCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity: Math.max(0, Math.min(p.stock, i.quantity + delta)) } : i).filter(i => i.quantity > 0));
  }


  if (!access) return <AccessScreen kind={accessError ? 'unavailable' : 'loading'}/>;
  if (access.blocked) return <AccessScreen kind="maintenance"/>;
  if (access.telegramRequired) return <AccessScreen kind="telegram" botUrl={access.botUrl}/>;
  if (kind === 'order-preview' && !access.isSeller) return <AccessScreen kind="unavailable"/>;
  if (kind === 'admin' && !access.isSeller && !access.localAdminLogin) return <AccessScreen kind="unavailable"/>;
  if (kind === 'admin') return <Suspense fallback={<div className="loading"><LoaderCircle className="spin"/></div>}><AdminPanel page={id ?? 'overview'} mode={mode} onToggleTheme={() => setAppearance(mode === 'dark' ? 'light' : 'dark')} onExit={() => { void loadAccess().then(setAccess); loadPublic(true).then(data => { setCatalog(data.catalog); setShop(data.shop); setSiteSettings(data.settings); configurePricing(data.settings); configureAnalytics(data.settings.analyticsEnabled); void refreshReviews().catch(() => {}); }).catch(() => setLoadError(true)); go('/catalog'); }}/></Suspense>;

  return <div className="app-frame" data-page={kind}><div className="app-scroll">
    <header className="topbar">
      <button className="wordmark" aria-label={t("фиКУС — на главную")} onClick={() => { setQuery(''); go('/catalog'); }}><span className="logo ficus-logo"><img className={theme === 'fikus' ? 'ficus-mark' : undefined} src={`${import.meta.env.BASE_URL}${theme === 'claude' ? 'ficus-mascot-claude.png' : 'ficus-mascot.png'}`} alt="" width={54} height={54} /></span><span>{t("фиКУС")}<span className="brand-caption">{t("цифровой маркет")}</span></span></button>
      <div className="topbar-actions"><button className="icon-button appearance-toggle" aria-label={t(mode === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему')} title={t(mode === 'dark' ? 'Светлая тема' : 'Тёмная тема')} onClick={() => { setAppearance(mode === 'dark' ? 'light' : 'dark'); haptic(); }}>{mode === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button><button className="icon-button" aria-label={t("Помощь")} onClick={() => go('/support/new')}><CircleHelp size={21}/></button><button className="avatar" aria-label={t("Профиль")} onClick={() => go('/profile')}>{(telegram?.initDataUnsafe?.user?.first_name ?? t('Гость'))[0]}</button></div>
    </header>

    <main>
      {!catalog || resolvingLink ? <div className="loading">{loadError ? <><h2>{t("Не удалось открыть магазин")}</h2><p>{t("Проверьте соединение и попробуйте ещё раз.")}</p><button className="primary-button" onClick={() => location.reload()}>{t("Попробовать снова")}</button></> : <><LoaderCircle className="spin"/><p>{t("Расставляем всё по полочкам…")}</p></>}</div> : <>
        {catalogPage && <>
          {siteSettings?.announcementEnabled && siteSettings.announcement && <div className="store-announcement">{siteSettings.announcement}</div>}
          {kind !== 'favorites' && (theme === 'claude' ? <ClaudeHero onExplore={() => document.querySelector('.catalog-heading')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })} onVerify={() => go('/product/claude-kyc')}/> : kind === 'catalog' && catalog.groups.some(g => g.id === 'claude' && g.visible) ? <ClaudeHero className="claude-featured" onExplore={() => { setQuery(''); go('/group/claude'); }} onVerify={() => go('/product/claude-kyc')}/> : <section className={`hero ${kind === 'group' ? 'group-hero' : ''}`}>
            <div className="hero-copy"><span className="eyebrow"><span className="live-dot"/>{t(group ? group.title : 'Меньше хлопот. Больше возможностей.')}</span><h1>{t(siteSettings?.heroTitle ?? "Всё нужное. В одном месте.")}</h1><p>{t(siteSettings?.heroSubtitle ?? "Пополнения, карты, сервисы и поездки — выбирай под свою задачу.")}</p><span className="hero-note"><ShieldCheck size={14}/>{t(" Выбирай. Подключай. Пользуйся.")}</span></div>
          </section>)}
          {kind === 'favorites' ? <PageTitle title={t("Избранное")} subtitle={t("То, что хочется оставить под рукой")}/> : kind === 'catalog' && theme !== 'claude' && catalog.groups.some(g => g.id === 'claude' && g.visible) && <button className="spotlight market-spotlight" onClick={() => document.querySelector('.catalog-heading')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}><span className="market-spotlight-icon"><img className="ficus-mark" src={`${import.meta.env.BASE_URL}ficus-mascot.png`} alt="" width={54} height={54}/></span><span><b>{t(siteSettings?.heroTitle ?? "Всё нужное. В одном месте.")}</b><small>{t(siteSettings?.heroSubtitle ?? "Пополнения, карты, сервисы и поездки")}</small></span><ArrowDown size={18}/></button>}

          {kind !== 'favorites' && <div className="catalog-guarantee"><ShieldCheck size={16}/><span>{t("100% гарантия · Доводим до согласованного результата")}</span></div>}
          {kind !== 'favorites' && <>
          <div className="catalog-heading"><h2>{t(group?.title ?? 'Каталог')}</h2><span>{products.length} {t(products.length === 1 ? 'товар' : products.length > 1 && products.length < 5 ? 'товара' : 'товаров')}</span></div>
          <div className="search-row"><label className="search-field"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Сервис, услуга или название")} aria-label={t("Поиск по товарам")}/>{t(query && <button aria-label={t("Очистить поиск")} onClick={() => setQuery('')}><X size={16}/></button>)}</label><button className={`filter-button ${available ? 'has-filter' : ''}`} aria-label={t("Фильтры")} onClick={() => setFilters(true)}><SlidersHorizontal size={20}/>{available && <i/>}</button></div>
          <button className="category-directory" onClick={() => setCategoriesOpen(true)}><Grid2X2 size={17}/><span>{t("Все категории")}</span><small>{catalog.groups.filter(g => g.visible).length}</small><ChevronRight size={16}/></button><div className="category-scroll" aria-label={t("Группы товаров")}><button className={kind !== 'group' ? 'selected' : ''} onClick={() => go('/catalog')}><Grid2X2 size={15}/>{t("Все")}</button>{catalog.groups.filter(g => g.visible).map(g => <button key={g.id} className={groupId === g.id ? 'selected' : ''} onClick={() => { setQuery(''); go(`/group/${g.id}`); }}><BrandArt brand={g.icon} small/>{t(g.title)}</button>)}</div>
          <div className="catalog-toolbar"><label className="sort-control"><ArrowDown size={14}/><select aria-label={t("Сортировка")} value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="manual">{t("Рекомендуем")}</option><option value="price-asc">{t("Сначала дешевле")}</option><option value="price-desc">{t("Сначала дороже")}</option><option value="name">{t("По названию")}</option></select><ChevronDown size={13}/></label><div className="layout-toggle"><button aria-label={t("Плиткой")} aria-pressed={layout === 'grid'} className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')}><Grid2X2 size={16}/></button><button aria-label={t("Списком")} aria-pressed={layout === 'list'} className={layout === 'list' ? 'active' : ''} onClick={() => setLayout('list')}><List size={18}/></button></div></div>
          </>}
          {products.length ? <div className={`products ${kind !== 'favorites' && layout === 'list' ? 'products-list' : ''}`}>{products.map(p => <ProductCard key={p.id} product={p} favorite={favorites.includes(p.id)} onFavorite={() => toggleFavorite(p.id)} onAdd={() => addToCart(p)} inCart={cart.some(i => i.productId === p.id)}/>)}</div> : <Empty icon={kind === 'favorites' ? <Heart/> : <Search/>} title={t(kind === 'favorites' ? 'В избранном пока пусто' : query ? 'Пока ничего не нашлось' : 'Скоро здесь появятся товары')} text={t(kind === 'favorites' ? 'Нажмите на сердечко у понравившегося товара — он появится здесь.' : query ? 'Попробуйте другое название или уберите фильтры.' : 'Загляните в другие разделы каталога.')} action={t("Весь каталог")} onAction={() => { setQuery(''); setAvailable(false); go('/catalog'); }}/>}
          {kind !== 'favorites' && <><div className="catalog-footer"><Leaf size={15}/><span>{t(theme === 'claude' ? 'От маленького «привет» — к большим идеям' : 'Растём вместе с твоими задачами')}</span></div>{theme === 'claude' && <a className="clawd-credits" href="https://codechrisb.github.io/MyClawd/" target="_blank" rel="noreferrer">Clawd animations · MyClawd ↗</a>}</>}
        </>}

        {kind === 'product' && (currentProduct ? <ProductPage key={currentProduct.id} product={currentProduct} group={group} shop={shop} favorite={favorites.includes(currentProduct.id)} onFavorite={() => toggleFavorite(currentProduct.id)} onAdd={qty => addToCart(currentProduct, qty)} onRequest={async details => { writeLocal(`request-handoff:${currentProduct.id}`, details); track('request_submit', { productId: currentProduct.id }); go(`/request-checkout/${currentProduct.id}`); }} onBack={() => go(productReturn || (group ? `/group/${group.id}` : '/catalog'))} navigate={go}/> : <Empty icon={<Package/>} title={t("Предложение недоступно")} text={t("Возможно, приём заявок закрыт или предложение скрыто. Посмотрите другие варианты.")} action={t("В каталог")} onAction={() => go('/catalog')}/>)}
        {kind === 'request-checkout' && currentProduct && <RequestCheckoutPage product={currentProduct} shop={shop} navigate={go}/>}
        {kind === 'payment' && <PaymentPage key={id} id={id} shop={shop} navigate={go}/>}
        {kind === 'checkout' && <CheckoutPage lines={lines} shop={shop} navigate={go}/>}
        {kind === 'order' && (currentRecord ? <OrderPage record={currentRecord} catalog={catalog} navigate={go} onConfirm={async () => { const updated = await store.acceptQuote(currentRecord.id); setRequests(prev => prev.map(r => r.id === updated.id ? updated : r)); }}/> : <Empty icon={<Package/>} title={t("Заказ не найден")} text={t("Проверьте ссылку на заказ или свяжитесь с продавцом.")} action={t("Мои заказы")} onAction={() => go('/orders')}/>)}
        {kind === 'order-preview' && <OrderPreview catalog={catalog} state={id ?? ''} navigate={go}/>}
        {kind === 'support' && <SupportPage key={route} shop={shop} record={currentRecord} product={catalog.products.find(p => p.id === supportProductId)} navigate={go} notify={notify}/>}


        {kind === 'cart' && <><PageTitle title={t("Корзина")} subtitle={t(lines.length ? 'Всё готово к следующему шагу' : 'Соберём что-нибудь полезное?')}/>{lines.length ? <>
          <div className="cart-list">{lines.map(({ product: p, quantity }) => <article className="cart-row" key={p.id}><button className={`cart-art art-${p.brand}`} onClick={() => go(`/product/${p.id}`)} aria-label={t(p.title)}><BrandArt brand={p.brand} productId={p.id}/></button><div className="cart-row-info"><button className="text-button" onClick={() => go(`/product/${p.id}`)}>{t(p.title)}</button><small>{t(p.subtitle)}</small><strong>{t(lineMoney(p.price, quantity, p.currency))}</strong><div className="quantity"><button aria-label={t(`Уменьшить ${p.title}`)} onClick={() => changeQuantity(p.id, -1)}><Minus size={14}/></button><span>{quantity}</span><button aria-label={t(`Увеличить ${p.title}`)} disabled={quantity >= p.stock} onClick={() => changeQuantity(p.id, 1)}><Plus size={14}/></button></div>{quantity > p.stock && <small className="error">{t("Доступно только ")}{p.stock}{t(" шт.")}</small>}</div><button className="icon-button remove" aria-label={t(`Удалить ${p.title}`)} onClick={() => { track('cart_remove', { productId: p.id, quantity }); setCart(prev => prev.filter(i => i.productId !== p.id)); }}><Trash2 size={17}/></button></article>)}</div>
          <div className="summary-card"><div><span>{t("Товары (")}{cartCount})</span><span>{t(totals.join(' + '))}</span></div><div className="summary-total"><strong>{t("Итого")}</strong><strong>{totals.map(total => <span className="currency-total" key={total}>{total}</span>)}</strong></div>{totals.length > 1 && <p className="fine-print">{t("Каждая валюта рассчитана отдельно, без конвертации.")}</p>}<button className="primary-button" disabled={lines.some(l => l.quantity > l.product.stock)} onClick={() => go('/checkout')}>{t("Перейти к оформлению")}<ArrowRight size={18}/></button><p className="fine-print">{t("Проверьте заказ и получите реквизиты для оплаты. Если нужна помощь, менеджер будет рядом.")}</p></div>
        </> : <Empty icon={<ShoppingBag/>} title={t("Тут пока просторно")} text={t("Добавьте нужные сервисы из каталога. Они будут ждать вас здесь.")} action={t("За покупками")} onAction={() => go('/catalog')}/>}</>}

        {kind === 'orders' && <><PaymentHistory navigate={go}/>{(orders.length > 0 || requests.length > 0) && <OrdersPage orders={orders} requests={requests} navigate={go}/>}</>}

        {kind === 'profile' && <><PageTitle title={t("Профиль")}/><section className="profile-card"><div className="profile-avatar">{(telegram?.initDataUnsafe?.user?.first_name ?? t('Гость'))[0]}</div><h2>{telegram?.initDataUnsafe?.user?.first_name ?? t('Привет, гость!')}</h2><p>{t(telegram?.initData ? 'Рады видеть тебя в фиКУСе' : 'Осматривайся — здесь всё для тебя')}</p><span className="demo-badge">{t(telegram?.initData ? 'Telegram Mini App' : 'фиКУС')}</span></section><Wallet shop={shop} navigate={go}/><div className="menu-list"><MenuRow icon={<Package/>} title={t("Мои заказы")} onClick={() => go('/orders')}/><MenuRow icon={<Heart/>} title={t("Избранное")} extra={t(`${favorites.length}`)} onClick={() => go('/favorites')}/><MenuRow icon={<CircleHelp/>} title={t("Помощь и поддержка")} onClick={() => go('/support/new')}/></div>{kind === 'profile' && <section className="appearance-settings"><h3>{t("Оформление")}</h3><div className="appearance-options" role="group" aria-label={t("Тема оформления")}>{([['light', 'Светлая'], ['dark', 'Тёмная'], ['auto', 'Как в Telegram']] as const).map(([value, label]) => <button key={value} aria-pressed={appearance === value} className={appearance === value ? 'selected' : ''} onClick={() => { setAppearance(value); haptic(); }}>{t(label)}</button>)}</div></section>}<LanguageSettings/>{access.isSeller && <><p className="section-caption">Управление магазином</p><div className="menu-list"><MenuRow icon={<Settings2/>} title="Панель администратора" onClick={() => go('/admin/overview')}/></div></>}<div className="profile-mascot"><Mascot theme={theme}/><p>{t("Сервисы для ваших задач. Поддержка до результата.")}</p><small>{t("фиКУС · v0.1")}</small></div></>}

        {kind === 'help' && <><PageTitle title={t("На связи")} subtitle={t("Пара ответов, чтобы всё стало проще")}/><div className="help-hero"><Mascot theme={theme}/><h2>{t("Поможем разобраться")}</h2><p>{t("Выбирай сервис, читай условия и оформляй покупку или заявку.")}</p></div><div className="faq-list">{[
          ['Как оформить заказ?', 'Товары с фиксированной ценой добавляйте в корзину. Для услуг «По запросу» откройте карточку и заполните параметры: стоимость и срок согласуются отдельно. На следующем шаге появится сообщение, которое нужно отправить продавцу в Telegram.'],
          ['Где посмотреть мои покупки?', 'Уточнить состав, оплату и состояние заказа можно в чате продавца.'],
          ['Почему меняется оформление?', 'У некоторых разделов свой характер. В Claude живёт его персонаж, а в остальных разделах — фиКУС. Если вы пришли по ссылке Claude, его стиль останется с вами во всём маркете.'],
          ['Что входит в услугу?', 'Условия и состав указываются в описании каждого товара. Услуги настройки оказываются для ваших собственных профилей и сервисов.'],
          ['Как связаться с магазином?', 'Откройте раздел «Помощь и поддержка» в профиле — там указан контакт магазина.'],
        ].map(([q, a]) => <details key={q}><summary>{t(q)}<Plus size={17}/></summary><p>{t(a)}</p></details>)}</div></>}


        {kind === 'link-unavailable' && <Empty icon={<Search/>} title={t("Ссылка недоступна")} text={t("Попробуйте открыть её ещё раз или выберите предложение в каталоге.")} action={t("В каталог")} onAction={() => go('/catalog')}/>}
        {!['catalog', 'group', 'favorites', 'product', 'cart', 'orders', 'profile', 'help', 'admin', 'checkout', 'order', 'order-preview', 'support', 'request-checkout', 'payment', 'link-unavailable'].includes(kind) && <Empty icon={<Search/>} title={t("Эта страница потерялась")} text={t("В каталоге всё на своих местах.")} action={t("В каталог")} onAction={() => go('/catalog')}/>}
      </>}
    </main>
    <nav className="bottom-nav" aria-label={t("Главная навигация")}><div className="nav-main">{[
      { path: '/catalog', label: 'Маркет', icon: Grid2X2, active: ['catalog', 'group', 'product'].includes(kind) },
      { path: '/favorites', label: 'Избранное', icon: Heart, active: kind === 'favorites' },
      { path: '/orders', label: 'Заказы', icon: Package, active: ['orders', 'order', 'order-preview', 'payment'].includes(kind) },
      { path: '/profile', label: 'Профиль', icon: UserRound, active: ['profile', 'help', 'admin', 'support'].includes(kind) },
    ].map(({ path, label, icon: Icon, active }) => <button key={path} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => go(path)}><Icon size={21} strokeWidth={active ? 2.3 : 1.7}/><span>{t(label)}</span>{active && <i/>}</button>)}</div><button className="nav-cart" aria-label={t(`Корзина, ${cartCount} товаров`)} aria-current={kind === 'cart' ? 'page' : undefined} onClick={() => go('/cart')}><ShoppingBag size={24}/>{cartCount > 0 && <b>{cartCount}</b>}</button></nav>
    {categoriesOpen && catalog && <Sheet title={t("Все категории")} scrollHint onClose={() => setCategoriesOpen(false)}><div className="category-directory-grid">{catalog.groups.filter(g => g.visible).map(g => <button key={g.id} onClick={() => { setQuery(''); setCategoriesOpen(false); go(`/group/${g.id}`); }}><BrandArt brand={g.icon} small/><span>{t(g.title)}<small>{catalog.products.filter(p => p.visible && p.groupId === g.id).length}{t(" предложений")}</small></span><ChevronRight size={16}/></button>)}</div></Sheet>}
    {filters && <Sheet title={t("Настроим каталог")} onClose={() => setFilters(false)}><h3>{t("Сортировка")}</h3><div className="radio-list">{([['manual', 'Рекомендуем'], ['price-asc', 'Сначала дешевле'], ['price-desc', 'Сначала дороже'], ['name', 'По названию']] as const).map(([value, label]) => <label key={value}><input type="radio" name="sort" value={value} checked={sort === value} onChange={() => setSort(value)}/><span>{t(label)}</span>{sort === value && <Check size={18}/>}</label>)}</div><label className="switch-row"><span><b>{t("Только в наличии")}</b><small>{t("Товары в наличии и открытые заявки")}</small></span><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)}/><i/></label><button className="primary-button" onClick={() => setFilters(false)}>{t("Показать товары")}<ArrowRight size={18}/></button><button className="plain-button" onClick={() => { setSort('manual'); setAvailable(false); }}>{t("Сбросить фильтры")}</button></Sheet>}
    {shopEditor && <Sheet title={t("Информация магазина")} onClose={() => setShopEditor(false)}><ShopEditor shop={shop} onSave={async value => { await store.saveShop(value); setShop(value); notify('Информация магазина сохранена'); }}/></Sheet>}
    {t(toast && <div className="toast" role="status"><Check size={17}/>{t(toast)}</div>)}
  </div></div>;
}

function ProductCard({ product: p, favorite, onFavorite, onAdd, inCart }: { product: Product; favorite: boolean; onFavorite(): void; onAdd(): void; inCart: boolean }) {
  const { paused } = useClawdMotion();
  return <article className={`product-card ${p.badge === 'Хит' ? 'product-hit' : ''} ${paused ? 'motion-paused' : ''} ${!isAvailable(p) ? 'sold-out' : ''}`}><div className={`product-art art-${p.brand}`}><button className="art-link" aria-label={t(`Подробнее: ${p.title}`)} onClick={() => go(`/product/${p.id}`)}><span className="art-watermark">{t(p.brand === 'claude' ? 'claude' : p.brand === 'mail' ? 'письма' : p.brand === 'cdek' ? 'identity' : 'workspace')}</span><span className="art-orbit"/>{p.brand === 'claude' && !p.imageId ? <ClawdProductArt product={p}/> : <ProductCover product={p}/>}<span className="art-caption">{t(p.brand === 'claude' ? 'a little more possible' : 'сервисы для жизни')}</span></button>{t(p.badge && <span className={`product-badge ${p.badge === 'Хит' ? 'hit' : ''}`}>{p.badge === 'Хит' && <Sparkles size={10}/>} {t(p.badge)}</span>)}<button className={`favorite-button ${favorite ? 'saved' : ''}`} aria-label={t(`${favorite ? 'Убрать из избранного' : 'В избранное'}: ${p.title}`)} aria-pressed={favorite} onClick={onFavorite}><Heart size={17} fill={favorite ? 'currentColor' : 'none'}/></button></div><div className="product-info"><button className="product-title" onClick={() => go(`/product/${p.id}`)}>{t(p.title)}</button><p>{t(p.subtitle)}</p><ProductStats product={p}/><span className={`stock ${isAvailable(p) ? '' : 'empty-stock'}`}><i/>{t(isRequest(p) ? (isAvailable(p) ? 'Приём заявок' : 'Приём закрыт') : p.stock ? `${p.stock} в наличии` : 'Скоро появится')}</span><div className="product-price"><strong>{t(priceLabel(p))}</strong><button disabled={!isAvailable(p)} aria-label={t(`${isRequest(p) ? 'Оформить заявку' : 'Добавить в корзину'}: ${p.title}`)} className={inCart ? 'in-cart' : ''} onClick={onAdd}>{isRequest(p) ? <ArrowRight size={19}/> : inCart ? <Check size={19}/> : <Plus size={19}/>}</button></div></div></article>;
}

function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) { return <div className="page-title"><button className="back-link" onClick={() => go('/catalog')}><ArrowLeft size={16}/>{t(" В маркет")}</button><h1>{t(title)}</h1>{t(subtitle && <p>{t(subtitle)}</p>)}</div>; }
function Empty({ icon, title, text, action, onAction }: { icon: ReactNode; title: string; text: string; action: string; onAction(): void }) { return <div className="empty-state"><div className="empty-icon">{t(icon)}</div><h2>{t(title)}</h2><p>{t(text)}</p><button className="primary-button" onClick={onAction}>{t(action)}<ArrowRight size={18}/></button></div>; }
function MenuRow({ icon, title, extra, onClick }: { icon: ReactNode; title: string; extra?: string; onClick(): void }) { return <button onClick={onClick}>{t(icon)}<span>{t(title)}</span>{t(extra && <small>{t(extra)}</small>)}<ChevronRight size={17}/></button>; }

const requestKindLabels: Record<NonNullable<Product['requestKind']>, string> = { topup: 'Пополнение', gift: 'Подарочная карта', verification: 'Верификация', finance: 'Финансовый сервис', profile: 'Профиль', rental: 'Аренда', travel: 'Бронирование', general: 'Общая заявка' };

function Sheet({ title, onClose, children, scrollHint = false }: { title: string; onClose(): void; children: ReactNode; scrollHint?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    const sheet = ref.current;
    if (!scrollHint || !sheet) return;
    const update = () => setHasMoreBelow(sheet.scrollHeight - sheet.clientHeight - sheet.scrollTop > 2);
    update();
    sheet.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(sheet);
    if (sheet.lastElementChild) observer.observe(sheet.lastElementChild);
    return () => { sheet.removeEventListener('scroll', update); observer.disconnect(); };
  }, [scrollHint]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex="0"]') ?? [])].filter(e => !e.hasAttribute('disabled'));
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab') { const els = focusable(); const first = els[0]; const last = els.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    const scroller = document.querySelector<HTMLElement>('.app-scroll');
    const old = scroller?.style.overflow ?? ''; if (scroller) scroller.style.overflow = 'hidden';
    window.addEventListener('keydown', key);
    return () => { if (scroller) scroller.style.overflow = old; window.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="sheet-scrim" onClick={onClose}><div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={e => e.stopPropagation()}><div className="sheet-handle"/><div className="sheet-title"><h2 id="sheet-title">{t(title)}</h2><button className="icon-button" aria-label={t("Закрыть")} onClick={onClose}><X size={21}/></button></div>{t(children)}</div>{scrollHint && <div className={`sheet-scroll-hint${hasMoreBelow ? ' visible' : ''}`} aria-hidden="true"/>}</div>;
}
