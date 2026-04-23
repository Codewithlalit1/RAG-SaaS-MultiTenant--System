// Kafka client (Singleton).
// Used by KafkaProducer service and by workers/ consumers.
// Topics: chat_events, doc_ingested, doc_failed, tenant_over_limit.

const { Kafka } = require('kafkajs');
const config = require('./env');

const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: { initialRetryTime: 300, retries: 8 },
});

module.exports = kafka;
