const crypto = require('crypto');
const redis  = require('../config/redis');
const config = require('../config/env');
const logger = require('../config/logger');

// Gemini text-embedding-004 produces 768-dimensional vectors.
// Pinecone index must be created with dimension = 768.
const BATCH_SIZE = 20;  // parallel embedContent calls
const CACHE_TTL  = 300; // 5 minutes — same question = same vector

class EmbeddingService {
  constructor() {
    this.apiKey = config.gemini.apiKey;
    this.model  = `models/${config.gemini.embeddingModel}`;
  }

  async #embedOne(text, taskType = 'RETRIEVAL_DOCUMENT') {
    const url = `https://generativelanguage.googleapis.com/v1beta/${this.model}:embedContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: 1024,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini embed API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.embedding.values;
  }

  async #batchEmbedApi(texts, taskType = 'RETRIEVAL_DOCUMENT') {
    const results = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const embeddings = await Promise.all(batch.map((t) => this.#embedOne(t, taskType)));
      results.push(...embeddings);
    }
    return results;
  }

  #cacheKey(text) {
    return `embed:cache:${crypto.createHash('sha256').update(text).digest('hex')}`;
  }

  // embed(texts, taskType?) → number[][]
  async embed(texts, taskType = 'RETRIEVAL_DOCUMENT') {
    if (texts.length === 0) return [];

    const results      = new Array(texts.length);
    const uncachedIdxs = [];

    // 1. Check Redis cache for each text in parallel
    await Promise.all(
      texts.map(async (text, i) => {
        const cached = await redis.get(this.#cacheKey(text));
        if (cached) {
          results[i] = JSON.parse(cached);
        } else {
          uncachedIdxs.push(i);
        }
      })
    );

    if (uncachedIdxs.length === 0) {
      logger.debug('Embedding cache: 100% hit', { count: texts.length });
      return results;
    }

    // 2. Call Gemini batchEmbedContents in batches of BATCH_SIZE
    for (let b = 0; b < uncachedIdxs.length; b += BATCH_SIZE) {
      const batchIdxs  = uncachedIdxs.slice(b, b + BATCH_SIZE);
      const batchTexts = batchIdxs.map((i) => texts[i]);

      const embeddings = await this.#batchEmbedApi(batchTexts, taskType);

      // 3. Store in results array and write-through to Redis cache
      await Promise.all(
        embeddings.map(async (embedding, bi) => {
          const origIdx   = batchIdxs[bi];
          results[origIdx] = embedding;

          await redis.setex(
            this.#cacheKey(texts[origIdx]),
            CACHE_TTL,
            JSON.stringify(embedding)
          );
        })
      );
    }

    const hitRate = (
      ((texts.length - uncachedIdxs.length) / texts.length) * 100
    ).toFixed(0);

    logger.debug('Embeddings computed', {
      total:    texts.length,
      apiCalls: uncachedIdxs.length,
      cacheHit: `${hitRate}%`,
      model:    config.gemini.embeddingModel,
    });

    return results;
  }
}

// Singleton — one Gemini client across all modules
module.exports = new EmbeddingService();
