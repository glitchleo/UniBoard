import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createApp } from './app.js';
import { createDatabase } from './db.js';
import type { MailSender } from './routes/auth.js';

if (existsSync('.env')) loadEnvFile('.env');

const config = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    APP_ORIGIN: z.url().default('http://127.0.0.1:5173'),
    DATABASE_URL: z.string().min(1).optional(),
    TRUST_PROXY: z.enum(['0', '1']).default('0'),
    SERVE_FRONTEND: z.enum(['0', '1']).default('0'),
    EMAIL_WEBHOOK_URL: z.url().optional(),
    EMAIL_WEBHOOK_TOKEN: z.string().min(24).optional(),
  })
  .parse(process.env);

if (
  config.NODE_ENV === 'production' &&
  config.DATABASE_URL &&
  new URL(config.APP_ORIGIN).protocol !== 'https:'
)
  throw new Error('Production APP_ORIGIN must use HTTPS.');
if (
  config.EMAIL_WEBHOOK_URL &&
  (!config.EMAIL_WEBHOOK_TOKEN || new URL(config.EMAIL_WEBHOOK_URL).protocol !== 'https:')
)
  throw new Error(
    'Email delivery requires an HTTPS webhook URL and EMAIL_WEBHOOK_TOKEN of at least 24 characters.',
  );

const sendMail: MailSender | undefined = config.EMAIL_WEBHOOK_URL
  ? async (message) => {
      const response = await fetch(config.EMAIL_WEBHOOK_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.EMAIL_WEBHOOK_TOKEN!}`,
        },
        body: JSON.stringify({ ...message, appOrigin: config.APP_ORIGIN }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Email delivery failed with status ${response.status}.`);
    }
  : undefined;

const db = config.DATABASE_URL ? createDatabase(config.DATABASE_URL) : undefined;
const server = createApp({
  db,
  environment: config.NODE_ENV,
  appOrigin: config.APP_ORIGIN,
  trustProxy: config.TRUST_PROXY === '1',
  sendMail,
  frontendPath:
    config.SERVE_FRONTEND === '1'
      ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../campus/dist')
      : undefined,
}).listen(config.PORT, () => {
  console.log(
    `UniBoard API listening on port ${config.PORT}. Database ${db ? 'configured' : 'not configured; API data endpoints return 503'}.`,
  );
});

async function shutdown() {
  server.close(async () => {
    await db?.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
