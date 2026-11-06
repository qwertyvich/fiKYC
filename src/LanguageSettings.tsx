import { useSyncExternalStore } from 'react';
import { getLanguageChoice, setLanguageChoice, subscribeLanguage, t } from './i18n';
import { type LanguageChoice } from './locale';

export function LanguageSettings() {
  const choice = useSyncExternalStore(subscribeLanguage, getLanguageChoice);
  return <section className="appearance-settings language-settings">
    <h3><label htmlFor="interface-language">{t('Язык интерфейса')}</label></h3>
    <select id="interface-language" value={choice} onChange={event => setLanguageChoice(event.target.value as LanguageChoice)}>
      <option value="auto">{t('Как в Telegram')}</option>
      <option value="ru" lang="ru">Русский</option>
      <option value="en" lang="en">English</option>
      <option value="zh" lang="zh">简体中文</option>
      <option value="fa" lang="fa">فارسی</option>
    </select>
    <p>{t('По умолчанию используется язык Telegram. Ваш выбор сохраняется отдельно для этого аккаунта на этом устройстве.')}</p>
  </section>;
}
