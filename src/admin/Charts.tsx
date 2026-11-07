import type { AnalyticsData } from '../analytics';
import { number, EmptyState } from './shared';
export function TrendChart({ data }: { data: AnalyticsData['daily'] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.views, d.carts]));
  const width = 700,
    height = 190,
    pad = 8,
    plotHeight = 160;
  const point = (i: number, n: number) =>
    `${pad + (i / Math.max(1, data.length - 1)) * (width - pad * 2)},${plotHeight - (n / max) * (plotHeight - 12)}`;
  const views = data.map((d, i) => point(i, d.views)).join(' '),
    carts = data.map((d, i) => point(i, d.carts)).join(' ');
  const shown =
    data.length <= 8
      ? data
      : data.filter(
          (_, i) => i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0,
        );
  return (
    <div className="a-trend">
      <div className="a-chart-legend">
        <span>
          <i />
          Просмотры
        </span>
        <span>
          <i className="clay" />
          Добавления в корзину
        </span>
        <small>за выбранный период</small>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Динамика просмотров и добавлений в корзину"
      >
        <defs>
          <linearGradient id="a-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--a-green)" stopOpacity=".22" />
            <stop offset="100%" stopColor="var(--a-green)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line
              x1="0"
              x2={width}
              y1={plotHeight - v * (plotHeight - 12)}
              y2={plotHeight - v * (plotHeight - 12)}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <text
              x="0"
              y={plotHeight - v * (plotHeight - 12) - 5}
              fill="var(--muted)"
              fontSize="10"
            >
              {number(max * v)}
            </text>
          </g>
        ))}
        <polygon
          points={`${pad},${plotHeight} ${views} ${width - pad},${plotHeight}`}
          fill="url(#a-chart-fill)"
        />
        <polyline
          points={views}
          fill="none"
          stroke="var(--a-green)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <polyline
          points={carts}
          fill="none"
          stroke="#d68b68"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {data.map((d, i) => (
          <g key={d.date}>
            <circle
              cx={Number(point(i, d.views).split(',')[0])}
              cy={Number(point(i, d.views).split(',')[1])}
              r="4"
              fill="var(--surface)"
              stroke="var(--a-green)"
              strokeWidth="2"
            >
              <title>
                {d.date}: {d.views} просмотров, {d.carts} в корзину, {d.sessions} сессий
              </title>
            </circle>
            <rect
              x={Number(point(i, 0).split(',')[0]) - 8}
              y="0"
              width="16"
              height={plotHeight}
              fill="transparent"
            >
              <title>
                {d.date}: {d.views} просмотров, {d.carts} добавлений
              </title>
            </rect>
          </g>
        ))}
      </svg>
      <div className="a-chart-dates">
        {shown.map((d) => (
          <span key={d.date}>
            {new Date(d.date + 'T12:00:00').toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        ))}
      </div>
      {!data.some((d) => d.views || d.carts) && (
        <div className="a-chart-zero">График оживёт с первыми посетителями</div>
      )}
    </div>
  );
}
export function FunnelChart({ data }: { data: AnalyticsData }) {
  const s = data.summary;
  const items = [
    ['Просмотрели товар', s.views, 'просмотров'],
    ['Добавили в корзину', s.cartAdds, 'добавлений'],
    ['Начали оформление', s.checkoutViews, 'переходов'],
    ['Открыли чат', s.sellerOpens, 'переходов'],
  ] as const;
  const max = Math.max(1, ...items.map((i) => i[1]));
  return (
    <div className="a-funnel">
      {items.map(([label, value, unit], i) => (
        <div key={label}>
          <div>
            <span>
              <i>{i + 1}</i>
              {label}
            </span>
            <strong>{number(value)}</strong>
          </div>
          <div className="a-funnel-track">
            <span style={{ width: `${(value / max) * 100}%`, opacity: 1 - i * 0.16 }} />
          </div>
          <small>{unit}</small>
        </div>
      ))}
      <p>Переход в чат — намерение купить. Оплата здесь не учитывается.</p>
    </div>
  );
}
export function HourChart({ data }: { data: AnalyticsData['hours'] }) {
  const max = Math.max(1, ...data.map((d) => d.events));
  return (
    <div>
      <div className="a-hours">
        {data.map((d) => (
          <div key={d.hour} title={`${d.hour}:00 — ${d.events} действий`}>
            <span style={{ height: `${Math.max(d.events ? 4 : 1, (d.events / max) * 100)}%` }} />
            <small>{d.hour % 4 === 0 ? `${d.hour}:00` : ''}</small>
          </div>
        ))}
      </div>
      <p className="a-note">Время — Москва · учитываются нажатия и переходы</p>
    </div>
  );
}
export function RatingChart({ ratings }: { ratings: number[] }) {
  const max = Math.max(1, ratings.length);
  return (
    <div className="a-ratings">
      {[5, 4, 3, 2, 1].map((r) => (
        <div key={r}>
          <span>{r} ★</span>
          <i>
            <b style={{ width: `${(ratings.filter((n) => n === r).length / max) * 100}%` }} />
          </i>
          <small>{ratings.filter((n) => n === r).length}</small>
        </div>
      ))}
    </div>
  );
}
