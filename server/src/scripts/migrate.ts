import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../db.js';

if (existsSync('.env')) loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to run migrations.');
const db = createDatabase(process.env.DATABASE_URL);
try {
  const directory = new URL('../../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  await db.transaction(async (client) => {
    // Concurrent deploys share one migration lock and cannot apply a migration twice.
    await client.query('SELECT pg_advisory_xact_lock(173421, 1)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const file of files) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [file])).rowCount)
        continue;
      await client.query(await readFile(fileURLToPath(new URL(file, directory)), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
      console.log(`Applied ${file}`);
    }
  });
} finally {
  await db.close();
}
