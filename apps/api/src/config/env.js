require('dotenv').config();

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  db: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    name:     process.env.DB_NAME     || 'ragsaas',
  },
  redisUrl: process.env.REDIS_URL,

  gemini: {
    apiKey:         process.env.GEMINI_API_KEY,
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
    chatModel:      process.env.GEMINI_CHAT_MODEL      || 'gemini-2.0-flash',
  },

  pinecone: {
    apiKey: process.env.PINECONE_API_KEY,
    indexName: process.env.PINECONE_INDEX_NAME || 'support-docs',
    environment: process.env.PINECONE_ENVIRONMENT,
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model:  process.env.GROQ_MODEL   || 'llama-3.1-8b-instant',
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'rag-support-api',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  aws: {
    region: process.env.AWS_REGION || 'ap-south-1',
    s3Bucket: process.env.S3_BUCKET,
  },

  rag: {
    scoreThreshold: parseFloat(process.env.RETRIEVAL_SCORE_THRESHOLD || '0.75'),
    topK: parseInt(process.env.RETRIEVAL_TOP_K || '5', 10),
    contextWindowTurns: parseInt(process.env.CONTEXT_WINDOW_TURNS || '6', 10),
  },

  apiKeySaltRounds: parseInt(process.env.API_KEY_SALT || '10', 10),
};

// Keys that must be present in production
const REQUIRED_IN_PRODUCTION = [
  ['db.password',     'DB_PASSWORD'],
  ['redisUrl',        'REDIS_URL'],
  ['gemini.apiKey',   'GEMINI_API_KEY'],
  ['pinecone.apiKey', 'PINECONE_API_KEY'],
  ['jwt.secret',      'JWT_SECRET'],
  ['aws.s3Bucket',    'S3_BUCKET'],
];

// Keys required in every environment
const REQUIRED_ALWAYS = [
  ['db.password',  'DB_PASSWORD'],
  ['redisUrl',     'REDIS_URL'],
  ['jwt.secret',   'JWT_SECRET'],
  ['gemini.apiKey','GEMINI_API_KEY'],
];

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function validate() {
  const required =
    config.nodeEnv === 'production' ? REQUIRED_IN_PRODUCTION : REQUIRED_ALWAYS;

  const missing = required
    .filter(([path]) => !getNestedValue(config, path))
    .map(([, envKey]) => envKey);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Copy .env.example to .env and fill in the values.'
    );
  }
}

validate();

module.exports = Object.freeze(config);
