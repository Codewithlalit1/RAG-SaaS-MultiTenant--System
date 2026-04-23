const mammoth = require('mammoth');

async function parse(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { parse };
