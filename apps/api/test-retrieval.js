#!/usr/bin/env node
// Standalone end-to-end test for the retrieval pipeline.
// Does NOT require a running Express server, S3, Kafka, or PostgreSQL.
// Requires: Redis running + Pinecone index configured + .env populated.
//
// Usage:
//   cd apps/api
//   node test-retrieval.js

require('dotenv').config();

const { v4: uuidv4 }        = require('uuid');
const { index }              = require('./src/config/pinecone');
const redis                  = require('./src/config/redis');
const embeddingService       = require('./src/services/EmbeddingService');
const RetrievalService       = require('./src/services/RetrievalService');
const { chunk }              = require('./src/utils/chunker');

// ─── Test fixtures ────────────────────────────────────────────────────────────

// Unique tenant namespace per test run so parallel runs don't interfere.
const TENANT_ID = `test-tenant-${uuidv4()}`;
const DOC_ID    = uuidv4();
const FILENAME  = 'acmesoft-return-policy.md';

const SAMPLE_DOC = `
# AcmeSoft Return & Refund Policy

## Return Window
Customers may return any product within 30 days of the original purchase date.
Items must be unused and in their original packaging. Digital downloads and
activated license keys are non-refundable once claimed.

## Who Pays for Return Shipping?
For defective or incorrect items, AcmeSoft provides a prepaid return label at
no cost. For all other returns (change of mind, ordered wrong size, etc.) the
customer is responsible for return shipping costs.

## Refund Processing Time
Once we receive and inspect the returned item, refunds are issued within
5 to 7 business days to the original payment method. You will receive an
email confirmation when the refund is processed.

## Exchanges
We offer free exchanges for defective items or incorrect orders. Email
support@acmesoft.com within 30 days with your order number to begin an exchange.
We will ship the replacement at no charge.

## Warranty Coverage
All hardware products carry a 1-year limited manufacturer warranty against
defects in materials and workmanship. Software subscriptions are covered by a
30-day satisfaction guarantee.

## Contact Support
For all return, refund, or exchange requests, email support@acmesoft.com or
call 1-800-ACME-SOFT (Monday–Friday, 9am–6pm EST).
`.trim();

const TEST_QUERY =
  'How long do I have to return a product and who pays for shipping?';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function separator(label = '') {
  const line = '─'.repeat(60);
  console.log(label ? `\n${line}\n  ${label}\n${line}` : `\n${line}`);
}

function printChunk(chunk, idx) {
  console.log(`\n  [${idx + 1}] score      : ${chunk.score.toFixed(4)}`);
  console.log(`      filename   : ${chunk.filename}`);
  console.log(`      chunkIndex : ${chunk.chunkIndex}`);
  console.log(`      docId      : ${chunk.docId}`);
  console.log(
    `      text       : ${chunk.text.replace(/\s+/g, ' ').slice(0, 140)}${
      chunk.text.length > 140 ? '…' : ''
    }`
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  separator('test-retrieval.js — RAG Retrieval Pipeline Test');
  console.log(`  tenant   : ${TENANT_ID}`);
  console.log(`  doc      : ${DOC_ID}`);
  console.log(`  query    : "${TEST_QUERY}"`);

  // ── 1. Chunk the sample document ────────────────────────────────────────────
  separator('Step 1 — Chunking');
  const chunks = await chunk(SAMPLE_DOC);
  console.log(`  ${chunks.length} chunks created (chunkSize=512, overlap=50)`);
  chunks.forEach((c, i) =>
    console.log(`  [${i}] ${c.text.slice(0, 70).replace(/\n/g, ' ')}…`)
  );

  // ── 2. Embed all chunks ──────────────────────────────────────────────────────
  separator('Step 2 — Embedding');
  const texts   = chunks.map((c) => c.text);
  const vectors = await embeddingService.embed(texts);
  console.log(`  ${vectors.length} embeddings (dim: ${vectors[0].length})`);

  // ── 3. Upsert to Pinecone ────────────────────────────────────────────────────
  separator('Step 3 — Upserting to Pinecone');
  const ns = index().namespace(TENANT_ID);
  await ns.upsert(
    chunks.map((c, i) => ({
      id:       `${DOC_ID}-chunk-${c.index}`,
      values:   vectors[i],
      metadata: {
        docId:      DOC_ID,
        chunkIndex: c.index,
        tenantId:   TENANT_ID,
        text:       c.text,
        filename:   FILENAME,
      },
    }))
  );
  console.log(`  Upserted ${chunks.length} vectors to namespace "${TENANT_ID}"`);

  // Pinecone takes a moment to make freshly upserted vectors queryable
  process.stdout.write('  Waiting 3s for Pinecone to index…');
  await new Promise((r) => setTimeout(r, 3000));
  console.log(' ready.');

  // ── 4. Run retrieval ─────────────────────────────────────────────────────────
  separator('Step 4 — Retrieval');
  console.log(`  scoreThreshold : 0.5 (lowered from 0.75 for synthetic test data)`);
  console.log(`  topK           : 5`);

  const retriever = new RetrievalService({
    pineconeClient:   index(),
    embeddingService,
    scoreThreshold:   0.5, // synthetic docs score lower than real support docs
  });

  const results = await retriever.retrieve(TEST_QUERY, TENANT_ID, 5);

  if (results.length === 0) {
    console.log('\n  ✗  No chunks passed the score threshold.');
    console.log(
      '     Try lowering scoreThreshold further, or wait a few more seconds.\n'
    );
  } else {
    console.log(`\n  ✓  ${results.length} chunk(s) returned:`);
    results.forEach((chunk, i) => printChunk(chunk, i));
  }

  // Second call should hit Redis embedding cache (no OpenAI call)
  separator('Step 4b — Cache hit verification (same query)');
  console.log('  Repeating retrieval — embedding must come from Redis cache…');
  const t0       = Date.now();
  const results2 = await retriever.retrieve(TEST_QUERY, TENANT_ID, 5);
  console.log(`  Completed in ${Date.now() - t0}ms (should be <100ms if cached)`);
  console.log(`  Chunks returned: ${results2.length}`);

  // ── 5. Cleanup ───────────────────────────────────────────────────────────────
  separator('Step 5 — Cleanup');
  await ns.deleteAll();
  console.log(`  Deleted all vectors in namespace "${TENANT_ID}"`);
  await redis.client.quit();
  console.log('  Redis connection closed.');

  separator();
  console.log('  Test complete.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
