import { useEffect, useState } from 'react';
import {
  Save,
  Send,
  Store,
  Palette,
  ShieldCheck,
  BarChart3,
  Info,
  Check,
  RefreshCw,
} from 'lucide-react';
import { offerFor } from '../commerce';
import type { AdminState, SiteSettings } from '../api';
import type { ShopSettings } from '../domain';
import type { SaveState } from './CatalogManager';
import { Toggle, SectionHeading } from './shared';
export function SettingsPage({
  state,
  save,
  busy,
}: {
  state: AdminState;
  save: SaveState;
  busy: boolean;
}) {
  const [settings, setSettings] = useState(() => structuredClone(state.settings)),
    [shop, setShop] = useState(() => structuredClone(state.shop));
  const [saved, setSaved] = useState(false);
  const dirty =
    JSON.stringify(settings) !== JSON.stringify(state.settings) ||
    JSON.stringify(shop) !== JSON.stringify(state.shop);
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
    setSaved(false);
  };
  const setInfo = (k: keyof ShopSettings, v: string) => {
    setShop((s) => ({ ...s, [k]: v }));
    setSaved(false);
  };
  return (
    <form
      className="a-settings-form a-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save({ settings, shop })) setSaved(true);
      }}
    >
      <div className="a-settings-grid">
        <section className="a-card">
          <SectionHeading title="О магазине" description="Контакты и условия для всех покупателей">
            <Store size={20} />
          </SectionHeading>
          <label>
            Telegram продавца
            <input
              value={shop.supportTelegram}
              maxLength={32}
              placeholder="@shop_support"
              onChange={(e) => setInfo('supportTelegram', e.target.value)}
            />
            <small>Куда отправлять покупателей для согласования заказа</small>
          </label>
          <label>
            Часы работы
            <textarea
              rows={3}
              maxLength={5000}
              value={shop.workingHours}
              onChange={(e) => setInfo('workingHours', e.target.value)}
            />
          </label>
          <label>
            Обычное время ответа
            <input
              maxLength={5000}
              value={shop.responseTime}
              placeholder="Например, в течение 15 минут"
              onChange={(e) => setInfo('responseTime', e.target.value)}
            />
          </label>
          <label>
            О магазине
            <textarea
              rows={3}
              maxLength={5000}
              value={shop.about}
              onChange={(e) => setInfo('about', e.target.value)}
            />
          </label>
          <label>
            Общие условия гарантии и возврата
            <textarea
              rows={4}
              maxLength={5000}
              value={shop.refundPolicy}
              onChange={(e) => setInfo('refundPolicy', e.target.value)}
            />
          </label>
        </section>
        <section className="a-card">
          <SectionHeading
            title="Telegram и прямые ссылки"
            description="Можно заполнить перед подключением бота"
          >
            <Send size={20} />
          </SectionHeading>
          <label>
            @username бота
            <input
              maxLength={32}
              placeholder="@your_shop_bot"
              value={settings.botUsername}
              onChange={(e) => set('botUsername', e.target.value)}
            />
            <small>Публичное имя бота, без t.me/</small>
          </label>
          <label>
            Короткое имя Mini App
            <input
              maxLength={64}
              placeholder="Пусто для Main Mini App"
              value={settings.appShortName}
              onChange={(e) => set('appShortName', e.target.value)}
            />
            <small>Заполняется только для именованного Mini App</small>
          </label>
          <div className="a-settings-example">
            <small>Формат ссылки</small>
            <code>
              t.me/{settings.botUsername.replace(/^@/, '') || 'your_bot'}
              {settings.appShortName ? '/' + settings.appShortName : ''}?startapp=p_…
            </code>
          </div>
          <label>
            Username продавца · доступ к панели
            <input
              maxLength={32}
              value={settings.sellerUsername}
              placeholder="@seller_username"
              onChange={(e) => set('sellerUsername', e.target.value)}
            />
            <small>
              Сервер проверяет username в подписанных данных Telegram и привязывает доступ к ID
              первого подтверждённого владельца.
            </small>
          </label>
          <label>
            Telegram ID администраторов
            <input
              maxLength={300}
              value={settings.adminTelegramIds}
              placeholder="123456789, 987654321"
              pattern="[0-9, ]*"
              onChange={(e) => set('adminTelegramIds', e.target.value)}
            />
            <small>Числовые ID через запятую. Вход проверяется сервером.</small>
          </label>
          <div className="a-hint">
            <ShieldCheck size={18} />
            <p>
              Токен бота задаётся в BOT_TOKEN на сервере. Пароль ADMIN_PASSWORD работает только для
              локальной разработки. На рабочем сервере вход — через Telegram продавца.
            </p>
          </div>
        </section>
        <section className="a-card">
          <SectionHeading
            title="Витрина и оформление"
            description="Общие тексты и оформление магазина"
          >
            <Palette size={20} />
          </SectionHeading>
          <p className="a-hint">Тема и язык автоматически выбираются по настройкам Telegram. Покупатель может изменить их в профиле. Вне Telegram тема следует настройкам устройства.</p>
          <label>
            Общий заголовок витрины
            <input
              maxLength={300}
              value={settings.heroTitle}
              onChange={(e) => set('heroTitle', e.target.value)}
            />
          </label>
          <label>
            Короткое описание витрины
            <textarea
              rows={3}
              maxLength={300}
              value={settings.heroSubtitle}
              onChange={(e) => set('heroSubtitle', e.target.value)}
            />
          </label>
          <div className="a-setting-line">
            <span>
              <b>Объявление для всех</b>
              <small>Плашка над каталогом</small>
            </span>
            <Toggle
              checked={settings.announcementEnabled}
              onChange={(v) => set('announcementEnabled', v)}
              label="Показывать объявление"
            />
          </div>
          <label>
            Текст объявления
            <textarea
              rows={3}
              maxLength={1000}
              placeholder="Новости, график работы или важное сообщение"
              value={settings.announcement}
              onChange={(e) => set('announcement', e.target.value)}
            />
          </label>
        </section>
        <section className="a-card">
          <SectionHeading
            title="Отзывы и аналитика"
            description="Как собирать обратную связь и действия"
          >
            <BarChart3 size={20} />
          </SectionHeading>
          <div className="a-setting-line">
            <span>
              <b>Проверять отзывы перед публикацией</b>
              <small>Новые и отредактированные отзывы попадут в очередь</small>
            </span>
            <Toggle
              checked={settings.moderateReviews}
              onChange={(v) => set('moderateReviews', v)}
              label="Проверять отзывы перед публикацией"
            />
          </div>
          <div className="a-setting-line">
            <span>
              <b>Собирать действия покупателей</b>
              <small>Просмотры, активное время, корзина и переходы</small>
            </span>
            <Toggle
              checked={settings.analyticsEnabled}
              onChange={(v) => set('analyticsEnabled', v)}
              label="Собирать аналитику"
            />
          </div>
          <div className="a-info-block">
            <h3>Как читать метрики</h3>
            <p>
              <b>Посетитель</b> — отдельный браузер. <b>Сессия</b> — посещение до 30 минут
              бездействия. <b>Время в карточке</b> — активный просмотр, без фоновой вкладки и
              простоя дольше минуты.
            </p>
            <p>
              Данные появляются примерно через 5–15 секунд и хранятся 180 дней. Обновление графиков
              — каждые 30 секунд. Для пути клиента используется анонимный код браузера.
            </p>
          </div>
          <div className="a-info-block">
            <h3>Общие условия в карточках</h3>
            <p>
              Чтобы заменить гарантию сразу у всех товаров, сохраните общие условия слева и
              примените их кнопкой ниже. Индивидуальные описания и цены сохранятся.
            </p>
            <button
              type="button"
              className="a-btn secondary small"
              disabled={busy || !state.shop.refundPolicy.trim()}
              onClick={() => {
                if (confirm('Заменить поле гарантии у всех товаров общими сохранёнными условиями?'))
                  void save({
                    catalog: {
                      ...state.catalog,
                      products: state.catalog.products.map((p) => ({
                        ...p,
                        offer: { ...offerFor(p), refund: state.shop.refundPolicy },
                      })),
                    },
                  });
              }}
            >
              <RefreshCw size={14} />
              Применить гарантию ко всем товарам
            </button>
          </div>
        </section>
      </div>
      <div className="a-settings-save">
        <p>
          {saved && !dirty ? (
            <>
              <Check size={16} />
              Настройки сохранены
            </>
          ) : dirty ? (
            'Есть несохранённые изменения'
          ) : (
            'Все настройки актуальны'
          )}
        </p>
        <button type="submit" className="a-btn" disabled={busy || !dirty}>
          <Save size={17} />
          {busy ? 'Сохраняем…' : 'Сохранить настройки'}
        </button>
      </div>
    </form>
  );
}
