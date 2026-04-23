require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');
const { pool } = require('./config/db');
const redis = require('./config/redis');
const kafkaProducer = require('./services/KafkaProducer');

const PORT = parseInt(process.env.PORT || '3000', 10);

async function checkConnections() {
  // PostgreSQL — run a trivial query to confirm the pool is reachable
  await pool.query('SELECT 1');
  logger.info('PostgreSQL connected');

  // Redis client emits "ready" on its own (see redis.js), but we also ping
  // here so a failed connection surfaces at startup rather than first request
  await redis.client.ping();

  // Kafka producer — connect eagerly so publish errors are not silent on the
  // first chat message
  await kafkaProducer.connect();
}

async function start() {
  try {
    await checkConnections();
  } catch (err) {
    logger.error('Startup connection check failed', { message: err.message });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`API server listening on port ${PORT}`, {
      env: process.env.NODE_ENV || 'development',
      port: PORT,
    });
  });

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  // ECS sends SIGTERM before forcibly killing the task. We stop accepting new
  // connections, drain existing ones, then close Redis and the PG pool cleanly.

  async function shutdown(signal) {
    logger.info(`${signal} received — shutting down gracefully`);

    server.close(async () => {
      try {
        await kafkaProducer.disconnect();
        await redis.client.quit();
        await pool.end();
        logger.info('All connections closed. Goodbye.');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { message: err.message });
        process.exit(1);
      }
    });

    // Force exit if graceful shutdown takes more than 10 seconds
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start();
