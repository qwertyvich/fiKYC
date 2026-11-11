import en from './locales/en.json' with { type: 'json' };
import zh from './locales/zh.json' with { type: 'json' };
import fa from './locales/fa.json' with { type: 'json' };
import { isLanguageChoice, languageStorageKey, languageTag, telegramLanguage, type Language, type LanguageChoice } from './locale.ts';

const dictionaries: Record<Exclude<Language, 'ru'>, Record<string, string>> = { en, zh, fa };
let language: Language = 'ru';
let choice: LanguageChoice = 'auto';
let account: number | undefined;
let accountLanguage: string | undefined;
const listeners = new Set<() => void>();
export const subscribeLanguage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getLanguage = () => language;
export const getLanguageChoice = () => choice;
export const getLocale = () => languageTag(language);

function applyLanguage() {
  const browserLanguage = typeof window !== 'undefined' ? window.navigator?.language : undefined;
  language = choice === 'auto' ? telegramLanguage(accountLanguage, browserLanguage) : choice;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.title = `фиКУС · ${t('Маркет')}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('Сервисы для ваших задач. Поддержка до результата.'));
  }
  listeners.forEach(listener => listener());
}
export function initLanguage(user?: { id?: number; language_code?: string }) {
  account = user?.id; accountLanguage = user?.language_code;
  choice = 'auto';
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(languageStorageKey(account)) ?? 'null');
    if (isLanguageChoice(saved)) choice = saved;
  } catch { /* Use Telegram's language if storage is blocked or corrupted. */ }
  applyLanguage();
}
export function setLanguageChoice(value: LanguageChoice) {
  if (!isLanguageChoice(value)) return;
  choice = value;
  try { localStorage.setItem(languageStorageKey(account), JSON.stringify(value)); } catch { /* Session-only preference. */ }
  applyLanguage();
}
export function refreshTelegramLanguage(code?: string) {
  if (code === accountLanguage) return;
  accountLanguage = code;
  if (choice === 'auto') applyLanguage();
}

// Source-language keys keep original catalog values intact for editing and stock logic.
// Interpolation patterns translate dynamic UI copy without translating entered form data.
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.keys(en).filter(key => /\{\{\d+\}\}/.test(key)).sort((a, b) => b.replace(/\{\{\d+\}\}/g, '').length - a.replace(/\{\{\d+\}\}/g, '').length).map(key => ({
  key, regex: new RegExp('^' + key.split(/\{\{\d+\}\}/).map(escape).join('([\\s\\S]*?)') + '$'),
  slots: [...key.matchAll(/\{\{(\d+)\}\}/g)].map(match => match[1]),
}));
export function t<T>(value: T): T {
  if (language === 'ru' || typeof value !== 'string') return value;
  const dictionary = dictionaries[language];
  const translate = (source: string): string => {
    if (dictionary[source]) return dictionary[source];
    for (const { key, regex, slots } of patterns) {
      const match = regex.exec(source);
      if (match && dictionary[key]) {
        const values = Object.fromEntries(slots.map((slot, index) => [slot, dictionary[match[index + 1]] ?? match[index + 1]]));
        return dictionary[key].replace(/\{\{(\d+)\}\}/g, (_, slot: string) => values[slot] ?? '');
      }
    }
    return source;
  };
  const trimmed = value.trim();
  const translated = translate(trimmed);
  return (translated === trimmed ? value : value.replace(trimmed, () => translated)) as T;
}
