import { t } from './i18n';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { currencyTotals, isRequest, money, requestFields, validateRequest, type Product, type ShopSettings } from './domain';
import { cartMessage } from './seller';
import { readLocal, writeLocal } from './store';
import { SellerMessage } from './SellerMessage';
import { BrandArt } from './visuals';

export function CheckoutPage({ lines, shop, navigate }: { lines: { product: Product; quantity: number }[]; shop: ShopSettings; navigate(path: string): void }) {
  const [note, setNote] = useState(() => { const saved = readLocal<{ note?: unknown }>('checkout-draft', {}); return typeof saved?.note === 'string' ? saved.note.slice(0,1000) : ''; });
  const [useBalance, setUseBalance] = useState(false);
  useEffect(() => { try { writeLocal('checkout-draft', { note }); } catch { /* The entered comment stays in memory. */ } }, [note]);
  const totals = currencyTotals(lines.map(({ product: p, quantity }) => ({ price: p.price, currency: p.currency, quantity })));
  const invalid = lines.some(l => l.quantity > l.product.stock || l.product.stock < 1);
  return <><div className="page-title"><button className="back-link" onClick={() => navigate('/cart')}><ArrowLeft size={17}/>{t("В корзину")}</button><h1>{t("Заказ в Telegram")}</h1><p>{t("Проверьте состав и отправьте готовое сообщение продавцу")}</p></div>
    <div className="checkout-steps"><span className="done"><Check size={14}/>{t("Корзина")}</span><span className="active">{t("2 · Проверка")}</span><span>{t("3 · Чат продавца")}</span></div>
    {!lines.length ? <div className="context-notice"><p>{t("Корзина пуста. ")}<button className="inline-link" onClick={() => navigate('/catalog')}>{t("Открыть каталог")}</button></p></div> : <div className="checkout-form">
      <section className="content-card"><h2>{t("Состав заказа")}</h2>{lines.map(({ product: p, quantity }) => <div className="checkout-item" key={p.id}><BrandArt brand={p.brand} productId={p.id} small/><div><b>{t(p.title)} <span>× {quantity}</span></b><p>{t(p.subtitle)}</p><button className="inline-link" onClick={() => navigate(`/product/${p.id}`)}>{t("Условия предложения")}</button></div><strong>{t(money(p.price * quantity, p.currency))}</strong></div>)}</section>
      <label className="standalone-field">{t("Комментарий к заказу ")}<span>{t("Необязательно")}</span><textarea rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder={t("Важные детали по вашему заказу")}/></label>
      <label className="confirm-check"><input type="checkbox" checked={useBalance} onChange={e => setUseBalance(e.target.checked)}/><span>{t("Хочу оплатить с баланса магазина")}<small className="form-help balance-payment-help">{t("Продавец проверит баланс и согласует оплату в чате.")}</small></span></label>
      <div className="checkout-total"><span>{t("Итого")}</span><strong>{t(totals.join(' + '))}</strong></div><p className="form-help">{t(totals.length > 1 ? 'Валюты рассчитаны отдельно. Курс и итоговую оплату согласуйте с продавцом.' : 'Наличие и итоговую стоимость подтвердит продавец в чате.')}</p>
      {invalid && <p className="form-failure" role="alert">{t("Количество превышает остаток. Вернитесь в корзину и измените состав заказа.")}</p>}
      <SellerMessage productIds={lines.map(l=>l.product.id)} username={shop.supportTelegram} text={t(cartMessage(lines, note, useBalance))} disabled={invalid}/>
      <p className="fine-print">{t("Корзина сохранится после перехода в чат. Открытие чата и копирование текста не подтверждают отправку сообщения или оплату.")}</p>
    </div>}
  </>;
}

export function RequestCheckoutPage({ product, shop, navigate }: { product: Product; shop: ShopSettings; navigate(path: string): void }) {
  const saved = readLocal<unknown>(`request-handoff:${product.id}`, {});
  const details: Record<string, string> = saved && typeof saved === 'object' && !Array.isArray(saved) && Object.values(saved).every(v => typeof v === 'string') ? saved as Record<string, string> : {};
  let valid = isRequest(product);
  try { validateRequest(product, details); } catch { valid = false; }
  const text = [t(`Здравствуйте! Хочу заказать услугу в фиКУС: ${t(product.title)}`), `${t('Артикул:')} ${product.id}`, '', ...requestFields(product).filter(f => details[f.key]).map(f => `${t(f.label)}: ${details[f.key]}`), '', t('Подтвердите, пожалуйста, стоимость, срок и условия выполнения.')].join('\n');
  return <><div className="page-title"><button className="back-link" onClick={() => navigate(`/product/${product.id}`)}><ArrowLeft size={17}/>{t("К предложению")}</button><h1>{t("Заявка в Telegram")}</h1><p>{t("Условия и оплату согласуем с продавцом в чате.")}</p></div>{valid ? <SellerMessage productIds={[product.id]} username={shop.supportTelegram} text={t(text)}/> : <div className="context-notice"><p>{t("Заполните параметры заявки в карточке предложения.")}</p></div>}</>;
}
