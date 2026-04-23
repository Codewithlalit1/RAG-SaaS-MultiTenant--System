const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('./env');
const logger = require('./logger');

// Every query and upsert MUST be scoped to a tenant namespace:
//   pinecone.index().namespace(tenantId).query({ .... })
// This is the primary vector-layer tenant isolation mechanism (Section 6).

const pinecone = new Pinecone({ apiKey: config.pinecone.apiKey });

logger.info('Pinecone client initialised', { index: config.pinecone.indexName });

// Returns the configured index handle (no network call — lazy).
function index() {
  return pinecone.index(config.pinecone.indexName);
}

// Scoped shortcut: pinecone.namespace(tenantId).query(...)
function namespace(tenantId) {
  return index().namespace(tenantId);
}

module.exports = { pinecone, index, namespace };
