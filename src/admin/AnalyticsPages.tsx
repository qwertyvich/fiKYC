import { useState } from 'react';
import {
  ArrowUpRight,
  Users,
  MousePointer2,
  ShoppingBag,
  Clock3,
  ChevronRight,
  Download,
  Activity,
  Eye,
  CircleHelp,
} from 'lucide-react';
import type { Catalog } from '../domain';
import { eventLabels, type AnalyticsData, type EventType } from '../analytics';
import { TrendChart, FunnelChart, HourChart } from './Charts';
import { number, seconds, dateTime, EmptyState, Badge, SectionHeading, Pager } from './shared';
export function MetricCards({ data }: { data: AnalyticsData }) {
  const s = data.summary;
  return (
    <div className="a-metrics">
      {[
        {
          label: 'Посетители',
          value: number(s.visitors),
          note: `${number(s.sessions)} сессий за период`,
          icon: Users,
          color: 'green',
        },
        {
          label: 'Просмотры товаров',
          value: number(s.views),
          note: `${number(s.clicks)} нажатий в каталоге`,
          icon: MousePointer2,
          color: 'clay',
        },
        {
          label: 'Добавления в корзину',
          value: number(s.cartAdds),
          note: `${number(s.conversion)}% сессий с просмотром`,
          icon: ShoppingBag,
          color: 'purple',
        },
        {
          label: 'Время в карточке',
          value: seconds(s.averageSeconds),
          note: 'В среднем · активный просмотр',
          icon: Clock3,
          color: 'sand',
        },
      ].map((m) => (
        <section className="a-metric" key={m.label}>
          <div>
            <span>{m.label}</span>
            <i className={m.color}>
              <m.icon size={19} />
            </i>
          </div>
          <strong>{m.value}</strong>
          <p>{m.note}</p>
        </section>
      ))}
    </div>
  );
}
export function ProductReport({
  data,
  catalog,
  onSelect,
}: {
  data: AnalyticsData;
  catalog: Catalog;
  onSelect?(id: string): void;
}) {
  return (
    <div className="a-table-wrap">
      <table className="a-table">
        <thead>
          <tr>
            <th>Товар</th>
            <th>Просмотры</th>
            <th>Нажатия</th>
            <th>В корзину</th>
            <th>Ср. время</th>
          </tr>
        </thead>
        <tbody>
          {data.products.slice(0, 30).map((p, i) => (
            <tr key={p.productId}>
              <td>
                <button className="a-product-name" onClick={() => onSelect?.(p.productId)}>
                  <span className="a-rank">{i + 1}</span>
                  <span>
                    <b>
                      {catalog.products.find((c) => c.id === p.productId)?.title ??
                        'Удалённый товар'}
                    </b>
                    <small>{p.visitors} посетителей</small>
                  </span>
                </button>
              </td>
              <td>{number(p.views)}</td>
              <td>{number(p.clicks)}</td>
              <td>
                <Badge tone={p.cartAdds ? 'green' : 'neutral'}>{p.cartAdds}</Badge>
              </td>
              <td>{seconds(p.averageSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.products.length && (
        <EmptyState title="Здесь будут популярные товары">
          Когда покупатели откроют карточки, вы увидите просмотры, нажатия и интерес к каждому
          предложению.
        </EmptyState>
      )}
    </div>
  );
}
function exportEvents(data: AnalyticsData, catalog: Catalog) {
  const escape = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [
    ['Время', 'Клиент', 'Сессия', 'Действие', 'Товар', 'Количество', 'Активные секунды'],
    ...data.events.map((e) => [
      new Date(e.at).toISOString(),
      e.visitorId,
      e.sessionId,
      eventLabels[e.type],
      catalog.products.find((p) => p.id === e.productId)?.title ?? e.productId,
      e.quantity,
      e.type === 'product_view' ? e.activeSeconds : '',
    ]),
  ];
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(escape).join(';')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fikus-actions.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Overview({
  data,
  catalog,
  onEdit,
  onAnalytics,
}: {
  data: AnalyticsData;
  catalog: Catalog;
  onEdit(id: string): void;
  onAnalytics(): void;
}) {
  return (
    <>
      <section className="a-welcome">
        <div>
          <span className="a-eyebrow">
            <i />
            ВАШ МАГАЗИН, КАК НА ЛАДОНИ
          </span>
          <h2>
            Всё под контролем<span>.</span>
          </h2>
          <p>
            От первого нажатия до корзины — следите за тем,
            <br className="a-desktop-break" /> что интересно вашим покупателям.
          </p>
          <button className="a-btn dark" onClick={onAnalytics}>
            Смотреть действия <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="a-welcome-art">
          <span className="a-orbit o1" />
          <span className="a-orbit o2" />
          <img src={`${import.meta.env.BASE_URL}ficus-mascot.png`} alt="" />
          <span className="a-art-tag">
            <span />
            Магазин растёт
          </span>
          <span className="a-art-count">
            <b>
              {
                catalog.products.filter(
                  (p) => p.visible && catalog.groups.some((g) => g.visible && g.id === p.groupId),
                ).length
              }
            </b>
            товаров на витрине
          </span>
        </div>
      </section>
      <MetricCards data={data} />
      <div className="a-chart-grid">
        <section className="a-card">
          <SectionHeading
            title="Как меняется интерес"
            description="Просмотры карточек и добавления в корзину"
          />
          <TrendChart data={data.daily} />
        </section>
        <section className="a-card">
          <SectionHeading
            title="Путь к покупке"
            description="Что делают посетители после открытия"
          />
          <FunnelChart data={data} />
        </section>
      </div>
      <section className="a-card a-no-padding">
        <div className="a-card-padding">
          <SectionHeading
            title="Товары в центре внимания"
            description="Какие предложения чаще открывают"
          >
            <button className="a-link" onClick={onAnalytics}>
              Вся аналитика <ChevronRight size={15} />
            </button>
          </SectionHeading>
        </div>
        <ProductReport data={data} catalog={catalog} onSelect={onEdit} />
      </section>
      <div className="a-explainer">
        <CircleHelp size={17} />
        <p>
          Показываем реальные действия. Время считается, пока карточка открыта и приложение активно;
          после минуты бездействия счётчик приостанавливается. Действия администратора исключены.
        </p>
      </div>
    </>
  );
}
export function ActivityPage({
  data,
  catalog,
  selectedSession,
  onSession,
  onEventPage,
  onSessionPage,
}: {
  data: AnalyticsData;
  catalog: Catalog;
  selectedSession: string;
  onSession(id: string): void;
  onEventPage(page: number): void;
  onSessionPage(page: number): void;
}) {
  const [type, setType] = useState('all');
  const events = data.events.filter((e) => type === 'all' || e.type === type);
  return (
    <>
      <div className="a-split">
        <section className="a-card a-session-card">
          <SectionHeading
            title="Сессии посетителей"
            description="Выберите сессию, чтобы увидеть её путь"
          />
          <button
            className={`a-session ${!selectedSession ? 'active' : ''}`}
            onClick={() => onSession('')}
          >
            <Activity size={18} />
            <div>
              <b>Все посетители</b>
              <small>Общий поток действий</small>
            </div>
          </button>
          {data.sessions.map((s) => (
            <button
              key={s.sessionId}
              className={`a-session ${selectedSession === s.sessionId ? 'active' : ''}`}
              onClick={() => onSession(s.sessionId)}
            >
              <span className="a-client-avatar">{s.visitorId.slice(0, 2).toUpperCase()}</span>
              <div>
                <b>Клиент {s.visitorId.slice(0, 6)}</b>
                <small>
                  {dateTime(s.lastAt)} · {s.events} действий
                </small>
                <small>
                  {s.views} карточек · {s.cartAdds} в корзину · {seconds(s.activeMs / 1000)}
                </small>
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
          <Pager
            page={data.pagination.sessionPage}
            pages={data.pagination.sessionPages}
            onPage={onSessionPage}
          />
          {!data.sessions.length && (
            <EmptyState title="Пока тихо">Здесь появятся сессии посетителей.</EmptyState>
          )}
        </section>
        <section className="a-card">
          <SectionHeading
            title="Лента действий"
            description={
              selectedSession ? 'Путь выбранной сессии' : 'Последние 200 действий за период'
            }
          >
            <button className="a-btn secondary small" onClick={() => exportEvents(data, catalog)}>
              <Download size={15} />
              CSV
            </button>
          </SectionHeading>
          <select
            className="a-select"
            aria-label="Фильтр действий"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">Все действия</option>
            {Object.entries(eventLabels)
              .filter(([k]) => k !== 'product_time')
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
          <div className="a-timeline">
            {events.map((e) => (
              <article key={e.id}>
                <i className={e.type.includes('cart') ? 'green' : ''}>
                  {e.type.includes('cart') ? (
                    <ShoppingBag size={15} />
                  ) : e.type === 'product_view' ? (
                    <Eye size={15} />
                  ) : (
                    <MousePointer2 size={15} />
                  )}
                </i>
                <div>
                  <b>{eventLabels[e.type]}</b>
                  {e.productId && (
                    <p>
                      {catalog.products.find((p) => p.id === e.productId)?.title ?? e.productId}
                      {e.quantity > 0 && ` · ${e.quantity} шт.`}
                    </p>
                  )}
                  <small>
                    Клиент {e.visitorId.slice(0, 6)} · {dateTime(e.at)}
                  </small>
                  {e.type === 'product_view' && (
                    <Badge tone="green">Активный просмотр: {seconds(e.activeSeconds)}</Badge>
                  )}
                  {e.type === 'link_open' && <Badge>По прямой ссылке</Badge>}
                </div>
              </article>
            ))}
          </div>
          <Pager
            page={data.pagination.eventPage}
            pages={data.pagination.eventPages}
            onPage={onEventPage}
          />
          {!events.length && (
            <EmptyState title="Действий пока нет">
              Откройте магазин в другом браузере — ваши действия появятся здесь после обновления.
            </EmptyState>
          )}
          <p className="a-note">
            Посетители обозначены анонимным кодом браузера. Один человек с разных устройств может
            учитываться несколько раз. Данные хранятся 180 дней.
          </p>
        </section>
      </div>
    </>
  );
}
export function AnalyticsPage({
  data,
  catalog,
  onEdit,
}: {
  data: AnalyticsData;
  catalog: Catalog;
  onEdit(id: string): void;
}) {
  return (
    <>
      <MetricCards data={data} />
      <div className="a-chart-grid">
        <section className="a-card">
          <SectionHeading
            title="Интерес по дням"
            description="Наведите на точку графика, чтобы увидеть значения"
          />
          <TrendChart data={data.daily} />
        </section>
        <section className="a-card">
          <SectionHeading title="От просмотра к действию" />
          <FunnelChart data={data} />
        </section>
      </div>
      <section className="a-card">
        <SectionHeading
          title="В какое время магазин активнее"
          description="Распределение действий по часам"
        />
        <HourChart data={data.hours} />
      </section>
      <section className="a-card a-no-padding">
        <div className="a-card-padding">
          <SectionHeading
            title="Подробно по товарам"
            description="Просмотр карточки и нажатие на товар учитываются отдельно"
          />
        </div>
        <ProductReport data={data} catalog={catalog} onSelect={onEdit} />
      </section>
    </>
  );
}
