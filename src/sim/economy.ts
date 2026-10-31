/**
 * Money, goods and costs: the store (inventory), what building costs, what
 * demolishing gives back, and the state of the production buildings. Pure
 * functions on plain data; the working of the buildings is in `production.ts`.
 *
 * Rules (M3):
 * - The inventory holds whole numbers only: coins ("Taler") and goods.
 * - Building costs coins and goods (`cost` in `buildings.json`). Paths are
 *   free, moving is free, and demolishing gives the **whole** cost back (plus
 *   the inputs of a round that was running) – so nothing is ever lost and
 *   nobody can get stuck.
 * - The store has a very generous upper limit (`storage.max` in
 *   `goods.json`); extra units are simply not counted, nothing else happens.
 */
import { buildingType, type BuildingType, type CostMap, type ProductionDef } from '../data/buildings';
import { ITEM_IDS, MAX_AMOUNT, START_INVENTORY, isItem } from '../data/goods';
import { inBounds, terrainAt, type Terrain, type WorldView } from './world';

/** Coins and goods by id (see `ITEM_IDS`). */
export type Inventory = Record<string, number>;

/** What a production building is doing. */
export const PRODUCER_STATUSES = ['working', 'noPath', 'noNearby', 'waitingInput', 'idle'] as const;

/**
 * - `working`: a round is running.
 * - `noPath`: not connected to a path.
 * - `noNearby`: no trees / rocks within the radius.
 * - `waitingInput`: the store lacks what a new round needs (wood, berries …).
 * - `idle`: the market has nothing to sell.
 */
export type ProducerStatus = (typeof PRODUCER_STATUSES)[number];

/** The working state of one production building (plain data, saved with the game). */
export interface ProducerState {
  /** Id of the building (see `PlacedBuilding`). */
  buildingId: number;
  /** Ticks into the running round; 0 = no round running (the inputs of a round are taken when it starts). */
  progress: number;
  status: ProducerStatus;
  /** How often this building has delivered (goods put into the store / products sold); the display shows "+1" when it rises. */
  delivered: number;
  /** Coins the market earned at its last sale. */
  lastSale: number;
}

export function newProducer(buildingId: number): ProducerState {
  return { buildingId, progress: 0, status: 'working', delivered: 0, lastSale: 0 };
}

// --- Amounts ---

/**
 * Keeps only entries with a known item id and a positive whole amount;
 * everything else (unknown goods, zero, negative, fractions, NaN) is dropped.
 * Protects against mistakes in `buildings.json`; a test also fails on them.
 */
export function sanitizeAmounts(raw: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null) {
    return result;
  }
  for (const [id, amount] of Object.entries(raw)) {
    if (isItem(id) && typeof amount === 'number' && Number.isInteger(amount) && amount > 0) {
      result[id] = amount;
    }
  }
  return result;
}

/** The start store: `startInventory` of `goods.json`. */
export function createStartInventory(): Inventory {
  return normalizeInventory(START_INVENTORY);
}

/**
 * An inventory with every known item as a whole number between 0 and the
 * limit; missing, unknown, negative or broken entries become 0 or are
 * dropped. For loading saved games (M5).
 */
export function normalizeInventory(raw: unknown): Inventory {
  const source: Record<string, unknown> = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const inventory: Inventory = {};
  for (const id of ITEM_IDS) {
    const value = source[id];
    inventory[id] = typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_AMOUNT, Math.max(0, Math.floor(value))) : 0;
  }
  return inventory;
}

export function amountOf(inventory: Readonly<Record<string, number>>, id: string): number {
  return inventory[id] ?? 0;
}

/** What is missing in the inventory for `needed` (only entries that are missing). */
export function missingAmounts(inventory: Readonly<Record<string, number>>, needed: CostMap): Record<string, number> {
  const missing: Record<string, number> = {};
  for (const [id, amount] of Object.entries(needed)) {
    const short = amount - amountOf(inventory, id);
    if (short > 0) {
      missing[id] = short;
    }
  }
  return missing;
}

/** Does the inventory hold everything in `needed`? */
export function hasAmounts(inventory: Readonly<Record<string, number>>, needed: CostMap): boolean {
  return Object.keys(missingAmounts(inventory, needed)).length === 0;
}

/** Adds the amounts (up to the limit). */
export function addAmounts(inventory: Inventory, amounts: CostMap): void {
  for (const [id, amount] of Object.entries(amounts)) {
    inventory[id] = Math.min(MAX_AMOUNT, amountOf(inventory, id) + amount);
  }
}

/** Takes the amounts out if all of them are there and returns whether it did; otherwise nothing changes. */
export function takeAmounts(inventory: Inventory, amounts: CostMap): boolean {
  if (!hasAmounts(inventory, amounts)) {
    return false;
  }
  for (const [id, amount] of Object.entries(amounts)) {
    inventory[id] = amountOf(inventory, id) - amount;
  }
  return true;
}

// --- Costs and refunds ---

const costCache = new Map<string, CostMap>();
const productionCache = new Map<string, ProductionView | undefined>();

/** What building a thing of this type costs (sanitized; unknown types are free). */
export function costOf(typeId: string): CostMap {
  let cost = costCache.get(typeId);
  if (!cost) {
    cost = sanitizeAmounts(buildingType(typeId)?.cost);
    costCache.set(typeId, cost);
  }
  return cost;
}

/** The production rules of a type with sanitized amounts, or `undefined` for buildings that do not produce. */
export interface ProductionView {
  readonly intervalTicks: number;
  readonly inputs: CostMap;
  readonly outputs: CostMap;
  readonly needsNearby?: { readonly terrain: Terrain; readonly radius: number };
  readonly sell?: { readonly perCycle: number };
}

export function productionOf(typeId: string): ProductionView | undefined {
  if (!productionCache.has(typeId)) {
    productionCache.set(typeId, buildProductionView(buildingType(typeId)?.production));
  }
  return productionCache.get(typeId);
}

function buildProductionView(def: ProductionDef | undefined): ProductionView | undefined {
  if (!def) {
    return undefined;
  }
  const nearby = def.needsNearby;
  const sell = def.sell;
  return {
    intervalTicks: Number.isInteger(def.intervalTicks) && def.intervalTicks >= 1 ? def.intervalTicks : 1,
    inputs: sanitizeAmounts(def.inputs),
    outputs: sanitizeAmounts(def.outputs),
    ...(nearby && Number.isInteger(nearby.radius) && nearby.radius >= 1 ? { needsNearby: { terrain: nearby.terrain, radius: nearby.radius } } : {}),
    ...(sell ? { sell: { perCycle: Number.isInteger(sell.perCycle) && sell.perCycle >= 1 ? sell.perCycle : 1 } } : {}),
  };
}

/** The part of the state the cost rules read. */
export interface StoreView {
  readonly inventory: Readonly<Record<string, number>>;
}

/** What is missing for building a thing of this type (empty = affordable). */
export function missingFor(state: StoreView, typeId: string): Record<string, number> {
  return missingAmounts(state.inventory, costOf(typeId));
}

/** Can the player pay for a thing of this type right now? */
export function canAfford(state: StoreView, typeId: string): boolean {
  return Object.keys(missingFor(state, typeId)).length === 0;
}

/**
 * What the player gets back for demolishing a building: its whole cost plus
 * the inputs of a round that was running (taken when the round started).
 */
export function refundFor(
  state: { readonly production: readonly ProducerState[]; readonly buildings: readonly { readonly id: number; readonly type: string }[] },
  buildingId: number,
): Record<string, number> {
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building) {
    return {};
  }
  const refund: Record<string, number> = { ...costOf(building.type) };
  const producer = state.production.find((p) => p.buildingId === buildingId);
  const inputs = productionOf(building.type)?.inputs;
  if (producer && producer.progress > 0 && inputs) {
    for (const [id, amount] of Object.entries(inputs)) {
      refund[id] = (refund[id] ?? 0) + amount;
    }
  }
  return refund;
}

// --- "Nearby" tiles (trees for the lumberjack, rocks for the quarry) ---

/** The rectangle of tiles (inclusive, clipped to the map) within `radius` tiles around a footprint. */
export function nearbyArea(
  world: Pick<WorldView, 'width' | 'height'>,
  type: Pick<BuildingType, 'footprint'>,
  x: number,
  y: number,
  radius: number,
): { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } {
  return {
    x0: Math.max(0, x - radius),
    y0: Math.max(0, y - radius),
    x1: Math.min(world.width - 1, x + type.footprint.w - 1 + radius),
    y1: Math.min(world.height - 1, y + type.footprint.h - 1 + radius),
  };
}

/** The tiles of `terrain` within `radius` tiles around the footprint (row by row). */
export function nearbyTiles(
  world: WorldView,
  type: Pick<BuildingType, 'footprint'>,
  x: number,
  y: number,
  terrain: Terrain,
  radius: number,
): { x: number; y: number }[] {
  const area = nearbyArea(world, type, x, y, radius);
  const tiles: { x: number; y: number }[] = [];
  for (let ty = area.y0; ty <= area.y1; ty += 1) {
    for (let tx = area.x0; tx <= area.x1; tx += 1) {
      if (inBounds(world, tx, ty) && terrainAt(world, tx, ty) === terrain) {
        tiles.push({ x: tx, y: ty });
      }
    }
  }
  return tiles;
}

/** Is there at least one tile of `terrain` within `radius` tiles around the footprint? */
export function hasNearby(world: WorldView, type: Pick<BuildingType, 'footprint'>, x: number, y: number, terrain: Terrain, radius: number): boolean {
  const area = nearbyArea(world, type, x, y, radius);
  for (let ty = area.y0; ty <= area.y1; ty += 1) {
    for (let tx = area.x0; tx <= area.x1; tx += 1) {
      if (terrainAt(world, tx, ty) === terrain) {
        return true;
      }
    }
  }
  return false;
}
