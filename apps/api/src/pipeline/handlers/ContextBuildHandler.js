const logger = require('../../config/logger');

// Fetches retrieval chunks and session history in parallel and attaches both
// to ctx.  Downstream handlers (LLMHandler, PersistHandler) read from ctx
// rather than issuing their own retrieval calls.
//
// Note: BaseChatAgent.chat() internally re-fetches embeddings and history but
// hits the Redis cache that ContextBuildHandler already warmed, so the second
// call is effectively free.
class ContextBuildHandler {
  constructor({ retriever, contextWindow }) {
    this.retriever     = retriever;
    this.contextWindow = contextWindow;
  }

  async handle(ctx) {
    const [chunks, history] = await Promise.all([
      this.retriever.retrieve(ctx.message, ctx.tenantId),
      this.contextWindow.getHistory(ctx.sessionId),
    ]);

    ctx.chunks  = chunks;
    ctx.history = history;

    logger.debug('ContextBuildHandler: context ready', {
      tenantId:     ctx.tenantId,
      sessionId:    ctx.sessionId,
      chunks:       chunks.length,
      historyTurns: history.length,
    });
  }
}

module.exports = ContextBuildHandler;
