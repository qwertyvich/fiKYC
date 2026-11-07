import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
try {
  await writeFile(
    new URL('../.env', import.meta.url),
    `# Local credentials. Keep this file private.\nADMIN_PASSWORD=${randomBytes(18).toString('base64url')}\nPORT=8787\nHOST=127.0.0.1\nBOT_TOKEN=\nADMIN_TELEGRAM_IDS=\nSELLER_TELEGRAM_USERNAME=\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Создан .env. Пароль панели — значение ADMIN_PASSWORD. Запустите npm run server и npm run dev.',
  );
} catch (error) {
  if (error.code === 'EEXIST')
    console.log('.env уже существует. Существующие настройки сохранены.');
  else throw error;
}
