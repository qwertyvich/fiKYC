export function createLanguageChoices(db){
  db.exec("CREATE TABLE IF NOT EXISTS language_choices(telegram_id TEXT PRIMARY KEY,language TEXT NOT NULL,updated_at INTEGER NOT NULL)");
  const get=id=>id?db.prepare('SELECT language,updated_at AS updatedAt FROM language_choices WHERE telegram_id=?').get(String(id))??null:null;
  const set=(id,language)=>{if(!/^[1-9]\d+$/.test(String(id))||!['ru','en','zh','fa'].includes(language))throw Object.assign(new Error('Выберите язык меню'),{status:400});db.prepare('INSERT INTO language_choices VALUES(?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET language=excluded.language,updated_at=excluded.updated_at').run(String(id),language,Math.max(Date.now(),(get(id)?.updatedAt??0)+1));return get(id);};
  return{get,set,clear:id=>db.prepare('DELETE FROM language_choices WHERE telegram_id=?').run(String(id))};
}
