import type { SceneKey } from './keys';

/**
 * Marks the active scene as `<html data-scene="…">`. Lets Playwright tests
 * wait for a scene without reaching into Phaser internals.
 */
export function markActiveScene(key: SceneKey): void {
  document.documentElement.dataset.scene = key;
}

/**
 * Publishes the camera as `<html data-camera-zoom data-camera-x data-camera-y …>`
 * (only when a rounded value changes), so Playwright tests can check dragging,
 * zooming and the limits without reaching into Phaser.
 */
export function markCamera(info: {
  readonly zoom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Number of land tiles that are at least partly in view. */
  readonly landInView: number;
}): void {
  const data = document.documentElement.dataset;
  const next = {
    cameraZoom: info.zoom.toFixed(4),
    cameraX: info.centerX.toFixed(1),
    cameraY: info.centerY.toFixed(1),
    cameraMinZoom: info.minZoom.toFixed(4),
    cameraMaxZoom: info.maxZoom.toFixed(4),
    cameraLand: String(info.landInView),
  };
  for (const [key, value] of Object.entries(next)) {
    if (data[key] !== value) {
      data[key] = value;
    }
  }
}

/** Publishes the last tapped tile as `<html data-last-tap="x,y">` (for tests). */
export function markTap(tile: { readonly x: number; readonly y: number }): void {
  document.documentElement.dataset.lastTap = `${String(tile.x)},${String(tile.y)}`;
}

/** Publishes the building state for tests (`<html data-tool data-preview data-buildings …>`, only on change). */
export function markVillage(info: {
  readonly tool: string;
  readonly variant: string;
  /** `none`, or `place:ok`, `path:2/1`, … – what the preview says. */
  readonly preview: string;
  readonly hint: string;
  readonly markers: number;
  /** `[id, type, x, y, connected]` per building. */
  readonly buildings: string;
  /** Path tiles as `x,y;x,y;…`. */
  readonly paths: string;
  /** Terrain letters per tile, row by row (`w` water, `s` sand, `g` grass, `f` forest, `r` rock). */
  readonly terrain: string;
  /** Controls on screen: `{ name: { x, y, enabled } }` in CSS px. */
  readonly ui: string;
  /** The numbers in the store bar as `{ coins: 60, wood: 14, … }`. */
  readonly stock: string;
  /** `[building id, status, times delivered, pace in percent (M7)]` per production building. */
  readonly producers: string;
  /** Id of the building whose info card is open, or an empty text. */
  readonly card: string;
  /** The shop: `closed`, or `<tab>:<page>/<pages>`. */
  readonly shop: string;
  /** The sentence on a locked shop card that was tapped (empty when none is shown). */
  readonly tip: string;
  /** Ids of the unlocked types (those with a condition), comma separated, in the order they were reached. */
  readonly unlocked: string;
  /** Coins the market has earned in total. */
  readonly earned: string;
  /** Number of trees and rocks the player planted. */
  readonly planted: string;
  /** What redrawing the ground cost: `{"count":…,"last":ms,"max":ms,"tiles":…}`. */
  readonly repaint: string;
  /** The menu behind the gear: `closed`, `menu`, `menu:<sentence key>` or `confirm`. */
  readonly menu: string;
  /** Where the controls of the open menu are (CSS px) as JSON, `{}` while it is closed. */
  readonly menuSpots: string;
  /**
   * M6: the residents as JSON (`id`, `name`, `hat`, `job` and `home` as building types, `activity`, `carrying`,
   * `timer`, feet `x`/`y` in world px, body `sx`/`sy` on screen in CSS px); M7: `mood`, `reason` (the key of the
   * reason on the card), `hungry`, `homeId` and `sign` 1 while the heart or cloud shows over the head.
   */
  readonly residents: string;
  /** M6: the boats as JSON (`id`, `passenger`, `at`, `shore`, tiles `left` to sail). */
  readonly boats: string;
  /** M6: id of the resident whose card is open, or an empty text. */
  readonly residentCard: string;
  /** M7: the resident being carried as JSON (`resident`, finger `sx`/`sy` in CSS px, house under it: `house`, `result`, `used`, `capacity`), or an empty text. */
  readonly drag: string;
  /** M7: the "2/2" shown over the house of a move preview, or an empty text. */
  readonly homeLabel: string;
  /** M7: the tick of the simulation (to measure how fast a building works). */
  readonly tick: string;
}): void {
  const data = document.documentElement.dataset;
  const next = {
    tool: info.tool,
    variant: info.variant,
    preview: info.preview,
    hint: info.hint,
    markers: String(info.markers),
    buildings: info.buildings,
    paths: info.paths,
    terrain: info.terrain,
    ui: info.ui,
    stock: info.stock,
    producers: info.producers,
    card: info.card,
    shop: info.shop,
    tip: info.tip,
    unlocked: info.unlocked,
    earned: info.earned,
    planted: info.planted,
    repaint: info.repaint,
    menu: info.menu,
    menuSpots: info.menuSpots,
    residents: info.residents,
    boats: info.boats,
    residentCard: info.residentCard,
    drag: info.drag,
    homeLabel: info.homeLabel,
    tick: info.tick,
  };
  for (const [key, value] of Object.entries(next)) {
    if (data[key] !== value) {
      data[key] = value;
    }
  }
}

/** Publishes how saving stands (`<html data-save>`, JSON: store, autosave, start, saves, failures, savedTick) for tests. */
export function markSave(info: string): void {
  document.documentElement.dataset.save = info;
}

/** Publishes what the frames cost (`<html data-perf>`, JSON: `total` frames, then over the last ones `frames`, `mean`, `p95`, `max`, the simulation's and drawing's share, residents, boats) for tests. */
export function markPerf(info: string): void {
  document.documentElement.dataset.perf = info;
}
