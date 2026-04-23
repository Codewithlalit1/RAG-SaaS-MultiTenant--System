// Pre-built chat pipeline — singleton exported for reuse across requests.
//
// Handler order matters:
//   ApiKey      → copy tenant identity from req to ctx
//   RateLimit   → enforce daily limit before doing any expensive work
//   ContextBuild→ warm embedding cache + load history (parallel)
//   LLM         → set SSE headers, stream response
//   Persist     → save messages to DB + Redis + Kafka.
const MessagePipeline     = require('./MessagePipeline');
const ApiKeyHandler       = require('./handlers/ApiKeyHandler');
const RateLimitHandler    = require('./handlers/RateLimitHandler');
const ContextBuildHandler = require('./handlers/ContextBuildHandler');
const LLMHandler          = require('./handlers/LLMHandler');
const PersistHandler      = require('./handlers/PersistHandler');
const retriever           = require('../services/retriever');
const contextWindow       = require('../services/ContextWindowService');

module.exports = new MessagePipeline()
  .use(new ApiKeyHandler())
  .use(new RateLimitHandler())
  .use(new ContextBuildHandler({ retriever, contextWindow }))
  .use(new LLMHandler({ retriever, contextWindow }))
  .use(new PersistHandler({ contextWindow }));
