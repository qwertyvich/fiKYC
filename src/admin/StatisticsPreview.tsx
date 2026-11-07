import { useMemo } from 'react';
import type { Catalog } from '../domain';
import { demoStatistics } from './demo-statistics';
import { Drawer, Badge } from './shared';
export function StatisticsPreview({ catalog, onClose }: { catalog: Catalog; onClose(): void }) {
  const rows = useMemo(() => demoStatistics(catalog.products.map((p) => p.id)), [catalog]);
  const bins = Array.from({ length: 8 }, (_, i) => ({
    from: 30 + i * 20,
    to: Math.min(190, 49 + i * 20),
    count: 0,
  }));
  for (const r of rows) {
    bins[Math.min(7, Math.floor((r.buyerCount - 30) / 20))].count++;
  }
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <Drawer
      title="Демопредпросмотр показателей"
      subtitle="Пример распределения для всех товаров"
      onClose={onClose}
    >
      <div className="a-form a-demo-statistics">
        <div className="a-warning">
          <b>Демонстрационные данные</b>
          <p>
            Случайные показатели показаны только здесь. Они не публикуются в магазине и не заменяют
            отзывы или подтверждённые покупки.
          </p>
        </div>
        <p className="a-note">
          Покупатели: нормальное распределение, центр 110, диапазон 30–190. Оценки: 4,9 у{' '}
          {rows.filter((r) => r.rating === 4.9).length} товаров, 5,0 у остальных{' '}
          {rows.filter((r) => r.rating === 5).length} — ближайшее целое соотношение к 80/20.
        </p>
        <div
          className="a-demo-histogram"
          role="img"
          aria-label="Распределение демонстрационного числа покупателей"
        >
          {bins.map((b) => (
            <div key={b.from} title={`${b.from}–${b.to}: ${b.count} товаров`}>
              <b>{b.count}</b>
              <i style={{ height: Math.max(2, (b.count / max) * 110) }} />
              <small>
                {b.from}–{b.to}
              </small>
            </div>
          ))}
        </div>
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Покупатели · демо</th>
                <th>Оценка · демо</th>
              </tr>
            </thead>
            <tbody>
              {catalog.products.map((p) => {
                const r = rows.find((r) => r.id === p.id)!;
                return (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{r.buyerCount}</td>
                    <td>
                      <Badge tone="green">{r.rating.toFixed(1).replace('.', ',')} ★</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
}
