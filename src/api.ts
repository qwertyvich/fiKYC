import type { Catalog, ShopSettings } from './domain';
export interface SiteSettings {
  botUsername: string;
  appShortName: string;
  adminTelegramIds: string;
  defaultAppearance: 'light' | 'dark' | 'auto';
  heroTitle: string;
  heroSubtitle: string;
  announcement: string;
  announcementEnabled: boolean;
  analyticsEnabled: boolean;
  moderateReviews: boolean;
}
export interface AdminState {
  revision: number;
  catalog: Catalog;
  shop: ShopSettings;
  settings: SiteSettings;
}
export interface PublicState {
  revision: number;
  catalog: Catalog;
  shop: ShopSettings;
  settings: Omit<SiteSettings, 'botUsername' | 'appShortName' | 'adminTelegramIds'>;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({ error: 'Сервер недоступен' }));
  if (!res.ok) throw new ApiError(data.error ?? 'Не удалось выполнить запрос', res.status);
  return data as T;
}
export const mutation = <T>(path: string, method: string, data: unknown) =>
  api<T>(path, { method, body: JSON.stringify(data) });
let publicRequest: Promise<PublicState> | null = null;
export function loadPublic(fresh = false) {
  if (fresh || !publicRequest)
    publicRequest = api<PublicState>('/public').catch((e) => {
      publicRequest = null;
      throw e;
    });
  return publicRequest;
}
export function invalidatePublic() {
  publicRequest = null;
}
