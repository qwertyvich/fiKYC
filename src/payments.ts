export interface Payment {
  id: string;
  purpose: 'order' | 'topup';
  provider?:string;
  qr?:{receiptDelivery?:'pending'|'failed'|'sent'|null;status:string;paymentUrl?:string|null;expiresAt?:number|null;externalId?:string;methodCode?:string;methodName?:string;methodDescription?:string;creating?:boolean;error?:boolean;receiptsCount?:number;comment?:string}|null;
  crypto?:{network:'trc20'|'bep20';address:string|null;rate:number;reportedAt:number|null;txid:string;rubCreditMinor?:number}|null;
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

export interface PaymentOptions {card:boolean;russian:boolean;sbp:{available:boolean;configured?:boolean;min?:number|null;max?:number|null;unavailable?:boolean}}
