const db           = require('../config/db');
const redis        = require('../config/redis');
const { namespace } = require('../config/pinecone');
const logger       = require('../config/logger');
const kafkaProducer  = require('./KafkaProducer');
const embeddingService = require('./EmbeddingService');
const { chunk: splitText } = require('../utils/chunker');
const pdfParser    = require('../utils/parsers/pdfParser');
const docxParser   = require('../utils/parsers/docxParser');
const markdownParser = require('../utils/parsers/markdownParser');
const docQueries   = require('../db/queries/documents');

// ─── MIME → parser map ────────────────────────────────────────────────────────

const PARSERS = {
  'application/pdf': pdfParser,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': docxParser,
  'text/markdown': markdownParser,
  'text/plain':    markdownParser,
};

// ─── Redis status helpers ─────────────────────────────────────────────────────

const STATUS_TTL = 3600; // 1 hour — polling window for SSE endpoint

async function setDocStatus(docId, payload) {
  await redis.setex(`doc:status:${docId}`, STATUS_TTL, JSON.stringify(payload));
}

// ─── Exported pipeline steps ──────────────────────────────────────────────────

async function parse(buffer, mimeType) {
  const parser = PARSERS[mimeType];
  if (!parser) throw new Error(`Unsupported MIME type: ${mimeType}`);
  return parser.parse(buffer);
}

async function chunk(text) {
  return splitText(text);
}

// Embeds chunks and upserts to the tenant's Pinecone namespace.
// Pinecone batch limit is 100 vectors per upsert call.
async function embedAndUpsert(chunks, tenantId, docId, filename) {
  const texts   = chunks.map((c) => c.text);
  const vectors = await embeddingService.embed(texts);

  const ns           = namespace(tenantId);
  const PINECONE_MAX = 100;

  for (let i = 0; i < chunks.length; i += PINECONE_MAX) {
    const slice = chunks.slice(i, i + PINECONE_MAX);
    await ns.upsert(
      slice.map((c, bi) => ({
        id:       `${docId}-chunk-${c.index}`,
        values:   vectors[i + bi],
        metadata: {
          docId,
          chunkIndex: c.index,
          tenantId,
          text:     c.text,
          filename,
        },
      }))
    );
  }
}

// Inserts the document row into PostgreSQL (called from the upload route,
// before the async ingest starts, so the row exists for status polling).
async function saveDocumentRecord(tenantId, { docId, filename, s3Key, mimeType }) {
  return db.withTenant(tenantId, (client) =>
    docQueries.create(client, { tenantId, docId, filename, s3Key, mimeType })
  );
}

// ─── Full async pipeline ──────────────────────────────────────────────────────
// Called without await from the upload route — runs entirely in the background.
// Progress is written to Redis so the SSE endpoint can stream it to the client.

async function ingestDocument({ docId, tenantId, buffer, filename, mimeType, s3Key }) {
  try {
    logger.info('Ingestion started', { docId, tenantId, filename });
    await setDocStatus(docId, { status: 'processing', progress: 10, chunksIndexed: 0 });

    const text = await parse(buffer, mimeType);
    await setDocStatus(docId, { status: 'processing', progress: 30, chunksIndexed: 0 });

    const chunks = await chunk(text);
    await setDocStatus(docId, { status: 'processing', progress: 50, chunksIndexed: 0 });

    await embedAndUpsert(chunks, tenantId, docId, filename);
    await setDocStatus(docId, { status: 'processing', progress: 80, chunksIndexed: chunks.length });

    // Rough token count: ~4 chars per token
    const tokenCount = chunks.reduce((sum, c) => sum + Math.ceil(c.text.length / 4), 0);

    await db.withTenant(tenantId, (client) =>
      docQueries.updateStatus(client, {
        id: docId, status: 'indexed', chunkCount: chunks.length, tokenCount,
      })
    );

    await setDocStatus(docId, { status: 'indexed', progress: 100, chunksIndexed: chunks.length });

    logger.info('Ingestion complete', { docId, tenantId, chunks: chunks.length, tokenCount });

    // Kafka — failure must not roll back a successful ingest
    kafkaProducer.publish('doc_ingested', {
      tenantId, docId, filename,
      chunkCount: chunks.length, tokenCount,
      createdAt: new Date().toISOString(),
    }).catch((err) =>
      logger.error('Kafka publish failed (doc_ingested)', { docId, message: err.message })
    );

  } catch (err) {
    logger.error('Ingestion failed', { docId, tenantId, message: err.message });

    await setDocStatus(docId, { status: 'failed', error: err.message }).catch(() => {});

    await db
      .withTenant(tenantId, (client) =>
        docQueries.updateStatus(client, { id: docId, status: 'failed' })
      )
      .catch(() => {});

    kafkaProducer.publish('doc_failed', {
      tenantId, docId, filename, error: err.message,
      createdAt: new Date().toISOString(),
    }).catch(() => {});
  }
}

module.exports = { parse, chunk, embedAndUpsert, saveDocumentRecord, ingestDocument };
