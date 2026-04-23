// Transfers tenant identity from the Express request (populated by apiKeyAuth
// middleware) onto ctx so downstream pipeline handlers are decoupled from req.
class ApiKeyHandler {
  async handle(ctx) {
    ctx.tenantId     = ctx.req.tenantId;
    ctx.tenantPlan   = ctx.req.tenantPlan;
    ctx.tenantConfig = ctx.req.tenantConfig;
  }
}

module.exports = ApiKeyHandler;
