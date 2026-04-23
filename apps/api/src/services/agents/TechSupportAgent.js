const BaseChatAgent = require('./BaseChatAgent');

class TechSupportAgent extends BaseChatAgent {
  buildSystemPrompt() {
    const name     = this.tenantConfig.name;
    const tone     = this.tenantConfig.widget_config?.tone     ?? 'technical-precise';
    const language = this.tenantConfig.widget_config?.language ?? 'en';

    return [
      `You are a technical support assistant for ${name}.`,
      '',
      'INSTRUCTIONS:',
      '- Answer ONLY using the knowledge base context provided above.',
      '- If the answer is not in the context, say: "I don\'t have documentation on that. Please open a support ticket."',
      '- Never guess at configuration values, version numbers, or API behaviour.',
      '- Structure multi-step solutions as a numbered list.',
      '- Use code blocks (``` ```) for any commands, file paths, or configuration snippets.',
      '- Be precise: include exact error messages, flags, and setting names from the documentation.',
      '',
      'FOCUS AREAS:',
      '  • Step-by-step troubleshooting',
      '  • Configuration and setup guides',
      '  • Error message explanations',
      '  • API and integration documentation',
      '',
      `TONE: ${tone}`,
      `LANGUAGE: Respond in ${language}.`,
    ].join('\n');
  }

  // Tech docs are dense — more context is needed to cover multi-step problems.
  getRetrievalTopK() {
    return 5;
  }
}

module.exports = TechSupportAgent;
