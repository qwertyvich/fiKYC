import { t } from './i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Copy, FileText, Heart, Info, LoaderCircle, MessageCircle, Minus, Package, Plus, ShieldCheck, ShoppingBag } from 'lucide-react';
import { currencyTotals, isAvailable, isRequest, money, priceLabel, requestFields, validateRequest, type Catalog, type Group, type OfferDetails, type Order, type OrderStatus, type Product, type ServiceRequest, type ShopSettings } from './domain';
import { dateTime, defaultShop, offerFor, parseShop, safeWebUrl, statusOf, statuses, supportText } from './commerce';
import { readLocal, writeLocal } from './store';
import { ProductCover } from './ProductCover';
import { BrandArt } from './visuals';
import { ClawdProductArt } from './ClaudeSection';
import { ProductStats, Reviews } from './ProductReviews';

type Navigate = (path: string) => void;
type RecordOrder = Order | ServiceRequest;
function Title({ title, subtitle, onBack, back = 'Назад' }: { title: string; subtitle?: string; onBack(): void; back?: string }) { return <div className="page-title"><button className="back-link" onClick={onBack}><ArrowLeft size={17}/>{t(back)}</button><h1>{t(title)}</h1>{t(subtitle && <p>{t(subtitle)}</p>)}</div>; }
export function Notice({ children }: { children: ReactNode }) { return <div className="context-notice"><Info size={17}/><p>{t(children)}</p></div>; }
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
    <div className="detail-top"><button className="back-link" onClick={onBack}><ArrowLeft size={17}/>{t("Назад к выбору")}</button><button className="icon-button" aria-label={t("В избранное")} aria-pressed={favorite} onClick={onFavorite}><Heart size={21} fill={favorite ? 'currentColor' : 'none'}/></button></div>
    <div className={`detail-art art-${p.brand}`}><span className="art-watermark">{t(p.brand)}</span>{p.brand === 'claude' ? <ClawdProductArt product={p}/> : <ProductCover product={p}/>} {t(p.badge && <span className="product-badge">{t(p.badge)}</span>)}</div>
    <div className="detail-title"><h1>{t(p.title)}</h1><span className="stock"><i/>{t(request ? (isAvailable(p) ? 'Можно оставить заявку' : 'Приём закрыт') : p.stock ? 'Доступно к оформлению' : 'Нет в наличии')}</span></div>
    <p className="detail-subtitle">{t(p.subtitle)}</p>
    <ProductStats product={p} onReviews={() => document.getElementById('product-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}/>
    <p className="offer-result">{t(offer.result)}</p>
    <div className="guarantee-card"><ShieldCheck size={25}/><div><b>{t("100% гарантия")}</b><p>{t("Доводим до согласованного результата. Состав и условия фиксируем перед оплатой.")}</p><button className="inline-link" onClick={() => document.getElementById('guarantee-terms')?.scrollIntoView({behavior:'smooth',block:'start'})}>{t("Условия гарантии")}<ChevronRight size={15}/></button></div></div>
    <div className="offer-facts"><div><small>{t(request ? 'Стоимость' : 'Цена за 1 шт.')}</small><strong>{t(priceLabel(p))}</strong></div><div><small>{t(request ? 'Срок выполнения' : 'Срок / период')}</small><b>{t(offer.term || offer.fulfillment || 'Уточнить до оплаты')}</b></div></div>
    <section className="offer-block"><h2>{t("Что входит")}</h2><p>{t(offer.includes)}</p>{p.description !== offer.result && !p.description.includes('После подключения магазина') && <p>{t(p.description)}</p>}</section>
    <section className="offer-block"><h2>{t("Перед оформлением")}</h2><p>{t(offer.requirements)}</p><dl className="offer-conditions"><div><dt>{t("Регион")}</dt><dd>{t(offer.region || 'Нужно подтвердить совместимость')}</dd></div><div><dt>{t("Выполнение")}</dt><dd>{t(offer.fulfillment || 'Срок и способ подтверждаются до оплаты')}</dd></div></dl></section>
    <section className="offer-block"><h2>{t("Как всё пройдёт")}</h2><ol className="how-steps">{(request ? ['Укажите параметры и подготовьте заявку.', 'Получите стоимость, срок и состав услуги.', 'Отправьте готовое сообщение продавцу и согласуйте оплату в чате.'] : ['Проверьте условия и добавьте предложение в корзину.', 'Подтвердите состав заказа и итоговую стоимость.', 'Отправьте готовый список продавцу в Telegram и согласуйте оплату.']).map((text, i) => <li key={text}><b>{i + 1}</b><span>{t(text)}</span></li>)}</ol></section>
    <section className="offer-block" id="guarantee-terms"><h2>{t("Если что-то пойдёт не так")}</h2><p>{t(offer.refund || shop.refundPolicy || 'Условия отмены и возврата пока не опубликованы. Уточните их у магазина до оплаты.')}</p><button className="inline-link" onClick={() => navigate(`/support/new?product=${encodeURIComponent(p.id)}`)}><MessageCircle size={17}/>{t("Задать вопрос об этом предложении")}<ChevronRight size={16}/></button></section>
    {p.brand === 'claude' && <section className="offer-block"><h2>{t("Важно о проверках Anthropic")}</h2><p>{t("Проверка личности может потребоваться со стороны платформы. Она проходит в официальном интерфейсе Claude. Магазин не принимает документы в этой форме и не гарантирует решения Anthropic.")}</p><p>{t("Возраст аккаунта, текущая подписка и регион могут влиять на доступность выбранного подключения — подтвердите совместимость до оплаты.")}</p><a className="inline-link" href="https://claude.com/pricing" target="_blank" rel="noreferrer">{t("Актуальные возможности тарифов Claude")}<ArrowRight size={16}/></a></section>}
    <Reviews key={p.id} product={p}/>
    {request && <div ref={formSection} className="request-anchor"><RequestForm product={p} shop={shop} onSubmit={onRequest}/></div>}
    <p className="fine-print product-demo-note">{t("Локальный предпросмотр. Оплата, отправка магазину и выполнение ещё не подключены.")}</p>
    {(!request || !formVisible) && <div className="purchase-dock">{request ? <><div><small>{t("Без оплаты на этом шаге")}</small><b>{t("Уточним по вашей задаче")}</b></div><button className="primary-button" disabled={!isAvailable(p)} onClick={() => formSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t("Оставить заявку")}<ArrowRight size={17}/></button></> : <><div className="dock-price"><strong>{t(money(p.price * quantity, p.currency))}</strong><div className="quantity"><button aria-label={t("Уменьшить количество")} disabled={quantity <= 1} onClick={() => setQuantity(q => q - 1)}><Minus size={16}/></button><span>{quantity}</span><button aria-label={t("Увеличить количество")} disabled={quantity >= p.stock} onClick={() => setQuantity(q => q + 1)}><Plus size={16}/></button></div></div><button className="primary-button" disabled={!p.stock} onClick={() => onAdd(quantity)}><ShoppingBag size={18}/>{t(p.stock ? 'В корзину' : 'Нет в наличии')}</button></>}</div>}
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
  }}><div className="request-form-heading"><span className="eyebrow">{t("ШАГ 1 · БЕЗ ОПЛАТЫ")}</span><h2>{t("Расскажите о задаче")}</h2><p>{t("Добавим эти параметры в сообщение продавцу для согласования стоимости и срока.")}</p></div>
    {requestFields(p).map(f => { const fieldId = `request-${p.id}-${f.key}`; const props = { id: fieldId, 'aria-label': f.label, value: draft[f.key] ?? '', maxLength: 1000, required: f.required, placeholder: f.placeholder, 'aria-invalid': !!errors[f.key] as boolean, 'aria-describedby': errors[f.key] ? `${fieldId}-error` : undefined, onBlur: () => setErrors(prev => ({ ...prev, [f.key]: fieldErrors(p, draft)[f.key] ?? '' })), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { const next = { ...draft, [f.key]: e.target.value }; setDraft(next); if (errors[f.key]) setErrors(prev => ({ ...prev, [f.key]: fieldErrors(p, next)[f.key] ?? '' })); } }; return <label key={f.key} htmlFor={fieldId}>{t(f.label)}{!f.required && <span className="optional-label">{t("Необязательно")}</span>}{f.key === 'comment' ? <textarea {...props} rows={3}/> : <input {...props} type={f.type ?? 'text'} min={f.type === 'number' ? 1 : undefined} max={f.type === 'number' ? 100 : undefined} step={f.type === 'number' ? 1 : undefined}/>} {t(errors[f.key] && <span className="field-error" id={`${fieldId}-error`}>{t(errors[f.key])}</span>)}</label>; })}
    <div className="request-expectation"><Clock3 size={18}/><p>{t(shop.responseTime ? `Ответ: ${shop.responseTime}.` : 'Срок ответа магазин пока не указал.')}{t(" Стоимость, срок и оплату согласуем в личном чате.")}</p></div>
    <p className="form-help">{t("Черновик сохраняется на этом устройстве. Пароли, коды входа и документы здесь не нужны.")}</p>
    {t(failure && <div className="form-failure" role="alert"><b>{t("Не получилось сохранить заявку")}</b><p>{t(failure)}</p><span>{t("Заполненные поля сохранены. Попробуйте ещё раз.")}</span></div>)}
    <button className="primary-button" disabled={pending || !isAvailable(p)} type="submit">{t(pending ? <><LoaderCircle className="spin" size={18}/>{t("Сохраняем…")}</> : isAvailable(p) ? <>{t("Подготовить заявку")}<ArrowRight size={18}/></> : 'Приём заявок закрыт')}</button>
    <p className="fine-print">{t("На следующем шаге появится готовое сообщение продавцу. Отправьте его в Telegram.")}</p>
  </form>;
}

export { CheckoutPage } from './TelegramCheckout';

function recordTitle(o: RecordOrder) { return 'items' in o ? o.items.map(i => i.title).join(', ') : o.title; }
export function OrdersPage({ orders, requests, navigate }: { orders: Order[]; requests: ServiceRequest[]; navigate: Navigate }) {
  const [tab, setTab] = useState('all');
  const all = [...orders, ...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = all.filter(o => tab === 'all' || (tab === 'active' ? !['completed', 'cancelled', 'failed'].includes(statusOf(o)) : ['completed', 'cancelled', 'failed'].includes(statusOf(o))));
  return <><Title title={t("Мои заказы")} subtitle={t("Покупки и заявки — со статусом и следующим шагом")} onBack={() => navigate('/catalog')} back={t("В маркет")}/><div className="order-tabs" role="group" aria-label={t("Фильтр заказов")}>{[['all','Все'],['active','Активные'],['done','Завершённые']].map(([value,label]) => <button key={value} className={tab === value ? 'selected' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}>{t(label)}</button>)}</div>
    {!visible.length ? <div className="empty-state"><div className="empty-icon"><Package/></div><h2>{t(all.length ? 'Здесь пока нет заказов' : 'Первый заказ ещё впереди')}</h2><p>{t(all.length ? 'Проверьте другую вкладку — ваши заказы сохраняются в истории.' : 'Выберите предложение. После оформления здесь появятся его статус, условия и инструкция.')}</p><button className="primary-button" onClick={() => navigate('/catalog')}>{t("Выбрать предложение")}<ArrowRight size={18}/></button></div> : <div className="orders-list">{visible.map(o => <button className="order-card order-link" key={o.id} onClick={() => navigate(`/order/${encodeURIComponent(o.id)}`)}><div className="order-top"><span>{t(o.id)}</span><span className={`status status-${statusOf(o)}`}>{t(statuses[statusOf(o)].title)}</span></div><small>{t(dateTime(o.createdAt))}</small><h2>{t(recordTitle(o))}</h2><div className="order-bottom"><b>{t('items' in o ? currencyTotals(o.items).join(' + ') : o.quoteTotal !== undefined ? money(o.quoteTotal,o.quoteCurrency) : 'Цена согласуется')}</b><span>{t("Открыть")}<ChevronRight size={17}/></span></div>{o.demo !== false && <small className="demo-record">{t("Сохранён на этом устройстве")}</small>}</button>)}</div>}
  </>;
}

export function OrderPage({ record: o, catalog, navigate, preview = false, onConfirm }: { record: RecordOrder; catalog: Catalog; navigate: Navigate; preview?: boolean; onConfirm?(): Promise<void> }) {
  const status = statusOf(o); const info = statuses[status];
  const isFixed = 'items' in o;
  const product = !isFixed ? catalog.products.find(p => p.id === o.productId) : undefined;
  const paymentUrl = safeWebUrl(o.paymentUrl);
  const demo = o.demo !== false;
  const steps = isFixed ? ['Создан','Проверка','Оплата','В работе','Готово'] : ['Создан','Условия','Оплата','В работе','Готово'];
  return <><Title title={t(isFixed ? 'Ваш заказ' : 'Ваша заявка')} subtitle={t(o.id)} onBack={() => navigate('/orders')} back={t("Все заказы")}/>
    {preview ? <Notice>{t("Просмотр состояния интерфейса. Это пример, не реальный заказ.")}</Notice> : demo && <Notice>{t("Сохранено только на этом устройстве. Магазин не получил ")}{t(isFixed ? 'этот заказ' : 'эту заявку')}{t(", оплата и выполнение не запускались.")}</Notice>}
    <section className={`order-status-card order-status-${status}`}><span className="eyebrow">{t("ТЕКУЩИЙ СТАТУС")}</span><h2>{t(info.title)}</h2><p>{t(info.next)}</p>{t(o.issue && <p className="order-issue">{t(o.issue)}</p>)}{t(o.estimatedCompletion && <div className="completion-time"><Clock3 size={17}/><span>{t(o.estimatedCompletion)}</span></div>)}<small>{t("Обновление: ")}{t(dateTime(o.updatedAt ?? o.createdAt))}</small></section>
    {info.step >= 0 && <ol className="order-progress" aria-label={t("Этапы заказа")}>{steps.map((label, i) => <li key={label} className={i < info.step ? 'done' : i === info.step ? 'current' : ''} aria-current={i === info.step ? 'step' : undefined}><i>{i < info.step ? <Check size={12}/> : i + 1}</i><span>{t(label)}</span></li>)}</ol>}
    <section className="content-card"><h2>{t(isFixed ? 'Что оформлено' : o.title)}</h2>{isFixed ? o.items.map((item,i) => <div className="checkout-item" key={i}><div><b>{t(item.title)} <span>× {item.quantity}</span></b>{t(item.subtitle && <p>{t(item.subtitle)}</p>)}</div><strong>{t(money(item.price * item.quantity,item.currency))}</strong></div>) : <dl className="request-parameters">{Object.entries(o.details).filter(([,v]) => v).map(([key,value]) => <div key={key}><dt>{t(product ? requestFields(product).find(f => f.key === key)?.label ?? key : key)}</dt><dd>{t(value)}</dd></div>)}</dl>}
      <div className="checkout-total"><span>{t(isFixed || o.quoteTotal !== undefined ? 'Итого' : 'Стоимость')}</span><strong>{t(isFixed ? currencyTotals(o.items).join(' + ') : o.quoteTotal !== undefined ? money(o.quoteTotal,o.quoteCurrency) : 'Ещё не согласована')}</strong></div>{t(o.note && <p className="order-note">{t(o.note)}</p>)}
    </section>
    {status === 'completed' && <section className="content-card result-card"><h2><Check size={20}/>{t("Результат и инструкция")}</h2><p>{t(o.result || 'Инструкция ещё не добавлена магазином. Обратитесь в поддержку с номером заказа.')}</p></section>}
    {status === 'awaiting_confirmation' && <QuoteConfirmation record={o} enabled={!demo && !!onConfirm && o.quoteTotal !== undefined && !!o.estimatedCompletion} onConfirm={onConfirm}/>}
    <div className="guarantee-card"><ShieldCheck size={23}/><div><b>{t("Доведём до результата")}</b><p>{t("Гарантия магазина действует на согласованные условия. Если есть проблема, обратитесь по номеру заказа.")}</p></div></div>
    {status === 'awaiting_payment' && <section className="order-next-action">{!demo && paymentUrl ? <a className="primary-button" href={paymentUrl} target="_blank" rel="noreferrer">{t("Перейти к оплате")}<ArrowRight size={18}/></a> : <><button className="primary-button" disabled>{t("Оплата ещё не подключена")}</button><p className="form-help">{t("После подключения магазина здесь появится переход к оплате. Не переводите деньги по неподтверждённым реквизитам.")}</p></>}</section>}
    {o.events?.length ? <section className="order-events"><h2>{t("Обновления")}</h2>{o.events.map((event,i) => <div key={i}><span/><p>{t(event.text)}<small>{t(dateTime(event.at))}</small></p></div>)}</section> : null}
    <button className="secondary-button support-order-button" onClick={() => navigate(`/support/${encodeURIComponent(o.id)}`)}><MessageCircle size={18}/>{t(status === 'awaiting_details' ? 'Уточнить данные' : 'Вопрос по заказу')}<ChevronRight size={17}/></button>
    {['completed','cancelled','failed'].includes(status) && <button className="plain-button" onClick={() => { const id = isFixed ? o.items[0]?.productId : o.productId; navigate(id ? `/product/${id}` : '/catalog'); }}>{t("Выбрать предложение снова")}</button>}
  </>;
}

function QuoteConfirmation({ record, enabled, onConfirm }: { record: RecordOrder; enabled: boolean; onConfirm?(): Promise<void> }) {
  const [agree,setAgree] = useState(false); const [pending,setPending] = useState(false); const [error,setError] = useState('');
  return <section className="content-card"><h2>{t("Подтверждение условий")}</h2><p>{t("Стоимость: ")}<strong>{t(record.quoteTotal === undefined ? 'Не указана' : money(record.quoteTotal,record.quoteCurrency))}</strong></p><p>{t("Срок: ")}{t(record.estimatedCompletion || 'Не указан')}</p><label className="confirm-check"><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}/><span>{t("Стоимость, срок и состав услуги мне подходят")}</span></label><button className="primary-button" disabled={!enabled || !agree || pending} onClick={async()=>{setPending(true);setError('');try{await onConfirm?.();}catch(err){setError(err instanceof Error?err.message:'Не удалось подтвердить. Попробуйте ещё раз.');}finally{setPending(false);}}}>{t(pending?'Подтверждаем…':'Подтвердить предложение')}</button>{!enabled && <p className="form-help">{t("В предпросмотре подтверждение не отправляется. Для работы нужны подключённый магазин, согласованные стоимость и срок.")}</p>}{t(error && <p className="error" role="alert">{t(error)}</p>)}</section>;
}

export function OrderPreview({ catalog, state, navigate }: { catalog: Catalog; state: string; navigate: Navigate }) {
  const status: OrderStatus = Object.hasOwn(statuses,state) ? state as OrderStatus : 'awaiting_payment';
  const product = catalog.products.find(p => p.id === 'claude-pro') ?? catalog.products[0];
  const now = new Date().toISOString();
  const example: Order = { id: 'PREVIEW-ORDER', createdAt: now, updatedAt: now, demo: true, status, items: [{ productId: product?.id, title: product?.title ?? 'Пример предложения', subtitle: product?.subtitle, price: product?.price ?? 0, currency: product?.currency, quantity: 1 }], total: product?.price ?? 0, result: 'Пример инструкции: проверьте результат в своём профиле сервиса. Если он отличается от согласованных условий, отправьте номер заказа в поддержку.', issue: status === 'failed' ? 'Пример: сервис оказался недоступен для выбранного региона. Дальнейшие действия нужно согласовать с поддержкой.' : undefined };
  return <><div className="state-preview-tabs">{Object.entries(statuses).map(([key,value]) => <button className={key === status ? 'selected' : ''} key={key} onClick={() => navigate(`/order-preview/${key}`)}>{t(value.title)}</button>)}</div><OrderPage record={example} catalog={catalog} navigate={navigate} preview/></>;
}

export function SupportPage({ shop, record, product, navigate, notify }: { shop: ShopSettings; record?: RecordOrder; product?: Product; navigate: Navigate; notify(message: string): void }) {
  const [draft, setDraft] = useDraft(`support-draft:${record?.id ?? product?.id ?? 'general'}`);
  const [error, setError] = useState(''); const [manual, setManual] = useState(false);
  const topic = draft.topic ?? (record ? 'Вопрос по заказу' : product ? 'Условия предложения' : 'Общий вопрос');
  const text = supportText(record?.id ?? '', record ? recordTitle(record) : product?.title ?? '', topic, draft.message ?? '');
  return <><Title title={t("Помощь и связь")} subtitle={t("Сохраним контекст, чтобы не объяснять всё заново")} onBack={() => navigate(record ? `/order/${record.id}` : product ? `/product/${product.id}` : '/profile')}/>
    <section className="content-card support-contacts"><h2>{t("Поддержка фиКУС")}</h2>{t(shop.about && <p>{t(shop.about)}</p>)}<dl className="offer-conditions"><div><dt>Telegram</dt><dd>{t(shop.supportTelegram ? `@${shop.supportTelegram}` : 'Контакт ещё не указан')}</dd></div><div><dt>{t("Часы работы")}</dt><dd>{t(shop.workingHours || 'Пока не опубликованы')}</dd></div><div><dt>{t("Ответ")}</dt><dd>{t(shop.responseTime || 'Срок ответа не указан')}</dd></div></dl>{t(shop.supportTelegram && <a className="primary-button" href={`https://t.me/${shop.supportTelegram}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/>{t("Открыть поддержку в Telegram")}</a>)}</section>
    {shop.supportTelegram === 'duriv' && <p className="form-help">{t("@duriv — временный контакт для предпросмотра. Перед запуском замените его на рабочую поддержку.")}</p>}
    <form className="edit-form support-form" onSubmit={async e => { e.preventDefault(); if (!draft.message?.trim()) { setError('Кратко опишите ваш вопрос'); return; } setError(''); try { await navigator.clipboard.writeText(text); notify('Текст обращения скопирован. Отправьте его в поддержку.'); } catch { setManual(true); } }}>
      {record && <div className="support-context"><Package size={17}/><span>{t(record.id)}<small>{t(recordTitle(record))}</small></span></div>}{product && <div className="support-context"><BrandArt brand={product.brand} productId={product.id} small/><span>{t(product.title)}</span></div>}
      <label>{t("Тема")}<select value={topic} onChange={e => setDraft({ ...draft, topic: e.target.value })}>{['Общий вопрос','Условия предложения','Вопрос по заказу','Уточнение данных','Проблема с результатом','Отмена или возврат'].map(v => <option key={v}>{t(v)}</option>)}</select></label>
      <label>{t("Ваш вопрос")}<textarea rows={5} maxLength={2000} placeholder={t("Что нужно уточнить или что пошло не так?")} value={draft.message ?? ''} aria-invalid={!!error} onChange={e => { setDraft({ ...draft, message: e.target.value }); setError(''); }}/>{t(error && <span className="field-error" role="alert">{t(error)}</span>)}</label>
      <button className="primary-button" type="submit"><Copy size={18}/>{t("Скопировать обращение")}</button><p className="form-help">{t("Номер заказа и название предложения уже добавлены. Копирование не отправляет сообщение автоматически.")}</p>
      {manual && <label>{t("Скопируйте текст вручную")}<textarea readOnly rows={7} value={text} onFocus={e => e.target.select()}/></label>}
    </form><section className="offer-block"><h2>{t("Отмена и возврат")}</h2><p>{t(shop.refundPolicy || 'Общие условия пока не опубликованы. Уточните их до оплаты; условия конкретного предложения находятся в его карточке.')}</p></section>
    {!shop.supportTelegram && <Notice>{t("Для запуска владелец должен указать контакт поддержки в настройках магазина. Пока обращение можно подготовить и скопировать.")}</Notice>}
  </>;
}

export function ShopEditor({ shop, onSave }: { shop: ShopSettings; onSave(value: ShopSettings): Promise<void> }) {
  const [draft, setDraft] = useState<ShopSettings>(() => ({ ...defaultShop, ...shop })); const [error,setError] = useState(''); const [pending,setPending] = useState(false); const [saved,setSaved] = useState(false);
  return <form className="edit-form" onSubmit={async e => { e.preventDefault(); setError(''); setSaved(false); setPending(true); try { const valid = parseShop(draft); await onSave(valid); setDraft(valid); setSaved(true); } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось сохранить'); } finally { setPending(false); } }}><Notice>{t("Указывайте подтверждённые условия. Пустые поля показываются покупателю как «пока не указано».")}</Notice>{([['supportTelegram','Telegram продавца','@shop_username'],['workingHours','Часы работы','Дни, часы и часовой пояс'],['responseTime','Ожидаемое время ответа','Только подтверждённый срок'],['about','О магазине','Как работает ваш магазин'],['refundPolicy','Отмена и возврат','Условия для покупателя']] as const).map(([key,label,placeholder]) => <label key={key}>{t(label)}{['about','refundPolicy','workingHours'].includes(key) ? <textarea value={draft[key]} maxLength={5000} rows={4} placeholder={t(placeholder)} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }}/> : <input value={draft[key]} maxLength={300} placeholder={t(placeholder)} onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setSaved(false); }}/>}</label>)}{t(error && <p className="error" role="alert">{t(error)}</p>)}<button className="primary-button" disabled={pending} type="submit">{t(saved ? 'Сохранено' : pending ? 'Сохраняем…' : 'Сохранить информацию')}<Check size={17}/></button></form>;
}
export function OfferEditor({ product, onChange }: { product: Product; onChange(value: Product): void }) {
  const offer = offerFor(product);
  return <details className="offer-editor"><summary><FileText size={17}/>{t("Условия и содержание объявления")}<ChevronRight size={16}/></summary><div className="edit-form">{([['result','Что получит покупатель'],['includes','Что входит'],['requirements','Что потребуется от покупателя'],['region','Поддерживаемый регион'],['term','Период / срок действия'],['fulfillment','Срок и способ выполнения'],['refund','Если не удалось выполнить']] as [keyof OfferDetails,string][]).map(([key,label]) => <label key={key}>{t(label)}<textarea rows={key === 'region' || key === 'term' ? 2 : 3} maxLength={10000} value={offer[key]} placeholder={t("Заполните подтверждёнными условиями")} onChange={e => onChange({ ...product, offer: { ...offer, [key]: e.target.value } })}/></label>)}</div></details>;
}
