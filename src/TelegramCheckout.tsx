import { t } from './i18n';
import { ArrowLeft } from 'lucide-react';
import { isRequest, requestFields, validateRequest, type Product, type ShopSettings } from './domain';
import { readLocal } from './store';
import { SellerMessage } from './SellerMessage';

export { CardCheckout as CheckoutPage } from './PaymentFlow';

export function RequestCheckoutPage({ product, shop, navigate }: { product: Product; shop: ShopSettings; navigate(path: string): void }) {
  const saved = readLocal<unknown>(`request-handoff:${product.id}`, {});
  const details: Record<string, string> = saved && typeof saved === 'object' && !Array.isArray(saved) && Object.values(saved).every(v => typeof v === 'string') ? saved as Record<string, string> : {};
  let valid = isRequest(product);
  try { validateRequest(product, details); } catch { valid = false; }
  const text = [t(`Здравствуйте! Хочу заказать услугу в фиКУС: ${t(product.title)}`), `${t('Артикул:')} ${product.id}`, '', ...requestFields(product).filter(f => details[f.key]).map(f => `${t(f.label)}: ${details[f.key]}`), '', t('Подтвердите, пожалуйста, стоимость, срок и условия выполнения.')].join('\n');
  return <><div className="page-title"><button className="back-link" onClick={() => navigate(`/product/${product.id}`)}><ArrowLeft size={17}/>{t("К предложению")}</button><h1>{t("Заявка в Telegram")}</h1><p>{t("Условия и оплату согласуем с продавцом в чате.")}</p></div>{valid ? <SellerMessage productIds={[product.id]} username={shop.supportTelegram} text={t(text)}/> : <div className="context-notice"><p>{t("Заполните параметры заявки в карточке предложения.")}</p></div>}</>;
}
