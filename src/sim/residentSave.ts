/**
 * Reading the residents and boats of a save (M6, save version 3; their food since M7, version 4). Loading
 * never trusts the data: every field is checked and brought into range, and
 * whatever does not fit is repaired so that nobody hangs – a resident on
 * water or without a valid way stands at the door of their work (or home)
 * and plans again, a boat without a valid way lands where it is, a resident
 * "on a boat" that is not there steps onto land. Ids are unique, names are
 * cut to {@link MAX_NAME_LENGTH}, and the numbers stay within the limits of
 * `limits.ts`. Afterwards `settleResidents` gives every production building
 * its worker (on land: nothing is caught up, nobody arrives late by boat).
 */
import { HAT_IDS, LONGEST_TIMER, MAX_NAME_LENGTH, RESIDENT_NAMES } from '../data/residents';
import { isItem, COINS } from '../data/goods';
import { MAX_BOATS, MAX_ID, MAX_RESIDENTS, MAX_ROUTE } from './limits';
import { normalizeSeed } from './random';
import { LONGEST_MEAL, firstMeal } from './mood';
import { DOINGS, GOALS, STEPS_PER_TILE, residentSeed, settleResidents, type Boat, type Doing, type Goal, type Resident } from './residents';
import type { SimState } from './state';
import { doorOf, isWalkable } from './walk';

/** Longest stay or wait a file may ask for (ticks): the longest of the routine. */
const MAX_TIMER = LONGEST_TIMER;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function whole(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : fallback;
}

function idOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value < MAX_ID ? value : null;
}

/** The name cut to its first {@link MAX_NAME_LENGTH} letters; an empty or missing one gets a first name by the id. */
function readName(value: unknown, id: number): string {
  const name = typeof value === 'string' ? Array.from(value.trim()).slice(0, MAX_NAME_LENGTH).join('').trim() : '';
  return name !== '' ? name : (RESIDENT_NAMES[(id - 1) % RESIDENT_NAMES.length] ?? 'Lumo');
}

/** A way that starts next to `from` and goes on tile by tile (each next to the one before) over tiles `ok` accepts; else `undefined`. */
function readRoute(value: unknown, from: number, width: number, area: number, ok: (index: number) => boolean): number[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ROUTE) {
    return undefined;
  }
  const route: number[] = [];
  let previous = from;
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0 || entry >= area || !ok(entry)) {
      return undefined;
    }
    const px = previous % width;
    const ex = entry % width;
    const distance = Math.abs(px - ex) + Math.abs((previous - px) / width - (entry - ex) / width);
    if (distance !== 1) {
      return undefined;
    }
    route.push(entry);
    previous = entry;
  }
  return route;
}

/** Reads `residents`, `boats`, `nextResidentId` and `residentRng` of a save into `state` (buildings and world are read already). */
export function readResidents(data: Readonly<Record<string, unknown>>, state: SimState): void {
  const world = state.world;
  const { width } = world;
  const area = width * world.height;
  const walkable = (index: number): boolean => isWalkable(world, index);
  const center = Math.floor(world.height / 2) * width + Math.floor(width / 2);
  const firstLand = walkable(center) ? center : world.tiles.findIndex((tile) => tile !== 'water');
  const byId = new Map(state.buildings.map((building) => [building.id, building]));
  /** Where a resident without a valid tile stands: at the door of their work, else their home, else the middle of the island. */
  const standingPlace = (job: number | null, home: number | null): number => {
    const building = byId.get(job ?? -1) ?? byId.get(home ?? -1);
    const door = building ? doorOf(state, building) : firstLand;
    return walkable(door) ? door : Math.max(0, firstLand);
  };

  const residents: Resident[] = [];
  const ids = new Set<number>();
  const rawResidents = Array.isArray(data['residents']) ? (data['residents'] as unknown[]) : [];
  for (const entry of rawResidents) {
    if (residents.length >= MAX_RESIDENTS) {
      break;
    }
    if (!isRecord(entry)) {
      continue;
    }
    const id = idOrNull(entry['id']);
    if (id === null || ids.has(id)) {
      continue;
    }
    ids.add(id);
    const home = idOrNull(entry['home']);
    const job = idOrNull(entry['job']);
    const savedAt = entry['at'];
    const atValid = typeof savedAt === 'number' && Number.isInteger(savedAt) && savedAt >= 0 && savedAt < area && walkable(savedAt);
    const at = atValid ? savedAt : standingPlace(job, home);
    const doingRaw = entry['doing'];
    const goalRaw = entry['goal'];
    let doing: Doing = DOINGS.includes(doingRaw as Doing) ? (doingRaw as Doing) : 'wait';
    const goal: Goal = GOALS.includes(goalRaw as Goal) ? (goalRaw as Goal) : 'visit';
    let route = atValid ? readRoute(entry['route'], at, width, area, walkable) : undefined;
    let timer = whole(entry['timer'], 1, MAX_TIMER);
    if (route === undefined) {
      route = [];
      if (doing === 'walk') {
        // No valid way: plan again in the next tick.
        doing = 'wait';
        timer = 1;
      }
    }
    const hatRaw = entry['hat'];
    const carryingRaw = entry['carrying'];
    residents.push({
      id,
      name: readName(entry['name'], id),
      hat: typeof hatRaw === 'number' && Number.isInteger(hatRaw) && hatRaw >= 0 && hatRaw < HAT_IDS.length ? hatRaw : id % Math.max(1, HAT_IDS.length),
      home,
      job,
      at,
      route,
      step: route.length > 0 ? whole(entry['step'], 0, STEPS_PER_TILE - 1) : 0,
      doing,
      goal,
      place: idOrNull(entry['place']),
      timer,
      carrying: typeof carryingRaw === 'string' && carryingRaw !== COINS && isItem(carryingRaw) ? carryingRaw : null,
      seen: whole(entry['seen'], 0),
      trips: whole(entry['trips'], 0, 1000),
      meal: whole(entry['meal'], firstMeal(residents.length, rawResidents.length), LONGEST_MEAL),
      hungry: entry['hungry'] === true,
    });
  }
  residents.sort((a, b) => a.id - b.id);

  // Boats: on water, along water, each with at most one passenger who is on board.
  const boats: Boat[] = [];
  const boatIds = new Set<number>();
  const onBoard = new Set<number>();
  const waiting = new Map(residents.filter((resident) => resident.doing === 'boat').map((resident) => [resident.id, resident]));
  const rawBoats = Array.isArray(data['boats']) ? (data['boats'] as unknown[]) : [];
  const water = (index: number): boolean => world.tiles[index] === 'water';
  for (const entry of rawBoats) {
    if (boats.length >= MAX_BOATS) {
      break;
    }
    if (!isRecord(entry)) {
      continue;
    }
    const id = idOrNull(entry['id']);
    const at = entry['at'];
    if (id === null || boatIds.has(id) || typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at >= area || !water(at)) {
      continue;
    }
    boatIds.add(id);
    const passengerId = idOrNull(entry['passenger']);
    const passenger = passengerId !== null && passengerId === id && !onBoard.has(passengerId) ? waiting.get(passengerId) : undefined;
    const shoreRaw = entry['shore'];
    const shore = typeof shoreRaw === 'number' && Number.isInteger(shoreRaw) && shoreRaw >= 0 && shoreRaw < area && walkable(shoreRaw) ? shoreRaw : undefined;
    const route = readRoute(entry['route'], at, width, area, water) ?? [];
    if (passenger && shore === undefined) {
      continue;
    }
    if (passenger && shore !== undefined) {
      onBoard.add(passenger.id);
      passenger.at = shore;
    }
    boats.push({ id, at, route, step: route.length > 0 ? whole(entry['step'], 0, STEPS_PER_TILE - 1) : 0, passenger: passenger ? passenger.id : null, shore: shore ?? at });
  }
  // A resident "on a boat" that is not there stands on land and plans again.
  for (const resident of residents) {
    if (resident.doing === 'boat' && !onBoard.has(resident.id)) {
      resident.at = walkable(resident.at) ? resident.at : standingPlace(resident.job, resident.home);
      resident.doing = 'wait';
      resident.route = [];
      resident.step = 0;
      resident.timer = 1;
    }
  }

  state.residents = residents;
  state.boats = boats;
  // Ids are never reused; a number so high that the village would run out of ids starts again right above the highest one.
  const lowest = Math.max(1, ...residents.map((resident) => resident.id + 1), ...boats.map((boat) => boat.id + 1));
  const saved = whole(data['nextResidentId'], 1);
  state.nextResidentId = saved > MAX_ID - MAX_RESIDENTS ? lowest : Math.max(saved, lowest);
  const rng = data['residentRng'];
  state.residentRng = typeof rng === 'number' && Number.isFinite(rng) ? normalizeSeed(rng) : residentSeed(state.seed);
  settleResidents(state, 'land');
}
