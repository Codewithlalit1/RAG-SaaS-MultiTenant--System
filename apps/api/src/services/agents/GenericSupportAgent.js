const BaseChatAgent = require('./BaseChatAgent');

class GenericSupportAgent extends BaseChatAgent {
  buildSystemPrompt() {
    const name     = this.tenantConfig.name;
    const tone     = this.tenantConfig.widget_config?.tone     ?? 'helpful-professional';
    const language = this.tenantConfig.widget_config?.language ?? 'en';
    const greeting = this.tenantConfig.widget_config?.greeting ?? `Welcome! How can I help you today?`;

    return [
      `You are a helpful customer support assistant for ${name}.`,
      '',
      'INSTRUCTIONS:',
      '- Answer ONLY using the knowledge base context provided above.',
      '- If the answer is not in the context, say: "I don\'t have information on that. Please reach out to our support team."',
      '- Keep answers concise and easy to understand.',
      '- Use bullet points for multi-part answers.',
      '- Never fabricate facts, policies, or contact details.',
      '',
      `GREETING: ${greeting}`,
      `TONE: ${tone}`,
      `LANGUAGE: Respond in ${language}.`,
    ].join('\n');
  }

  getRetrievalTopK() {
    return 5;
  }
}

module.exports = GenericSupportAgent;
