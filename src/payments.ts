export interface Payment {
  id: string;
  purpose: 'order' | 'topup';
  items: { productId: string; title: string; quantity: number; price: number; currency: 'RUB' | 'USD' }[];
  amount: number;
  currency: 'RUB' | 'USD';
  status: 'awaiting_transfer' | 'awaiting_receipt' | 'invalidated' | 'manual_review' | 'receipt_review' | 'paid' | 'superseded';
  reason: string;
  createdAt: number;
  expiresAt: number | null;
  serverNow: number;
  card: { number: string; bank: string; holder: string } | null;
  receiptCount: number;
  deliveryPending: boolean;
}
export const paymentTitles: Record<Payment['status'], string> = {
  awaiting_transfer: 'Ожидаем перевод', awaiting_receipt: 'Ожидаем квитанцию', invalidated: 'Реквизиты больше недоступны', manual_review: 'Поможем с оплатой', receipt_review: 'Проверяем оплату', paid: 'Оплата подтверждена', superseded: 'Выданы новые реквизиты',
};
