import { getLocale } from './i18n.ts';
import { t } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Star, Users } from 'lucide-react';
import type { Product } from './domain';
import { telegram } from './telegram';
import { averageRating, useOwnReview, saveReview, useReviews } from './review-store';
import './reviews.css';

export function ProductStats({ product, onReviews }: { product: Product; onReviews?(): void }) {
  const reviews = useReviews(product.id);
  const importedMark = product.channelStats?.mark;
  const average = importedMark != null ? importedMark.toLocaleString('ru-RU', {minimumFractionDigits:1,maximumFractionDigits:1}) : averageRating(reviews);
  const rating = <><Star size={14} fill={average ? 'currentColor' : 'none'}/><span>{t(average ? <><b>{t(average)}</b> <span className="rating-count">{importedMark != null ? 'Telegram' : `(${reviews.length})`}</span></> : 'Нет оценок')}</span></>;
  return <div className="product-stats">
    {onReviews ? <button className="rating-summary" onClick={onReviews} aria-label={t(average ? `${importedMark != null ? 'Оценка в Telegram' : 'Средняя оценка'} ${average} из 5, опубликованных отзывов: ${reviews.length}. Читать отзывы` : 'Нет оценок. Перейти к отзывам')}>{rating}</button> : <span className="rating-summary" aria-label={t(average ? `${importedMark != null ? 'Оценка в Telegram' : 'Средняя оценка'} ${average} из 5, опубликованных отзывов: ${reviews.length}` : 'Нет оценок')}>{rating}</span>}
    <span className="buyer-count" title={product.channelStats ? "Покупатели из Telegram-канала магазина" : undefined}><Users size={14}/><span>{t("Покупателей: ")}{t(product.buyerCount?.toLocaleString(getLocale()) ?? '—')}{product.channelStats && <small> · Telegram</small>}</span></span>
  </div>;
}

export function Reviews({ product }: { product: Product }) {
  const reviews = useReviews(product.id);
  const own = useOwnReview(product.id);
  const average = averageRating(reviews);
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState(own?.author ?? telegram?.initDataUnsafe?.user?.first_name ?? '');
  const [rating, setRating] = useState(own?.rating ?? 0);
  const [text, setText] = useState(own?.text ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState('');
  const [showAll, setShowAll] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (own && !open) { setAuthor(own.author); setRating(own.rating); setText(own.text); } }, [own?.updatedAt, open]);
  const prefix = `review-${product.id}`;
  return <section className="offer-block reviews-section" id="product-reviews" aria-labelledby={`${prefix}-heading`}>
    <div className="reviews-heading"><h2 id={`${prefix}-heading`}>{t("Отзывы ")}<span>{reviews.length}</span></h2><button className="inline-link" onClick={() => { setOpen(!open); setSuccess(''); }}>{t(open ? 'Закрыть форму' : own ? 'Изменить отзыв' : 'Оставить отзыв')}</button></div>
    <div className="reviews-overview"><strong>{t(average ?? '—')}</strong><div><span className="review-stars" role="img" aria-label={t(average ? `${average} из 5` : 'Оценок пока нет')}>{[1,2,3,4,5].map(n => <Star key={n} size={18} fill={average && n <= Math.round(reviews.reduce((s,r) => s + r.rating, 0) / reviews.length) ? 'currentColor' : 'none'}/>)}</span><p>{t(average ? 'Средняя оценка из 5' : 'Пока без оценок')}</p></div></div>
    {product.channelStats?.mark != null && <p className="form-help">Оценка в Telegram-канале: <b>{product.channelStats.mark.toLocaleString('ru-RU')}</b> из 5. Средняя оценка выше рассчитана по опубликованным здесь отзывам.</p>}
    <p className="form-help reviews-local-note">{t("Отзывы публикуются после проверки магазином. Покупки авторов не проверены.")}</p>
    {own && own.status !== 'published' && <p className="form-help">{own.status === 'pending' ? 'Ваш отзыв ожидает проверки.' : 'Ваш отзыв скрыт модератором.'}</p>}
    {open && <form className="edit-form review-form" ref={form} noValidate onSubmit={async e => {
      e.preventDefault(); if (pending) return; setFailure(''); setSuccess('');
      const next: Record<string, string> = {};
      if (!author.trim() || author.trim().length > 60) next.author = 'Укажите имя, до 60 символов';
      if (rating < 1 || rating > 5) next.rating = 'Выберите оценку от 1 до 5';
      if (!text.trim() || text.trim().length > 2000) next.text = 'Напишите отзыв, до 2000 символов';
      setErrors(next);
      if (Object.keys(next).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
      try { setPending(true); const saved = await saveReview(product.id, author, rating, text); setOpen(false); setSuccess(saved.status === 'pending' ? 'Отзыв отправлен на проверку.' : 'Отзыв опубликован.'); }
      catch { setFailure('Не удалось сохранить отзыв. Проверьте соединение и попробуйте ещё раз.'); } finally { setPending(false); }
    }}>
      <label htmlFor={`${prefix}-author`}>{t("Ваше имя")}<input id={`${prefix}-author`} autoComplete="given-name" required maxLength={60} value={author} onChange={e => { setAuthor(e.target.value); setErrors(prev => ({ ...prev, author: '' })); }} aria-invalid={!!errors.author} aria-describedby={errors.author ? `${prefix}-author-error` : undefined}/>{t(errors.author && <span className="field-error" id={`${prefix}-author-error`}>{t(errors.author)}</span>)}</label>
      <fieldset className="rating-field"><legend>{t("Ваша оценка")}</legend><div className="rating-options">{[1,2,3,4,5].map(n => <label key={n} className={n <= rating ? 'filled' : ''}><input type="radio" name={`${prefix}-rating`} value={n} checked={rating === n} onChange={() => { setRating(n); setErrors(prev => ({ ...prev, rating: '' })); }} aria-label={t(`${n} из 5`)} aria-invalid={!!errors.rating} aria-describedby={errors.rating ? `${prefix}-rating-error` : undefined}/><Star size={26} fill={n <= rating ? 'currentColor' : 'none'}/></label>)}</div>{t(errors.rating && <p className="field-error" id={`${prefix}-rating-error`}>{t(errors.rating)}</p>)}</fieldset>
      <label htmlFor={`${prefix}-text`}><span id={`${prefix}-text-label`}>{t("Ваш отзыв")}</span><textarea aria-labelledby={`${prefix}-text-label`} id={`${prefix}-text`} required rows={4} maxLength={2000} placeholder={t("Расскажите, как всё прошло")} value={text} onChange={e => { setText(e.target.value); setErrors(prev => ({ ...prev, text: '' })); }} aria-invalid={!!errors.text} aria-describedby={errors.text ? `${prefix}-text-error` : undefined}/>{t(errors.text && <span className="field-error" id={`${prefix}-text-error`}>{t(errors.text)}</span>)}<span className="review-counter">{text.length} / 2000</span></label>
      {t(failure && <p className="form-failure" role="alert">{t(failure)}</p>)}
      <button className="primary-button" type="submit" disabled={pending}>{t(own ? 'Сохранить изменения' : 'Сохранить отзыв')}</button>
    </form>}
    {t(success && <p className="review-success" role="status">{t(success)}</p>)}
    {reviews.length ? <div className="review-list">{(showAll ? reviews : reviews.slice(0, 5)).map(r => <article className="review-card" key={r.id}><div className="review-card-heading"><div className="review-avatar" aria-hidden="true">{Array.from(r.author)[0]}</div><div><b>{r.author}</b>{r.source === 'telegram' && <small className="review-source">Из Telegram</small>}<time dateTime={r.createdAt}>{t(new Date(r.createdAt).toLocaleString(getLocale(), {timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}))} МСК</time></div>{r.id === own?.id && <span className="own-review">{t("Ваш отзыв")}</span>}</div><span className="review-stars" role="img" aria-label={t(`${r.rating} из 5`)}>{[1,2,3,4,5].map(n => <Star key={n} size={15} fill={n <= r.rating ? 'currentColor' : 'none'}/>)}</span><p>{r.text}</p>{r.reply && <div className="review-reply"><b>Ответ магазина</b><p>{r.reply}</p></div>}</article>)}{reviews.length > 5 && <button className="inline-link" onClick={() => setShowAll(!showAll)}>{t(showAll ? 'Свернуть отзывы' : `Показать все отзывы (${reviews.length})`)}</button>}</div> : <div className="reviews-empty"><MessageCircle size={26}/><b>{t("Здесь будет первый отзыв")}</b><p>{t("Поделитесь впечатлениями об этом предложении.")}</p></div>}
  </section>;
}
