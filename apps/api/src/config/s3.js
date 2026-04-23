const { S3Client } = require('@aws-sdk/client-s3');
const config = require('./env');
const logger = require('./logger');

// Credentials come from the environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
// in local dev, or the ECS task IAM role in production — never hardcoded).
const s3 = new S3Client({ region: config.aws.region });

logger.info('S3 client initialised', {
  region: config.aws.region,
  bucket: config.aws.s3Bucket,
});

// S3 key pattern: tenants/{tenantId}/docs/{docId}/{filename}
function docKey(tenantId, docId, filename) {
  return `tenants/${tenantId}/docs/${docId}/${filename}`;
}

module.exports = { s3, bucket: config.aws.s3Bucket, docKey };
