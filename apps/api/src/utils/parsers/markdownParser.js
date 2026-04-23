// Strips Markdown syntax, returning plain text suitable for the RAG pipeline.
// We don't convert to HTML — we want the raw content without markup noise.

function parse(buffer) {
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8');

  return text
    .replace(/^#{1,6}\s+/gm, '')                  // headings
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')       // bold / italic
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')         // underline / italic
    .replace(/`{3}[\s\S]*?`{3}/g, '')              // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')                   // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')               // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')       // links — keep label text
    .replace(/^[-*+]\s+/gm, '')                    // unordered list bullets
    .replace(/^\d+\.\s+/gm, '')                    // ordered list numbers
    .replace(/^[-*_]{3,}\s*$/gm, '')               // horizontal rules
    .replace(/^>\s+/gm, '')                        // blockquotes
    .replace(/\n{3,}/g, '\n\n')                    // collapse excessive blank lines
    .trim();
}

module.exports = { parse };
