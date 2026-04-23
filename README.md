# RAG Support SaaS

> A production-ready, **multi-tenant AI customer support platform** powered by Retrieval-Augmented Generation (RAG). Businesses upload their documentation, embed a single `<script>` tag on their website, and their customers instantly get accurate, context-aware answers from an AI chatbot — trained exclusively on that business's own content.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Live Demo](#live-demo)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [RAG Pipeline — Deep Dive](#rag-pipeline--deep-dive)
- [System Design Concepts](#system-design-concepts)
- [Object-Oriented Design Patterns](#object-oriented-design-patterns)
- [Apache Kafka — Event-Driven Ingestion](#apache-kafka--event-driven-ingestion)
- [AWS Cloud Integration](#aws-cloud-integration)
- [Multi-Tenancy & Data Isolation](#multi-tenancy--data-isolation)
- [Authentication & Security](#authentication--security)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)

---

## Problem Statement

Traditional customer support is expensive and slow. Hiring support agents is costly, and static FAQ pages go stale. Businesses need a way to:

1. **Instantly answer customer questions** without human intervention
2. **Ground answers in their actual documentation** — not hallucinated AI responses
3. **Deploy with zero engineering effort** — a single script tag, not months of integration work
4. **Serve multiple businesses from one platform** — with complete data isolation between them

**RAG Support SaaS solves all four.** Each business (tenant) gets their own AI assistant trained exclusively on their uploaded content. Their customers get instant, accurate answers. Their data never mixes with another tenant's.

---

## Live Demo

| Interface | URL |
|---|---|
| Dashboard | `http://localhost:3001` |
| API | `http://localhost:3000` |
| Widget (embed anywhere) | `<script src="http://localhost:3000/widget.js">` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER'S WEBSITE                           │
│                                                                     │
│   <script src="your-api.com/widget.js" data-api-key="rsk_...">     │
│                          │                                          │
│                   Chat Bubble UI                                    │
│                    (Vanilla JS)                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │  POST /api/chat/message
                           │  x-api-key: rsk_...
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        EXPRESS API SERVER                           │
│                                                                     │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐ │
│  │ ApiKeyAuth   │→ │ RateLimiter   │→ │   ContextBuildHandler    │ │
│  │ (SHA-256     │  │ (Redis daily  │  │  (embed query → Pinecone │ │
│  │  key lookup) │  │  quota check) │  │   vector search)         │ │
│  └──────────────┘  └───────────────┘  └──────────┬───────────────┘ │
│                                                   │                 │
│  ┌────────────────────────────────────────────────▼───────────────┐ │
│  │                      LLMHandler                                │ │
│  │   BaseChatAgent → Groq (llama-3.1-8b) → SSE token stream      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                   │                 │
│  ┌────────────────────────────────────────────────▼───────────────┐ │
│  │                     PersistHandler                             │ │
│  │   PostgreSQL (messages) + Redis (history) + Kafka (analytics) │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
   PostgreSQL 16       Pinecone           Apache Kafka
   (tenants,          (1024-dim          (async ingestion
    documents,         vector             + analytics
    sessions,          search,            events)
    messages)          per-tenant
                       namespaces)

┌─────────────────────────────────────────────────────────────────────┐
│                     DOCUMENT INGESTION FLOW                         │
│                                                                     │
│  Upload PDF/DOCX → S3 (raw storage) → Kafka → Parse → Chunk →      │
│  Gemini Embed → Pinecone Upsert → PostgreSQL status update          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend API** | Node.js 20, Express.js | REST API, SSE streaming, middleware pipeline |
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript | Dashboard SPA |
| **Styling** | Tailwind CSS | Utility-first UI |
| **Widget** | Vanilla JavaScript (zero dependencies) | Drop-in embed for customer sites |
| **Primary Database** | PostgreSQL 16 | Tenants, documents, sessions, messages |
| **Cache / Pub-Sub** | Redis 7 (ioredis) | Embedding cache, rate limit counters, SSE state |
| **Message Queue** | Apache Kafka (KafkaJS) | Async document ingestion, analytics events |
| **Vector Database** | Pinecone | 1024-dim semantic vector storage and search |
| **Embeddings** | Google Gemini (`gemini-embedding-001`) | Document and query vectorisation |
| **LLM** | Groq (`llama-3.1-8b-instant`) | Token-streaming chat completions |
| **File Storage** | AWS S3 | Raw document storage |
| **Auth** | JWT + bcrypt + SHA-256 | Dashboard JWT auth + API key auth |
| **File Parsing** | pdf-parse, mammoth, marked | PDF, DOCX, Markdown extraction |
| **Text Splitting** | LangChain `RecursiveCharacterTextSplitter` | Overlapping chunk generation |
| **Containerisation** | Docker, Docker Compose | Local development environment |
| **Deployment** | Vercel (frontend), Railway (API + DB + Redis) | Cloud hosting |

---

## RAG Pipeline — Deep Dive

RAG (Retrieval-Augmented Generation) grounds LLM responses in real documents rather than relying on the model's training data. This prevents hallucination and keeps answers accurate to the business's actual content.

### Ingestion Pipeline (Document → Vector Store)

```
User uploads file
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ 1. UPLOAD (HTTP layer)                                  │
│    • Multer parses multipart/form-data (max 10 MB)      │
│    • MIME type validated (PDF, DOCX, MD, TXT only)      │
│    • Raw file streamed to AWS S3 for durable storage    │
│    • DB row created: status = 'processing'              │
│    • HTTP 202 returned immediately — async from here    │
└─────────────────┬───────────────────────────────────────┘
                  │  Kafka message: { docId, tenantId, s3Key }
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 2. PARSE (IngestionService)                             │
│    • Strategy pattern selects parser by MIME type:      │
│      - PDF   → pdf-parse  (text + metadata)             │
│      - DOCX  → mammoth    (preserves structure)         │
│      - MD    → marked     (strips HTML tags)            │
│      - TXT   → raw Buffer.toString()                    │
│    • Malformed file errors caught with user-friendly    │
│      messages, status set to 'failed'                   │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 3. CHUNK (Text Splitting)                               │
│    • LangChain RecursiveCharacterTextSplitter           │
│      - chunkSize: 512 tokens                            │
│      - chunkOverlap: 50 tokens (preserves context       │
│        across chunk boundaries)                         │
│    • Each chunk tagged with: docId, tenantId,           │
│      filename, chunkIndex                               │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 4. EMBED (EmbeddingService)                             │
│    • Google Gemini gemini-embedding-001 REST API        │
│    • taskType: RETRIEVAL_DOCUMENT                       │
│    • outputDimensionality: 1024                         │
│    • Redis cache (TTL): skip re-embedding identical     │
│      text on re-upload                                  │
│    • Result: float32[1024] per chunk                    │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 5. UPSERT (Pinecone)                                    │
│    • Namespace = tenantId (strict isolation)            │
│    • Vector ID = "${docId}-chunk-${i}"                  │
│    • Metadata: { text, filename, docId, tenantId }      │
│    • DB updated: status='indexed', chunk_count, tokens  │
│    • Redis SSE key updated for progress streaming       │
└─────────────────────────────────────────────────────────┘
```

### Retrieval Pipeline (Question → Answer)

```
User sends message: "How do I reset my password?"
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ 1. EMBED QUERY                                          │
│    • Same Gemini model, taskType: RETRIEVAL_QUERY       │
│    • Returns float32[1024] query vector                 │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 2. VECTOR SEARCH (Pinecone)                             │
│    • Cosine similarity search in tenant's namespace     │
│    • Returns top-K=5 chunks above score threshold=0.3   │
│    • Each result: { text, filename, score, metadata }   │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 3. CONTEXT ASSEMBLY                                     │
│    • Retrieved chunks formatted as numbered list with   │
│      source attribution and relevance score             │
│    • Last N conversation turns appended (context window)│
│    • Combined into system prompt for the LLM            │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 4. LLM GENERATION (Groq)                               │
│    • llama-3.1-8b-instant, temperature: 0.3            │
│    • Strictly instructed to answer only from context   │
│    • If no relevant chunks found → graceful fallback   │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 5. STREAM TO CLIENT                                     │
│    • Each token: data: {"token":"..."}\n\n              │
│    • Terminator: data: [DONE]\n\n                      │
│    • Widget renders tokens as they arrive               │
└─────────────────────────────────────────────────────────┘
```

---

## System Design Concepts

### Rate Limiting

Every API key has a daily message quota enforced **before** any expensive LLM or embedding call is made:

```
Request arrives
      │
      ▼
Redis GET  "ratelimit:{tenantId}:{date}"
      │
      ├── count >= plan_limit  →  HTTP 429 (quota exceeded)
      │
      └── count < plan_limit   →  Redis INCR + proceed
                                  (TTL auto-expires at midnight)
```

- **Plan-based limits:** Starter < Growth < Business
- **Redis INCR is atomic** — no race condition under concurrent requests
- **Zero database load** — quota checks never touch PostgreSQL
- **Automatic reset** — TTL key expires at midnight, no cron job needed

### Asynchronous Processing & Decoupling

Document ingestion is deliberately **not** synchronous with the HTTP request:

```
HTTP POST /upload  →  202 Accepted (< 50ms)
                            │
                   Kafka message published
                            │
                   Worker processes async:
                   Parse → Chunk → Embed → Index
                   (can take 10-60 seconds for large PDFs)
                            │
                   Redis SSE key updated
                            │
                   Client polls /documents/:id/status
                   via Server-Sent Events for progress
```

This design means:
- **API stays responsive** under heavy upload load
- **No HTTP timeout** risk for large documents
- **Failed ingestion** is retried by Kafka consumer without re-uploading
- **Workers scale independently** from the API server

### Cursor-Based Pagination

All list endpoints use **cursor pagination** instead of OFFSET:

```sql
-- BAD: OFFSET scans all preceding rows (O(n) gets worse as you paginate)
SELECT * FROM documents ORDER BY created_at DESC LIMIT 20 OFFSET 1000;

-- GOOD: Cursor uses index seek (O(log n) regardless of page depth)
SELECT * FROM documents
WHERE created_at < $cursor
ORDER BY created_at DESC
LIMIT 21;  -- fetch n+1, check hasMore, slice to n
```

### Connection Pool Management

PostgreSQL connections are expensive. A singleton pool (max 10 connections) is shared across all requests:

```
Request 1  ──┐
Request 2  ──┼──►  pg.Pool (10 connections)  ──►  PostgreSQL
Request 3  ──┘          reuse / queue
```

### Graceful Shutdown

On `SIGTERM` (e.g., Kubernetes rolling deploy, Railway restart):

```
SIGTERM received
      │
      ▼
server.close()          ← stop accepting new connections
      │
      ▼
kafkaProducer.disconnect()
      │
      ▼
redis.client.quit()
      │
      ▼
pool.end()              ← drain in-flight PG queries
      │
      ▼
process.exit(0)         ← clean exit, no data loss
```

A 10-second hard timeout ensures the process never hangs indefinitely.

### Embedding Cache

Re-embedding identical text wastes Gemini API quota. Redis caches vectors by content hash:

```
embed("How to reset password?")
      │
      ▼
Redis GET hash(text)
      │
      ├── HIT  →  return cached float32[1024]  (0ms, free)
      │
      └── MISS →  call Gemini API  (~200ms, costs quota)
                        │
                  Redis SET hash(text) vector  TTL=24h
```

---

## Object-Oriented Design Patterns

### 1. Abstract Base Class — `BaseChatAgent`

```
BaseChatAgent  (abstract)
├── constructor: initialises Groq client, stores retriever + contextWindow
├── chat(message, sessionId): template method — retrieves → builds prompt → streams
├── buildSystemPrompt(): ABSTRACT — subclasses must implement
└── getRetrievalTopK(): VIRTUAL — subclasses may override

        ▲
        │  extends
        │
GenericAgent         EcommerceAgent       TechAgent
(default prompt)     (product-focused)    (debug-focused)
```

The `chat()` method is a **Template Method** — it defines the invariant algorithm skeleton (retrieve → prompt → stream) while delegating variable behaviour (`buildSystemPrompt`) to subclasses.

### 2. Strategy Pattern — File Parsers

```javascript
const PARSERS = {
  'application/pdf':       pdfParser,    // pdf-parse
  'application/vnd...docx': docxParser,  // mammoth
  'text/markdown':          mdParser,    // marked
  'text/plain':             txtParser,   // raw buffer
};

// Ingestion controller selects strategy at runtime:
const parser = PARSERS[mimeType];
const text   = await parser.parse(buffer);
```

All parsers implement the same `{ parse(buffer): Promise<string> }` interface. Adding a new file type requires zero changes to the ingestion pipeline — just register a new strategy.

### 3. Pipeline Pattern — `MessagePipeline`

The chat request flows through a chain of handlers. Each handler does one thing and passes control to the next:

```
new MessagePipeline()
  .use(new ApiKeyHandler())        // extract tenantId from API key
  .use(new RateLimitHandler())     // check daily quota
  .use(new ContextBuildHandler())  // retrieve relevant chunks
  .use(new LLMHandler())           // stream LLM response
  .use(new PersistHandler())       // save to DB + Redis + Kafka
```

Each `Handler` implements `async handle(ctx)`. This is a textbook **Chain of Responsibility** — handlers are independent, testable, and reorderable.

### 4. Singleton Pattern — Infrastructure Clients

```javascript
// db.js — created once, shared everywhere
const pool = new Pool({ host, port, user, password, database });
module.exports = { pool, withTenant };

// redis.js — one ioredis connection
const client = new Redis(config.redisUrl);
module.exports = { client, get, set, del };

// KafkaProducer.js — one producer instance
class KafkaProducer { /* ... */ }
module.exports = new KafkaProducer();
```

Node.js module caching ensures these are instantiated exactly once per process.

### 5. Repository Pattern — Query Modules

Business logic never contains raw SQL. All queries live in `db/queries/` modules:

```javascript
// routes/documents.js — clean business logic
const doc = await db.withTenant(tenantId, (client) =>
  docQueries.findById(client, { id: docId, tenantId })
);

// db/queries/documents.js — all SQL here
async function findById(client, { id, tenantId }) {
  const { rows } = await client.query(
    `SELECT * FROM documents WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return rows[0] || null;
}
```

---

## Apache Kafka — Event-Driven Ingestion

### Why Kafka?

When a large PDF is uploaded, parsing and embedding can take 30-60 seconds. Doing this synchronously would:
- Block the HTTP response until completion
- Risk a client timeout
- Make the API unresponsive during bursts

Kafka decouples the two concerns completely.

### Flow

```
┌─────────────┐    publish     ┌──────────────────┐    consume    ┌──────────────────┐
│  API Server │ ─────────────► │  Kafka Topic:    │ ────────────► │ Ingestion Worker │
│  (producer) │                │  doc-ingestion   │               │  (consumer)      │
└─────────────┘                └──────────────────┘               └──────────────────┘

Message payload:
{
  docId, tenantId, filename,
  mimeType, s3Key, buffer
}
```

### Analytics Events

After every chat message, `PersistHandler` publishes to a second Kafka topic:

```
{
  event:     'message_processed',
  tenantId,  sessionId,
  tokens:    responseTokens,
  latencyMs, fallback: false,
  timestamp: ISO8601
}
```

A separate `analyticsWorker` consumes this topic and aggregates stats into PostgreSQL — completely decoupled from the request path, so analytics processing never slows down the chat response.

### Kafka Setup (Docker Compose)

```yaml
zookeeper:
  image: confluentinc/cp-zookeeper:7.6.0
  environment:
    ZOOKEEPER_CLIENT_PORT: 2181

kafka:
  image: confluentinc/cp-kafka:7.6.0
  environment:
    KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,PLAINTEXT_INTERNAL://0.0.0.0:29092
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092,PLAINTEXT_INTERNAL://kafka:29092
    # Two listeners: external (host) and internal (container network)
```

---

## AWS Cloud Integration

### S3 — Raw Document Storage

Every uploaded file is stored in S3 **before** ingestion begins. This is the source of truth:

```
S3 key structure:
  tenants/{tenantId}/docs/{docId}/{filename}

Why S3 and not the database?
  - Binary blobs in PostgreSQL degrade query performance
  - S3 is durable (11 nines), cheap, and scales infinitely
  - Failed ingestion can be retried from S3 without re-upload
  - Pre-signed URLs allow future direct-download without proxying
```

### SDK Usage

```javascript
// Upload
await s3.send(new PutObjectCommand({
  Bucket:      process.env.S3_BUCKET,
  Key:         `tenants/${tenantId}/docs/${docId}/${filename}`,
  Body:        req.file.buffer,
  ContentType: mimeType,
}));

// Delete (when document is removed)
await s3.send(new DeleteObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key:    doc.s3_key,
}));
```

### Region Configuration

Bucket region must match `AWS_REGION` env variable. Mismatch causes `PermanentRedirect` errors — the SDK is configured with the correct region at startup.

---

## Multi-Tenancy & Data Isolation

This is a **single-deployment multi-tenant** system. One running process serves all customers, but their data is completely isolated at every layer:

| Layer | Isolation Mechanism |
|---|---|
| PostgreSQL | Explicit `WHERE tenant_id = $1` on every query + Row-Level Security |
| Pinecone | Separate namespace per tenant (`namespace(tenantId).query(...)`) |
| S3 | Key prefix `tenants/{tenantId}/...` |
| Redis | Key prefix `tenant:{tenantId}:...` |
| API | SHA-256 hashed API key maps to one and only one `tenantId` |

> **Note on PostgreSQL RLS:** The `postgres` superuser bypasses Row-Level Security. All queries use **explicit `WHERE tenant_id`** clauses as the primary guard, with RLS as a secondary defence-in-depth layer.

---

## Authentication & Security

### Two Auth Strategies

| Endpoint Type | Auth Method | How |
|---|---|---|
| Dashboard (browser) | JWT Bearer token | 15-min access token + httpOnly refresh cookie |
| Widget / API (server) | API Key | `x-api-key` header, SHA-256 hashed in DB |

### JWT Flow

```
Login → Access Token (15m) + Refresh Cookie (httpOnly, 7d)
                │
                ▼
Token expires → POST /auth/refresh (cookie sent automatically)
                │
                ▼
New access token issued (old refresh token rotated)
```

### API Key Security

```
Registration → plaintext key shown ONCE, never stored
                │
                ▼
SHA-256(key) stored in DB  (deterministic, no salt — lookup by hash)
                │
Request arrives with x-api-key header
                │
                ▼
SHA-256(header value) == DB hash?  YES → authenticate  NO → 401
```

SHA-256 is used (not bcrypt) because API key lookup requires computing the hash from the key, and bcrypt's random salt makes this impossible without knowing the tenant first.

### Helmet Security Headers

All responses include security headers via Helmet:
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (production)

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | None | Create tenant account, returns API key (shown once) |
| POST | `/auth/login` | None | Returns JWT access token + sets refresh cookie |
| POST | `/auth/refresh` | Cookie | Rotate refresh token, return new access token |
| POST | `/auth/logout` | JWT | Invalidate refresh cookie |

### Documents

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/documents/upload` | API Key | Upload PDF/DOCX/MD/TXT (max 10 MB), returns 202 |
| GET | `/api/documents` | JWT | List documents (cursor paginated) |
| DELETE | `/api/documents/:id` | JWT | Delete document + S3 file + Pinecone vectors |
| GET | `/api/documents/:id/status` | JWT | SSE stream of ingestion progress |

### Chat

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/chat/message` | API Key | Send message, SSE stream of tokens |
| GET | `/api/chat/sessions` | JWT | List chat sessions (cursor paginated) |
| GET | `/api/chat/sessions/:id/messages` | JWT | Full message history for a session |

### Analytics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/analytics/overview` | JWT | Today's messages, tokens, sessions, latency |

### Tenant

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/tenant/config` | JWT | Get widget configuration |
| PUT | `/api/tenant/config` | JWT | Update greeting, colour, fallback message, tone |

---

## Project Structure

```
rag-support-saas/
├── apps/
│   ├── api/                          # Express backend
│   │   ├── public/
│   │   │   └── widget.js             # Drop-in embed script
│   │   └── src/
│   │       ├── config/               # DB, Redis, Pinecone, S3, env
│   │       ├── db/
│   │       │   ├── migrate.js        # Schema migrations
│   │       │   └── queries/          # Repository layer (SQL)
│   │       ├── middleware/
│   │       │   ├── apiKeyAuth.js     # SHA-256 API key validation
│   │       │   ├── jwtAuth.js        # Bearer token validation
│   │       │   └── errorHandler.js   # Global error handler
│   │       ├── pipeline/
│   │       │   ├── MessagePipeline.js
│   │       │   └── handlers/
│   │       │       ├── ApiKeyHandler.js
│   │       │       ├── RateLimitHandler.js
│   │       │       ├── ContextBuildHandler.js
│   │       │       ├── LLMHandler.js
│   │       │       └── PersistHandler.js
│   │       ├── routes/               # Express routers
│   │       ├── services/
│   │       │   ├── EmbeddingService.js   # Gemini REST API
│   │       │   ├── IngestionService.js   # Parse → Chunk → Embed → Index
│   │       │   ├── RetrievalService.js   # Query → Pinecone → ranked chunks
│   │       │   ├── KafkaProducer.js
│   │       │   └── agents/
│   │       │       ├── BaseChatAgent.js  # Abstract base class
│   │       │       ├── AgentFactory.js   # Creates correct subclass by vertical
│   │       │       └── GenericAgent.js
│   │       ├── utils/
│   │       │   └── parsers/          # PDF, DOCX, MD, TXT strategies
│   │       ├── workers/
│   │       │   └── analyticsWorker.js  # Kafka consumer
│   │       ├── app.js                # Express app setup
│   │       └── server.js             # Entry point + graceful shutdown
│   │
│   └── web/                          # Next.js 14 dashboard
│       ├── app/
│       │   ├── (auth)/login          # Login page
│       │   ├── (auth)/register       # Registration + one-time API key
│       │   ├── dashboard/            # Analytics overview
│       │   ├── documents/            # Upload + manage documents
│       │   ├── chat/                 # Test chatbot
│       │   ├── sessions/             # Visitor conversation history
│       │   ├── embed/                # Widget embed instructions
│       │   └── settings/             # Widget customisation
│       ├── components/
│       │   ├── Sidebar.tsx
│       │   └── ProtectedLayout.tsx
│       └── lib/
│           ├── auth.ts               # localStorage token management
│           └── api.ts                # Fetch wrapper with auth headers
│
├── infra/                            # Infrastructure configs
├── docker-compose.yml                # PostgreSQL, Redis, Kafka, Zookeeper
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js >= 20
- Docker & Docker Compose
- AWS account with an S3 bucket
- [Pinecone](https://pinecone.io) account (free tier works)
- [Google AI Studio](https://aistudio.google.com) API key (Gemini)
- [Groq](https://groq.com) API key (free tier)

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/rag-support-saas.git
cd rag-support-saas
```

### 2. Start infrastructure

```bash
docker-compose up -d
# Starts: PostgreSQL, Redis, Kafka, Zookeeper
```

### 3. Configure the API

```bash
cd apps/api
cp .env.example .env
# Fill in all values (see Environment Variables section)
```

### 4. Run database migrations

```bash
npm run migrate
```

### 5. Start the API server

```bash
npm run dev
# API running at http://localhost:3000
```

### 6. Start the frontend

```bash
cd apps/web
npm install
npm run dev
# Dashboard at http://localhost:3001
```

### 7. Register and upload a document

1. Open `http://localhost:3001/register`
2. Create an account — copy your API key (shown once)
3. Go to **Documents** → upload a PDF
4. Wait for status to change to `indexed`
5. Go to **Test Chat** and ask a question about your document
6. Go to **Embed Widget** → copy the `<script>` snippet → paste into any HTML page

---

## Environment Variables

```env
# App
NODE_ENV=development
APP_URL=http://localhost:3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=ragsaas

# Redis
REDIS_URL=redis://localhost:6379

# Google Gemini (embeddings)
GEMINI_API_KEY=your-key
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_CHAT_MODEL=gemini-2.0-flash-lite

# Pinecone (vector DB)
PINECONE_API_KEY=your-key
PINECONE_INDEX_NAME=support-docs

# Groq (LLM)
GROQ_API_KEY=your-key
GROQ_MODEL=llama-3.1-8b-instant

# Apache Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=rag-support-api

# JWT
JWT_SECRET=run-openssl-rand-hex-32
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# AWS S3
AWS_REGION=ap-south-1
S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret

# RAG tuning
RETRIEVAL_SCORE_THRESHOLD=0.3
RETRIEVAL_TOP_K=5
CONTEXT_WINDOW_TURNS=6
```

---

## Deployment

### Recommended Stack

| Service | Platform | Notes |
|---|---|---|
| Next.js frontend | Vercel | Zero-config Next.js deployment |
| Express API | Railway | Set root directory: `apps/api` |
| PostgreSQL | Railway plugin | Auto-provisioned |
| Redis | Upstash | Serverless, free tier |
| Kafka | Upstash Kafka | Managed, free tier |

### Steps

```bash
# 1. Deploy API to Railway
#    Root directory: apps/api
#    Start command: node src/server.js
#    Add all env vars in Railway dashboard

# 2. Deploy frontend to Vercel
#    Root directory: apps/web
#    Add: NEXT_PUBLIC_API_URL=https://your-api.up.railway.app

# 3. Update CORS on Railway
#    CORS_ORIGIN=https://your-app.vercel.app
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Groq for LLM instead of OpenAI | Free tier with fast inference; llama-3.1-8b handles support tasks well |
| Gemini for embeddings | `gemini-embedding-001` is state-of-the-art at 1024 dims; free tier sufficient |
| SHA-256 for API keys (not bcrypt) | Bcrypt is non-deterministic (random salt); SHA-256 allows O(1) key lookup |
| Cursor pagination over OFFSET | OFFSET degrades to O(n) full-table scans; cursors use index seeks regardless of depth |
| SSE over WebSockets | SSE is unidirectional, HTTP-native, proxy-friendly; WebSockets are overkill for token streaming |
| Explicit WHERE tenant_id over RLS only | Postgres superuser bypasses RLS; explicit clauses are always enforced |

---

## License

MIT © 2026