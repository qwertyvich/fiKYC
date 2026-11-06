import test from 'node:test';
import assert from 'node:assert/strict';
import { languageStorageKey, telegramLanguage } from './locale.ts';
import { getLanguage, getLanguageChoice, initLanguage, setLanguageChoice, t } from './i18n.ts';
import { cartMessage } from './seller.ts';

test('Telegram language variants map to supported languages; unknown and missing codes use Russian', () => {
  for (const [code, expected] of [['en-GB','en'],['zh-Hans','zh'],['zh_Hant','zh'],['FA-ir','fa'],['ru-RU','ru'],['de','ru'],['','ru']] as const) assert.equal(telegramLanguage(code), expected);
  assert.equal(telegramLanguage(), 'ru');
});

test('saved choices are account-specific, auto uses Telegram, malformed/blocked storage does not prevent opening', () => {
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value: { getItem:(key:string)=>saved.get(key)??null, setItem:(key:string,value:string)=>saved.set(key,value) } });
  initLanguage({id:1,language_code:'en'}); assert.equal(getLanguage(),'en');
  setLanguageChoice('zh');
  initLanguage({id:2,language_code:'fa'}); assert.equal(getLanguage(),'fa'); assert.equal(getLanguageChoice(),'auto');
  setLanguageChoice('ru');
  initLanguage({id:1,language_code:'en'}); assert.equal(getLanguage(),'zh');
  setLanguageChoice('auto'); assert.equal(getLanguage(),'en');
  saved.set(languageStorageKey(1),'"unsupported"'); initLanguage({id:1,language_code:'fa'}); assert.equal(getLanguage(),'fa');
  saved.set(languageStorageKey(1),'{broken'); initLanguage({id:1,language_code:'en'}); assert.equal(getLanguage(),'en');
  initLanguage(); assert.equal(getLanguage(),'ru'); setLanguageChoice('fa');
  initLanguage({id:2,language_code:'en'}); assert.equal(getLanguage(),'ru');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('blocked');}});
  initLanguage({id:1,language_code:'zh'}); assert.equal(getLanguage(),'zh');
  assert.doesNotThrow(()=>setLanguageChoice('en'));
  delete (globalThis as {localStorage?:unknown}).localStorage;
  initLanguage();
});

test('localized seller drafts preserve entered comments, IDs, quantities and currencies', () => {
  initLanguage({language_code:'en'});
  const draft = cartMessage([{product:{id:'qa-1',groupId:'claude',title:'Claude Pro',subtitle:'1 месяц',description:'',price:10,currency:'USD',stock:5,brand:'claude',badge:'',visible:true},quantity:2}], 'Мой личный комментарий');
  assert.match(draft,/Total: 20 \$/);
  assert.match(draft,/Item ID: qa-1/);
  assert.match(draft,/2 pcs/);
  assert.match(draft,/Мой личный комментарий/);
  assert.equal(t('Custom title'), 'Custom title');
  assert.equal(t('5 в наличии'), '5 in stock');
  initLanguage();
});
