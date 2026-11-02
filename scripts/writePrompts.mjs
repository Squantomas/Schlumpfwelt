// Writes the prompt templates of all pictures to docs/assets/ (M9): one file per group, made from src/art/catalog.ts.
// `npm run prompts` after a picture was added or changed; tests/art/prompts.test.ts checks that the files are up to date.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { promptDocs } = await server.ssrLoadModule('/src/art/prompts.ts');
  const dir = new URL('../docs/assets/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const docs = promptDocs();
  for (const [file, content] of Object.entries(docs)) {
    writeFileSync(new URL(file, dir), content);
  }
  console.log(`${String(Object.keys(docs).length)} Dateien in docs/assets/ geschrieben.`);
} finally {
  await server.close();
}
