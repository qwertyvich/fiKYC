import type { Catalog, OfferDetails, Order, OrderStatus, Product, ServiceRequest, ShopSettings } from './domain';

export const statuses: Record<OrderStatus, { title: string; next: string; step: number }> = {
  awaiting_details: { title: 'Нужны уточнения', next: 'Дополните заявку: магазин сможет подтвердить условия после уточнения деталей.', step: 1 },
  awaiting_quote: { title: 'Ожидает согласования', next: 'Здесь появятся подтверждённая стоимость и срок. До согласования ничего оплачивать не нужно.', step: 1 },
  awaiting_payment: { title: 'Ожидает оплаты', next: 'Проверьте состав и итоговую стоимость перед переходом к оплате.', step: 2 },
  processing: { title: 'В работе', next: 'Следите за обновлениями здесь. Если нужны уточнения, магазин добавит их в заказ.', step: 3 },
  completed: { title: 'Готово', next: 'Проверьте результат по инструкции. Если что-то не получается, обратитесь в поддержку с номером заказа.', step: 4 },
  failed: { title: 'Не удалось выполнить', next: 'Свяжитесь с поддержкой, чтобы уточнить причину и дальнейшие действия.', step: -1 },
  cancelled: { title: 'Отменён', next: 'Оформление остановлено. При необходимости можно выбрать предложение снова.', step: -1 },
};
export const statusOf = (o: Order | ServiceRequest): OrderStatus => o.status === 'demo' ? 'awaiting_payment' : o.status === 'demo-request' ? 'awaiting_quote' : o.status;
export const validStatus = (value: unknown) => typeof value === 'string' && (Object.hasOwn(statuses, value) || ['demo', 'demo-request'].includes(value));
export const defaultShop: ShopSettings = { supportTelegram: 'duriv', workingHours: 'Пн 13:00–23:00\nВт 11:00–23:00\nСр–Пт 12:00–23:00\nВс 12:00–23:00\nСуббота и часовой пояс — уточните', responseTime: '', about: '100% гарантия. Доводим до согласованного результата: фиксируем задачу до оплаты и сопровождаем её выполнение.', refundPolicy: '' };
export function parseShop(value: unknown): ShopSettings {
  const s = value as ShopSettings;
  if (!s || !Object.keys(defaultShop).every(k => typeof s[k as keyof ShopSettings] === 'string' && s[k as keyof ShopSettings].length <= 5000)) throw new Error('Проверьте информацию магазина');
  const username = s.supportTelegram.replace(/^@/, '').trim();
  if (username && !/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username)) throw new Error('Укажите Telegram username без ссылки, например @shop_support');
  return { ...s, supportTelegram: username };
}
const copy: Record<string, Partial<OfferDetails>> = {
  'claude-pro': { result: 'Подписка Claude Pro на один месяц.', includes: 'Выбранный тариф Claude Pro. Способ подключения и условия продления уточняются до оплаты.', requirements: 'Уточните, есть ли у вас профиль Claude и активная подписка. Пароли и коды входа в заявке не нужны.', term: '1 месяц' },
  'claude-max': { result: 'Подписка Claude Max на один месяц.', includes: 'Условия выбранного варианта Max согласуются до оплаты. Конкретные лимиты зависят от тарифа сервиса.', requirements: 'Сообщите, какой вариант Max нужен и есть ли действующая подписка.', term: '1 месяц' },
  'claude-setup': { result: 'Помощь с подключением и первоначальной настройкой Claude.', includes: 'Разбор задачи и инструкции для вашего собственного профиля. Подписка не считается включённой, если это отдельно не указано.', requirements: 'Опишите, на каком шаге нужна помощь и какое устройство используете.' },
  'claude-team': { result: 'Помощь с подключением Claude Team для вашей команды.', includes: 'Параметры команды, число участников и состав услуги необходимо подтвердить до оплаты.', requirements: 'Уточните количество участников и наличие рабочего пространства.' },
};
export function offerFor(p: Product): OfferDetails {
  if (p.offer) return p.offer;
  const base: OfferDetails = { result: `${p.title}: ${p.subtitle.replace(/\.$/, '')}.`, includes: p.saleMode === 'request' ? 'Состав услуги подтверждается после проверки ваших параметров. Отправка заявки сама по себе не означает покупку.' : 'Состав предложения уточняется до оплаты. Дополнительные услуги не считаются включёнными автоматически.', requirements: 'Укажите задачу и параметры своего профиля. Не передавайте пароли, одноразовые коды или документы в этой форме.', region: '', term: '', fulfillment: '', refund: '' };
  const byKind: Partial<Record<NonNullable<Product['requestKind']>, Partial<OfferDetails>>> = {
    topup: { result: 'Запрос на оплату или пополнение выбранного зарубежного сервиса.', includes: 'Магазин проверит сервис, регион, сумму и валюту и предложит итоговую стоимость с учётом комиссии.', requirements: 'Нужны название сервиса, его регион, сумма и валюта. Не оплачивайте до подтверждения итоговых условий.' },
    gift: { result: 'Подбор подарочной карты нужного сервиса, региона и номинала.', includes: 'Совместимость карты и способ получения согласуются до оплаты.', requirements: 'Укажите бренд карты, регион вашего профиля, номинал и валюту. Регион карты должен подходить вашему сервису.' },
    verification: { result: 'Помощь с прохождением подтверждения вашего собственного профиля.', includes: 'Разбор доступных шагов и требований конкретного сервиса. Решение о подтверждении принимает сам сервис.', requirements: 'Укажите сервис, страну и этап, на котором возник вопрос. Документы и коды в заявку не прикладывайте.' },
    finance: { result: `Консультация по подключению и настройке собственного профиля ${p.title}.`, includes: 'Разбор доступности сервиса и нужных настроек по вашей задаче. Состав помощи согласуется отдельно.' },
    rental: { result: `Помощь с использованием ${p.title} для запланированной аренды.`, includes: 'Проверка возможности помочь по вашему направлению и датам. Бронирование или аренда не подтверждаются отправкой этой заявки.', requirements: 'Укажите город или страну и даты аренды.' },
    travel: { result: `Помощь с использованием ${p.title} для вашей поездки.`, includes: 'Проверка направления, дат и числа гостей. Заявка не является подтверждением бронирования.', requirements: 'Укажите направление, даты заезда и выезда и число гостей.' },
  };
  const claude: Partial<OfferDetails> = p.brand === 'claude' && !/setup|настрой/i.test(`${p.id} ${p.title}`) ? {
    region: 'Совместимость региона и аккаунта подтверждается до оплаты. Региональные ограничения Anthropic сохраняются.',
    fulfillment: 'Способ подключения, возможность продления и срок выполнения подтверждаются перед оплатой. Доступность автоматического подключения указывается отдельно.',
    requirements: 'Для оформления на ваш аккаунт уточните его возраст, текущий тариф и выбранный способ подключения. Покупка не отменяет возможную проверку личности со стороны Anthropic. Пароли, коды входа и сессионные ключи в форму не вводите.',
    refund: 'Доводим до согласованного результата. Гарантия на подписку относится к преждевременному отключению с переходом на Free в течение оплаченного периода по причинам, не связанным с блокировкой, KYC и региональными ограничениями. Сначала проверяем возможность восстановления. Если оно невозможно, условия возврата или замены согласуются с магазином; уточните их до оплаты. Решения Anthropic о проверках и ограничениях магазин не контролирует.',
  } : {};
  return { ...base, ...(p.requestKind ? byKind[p.requestKind] : {}), ...claude, ...copy[p.id] };
}
export function enrichOffers(c: Catalog): Catalog {
  return { ...c, products: c.products.map(p => ({ ...p, offer: offerFor(p), description: p.description.includes('После подключения магазина здесь будут') ? offerFor(p).result : p.description })) };
}
export const dateTime = (date: string) => new Date(date).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
export function safeWebUrl(url?: string): string | null { try { const u = new URL(url ?? ''); return u.protocol === 'https:' ? u.href : null; } catch { return null; } }
export function supportText(id: string, title: string, topic: string, message: string): string { return `Обращение в фиКУС\n${id ? `Заказ / заявка: ${id}\n` : ''}${title ? `Предложение: ${title}\n` : ''}Тема: ${topic}\n\n${message.trim()}`; }
