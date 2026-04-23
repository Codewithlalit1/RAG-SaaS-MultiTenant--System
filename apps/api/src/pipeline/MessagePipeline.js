// Chain-of-Responsibility runner.
//
// Each handler must expose an async handle(ctx) method.
// Handlers are executed sequentially in registration order.
// Any handler may throw to abort the pipeline; the error propagates to the caller.
class MessagePipeline {
  constructor() {
    this.handlers = [];
  }

  // use(handler) — registers a handler and returns `this` for chaining.
  use(handler) {
    this.handlers.push(handler);
    return this;
  }

  // run(ctx) — passes ctx through each handler in order.
  async run(ctx) {
    for (const handler of this.handlers) {
      await handler.handle(ctx);
    }
  }
}

module.exports = MessagePipeline;
