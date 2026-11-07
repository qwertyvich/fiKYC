import { useEffect, useState } from 'react';
import { Ban, Plus, Trash2, ShieldCheck, UserRound } from 'lucide-react';
import { api, mutation } from '../api';
import { Toggle, SearchBox, Badge, EmptyState, dateTime, SectionHeading } from './shared';
interface Entry {
  id: string;
  type: 'id' | 'username';
  value: string;
  note: string;
  active: boolean;
  createdAt: number;
}
export function BlacklistManager({ notify }: { notify(message: string): void }) {
  const [items, setItems] = useState<Entry[]>([]),
    [value, setValue] = useState(''),
    [note, setNote] = useState(''),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const load = async () => {
    setItems(await api<Entry[]>('/admin/blacklist'));
    setLoading(false);
  };
  useEffect(() => {
    void load().catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, []);
  async function change(path: string, method: string, data: unknown, message: string) {
    setBusy(true);
    setError('');
    try {
      await mutation(path, method, data);
      await load();
      notify(message);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const filtered = items.filter((i) =>
    `${i.value} ${i.note}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <section className="a-link-intro">
        <span className="a-link-intro-icon">
          <Ban size={26} />
        </span>
        <div>
          <h2>Доступ под вашим контролем</h2>
          <p>
            Добавьте username или Telegram ID. Этот пользователь увидит аккуратный экран технических
            работ вместо магазина.
          </p>
        </div>
      </section>
      <section className="a-card">
        <SectionHeading
          title="Добавить в чёрный список"
          description="Telegram ID надёжнее: он сохраняется при смене username"
        />
        <form
          className="a-link-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await change(
                '/admin/blacklist',
                'POST',
                { value, note },
                'Пользователь добавлен в чёрный список',
              )
            ) {
              setValue('');
              setNote('');
            }
          }}
        >
          <label>
            Username или Telegram ID
            <input
              required
              maxLength={40}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="@username или 123456789"
            />
          </label>
          <label>
            Заметка для себя
            <input
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Не видна пользователю"
            />
          </label>
          <button type="submit" className="a-btn" disabled={busy || !value.trim()}>
            <Plus size={16} />
            Добавить
          </button>
        </form>
        <div className="a-hint" style={{ marginTop: 16, marginBottom: 0 }}>
          <ShieldCheck size={17} />
          <p>
            Проверка выполняется сервером по подтверждённым данным Telegram. Продавца заблокировать
            нельзя. В рабочей версии магазин открывается через Telegram.
          </p>
        </div>
      </section>
      {error && (
        <p role="alert" className="a-error">
          {error}
        </p>
      )}
      <div className="a-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Поиск по чёрному списку…" />
        <span className="a-note">
          Активно: {items.filter((i) => i.active).length} · всего: {items.length}
        </span>
      </div>
      <section className="a-card a-no-padding">
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Заметка</th>
                <th>Добавлен</th>
                <th>Блокировка</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <b>
                      {item.type === 'username' ? '@' : ''}
                      {item.value}
                    </b>
                    <small className="a-table-note">
                      {item.type === 'username' ? 'Telegram username' : 'Telegram ID'}
                    </small>
                  </td>
                  <td>
                    <span className="a-blacklist-note">{item.note || '—'}</span>
                  </td>
                  <td>{dateTime(item.createdAt)}</td>
                  <td>
                    <Toggle
                      checked={item.active}
                      disabled={busy}
                      label={`Блокировать ${item.value}`}
                      onChange={(active) =>
                        void change(
                          '/admin/blacklist/' + item.id,
                          'PATCH',
                          { active },
                          active ? 'Блокировка включена' : 'Доступ восстановлен',
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="a-icon"
                      aria-label={`Удалить ${item.value} из списка`}
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            'Удалить запись из чёрного списка? Доступ пользователя будет восстановлен.',
                          )
                        )
                          void change(
                            '/admin/blacklist/' + item.id,
                            'DELETE',
                            {},
                            'Запись удалена',
                          );
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && !loading && (
          <EmptyState title={items.length ? 'Ничего не найдено' : 'Чёрный список пуст'}>
            {items.length
              ? 'Измените поисковый запрос.'
              : 'Добавленные пользователи появятся здесь. Блокировку можно отключить одним нажатием.'}
          </EmptyState>
        )}
      </section>
    </>
  );
}
