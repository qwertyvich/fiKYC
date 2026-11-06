interface TelegramApp {
  colorScheme?: 'light' | 'dark';
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id?: number; first_name: string; username?: string; language_code?: string } };
  ready(): void; expand(): void;
  setHeaderColor(color: string): void; setBackgroundColor(color: string): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: 'light'): void };
  openTelegramLink?(url: string): void;
  onEvent(name: string, cb: () => void): void; offEvent(name: string, cb: () => void): void;
  safeAreaInset?: { top: number; bottom: number };
  contentSafeAreaInset?: { top: number; bottom: number };
}
declare global { interface Window { Telegram?: { WebApp?: TelegramApp } } }
export const telegram = window.Telegram?.WebApp;
export function initTelegram() {
  if (!telegram?.initData) return;
  telegram.ready(); telegram.expand();
  const syncInsets = () => {
    document.documentElement.style.setProperty('--tg-safe-top', `${(telegram.safeAreaInset?.top ?? 0) + (telegram.contentSafeAreaInset?.top ?? 0)}px`);
    document.documentElement.style.setProperty('--tg-safe-bottom', `${Math.max(telegram.safeAreaInset?.bottom ?? 0, telegram.contentSafeAreaInset?.bottom ?? 0)}px`);
  };
  syncInsets();
  telegram.onEvent('safeAreaChanged', syncInsets);
  telegram.onEvent('contentSafeAreaChanged', syncInsets);
}
export function haptic() { if (telegram?.initData) telegram.HapticFeedback?.impactOccurred('light'); }
