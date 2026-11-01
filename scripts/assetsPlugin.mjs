/**
 * Raster replacements for the drawn pictures (M9): the game draws every picture as SVG; a file
 * `public/assets/<key>.png` or `.webp` replaces the picture of its key. Which files exist is decided
 * when the game is built – this plugin offers the list as the module `virtual:raster-assets` – so the
 * game never asks the server for a file that is not there (no 404 in the console, nothing to wait for).
 *
 * The folder is the `publicDir` of the build (the smoke test builds once with a copy of `public/` that
 * has an extra picture in it, `VILLAGE_PUBLIC_DIR`, without touching the repository). In `npm run dev`
 * a new or removed file reloads the page.
 */
import { existsSync, readdirSync } from 'node:fs';
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

export function assetsPlugin() {
  let publicDir = 'public';
  return {
    name: 'raster-assets',
    configResolved(config) {
      publicDir = config.publicDir || publicDir;
    },
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      return id === RESOLVED ? `export default ${JSON.stringify(listRasterFiles(publicDir))};` : undefined;
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
