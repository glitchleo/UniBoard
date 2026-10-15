import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface Database extends Queryable {
  transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createDatabase(connectionString: string): Database {
  // Require a trusted TLS connection through DATABASE_URL (sslmode=verify-full) in hosted environments.
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  pool.on('error', (error) => console.error('Idle database connection failed:', error.message));
  return {
    query: (text, values) => pool.query(text, values),
    async transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await work(client);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
