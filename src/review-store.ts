import { useSyncExternalStore } from 'react';

export interface Review {
  id: string;
  productId: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

const key = 'fikus:reviews:v1';
const event = 'fikus:reviews-changed';
let cachedRaw: string | null | undefined;
let cached: Review[] = [];

function readReviews(): Review[] {
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { return cached; }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const data: unknown = JSON.parse(raw ?? '[]');
    const ids = new Set<string>();
    cached = Array.isArray(data) ? data.filter((r): r is Review => {
      if (!r || typeof r.id !== 'string' || !r.id || ids.has(r.id) || typeof r.productId !== 'string' || !r.productId || typeof r.author !== 'string' || !r.author.trim() || r.author.length > 60 || !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5 || typeof r.text !== 'string' || !r.text.trim() || r.text.length > 2000 || typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt)) || !Number.isFinite(Date.parse(r.updatedAt))) return false;
      ids.add(r.id); return true;
    }) : [];
  } catch { cached = []; }
  return cached;
}

function subscribe(listener: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) listener(); };
  window.addEventListener(event, listener);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(event, listener); window.removeEventListener('storage', onStorage); };
}

export function useReviews(productId: string) {
  return useSyncExternalStore(subscribe, readReviews).filter(r => r.productId === productId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function averageRating(reviews: Review[]) {
  return reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
}

export function localReviewId(productId: string) { return `local:${productId}`; }

export function saveReview(productId: string, author: string, rating: number, text: string) {
  if (!author.trim() || author.trim().length > 60 || !text.trim() || text.trim().length > 2000 || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Проверьте имя, оценку и текст отзыва.');
  const all = readReviews();
  const id = localReviewId(productId);
  const previous = all.find(r => r.id === id && r.productId === productId);
  const now = new Date().toISOString();
  const review: Review = { id, productId, author: author.trim(), rating, text: text.trim(), createdAt: previous?.createdAt ?? now, updatedAt: now };
  // Publish the new snapshot only after persistence succeeds.
  localStorage.setItem(key, JSON.stringify([review, ...all.filter(r => r.id !== id)]));
  window.dispatchEvent(new Event(event));
}
