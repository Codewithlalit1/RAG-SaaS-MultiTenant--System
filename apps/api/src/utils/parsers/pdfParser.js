const pdfParse = require('pdf-parse');

async function parse(buffer) {
  try {
    const data = await pdfParse(buffer);
    return cleanText(data.text);
  } catch (err) {
    if (
      err.message?.includes('Command token too long') ||
      err.message?.includes('bad XRef') ||
      err.message?.includes('Invalid PDF') ||
      err.name === 'FormatError'
    ) {
      throw new Error('PDF file is malformed or unsupported. Please export a fresh PDF from Word or Google Docs and try again.');
    }
    throw err;
  }
}

function cleanText(text) {
  return text
    .replace(/\f/g, '\n')          // form-feed page breaks → newline
    .replace(/\n{3,}/g, '\n\n')    // collapse excessive blank lines
    .trim();
}

module.exports = { parse };
