import { useState,useSyncExternalStore } from 'react';
import {mutation} from './api';
import {telegram} from './telegram';
import {configureMenuLanguage} from './pricing';
import type {LanguageChoice} from './locale';
import { Globe } from 'lucide-react';
import { getLanguageChoice, setLanguageChoice, subscribeLanguage, t } from './i18n';

const languageOptions = [
  { value: 'en', label: 'English', flag: 'gb' },
  { value: 'fa', label: 'فارسی', flag: 'ir' },
  { value: 'zh', label: '中文', flag: 'cn' },
  { value: 'ru', label: 'Русский', flag: 'ru' },
] as const;

export function LanguageSettings() {
  const [error,setError]=useState('');
  function choose(value:LanguageChoice){setLanguageChoice(value);configureMenuLanguage(value==='auto'?undefined:value);setError('');if(telegram?.initData)void mutation('/language','POST',{language:value}).catch(()=>setError(t('Не удалось сохранить язык. Повторите выбор.')));}
  const choice = useSyncExternalStore(subscribeLanguage, getLanguageChoice);
  return <section className="appearance-settings language-settings">
    <h3 id="interface-language-label">{t('Язык интерфейса')}</h3>
    <div id="interface-language" role="group" aria-labelledby="interface-language-label">
      <div className="language-options">
        {languageOptions.map(({ value, label, flag }) => <button type="button" key={value} data-language={value} aria-pressed={choice === value} onClick={() => choose(value)}>
          <img className="language-flag" src={`${import.meta.env.BASE_URL}flags/${flag}.svg`} alt="" width={18} height={18} />
          <span lang={value} dir="auto">{label}</span>
        </button>)}
      </div>
      <button type="button" className="language-auto" data-language="auto" aria-pressed={choice === 'auto'} onClick={() => choose('auto')}>
        <Globe size={18} aria-hidden="true" /><span>{t('Как в Telegram')}</span>
      </button>
    </div>
    {error&&<p className="form-failure" role="alert">{error}</p>}
    <p>{t('По умолчанию используется язык Telegram. Ваш выбор сохраняется отдельно для этого аккаунта на этом устройстве.')}</p>
  </section>;
}
