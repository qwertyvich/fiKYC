# Подключение к панели ботов

## 1. Разместить frontend

Собрать `npm ci && npm run build`, загрузить содержимое `dist/` на HTTPS-домен. `vite.config.ts` использует относительный `base: './'`; сборка также преобразует ссылки на локальные шрифты и favicon в относительные. Можно размещать в корне или подпапке, сохранив структуру `dist/`.

Навигация через hash (`#/catalog`, `#/group/claude`, `#/product/claude-pro`, `#/cart`, `#/orders`, `#/profile`) не требует серверного SPA fallback. Настроить Main Mini App или именованное Mini App в BotFather. Без bot token и адреса панели в этой поставке реальный бот не настраивался.

## 2. Заменить адаптер

В `src/store.ts` экспортируется `store: StoreAdapter`:

```ts
interface StoreAdapter {
  loadCatalog(): Promise<Catalog>;
  saveCatalog(catalog: Catalog): Promise<void>;
  createOrder(lines: { productId: string; quantity: number }[]): Promise<Order>;
  loadOrders(): Promise<Order[]>;
}
```

Рекомендуемое соответствие существующей панели:

| Метод | Endpoint | Проверки на сервере |
| --- | --- | --- |
| `loadCatalog` | `GET /api/catalog` | Только доступные покупателю данные |
| `saveCatalog` | `PUT /api/admin/catalog` | Авторизация оператора, валидация, версия/конфликт изменений |
| `createOrder` | `POST /api/orders` | Telegram-пользователь, остатки, текущая цена, идемпотентность |
| `loadOrders` | `GET /api/orders` | Только заказы текущего пользователя |

Отправлять исходную строку `window.Telegram.WebApp.initData` в заголовке `Authorization: tma <initData>` либо обменивать её на сессию. Формат заголовка — договорённость вашего API. На сервере проверить подпись по официальному алгоритму, допустимый возраст `auth_date` и права пользователя. `initDataUnsafe`, query string, цена из браузера и localStorage не являются подтверждением личности, прав, оплаты или остатка.

Пример транспорта (endpoint и формат сессии адаптировать к панели):

```ts
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `tma ${window.Telegram?.WebApp?.initData ?? ''}`,
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error('Не удалось выполнить запрос');
  return response.json() as Promise<T>;
}
```

Для сохранения каталога сервер должен повторить валидацию; `parseCatalog` в браузере улучшает UX импорта, но не заменяет серверную проверку. Уберите `/admin` из покупательской сборки или подключите проверку прав и защищённые endpoints панели.

## 3. Каталог, порядок и темы

`Catalog.version = 1`. Типы находятся в `src/domain.ts`; полный JSON-пример — рядом, `catalog.example.json`.

`groups[]`:

- `id` — стабильный идентификатор группы.
- `title`, `icon`, `theme: 'fikus' | 'claude'`, `visible`.
- Положение в массиве — ручной порядок групп.

`products[]`:

- `id`, `groupId`, `title`, `subtitle`, `description` — обычный текст, не HTML.
- `price` — число рублей, `stock` — целый неотрицательный остаток.
- `brand` — ключ иллюстрации (`claude`, `mail`, `cdek`, `ai`, `figma`, `notion`).
- `badge`, `visible`.
- Порядок товаров внутри группы определяется их положением в массиве.

Удалять временную группу не требуется: выставьте `visible=false`. Товары сохранятся, но исчезнут из поиска, каталога и корзины. Карточки по прямым ссылкам станут недоступны. Для нового направления добавьте группу и товары; новая иллюстрация добавляется в `visuals.tsx`, палитра — в `styles.css`.

Тема выбирается функцией `themeFor(lockedEntryTheme, currentGroup)`:

| Вход | Раздел Claude / его товар | Другой раздел / корзина / профиль |
| --- | --- | --- |
| Обычный | Claude | фиКУС |
| `klod` или `claude` | Claude | Claude |

Параметр входа влияет только на оформление раздела и стартовый экран. Он не предоставляет скидки, права или доступ к данным. Для новых воронок расширьте `entryTheme` и начальный маршрут. Сейчас поддержаны два визуальных направления, каждое работает в светлом и тёмном режимах.

Атрибут `html[data-theme]` задаёт бренд (`fikus` / `claude`), `html[data-mode]` — яркость (`light` / `dark`). Выбор режима сохраняется в `localStorage['fikus:appearance']` как JSON-строка `light`, `dark` или `auto`. По умолчанию — `dark`; `auto` следует Telegram `colorScheme` или `prefers-color-scheme`. Палитры вынесены в `src/themes.css`. фиКУС использует нейтрали Higgsfield и лайм; Claude — собственные тёплые нейтрали и Clay из официального CSS claude.com. Telegram header/background и meta theme-color синхронизируются с фактическим фоном текущей палитры.

Палитра основывается на токенах CSS [официального Higgsfield](https://higgsfield.ai/): `--color-lime: #d1fe17`, `--color-page-primary: #131517`, `--color-surface-primary: #1c1e20`, `--color-btn-accent-text: #131517`. Светлая палитра — собственная адаптация для фиКУСа.

Палитра Claude проверена отдельно по [официальному claude.com](https://claude.com/) и [руководству Anthropic](https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md). Карта значений, источники и выгрузка CSS-токенов сохранены в [references/CLAUDE-PALETTE.md](references/CLAUDE-PALETTE.md).

## 4. Оплата и выдача

Сейчас заказ имеет `status: 'demo'`; в интерфейсе явно написано, что оплаты и выдачи нет. Для боевой версии расширьте `Order` и добавьте реальные статусы (`pending_payment`, `paid`, `processing`, `delivered`, `cancelled`), платежный адаптер и обработку webhook. Итоговую цену, выдачу и подтверждение платежа контролирует сервер. Состояние корзины из браузера — только список ID и количеств.

После серверного создания заказа добавьте переход к оплате (например, через Telegram `openInvoice` при выбранном способе оплаты) и обновление статуса с сервера; клиентский callback сам по себе не подтверждает оплату. Способ оплаты и условия цифровых товаров определяет владелец с учётом актуальных требований платформы.

Для настоящей доставки нужны выбранный способ выдачи, безопасное хранилище, история статусов и поддержка. Эти части не имитируются готовой выдачей в интерфейсе.

## 5. Материалы и приёмка

Персонажи — временные SVG с CSS-анимацией. Оригинальные фото персонажей/анимации не были доступны в исходной папке; там были только 3 скрина mrkt. Для GIF/WebP/Lottie замените `Mascot`, сохраняя `theme` как входной параметр. Цвета обеих тем вынесены в CSS-переменные. Локальные шрифты Geologica поставлены с OFL.

Проверить на реальных iOS/Android Telegram после подключения: системные отступы, BackButton, открытие `startapp=klod`, сохранение темы при переходах, авторизацию, оплату, возврат после оплаты и выдачу. Текущие автоматические проверки относятся к локальному frontend и не подтверждают работу реального бота.

Официальные источники: [Telegram Mini Apps](https://core.telegram.org/bots/webapps), [Direct links](https://core.telegram.org/bots/webapps#direct-link-mini-apps), [Validating initData](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app), [Telegram Stars](https://core.telegram.org/bots/payments-stars).
