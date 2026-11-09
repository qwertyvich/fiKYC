import { useState } from 'react';
import {
  Link2,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  MessageCircle,
  Star,
  Send,
  ExternalLink,
} from 'lucide-react';
import { api, mutation, type AdminState } from '../api';
import type { Review } from '../review-store';
import { RatingChart } from './Charts';
import {
  SearchBox,
  Toggle,
  Badge,
  EmptyState,
  Drawer,
  dateTime,
  copyText,
  SectionHeading,
} from './shared';
export interface ProductLink {
  id: string;
  productId: string;
  label: string;
  active: boolean;
  createdAt: number;
  url: string | null;
  startParam: string;
  opens: number;
}
export function LinksManager({
  state,
  links,
  reload,
  productId,
  onProduct,
  notify,
}: {
  state: AdminState;
  links: ProductLink[];
  reload(): Promise<void>;
  productId: string;
  onProduct(id: string): void;
  notify(message: string): void;
}) {
  const [label, setLabel] = useState(''),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const selected = state.catalog.products.find((p) => p.id === productId);
  async function create() {
    setBusy(true);
    setError('');
    try {
      await mutation('/admin/links', 'POST', { productId, label });
      await reload();
      setLabel('');
      notify('Ссылка создана — можно копировать и отправлять');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(link: ProductLink, active: boolean) {
    setBusy(true);
    try {
      await mutation('/admin/links/' + link.id, 'PATCH', { active });
      await reload();
      notify(active ? 'Ссылка включена' : 'Ссылка отключена');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = links.filter(
    (l) =>
      (!productId || l.productId === productId) &&
      `${l.label} ${state.catalog.products.find((p) => p.id === l.productId)?.title}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <section className="a-link-intro">
        <span className="a-link-intro-icon">
          <Link2 size={26} />
        </span>
        <div>
          <h2>Короткий путь к нужному товару</h2>
          <p>
            Создайте ссылку, отправьте клиенту или разместите в своём канале. Она откроет карточку
            прямо в боте. Ссылки не отображаются в магазине.
          </p>
        </div>
      </section>
      <section className="a-card">
        <SectionHeading
          title="Создать прямую ссылку"
          description="Можно сделать несколько ссылок на один товар и сравнить источники"
        />
        <form
          className="a-link-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label>
            Товар
            <select
              required
              aria-label="Товар для ссылки"
              value={productId}
              onChange={(e) => onProduct(e.target.value)}
            >
              <option value="">Выберите товар</option>
              {state.catalog.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {!p.visible ? ' · скрыт' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Название / источник
            <input
              maxLength={100}
              placeholder="Например, личный чат или канал"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <button className="a-btn" disabled={busy || !productId || !state.settings.botUsername}>
            <Plus size={17} />
            Создать ссылку
          </button>
        </form>
        {!state.settings.botUsername && (
          <p className="a-warning">
            Укажите @username бота в разделе «Настройки → Telegram». После этого генерация станет
            доступна.
          </p>
        )}
        {selected &&
          (!selected.visible ||
            !state.catalog.groups.find((g) => g.id === selected.groupId)?.visible) && (
            <p className="a-warning">
              Этот товар скрыт. Ссылка начнёт открывать карточку после включения товара и его
              категории.
            </p>
          )}
        {error && (
          <p role="alert" className="a-error">
            {error}
          </p>
        )}
      </section>
      <div className="a-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Поиск по ссылкам…" />
        {productId && (
          <button className="a-btn secondary" onClick={() => onProduct('')}>
            Показать все товары
          </button>
        )}
        <span className="a-note">{filtered.length} ссылок</span>
      </div>
      <div className="a-links-list">
        {filtered.map((link) => (
          <section
            key={link.id}
            className={`a-card a-link-card ${!link.active ? 'is-hidden' : ''}`}
          >
            <header>
              <span className="a-link-symbol">
                <Link2 size={19} />
              </span>
              <div>
                <h3>{link.label}</h3>
                <p>
                  {state.catalog.products.find((p) => p.id === link.productId)?.title ??
                    'Товар удалён'}
                </p>
              </div>
              <Toggle
                checked={link.active}
                onChange={(v) => void toggle(link, v)}
                label={`Включить ссылку ${link.label}`}
                disabled={busy}
              />
            </header>
            <div className="a-url">
              <code>{link.url ?? 'Для ссылки нужно настроить бота'}</code>
              <button
                className="a-icon"
                disabled={!link.url}
                aria-label={`Скопировать ${link.label}`}
                onClick={() =>
                  void copyText(link.url!)
                    .then(() => notify('Ссылка скопирована'))
                    .catch(() => setError('Не удалось скопировать. Выделите ссылку вручную.'))
                }
              >
                <Copy size={16} />
              </button>
            </div>
            <footer>
              <Badge tone={link.active ? 'green' : 'neutral'}>
                {link.active ? 'Активна' : 'Отключена'}
              </Badge>
              <span>
                <Eye size={14} />
                {link.opens} переходов
              </span>
              <small>{dateTime(link.createdAt)}</small>
            </footer>
          </section>
        ))}
      </div>
      {!filtered.length && (
        <section className="a-card">
          <EmptyState title="Ссылок пока нет">
            Выберите товар выше и создайте первую ссылку. У каждой будет свой случайный код и
            счётчик переходов.
          </EmptyState>
        </section>
      )}
      <p className="a-note">
        Ссылка работает для любого, кому её передали. Отключение сразу закрывает переход по этому
        коду. Mini App должен быть настроен в BotFather.
      </p>
    </>
  );
}
export function ReviewsManager({
  state,
  reviews,
  reload,
  notify,
}: {
  state: AdminState;
  reviews: Review[];
  reload(): Promise<void>;
  notify(message: string): void;
}) {
  const [status, setStatus] = useState('pending'),
    [product, setProduct] = useState('all'),
    [query, setQuery] = useState(''),
    [editing, setEditing] = useState<Review | null>(null),
    [reply, setReply] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const published = reviews.filter((r) => r.status === 'published' && !r.scheduled);
  const avg = published.length
    ? (published.reduce((s, r) => s + r.rating, 0) / published.length).toFixed(1).replace('.', ',')
    : '—';
  const inStatus = (r: Review, key: string) => key === 'all' || (key === 'scheduled' ? r.scheduled : key === 'published' ? r.status === 'published' && !r.scheduled : r.status === key);
  const filtered = reviews.filter(
    (r) =>
      inStatus(r, status) &&
      (product === 'all' || r.productId === product) &&
      `${r.author} ${r.text}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function update(review: Review, next: Review['status'], text = review.reply) {
    setBusy(true);
    setError('');
    try {
      await mutation('/admin/reviews/' + review.id, 'PATCH', { status: next, reply: text });
      await reload();
      setEditing(null);
      notify('Изменения отзыва сохранены');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="a-review-overview">
        <section className="a-card">
          <span className="a-note">Оценка магазина по опубликованным отзывам</span>
          <div className="a-rating-number">
            {avg}
            <Star size={28} fill="currentColor" />
          </div>
          <p>
            {published.length} опубликованных ·{' '}
            {reviews.filter((r) => r.status === 'pending').length} ждут проверки
          </p>
        </section>
        <section className="a-card">
          <RatingChart ratings={published.map((r) => r.rating)} />
        </section>
      </div>
      <div className="a-tabs" role="group" aria-label="Статус отзывов">
        {(
          [
            ['pending', 'На проверке'],
            ['published', 'Опубликованы'],
            ['scheduled', 'Запланированы'],
            ['hidden', 'Скрыты'],
            ['all', 'Все'],
          ] as const
        ).map(([key, title]) => (
          <button
            className={status === key ? 'active' : ''}
            aria-pressed={status === key}
            key={key}
            onClick={() => setStatus(key)}
          >
            {title}
            <span>{reviews.filter((r) => inStatus(r, key)).length}</span>
          </button>
        ))}
      </div>
      <div className="a-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Найти отзыв или автора…" />
        <select
          className="a-select"
          aria-label="Товар в отзывах"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        >
          <option value="all">Все товары</option>
          {state.catalog.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="a-error" role="alert">
          {error}
        </p>
      )}
      <div className="a-moderation-list">
        {filtered.map((review) => (
          <article className="a-card a-review-card" key={review.id}>
            <header>
              <span className="a-client-avatar">{Array.from(review.author)[0]}</span>
              <div>
                <b>{review.author}</b>
                <small>{dateTime(review.createdAt)}{review.source === 'telegram' && ' · Из Telegram'}</small>
              </div>
              <Badge
                tone={
                  review.status === 'published'
                    ? 'green'
                    : review.status === 'pending'
                      ? 'orange'
                      : 'neutral'
                }
              >
                {review.status === 'published'
                  ? (review.scheduled ? 'Запланирован' : 'Опубликован')
                  : review.status === 'pending'
                    ? 'На проверке'
                    : 'Скрыт'}
              </Badge>
            </header>
            <div className="a-review-product">
              {state.catalog.products.find((p) => p.id === review.productId)?.title ??
                'Товар удалён'}
            </div>
            <div className="a-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={15} fill={n <= review.rating ? 'currentColor' : 'none'} />
              ))}
            </div>
            <p className="a-review-text">{review.text}</p>
            {review.reply && (
              <div className="a-reply">
                <b>Ответ магазина</b>
                <p>{review.reply}</p>
              </div>
            )}
            <footer>
              {review.status !== 'published' && (
                <button
                  className="a-btn small"
                  disabled={busy}
                  onClick={() => void update(review, 'published')}
                >
                  <Check size={15} />
                  Опубликовать
                </button>
              )}
              {review.status !== 'hidden' && (
                <button
                  className="a-btn secondary small"
                  disabled={busy}
                  onClick={() => void update(review, 'hidden')}
                >
                  <EyeOff size={15} />
                  Скрыть
                </button>
              )}
              <button
                className="a-link"
                onClick={() => {
                  setEditing(review);
                  setReply(review.reply);
                }}
              >
                <MessageCircle size={15} />
                {review.reply ? 'Изменить ответ' : 'Ответить'}
              </button>
            </footer>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <section className="a-card">
          <EmptyState title={status === 'pending' ? 'Всё проверено' : 'Отзывов пока нет'}>
            {status === 'pending'
              ? 'Новые отзывы покупателей появятся здесь.'
              : 'Попробуйте другой фильтр или дождитесь первого отзыва.'}
          </EmptyState>
        </section>
      )}
      {editing && (
        <Drawer title="Ответ на отзыв" onClose={() => setEditing(null)}>
          <form
            className="a-form"
            onSubmit={(e) => {
              e.preventDefault();
              void update(editing, editing.status, reply);
            }}
          >
            <div className="a-reply-source">
              <b>
                {editing.author} · {editing.rating} ★
              </b>
              <p>{editing.text}</p>
            </div>
            <label>
              Ответ магазина
              <textarea
                rows={6}
                maxLength={2000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Поблагодарите покупателя или помогите решить вопрос"
              />
            </label>
            <p className="a-note">
              Текст покупателя и оценка сохраняются без изменений. Ответ виден под опубликованным
              отзывом.
            </p>
            <footer className="a-drawer-footer">
              <button className="a-btn" type="submit" disabled={busy}>
                <Send size={16} />
                Сохранить ответ
              </button>
            </footer>
          </form>
        </Drawer>
      )}
    </>
  );
}
