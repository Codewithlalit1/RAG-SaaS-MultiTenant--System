const AgentFactory = require('../../services/agents/AgentFactory');
const logger       = require('../../config/logger');

// Sets SSE headers, streams GPT-4o tokens from the agent, and captures the
// full response text on ctx for PersistHandler.
//
// SSE headers are intentionally set here — not in the route — so that 4xx
// errors thrown by earlier handlers (RateLimitHandler, etc.) can still be
// returned as plain JSON responses.
class LLMHandler {
  constructor({ retriever, contextWindow }) {
    this.retriever     = retriever;
    this.contextWindow = contextWindow;
  }

  async handle(ctx) {
    const agent = AgentFactory.create(ctx.tenantConfig, this.retriever, this.contextWindow);

    ctx.res.setHeader('Content-Type',  'text/event-stream');
    ctx.res.setHeader('Cache-Control', 'no-cache');
    ctx.res.setHeader('Connection',    'keep-alive');
    ctx.res.flushHeaders();

    const parts = [];

    for await (const token of agent.chat(ctx.message, ctx.sessionId)) {
      ctx.res.write(`data: ${JSON.stringify({ token })}\n\n`);
      parts.push(token);
    }

    ctx.res.write('data: [DONE]\n\n');

    ctx.responseText = parts.join('');
    ctx.latencyMs    = Date.now() - ctx.startedAt;

    logger.debug('LLMHandler: stream complete', {
      tenantId:  ctx.tenantId,
      sessionId: ctx.sessionId,
      latencyMs: ctx.latencyMs,
    });
  }
}

module.exports = LLMHandler;
