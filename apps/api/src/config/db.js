const { Pool } = require('pg');
const config = require('./env');
const logger = require('./logger');

const pool = new Pool({
  host:     config.db.host,
  port:     config.db.port,
  user:     config.db.user,
  password: config.db.password,
  database: config.db.name,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PG pool error', { message: err.message });
});

// Simple query against the pool — no tenant context, no transaction.
async function query(text, params) {
  return pool.query(text, params);
}

// Raw client checkout. Caller is responsible for client.release().
// Use for migrations or multi-step operations that don't need tenant RLS.
async function getClient() {
  return pool.connect();
}

// Runs callback inside a  transaction with SET LOCAL app.tenant_id for RLS.
// All queries executed via the passed client are scoped to tenantId.
async function withTenant(tenantId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [
      'app.tenant_id',
      tenantId,
    ]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, getClient, withTenant };
