import type { Catalog, Product, RequestKind, Brand } from './domain';
const service = (id: string, groupId: string, title: string, subtitle: string, brand: Brand, requestKind: RequestKind, aliases = '', description = ''): Product => ({ id, groupId, title, subtitle, brand, requestKind, aliases, description: description || `${subtitle}. Укажите задачу и параметры в заявке. Стоимость, доступность и срок согласуются перед оформлением. Помощь оказывается с вашим собственным профилем.`, price: 0, stock: 0, saleMode: 'request', acceptingRequests: true, badge: groupId === 'gaming' ? '18+' : '', visible: true });
export const serviceGroups: Catalog['groups'] = [
  { id: 'topups', title: 'Пополнения', icon: 'payment', theme: 'fikus', visible: true },
  { id: 'gifts', title: 'Подарочные карты', icon: 'gift', theme: 'fikus', visible: true },
  { id: 'verification', title: 'Верификация', icon: 'verification', theme: 'fikus', visible: true },
  { id: 'exchanges', title: 'Криптобиржи', icon: 'crypto', theme: 'fikus', visible: true },
  { id: 'wallets', title: 'Кошельки и платежи', icon: 'wallet', theme: 'fikus', visible: true },
  { id: 'rental', title: 'Авто и аренда', icon: 'car', theme: 'fikus', visible: true },
  { id: 'travel', title: 'Жильё и путешествия', icon: 'travel', theme: 'fikus', visible: true },
  { id: 'gaming', title: 'Казино и БК · 18+', icon: 'gaming', theme: 'fikus', visible: true },
];
export const serviceProducts: Product[] = [
  service('foreign-topup', 'topups', 'Пополнение зарубежных сервисов', 'Оплата и пополнение · по вашим параметрам', 'payment', 'topup', 'подписки зарубежные оплата'),
  service('gift-cards', 'gifts', 'Подарочные карты', 'Сервис, регион и номинал на выбор', 'gift', 'gift', 'gift card гифт сертификат'),
  service('foreign-verification', 'verification', 'Верификация зарубежных сервисов', 'Помощь с подтверждением своего профиля', 'verification', 'verification', 'KYC вериф'),
  ...[
    ['bitget', 'Bitget', 'битгет'], ['rapira', 'Rapira', 'рапира'], ['emcd', 'EMCD', 'емсд'], ['bybit', 'Bybit', 'байбит байбіт'], ['htx', 'HTX', 'хтх хуоби huobi'],
  ].map(([id, title, aliases]) => service(id, 'exchanges', title, 'Подключение и настройка своего профиля', 'crypto', 'finance', aliases)),
  ...[
    ['wallet', 'Wallet / Walt', 'валлет wallet криптокошелек телеграм walt'], ['kb', 'Crypto Bot', 'кб kb криптобот cryptobot крипто бот'], ['yapay', 'Я Пэй', 'Япэй Яндекс Пэй Yandex Pay'], ['millpay', 'Millpay', 'миллпэй mill pay'], ['altyn', 'Алтын', 'altyn'], ['wallets', 'Кошельки', 'электронный кошелек кошелёк'],
  ].map(([id, title, aliases]) => service(id, 'wallets', title, 'Помощь с подключением и настройкой', 'wallet', 'finance', aliases)),
  ...[
    ['yandex-id', 'Яндекс ID', 'Яндекс id yandex'], ['avito', 'Авито', 'avito'],
  ].map(([id, title, aliases]) => service(id, 'identity', title, 'Помощь с вашим профилем', 'verification', 'profile', aliases)),
  ...[
    ['yandex-drive', 'Яндекс Драйв', 'yandex drive'], ['delimobil', 'Делимобиль', 'delimobil'], ['belkacar', 'BelkaCar', 'белка белкакар'], ['citydrive', 'Ситидрайв', 'citydrive'], ['movly', 'Movly', 'мовли'], ['outdoorsy', 'Outdoorsy', 'аутдорси автодом'], ['bolt-rent', 'Bolt Rent', 'болт аренда'],
  ].map(([id, title, aliases]) => service(id, 'rental', title, 'Помощь с сервисом аренды', 'car', 'rental', aliases)),
  ...[
    ['booking', 'Booking', 'букинг booking.com'], ['rove-travel', 'Rove Travel', 'роув рове'], ['vrbo', 'Vrbo', 'врбо'],
  ].map(([id, title, aliases]) => service(id, 'travel', title, 'Помощь с сервисом бронирования', 'travel', 'travel', aliases)),
  service('casino', 'gaming', 'Казино', 'Консультация по сервисам · 18+', 'gaming', 'general', 'casino', 'Консультация по использованию собственного профиля. Только для совершеннолетних. Доступность и условия согласуются по заявке.'),
  service('bookmakers', 'gaming', 'БК', 'Букмекерские сервисы · 18+', 'gaming', 'general', 'букмекерская контора букмекеры ставки', 'Консультация по использованию собственного профиля. Только для совершеннолетних. Доступность и условия согласуются по заявке.'),
];
export const subscriptionProducts: Product[] = [
  ['chatgpt-plus-cdk', 'ai', 'ChatGPT Plus CDK', 'Код активации', 16, 'chatgpt чат гпт плюс'],
  ['capcut-pro-7d', 'ai', 'CapCut Pro · 7 дней', 'Подписка · 7 дней', 0.5, 'капкат cap cut'],
  ['chatgpt-pro-x20', 'ai', 'ChatGPT Pro x20', 'Тариф x20', 78, 'chat gpt чатгпт про'],
  ['kling-ultra', 'ai', 'Kling AI Ultra', 'Тариф Ultra', 78, 'клинг'],
  ['openwonder', 'ai', 'Open Wonder', 'Подключение сервиса', 58, 'опен вондер'],
  ['higgs-plus-1200', 'ai', 'Higgs Plus · 1.2K', '1 200 кредитов', 25, 'higgsfield хиггс плюс'],
  ['higgs-ultra-6000', 'ai', 'Higgs Ultra · 6K', '6 000 кредитов', 55, 'higgsfield хиггс ультра'],
  ['higgs-ultra-9000', 'ai', 'Higgs Ultra · 9K', '9 000 кредитов', 65, 'higgsfield хиггс ультра'],
  ['higgs-creator-12000', 'ai', 'Higgs Creator · 12K', '12 000 кредитов', 75, 'higgsfield хиггс креатор'],
  ['claude-pro-cdk', 'claude', 'Claude Pro CDK', 'Код активации', 20, 'клод про'],
  ['manus', 'ai', 'Manus', 'Подключение сервиса', 20, 'манус'],
].map(([id, groupId, title, subtitle, price, aliases]) => ({ id: String(id), groupId: String(groupId), title: String(title), subtitle: String(subtitle), price: Number(price), aliases: String(aliases), currency: 'USD', stock: 1, brand: groupId === 'claude' ? 'claude' : 'ai', badge: '', visible: true, description: `${title}. ${subtitle}. Стоимость указана в долларах США. Условия активации и срок действия уточняются перед оформлением.` }));
const item = (id: string, groupId: string, title: string, subtitle: string, price: number, stock: number, brand: Product['brand'], badge = ''): Product => ({ id, groupId, title, subtitle, price, stock, brand, badge, visible: true, description: `${title}. ${subtitle}. Перед оформлением ознакомьтесь с условиями услуги. После подключения магазина здесь будут инструкция, срок выполнения и условия поддержки для выбранного продукта.` });
export const claudeServiceProducts: Product[] = [
  { ...service('claude-kyc', 'claude', 'Верификация KYC на ваш аккаунт', 'Claude · ваш аккаунт', 'claude', 'verification', 'claude клод верификация подтверждение личности KYC', 'Верификация KYC для вашего аккаунта Claude. Укажите текущий этап проверки: стоимость, срок и условия согласуются перед оформлением.'), badge: 'Хит' },
  service('claude-warmed-kyc', 'claude', 'Прогретый аккаунт Claude с KYC', 'Готовый аккаунт · KYC пройдена', 'claude', 'general', 'клод прогретые аккаунты готовый аккаунт пройденная проведенная KYC верификация', 'Продажа прогретого аккаунта Claude с пройденной KYC. Возраст аккаунта, наличие подписки, комплектация, стоимость и условия передачи уточняются до оплаты.'),
];
export const initialCatalog: Catalog = {
  version: 1,
  groups: [
    { id: 'claude', title: 'Claude', icon: 'claude', theme: 'claude', visible: true },
    { id: 'mail', title: 'Почтовые сервисы', icon: 'mail', theme: 'fikus', visible: true },
    { id: 'identity', title: 'ID-сервисы', icon: 'cdek', theme: 'fikus', visible: true },
    { id: 'ai', title: 'AI и работа', icon: 'ai', theme: 'fikus', visible: true },
    ...serviceGroups,
  ],
  products: [
    ...claudeServiceProducts,
    item('claude-pro', 'claude', 'Claude Pro', 'Подписка · 1 месяц', 1990, 24, 'claude', 'Хит'),
    item('claude-max', 'claude', 'Claude Max', 'Подписка · 1 месяц', 7990, 8, 'claude'),
    item('claude-setup', 'claude', 'Настройка Claude', 'Помощь с подключением', 690, 16, 'claude', 'Новое'),
    item('claude-team', 'claude', 'Claude Team', 'Для вашей команды', 2990, 5, 'claude'),
    item('mail-setup', 'mail', 'Почта России', 'Помощь с вашим профилем', 390, 32, 'mail'),
    item('mail-business', 'mail', 'Почта для бизнеса', 'Настройка сервиса', 790, 12, 'mail'),
    item('cdek-id', 'mail', 'СДЭК ID', 'Помощь с вашим профилем', 490, 18, 'cdek', 'Популярное'),
    item('cdek-business', 'mail', 'СДЭК Бизнес', 'Подключение сервиса', 990, 0, 'cdek'),
    item('ai-start', 'ai', 'AI-старт', 'Подбор и настройка AI', 590, 15, 'ai', 'Новое'),
    item('notion-setup', 'ai', 'Notion', 'Настройка пространства', 790, 10, 'notion'),
    item('figma-setup', 'ai', 'Figma', 'Настройка команды', 990, 6, 'figma'),
    item('ai-workflow', 'ai', 'AI для работы', 'Персональная консультация', 1490, 9, 'ai'),
    ...serviceProducts,
    ...subscriptionProducts,
  ],
};

// Append the new assortment once, preserving saved prices, order and hidden groups.
export function expandSavedCatalog(catalog: Catalog): Catalog {
  return { ...catalog,
    groups: [...catalog.groups, ...initialCatalog.groups.filter(g => !catalog.groups.some(old => old.id === g.id))],
    products: [...catalog.products, ...[...serviceProducts, ...subscriptionProducts].filter(p => !catalog.products.some(old => old.id === p.id))],
  };
}

// Add the Claude offers ahead of existing Claude products without resetting
// saved prices, hidden items, other sections, or the operator's custom copy.
export function addClaudeOffers(catalog: Catalog): Catalog {
  const missing = claudeServiceProducts.filter(p => !catalog.products.some(old => old.id === p.id));
  const firstClaude = catalog.products.findIndex(p => p.groupId === 'claude');
  const index = firstClaude < 0 ? catalog.products.length : firstClaude;
  return { ...catalog, products: [...catalog.products.slice(0, index), ...missing.map(p => ({ ...p })), ...catalog.products.slice(index)] };
}
