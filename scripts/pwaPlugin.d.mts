import type { Plugin } from 'vite';

export interface PwaOptions {
  /** Name of the game (from the theme): shown under the icon and in the install dialog. */
  readonly name: string;
  /** One sentence for the manifest. */
  readonly description: string;
  /** Colour of the splash screen and the browser bar. */
  readonly color: string;
  /** Language code of the texts, e.g. `de`. */
  readonly lang: string;
}

/** Makes the built game an installable web app: manifest, service worker with the list of files, link tags. */
export function pwaPlugin(options: PwaOptions): Plugin;

/** The manifest as an object (also used by the tests). */
export function createManifest(options: PwaOptions): Record<string, unknown>;

/** The service worker source: the template with its two placeholders filled. */
export function createServiceWorker(template: string, version: string, files: readonly string[]): string;
