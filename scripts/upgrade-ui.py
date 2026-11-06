from pathlib import Path
p=Path('src/App.tsx')
before=p.read_bytes()
s=before.decode('utf-8').replace('\r\n','\n')
s=s.replace('cartLines, currencyTotals, entryTheme,','cartLines, currencyTotals, entryProduct, entryTheme,')
s=s.replace('type ServiceRequest, type Sort','type ServiceRequest, type ShopSettings, type Sort')
s=s.replace("import { readLocal, store, writeLocal } from './store';", "import { readLocal, store, writeLocal } from './store';\nimport { defaultShop } from './commerce';\nimport { ProductPage, CheckoutPage, OrdersPage, OrderPage, OrderPreview, SupportPage, ShopEditor, OfferEditor } from './CommerceUI';")
s=s.replace("const routeNow = () => location.hash.slice(1) || (entryTheme", "const routeNow = () => location.hash.slice(1) || (entryProduct(location.search, telegram?.initDataUnsafe?.start_param) ? `/product/${entryProduct(location.search, telegram?.initDataUnsafe?.start_param)}` : null) || (entryTheme")
start=s.index('const go = (route: string) =>')
end=s.index('\nfunction safeSaved',start)
s=s[:start]+'''const scrollMemory = new Map<string, number>();
let productReturn = '';
const go = (route: string) => {
  const current = routeNow(); const scroller = document.querySelector('.app-scroll');
  scrollMemory.set(current, scroller?.scrollTop ?? 0);
  if (route.startsWith('/product/') && !current.startsWith('/product/')) productReturn = current;
  if (current === route) scroller?.scrollTo({ top: 0, behavior: 'smooth' }); else location.hash = route;
};'''+s[end:]
s=s.replace("const [busy, setBusy] = useState(false);", "const [busy, setBusy] = useState(false);\n  const [checkoutError, setCheckoutError] = useState('');\n  const [shop, setShop] = useState<ShopSettings>(defaultShop);\n  const [shopEditor, setShopEditor] = useState(false);\n  const [loadError, setLoadError] = useState(false);\n  const routeRef = useRef(routeNow());")
s=s.replace("const [kind, id] = route.replace(/^\\//, '').split('/');", "const [kind, id] = route.split('?')[0].replace(/^\\//, '').split('/');\n  const currentRecord = [...orders, ...requests].find(o => o.id === id);\n  const supportProductId = new URLSearchParams(route.split('?')[1] ?? '').get('product');")
s=s.replace('store.loadOrders(), store.loadRequests()]).then(([c, o, r])', 'store.loadOrders(), store.loadRequests(), store.loadShop()]).then(([c, o, r, info])')
s=s.replace('setCatalog(c); setOrders(o); setRequests(r);','setCatalog(c); setOrders(o); setRequests(r); setShop(info); setLoadError(false);')
s=s.replace("if (live) setToast('Не удалось открыть каталог. Обновите страницу.');", "if (live) setLoadError(true);")
start=s.index('    const onHash = () =>')
end=s.index("    window.addEventListener('hashchange'",start)
s=s[:start]+'''    const onHash = () => {
      const scroller = document.querySelector('.app-scroll');
      scrollMemory.set(routeRef.current, scroller?.scrollTop ?? 0);
      const next = routeNow(); routeRef.current = next; setRoute(next); setFilters(false); setCategoriesOpen(false);
      requestAnimationFrame(() => scroller?.scrollTo(0, scrollMemory.get(next) ?? 0));
    };
'''+s[end:]
s=s.replace("else if (kind === 'product') go(`/group/${currentProduct?.groupId ?? 'all'}`);", "else if (kind === 'product') go(productReturn || (currentProduct ? `/group/${currentProduct.groupId}` : '/catalog')); else if (kind === 'order') go('/orders'); else if (kind === 'checkout') go('/cart');")
start=s.index('  async function checkout()')
end=s.index('\n\n  return <div',start)
s=s[:start]+'''  async function checkout(note = ''): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setCheckoutError('');
    try {
      const order = await store.createOrder(lines.map(l => ({ productId: l.product.id, quantity: l.quantity })), note);
      setOrders(prev => [order, ...prev]); setCart([]); go(`/order/${order.id}`); return true;
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Не удалось создать заказ. Попробуйте ещё раз.'); return false;
    } finally { setBusy(false); }
  }'''+s[end:]
s=s.replace('return <div className="app-frame">','return <div className="app-frame" data-page={kind}>',1)
s=s.replace('!catalog ? <div className="loading"><LoaderCircle className="spin"/><p>Расставляем всё по полочкам…</p></div>', '!catalog ? <div className="loading">{loadError ? <><h2>Не удалось открыть магазин</h2><p>Проверьте соединение и попробуйте ещё раз.</p><button className="primary-button" onClick={() => location.reload()}>Попробовать снова</button></> : <><LoaderCircle className="spin"/><p>Расставляем всё по полочкам…</p></>}</div>')
start=s.index("        {kind === 'product' &&")
end=s.index("\n\n        {kind === 'cart'",start)
s=s[:start]+'''        {kind === 'product' && (currentProduct ? <ProductPage key={currentProduct.id} product={currentProduct} group={group} shop={shop} favorite={favorites.includes(currentProduct.id)} onFavorite={() => toggleFavorite(currentProduct.id)} onAdd={qty => addToCart(currentProduct, qty)} onRequest={async details => { const request = await store.createRequest(currentProduct.id, details); setRequests(prev => [request, ...prev]); go(`/order/${request.id}`); }} onBack={() => go(productReturn || (group ? `/group/${group.id}` : '/catalog'))} navigate={go}/> : <Empty icon={<Package/>} title="Предложение недоступно" text="Возможно, приём заявок закрыт или предложение скрыто. Посмотрите другие варианты." action="В каталог" onAction={() => go('/catalog')}/>)}
        {kind === 'checkout' && <CheckoutPage lines={lines} busy={busy} error={checkoutError} onSubmit={checkout} navigate={go}/>}
        {kind === 'order' && (currentRecord ? <OrderPage record={currentRecord} catalog={catalog} navigate={go}/> : <Empty icon={<Package/>} title="Заказ не найден" text="В предпросмотре доступны только заказы, сохранённые в этом браузере." action="Мои заказы" onAction={() => go('/orders')}/>)}
        {kind === 'order-preview' && <OrderPreview catalog={catalog} state={id ?? ''} navigate={go}/>}
        {kind === 'support' && <SupportPage key={route} shop={shop} record={currentRecord} product={catalog.products.find(p => p.id === supportProductId)} navigate={go} notify={notify}/>}
'''+s[end:]
s=s.replace('onClick={checkout}', "onClick={() => { setCheckoutError(''); go('/checkout'); }}")
s=s.replace("'Создать демо-заказ'", "'Перейти к оформлению'")
start=s.index("        {kind === 'orders' &&")
end=s.index("\n\n        {kind === 'profile'",start)
s=s[:start]+"        {kind === 'orders' && <OrdersPage orders={orders} requests={requests} navigate={go}/>}"+s[end:]
s=s.replace('<p className="section-caption">Для владельца · локальное демо</p>', '<p className="section-caption">Для владельца · локальное демо</p>')
needle='<MenuRow icon={<Settings2/>} title="Редактор каталога" onClick={() => go(\'/admin\')}/>'
s=s.replace(needle, needle+'<MenuRow icon={<CircleHelp/>} title="Контакты и условия магазина" onClick={() => setShopEditor(true)}/><MenuRow icon={<Package/>} title="Просмотр состояний заказа" onClick={() => go(\'/order-preview/awaiting_quote\')}/>')
s=s.replace('<MenuRow icon={<CircleHelp/>} title="Помощь и вопросы" onClick={() => go(\'/help\')}/>', '<MenuRow icon={<CircleHelp/>} title="Помощь и поддержка" onClick={() => go(\'/support/new\')}/>')
s=s.replace('Хорошие сервисы. Хорошие привычки.', 'Сервисы для ваших задач. Поддержка до результата.')
s=s.replace("'help', 'admin'].includes(kind)","'help', 'admin', 'checkout', 'order', 'order-preview', 'support'].includes(kind)")
s=s.replace("active: kind === 'orders'", "active: ['orders', 'order', 'order-preview'].includes(kind)")
s=s.replace("['profile', 'help', 'admin'].includes(kind)", "['profile', 'help', 'admin', 'support'].includes(kind)")
needle='    {toast && <div className="toast"'
s=s.replace(needle, '    {shopEditor && <Sheet title="Информация магазина" onClose={() => setShopEditor(false)}><ShopEditor shop={shop} onSave={async value => { await store.saveShop(value); setShop(value); notify(\'Информация магазина сохранена\'); }}/></Sheet>}\n'+needle)
s=s.replace('<label>Плашка<input', '<OfferEditor product={editing} onChange={setEditing}/><label>Плашка<input')
# Remove superseded product/request components; retain shared PageTitle and admin.
start=s.index('function ProductDetail(')
end=s.index('function Sheet(',start)
s=s[:start]+'''const requestKindLabels: Record<NonNullable<Product['requestKind']>, string> = { topup: 'Пополнение', gift: 'Подарочная карта', verification: 'Верификация', finance: 'Финансовый сервис', profile: 'Профиль', rental: 'Аренда', travel: 'Бронирование', general: 'Общая заявка' };

'''+s[end:]
assert p.read_bytes()==before, 'App changed concurrently; retry from new source'
p.write_text(s,encoding='utf-8')
