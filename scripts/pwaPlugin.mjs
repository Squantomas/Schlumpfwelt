/**
 * Vite plugin: makes the built game an installable web app that also runs offline.
 *
 * - `manifest.webmanifest` is made from the theme (name) at build time, so the name of the game stays in
 *   `src/data/theme.json` only; the address (`start_url`, `scope`) is relative to the base of the page
 *   (`/Schlumpfwelt/` on GitHub Pages).
 * - `sw.js` is the template `scripts/swTemplate.js` with the list of all files of the build and a version
 *   (a hash over their names and contents), written after everything else is in `dist/`.
 * - The link to the manifest goes into index.html (with the base), also in development; there is no service
 *   worker in development, so changes show up at once.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_FILE = 'manifest.webmanifest';
const WORKER_FILE = 'sw.js';

/** The manifest; every address is relative to the manifest itself. */
export function createManifest({ name, description, color, lang }) {
  return {
    name,
    short_name: name,
    description,
    lang,
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'any',
    background_color: color,
    theme_color: color,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/** Fills the two placeholders of the service worker template. */
export function createServiceWorker(template, version, files) {
  return template.replace("'__VERSION__'", JSON.stringify(version)).replace('__FILES__', JSON.stringify(files, null, 2));
}

/** All files below `dir` as paths relative to it with `/`, without hidden files and without the worker itself. */
function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith('.')) {
      continue;
    }
    const relative = prefix === '' ? entry : `${prefix}/${entry}`;
    if (statSync(path.join(dir, entry)).isDirectory()) {
      files.push(...listFiles(path.join(dir, entry), relative));
    } else if (relative !== WORKER_FILE) {
      files.push(relative);
    }
  }
  return files;
}

export function pwaPlugin(options) {
  let config;
  const manifestText = `${JSON.stringify(createManifest(options), null, 2)}\n`;
  return {
    name: 'pwa',
    configResolved(resolved) {
      config = resolved;
    },
    // Development: the manifest is served so the link in the page does not fail (no worker, though).
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? '').split('?')[0] === `${config.base}${MANIFEST_FILE}`) {
          response.setHeader('Content-Type', 'application/manifest+json');
          response.end(manifestText);
          return;
        }
        next();
      });
    },
    transformIndexHtml() {
      return [{ tag: 'link', attrs: { rel: 'manifest', href: `${config.base}${MANIFEST_FILE}` }, injectTo: 'head' }];
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: MANIFEST_FILE, source: manifestText });
    },
    // After the build everything is in dist/ (also the files of `public/`): list them and write the worker.
    closeBundle: {
      order: 'post',
      handler() {
        if (config.command !== 'build') {
          return;
        }
        const outDir = path.resolve(config.root, config.build.outDir);
        const files = listFiles(outDir);
        const hash = createHash('sha256');
        for (const file of files) {
          hash.update(file);
          hash.update(readFileSync(path.join(outDir, file)));
        }
        const template = readFileSync(path.join(HERE, 'swTemplate.js'), 'utf8');
        // "./" is the page itself (the address of the game without a file name).
        writeFileSync(path.join(outDir, WORKER_FILE), createServiceWorker(template, hash.digest('hex').slice(0, 12), ['./', ...files]));
      },
    },
  };
}
