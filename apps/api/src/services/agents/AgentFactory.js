const EcommerceSupportAgent = require('./EcommerceSupportAgent');
const TechSupportAgent      = require('./TechSupportAgent');
const GenericSupportAgent   = require('./GenericSupportAgent');

const VERTICAL_MAP = new Map([
  ['ecommerce', EcommerceSupportAgent],
  ['tech',      TechSupportAgent],
  ['generic',   GenericSupportAgent],
]);

class AgentFactory {
  static create(tenantConfig, retriever, contextWindow) {
    const AgentClass = VERTICAL_MAP.get(tenantConfig.vertical) ?? GenericSupportAgent;
    return new AgentClass({
      tenantId:      tenantConfig.id,
      tenantConfig,
      retriever,
      contextWindow,
    });
  }

  // Allows third-party verticals to be registered at startup without modifying this file.
  static register(vertical, AgentClass) {
    VERTICAL_MAP.set(vertical, AgentClass);
  }
}

module.exports = AgentFactory;
