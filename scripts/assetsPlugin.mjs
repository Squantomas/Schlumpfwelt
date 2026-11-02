/**
 * Raster replacements for the drawn pictures (M9): the game draws every picture as SVG; a file
 * `public/assets/<key>.png` or `.webp` replaces the picture of its key. Which files exist is decided
 * when the game is built – this plugin offers the list as the module `virtual:raster-assets` – so the
 * game never asks the server for a file that is not there (no 404 in the console, nothing to wait for).
 *
 * The folder is the `publicDir` of the build (the smoke test builds once with a copy of `public/` that
 * has an extra picture in it, `VILLAGE_PUBLIC_DIR`, without touching the repository). In `npm run dev`
 * a new or removed file reloads the page.
 *
 * A file whose name is no key (a typo, `tre-round.png`) replaces nothing: the build warns about it, and the game names
 * it in `<html data-assets>` as `unused`. The keys come from the prompt templates in `docs/assets/` (one heading per
 * key, made from `src/art/catalog.ts` by `npm run prompts`; `tests/art/prompts.test.ts` keeps them up to date) – so the
 * Vite config does not have to load the whole catalog.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ID = 'virtual:raster-assets';
const RESOLVED = `\0${ID}`;
/** Only file names a key can have: small letters, digits and dashes. */
const NAME = /^[a-z0-9-]+\.(png|webp)$/;

/** The names a raster file of a key can have, sorted (`.gitkeep`, `Foo.PNG`, `a b.png` are left out). */
export function rasterNames(names) {
  return names.filter((name) => NAME.test(name)).sort();
}

/** The raster files in `<dir>/assets/`, sorted. */
export function listRasterFiles(publicDir) {
  const folder = join(publicDir, 'assets');
  if (!existsSync(folder)) {
    return [];
  }
  return rasterNames(readdirSync(folder));
}

/** The keys of all pictures, read from the headings of the prompt templates (`## \`key\``) in `docsDir`, sorted. */
export function promptKeys(docsDir) {
  if (!existsSync(docsDir)) {
    return [];
  }
  const keys = [];
  for (const file of readdirSync(docsDir).filter((name) => name.endsWith('.md') && name !== 'README.md')) {
    for (const match of readFileSync(join(docsDir, file), 'utf8').matchAll(/^## `([a-z0-9-]+)`$/gm)) {
      keys.push(match[1]);
    }
  }
  return keys.sort();
}

/** The files of `files` whose name is no key (they replace nothing), sorted. */
export function unknownRasterFiles(keys, files) {
  const known = new Set(keys);
  return rasterNames(files).filter((file) => !known.has(file.replace(/\.(png|webp)$/, '')));
}

/**
 * @param {{ keys?: () => readonly string[], list?: (publicDir: string) => string[] }} [options]
 *   `keys`: the keys of the catalog (default: from `docs/assets/`); `list`: how the folder is read (tests).
 */
export function assetsPlugin(options = {}) {
  const list = options.list ?? listRasterFiles;
  let publicDir = 'public';
  let root = '.';
  return {
    name: 'raster-assets',
    configResolved(config) {
      publicDir = config.publicDir || publicDir;
      root = config.root || root;
    },
    buildStart() {
      const keys = options.keys?.() ?? promptKeys(join(root, 'docs', 'assets'));
      const unknown = unknownRasterFiles(keys, list(publicDir));
      if (unknown.length > 0) {
        this.warn(`public/assets/: ${unknown.join(', ')} – kein Schlüssel aus src/art/catalog.ts, diese Dateien ersetzen kein Bild (Tippfehler im Namen?).`);
      }
    },
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      return id === RESOLVED ? `export default ${JSON.stringify(list(publicDir))};` : undefined;
    },
    configureServer(server) {
      const folder = join(publicDir, 'assets');
      const changed = (file) => {
        if (file.startsWith(folder)) {
          const module = server.moduleGraph.getModuleById(RESOLVED);
          if (module) {
            server.moduleGraph.invalidateModule(module);
          }
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.add(folder);
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
    },
  };
}
