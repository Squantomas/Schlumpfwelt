import type { SceneKey } from './keys';

/**
 * Marks the active scene as `<html data-scene="…">`. Lets Playwright tests
 * wait for a scene without reaching into Phaser internals.
 */
export function markActiveScene(key: SceneKey): void {
  document.documentElement.dataset.scene = key;
}
