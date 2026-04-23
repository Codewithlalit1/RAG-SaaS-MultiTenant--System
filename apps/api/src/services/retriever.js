// Singleton RetrievalService instance shared across the application.
// Constructed once at startup; dependencies (Pinecone index + EmbeddingService)
// are module-level singletons themselves so there is no duplicated state.
const pinecone        = require('../config/pinecone');
const embeddingService = require('./EmbeddingService');
const RetrievalService = require('./RetrievalService');
const config          = require('../config/env');

module.exports = new RetrievalService({
  pineconeClient:  pinecone.index(),
  embeddingService,
  scoreThreshold:  config.rag.scoreThreshold,
});
