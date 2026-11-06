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
    <div className="wallet-heading"><span><WalletCards size={19}/><h2 id="wallet-heading">Баланс магазина</h2></span><span className="demo-badge">Предпросмотр</span></div>
    <div className="wallet-amount">{money(0)}<span>{money(0, 'USD')}</span></div>
    <p>Ваш баланс для покупок в фиКУСе.</p>
    <button className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}><Plus size={17}/>{open ? 'Закрыть' : 'Пополнить баланс'}</button>
    <p className="form-help">Учёт средств ещё не подключён. Пополнение и оплату с баланса подтверждает продавец в чате.</p>
    {open && <form className="edit-form wallet-topup" noValidate onSubmit={e => { e.preventDefault(); setError(''); try { setMessage(topupMessage(amount, currency)); } catch (err) { setError(err instanceof Error ? err.message : 'Проверьте сумму'); setMessage(''); } }}>
      <div className="form-pair"><label>Сумма пополнения<input required inputMode="decimal" value={amount} maxLength={12} placeholder="Например, 1000" aria-invalid={!!error} aria-describedby={error ? 'wallet-amount-error' : undefined} onChange={e => { setAmount(e.target.value); setError(''); setMessage(''); }}/></label><label>Валюта пополнения<select value={currency} onChange={e => { setCurrency(e.target.value as 'RUB' | 'USD'); setMessage(''); }}><option value="RUB">RUB · ₽</option><option value="USD">USD · $</option></select></label></div>
      {error && <p className="field-error" id="wallet-amount-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit">Подготовить запрос</button>
    </form>}
    {open && message && <SellerMessage username={shop.supportTelegram} text={message} label="Обсудить пополнение"/>}
  </section>;
}
