const { v4: uuidv4 } = require('uuid');
const multer         = require('multer');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const router         = require('express').Router();

const { s3, bucket, docKey } = require('../config/s3');
const { namespace }           = require('../config/pinecone');
const db                      = require('../config/db');
const redis                   = require('../config/redis');
const logger                  = require('../config/logger');
const apiKeyAuth              = require('../middleware/apiKeyAuth');
const jwtAuth                 = require('../middleware/jwtAuth');
const ingestionService        = require('../services/IngestionService');
const docQueries              = require('../db/queries/documents');

// ─── Multer — memory storage, 10 MB limit ────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), { statusCode: 415 }));
    }
  },
});

// ─── POST /api/documents/upload — api-key auth ───────────────────────────────
// 1. Multer parses multipart — file in req.file
// 2. Upload to S3
// 3. Create DB row (status = 'processing')
// 4. Fire-and-forget ingestDocument
// 5. Return 202 + docId

router.post(
  '/upload',
  apiKeyAuth,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded (field name must be "file")' });
      }

      const { tenantId } = req;
      const docId    = uuidv4();
      const filename = req.file.originalname;
      const mimeType = req.file.mimetype;
      const s3Key    = docKey(tenantId, docId, filename);

      // Upload raw file to S3
      await s3.send(
        new PutObjectCommand({
          Bucket:      bucket,
          Key:         s3Key,
          Body:        req.file.buffer,
          ContentType: mimeType,
        })
      );

      // Persist document row (status = 'processing') before starting ingest
      await ingestionService.saveDocumentRecord(tenantId, {
        docId, filename, s3Key, mimeType,
      });

      // Kick off ingestion asynchronously — route returns immediately
      ingestionService.ingestDocument({
        docId, tenantId, filename, mimeType, s3Key,
        buffer: req.file.buffer,
      });

      logger.info('Upload accepted', { docId, tenantId, filename, bytes: req.file.size });

      return res.status(202).json({ docId, filename, status: 'processing' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/documents — jwt auth, cursor-paginated ─────────────────────────

router.get('/', jwtAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '20', 10), 100);
    const cursor = req.query.cursor || null;

    const rows = await db.withTenant(req.tenantId, (client) =>
      docQueries.findByTenant(client, { tenantId: req.tenantId, cursor, limit })
    );

    const hasMore = rows.length > limit;
    const data    = hasMore ? rows.slice(0, limit) : rows;

    return res.json({
      data,
      pagination: {
        hasMore,
        nextCursor: hasMore ? data[data.length - 1].created_at.toISOString() : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/documents/:id — jwt auth ────────────────────────────────────
// Deletes from DB, S3, and Pinecone (reconstructs chunk IDs from chunk_count).

router.delete('/:id', jwtAuth, async (req, res, next) => {
  try {
    const { tenantId } = req;
    const docId = req.params.id;

    // Find doc first to get s3_key and chunk_count (also confirms ownership via RLS)
    const doc = await db.withTenant(tenantId, (client) =>
      docQueries.findById(client, { id: docId, tenantId })
    );

    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Delete vectors from Pinecone (reconstruct chunk IDs from chunk_count)
    if (doc.chunk_count > 0) {
      const chunkIds = Array.from(
        { length: doc.chunk_count },
        (_, i) => `${docId}-chunk-${i}`
      );
      await namespace(tenantId).deleteMany(chunkIds);
    }

    // Delete raw file from S3
    await s3.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: doc.s3_key })
    );

    // Remove DB row (CASCADE handles children)
    await db.withTenant(tenantId, (client) =>
      docQueries.remove(client, { id: docId, tenantId })
    );

    logger.info('Document deleted', { docId, tenantId });

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/documents/:id/status — jwt auth, SSE ───────────────────────────
// Streams ingestion progress events from Redis until status reaches a terminal state.

router.get('/:id/status', jwtAuth, async (req, res, next) => {
  try {
    const key = `doc:status:${req.params.id}`;

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const poll = setInterval(async () => {
      try {
        const raw  = await redis.get(key);
        const data = raw ? JSON.parse(raw) : { status: 'processing', progress: 0 };

        send(data);

        if (data.status === 'indexed' || data.status === 'failed') {
          clearInterval(poll);
          res.end();
        }
      } catch (err) {
        logger.error('SSE poll error', { message: err.message });
        clearInterval(poll);
        res.end();
      }
    }, 500);

    // Clean up when the client disconnects (tab closed, navigation, etc.)
    req.on('close', () => clearInterval(poll));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
