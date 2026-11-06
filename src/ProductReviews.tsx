import { useRef, useState } from 'react';
import { MessageCircle, Star, Users } from 'lucide-react';
import type { Product } from './domain';
import { telegram } from './telegram';
import { averageRating, localReviewId, saveReview, useReviews } from './review-store';
import './reviews.css';

export function ProductStats({ product, onReviews }: { product: Product; onReviews?(): void }) {
  const reviews = useReviews(product.id);
  const average = averageRating(reviews);
  const rating = <><Star size={14} fill={average ? 'currentColor' : 'none'}/><span>{average ? <><b>{average}</b> <span className="rating-count">({reviews.length})</span></> : 'Нет оценок'}</span></>;
  return <div className="product-stats">
    {onReviews ? <button className="rating-summary" onClick={onReviews} aria-label={average ? `Средняя оценка ${average} из 5, отзывов: ${reviews.length}. Читать отзывы` : 'Нет оценок. Перейти к отзывам'}>{rating}</button> : <span className="rating-summary" aria-label={average ? `Средняя оценка ${average} из 5, отзывов: ${reviews.length}` : 'Нет оценок'}>{rating}</span>}
    <span className="buyer-count"><Users size={14}/><span>Покупателей: {product.buyerCount?.toLocaleString('ru-RU') ?? '—'}</span></span>
  </div>;
}

export function Reviews({ product }: { product: Product }) {
  const reviews = useReviews(product.id);
  const own = reviews.find(r => r.id === localReviewId(product.id));
  const average = averageRating(reviews);
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState(own?.author ?? telegram?.initDataUnsafe?.user?.first_name ?? '');
  const [rating, setRating] = useState(own?.rating ?? 0);
  const [text, setText] = useState(own?.text ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState('');
  const [showAll, setShowAll] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const prefix = `review-${product.id}`;
  return <section className="offer-block reviews-section" id="product-reviews" aria-labelledby={`${prefix}-heading`}>
    <div className="reviews-heading"><h2 id={`${prefix}-heading`}>Отзывы <span>{reviews.length}</span></h2><button className="inline-link" onClick={() => { setOpen(!open); setSuccess(''); }}>{open ? 'Закрыть форму' : own ? 'Изменить отзыв' : 'Оставить отзыв'}</button></div>
    <div className="reviews-overview"><strong>{average ?? '—'}</strong><div><span className="review-stars" role="img" aria-label={average ? `${average} из 5` : 'Оценок пока нет'}>{[1,2,3,4,5].map(n => <Star key={n} size={18} fill={average && n <= Math.round(reviews.reduce((s,r) => s + r.rating, 0) / reviews.length) ? 'currentColor' : 'none'}/>)}</span><p>{average ? 'Средняя оценка из 5' : 'Пока без оценок'}</p></div></div>
    <p className="form-help reviews-local-note">Отзывы в предпросмотре видны только в этом браузере. Покупки авторов не проверены.</p>
    {open && <form className="edit-form review-form" ref={form} noValidate onSubmit={e => {
      e.preventDefault(); setFailure(''); setSuccess('');
      const next: Record<string, string> = {};
      if (!author.trim() || author.trim().length > 60) next.author = 'Укажите имя, до 60 символов';
      if (rating < 1 || rating > 5) next.rating = 'Выберите оценку от 1 до 5';
      if (!text.trim() || text.trim().length > 2000) next.text = 'Напишите отзыв, до 2000 символов';
      setErrors(next);
      if (Object.keys(next).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
      try { saveReview(product.id, author, rating, text); setOpen(false); setSuccess('Отзыв сохранён в этом браузере.'); }
      catch { setFailure('Не удалось сохранить отзыв. Проверьте доступ к хранилищу браузера и попробуйте ещё раз.'); }
    }}>
      <label htmlFor={`${prefix}-author`}>Ваше имя<input id={`${prefix}-author`} autoComplete="given-name" required maxLength={60} value={author} onChange={e => { setAuthor(e.target.value); setErrors(prev => ({ ...prev, author: '' })); }} aria-invalid={!!errors.author} aria-describedby={errors.author ? `${prefix}-author-error` : undefined}/>{errors.author && <span className="field-error" id={`${prefix}-author-error`}>{errors.author}</span>}</label>
      <fieldset className="rating-field"><legend>Ваша оценка</legend><div className="rating-options">{[1,2,3,4,5].map(n => <label key={n} className={n <= rating ? 'filled' : ''}><input type="radio" name={`${prefix}-rating`} value={n} checked={rating === n} onChange={() => { setRating(n); setErrors(prev => ({ ...prev, rating: '' })); }} aria-label={`${n} из 5`} aria-invalid={!!errors.rating} aria-describedby={errors.rating ? `${prefix}-rating-error` : undefined}/><Star size={26} fill={n <= rating ? 'currentColor' : 'none'}/></label>)}</div>{errors.rating && <p className="field-error" id={`${prefix}-rating-error`}>{errors.rating}</p>}</fieldset>
      <label htmlFor={`${prefix}-text`}><span id={`${prefix}-text-label`}>Ваш отзыв</span><textarea aria-labelledby={`${prefix}-text-label`} id={`${prefix}-text`} required rows={4} maxLength={2000} placeholder="Расскажите, как всё прошло" value={text} onChange={e => { setText(e.target.value); setErrors(prev => ({ ...prev, text: '' })); }} aria-invalid={!!errors.text} aria-describedby={errors.text ? `${prefix}-text-error` : undefined}/>{errors.text && <span className="field-error" id={`${prefix}-text-error`}>{errors.text}</span>}<span className="review-counter">{text.length} / 2000</span></label>
      {failure && <p className="form-failure" role="alert">{failure}</p>}
      <button className="primary-button" type="submit">{own ? 'Сохранить изменения' : 'Сохранить отзыв'}</button>
    </form>}
    {success && <p className="review-success" role="status">{success}</p>}
    {reviews.length ? <div className="review-list">{(showAll ? reviews : reviews.slice(0, 5)).map(r => <article className="review-card" key={r.id}><div className="review-card-heading"><div className="review-avatar" aria-hidden="true">{Array.from(r.author)[0]}</div><div><b>{r.author}</b><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleDateString('ru-RU')}</time></div>{r.id === own?.id && <span className="own-review">Ваш отзыв</span>}</div><span className="review-stars" role="img" aria-label={`${r.rating} из 5`}>{[1,2,3,4,5].map(n => <Star key={n} size={15} fill={n <= r.rating ? 'currentColor' : 'none'}/>)}</span><p>{r.text}</p></article>)}{reviews.length > 5 && <button className="inline-link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Свернуть отзывы' : `Показать все отзывы (${reviews.length})`}</button>}</div> : <div className="reviews-empty"><MessageCircle size={26}/><b>Здесь будет первый отзыв</b><p>Поделитесь впечатлениями об этом предложении.</p></div>}
  </section>;
}
