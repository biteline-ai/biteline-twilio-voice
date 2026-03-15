import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Run a parameterized query and return the pg result.
 */
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn(`[DB] Slow query (${duration}ms):`, text.slice(0, 120));
  }
  return result;
}

/**
 * Run a callback inside a transaction.
 * Rolls back automatically on throw; commits on success.
 * Automatically retries on deadlock (40P01) or serialization failure (40001)
 * up to `retries` times with linear back-off.
 *
 * @param {function(client): Promise<T>} fn
 * @param {{ retries?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function withTransaction(fn, { retries = 3 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      // Retry on deadlock or serialization failure
      if (attempt < retries && (err.code === '40P01' || err.code === '40001')) {
        console.warn(`[DB] Transaction ${err.code === '40P01' ? 'deadlock' : 'serialization failure'} — retrying (attempt ${attempt}/${retries})`);
        await new Promise((r) => setTimeout(r, attempt * 50));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
