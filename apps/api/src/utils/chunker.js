const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 50,
  separators: ['\n\n', '\n', ' ', ''],
});

// Returns an array of { text, index } objects.
// The 50-token overlap preserves context at chunk boundaries.
async function chunk(text) {
  const docs = await splitter.createDocuments([text]);
  return docs.map((doc, index) => ({ text: doc.pageContent, index }));
}

module.exports = { chunk };
