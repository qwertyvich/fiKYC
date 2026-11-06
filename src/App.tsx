import { t, getLanguage, subscribeLanguage } from './i18n';
import { LanguageSettings } from './LanguageSettings';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, CircleHelp, Download, Grid2X2, Heart, Leaf, List, LoaderCircle, Minus, Moon, Package, Plus, Search, Settings2, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Sun, Trash2, Upload, UserRound, X } from 'lucide-react';
import { brands, cartLines, currencyTotals, entryProduct, entryTheme, isAvailable, isRequest, priceLabel, requestFields, requestKinds, validateRequest, money, parseCatalog, selectProducts, themeFor, type CartItem, type Catalog, type Group, type Order, type Product, type ServiceRequest, type ShopSettings, type Sort } from './domain';
import { readLocal, store, writeLocal } from './store';
import { defaultShop } from './commerce';
import { ProductStats } from './ProductReviews';
import { Wallet } from './Wallet';
import { RequestCheckoutPage } from './TelegramCheckout';
import { ProductPage, CheckoutPage, OrdersPage, OrderPage, OrderPreview, SupportPage, ShopEditor, OfferEditor } from './CommerceUI';
import { haptic, telegram } from './telegram';
import { BrandArt, Mascot } from './visuals';
import { ProductCover } from './ProductCover';
import { ClaudeHero, ClawdProductArt, useClawdMotion } from './ClaudeSection';
import { isAppearance, resolveMode, type Appearance, type ColorMode } from './appearance';

const systemColorMode = (): ColorMode => (telegram?.initData && telegram.colorScheme) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const routeNow = () => location.hash.slice(1) || (entryProduct(location.search, telegram?.initDataUnsafe?.start_param) ? `/product/${entryProduct(location.search, telegram?.initDataUnsafe?.start_param)}` : null) || (entryTheme(location.search, telegram?.initDataUnsafe?.start_param) === 'claude' ? '/group/claude' : '/catalog');
const scrollMemory = new Map<string, number>();
let productReturn = '';
const go = (route: string) => {
  const current = routeNow(); const scroller = document.querySelector('.app-scroll');
  scrollMemory.set(current, scroller?.scrollTop ?? 0);
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
  const [route, setRoute] = useState(routeNow);
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
  const [appearance, setAppearance] = useSaved<Appearance>('appearance', 'dark', isAppearance);
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
    let live = true;
    Promise.all([store.loadCatalog(), store.loadOrders(), store.loadRequests(), store.loadShop()]).then(([c, o, r, info]) => { if (live) { setCatalog(c); setOrders(o); setRequests(r); setShop(info); setLoadError(false); } }).catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, []);
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
    const changed = () => setSystemMode(systemColorMode());
    media.addEventListener('change', changed);
    telegram?.onEvent('themeChanged', changed);
    return () => { media.removeEventListener('change', changed); telegram?.offEvent('themeChanged', changed); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
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

  function toggleFavorite(productId: string) { setFavorites(prev => prev.includes(productId) ? prev.filter(x => x !== productId) : [...prev, productId]); haptic(); }
  function addToCart(p: Product, quantity = 1) {
    if (isRequest(p)) { go(`/product/${p.id}`); return; }
    const existing = cart.find(i => i.productId === p.id)?.quantity ?? 0;
    if (existing + quantity > p.stock) { notify('Больше нет в наличии'); return; }
    setCart(prev => existing ? prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + quantity } : i) : [...prev, { productId: p.id, quantity }]);
    notify('Товар добавлен в корзину');
  }
  function changeQuantity(productId: string, delta: number) {
    const p = catalog?.products.find(p => p.id === productId);
    if (!p) return;
    setCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity: Math.max(0, Math.min(p.stock, i.quantity + delta)) } : i).filter(i => i.quantity > 0));
  }


  return <div className="app-frame" data-page={kind}><div className="app-scroll">
    <header className="topbar">
      <button className="wordmark" aria-label={t("фиКУС — на главную")} onClick={() => { setQuery(''); go('/catalog'); }}><span className="logo ficus-logo"><img src={`${import.meta.env.BASE_URL}${theme === 'claude' ? 'ficus-mascot-claude.png' : 'ficus-mascot.png'}`} alt="" width={54} height={54} /></span><span>{t("фиКУС")}<span className="brand-caption">{t("цифровой маркет")}</span></span></button>
      <div className="topbar-actions"><button className="icon-button appearance-toggle" aria-label={t(mode === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему')} title={t(mode === 'dark' ? 'Светлая тема' : 'Тёмная тема')} onClick={() => { setAppearance(mode === 'dark' ? 'light' : 'dark'); haptic(); }}>{mode === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button><button className="icon-button" aria-label={t("Помощь")} onClick={() => go('/support/new')}><CircleHelp size={21}/></button><button className="avatar" aria-label={t("Профиль")} onClick={() => go('/profile')}>{(telegram?.initDataUnsafe?.user?.first_name ?? t('Гость'))[0]}</button></div>
    </header>

    <main>
      {!catalog ? <div className="loading">{loadError ? <><h2>{t("Не удалось открыть магазин")}</h2><p>{t("Проверьте соединение и попробуйте ещё раз.")}</p><button className="primary-button" onClick={() => location.reload()}>{t("Попробовать снова")}</button></> : <><LoaderCircle className="spin"/><p>{t("Расставляем всё по полочкам…")}</p></>}</div> : <>
        {catalogPage && <>
          {kind !== 'favorites' && (theme === 'claude' ? <ClaudeHero onExplore={() => document.querySelector('.catalog-heading')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })} onVerify={() => go('/product/claude-kyc')}/> : kind === 'catalog' && catalog.groups.some(g => g.id === 'claude' && g.visible) ? <ClaudeHero className="claude-featured" onExplore={() => { setQuery(''); go('/group/claude'); }} onVerify={() => go('/product/claude-kyc')}/> : <section className={`hero ${kind === 'group' ? 'group-hero' : ''}`}>
            <div className="hero-copy"><span className="eyebrow"><span className="live-dot"/>{t(group ? group.title : 'Меньше хлопот. Больше возможностей.')}</span><h1>{t("Всё нужное.")}<br/>{t("В одном месте.")}</h1><p>{t("Пополнения, карты, сервисы и поездки — выбирай под свою задачу.")}</p><span className="hero-note"><ShieldCheck size={14}/>{t(" Выбирай. Подключай. Пользуйся.")}</span></div>
          </section>)}
          {kind === 'favorites' ? <PageTitle title={t("Избранное")} subtitle={t("То, что хочется оставить под рукой")}/> : kind === 'catalog' && theme !== 'claude' && catalog.groups.some(g => g.id === 'claude' && g.visible) && <button className="spotlight market-spotlight" onClick={() => document.querySelector('.catalog-heading')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}><span className="market-spotlight-icon"><img src={`${import.meta.env.BASE_URL}ficus-mascot.png`} alt="" width={54} height={54}/></span><span><b>{t("Всё нужное. В одном месте.")}</b><small>{t("Пополнения, карты, сервисы и поездки")}</small></span><ArrowDown size={18}/></button>}

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

        {kind === 'product' && (currentProduct ? <ProductPage key={currentProduct.id} product={currentProduct} group={group} shop={shop} favorite={favorites.includes(currentProduct.id)} onFavorite={() => toggleFavorite(currentProduct.id)} onAdd={qty => addToCart(currentProduct, qty)} onRequest={async details => { writeLocal(`request-handoff:${currentProduct.id}`, details); go(`/request-checkout/${currentProduct.id}`); }} onBack={() => go(productReturn || (group ? `/group/${group.id}` : '/catalog'))} navigate={go}/> : <Empty icon={<Package/>} title={t("Предложение недоступно")} text={t("Возможно, приём заявок закрыт или предложение скрыто. Посмотрите другие варианты.")} action={t("В каталог")} onAction={() => go('/catalog')}/>)}
        {kind === 'request-checkout' && currentProduct && <RequestCheckoutPage product={currentProduct} shop={shop} navigate={go}/>}
        {kind === 'checkout' && <CheckoutPage lines={lines} shop={shop} navigate={go}/>}
        {kind === 'order' && (currentRecord ? <OrderPage record={currentRecord} catalog={catalog} navigate={go} onConfirm={async () => { const updated = await store.acceptQuote(currentRecord.id); setRequests(prev => prev.map(r => r.id === updated.id ? updated : r)); }}/> : <Empty icon={<Package/>} title={t("Заказ не найден")} text={t("В предпросмотре доступны только заказы, сохранённые в этом браузере.")} action={t("Мои заказы")} onAction={() => go('/orders')}/>)}
        {kind === 'order-preview' && <OrderPreview catalog={catalog} state={id ?? ''} navigate={go}/>}
        {kind === 'support' && <SupportPage key={route} shop={shop} record={currentRecord} product={catalog.products.find(p => p.id === supportProductId)} navigate={go} notify={notify}/>}


        {kind === 'cart' && <><PageTitle title={t("Корзина")} subtitle={t(lines.length ? 'Всё готово к следующему шагу' : 'Соберём что-нибудь полезное?')}/>{lines.length ? <>
          <div className="cart-list">{lines.map(({ product: p, quantity }) => <article className="cart-row" key={p.id}><button className={`cart-art art-${p.brand}`} onClick={() => go(`/product/${p.id}`)} aria-label={t(p.title)}><BrandArt brand={p.brand} productId={p.id}/></button><div className="cart-row-info"><button className="text-button" onClick={() => go(`/product/${p.id}`)}>{t(p.title)}</button><small>{t(p.subtitle)}</small><strong>{t(money(p.price * quantity, p.currency))}</strong><div className="quantity"><button aria-label={t(`Уменьшить ${p.title}`)} onClick={() => changeQuantity(p.id, -1)}><Minus size={14}/></button><span>{quantity}</span><button aria-label={t(`Увеличить ${p.title}`)} disabled={quantity >= p.stock} onClick={() => changeQuantity(p.id, 1)}><Plus size={14}/></button></div>{quantity > p.stock && <small className="error">{t("Доступно только ")}{p.stock}{t(" шт.")}</small>}</div><button className="icon-button remove" aria-label={t(`Удалить ${p.title}`)} onClick={() => setCart(prev => prev.filter(i => i.productId !== p.id))}><Trash2 size={17}/></button></article>)}</div>
          <div className="summary-card"><div><span>{t("Товары (")}{cartCount})</span><span>{t(totals.join(' + '))}</span></div><div className="summary-total"><strong>{t("Итого")}</strong><strong>{totals.map(total => <span className="currency-total" key={total}>{total}</span>)}</strong></div>{totals.length > 1 && <p className="fine-print">{t("Каждая валюта рассчитана отдельно, без конвертации.")}</p>}<button className="primary-button" disabled={lines.some(l => l.quantity > l.product.stock)} onClick={() => go('/checkout')}>{t("Перейти к оформлению")}<ArrowRight size={18}/></button><p className="fine-print">{t("Подготовим сообщение со всеми позициями. Оплату и выполнение согласуем в личном чате продавца.")}</p></div>
        </> : <Empty icon={<ShoppingBag/>} title={t("Тут пока просторно")} text={t("Добавьте нужные сервисы из каталога. Они будут ждать вас здесь.")} action={t("За покупками")} onAction={() => go('/catalog')}/>}</>}

        {kind === 'orders' && <OrdersPage orders={orders} requests={requests} navigate={go}/>}

        {kind === 'profile' && <><PageTitle title={t("Профиль")}/><section className="profile-card"><div className="profile-avatar">{(telegram?.initDataUnsafe?.user?.first_name ?? t('Гость'))[0]}</div><h2>{telegram?.initDataUnsafe?.user?.first_name ?? t('Привет, гость!')}</h2><p>{t(telegram?.initData ? 'Рады видеть тебя в фиКУСе' : 'Осматривайся — здесь всё для тебя')}</p><span className="demo-badge">{t(telegram?.initData ? 'Telegram Mini App' : 'Режим предпросмотра')}</span></section><Wallet shop={shop}/><div className="menu-list"><MenuRow icon={<Package/>} title={t("Мои заказы")} extra={t(`${orders.length + requests.length}`)} onClick={() => go('/orders')}/><MenuRow icon={<Heart/>} title={t("Избранное")} extra={t(`${favorites.length}`)} onClick={() => go('/favorites')}/><MenuRow icon={<CircleHelp/>} title={t("Помощь и поддержка")} onClick={() => go('/support/new')}/></div>{kind === 'profile' && <section className="appearance-settings"><h3>{t("Оформление")}</h3><div className="appearance-options" role="group" aria-label={t("Тема оформления")}>{([['light', 'Светлая'], ['dark', 'Тёмная'], ['auto', 'Как в системе']] as const).map(([value, label]) => <button key={value} aria-pressed={appearance === value} className={appearance === value ? 'selected' : ''} onClick={() => { setAppearance(value); haptic(); }}>{t(label)}</button>)}</div></section>}<LanguageSettings/><p className="section-caption">{t("Для владельца · локальное демо")}</p><div className="menu-list"><MenuRow icon={<Settings2/>} title={t("Редактор каталога")} onClick={() => go('/admin')}/><MenuRow icon={<CircleHelp/>} title={t("Контакты и условия магазина")} onClick={() => setShopEditor(true)}/><MenuRow icon={<Package/>} title={t("Просмотр состояний заказа")} onClick={() => go('/order-preview/awaiting_quote')}/></div><div className="profile-mascot"><Mascot theme={theme}/><p>{t("Сервисы для ваших задач. Поддержка до результата.")}</p><small>{t("фиКУС · v0.1")}</small></div></>}

        {kind === 'help' && <><PageTitle title={t("На связи")} subtitle={t("Пара ответов, чтобы всё стало проще")}/><div className="help-hero"><Mascot theme={theme}/><h2>{t("Поможем разобраться")}</h2><p>{t("Выбирай сервис, читай условия и оформляй покупку или заявку.")}</p></div><div className="faq-list">{[
          ['Как оформить заказ?', 'Товары с фиксированной ценой добавляйте в корзину. Для услуг «По запросу» откройте карточку и заполните параметры: стоимость и срок согласуются отдельно. Сейчас заказы и заявки сохраняются только локально, без отправки оператору.'],
          ['Где посмотреть мои покупки?', 'Во вкладке «Заказы». В демонстрации история хранится только в этом браузере.'],
          ['Почему меняется оформление?', 'У некоторых разделов свой характер. В Claude живёт его персонаж, а в остальных разделах — фиКУС. Если вы пришли по ссылке Claude, его стиль останется с вами во всём маркете.'],
          ['Что входит в услугу?', 'Условия и состав указываются в описании каждого товара. Услуги настройки оказываются для ваших собственных профилей и сервисов.'],
          ['Как связаться с магазином?', 'Рабочий контакт поддержки появится после подключения панели владельца. Сейчас это локальная демонстрация интерфейса.'],
        ].map(([q, a]) => <details key={q}><summary>{t(q)}<Plus size={17}/></summary><p>{t(a)}</p></details>)}</div></>}

        {kind === 'admin' && <Admin catalog={catalog} notify={notify} onSave={async c => { await store.saveCatalog(c); setCatalog(c); }}/>} 
        {!['catalog', 'group', 'favorites', 'product', 'cart', 'orders', 'profile', 'help', 'admin', 'checkout', 'order', 'order-preview', 'support', 'request-checkout'].includes(kind) && <Empty icon={<Search/>} title={t("Эта страница потерялась")} text={t("В каталоге всё на своих местах.")} action={t("В каталог")} onAction={() => go('/catalog')}/>}
      </>}
    </main>
    <nav className="bottom-nav" aria-label={t("Главная навигация")}><div className="nav-main">{[
      { path: '/catalog', label: 'Маркет', icon: Grid2X2, active: ['catalog', 'group', 'product'].includes(kind) },
      { path: '/favorites', label: 'Избранное', icon: Heart, active: kind === 'favorites' },
      { path: '/orders', label: 'Заказы', icon: Package, active: ['orders', 'order', 'order-preview'].includes(kind) },
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
  return <article className={`product-card ${p.badge === 'Хит' ? 'product-hit' : ''} ${paused ? 'motion-paused' : ''} ${!isAvailable(p) ? 'sold-out' : ''}`}><div className={`product-art art-${p.brand}`}><button className="art-link" aria-label={t(`Подробнее: ${p.title}`)} onClick={() => go(`/product/${p.id}`)}><span className="art-watermark">{t(p.brand === 'claude' ? 'claude' : p.brand === 'mail' ? 'письма' : p.brand === 'cdek' ? 'identity' : 'workspace')}</span><span className="art-orbit"/>{p.brand === 'claude' ? <ClawdProductArt product={p}/> : <ProductCover product={p}/>}<span className="art-caption">{t(p.brand === 'claude' ? 'a little more possible' : 'сервисы для жизни')}</span></button>{t(p.badge && <span className={`product-badge ${p.badge === 'Хит' ? 'hit' : ''}`}>{p.badge === 'Хит' && <Sparkles size={10}/>} {t(p.badge)}</span>)}<button className={`favorite-button ${favorite ? 'saved' : ''}`} aria-label={t(`${favorite ? 'Убрать из избранного' : 'В избранное'}: ${p.title}`)} aria-pressed={favorite} onClick={onFavorite}><Heart size={17} fill={favorite ? 'currentColor' : 'none'}/></button></div><div className="product-info"><button className="product-title" onClick={() => go(`/product/${p.id}`)}>{t(p.title)}</button><p>{t(p.subtitle)}</p><ProductStats product={p}/><span className={`stock ${isAvailable(p) ? '' : 'empty-stock'}`}><i/>{t(isRequest(p) ? (isAvailable(p) ? 'Приём заявок' : 'Приём закрыт') : p.stock ? `${p.stock} в наличии` : 'Скоро появится')}</span><div className="product-price"><strong>{t(priceLabel(p))}</strong><button disabled={!isAvailable(p)} aria-label={t(`${isRequest(p) ? 'Оформить заявку' : 'Добавить в корзину'}: ${p.title}`)} className={inCart ? 'in-cart' : ''} onClick={onAdd}>{isRequest(p) ? <ArrowRight size={19}/> : inCart ? <Check size={19}/> : <Plus size={19}/>}</button></div></div></article>;
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

function Admin({ catalog, notify, onSave }: { catalog: Catalog; notify(message: string): void; onSave(c: Catalog): Promise<void> }) {
  const [draft, setDraft] = useState(() => structuredClone(catalog));
  const [editing, setEditing] = useState<Product | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(catalog);
  useEffect(() => { if (!dirty) return; const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
  function move<T>(items: T[], index: number, direction: number) { const next = [...items]; const target = index + direction; if (target < 0 || target >= next.length) return items; [next[index], next[target]] = [next[target], next[index]]; return next; }
  async function save() { setPending(true); setError(''); try { await onSave(parseCatalog(draft)); notify('Каталог сохранён в этом браузере'); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить каталог'); } finally { setPending(false); } }
  function exportJson() { const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'fikus-catalog.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <><PageTitle title={t("Редактор каталога")} subtitle={t("Товары, группы и их порядок")}/><div className="admin-notice"><Settings2 size={19}/><p>{t("Локальный редактор для демонстрации. Изменения сохраняются в этом браузере. Для общей панели подключите API.")}</p></div><div className="admin-tools"><button className="secondary-button" onClick={exportJson}><Download size={16}/>{t("Экспорт JSON")}</button><button className="secondary-button" onClick={() => inputRef.current?.click()}><Upload size={16}/>{t("Импорт")}</button><input hidden type="file" accept="application/json,.json" ref={inputRef} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { const next = parseCatalog(JSON.parse(await file.text())); setDraft(next); setError(''); notify('Импортирован черновик. Нажмите «Сохранить».'); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось прочитать файл'); } finally { if (inputRef.current) inputRef.current.value = ''; } }}/></div>
    <div className="catalog-heading"><h2>{t("Группы")}</h2><button className="text-button" onClick={() => setEditingGroup({ id: crypto.randomUUID(), title: '', icon: 'ai', theme: 'fikus', visible: true })}><Plus size={16}/>{t("Добавить")}</button></div><div className="admin-groups">{draft.groups.map((g, index) => <div className={`admin-group ${!g.visible ? 'is-hidden' : ''}`} key={g.id}><BrandArt brand={g.icon} small/><button className="admin-name" onClick={() => setEditingGroup({ ...g })}><b>{t(g.title)}</b><small>{t(g.visible ? 'В каталоге' : 'Скрыта')} · {t(g.theme === 'claude' ? 'Тема Claude' : 'Тема фиКУС')}</small></button><div className="reorder"><button aria-label={t(`Поднять группу ${g.title}`)} disabled={index === 0} onClick={() => setDraft({ ...draft, groups: move(draft.groups, index, -1) })}><ArrowUp size={15}/></button><button aria-label={t(`Опустить группу ${g.title}`)} disabled={index === draft.groups.length - 1} onClick={() => setDraft({ ...draft, groups: move(draft.groups, index, 1) })}><ArrowDown size={15}/></button></div></div>)}</div>
    <div className="catalog-heading"><h2>{t("Товары ")}<small>({draft.products.length})</small></h2><button className="text-button" disabled={!draft.groups.length} onClick={() => setEditing({ id: crypto.randomUUID(), title: '', subtitle: '', description: '', groupId: draft.groups[0].id, brand: draft.groups[0].icon, price: 0, stock: 0, badge: '', visible: true })}><Plus size={16}/>{t("Добавить")}</button></div>
    {draft.groups.map(g => <section key={g.id} className="admin-product-group"><h3>{t(g.title)}</h3>{draft.products.filter(p => p.groupId === g.id).map((p, index, items) => <div className={`admin-product ${p.visible ? '' : 'is-hidden'}`} key={p.id}><span className={`admin-art art-${p.brand}`}><BrandArt brand={p.brand} productId={p.id} small/></span><button className="admin-name" onClick={() => setEditing({ ...p })}><b>{t(p.title)}</b><small>{t(priceLabel(p))} · {t(p.visible ? (isRequest(p) ? (isAvailable(p) ? 'Заявки открыты' : 'Заявки закрыты') : `${p.stock} шт.`) : 'Скрыт')}</small></button><div className="reorder"><button aria-label={t(`Поднять ${p.title}`)} disabled={index === 0} onClick={() => { const all = [...draft.products]; const a = all.findIndex(x => x.id === p.id); const b = all.findIndex(x => x.id === items[index - 1].id); [all[a], all[b]] = [all[b], all[a]]; setDraft({ ...draft, products: all }); }}><ArrowUp size={15}/></button><button aria-label={t(`Опустить ${p.title}`)} disabled={index === items.length - 1} onClick={() => { const all = [...draft.products]; const a = all.findIndex(x => x.id === p.id); const b = all.findIndex(x => x.id === items[index + 1].id); [all[a], all[b]] = [all[b], all[a]]; setDraft({ ...draft, products: all }); }}><ArrowDown size={15}/></button></div></div>)}</section>)}
    <div className="admin-save">{t(error && <p className="error" role="alert">{t(error)}</p>)}<button className="primary-button" disabled={!dirty || pending} onClick={save}>{t(pending ? 'Сохраняем…' : dirty ? 'Сохранить изменения' : 'Всё сохранено')}<Check size={18}/></button><p className="fine-print">{t("Порядок задаётся стрелками. Скрытие группы убирает её товары из маркета, сохраняя их в редакторе.")}</p></div>
    {editing && <Sheet title={t(draft.products.some(p => p.id === editing.id) ? 'Редактировать товар' : 'Новый товар')} onClose={() => setEditing(null)}><form className="edit-form" onSubmit={e => { e.preventDefault(); if (!editing.title.trim()) return; setDraft(prev => ({ ...prev, products: prev.products.some(p => p.id === editing.id) ? prev.products.map(p => p.id === editing.id ? { ...editing, title: editing.title.trim() } : p) : [...prev.products, { ...editing, title: editing.title.trim() }] })); setEditing(null); }}>
      <label>{t("Название")}<input required maxLength={100} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}/></label><label>{t("Короткое описание")}<input maxLength={160} value={editing.subtitle} onChange={e => setEditing({ ...editing, subtitle: e.target.value })}/></label><label>{t("Описание")}<textarea rows={4} maxLength={10000} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })}/></label><label>{t("Формат продажи")}<select value={editing.saleMode ?? 'fixed'} onChange={e => setEditing({ ...editing, saleMode: e.target.value as Product['saleMode'] })}><option value="fixed">{t("Фиксированная цена · корзина")}</option><option value="request">{t("По запросу · заявка")}</option></select></label>{isRequest(editing) ? <><label>{t("Параметры заявки")}<select value={editing.requestKind ?? 'general'} onChange={e => setEditing({ ...editing, requestKind: e.target.value as Product['requestKind'] })}>{requestKinds.map(k => <option key={k} value={k}>{t(requestKindLabels[k])}</option>)}</select></label><label className="checkbox-field"><input type="checkbox" checked={editing.acceptingRequests !== false} onChange={e => setEditing({ ...editing, acceptingRequests: e.target.checked })}/>{t("Принимать заявки")}</label></> : <div className="form-pair"><label>{t(editing.currency === 'USD' ? 'Цена, $' : 'Цена, ₽')}<input type="number" min="0" max="10000000" step="0.01" required value={editing.price} onChange={e => setEditing({ ...editing, price: Number(e.target.value) })}/></label><label>{t("В наличии")}<input type="number" min="0" max="1000000" step="1" required value={editing.stock} onChange={e => setEditing({ ...editing, stock: Number(e.target.value) })}/></label><label>{t("Валюта")}<select value={editing.currency ?? 'RUB'} onChange={e => setEditing({ ...editing, currency: e.target.value as Product['currency'] })}><option value="RUB">RUB · ₽</option><option value="USD">USD · $</option></select></label></div>}<label>{t("Группа")}<select value={editing.groupId} onChange={e => setEditing({ ...editing, groupId: e.target.value })}>{draft.groups.map(g => <option key={g.id} value={g.id}>{t(g.title)}</option>)}</select></label><label>{t("Иллюстрация")}<select value={editing.brand} onChange={e => setEditing({ ...editing, brand: e.target.value as Product['brand'] })}>{brands.map(v => <option key={v}>{t(v)}</option>)}</select></label><label>{t("Синонимы для поиска")}<input maxLength={300} value={editing.aliases ?? ''} onChange={e => setEditing({ ...editing, aliases: e.target.value })}/></label><label>{t("Число покупателей")}<input type="number" min="0" max="9007199254740991" step="1" placeholder={t("Нет данных")} value={editing.buyerCount ?? ''} onChange={e => setEditing({ ...editing, buyerCount: e.target.value === '' ? undefined : Number(e.target.value) })}/><span className="form-help">{t("Укажите число уникальных покупателей по данным магазина. Пустое поле — нет данных. Демо-заказы не учитываются.")}</span></label><OfferEditor product={editing} onChange={setEditing}/><label>{t("Плашка")}<input maxLength={30} placeholder={t("Например, Новое")} value={editing.badge} onChange={e => setEditing({ ...editing, badge: e.target.value })}/></label><label className="checkbox-field"><input type="checkbox" checked={editing.visible} onChange={e => setEditing({ ...editing, visible: e.target.checked })}/>{t("Показывать в каталоге")}</label><button className="primary-button" type="submit">{t("Готово")}<Check size={18}/></button><p className="fine-print">{t("После закрытия сохраните изменения в каталоге.")}</p>
    </form></Sheet>}
    {editingGroup && <Sheet title={t("Настройки группы")} onClose={() => setEditingGroup(null)}><form className="edit-form" onSubmit={e => { e.preventDefault(); if (!editingGroup.title.trim()) return; setDraft(prev => ({ ...prev, groups: prev.groups.some(g => g.id === editingGroup.id) ? prev.groups.map(g => g.id === editingGroup.id ? { ...editingGroup, title: editingGroup.title.trim() } : g) : [...prev.groups, { ...editingGroup, title: editingGroup.title.trim() }] })); setEditingGroup(null); }}><label>{t("Название")}<input required maxLength={60} value={editingGroup.title} onChange={e => setEditingGroup({ ...editingGroup, title: e.target.value })}/></label><label>{t("Тема раздела")}<select value={editingGroup.theme} onChange={e => setEditingGroup({ ...editingGroup, theme: e.target.value as Group['theme'] })}><option value="fikus">{t("фиКУС · зелёная")}</option><option value="claude">{t("Claude · терракотовая")}</option></select></label><label>{t("Значок")}<select value={editingGroup.icon} onChange={e => setEditingGroup({ ...editingGroup, icon: e.target.value as Group['icon'] })}>{brands.map(v => <option key={v}>{t(v)}</option>)}</select></label><label className="checkbox-field"><input type="checkbox" checked={editingGroup.visible} onChange={e => setEditingGroup({ ...editingGroup, visible: e.target.checked })}/>{t("Показывать группу и её товары")}</label><button type="submit" className="primary-button">{t("Готово")}<Check size={18}/></button></form></Sheet>}
  </>;
}
