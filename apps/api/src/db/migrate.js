#!/usr/bin/env node
// Run with: node src/db/migrate.js
// Applies all pending migrations from src/db/migrations/ in filename order.
// Already-applied migrations are skipped (tracked in schema_migrations table).

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
  const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'ragsaas',
});
  const client = await pool.connect();

  try {
    // Tracking table — must exist before we can query it
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log('[migrate] All migrations already applied. Nothing to do.');
      return;
    }

    for (const filename of pending) {
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filepath, 'utf8');

      console.log(`[migrate] Applying ${filename} ...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`[migrate] ✓ ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] ✗ ${filename}: ${err.message}`);
        // Stop on first failure — later migrations may depend on this one
        process.exit(1);
      }
    }

    console.log(`[migrate] Done. Applied ${pending.length} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('[migrate] Fatal:', err.message || err);
  if (err.code) console.error('[migrate] Error code:', err.code);
  process.exit(1);
});
