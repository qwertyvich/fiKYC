import { track } from './analytics';
import { t } from './i18n';
import { useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { sellerChatLink } from './seller';
import { telegram } from './telegram';

export function SellerMessage({ username, text, label = 'Открыть чат продавца', disabled = false, productIds = [] }: { productIds?: string[]; username: string; text: string; label?: string; disabled?: boolean }) {
  const [status, setStatus] = useState('');
  const link = sellerChatLink(username, text);
  const tooLong = Array.from(text).length > 4096;
  return <section className="seller-message">
    <label className="standalone-field">{t("Сообщение продавцу")}<textarea readOnly rows={Math.min(12, text.split('\n').length + 1)} value={text} onFocus={e => e.target.select()}/></label>
    <div className="seller-message-actions">
      {link && !disabled ? <a className="primary-button" href={link} target="_blank" rel="noreferrer" onClick={e => { track('seller_open', { productIds }); if (telegram?.initData && telegram.openTelegramLink) { e.preventDefault(); telegram.openTelegramLink(link); } }}><MessageCircle size={18}/>{t(label)}</a> : <button className="primary-button" disabled><MessageCircle size={18}/>{t(disabled ? 'Проверьте состав заказа' : tooLong ? 'Скопируйте длинный заказ' : 'Контакт продавца скоро появится')}</button>}
      <button className="secondary-button" type="button" disabled={disabled} onClick={async () => { try { await navigator.clipboard.writeText(text); track('message_copy', { productIds }); setStatus('Сообщение скопировано. Отправьте его продавцу в Telegram.'); } catch { setStatus('Выделите текст сообщения выше и скопируйте его вручную.'); } }}><Copy size={17}/>{t("Скопировать сообщение")}</button>
    </div>
    <p className="form-help">{t(!link && !tooLong ? 'Контакт продавца пока не указан. Можно подготовить и скопировать сообщение.' : tooLong ? 'Весь заказ не поместится в одно сообщение Telegram. Скопируйте текст и отправьте его частями.' : 'Telegram откроет чат с готовым текстом. Нажмите «Отправить» в чате; оплата и выполнение согласуются с продавцом.')}</p>
    {t(status && <p className="review-success" role="status">{t(status)}</p>)}
  </section>;
}
