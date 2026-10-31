/**
 * Saving and loading as pure functions on plain data (M5): the state becomes a
 * save made of plain data (`toSaveData`), and anything that claims to be one
 * becomes a valid state again (`fromSaveData`) – or a reason why not. Nothing
 * here touches IndexedDB, files or timers; that is `src/save/`.
 *
 * Format and versions:
 * - `format` marks our files (`SAVE_FORMAT`), `version` is the schema version.
 * - Version 3 (current, M6) adds the residents: who they are, where they live
 *   and work, where they are and where they go (with their way), the boats on
 *   the water, the next resident id and the residents' random generator.
 * - Version 2 holds everything else that makes up a village: the seed,
 *   the terrain (it changes since M4: trees, rocks, beaches), buildings, paths,
 *   store, production, unlocks, earned coins, planted trees and rocks. A
 *   village of version 2 gets its residents when it is loaded: one worker
 *   per production building, already at work (`migrateV2ToV3`).
 * - Version 1 is the state before M4, where the island was always the one
 *   the seed generates (no terrain, no planted tiles, no unlocks). No build
 *   ever shipped it; it stays as the first link of the chain of migrations
 *   (`MIGRATIONS`, one pure function per step: v1 → v2 → …) and as its test.
 * - A file with a **newer** version than we know is rejected (`tooNew`): it is
 *   neither read nor, by the caller, overwritten.
 *
 * Loading never trusts the data: every field goes through the normalizers of
 * the simulation (unknown building types dropped, buildings only on ground they
 * may stand on, production entries for exactly the production buildings,
 * whole amounts within the limits …). Whatever is not recoverable is `broken`;
 * the caller then starts a new game. No time is made up for: the loaded
 * state continues at its tick, nothing is earned while the game was closed.
 */
import { buildingType } from '../data/buildings';
import worldData from '../data/world.json';
import { MAX_AMOUNT } from '../data/goods';
import { MAX_BUILDINGS, MAX_ID, MAX_PRODUCERS } from './limits';
import { footprintTiles, normalizePaths, tileIndex } from './buildings';
import type { PlacedBuilding } from './buildings';
import { PRODUCER_STATUSES, newProducer, normalizeInventory, productionOf, type ProducerState, type ProducerStatus } from './economy';
import { generateIsland } from './islandGen';
import { normalizePlanted, type PlantedTile } from './island';
import { refreshStatuses } from './production';
import { normalizeSeed } from './random';
import type { DeepReadonly } from './readonly';
import { readResidents } from './residentSave';
import { residentSeed, type Boat, type Resident } from './residents';
import type { SimState } from './state';
import { checkUnlocks, normalizeUnlocked } from './unlocks';
import { TERRAINS, createWorld, inBounds, isLand, type Terrain, type World } from './world';

/** Marks our files; any other JSON is `notSave`. */
export const SAVE_FORMAT = 'village-save';

/** The schema version `toSaveData` writes. Raise it with every change of the format and add a migration. */
export const SAVE_VERSION = 3;

/**
 * Limits against absurd files (a loaded village must never make the game stand still): a map side in tiles is at
 * least this small / at most twice the side of the island of `world.json` (room for the expansions of M10), a
 * village has at most this many buildings and production buildings (the real limit is the room on the map, a
 * child's village has dozens), ids stay below 2³¹ (`limits.ts`), and every counter stays a safe whole number.
 */
const MIN_SIDE = 8;
const MAX_SIDE = 2 * Math.max(worldData.width, worldData.height);


/** Why a save could not be read. */
export type SaveRejection = 'notSave' | 'tooNew' | 'broken';

export type LoadResult =
  | { readonly ok: true; readonly state: SimState }
  | { readonly ok: false; readonly reason: SaveRejection };

/** One letter per terrain in the saved map (`w` water, `s` sand, `g` grass, `f` forest, `r` rock). */
const TERRAIN_LETTERS: Readonly<Record<Terrain, string>> = { water: 'w', sand: 's', grass: 'g', forest: 'f', rock: 'r' };
const LETTER_TERRAINS = new Map<string, Terrain>(TERRAINS.map((terrain) => [TERRAIN_LETTERS[terrain], terrain]));

/** The save of the current version (plain data, ready for `JSON.stringify` and for IndexedDB). */
export interface SaveData {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  seed: number;
  world: { width: number; height: number; terrain: string };
  tick: number;
  revision: number;
  buildings: PlacedBuilding[];
  nextBuildingId: number;
  paths: number[];
  inventory: Record<string, number>;
  production: ProducerState[];
  earnedCoins: number;
  unlocked: string[];
  planted: PlantedTile[];
  residents: Resident[];
  nextResidentId: number;
  boats: Boat[];
  residentRng: number;
}

/** The state as a save. Copies everything, so the result does not change when the game goes on. */
export function toSaveData(state: DeepReadonly<SimState>): SaveData {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    seed: state.seed,
    world: { width: state.world.width, height: state.world.height, terrain: terrainText(state.world.tiles) },
    tick: state.tick,
    revision: state.revision,
    buildings: state.buildings.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y })),
    nextBuildingId: state.nextBuildingId,
    paths: [...state.paths],
    inventory: { ...state.inventory },
    production: state.production.map((p) => ({ buildingId: p.buildingId, progress: p.progress, status: p.status, delivered: p.delivered, lastSale: p.lastSale })),
    earnedCoins: state.earnedCoins,
    unlocked: [...state.unlocked],
    planted: state.planted.map((p) => ({ index: p.index, type: p.type })),
    residents: state.residents.map((r) => ({
      id: r.id,
      name: r.name,
      hat: r.hat,
      home: r.home,
      job: r.job,
      at: r.at,
      route: [...r.route],
      step: r.step,
      doing: r.doing,
      goal: r.goal,
      place: r.place,
      timer: r.timer,
      carrying: r.carrying,
      seen: r.seen,
      trips: r.trips,
    })),
    nextResidentId: state.nextResidentId,
    boats: state.boats.map((b) => ({ id: b.id, at: b.at, route: [...b.route], step: b.step, passenger: b.passenger, shore: b.shore })),
    residentRng: state.residentRng,
  };
}

/** The save as the text of a file. */
export function saveToText(state: DeepReadonly<SimState>): string {
  return JSON.stringify(toSaveData(state));
}

/** Reads the text of a file: anything that is not JSON of ours is `notSave`. */
export function loadFromText(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'notSave' };
  }
  return fromSaveData(parsed);
}

/**
 * Turns anything into a valid state, or says why it can not: not one of our
 * saves (`notSave`), made by a newer version (`tooNew`), or damaged beyond
 * repair (`broken`). Never throws.
 */
export function fromSaveData(raw: unknown): LoadResult {
  try {
    if (!isRecord(raw) || raw['format'] !== SAVE_FORMAT) {
      return { ok: false, reason: 'notSave' };
    }
    const version = raw['version'];
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return { ok: false, reason: 'notSave' };
    }
    if (version > SAVE_VERSION) {
      return { ok: false, reason: 'tooNew' };
    }
    const current = migrateSave(raw, version);
    const state = current ? stateFromCurrent(current) : undefined;
    return state ? { ok: true, state } : { ok: false, reason: 'broken' };
  } catch {
    // Whatever the data looked like: a damaged save must never crash the game.
    return { ok: false, reason: 'broken' };
  }
}

// --- Migrations ---

type SaveRecord = Record<string, unknown>;

/** One step of the chain: turns a save of version N into one of version N + 1. Pure. */
export type Migration = (data: Readonly<SaveRecord>) => SaveRecord;

/**
 * Version 1 → 2: the terrain was not saved (the island was always the one the
 * seed makes), so it is generated from the seed; planted trees and rocks,
 * unlocks and earned coins did not exist yet and start empty (the unlocks are
 * worked out again from the buildings when the state is loaded).
 */
export function migrateV1ToV2(data: Readonly<SaveRecord>): SaveRecord {
  const world = generateIsland(normalizeSeed(typeof data['seed'] === 'number' ? data['seed'] : 0));
  return {
    ...data,
    version: 2,
    world: { width: world.width, height: world.height, terrain: terrainText(world.tiles) },
    planted: [],
    unlocked: [],
    earnedCoins: typeof data['earnedCoins'] === 'number' ? data['earnedCoins'] : 0,
  };
}

/**
 * Version 2 → 3 (M6): there were no residents yet. The village starts without any; loading then gives every
 * production building its worker, standing at work (not by boat), and every worker a home where there is room –
 * so the economy goes on exactly as before.
 */
export function migrateV2ToV3(data: Readonly<SaveRecord>): SaveRecord {
  return {
    ...data,
    version: 3,
    residents: [],
    boats: [],
    nextResidentId: 1,
    residentRng: residentSeed(normalizeSeed(typeof data['seed'] === 'number' ? data['seed'] : 0)),
  };
}

/** The steps by the version they start at: `MIGRATIONS[1]` leads from version 1 to 2. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = { 1: migrateV1ToV2, 2: migrateV2ToV3 };

/**
 * Applies the steps one after the other from `from` up to `target`. Returns
 * `undefined` if a step is missing or fails (the save is then `broken`).
 */
export function migrateSave(data: Readonly<SaveRecord>, from: number, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, target: number = SAVE_VERSION): SaveRecord | undefined {
  let current: SaveRecord = { ...data };
  for (let version = from; version < target; version += 1) {
    const step = migrations[version];
    if (!step) {
      return undefined;
    }
    current = step(current);
    if (current['version'] !== version + 1) {
      return undefined;
    }
  }
  return current;
}

// --- From a save of the current version to a state ---

function stateFromCurrent(data: Readonly<SaveRecord>): SimState | undefined {
  const world = readWorld(data['world']);
  if (!world) {
    return undefined;
  }
  const area = world.width * world.height;
  const buildingsRaw = Array.isArray(data['buildings']) ? (data['buildings'] as unknown[]) : [];
  const pathsRaw = Array.isArray(data['paths']) ? (data['paths'] as unknown[]) : [];
  if (buildingsRaw.length > area || pathsRaw.length > area) {
    return undefined;
  }

  const state: SimState = {
    seed: normalizeSeed(typeof data['seed'] === 'number' ? data['seed'] : 0),
    world,
    tick: wholeNumber(data['tick'], 0),
    paused: false,
    buildings: [],
    nextBuildingId: 1,
    paths: [],
    inventory: normalizeInventory(data['inventory']),
    production: [],
    earnedCoins: Math.min(MAX_AMOUNT, wholeNumber(data['earnedCoins'], 0)),
    unlocked: normalizeUnlocked(data['unlocked']),
    planted: normalizePlanted(data['planted'], world),
    residents: [],
    nextResidentId: 1,
    boats: [],
    residentRng: 0,
    revision: wholeNumber(data['revision'], 0),
  };

  // Buildings first; a path is only kept on ground that takes paths and not under a building.
  state.buildings = readBuildings(buildingsRaw, state.world);
  const covered = new Set(state.buildings.flatMap((b) => footprintTiles(buildingType(b.type) ?? { footprint: { w: 1, h: 1 } }, b.x, b.y).map((tile) => tileIndex(world, tile.x, tile.y))));
  const pathType = buildingType('path');
  state.paths = normalizePaths(pathsRaw.filter((index): index is number => typeof index === 'number')).filter(
    (index) => index < area && !covered.has(index) && pathType?.terrains.includes(world.tiles[index] ?? 'water') === true,
  );
  // Ids are never reused, but a number so high that the village would run out of ids is a damaged file: start again right above the highest id.
  const lowest = Math.max(1, ...state.buildings.map((b) => b.id + 1));
  const saved = wholeNumber(data['nextBuildingId'], 1);
  state.nextBuildingId = saved > MAX_ID - MAX_BUILDINGS ? lowest : Math.max(saved, lowest);
  state.production = readProduction(data['production'], state.buildings);
  readResidents(data, state);

  refreshStatuses(state);
  checkUnlocks(state);
  return state;
}

function readWorld(raw: unknown): World | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const { width, height, terrain } = raw;
  if (typeof width !== 'number' || typeof height !== 'number' || typeof terrain !== 'string') {
    return undefined;
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < MIN_SIDE || height < MIN_SIDE || width > MAX_SIDE || height > MAX_SIDE) {
    return undefined;
  }
  const tiles = terrainFromText(terrain, width * height);
  if (!tiles) {
    return undefined;
  }
  const world: World = { ...createWorld(width, height), tiles };
  // A map without any land has nothing to play on.
  return tiles.some((tile) => isLand(tile)) ? world : undefined;
}

/**
 * The buildings that make sense: known standing types, whole coordinates, a
 * footprint inside the map on ground the type may stand on, not overlapping a
 * building that was already accepted (a path under a building is dropped later). Ids must be whole,
 * positive and unique; the result is in order of the ids (= the order they
 * were built).
 */
function readBuildings(raw: readonly unknown[], world: World): PlacedBuilding[] {
  const candidates: PlacedBuilding[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }
    const { id, type, x, y } = entry;
    if (typeof id === 'number' && Number.isInteger(id) && id >= 1 && id < MAX_ID && typeof type === 'string' && typeof x === 'number' && typeof y === 'number' && Number.isInteger(x) && Number.isInteger(y)) {
      candidates.push({ id, type, x, y });
    }
  }
  candidates.sort((a, b) => a.id - b.id);

  const accepted: PlacedBuilding[] = [];
  const taken = new Set<number>();
  const ids = new Set<number>();
  let producers = 0;
  for (const candidate of candidates) {
    if (accepted.length >= MAX_BUILDINGS) {
      break;
    }
    const type = buildingType(candidate.type);
    if (type?.category === 'production' && producers >= MAX_PRODUCERS) {
      continue;
    }
    if (!type || (type.category !== 'house' && type.category !== 'deco' && type.category !== 'production') || ids.has(candidate.id)) {
      continue;
    }
    const tiles = footprintTiles(type, candidate.x, candidate.y);
    const fits = tiles.every(({ x, y }) => {
      const index = tileIndex(world, x, y);
      return inBounds(world, x, y) && type.terrains.includes(world.tiles[index] ?? 'water') && !taken.has(index);
    });
    if (!fits) {
      continue;
    }
    for (const { x, y } of tiles) {
      taken.add(tileIndex(world, x, y));
    }
    ids.add(candidate.id);
    accepted.push(candidate);
    if (type.category === 'production') {
      producers += 1;
    }
  }
  return accepted;
}

/** Exactly one entry for every production building, in the order of the buildings; entries without a building are dropped. */
function readProduction(raw: unknown, buildings: readonly PlacedBuilding[]): ProducerState[] {
  const saved = new Map<number, Record<string, unknown>>();
  if (Array.isArray(raw)) {
    for (const entry of raw as unknown[]) {
      if (isRecord(entry) && typeof entry['buildingId'] === 'number') {
        saved.set(entry['buildingId'], entry);
      }
    }
  }
  const result: ProducerState[] = [];
  for (const building of buildings) {
    const rules = productionOf(building.type);
    if (!rules) {
      continue;
    }
    const entry = saved.get(building.id);
    if (!entry) {
      result.push(newProducer(building.id));
      continue;
    }
    const progress = wholeNumber(entry['progress'], 0);
    const status = entry['status'];
    result.push({
      buildingId: building.id,
      // A round that is "over" in the file starts again; the inputs of a running round were already taken.
      progress: progress < rules.intervalTicks ? progress : 0,
      status: PRODUCER_STATUSES.includes(status as ProducerStatus) ? (status as ProducerStatus) : 'working',
      delivered: wholeNumber(entry['delivered'], 0),
      lastSale: wholeNumber(entry['lastSale'], 0),
    });
  }
  return result;
}

// --- Terrain as text ---

function terrainText(tiles: readonly Terrain[]): string {
  return tiles.map((tile) => TERRAIN_LETTERS[tile]).join('');
}

/**
 * The terrain from its text: exactly `length` letters, otherwise `undefined`.
 * Letters nobody knows become water (the safe ground: nothing may stand on it).
 */
export function terrainFromText(text: string, length: number): Terrain[] | undefined {
  if (text.length !== length) {
    return undefined;
  }
  return Array.from(text, (letter) => LETTER_TERRAINS.get(letter) ?? 'water');
}

// --- Small helpers ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A whole number of at least 0 (fractions are cut off); anything else is `fallback`. */
function wholeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value))) : fallback;
}
