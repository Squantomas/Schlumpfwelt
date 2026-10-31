import { describe, expect, it } from 'vitest';
import theme from '../../src/data/theme.json';
import indexHtml from '../../index.html?raw';
import swTemplate from '../../scripts/swTemplate.js?raw';
import { createManifest, createServiceWorker } from '../../scripts/pwaPlugin.mjs';

const OPTIONS = { name: theme.gameName, description: 'Beschreibung', color: '#8ed8f8', lang: 'de' };
const icons = Object.keys(import.meta.glob('/public/icons/*.png', { query: '?url' }));

describe('Web-App-Manifest', () => {
  const manifest = createManifest(OPTIONS);

  it('nimmt den Namen aus dem Theme und startet im eigenen Fenster', () => {
    expect(manifest['name']).toBe(theme.gameName);
    expect(manifest['short_name']).toBe(theme.gameName);
    expect(manifest['display']).toBe('standalone');
    expect(manifest['lang']).toBe('de');
  });

  it('hat nur relative Adressen, so dass es unter /Schlumpfwelt/ ebenso läuft wie lokal', () => {
    expect(manifest['start_url']).toBe('./');
    expect(manifest['scope']).toBe('./');
    for (const icon of manifest['icons'] as { src: string }[]) {
      expect(icon.src.startsWith('/')).toBe(false);
      expect(icon.src).not.toMatch(/^[a-z]+:/);
    }
  });

  it('nennt Symbole, die es gibt: 192 und 512 Pixel, dazu ein maskierbares', () => {
    const listed = manifest['icons'] as { src: string; sizes: string; type: string; purpose: string }[];
    expect(listed.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(listed.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of listed) {
      expect(icon.type).toBe('image/png');
      expect(icons, icon.src).toContain(`/public/${icon.src}`);
    }
    expect(icons).toContain('/public/icons/apple-touch-icon.png');
  });

  it('index.html verweist für das iPad auf das Symbol und kennt keinen Markennamen', () => {
    expect(indexHtml).toContain('apple-mobile-web-app-capable');
    expect(indexHtml).toContain('rel="apple-touch-icon"');
    expect(indexHtml).not.toMatch(/schl[uü]mpf|smurf/i);
  });
});

/** Ein winziger Nachbau der Service-Worker-Umgebung: Caches, Ereignisse, Netz. */
function makeWorld(files: readonly string[], online = true) {
  const scope = 'https://example.org/Schlumpfwelt/';
  const store = new Map<string, Map<string, string>>();
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const log = { skipWaiting: 0, claimed: 0, network: [] as string[] };
  const state = { online };

  const cacheApi = {
    keys: () => Promise.resolve([...store.keys()]),
    delete: (name: string) => Promise.resolve(store.delete(name)),
    open: (name: string) => {
      const entries = store.get(name) ?? new Map<string, string>();
      store.set(name, entries);
      return Promise.resolve({
        addAll: (requests: { url: string }[]) => {
          for (const request of requests) {
            entries.set(request.url, `Datei ${request.url}`);
          }
          return Promise.resolve();
        },
        match: (request: { url: string } | string, options?: { ignoreSearch?: boolean; ignoreVary?: boolean }) => {
          const url = typeof request === 'string' ? request : request.url;
          // The worker has to ask for `ignoreVary` (see the template); without it a `Vary: Origin` server never matches.
          if (options?.ignoreVary !== true) {
            return Promise.resolve(undefined);
          }
          const wanted = options?.ignoreSearch ? url.split('?')[0] : url;
          for (const [key, body] of entries) {
            if (key === wanted) {
              return Promise.resolve(body);
            }
          }
          return Promise.resolve(undefined);
        },
      });
    },
  };
  const self = {
    registration: { scope },
    location: new URL(scope),
    skipWaiting: () => {
      log.skipWaiting += 1;
      return Promise.resolve();
    },
    clients: {
      claim: () => {
        log.claimed += 1;
        return Promise.resolve();
      },
    },
    addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => {
      handlers.set(type, handler);
    },
  };
  class FakeRequest {
    readonly url: string;
    constructor(url: string) {
      this.url = url;
    }
  }
  const fakeFetch = (request: { url: string }): Promise<string> => {
    log.network.push(request.url);
    return state.online ? Promise.resolve(`Netz ${request.url}`) : Promise.reject(new Error('offline'));
  };
  const code = createServiceWorker(swTemplate, 'v-test', files);
  // The worker source runs in a made-up scope (that is the point of this test), not in the global one.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  new Function('self', 'caches', 'fetch', 'Request', code)(self, cacheApi, fakeFetch, FakeRequest);

  /** Fires an event; returns what the worker passed to `waitUntil` / `respondWith`. */
  const fire = async (type: string, extra: Record<string, unknown> = {}): Promise<{ waited?: unknown; answered?: unknown; responded: boolean }> => {
    let waited: Promise<unknown> | undefined;
    let answered: Promise<unknown> | undefined;
    handlers.get(type)?.({
      ...extra,
      waitUntil: (promise: Promise<unknown>) => {
        waited = promise;
      },
      respondWith: (promise: Promise<unknown>) => {
        answered = promise;
      },
    });
    return { waited: await waited, answered: answered === undefined ? undefined : await answered.catch((error: unknown) => error), responded: answered !== undefined };
  };
  return { scope, store, log, state, fire };
}

const request = (url: string, extra: Record<string, unknown> = {}) => ({ request: { url, method: 'GET', mode: 'cors', ...extra } });

describe('Service Worker', () => {
  const files = ['./', 'index.html', 'assets/index-abc.js', 'icons/icon-192.png'];

  it('legt beim Installieren alle Dateien in einen Cache mit der Version im Namen und übernimmt sofort', async () => {
    const world = makeWorld(files);
    await world.fire('install');
    expect([...world.store.keys()]).toEqual(['village:/Schlumpfwelt/:v-test']);
    expect([...(world.store.get('village:/Schlumpfwelt/:v-test')?.keys() ?? [])]).toEqual([
      'https://example.org/Schlumpfwelt/',
      'https://example.org/Schlumpfwelt/index.html',
      'https://example.org/Schlumpfwelt/assets/index-abc.js',
      'https://example.org/Schlumpfwelt/icons/icon-192.png',
    ]);
    expect(world.log.skipWaiting).toBe(1);
  });

  it('räumt beim Aktivieren alte Caches dieses Spiels weg, die anderer Kopien und fremde bleiben', async () => {
    const world = makeWorld(files);
    world.store.set('village:/Schlumpfwelt/:alt', new Map());
    world.store.set('village:/Schlumpfwelt/:aelter', new Map());
    // Another copy of the game on the same origin and something else entirely: not ours, not touched.
    world.store.set('village:/Schlumpfwelt-beta/:v1', new Map());
    world.store.set('anderes', new Map());
    await world.fire('install');
    await world.fire('activate');
    expect([...world.store.keys()].sort()).toEqual(['anderes', 'village:/Schlumpfwelt-beta/:v1', 'village:/Schlumpfwelt/:v-test']);
    expect(world.log.claimed).toBe(1);
  });

  it('antwortet aus dem Cache, auch wenn die Adresse einen Suchteil hat – ohne Netz', async () => {
    const world = makeWorld(files, false);
    await world.fire('install');
    const page = await world.fire('fetch', request('https://example.org/Schlumpfwelt/?seed=1&save=1', { mode: 'navigate' }));
    expect(page.answered).toBe('Datei https://example.org/Schlumpfwelt/');
    const script = await world.fire('fetch', request('https://example.org/Schlumpfwelt/assets/index-abc.js'));
    expect(script.answered).toBe('Datei https://example.org/Schlumpfwelt/assets/index-abc.js');
    expect(world.log.network).toHaveLength(0);
  });

  it('holt Unbekanntes aus dem Netz; ohne Netz bekommt eine Seitenanfrage das Spiel, anderes den Fehler', async () => {
    const world = makeWorld(files);
    await world.fire('install');
    const online = await world.fire('fetch', request('https://example.org/Schlumpfwelt/neu.json'));
    expect(online.answered).toBe('Netz https://example.org/Schlumpfwelt/neu.json');
    world.state.online = false;
    const page = await world.fire('fetch', request('https://example.org/Schlumpfwelt/irgendwo', { mode: 'navigate' }));
    expect(page.answered).toBe('Datei https://example.org/Schlumpfwelt/index.html');
    const other = await world.fire('fetch', request('https://example.org/Schlumpfwelt/neu.json'));
    expect(other.answered).toBeInstanceOf(Error);
  });

  it('rührt fremde Adressen, Adressen außerhalb des Spiels und Nicht-GET-Anfragen nicht an', async () => {
    const world = makeWorld(files);
    await world.fire('install');
    expect((await world.fire('fetch', request('https://fremd.example/x.js'))).responded).toBe(false);
    expect((await world.fire('fetch', request('https://example.org/anderes/x.js'))).responded).toBe(false);
    expect((await world.fire('fetch', request('https://example.org/Schlumpfwelt/index.html', { method: 'POST' }))).responded).toBe(false);
  });

  it('createServiceWorker füllt Version und Liste und lässt keinen Platzhalter übrig', () => {
    const code = createServiceWorker(swTemplate, 'abc123', ['./', 'index.html']);
    expect(code).toContain('const VERSION = "abc123";');
    expect(code).not.toContain('__VERSION__');
    expect(code).not.toContain('__FILES__');
    expect(code).toContain('"index.html"');
  });
});
