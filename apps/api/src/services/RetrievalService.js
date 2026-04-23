const crypto = require('crypto');
const redis  = require('../config/redis');
const logger = require('../config/logger');

const EMBED_CACHE_TTL = 300; // 5 min — mirrors EmbeddingService TTL

class RetrievalService {
  // pineconeClient : result of pinecone.index(indexName) — has .namespace()
  // embeddingService : EmbeddingService singleton
  // scoreThreshold   : drop chunks below this cosine similarity (default 0.75)
  constructor({ pineconeClient, embeddingService, scoreThreshold = 0.75 }) {
    this.pineconeClient   = pineconeClient;
    this.embeddingService = embeddingService;
    this.scoreThreshold   = scoreThreshold;
  }

  #cacheKey(text) {
    return `embed:cache:${crypto.createHash('sha256').update(text).digest('hex')}`;
  }

  // retrieve(query, tenantId, topK?) → Chunk[]
  //
  // Returns at most 3 chunks that pass scoreThreshold, sorted by score desc.
  // Returns [] when no chunks pass — caller is responsible for the fallback response.
  async retrieve(query, tenantId, topK = 5) {
    // ── Step 1: Check Redis for a cached query embedding ─────────────────────
    // This avoids an OpenAI API call for repeated or near-identical questions.
    // Same cache key and TTL as EmbeddingService so both layers share the store.
    const cacheKey = this.#cacheKey(query);
    let vector;

    const cached = await redis.get(cacheKey);
    if (cached) {
      vector = JSON.parse(cached);
      logger.debug('Retrieval: embedding cache hit', { preview: query.slice(0, 60) });
    } else {
      // ── Step 2: Embed query and write to cache ──────────────────────────────
      // embeddingService.embed() also checks this same key, but we checked first
      // so it will always be a cache miss inside embed() too — that's fine; one
      // OpenAI call happens, and embed() writes the result to Redis automatically.
      [vector] = await this.embeddingService.embed([query], 'RETRIEVAL_QUERY');
      // Cache explicitly here so RetrievalService is self-contained when used
      // standalone (e.g. in test-retrieval.js without going through the pipeline).
      await redis.setex(cacheKey, EMBED_CACHE_TTL, JSON.stringify(vector));
    }

    // ── Step 3: Query Pinecone — always scoped to tenant namespace ────────────
    const result = await this.pineconeClient.namespace(tenantId).query({
      vector,
      topK,
      includeMetadata: true,
    });

    const matches = result.matches ?? [];

    // ── Step 4: Filter by score threshold ─────────────────────────────────────
    // Chunks below 0.75 cosine similarity are not relevant enough to inject as
    // context — they would degrade answer quality or cause hallucinations.
    const passing = matches.filter((m) => m.score >= this.scoreThreshold);

    // ── Step 5: Return empty array if nothing passes ───────────────────────────
    if (passing.length === 0) {
      logger.debug('Retrieval: no chunks passed threshold', {
        tenantId,
        threshold: this.scoreThreshold,
        topMatches: matches.slice(0, 3).map((m) => m.score.toFixed(4)),
      });
      return [];
    }

    // ── Step 6: Return top 3 by score ─────────────────────────────────────────
    // Even when topK=5 we cap at 3 to keep the prompt within token budget
    // (per blueprint Section 3 — "inject only top-3 by score").
    return passing
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((m) => ({
        text:       String(m.metadata?.text       ?? ''),
        docId:      String(m.metadata?.docId      ?? ''),
        filename:   String(m.metadata?.filename   ?? ''),
        chunkIndex: Number(m.metadata?.chunkIndex ?? 0),
        score:      m.score,
      }));
  }
}

module.exports = RetrievalService;
