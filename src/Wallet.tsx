import { t } from './i18n';
import { useState } from 'react';
import { Plus, WalletCards } from 'lucide-react';
import { money, type ShopSettings } from './domain';
import { SellerMessage } from './SellerMessage';
import { topupMessage } from './seller';
import './wallet.css';

export function Wallet({ shop }: { shop: ShopSettings }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'RUB' | 'USD'>('RUB');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return <section className="wallet-card" aria-labelledby="wallet-heading">
    <div className="wallet-heading"><span><WalletCards size={19}/><h2 id="wallet-heading">{t("Баланс магазина")}</h2></span><span className="demo-badge">{t("Предпросмотр")}</span></div>
    <div className="wallet-amount">{t(money(0))}<span>{t(money(0, 'USD'))}</span></div>
    <p>{t("Ваш баланс для покупок в фиКУСе.")}</p>
    <button className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}><Plus size={17}/>{t(open ? 'Закрыть' : 'Пополнить баланс')}</button>
    <p className="form-help">{t("Учёт средств ещё не подключён. Пополнение и оплату с баланса подтверждает продавец в чате.")}</p>
    {open && <form className="edit-form wallet-topup" noValidate onSubmit={e => { e.preventDefault(); setError(''); try { setMessage(topupMessage(amount, currency)); } catch (err) { setError(err instanceof Error ? err.message : 'Проверьте сумму'); setMessage(''); } }}>
      <div className="form-pair"><label>{t("Сумма пополнения")}<input required inputMode="decimal" value={amount} maxLength={12} placeholder={t("Например, 1000")} aria-invalid={!!error} aria-describedby={error ? 'wallet-amount-error' : undefined} onChange={e => { setAmount(e.target.value); setError(''); setMessage(''); }}/></label><label>{t("Валюта пополнения")}<select value={currency} onChange={e => { setCurrency(e.target.value as 'RUB' | 'USD'); setMessage(''); }}><option value="RUB">RUB · ₽</option><option value="USD">USD · $</option></select></label></div>
      {t(error && <p className="field-error" id="wallet-amount-error" role="alert">{t(error)}</p>)}
      <button className="primary-button" type="submit">{t("Подготовить запрос")}</button>
    </form>}
    {t(open && message && <SellerMessage username={shop.supportTelegram} text={t(message)} label={t("Обсудить пополнение")}/>)}
  </section>;
}
