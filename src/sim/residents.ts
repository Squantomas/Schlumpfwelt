/**
 * The residents of the village (M6): who they are, where they live and work,
 * and how they walk through the village. Pure and deterministic like the rest
 * of the simulation; everything random comes from the residents' own seeded
 * generator (`SimState.residentRng`).
 *
 * Rules (kept as simple as a child expects them):
 * - Every resident has a name (from `names.json`; each name is used once
 *   before any name comes twice, then with a number: "Lumo 2"), a hat colour
 *   and – if they work – a job: the job of the production building they work
 *   at ("Holzfäller").
 * - **Every production building has exactly one worker, at once.** A building
 *   that is placed takes the nearest resident without work; if there is none,
 *   a new resident is invited for free and comes by boat. The building works
 *   from the moment it stands, as before M6: residents never slow the economy
 *   down and never stop it. Demolishing a workplace leaves its worker without
 *   work (they take the next building that needs someone).
 * - **Houses** have room for `capacity` residents (`buildings.json`). A
 *   resident without a home moves into the nearest house with room (nearest
 *   to their work) as soon as there is one; demolishing a house only makes its
 *   residents look for a new one. Nobody is ever sent away.
 * - **Inviting** (the shop item in the tab "Häuser") costs coins and needs room
 *   in a house; the new resident comes by boat to the coast next to the
 *   village, steps out and walks home.
 * - **The day:** a worker walks to work, waits for the next round of their
 *   building, carries what it made to the nearest market and walks back;
 *   after a few deliveries (or a while at the market) they walk home for a
 *   rest. Residents without work stroll from building to building and home.
 * - **Carrying is only shown:** the store gets the goods when the round ends,
 *   exactly as before; the good in a resident's hands is a picture of it. So
 *   the first minutes are not slower and no way, however long, costs anything.
 * - **Ways** are found with A* (`walk.ts`): paths first, over the meadow if
 *   there is no path, through a building only if there is no other way.
 *   Whenever the village changes, every resident checks their goal: if it is
 *   gone they pick a new one, if its door moved they plan again – from the
 *   tile they are walking to, so nobody jumps. Nobody waits for ever: if there
 *   is no way, they try again a little later.
 */
import { buildingType, capacityOf } from '../data/buildings';
import { HAT_IDS, RESIDENT_NAMES, RESIDENT_RULES } from '../data/residents';
import type { PlacedBuilding } from './buildings';
import { costOf, missingAmounts, takeAmounts, type ProducerState } from './economy';
import { MAX_BOATS, MAX_RESIDENTS } from './limits';
import { Rng, hash2, normalizeSeed } from './random';
import type { DeepReadonly } from './readonly';
import type { SimState } from './state';
import { doorOf, findWalk, isWalkable, landingFor, seaWays, walkSpeed, wayOut, type WalkView } from './walk';

/**
 * - `boat`: on the boat that brings them (not on the map yet).
 * - `walk`: on the way to their goal (`route`).
 * - `stay`: at their goal: at work, resting at home, or looking at a place.
 * - `wait`: there was no way to the goal; they try again when `timer` runs out.
 */
export const DOINGS = ['boat', 'walk', 'stay', 'wait'] as const;
export type Doing = (typeof DOINGS)[number];

/** Where a resident goes or is: home, work, the market (with something to bring) or a place to look at. */
export const GOALS = ['home', 'work', 'market', 'visit'] as const;
export type Goal = (typeof GOALS)[number];

export interface Resident {
  /** Never reused (see `SimState.nextResidentId`). */
  id: number;
  name: string;
  /** Index into the hat colours (`HAT_IDS`). */
  hat: number;
  /** The house they live in (building id), `null` while they look for one. */
  home: number | null;
  /** The production building they work at (building id), `null` without work. */
  job: number | null;
  /** The tile they stand on, or last reached (tile index); on the boat: the tile they will step onto. */
  at: number;
  /** The tiles still to walk, the next one first. */
  route: number[];
  /** Steps walked from `at` towards the first tile of `route` (see `walk.stepsPerTile`). */
  step: number;
  doing: Doing;
  goal: Goal;
  /** The building of the goal (`null`: a stroll in a village without buildings). */
  place: number | null;
  /** Ticks left of a stay (or of waiting). */
  timer: number;
  /** The good they carry to the market (only a picture: the store already has it), or `null`. */
  carrying: string | null;
  /** How many rounds their workplace had finished when they last looked (a new round is something to carry). */
  seen: number;
  /** Deliveries since the last rest at home. */
  trips: number;
}

/** A boat that brings a new resident to the coast and sails away again. */
export interface Boat {
  /** The id of the resident it brings (or brought). */
  id: number;
  /** The tile of water it is on (tile index). */
  at: number;
  route: number[];
  step: number;
  /** The resident on board, `null` once they stepped out (the boat is sailing away). */
  passenger: number | null;
  /** The tile of land the passenger steps onto. */
  shore: number;
}

/** Steps per tile for walking and sailing. */
export const STEPS_PER_TILE = RESIDENT_RULES.walk.stepsPerTile;

/** Where a new resident comes from: by boat (an invitation in the game) or already there (the start village, an old save). */
export type Arrival = 'boat' | 'land';

/** The start of the residents' generator for a seed (its own sequence, independent of the island). */
export function residentSeed(seed: number): number {
  return normalizeSeed(Math.floor(hash2(seed, 6, 6) * 4294967296));
}

// --- What the residents need to know about the village (worked out once per change) ---

interface VillageIndex {
  readonly key: readonly unknown[];
  readonly byId: ReadonlyMap<number, DeepReadonly<PlacedBuilding>>;
  readonly producers: ReadonlyMap<number, DeepReadonly<ProducerState>>;
  readonly houses: readonly DeepReadonly<PlacedBuilding>[];
  readonly markets: readonly DeepReadonly<PlacedBuilding>[];
}

type IndexView = DeepReadonly<Pick<SimState, 'world' | 'buildings' | 'production' | 'revision'>>;

const indexes = new WeakMap<object, VillageIndex>();

function villageIndex(view: IndexView): VillageIndex {
  const key = [view.buildings, view.production, view.revision, view.buildings.length, view.production.length];
  const cached = indexes.get(view.world);
  if (cached && cached.key.every((part, i) => part === key[i])) {
    return cached;
  }
  const byId = new Map<number, DeepReadonly<PlacedBuilding>>();
  const houses: DeepReadonly<PlacedBuilding>[] = [];
  const markets: DeepReadonly<PlacedBuilding>[] = [];
  for (const building of view.buildings) {
    byId.set(building.id, building);
    const type = buildingType(building.type);
    if (type?.category === 'house' && capacityOf(type.id) > 0) {
      houses.push(building);
    }
    if (type?.production?.sell) {
      markets.push(building);
    }
  }
  const producers = new Map<number, DeepReadonly<ProducerState>>();
  for (const producer of view.production) {
    if (byId.has(producer.buildingId)) {
      producers.set(producer.buildingId, producer);
    }
  }
  const index: VillageIndex = { key, byId, producers, houses, markets };
  indexes.set(view.world, index);
  return index;
}

function manhattan(width: number, a: number, b: number): number {
  const ax = a % width;
  const bx = b % width;
  return Math.abs(ax - bx) + Math.abs((a - ax) / width - (b - bx) / width);
}

function tileOf(width: number, building: DeepReadonly<PlacedBuilding>): number {
  return building.y * width + building.x;
}

/** The good a worker of this type carries to the market: the first thing it makes (the market itself carries nothing). */
export function carriedGood(typeId: string): string | undefined {
  const production = buildingType(typeId)?.production;
  if (!production || production.sell) {
    return undefined;
  }
  return Object.keys(production.outputs ?? {})[0];
}

// --- Houses ---

/** How many residents live in each house (by building id). */
function occupancy(residents: readonly DeepReadonly<Resident>[]): Map<number, number> {
  const used = new Map<number, number>();
  for (const resident of residents) {
    if (resident.home !== null) {
      used.set(resident.home, (used.get(resident.home) ?? 0) + 1);
    }
  }
  return used;
}

export type InviteView = DeepReadonly<Pick<SimState, 'world' | 'buildings' | 'production' | 'revision' | 'residents' | 'boats' | 'inventory'>>;

/** Room in all houses together, and residents (homeless ones too). */
export function housing(view: Pick<InviteView, 'world' | 'buildings' | 'production' | 'revision' | 'residents'>): { readonly residents: number; readonly capacity: number } {
  const index = villageIndex(view);
  const capacity = index.houses.reduce((sum, house) => sum + capacityOf(house.type), 0);
  return { residents: view.residents.length, capacity };
}

/** The house a new resident would move into: the first one (in the order they were built) with room. */
export function inviteHome(view: Pick<InviteView, 'world' | 'buildings' | 'production' | 'revision' | 'residents'>): DeepReadonly<PlacedBuilding> | undefined {
  const { residents, capacity } = housing(view);
  if (capacity <= residents) {
    return undefined;
  }
  const used = occupancy(view.residents);
  return villageIndex(view).houses.find((house) => (used.get(house.id) ?? 0) < capacityOf(house.type));
}

/**
 * Can a resident be invited now?
 * - `full`: the village has as many residents (or boats) as it may have (`limits.ts`).
 * - `noHouse`: every house is full (build a house first).
 * - `cost`: there is room, but coins are missing (with the missing amounts).
 */
export type InviteResult = 'ok' | 'full' | 'noHouse' | 'cost';

export interface InviteCheck {
  readonly result: InviteResult;
  readonly missing?: Readonly<Record<string, number>>;
  /** The house the resident would move into (when there is one). */
  readonly home?: number;
}

export function checkInvite(view: InviteView, typeId: string): InviteCheck {
  if (view.residents.length >= MAX_RESIDENTS || view.boats.length >= MAX_BOATS) {
    return { result: 'full' };
  }
  const home = inviteHome(view);
  if (!home) {
    return { result: 'noHouse' };
  }
  const missing = missingAmounts(view.inventory, costOf(typeId));
  if (Object.keys(missing).length > 0) {
    return { result: 'cost', missing, home: home.id };
  }
  return { result: 'ok', home: home.id };
}

// --- New residents ---

/** A name nobody in the village has: an unused first name, or – when all are taken – one with a number ("Lumo 2"). */
function pickName(residents: readonly DeepReadonly<Resident>[], rng: Rng): string {
  const taken = new Set(residents.map((resident) => resident.name));
  const free = RESIDENT_NAMES.filter((name) => !taken.has(name));
  if (free.length > 0) {
    return free[rng.int(free.length)] ?? 'Lumo';
  }
  const base = RESIDENT_NAMES[rng.int(RESIDENT_NAMES.length)] ?? 'Lumo';
  let number = 2;
  while (taken.has(`${base} ${String(number)}`)) {
    number += 1;
  }
  return `${base} ${String(number)}`;
}

/** A hat colour, if possible not the one of the resident before (so two newcomers look different). */
function pickHat(residents: readonly DeepReadonly<Resident>[], rng: Rng): number {
  const count = Math.max(1, HAT_IDS.length);
  const last = residents[residents.length - 1]?.hat;
  const hat = rng.int(count);
  return hat === last && count > 1 ? (hat + 1 + rng.int(count - 1)) % count : hat;
}

/**
 * Adds a resident (job and home may be `null`). `land`: they stand at the door
 * of their work (or home) at once; `boat`: a boat brings them to the coast
 * nearest to it. Returns the new resident, or `undefined` when the village is full.
 */
function addResident(state: SimState, rng: Rng, job: number | null, home: number | null, arrival: Arrival): Resident | undefined {
  if (state.residents.length >= MAX_RESIDENTS) {
    return undefined;
  }
  const index = villageIndex(state);
  const routine = RESIDENT_RULES.routine;
  const goal: Goal = job !== null ? 'work' : home !== null ? 'home' : 'visit';
  const place = job ?? home ?? state.buildings[0]?.id ?? null;
  const door = doorOrCenter(state, place !== null ? index.byId.get(place) : undefined);
  const resident: Resident = {
    id: state.nextResidentId,
    name: pickName(state.residents, rng),
    hat: pickHat(state.residents, rng),
    home,
    job,
    at: door,
    route: [],
    step: 0,
    doing: 'stay',
    goal,
    place,
    timer: goal === 'work' ? routine.workTicks : goal === 'home' ? routine.restTicks : routine.visitTicks,
    carrying: null,
    seen: job !== null ? (index.producers.get(job)?.delivered ?? 0) : 0,
    trips: 0,
  };
  state.nextResidentId += 1;
  state.residents.push(resident);
  const landing = arrival === 'boat' && state.boats.length < MAX_BOATS ? landingFor(state, door) : undefined;
  if (landing) {
    resident.doing = 'boat';
    resident.at = landing.shore;
    state.boats.push({ id: resident.id, at: landing.start, route: landing.route, step: 0, passenger: resident.id, shore: landing.shore });
  }
  return resident;
}

function centerTile(view: DeepReadonly<Pick<SimState, 'world'>>): number {
  const { width, height } = view.world;
  return Math.floor(height / 2) * width + Math.floor(width / 2);
}

function doorOrCenter(view: WalkView, building: DeepReadonly<PlacedBuilding> | undefined): number {
  return building ? doorOf(view, building) : centerTile(view);
}

/**
 * Invites a resident (the shop item `typeId`, category `resident`): takes its
 * cost and sends a boat; the new resident moves into the house with room.
 * Ignored (returns `undefined`) when {@link checkInvite} does not say `ok`.
 * Counts as a change (`revision`), so it is saved at once.
 */
export function inviteResident(state: SimState, typeId: string): number | undefined {
  if (buildingType(typeId)?.category !== 'resident') {
    return undefined;
  }
  const check = checkInvite(state, typeId);
  if (check.result !== 'ok' || check.home === undefined) {
    return undefined;
  }
  const rng = new Rng(state.residentRng);
  const resident = addResident(state, rng, null, check.home, 'boat');
  state.residentRng = rng.state;
  if (!resident) {
    return undefined;
  }
  takeAmounts(state.inventory, costOf(typeId));
  state.revision += 1;
  return resident.id;
}

// --- Keeping residents in line with the village ---

/**
 * Brings the residents in line with the buildings (after every command and
 * after loading): no job at a building that is gone, at most one worker per
 * building, nobody in a house over its room; then every production building
 * gets a worker (the nearest resident without work, else a new one –
 * `arrival` says how they come), every resident without a home moves into
 * the nearest house with room, and everybody whose goal is gone or moved
 * plans again. Doing it twice changes nothing.
 */
export function settleResidents(state: SimState, arrival: Arrival = 'boat'): void {
  const index = villageIndex(state);
  const rng = new Rng(state.residentRng);
  const width = state.world.width;

  const workers = new Map<number, Resident>();
  const used = new Map<number, number>();
  for (const resident of state.residents) {
    if (resident.job !== null && (!index.producers.has(resident.job) || workers.has(resident.job))) {
      resident.job = null;
    }
    if (resident.job !== null) {
      workers.set(resident.job, resident);
    }
    if (resident.home !== null) {
      const home = index.byId.get(resident.home);
      const room = home ? capacityOf(home.type) : 0;
      const taken = used.get(resident.home) ?? 0;
      if (taken >= room) {
        resident.home = null;
      } else {
        used.set(resident.home, taken + 1);
      }
    }
  }

  // Every production building has its worker.
  for (const building of state.buildings) {
    if (!index.producers.has(building.id) || workers.has(building.id)) {
      continue;
    }
    const spot = tileOf(width, building);
    let nearest: Resident | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const resident of state.residents) {
      if (resident.job === null) {
        const distance = manhattan(width, resident.at, spot);
        if (distance < nearestDistance) {
          nearest = resident;
          nearestDistance = distance;
        }
      }
    }
    if (nearest) {
      nearest.job = building.id;
      nearest.seen = index.producers.get(building.id)?.delivered ?? 0;
      workers.set(building.id, nearest);
      if (nearest.doing !== 'boat') {
        // Off to the new work at once (whatever they were doing; something they carry is still brought first).
        if (!(nearest.doing === 'walk' && nearest.goal === 'market')) {
          go(state, index, nearest, 'work', building.id);
        }
      }
      continue;
    }
    const added = addResident(state, rng, building.id, null, arrival);
    if (added) {
      workers.set(building.id, added);
    }
  }

  // Everybody without a home moves into the nearest house with room (nearest to their work, else to where they are).
  for (const resident of state.residents) {
    if (resident.home !== null) {
      continue;
    }
    const job = resident.job !== null ? index.byId.get(resident.job) : undefined;
    const from = job ? tileOf(width, job) : resident.at;
    let best: DeepReadonly<PlacedBuilding> | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const house of index.houses) {
      if ((used.get(house.id) ?? 0) >= capacityOf(house.type)) {
        continue;
      }
      const distance = manhattan(width, tileOf(width, house), from);
      if (distance < bestDistance) {
        best = house;
        bestDistance = distance;
      }
    }
    if (best) {
      resident.home = best.id;
      used.set(best.id, (used.get(best.id) ?? 0) + 1);
    }
  }

  for (const resident of state.residents) {
    keepPlan(state, index, rng, resident);
  }
  keepBoats(state, index);
  state.residentRng = rng.state;
}

/** Is the goal of the resident still there (and still theirs)? */
function goalValid(index: VillageIndex, resident: DeepReadonly<Resident>): boolean {
  const place = resident.place;
  switch (resident.goal) {
    case 'work':
      return resident.job !== null && place === resident.job;
    case 'home':
      return resident.home !== null && place === resident.home;
    case 'market':
      return place !== null && index.markets.some((market) => market.id === place) && resident.carrying !== null;
    case 'visit':
      return place === null || index.byId.has(place);
  }
}

function keepPlan(state: SimState, index: VillageIndex, rng: Rng, resident: Resident): void {
  if (resident.doing === 'boat') {
    return;
  }
  if (!goalValid(index, resident)) {
    if (resident.goal === 'market' && resident.carrying !== null) {
      // The market is gone: bring it to another one, or – if there is none – put it down (the store has it anyway).
      const job = resident.job !== null ? index.byId.get(resident.job) : undefined;
      const market = nearestMarket(state, index, job ? tileOf(state.world.width, job) : resident.at);
      if (market) {
        go(state, index, resident, 'market', market.id);
        return;
      }
      resident.carrying = null;
    }
    nextGoal(state, index, rng, resident, resident.goal === 'work' ? 'work' : 'visit');
    return;
  }
  const building = resident.place !== null ? index.byId.get(resident.place) : undefined;
  if (!building) {
    return;
  }
  const door = doorOf(state, building);
  if (resident.doing === 'walk') {
    const end = resident.route.length > 0 ? resident.route[resident.route.length - 1] : resident.at;
    if (end !== door) {
      go(state, index, resident, resident.goal, resident.place);
    }
  } else if (resident.doing === 'stay' && resident.at !== door) {
    go(state, index, resident, resident.goal, resident.place);
  }
}

/** The market nearest to a tile (straight-line steps, then the lower id). */
function nearestMarket(state: SimState, index: VillageIndex, from: number): DeepReadonly<PlacedBuilding> | undefined {
  let best: DeepReadonly<PlacedBuilding> | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const market of index.markets) {
    const distance = manhattan(state.world.width, tileOf(state.world.width, market), from);
    if (distance < bestDistance) {
      best = market;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Sets off towards a goal. A resident who is half way between two tiles plans
 * from the tile they are walking to (and keeps their steps), so nobody jumps.
 * The arrival is handled by the next tick (an empty route: already there).
 */
function go(state: SimState, index: VillageIndex, resident: Resident, goal: Goal, place: number | null): void {
  resident.goal = goal;
  resident.place = place;
  const building = place !== null ? index.byId.get(place) : undefined;
  if (!building) {
    // Nothing to walk to (a stroll in a village without buildings): look around where they are.
    resident.doing = 'stay';
    resident.route = [];
    resident.step = 0;
    resident.timer = RESIDENT_RULES.routine.visitTicks;
    return;
  }
  const door = doorOf(state, building);
  const halfWay = resident.doing === 'walk' && resident.route.length > 0 && resident.step > 0;
  const from = halfWay ? (resident.route[0] ?? resident.at) : resident.at;
  const way = findWalk(state, from, door);
  if (!way) {
    resident.doing = 'wait';
    resident.route = [];
    resident.step = 0;
    resident.timer = RESIDENT_RULES.routine.waitTicks;
    return;
  }
  resident.doing = 'walk';
  if (halfWay) {
    resident.route = [from, ...way];
  } else {
    resident.route = way;
    resident.step = 0;
  }
}

/** What to do after a goal is reached or gone (`after`: what they did last). */
function nextGoal(state: SimState, index: VillageIndex, rng: Rng, resident: Resident, after: Goal): void {
  if (resident.job !== null && after !== 'work') {
    go(state, index, resident, 'work', resident.job);
    return;
  }
  if (resident.job !== null) {
    // After work: a rest at home (without a home they stay at work a while longer).
    if (resident.home !== null) {
      go(state, index, resident, 'home', resident.home);
    } else {
      go(state, index, resident, 'work', resident.job);
    }
    return;
  }
  if (after === 'visit' && resident.home !== null) {
    go(state, index, resident, 'home', resident.home);
    return;
  }
  // Without work: look at something in the village (any building, picked by chance; not the place they just were).
  const choices = state.buildings.filter((building) => building.id !== resident.place);
  const pool = choices.length > 0 ? choices : state.buildings;
  const pick = pool.length > 0 ? pool[rng.int(pool.length)] : undefined;
  go(state, index, resident, 'visit', pick ? pick.id : null);
}

// --- Boats ---

function keepBoats(state: SimState, index: VillageIndex): void {
  const world = state.world;
  let ways: Int32Array | undefined;
  const kept: Boat[] = [];
  for (const boat of state.boats) {
    const passenger = boat.passenger !== null ? state.residents.find((r) => r.id === boat.passenger && r.doing === 'boat') : undefined;
    if (boat.passenger !== null && !passenger) {
      boat.passenger = null;
    }
    if (isWalkable(world, boat.at)) {
      // New land right under the boat: the passenger steps out here, the boat is gone.
      if (passenger) {
        landPassenger(state, index, passenger, boat.at);
      }
      continue;
    }
    if (boat.route.some((tile) => isWalkable(world, tile)) || (passenger && !isWalkable(world, boat.shore))) {
      ways ??= seaWays(world);
      if (passenger) {
        // New land in the way: land at the nearest shore from here.
        const landing = nearestShore(state, boat.at);
        if (!landing) {
          landPassenger(state, index, passenger, passenger.at);
          continue;
        }
        boat.route = landing.route;
        boat.shore = landing.shore;
        passenger.at = landing.shore;
        if (boat.route.length === 0) {
          boat.step = 0;
        }
      } else {
        const out = wayOut(ways, boat.at);
        if (!out || out.length === 0) {
          continue;
        }
        boat.route = out;
      }
    }
    kept.push(boat);
  }
  state.boats = kept;
}

/** The way over water from a boat's tile to the nearest tile of water by the shore (breadth first), and the shore tile. */
function nearestShore(state: SimState, from: number): { route: number[]; shore: number } | undefined {
  const world = state.world;
  const { width, height } = world;
  const previous = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const tile = queue[head] ?? from;
    const x = tile % width;
    const y = (tile - x) / width;
    const neighbours = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].filter(([nx = -1, ny = -1]) => nx >= 0 && ny >= 0 && nx < width && ny < height);
    const shore = neighbours.map(([nx = 0, ny = 0]) => ny * width + nx).find((index) => isWalkable(world, index));
    if (shore !== undefined) {
      const route: number[] = [];
      for (let at = tile; at !== from; at = previous.get(at) ?? from) {
        route.push(at);
      }
      return { route: route.reverse(), shore };
    }
    for (const [nx = 0, ny = 0] of neighbours) {
      const index = ny * width + nx;
      if (!previous.has(index) && world.tiles[index] === 'water') {
        previous.set(index, tile);
        queue.push(index);
      }
    }
  }
  return undefined;
}

/** The passenger steps out onto `tile` and walks to work (or home, or looks around). */
function landPassenger(state: SimState, index: VillageIndex, resident: Resident, tile: number): void {
  resident.at = tile;
  resident.route = [];
  resident.step = 0;
  resident.doing = 'stay';
  if (resident.job !== null) {
    go(state, index, resident, 'work', resident.job);
  } else if (resident.home !== null) {
    go(state, index, resident, 'home', resident.home);
  } else {
    go(state, index, resident, 'visit', state.buildings[0]?.id ?? null);
  }
}

function tickBoats(state: SimState, index: VillageIndex): void {
  if (state.boats.length === 0) {
    return;
  }
  const speed = RESIDENT_RULES.boat.speed;
  const kept: Boat[] = [];
  for (const boat of state.boats) {
    if (boat.route.length > 0) {
      boat.step += speed;
      if (boat.step >= STEPS_PER_TILE) {
        boat.step -= STEPS_PER_TILE;
        boat.at = boat.route.shift() ?? boat.at;
      }
    }
    if (boat.route.length > 0) {
      kept.push(boat);
      continue;
    }
    boat.step = 0;
    if (boat.passenger === null) {
      // Out at the edge of the map: gone.
      continue;
    }
    const passenger = state.residents.find((resident) => resident.id === boat.passenger);
    boat.passenger = null;
    if (passenger?.doing === 'boat') {
      landPassenger(state, index, passenger, boat.shore);
    }
    const out = wayOut(seaWays(state.world), boat.at);
    if (out && out.length > 0) {
      boat.route = out;
      kept.push(boat);
    }
  }
  state.boats = kept;
}

// --- The tick ---

/** Advances every boat and every resident by one tick (after the production of the tick). */
export function tickResidents(state: SimState): void {
  if (state.residents.length === 0 && state.boats.length === 0) {
    return;
  }
  const index = villageIndex(state);
  const rng = new Rng(state.residentRng);
  tickBoats(state, index);
  for (const resident of state.residents) {
    tickResident(state, index, rng, resident);
  }
  state.residentRng = rng.state;
}

function tickResident(state: SimState, index: VillageIndex, rng: Rng, resident: Resident): void {
  const routine = RESIDENT_RULES.routine;
  switch (resident.doing) {
    case 'boat':
      return;
    case 'walk':
      if (resident.route.length > 0) {
        const next = resident.route[0] ?? resident.at;
        resident.step += walkSpeed(state, resident.at, next);
        if (resident.step >= STEPS_PER_TILE) {
          resident.step -= STEPS_PER_TILE;
          resident.at = next;
          resident.route.shift();
        }
      }
      if (resident.route.length === 0) {
        resident.step = 0;
        arrive(state, index, rng, resident);
      }
      return;
    case 'wait':
      resident.timer -= 1;
      if (resident.timer <= 0) {
        go(state, index, resident, resident.goal, resident.place);
      }
      return;
    case 'stay':
      if (resident.goal === 'work' && resident.job !== null) {
        const job = index.byId.get(resident.job);
        const producer = index.producers.get(resident.job);
        if (job && producer && producer.delivered > resident.seen) {
          resident.seen = producer.delivered;
          const good = carriedGood(job.type);
          const market = good ? nearestMarket(state, index, tileOf(state.world.width, job)) : undefined;
          if (good && market) {
            resident.carrying = good;
            go(state, index, resident, 'market', market.id);
            return;
          }
        }
        resident.timer -= 1;
        if (resident.timer <= 0) {
          if (resident.home !== null) {
            go(state, index, resident, 'home', resident.home);
          } else {
            resident.timer = routine.workTicks;
          }
        }
        return;
      }
      resident.timer -= 1;
      if (resident.timer <= 0) {
        nextGoal(state, index, rng, resident, resident.goal);
      }
      return;
  }
}

function arrive(state: SimState, index: VillageIndex, rng: Rng, resident: Resident): void {
  const routine = RESIDENT_RULES.routine;
  switch (resident.goal) {
    case 'work':
      if (resident.job === null) {
        nextGoal(state, index, rng, resident, 'work');
        return;
      }
      resident.doing = 'stay';
      resident.timer = routine.workTicks;
      // A fresh start: they wait for the next round before they carry something.
      resident.seen = index.producers.get(resident.job)?.delivered ?? resident.seen;
      return;
    case 'market':
      resident.carrying = null;
      resident.trips += 1;
      if (resident.trips >= routine.tripsBeforeRest && resident.home !== null) {
        go(state, index, resident, 'home', resident.home);
      } else if (resident.job !== null) {
        go(state, index, resident, 'work', resident.job);
      } else {
        nextGoal(state, index, rng, resident, 'market');
      }
      return;
    case 'home':
      resident.doing = 'stay';
      resident.timer = routine.restTicks;
      resident.trips = 0;
      return;
    case 'visit':
      resident.doing = 'stay';
      resident.timer = routine.visitTicks;
      return;
  }
}

// --- For the display ---

/**
 * What a resident is doing, for the card: on the boat, on the way to work,
 * at work, carrying something to the market, on the way home, resting, strolling,
 * looking at a place, or waiting for a way.
 */
export type Activity = 'boat' | 'toWork' | 'work' | 'carry' | 'toHome' | 'rest' | 'stroll' | 'visit' | 'wait';

export function activityOf(resident: DeepReadonly<Resident>): Activity {
  switch (resident.doing) {
    case 'boat':
      return 'boat';
    case 'wait':
      return 'wait';
    case 'walk':
      if (resident.carrying !== null) {
        return 'carry';
      }
      return resident.goal === 'work' ? 'toWork' : resident.goal === 'home' ? 'toHome' : 'stroll';
    case 'stay':
      return resident.goal === 'work' ? 'work' : resident.goal === 'home' ? 'rest' : 'visit';
  }
}

/** A point on the map in tiles (the middle of a tile is `x + 0.5`), and which way it moves. */
export interface MapPoint {
  readonly x: number;
  readonly y: number;
  /** -1 left, 1 right, 0 straight up or down or standing. */
  readonly dx: number;
  readonly moving: boolean;
}

function pointAlong(width: number, at: number, route: readonly number[], step: number): MapPoint {
  const ax = at % width;
  const ay = (at - ax) / width;
  const next = route[0];
  if (next === undefined) {
    return { x: ax + 0.5, y: ay + 0.5, dx: 0, moving: false };
  }
  let from = at;
  let to = next;
  let rest = step;
  for (let i = 1; rest >= STEPS_PER_TILE && i < route.length; i += 1) {
    rest -= STEPS_PER_TILE;
    from = to;
    to = route[i] ?? to;
  }
  const t = Math.min(1, rest / STEPS_PER_TILE);
  const fx = from % width;
  const fy = (from - fx) / width;
  const tx = to % width;
  const ty = (to - tx) / width;
  return { x: fx + (tx - fx) * t + 0.5, y: fy + (ty - fy) * t + 0.5, dx: Math.sign(tx - fx), moving: true };
}

/**
 * Where a resident is drawn `alpha` (0 … 1) of a tick after the current one:
 * walking on from the current tick at the speed of the tile they are on, so
 * the movement is smooth between the ticks. `undefined` while on the boat.
 */
export function residentPoint(view: WalkView, resident: DeepReadonly<Resident>, alpha: number): MapPoint | undefined {
  if (resident.doing === 'boat') {
    return undefined;
  }
  if (resident.doing !== 'walk' || resident.route.length === 0) {
    return pointAlong(view.world.width, resident.at, [], 0);
  }
  const speed = walkSpeed(view, resident.at, resident.route[0] ?? resident.at);
  return pointAlong(view.world.width, resident.at, resident.route, resident.step + alpha * speed);
}

/** Where a boat is drawn `alpha` of a tick after the current one. */
export function boatPoint(view: DeepReadonly<Pick<SimState, 'world'>>, boat: DeepReadonly<Boat>, alpha: number): MapPoint {
  const moving = boat.route.length > 0;
  return pointAlong(view.world.width, boat.at, boat.route, moving ? boat.step + alpha * RESIDENT_RULES.boat.speed : 0);
}
