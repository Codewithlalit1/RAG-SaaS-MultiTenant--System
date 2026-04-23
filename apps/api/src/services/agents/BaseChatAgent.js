const Groq   = require('groq-sdk');
const config  = require('../../config/env');
const logger  = require('../../config/logger');

const DEFAULT_FALLBACK =
  "I don't have information on that in our knowledge base. Please contact support directly.";

class BaseChatAgent {
  #groq;

  constructor({ tenantId, tenantConfig, retriever, contextWindow }) {
    if (new.target === BaseChatAgent) {
      throw new Error('BaseChatAgent is abstract — instantiate a subclass');
    }
    this.tenantId      = tenantId;
    this.tenantConfig  = tenantConfig;
    this.retriever     = retriever;
    this.contextWindow = contextWindow;
    this.#groq = new Groq({ apiKey: config.groq.apiKey });
  }

  // ── Template method ──────────────────────────────────────────────────────────
  // Yields string tokens as they arrive from the Gemini stream.
  async *chat(message, sessionId) {
    const topK   = this.getRetrievalTopK();
    const chunks = await this.retriever.retrieve(message, this.tenantId, topK);

    // Fallback path — no relevant chunks found.
    if (chunks.length === 0) {
      logger.debug('BaseChatAgent: fallback triggered — no chunks passed threshold', {
        tenantId: this.tenantId, sessionId,
      });
      yield this.tenantConfig.widget_config?.fallbackMessage
        ?? this.tenantConfig.fallbackMessage
        ?? DEFAULT_FALLBACK;
      return;
    }

    const history  = await this.contextWindow.getHistory(sessionId);
    const messages = this.#buildPrompt(chunks, history, message);

    logger.debug('BaseChatAgent: starting Groq stream', {
      tenantId: this.tenantId, sessionId,
      chunks: chunks.length, historyTurns: history.length,
    });

    const stream = await this.#groq.chat.completions.create({
      model:       config.groq.model,
      messages,
      temperature: 0.3,
      stream:      true,
    });

    let totalTokens = 0;
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        totalTokens++;
        yield token;
      }
    }

    logger.debug('BaseChatAgent: stream complete', {
      tenantId: this.tenantId, sessionId, chunks: totalTokens,
    });
  }

  // ── Abstract hook — subclasses MUST implement ────────────────────────────────
  buildSystemPrompt() {
    throw new Error(`${this.constructor.name} must implement buildSystemPrompt()`);
  }

  // ── Virtual hook — subclasses MAY override ───────────────────────────────────
  getRetrievalTopK() {
    return 5;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  // Builds:
  //   systemInstruction — system prompt + knowledge base context block
  //   geminiHistory     — prior turns in Gemini's {role, parts} format
  //
  // Gemini differences from OpenAI:
  //   - System prompt goes into `systemInstruction`, not the messages array
  //   - Role names: 'user' and 'model' (not 'assistant')
  //   - History must alternate user / model, starting with user
  #buildPrompt(chunks, history, message) {
    const systemContent = [
      this.buildSystemPrompt(),
      '',
      this.#formatContext(chunks),
    ].join('\n');

    return [
      { role: 'system',    content: systemContent },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user',      content: message },
    ];
  }

  // Formats retrieved chunks as a numbered, source-attributed context block.
  #formatContext(chunks) {
    const items = chunks.map(
      (c, i) =>
        `[${i + 1}] Source: ${c.filename} (relevance: ${c.score.toFixed(2)})\n${c.text}`
    );
    return `[Relevant Knowledge Base Context]\n\n${items.join('\n\n---\n\n')}`;
  }
}

module.exports = BaseChatAgent;
