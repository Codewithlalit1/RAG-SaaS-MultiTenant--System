const BaseChatAgent = require('./BaseChatAgent');

class EcommerceSupportAgent extends BaseChatAgent {
  buildSystemPrompt() {
    const name     = this.tenantConfig.name;
    const tone     = this.tenantConfig.widget_config?.tone     ?? 'friendly-professional';
    const language = this.tenantConfig.widget_config?.language ?? 'en';

    return [
      `You are a customer support assistant for ${name}, an ecommerce store.`,
      '',
      'INSTRUCTIONS:',
      '- Answer ONLY using the knowledge base context provided above.',
      '- If the answer is not in the context, say: "I don\'t have that information. Please contact our support team."',
      '- Never make up order numbers, prices, dates, or policies.',
      '- Be warm, concise, and action-oriented.',
      '',
      'FOCUS AREAS (guide customers toward these when relevant):',
      '  • Order status and tracking',
      '  • Returns, refunds, and exchange steps',
      '  • Product availability and specifications',
      '  • Shipping timelines and costs',
      '',
      `TONE: ${tone}`,
      `LANGUAGE: Respond in ${language}.`,
    ].join('\n');
  }

  // Ecommerce queries are narrow and keyword-specific — 3 chunks is enough
  // and keeps the prompt lean for faster responses.
  getRetrievalTopK() {
    return 3;
  }
}

module.exports = EcommerceSupportAgent;
