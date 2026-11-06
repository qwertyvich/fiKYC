import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Copy, FileText, Heart, Info, LoaderCircle, MessageCircle, Minus, Package, Plus, ShieldCheck, ShoppingBag } from 'lucide-react';
import { currencyTotals, isAvailable, isRequest, money, priceLabel, requestFields, validateRequest, type Catalog, type Group, type OfferDetails, type Order, type OrderStatus, type Product, type ServiceRequest, type ShopSettings } from './domain';
import { dateTime, defaultShop, offerFor, parseShop, safeWebUrl, statusOf, statuses, supportText } from './commerce';
import { readLocal, writeLocal } from './store';
import { BrandArt } from './visuals';
import { ClawdProductArt } from './ClaudeSection';

type Navigate = (path: string) => void;
type RecordOrder = Order | ServiceRequest;
function Title({ title, subtitle, onBack, back = 'Назад' }: { title: string; subtitle?: string; onBack(): void; back?: string }) { return <div className="page-title"><button className="back-link" onClick={onBack}><ArrowLeft size={17}/>{back}</button><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>; }
export function Notice({ children }: { children: ReactNode }) { return <div className="context-notice"><Info size={17}/><p>{children}</p></div>; }
function useDraft(key: string) {
  const [value, setValue] = useState<Record<string, string>>(() => { const saved = readLocal<unknown>(key, {}); return saved && typeof saved === 'object' && !Array.isArray(saved) && Object.values(saved).every(v => typeof v === 'string') ? saved as Record<string, string> : {}; });
  useEffect(() => { try { if (Object.values(value).some(Boolean)) writeLocal(key, value); else localStorage.removeItem(`fikus:${key}`); } catch { /* Draft remains available for this screen. */ } }, [key, value]);
  const clear = () => { setValue({}); try { localStorage.removeItem(`fikus:${key}`); } catch { /* No persistent draft. */ } };
  return [value, setValue, clear] as const;
}

export function ProductPage({ product: p, group, shop, favorite, onFavorite, onAdd, onRequest, onBack, navigate }: { product: Product; group?: Group; shop: ShopSettings; favorite: boolean; onFavorite(): void; onAdd(qty: number): void; onRequest(details: Record<string, string>): Promise<void>; onBack(): void; navigate: Navigate }) {
  const [quantity, setQuantity] = useState(1);
  const [formVisible, setFormVisible] = useState(false);
  const formSection = useRef<HTMLDivElement>(null);
  const offer = offerFor(p);
  const request = isRequest(p);
  useEffect(() => {
    if (!formSection.current) return;
    const observer = new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting), { root: document.querySelector('.app-scroll'), threshold: 0 });
    observer.observe(formSection.current); return () => observer.disconnect();
  }, [p.id]);
  return <section className="product-detail offer-page">
    <div className="detail-top"><button className="back-link" onClick={onBack}><ArrowLeft size={17}/>Назад к выбору</button><button className="icon-button" aria-label="В избранное" aria-pressed={favorite} onClick={onFavorite}><Heart size={21} fill={favorite ? 'currentColor' : 'none'}/></button></div>
    <div className={`detail-art art-${p.brand}`}><span className="art-watermark">{p.brand}</span>{p.brand === 'claude' ? <ClawdProductArt product={p}/> : <BrandArt brand={p.brand} productId={p.id}/>} {p.badge && <span className="product-badge">{p.badge}</span>}</div>
    <div className="detail-title"><h1>{p.title}</h1><span className="stock"><i/>{request ? (isAvailable(p) ? 'Можно оставить заявку' : 'Приём закрыт') : p.stock ? 'Доступно к оформлению' : 'Нет в наличии'}</span></div>
    <p className="detail-subtitle">{p.subtitle}</p>
    <p className="offer-result">{offer.result}</p>
    <div className="guarantee-card"><ShieldCheck size={25}/><div><b>100% гарантия</b><p>Доводим до согласованного результата. Состав и условия фиксируем перед оплатой.</p></div></div>
    <div className="offer-facts"><div><small>{request ? 'Стоимость' : 'Цена за 1 шт.'}</small><strong>{priceLabel(p)}</strong></div><div><small>{request ? 'Срок выполнения' : 'Срок / период'}</small><b>{offer.term || offer.fulfillment || 'Уточнить до оплаты'}</b></div></div>
    <section className="offer-block"><h2>Что входит</h2><p>{offer.includes}</p>{p.description !== offer.result && !p.description.includes('После подключения магазина') && <p>{p.description}</p>}</section>
    <section className="offer-block"><h2>Перед оформлением</h2><p>{offer.requirements}</p><dl className="offer-conditions"><div><dt>Регион</dt><dd>{offer.region || 'Нужно подтвердить совместимость'}</dd></div><div><dt>Выполнение</dt><dd>{offer.fulfillment || 'Срок и способ подтверждаются до оплаты'}</dd></div></dl></section>
    <section className="offer-block"><h2>Как всё пройдёт</h2><ol className="how-steps">{(request ? ['Укажите параметры и отправьте заявку.', 'Получите стоимость, срок и состав услуги.', 'Подтвердите предложение и следите за выполнением в заказе.'] : ['Проверьте условия и добавьте предложение в корзину.', 'Подтвердите состав заказа и итоговую стоимость.', 'После оплаты следите за статусом и получите инструкцию в заказе.']).map((text, i) => <li key={text}><b>{i + 1}</b><span>{text}</span></li>)}</ol></section>
    <section className="offer-block"><h2>Если что-то пойдёт не так</h2><p>{offer.refund || shop.refundPolicy || 'Условия отмены и возврата пока не опубликованы. Уточните их у магазина до оплаты.'}</p><button className="inline-link" onClick={() => navigate(`/support/new?product=${encodeURIComponent(p.id)}`)}><MessageCircle size={17}/>Задать вопрос об этом предложении<ChevronRight size={16}/></button></section>
    {p.brand === 'claude' && <section className="offer-block"><h2>Важно о проверках Anthropic</h2><p>Проверка личности может потребоваться со стороны платформы. Она проходит в официальном интерфейсе Claude. Магазин не принимает документы в этой форме и не гарантирует решения Anthropic.</p><p>Возраст аккаунта, текущая подписка и регион могут влиять на доступность выбранного подключения — подтвердите совместимость до оплаты.</p><a className="inline-link" href="https://claude.com/pricing" target="_blank" rel="noreferrer">Актуальные возможности тарифов Claude<ArrowRight size={16}/></a></section>}
    {request && <div ref={formSection} className="request-anchor"><RequestForm product={p} shop={shop} onSubmit={onRequest}/></div>}
    <p className="fine-print product-demo-note">Локальный предпросмотр. Оплата, отправка магазину и выполнение ещё не подключены.</p>
    {(!request || !formVisible) && <div className="purchase-dock">{request ? <><div><small>Без оплаты на этом шаге</small><b>Уточним по вашей задаче</b></div><button className="primary-button" disabled={!isAvailable(p)} onClick={() => formSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Оставить заявку<ArrowRight size={17}/></button></> : <><div className="dock-price"><strong>{money(p.price * quantity, p.currency)}</strong><div className="quantity"><button aria-label="Уменьшить количество" disabled={quantity <= 1} onClick={() => setQuantity(q => q - 1)}><Minus size={16}/></button><span>{quantity}</span><button aria-label="Увеличить количество" disabled={quantity >= p.stock} onClick={() => setQuantity(q => q + 1)}><Plus size={16}/></button></div></div><button className="primary-button" disabled={!p.stock} onClick={() => onAdd(quantity)}><ShoppingBag size={18}/>{p.stock ? 'В корзину' : 'Нет в наличии'}</button></>}</div>}
  </section>;
}

function fieldErrors(p: Product, details: Record<string, string>) {
  const errors: Record<string, string> = {};
  for (const f of requestFields(p)) {
    const value = details[f.key]?.trim() ?? '';
    if (f.required && !value) errors[f.key] = `Укажите: ${f.label.toLowerCase()}`;
    else if (value.length > 1000) errors[f.key] = 'Сократите текст до 1000 символов';
    else if (f.type === 'number' && (!Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 100)) errors[f.key] = 'Укажите целое число от 1 до 100';
    else if (f.type === 'date' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) errors[f.key] = 'Укажите существующую дату';
  }
  if (details.start && details.end && details.end < details.start) errors.end = 'Дата окончания должна быть не раньше начала';
  return errors;
}
function RequestForm({ product: p, shop, onSubmit }: { product: Product; shop: ShopSettings; onSubmit(details: Record<string, string>): Promise<void> }) {
  const [draft, setDraft, clearDraft] = useDraft(`request-draft:${p.id}`);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return <form ref={form} className="edit-form request-form" noValidate onSubmit={async e => {
    e.preventDefault(); if (pending) return;
    const found = fieldErrors(p, draft); setErrors(found); setFailure('');
    if (Object.keys(found).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    try { validateRequest(p, draft); setPending(true); await onSubmit(draft); clearDraft(); } catch (err) { setFailure(err instanceof Error ? err.message : 'Не удалось отправить. Ваши данные сохранены — попробуйте ещё раз.'); } finally { setPending(false); }
  }}><div className="request-form-heading"><span className="eyebrow">ШАГ 1 · БЕЗ ОПЛАТЫ</span><h2>Расскажите о задаче</h2><p>По этим параметрам магазин сможет подтвердить стоимость и срок.</p></div>
    {requestFields(p).map(f => { const fieldId = `request-${p.id}-${f.key}`; const props = { id: fieldId, value: draft[f.key] ?? '', maxLength: 1000, required: f.required, placeholder: f.placeholder, 'aria-invalid': !!errors[f.key] as boolean, 'aria-describedby': errors[f.key] ? `${fieldId}-error` : undefined, onBlur: () => setErrors(prev => ({ ...prev, [f.key]: fieldErrors(p, draft)[f.key] ?? '' })), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { const next = { ...draft, [f.key]: e.target.value }; setDraft(next); if (errors[f.key]) setErrors(prev => ({ ...prev, [f.key]: fieldErrors(p, next)[f.key] ?? '' })); } }; return <label key={f.key} htmlFor={fieldId}>{f.label}{!f.required && <span className="optional-label">Необязательно</span>}{f.key === 'comment' ? <textarea {...props} rows={3}/> : <input {...props} type={f.type ?? 'text'} min={f.type === 'number' ? 1 : undefined} max={f.type === 'number' ? 100 : undefined} step={f.type === 'number' ? 1 : undefined}/>} {errors[f.key] && <span className="field-error" id={`${fieldId}-error`}>{errors[f.key]}</span>}</label>; })}
    <div className="request-expectation"><Clock3 size={18}/><p>{shop.responseTime ? `Ответ: ${shop.responseTime}.` : 'Срок ответа магазин пока не указал.'} После согласования цена и срок появятся в заказе.</p></div>
    <p className="form-help">Черновик сохраняется на этом устройстве. Пароли, коды входа и документы здесь не нужны.</p>
    {failure && <div className="form-failure" role="alert"><b>Не получилось сохранить заявку</b><p>{failure}</p><span>Заполненные поля сохранены. Попробуйте ещё раз.</span></div>}
    <button className="primary-button" disabled={pending || !isAvailable(p)} type="submit">{pending ? <><LoaderCircle className="spin" size={18}/>Сохраняем…</> : isAvailable(p) ? <>Отправить заявку<ArrowRight size={18}/></> : 'Приём заявок закрыт'}</button>
    <p className="fine-print">В предпросмотре заявка сохраняется локально и не отправляется оператору.</p>
  </form>;
}

export function CheckoutPage({ lines, busy, error, onSubmit, navigate }: { lines: { product: Product; quantity: number }[]; busy: boolean; error: string; onSubmit(note: string): Promise<boolean>; navigate: Navigate }) {
  const [draft, setDraft, clearDraft] = useDraft('checkout-draft');
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const totals = currencyTotals(lines.map(l => ({ price: l.product.price, currency: l.product.currency, quantity: l.quantity })));
  return <><Title title="Проверим заказ" subtitle="Сначала состав и условия, затем оплата" onBack={() => navigate('/cart')} back="В корзину"/>
    <div className="checkout-steps"><span className="done"><Check size={14}/>Корзина</span><span className="active">2 · Проверка</span><span>3 · Оплата</span></div>
    {!lines.length ? <Notice>Корзина пуста. <button className="inline-link" onClick={() => navigate('/catalog')}>Открыть каталог</button></Notice> : <form className="checkout-form" onSubmit={async e => { e.preventDefault(); if (!confirmed) { setConfirmError(true); return; } if (await onSubmit(draft.note ?? '')) clearDraft(); }}>
      <section className="content-card"><h2>Состав заказа</h2>{lines.map(({ product: p, quantity }) => <div className="checkout-item" key={p.id}><BrandArt brand={p.brand} productId={p.id} small/><div><b>{p.title} <span>× {quantity}</span></b><p>{p.subtitle}</p><button className="inline-link" type="button" onClick={() => navigate(`/product/${p.id}`)}>Условия предложения</button></div><strong>{money(p.price * quantity, p.currency)}</strong></div>)}</section>
      <section className="content-card"><h2>После оформления</h2><p>Заказ получит номер. Оплата, статус выполнения и инструкция будут доступны на его странице.</p><p className="form-help">Если условия, регион или срок ещё не подтверждены, уточните их у магазина до оплаты.</p></section>
      <label className="standalone-field">Комментарий к заказу <span>Необязательно</span><textarea value={draft.note ?? ''} onChange={e => setDraft({ note: e.target.value })} rows={3} maxLength={1000} placeholder="Важные детали по вашему заказу"/></label>
      <div className="checkout-total"><span>Итого</span><strong>{totals.join(' + ')}</strong></div><p className="form-help">{totals.length > 1 ? 'Суммы в разных валютах показаны отдельно. Курс и валюта оплаты требуют подтверждения магазина.' : 'Перед списанием итоговую сумму должен подтвердить платёжный сервис.'}</p>
      <label className="confirm-check"><input type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); setConfirmError(false); }}/><span>Проверил состав и ознакомился с условиями предложений</span></label>{confirmError && <p className="field-error" role="alert">Подтвердите, что проверили заказ</p>}
      {error && <div className="form-failure" role="alert"><b>Не удалось создать заказ</b><p>{error}</p><button className="inline-link" type="button" onClick={() => navigate('/cart')}>Проверить корзину</button></div>}
      <button className="primary-button" disabled={busy || lines.some(l => l.quantity > l.product.stock)} type="submit">{busy ? <LoaderCircle size={18} className="spin"/> : <>Создать заказ<ArrowRight size={18}/></>}</button>
      <Notice>Это локальный предпросмотр оформления. Деньги не списываются, платёжный сервис ещё не подключён.</Notice>
    </form>}
  </>;
}

function recordTitle(o: RecordOrder) { return 'items' in o ? o.items.map(i => i.title).join(', ') : o.title; }
export function OrdersPage({ orders, requests, navigate }: { orders: Order[]; requests: ServiceRequest[]; navigate: Navigate }) {
  const [tab, setTab] = useState('all');
  const all = [...orders, ...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = all.filter(o => tab === 'all' || (tab === 'active' ? !['completed', 'cancelled', 'failed'].includes(statusOf(o)) : ['completed', 'cancelled', 'failed'].includes(statusOf(o))));
  return <><Title title="Мои заказы" subtitle="Покупки и заявки — со статусом и следующим шагом" onBack={() => navigate('/catalog')} back="В маркет"/><div className="order-tabs" role="group" aria-label="Фильтр заказов">{[['all','Все'],['active','Активные'],['done','Завершённые']].map(([value,label]) => <button key={value} className={tab === value ? 'selected' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    {!visible.length ? <div className="empty-state"><div className="empty-icon"><Package/></div><h2>{all.length ? 'Здесь пока нет заказов' : 'Первый заказ ещё впереди'}</h2><p>{all.length ? 'Проверьте другую вкладку — ваши заказы сохраняются в истории.' : 'Выберите предложение. После оформления здесь появятся его статус, условия и инструкция.'}</p><button className="primary-button" onClick={() => navigate('/catalog')}>Выбрать предложение<ArrowRight size={18}/></button></div> : <div className="orders-list">{visible.map(o => <button className="order-card order-link" key={o.id} onClick={() => navigate(`/order/${encodeURIComponent(o.id)}`)}><div className="order-top"><span>{o.id}</span><span className={`status status-${statusOf(o)}`}>{statuses[statusOf(o)].title}</span></div><small>{dateTime(o.createdAt)}</small><h2>{recordTitle(o)}</h2><div className="order-bottom"><b>{'items' in o ? currencyTotals(o.items).join(' + ') : o.quoteTotal !== undefined ? money(o.quoteTotal) : 'Цена согласуется'}</b><span>Открыть<ChevronRight size={17}/></span></div>{o.demo !== false && <small className="demo-record">Сохранён на этом устройстве</small>}</button>)}</div>}
  </>;
}

export function OrderPage({ record: o, catalog, navigate, preview = false }: { record: RecordOrder; catalog: Catalog; navigate: Navigate; preview?: boolean }) {
  const status = statusOf(o); const info = statuses[status];
  const isFixed = 'items' in o;
  const product = !isFixed ? catalog.products.find(p => p.id === o.productId) : undefined;
  const paymentUrl = safeWebUrl(o.paymentUrl);
  const demo = o.demo !== false;
  const steps = isFixed ? ['Создан','Проверка','Оплата','В работе','Готово'] : ['Создан','Условия','Оплата','В работе','Готово'];
  return <><Title title={isFixed ? 'Ваш заказ' : 'Ваша заявка'} subtitle={o.id} onBack={() => navigate('/orders')} back="Все заказы"/>
    {preview ? <Notice>Просмотр состояния интерфейса. Это пример, не реальный заказ.</Notice> : demo && <Notice>Сохранено только на этом устройстве. Магазин не получил {isFixed ? 'этот заказ' : 'эту заявку'}, оплата и выполнение не запускались.</Notice>}
    <section className={`order-status-card order-status-${status}`}><span className="eyebrow">ТЕКУЩИЙ СТАТУС</span><h2>{info.title}</h2><p>{info.next}</p>{o.issue && <p className="order-issue">{o.issue}</p>}{o.estimatedCompletion && <div className="completion-time"><Clock3 size={17}/><span>{o.estimatedCompletion}</span></div>}<small>Обновление: {dateTime(o.updatedAt ?? o.createdAt)}</small></section>
    {info.step >= 0 && <ol className="order-progress" aria-label="Этапы заказа">{steps.map((label, i) => <li key={label} className={i < info.step ? 'done' : i === info.step ? 'current' : ''} aria-current={i === info.step ? 'step' : undefined}><i>{i < info.step ? <Check size={12}/> : i + 1}</i><span>{label}</span></li>)}</ol>}
    <section className="content-card"><h2>{isFixed ? 'Что оформлено' : o.title}</h2>{isFixed ? o.items.map((item,i) => <div className="checkout-item" key={i}><div><b>{item.title} <span>× {item.quantity}</span></b>{item.subtitle && <p>{item.subtitle}</p>}</div><strong>{money(item.price * item.quantity,item.currency)}</strong></div>) : <dl className="request-parameters">{Object.entries(o.details).filter(([,v]) => v).map(([key,value]) => <div key={key}><dt>{product ? requestFields(product).find(f => f.key === key)?.label ?? key : key}</dt><dd>{value}</dd></div>)}</dl>}
      <div className="checkout-total"><span>{isFixed || o.quoteTotal !== undefined ? 'Итого' : 'Стоимость'}</span><strong>{isFixed ? currencyTotals(o.items).join(' + ') : o.quoteTotal !== undefined ? money(o.quoteTotal) : 'Ещё не согласована'}</strong></div>{o.note && <p className="order-note">{o.note}</p>}
    </section>
    {status === 'completed' && <section className="content-card result-card"><h2><Check size={20}/>Результат и инструкция</h2><p>{o.result || 'Инструкция ещё не добавлена магазином. Обратитесь в поддержку с номером заказа.'}</p></section>}
    <div className="guarantee-card"><ShieldCheck size={23}/><div><b>Доведём до результата</b><p>Гарантия магазина действует на согласованные условия. Если есть проблема, обратитесь по номеру заказа.</p></div></div>
    {status === 'awaiting_payment' && <section className="order-next-action">{!demo && paymentUrl ? <a className="primary-button" href={paymentUrl} target="_blank" rel="noreferrer">Перейти к оплате<ArrowRight size={18}/></a> : <><button className="primary-button" disabled>Оплата ещё не подключена</button><p className="form-help">После подключения магазина здесь появится переход к оплате. Не переводите деньги по неподтверждённым реквизитам.</p></>}</section>}
    {o.events?.length ? <section className="order-events"><h2>Обновления</h2>{o.events.map((event,i) => <div key={i}><span/><p>{event.text}<small>{dateTime(event.at)}</small></p></div>)}</section> : null}
    <button className="secondary-button support-order-button" onClick={() => navigate(`/support/${encodeURIComponent(o.id)}`)}><MessageCircle size={18}/>{status === 'awaiting_details' ? 'Уточнить данные' : 'Вопрос по заказу'}<ChevronRight size={17}/></button>
    {['completed','cancelled','failed'].includes(status) && <button className="plain-button" onClick={() => { const id = isFixed ? o.items[0]?.productId : o.productId; navigate(id ? `/product/${id}` : '/catalog'); }}>Выбрать предложение снова</button>}
  </>;
}

export function OrderPreview({ catalog, state, navigate }: { catalog: Catalog; state: string; navigate: Navigate }) {
  const status: OrderStatus = Object.hasOwn(statuses,state) ? state as OrderStatus : 'awaiting_payment';
  const product = catalog.products.find(p => p.id === 'claude-pro') ?? catalog.products[0];
  const now = new Date().toISOString();
  const example: Order = { id: 'PREVIEW-ORDER', createdAt: now, updatedAt: now, demo: true, status, items: [{ productId: product?.id, title: product?.title ?? 'Пример предложения', subtitle: product?.subtitle, price: product?.price ?? 0, currency: product?.currency, quantity: 1 }], total: product?.price ?? 0, result: 'Пример инструкции: проверьте результат в своём профиле сервиса. Если он отличается от согласованных условий, отправьте номер заказа в поддержку.', issue: status === 'failed' ? 'Пример: сервис оказался недоступен для выбранного региона. Дальнейшие действия нужно согласовать с поддержкой.' : undefined };
  return <><div className="state-preview-tabs">{Object.entries(statuses).map(([key,value]) => <button className={key === status ? 'selected' : ''} key={key} onClick={() => navigate(`/order-preview/${key}`)}>{value.title}</button>)}</div><OrderPage record={example} catalog={catalog} navigate={navigate} preview/></>;
}

export function SupportPage({ shop, record, product, navigate, notify }: { shop: ShopSettings; record?: RecordOrder; product?: Product; navigate: Navigate; notify(message: string): void }) {
  const [draft, setDraft] = useDraft(`support-draft:${record?.id ?? product?.id ?? 'general'}`);
  const [error, setError] = useState(''); const [manual, setManual] = useState(false);
  const topic = draft.topic ?? (record ? 'Вопрос по заказу' : product ? 'Условия предложения' : 'Общий вопрос');
  const text = supportText(record?.id ?? '', record ? recordTitle(record) : product?.title ?? '', topic, draft.message ?? '');
  return <><Title title="Помощь и связь" subtitle="Сохраним контекст, чтобы не объяснять всё заново" onBack={() => navigate(record ? `/order/${record.id}` : product ? `/product/${product.id}` : '/profile')}/>
    <section className="content-card support-contacts"><h2>Поддержка фиКУС</h2>{shop.about && <p>{shop.about}</p>}<dl className="offer-conditions"><div><dt>Telegram</dt><dd>{shop.supportTelegram ? `@${shop.supportTelegram}` : 'Контакт ещё не указан'}</dd></div><div><dt>Часы работы</dt><dd>{shop.workingHours || 'Пока не опубликованы'}</dd></div><div><dt>Ответ</dt><dd>{shop.responseTime || 'Срок ответа не указан'}</dd></div></dl>{shop.supportTelegram && <a className="primary-button" href={`https://t.me/${shop.supportTelegram}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/>Открыть поддержку в Telegram</a>}</section>
    <form className="edit-form support-form" onSubmit={async e => { e.preventDefault(); if (!draft.message?.trim()) { setError('Кратко опишите ваш вопрос'); return; } setError(''); try { await navigator.clipboard.writeText(text); notify('Текст обращения скопирован. Отправьте его в поддержку.'); } catch { setManual(true); } }}>
      {record && <div className="support-context"><Package size={17}/><span>{record.id}<small>{recordTitle(record)}</small></span></div>}{product && <div className="support-context"><BrandArt brand={product.brand} productId={product.id} small/><span>{product.title}</span></div>}
      <label>Тема<select value={topic} onChange={e => setDraft({ ...draft, topic: e.target.value })}>{['Общий вопрос','Условия предложения','Вопрос по заказу','Уточнение данных','Проблема с результатом','Отмена или возврат'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Ваш вопрос<textarea rows={5} maxLength={2000} placeholder="Что нужно уточнить или что пошло не так?" value={draft.message ?? ''} aria-invalid={!!error} onChange={e => { setDraft({ ...draft, message: e.target.value }); setError(''); }}/>{error && <span className="field-error" role="alert">{error}</span>}</label>
      <button className="primary-button" type="submit"><Copy size={18}/>Скопировать обращение</button><p className="form-help">Номер заказа и название предложения уже добавлены. Копирование не отправляет сообщение автоматически.</p>
      {manual && <label>Скопируйте текст вручную<textarea readOnly rows={7} value={text} onFocus={e => e.target.select()}/></label>}
    </form><section className="offer-block"><h2>Отмена и возврат</h2><p>{shop.refundPolicy || 'Общие условия пока не опубликованы. Уточните их до оплаты; условия конкретного предложения находятся в его карточке.'}</p></section>
    {!shop.supportTelegram && <Notice>Для запуска владелец должен указать контакт поддержки в настройках магазина. Пока обращение можно подготовить и скопировать.</Notice>}
  </>;
}

export function ShopEditor({ shop, onSave }: { shop: ShopSettings; onSave(value: ShopSettings): Promise<void> }) {
  const [draft, setDraft] = useState<ShopSettings>(() => ({ ...defaultShop, ...shop })); const [error,setError] = useState(''); const [pending,setPending] = useState(false); const [saved,setSaved] = useState(false);
  return <form className="edit-form" onSubmit={async e => { e.preventDefault(); setError(''); setSaved(false); setPending(true); try { const valid = parseShop(draft); await onSave(valid); setDraft(valid); setSaved(true); } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось сохранить'); } finally { setPending(false); } }}><Notice>Указывайте подтверждённые условия. Пустые поля показываются покупателю как «пока не указано».</Notice>{([['supportTelegram','Telegram поддержки','@shop_support'],['workingHours','Часы работы','Дни, часы и часовой пояс'],['responseTime','Ожидаемое время ответа','Только подтверждённый срок'],['about','О магазине','Как работает ваш магазин'],['refundPolicy','Отмена и возврат','Условия для покупателя']] as const).map(([key,label,placeholder]) => <label key={key}>{label}{['about','refundPolicy'].includes(key) ? <textarea value={draft[key]} maxLength={5000} rows={4} placeholder={placeholder} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }}/> : <input value={draft[key]} maxLength={300} placeholder={placeholder} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }}/>}</label>)}{error && <p className="error" role="alert">{error}</p>}<button className="primary-button" disabled={pending} type="submit">{saved ? 'Сохранено' : pending ? 'Сохраняем…' : 'Сохранить информацию'}<Check size={17}/></button></form>;
}
export function OfferEditor({ product, onChange }: { product: Product; onChange(value: Product): void }) {
  const offer = offerFor(product);
  return <details className="offer-editor"><summary><FileText size={17}/>Условия и содержание объявления<ChevronRight size={16}/></summary><div className="edit-form">{([['result','Что получит покупатель'],['includes','Что входит'],['requirements','Что потребуется от покупателя'],['region','Поддерживаемый регион'],['term','Период / срок действия'],['fulfillment','Срок и способ выполнения'],['refund','Если не удалось выполнить']] as [keyof OfferDetails,string][]).map(([key,label]) => <label key={key}>{label}<textarea rows={key === 'region' || key === 'term' ? 2 : 3} maxLength={10000} value={offer[key]} placeholder="Заполните подтверждёнными условиями" onChange={e => onChange({ ...product, offer: { ...offer, [key]: e.target.value } })}/></label>)}</div></details>;
}
