import { useSyncExternalStore } from 'react';
import { api, mutation } from './api';
export interface Review {
  id: string;
  productId: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
  updatedAt: string;
  status: 'published' | 'hidden' | 'pending';
  reply: string;
  own?: boolean;
}
let cached: Review[] = [];
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const snapshot = () => cached;
export async function refreshReviews() {
  cached = await api<Review[]>('/reviews');
  listeners.forEach((fn) => fn());
}
export function useReviews(productId: string) {
  return useSyncExternalStore(subscribe, snapshot).filter(
    (r) => r.productId === productId && r.status === 'published',
  );
}
export function useOwnReview(productId: string) {
  return useSyncExternalStore(subscribe, snapshot).find((r) => r.productId === productId && r.own);
}
export function averageRating(reviews: Review[]) {
  return reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toLocaleString('ru-RU', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    : null;
}
export async function saveReview(productId: string, author: string, rating: number, text: string) {
  const review = await mutation<Review>('/reviews', 'POST', { productId, author, rating, text });
  cached = [review, ...cached.filter((r) => r.id !== review.id)];
  listeners.forEach((fn) => fn());
  return review;
}
