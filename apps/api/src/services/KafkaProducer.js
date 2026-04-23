const kafka = require('../config/kafka');
const logger = require('../config/logger');

// Singleton Kafka producer.
// Connects lazily on first publish so startup doesn't fail if Kafka is
// temporarily unavailable. Kafka failures in non-critical paths (analytics,
// notifications) must not surface to the end user — callers catch and log.

class KafkaProducer {
  constructor() {
    this.producer  = kafka.producer();
    this.connected = false;
  }

  // connect() — called explicitly at app startup so Kafka connection errors
  // surface immediately rather than on the first publish.
  async connect() {
    await this.#connect();
  }

  async #connect() {
    if (this.connected) return;
    await this.producer.connect();
    this.connected = true;
    logger.info('Kafka producer connected');
  }

  // publish(topic, message) — message.tenantId used as partition key
  // so events from the same tenant are always processed in order.
  async publish(topic, message) {
    await this.#connect();
    await this.producer.send({
      topic,
      messages: [
        {
          key:   message.tenantId ?? null,
          value: JSON.stringify(message),
        },
      ],
    });
  }

  async disconnect() {
    if (!this.connected) return;
    await this.producer.disconnect();
    this.connected = false;
    logger.info('Kafka producer disconnected');
  }
}

module.exports = new KafkaProducer();
