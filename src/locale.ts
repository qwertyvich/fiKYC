export const languages = ['ru', 'en', 'zh', 'fa'] as const;
export type Language = typeof languages[number];
export type LanguageChoice = Language | 'auto';
export const isLanguage = (value: unknown): value is Language => languages.includes(value as Language);
export const isLanguageChoice = (value: unknown): value is LanguageChoice => value === 'auto' || isLanguage(value);
export function telegramLanguage(code?: string, fallbackCode?: string): Language {
  const base = (code || fallbackCode)?.toLowerCase().split(/[-_]/)[0];
  return isLanguage(base) ? base : 'ru';
}
export const languageStorageKey = (id?: number) => `fikus:language:v1:${id === undefined ? 'guest' : `tg:${id}`}`;
export const languageTag = (language: Language) => ({ ru: 'ru-RU', en: 'en-US', zh: 'zh-CN', fa: 'fa-IR' })[language];
