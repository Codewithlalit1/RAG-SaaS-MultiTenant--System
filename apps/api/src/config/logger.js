const config = require('./env');

const LEVELS = {
  error: 'ERROR',
  warn: 'WARN ',
  info: 'INFO ',
  debug: 'DEBUG',
};

function timestamp() {
  return new Date().toISOString();
}

function write(level, message, meta) {
  const prefix = `[${timestamp()}] [${LEVELS[level]}]`;
  if (meta !== undefined) {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      prefix,
      message,
      meta
    );
  } else {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      prefix,
      message
    );
  }
}

const logger = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => {
    if (config.nodeEnv !== 'production') write('debug', message, meta);
  },
};

module.exports = logger;
