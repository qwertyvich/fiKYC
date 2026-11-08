import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Copy, CreditCard, FileUp, Info, LoaderCircle, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, mutation } from './api';
import { money, type Product, type ShopSettings } from './domain';
import { paymentTitles, type Payment } from './payments';
import { SellerMessage } from './SellerMessage';
import { readLocal, writeLocal } from './store';
import { sellerChatLink } from './seller';
import './payments.css';

export function CardCheckout({ lines, shop, navigate }: { lines: { product: Product; quantity: number }[]; shop: ShopSettings; navigate(path: string): void }) {
  const [note, setNote] = useState(() => { const saved = readLocal<{note?: unknown}>('checkout-draft', {}); return typeof saved?.note === 'string' ? saved.note.slice(0, 1000) : ''; });
  const [warning, setWarning] = useState(false), [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const total = lines.reduce((n, l) => n + l.product.price * l.quantity, 0);
  const currencies = [...new Set(lines.map(l => l.product.currency ?? 'RUB'))];
  const invalid = !lines.length || lines.some(l => l.quantity > l.product.stock || l.product.stock < 1);
  useEffect(() => { try { writeLocal('checkout-draft', { note }); } catch {} }, [note]);
  async function submit() {
    if (!accepted || busy) return; setBusy(true); setError('');
    try {
      const p = await mutation<Payment>('/payments', 'POST', { items: lines.map(l => ({ productId: l.product.id, quantity: l.quantity })), note, expectedAmount: total, accepted: true });
      navigate('/payment/' + p.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <><div className="page-title"><button className="back-link" onClick={() => navigate('/cart')}><ArrowLeft size={17}/>В корзину</button><h1>Оформление заказа</h1><p>Проверьте детали — и перейдём к оплате</p></div>
    <div className="checkout-steps"><span className="done"><Check size={14}/>Корзина</span><span className="active">2 · Проверка</span><span>3 · Оплата</span></div>
    {!lines.length ? <div className="context-notice"><p>В корзине пока пусто. <button className="inline-link" onClick={() => navigate('/catalog')}>Выбрать товары</button></p></div> : <div className="checkout-form">
      <section className="content-card payment-summary"><div className="payment-eyebrow"><ShieldCheck size={16}/>ВАШ ЗАКАЗ</div>{lines.map(({product: p, quantity}) => <div className="payment-line" key={p.id}><div><b>{p.title}</b><small>{quantity} шт.</small></div><strong>{money(p.price * quantity, p.currency)}</strong></div>)}<div className="payment-line payment-total"><span>К оплате</span><strong>{currencies.length === 1 ? money(total, currencies[0]) : 'В разных валютах'}</strong></div></section>
      <label className="standalone-field">Комментарий <span>Необязательно</span><textarea rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Что нам нужно знать о вашем заказе?"/></label>
      {invalid && <p className="form-failure" role="alert">Количество превышает остаток. Измените состав корзины.</p>}
      {currencies.length === 1 ? <><div className="payment-method"><span className="payment-icon"><CreditCard size={22}/></span><div><b>Перевод на карту</b><p>Реквизиты под вашу сумму · квитанция после перевода</p></div><CheckCircle2 size={18}/></div><button className="primary-button" disabled={invalid} onClick={() => setWarning(true)}>Оплатить {money(total, currencies[0])}<ArrowRight size={18}/></button><p className="fine-print">Если подходящей карты сейчас нет, менеджер поможет с оплатой.</p></> : <SellerMessage username={shop.supportTelegram} text={'Здравствуйте! Помогите оформить заказ в разных валютах:\n' + lines.map(l => `${l.product.title} × ${l.quantity}`).join('\n')} />}
      {error && <p className="form-failure" role="alert">{error}</p>}
    </div>}
    {warning && <div className="payment-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) setWarning(false); }}><section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-warning" tabIndex={-1} onKeyDown={e => { if (e.key === 'Escape' && !busy) setWarning(false); if (e.key === 'Tab') { const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input,button:not(:disabled)')); const first = buttons[0], last = buttons.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}>
      <span className="payment-icon large"><Clock3 size={27}/></span><h2 id="payment-warning">15 минут на перевод</h2><p>Реквизиты выдаются на 15 минут. Переведите точную сумму и вернитесь сюда, чтобы прикрепить квитанцию.</p><div className="payment-notice"><Info size={18}/><p>Карта может стать недоступна раньше. Перед переводом проверьте этот экран. Если появится предупреждение — не переводите по прежним реквизитам.</p></div><label className="confirm-check"><input autoFocus type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span>Всё понятно, готовлюсь к переводу</span></label><button className="primary-button" disabled={!accepted || busy} onClick={() => void submit()}>{busy ? <><LoaderCircle size={18} className="spin"/>Подбираем реквизиты…</> : <>Получить реквизиты<ArrowRight size={18}/></>}</button><button className="secondary-button" disabled={busy} onClick={() => setWarning(false)}>Вернуться к заказу</button>{error && <p className="form-failure" role="alert">{error}</p>}</section></div>}
  </>;
}

export function PaymentPage({ id, shop, navigate }: { id: string; shop: ShopSettings; navigate(path: string): void }) {
  const [payment, setPayment] = useState<Payment | null>(null), [online, setOnline] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [retryWarning, setRetryWarning] = useState(false), [notPaid, setNotPaid] = useState(false);
  const [time, setTime] = useState(Date.now());
  const receivedAt = useRef(0), offset = useRef(0), input = useRef<HTMLInputElement>(null), streamVersion = useRef(0);
  const mounted = useRef(true), latest = useRef<Payment | null>(null);
  useEffect(() => {
    let disposed = false; mounted.current = true; setPayment(null); latest.current = null; setOnline(false); receivedAt.current = 0;
    const accept = (p: Payment) => { if (disposed) return; const previous = latest.current; if (previous && (p.serverNow < previous.serverNow || p.receiptCount < previous.receiptCount || (previous.status !== 'awaiting_transfer' && p.status === 'awaiting_transfer') || (previous.status === 'paid' && p.status !== 'paid'))) return; receivedAt.current = Date.now(); offset.current = p.serverNow - Date.now(); latest.current = p; setPayment(p); setOnline(true); setError(''); streamVersion.current++; };
    const stream = new EventSource(`${import.meta.env.BASE_URL}api/payments/${id}/events`);
    stream.onmessage = e => { try { accept(JSON.parse(e.data)); } catch { setOnline(false); } };
    stream.onerror = () => { setOnline(false); };
    const version = streamVersion.current;
    api<Payment>('/payments/' + id).then(p => { if (streamVersion.current === version) accept(p); }).catch(e => { if (!disposed) setError(e.message); });
    const timer = setInterval(() => { setTime(Date.now()); if (Date.now() - receivedAt.current > 2500 || document.visibilityState === 'hidden') setOnline(false); }, 250);
    const visibility = () => { setOnline(false); receivedAt.current = 0; };
    document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; mounted.current = false; clearInterval(timer); stream.close(); document.removeEventListener('visibilitychange', visibility); };
  }, [id]);
  const remaining = payment?.expiresAt ? Math.max(0, Math.ceil((payment.expiresAt - time - offset.current) / 1000)) : 0;
  const active = payment?.status === 'awaiting_transfer' && online && remaining > 0 && !!payment.card;
  async function copy() {
    setError('');
    try {
      const fresh = await api<Payment>('/payments/' + id);
      // A stop received while checking always wins over an older HTTP response.
      if (!mounted.current || !online || document.visibilityState === 'hidden' || Date.now() - receivedAt.current > 2500 || fresh.card?.number !== latest.current?.card?.number || fresh.status !== 'awaiting_transfer' || !fresh.card || fresh.expiresAt! <= fresh.serverNow || latest.current?.status !== 'awaiting_transfer') throw new Error('Проверяем доступность карты. Дождитесь обновления перед переводом.');
      await navigator.clipboard.writeText(fresh.card.number); setCopied(true); setTimeout(() => { if (mounted.current) setCopied(false); }, 2000);
    } catch (e) { setError((e as Error).message); }
  }
  async function upload(file?: File) {
    if (!file || busy) return;
    if (file.size > 12 * 1024 * 1024) { setError('Выберите квитанцию до 12 МБ'); return; }
    setBusy(true); setError('');
    try { const p = await api<Payment>(`/payments/${id}/receipt`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } }); latest.current = p; setPayment(p); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  async function retry() {
    setBusy(true); setError('');
    try { const p = await mutation<Payment>(`/payments/${id}/retry`, 'POST', { notPaid, accepted: true }); setRetryWarning(false); setNotPaid(false); navigate('/payment/' + p.id); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!payment) return <><div className="page-title"><button className="back-link" onClick={() => navigate('/orders')}><ArrowLeft size={17}/>К заказам</button><h1>Оплата заказа</h1></div><div className="context-notice">{error ? <p role="alert">{error}</p> : <><LoaderCircle className="spin" size={20}/><p>Проверяем ваш заказ…</p></>}</div></>;
  const expired = payment.status === 'awaiting_receipt' || (payment.status === 'awaiting_transfer' && remaining <= 0);
  const invalidated = payment.status === 'invalidated';
  const receipt = <section className="payment-receipt"><div className="payment-receipt-heading"><FileUp size={21}/><h2>{payment.receiptCount ? 'Квитанция прикреплена' : 'После оплаты'}</h2></div><p>Прикрепите развёрнутый скриншот перевода или квитанцию. На ней должны быть видны сумма, дата и получатель.</p><input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden aria-label="Квитанция об оплате" onChange={e => void upload(e.target.files?.[0])}/><button className="primary-button" disabled={busy} onClick={() => input.current?.click()}>{busy ? <><LoaderCircle size={18} className="spin"/>Сохраняем квитанцию…</> : <><FileUp size={18}/>{payment.receiptCount ? 'Прикрепить ещё квитанцию' : 'Прикрепить квитанцию'}</>}</button><a className="payment-text-button" href={sellerChatLink(shop.supportTelegram || 'tcmai', `Здравствуйте! Прикреплю квитанцию к заказу ${payment.id}. Сумма: ${money(payment.amount, payment.currency)}.`) || 'https://t.me/tcmai'} target="_blank" rel="noreferrer"><MessageCircle size={16}/>Отправить менеджеру в Telegram</a><small>PDF, JPG, PNG или WebP · до 12 МБ</small>{payment.deliveryPending && <p className="fine-print">Квитанция сохранена. Доставляем её менеджеру.</p>}</section>;
  return <><div className="page-title"><button className="back-link" onClick={() => navigate('/orders')}><ArrowLeft size={17}/>Мои заказы</button><h1>{payment.status === 'paid' ? 'Спасибо за оплату' : 'Оплата на карту'}</h1><p className="payment-order-id">{payment.id}</p></div>
    <section className="payment-amount-card"><div className="payment-eyebrow">СУММА ПЕРЕВОДА</div><strong>{money(payment.amount, payment.currency)}</strong><p>{payment.items.map(i => `${i.title}${i.quantity > 1 ? ' × ' + i.quantity : ''}`).join(' · ')}</p></section>
    {active ? <div className="payment-requisites">
      <section className="payment-number-card">
        <span className="payment-number-label">Номер карты для перевода</span>
        <button className="payment-card-number" onClick={() => void copy()} aria-label="Скопировать номер карты"><span>{payment.card!.number.replace(/(.{4})/g, '$1 ').trim()}</span><span className="payment-copy-icon">{copied ? <Check size={21}/> : <Copy size={21}/>}</span></button>
        {copied && <small className="payment-copy-feedback" role="status">Номер карты скопирован</small>}
      </section>
      <section className="payment-bank-card payment-details-card">
        <dl className="payment-bank-details"><div><dt>Банк</dt><dd>{payment.card!.bank}</dd></div><div><dt>Получатель</dt><dd>{payment.card!.holder}</dd></div></dl>
        <div className={`payment-timer ${remaining < 120 ? 'urgent' : ''}`}><Clock3 size={17}/><span>Время на перевод</span><strong role="timer">{Math.floor(remaining / 60).toString().padStart(2, '0')}:{(remaining % 60).toString().padStart(2, '0')}</strong></div><div className="payment-progress"><i style={{width: `${remaining / 900 * 100}%`}}/></div>
        <div className="payment-transfer-note"><Info size={16}/><p>Переведите точную сумму одним платежом. Если реквизиты станут недоступны, не переводите по прежнему номеру.</p></div>
        {receipt}
      </section>
    </div> : <section className={`payment-state ${invalidated ? 'attention' : ''}`} role="status"><span className="payment-icon large">{payment.status === 'paid' ? <CheckCircle2 size={28}/> : payment.status === 'receipt_review' ? <ShieldCheck size={28}/> : <Clock3 size={28}/>}</span><h2>{!online && payment.status === 'awaiting_transfer' && !expired ? 'Проверяем реквизиты' : expired ? 'Ожидаем квитанцию' : paymentTitles[payment.status]}</h2><p>{invalidated ? 'Пожалуйста, не переводите по прежнему номеру. Если вы уже оплатили, прикрепите квитанцию — поможем проверить перевод.' : expired ? 'Время на перевод истекло. Если оплатили — пришлите квитанцию. Если ещё нет — получите новые реквизиты перед переводом.' : payment.status === 'manual_review' ? (payment.reason === 'limits' || payment.reason === 'currency' ? 'Для вашей суммы менеджер подберёт подходящий способ оплаты. Не разбивайте платёж на несколько переводов.' : 'Реквизиты пока недоступны. Можно проверить их ещё раз или связаться с менеджером. Если вы уже оплатили по выданным менеджером реквизитам, прикрепите квитанцию здесь.') : payment.status === 'receipt_review' ? 'Квитанция сохранена. Проверим поступление денег и сообщим результат. Повторно переводить деньги не нужно.' : payment.status === 'paid' ? 'Поступление денег подтверждено. Менеджер свяжется с вами для передачи покупки.' : payment.status === 'superseded' ? 'Актуальная оплата находится в списке ваших заказов. По прежним реквизитам переводить не нужно.' : 'Уточняем, можно ли сейчас перевести деньги. Дождитесь появления реквизитов или обратитесь к менеджеру.'}</p></section>}
    {!active && payment.status !== 'paid' && receipt}
    {(invalidated || expired || payment.status === 'manual_review') && !payment.receiptCount && <section className="payment-retry">{!retryWarning ? <button className="secondary-button" onClick={() => setRetryWarning(true)}><RefreshCw size={17}/>{payment.status === 'manual_review' ? 'Проверить реквизиты' : 'Не успел оплатить'}</button> : <><h3>Получить новые реквизиты?</h3><p>На новый перевод будет 15 минут. Если деньги уже отправлены или перевод обрабатывается банком, прикрепите квитанцию.</p><label className="confirm-check"><input type="checkbox" checked={notPaid} onChange={e => setNotPaid(e.target.checked)}/><span>Я ещё не переводил деньги по этому заказу</span></label><button className="primary-button" disabled={!notPaid || busy} onClick={() => void retry()}>Получить новые реквизиты</button></>}</section>}
    {error && <p className="form-failure" role="alert">{error}</p>}
    <div className="payment-support"><a className="secondary-button" href={sellerChatLink(shop.supportTelegram || 'tcmai', `Здравствуйте! Нужна помощь с оплатой заказа ${payment.id}. Сумма: ${money(payment.amount, payment.currency)}.`) || 'https://t.me/tcmai'} target="_blank" rel="noreferrer"><MessageCircle size={17}/>Связаться с менеджером</a></div>
  </>;
}
export function PaymentHistory({navigate}: {navigate(path: string): void}) {
  const [payments, setPayments] = useState<Payment[]>([]), [error, setError] = useState('');
  useEffect(() => { let alive = true; const refresh = () => api<Payment[]>('/payments').then(p => { if (alive) { setPayments(p); setError(''); } }).catch(e => { if (alive) setError(e.message); }); void refresh(); const timer = setInterval(refresh, 10000); return () => { alive = false; clearInterval(timer); }; }, []);
  return <><div className="page-title"><h1>Мои заказы</h1><p>Статус оплаты и квитанции — всегда под рукой</p></div>{!payments.length && !error && <div className="context-notice"><p>Здесь пока нет заказов. Выберите товар в каталоге — мы поможем с оплатой.</p></div>}{error && <p className="form-failure" role="alert">Не удалось обновить оплаты: {error}</p>}{payments.length > 0 && <section className="payment-history" aria-label="Оплаты заказов"><h2>Ваши оплаты</h2>{payments.map(p => <button className="payment-history-row" key={p.id} onClick={() => navigate('/payment/' + p.id)}><span className="payment-icon"><CreditCard size={20}/></span><span><b>{p.items[0]?.title}</b><small>{paymentTitles[p.status]}</small><small>{p.id}</small></span><strong>{money(p.amount, p.currency)}<ArrowRight size={15}/></strong></button>)}</section>}</>;
}
