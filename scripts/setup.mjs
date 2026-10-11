import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.env.docker', import.meta.url));
const secret = () => randomBytes(48).toString('hex');
try {
  writeFileSync(target, [
    '# Generated locally. Never commit or share this file.',
    `JWT_SECRET_KEY=${secret()}`,
    `DB_PASSWORD=${secret()}`,
    `MYSQL_ROOT_PASSWORD=${secret()}`,
    `N8N_ENCRYPTION_KEY=${secret()}`,
    `N8N_WEBHOOK_SECRET=${secret()}`,
    'N8N_WEBHOOK_URL=',
    'WEB_PORT=8080',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Created .env.docker with generated secrets. Run: docker compose --env-file .env.docker up --build -d');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.docker already exists; existing secrets were preserved.');
}
