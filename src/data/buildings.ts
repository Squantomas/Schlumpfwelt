import buildingsJson from './buildings.json';
import type { TextKey } from './texts';
import type { Terrain } from '../sim/world';

/**
 * The things that can be built, from `buildings.json`: paths, houses,
 * decoration and (M3) production buildings.
 *
 * `cost` is what building costs (coins and goods, whole numbers). Paths cost
 * nothing, so nobody can get stuck; demolishing gives the whole cost back and
 * moving is free (see `src/sim/economy.ts`).
 *
 * `production` (production buildings only) says how a building works: every
 * `intervalTicks` ticks it takes `inputs` from the store and puts `outputs`
 * into it; the market has `sell` instead. `needsNearby` asks for tiles of a
 * terrain within `radius` tiles around the footprint (the trees of a
 * lumberjack); they are not used up.
 *
 * `shop` (everything but paths) says in which tab of the shop a type is
 * sold; the order of the file is the order in the shop. `unlock` (optional)
 * is the progress the village needs before the type can be built (see
 * `src/sim/unlocks.ts`); without it a type is free from the start. `island`
 * (category `island`) says which change of the map a type makes: it changes
 * the terrain instead of putting a building on it (see `src/sim/island.ts`).
 *
 * `look` only holds parameters for the placeholder graphics (shape name,
 * palette name from `style.ts`, height above the footprint in world pixels);
 * real graphics replace the placeholders in M8.
 */

export type BuildingCategory = 'path' | 'house' | 'deco' | 'production' | 'island';

/** The tabs of the shop, in the order they are shown. */
export const SHOP_CATEGORIES = ['houses', 'deco', 'production', 'island'] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/**
 * What a village has to reach before a type is unlocked – simple counts a child
 * can follow:
 * - `count`: at least `count` buildings of the type `building` are standing,
 * - `houses`: at least `count` houses (of any kind) are standing,
 * - `earned`: the market has earned at least `coins` coins in total.
 * Once reached, the type stays unlocked for good.
 */
export type UnlockDef =
  | { readonly kind: 'count'; readonly building: string; readonly count: number }
  | { readonly kind: 'houses'; readonly count: number }
  | { readonly kind: 'earned'; readonly coins: number };

/** The changes of the map the island category makes. */
export const ISLAND_ACTIONS = ['plantTree', 'placeRock', 'fillLand', 'makeMeadow'] as const;

export type IslandAction = (typeof ISLAND_ACTIONS)[number];

/** Amounts of coins and goods by id, e.g. `{ coins: 20, wood: 5 }`. */
export type CostMap = Readonly<Record<string, number>>;

export interface ProductionDef {
  /** Ticks one working round takes (10 ticks = 1 second). */
  readonly intervalTicks: number;
  /** Taken from the store when a round starts. */
  readonly inputs?: CostMap;
  /** Put into the store when a round ends. */
  readonly outputs?: CostMap;
  /** Needs tiles of this terrain within `radius` tiles around the footprint. */
  readonly needsNearby?: { readonly terrain: Terrain; readonly radius: number };
  /** The market: sells up to `perCycle` products per round for their price. */
  readonly sell?: { readonly perCycle: number };
}

export interface BuildingType {
  readonly id: string;
  readonly category: BuildingCategory;
  /** Text key of the name in `texts.de.json`. */
  readonly nameKey: TextKey;
  /** Size in tiles. */
  readonly footprint: { readonly w: number; readonly h: number };
  /** Terrains every tile of the footprint has to be on. */
  readonly terrains: readonly Terrain[];
  /** Needs a path next to it, otherwise it is marked (houses, later production buildings). */
  readonly needsPath: boolean;
  /** What it costs to build (empty for paths). */
  readonly cost: CostMap;
  readonly production?: ProductionDef;
  /** Where the shop sells it (not for paths). */
  readonly shop?: { readonly category: ShopCategory };
  /** What has to be reached before it can be built; without it the type is free from the start. */
  readonly unlock?: UnlockDef;
  /** Island category only: the change of the map. */
  readonly island?: { readonly action: IslandAction };
  readonly look: {
    readonly shape: string;
    readonly palette?: string;
    /** How far the picture reaches up over the footprint, in world pixels. */
    readonly rise: number;
    /** Draw the placeholder picture of a house this many times bigger (big houses). */
    readonly scale?: number;
  };
}

/** Shapes the placeholder graphics can draw (`look.shape`). */
export const BUILDING_SHAPES = [
  'path',
  'mushroomHouse',
  'gardenHouse',
  'flower',
  'bush',
  'fence',
  'bench',
  'lantern',
  'fountain',
  'flowerbed',
  'pond',
  'lumberjackHut',
  'berryGarden',
  'quarry',
  'carpenterShop',
  'bakery',
  'market',
  'islandTree',
  'islandRock',
  'islandBeach',
  'islandMeadow',
] as const;

export const BUILDING_TYPES: readonly BuildingType[] = buildingsJson.types as readonly unknown[] as readonly BuildingType[];

const byId = new Map<string, BuildingType>(BUILDING_TYPES.map((type) => [type.id, type]));

/** The type with this id, or `undefined` for unknown ids (e.g. from damaged commands). */
export function buildingType(id: string): BuildingType | undefined {
  return byId.get(id);
}

/** All types of a category, in the order of the file. */
export function typesOf(category: BuildingCategory): readonly BuildingType[] {
  return BUILDING_TYPES.filter((type) => type.category === category);
}

/** The types sold in a tab of the shop, in the order of the file. */
export function shopItems(category: ShopCategory): readonly BuildingType[] {
  return BUILDING_TYPES.filter((type) => type.shop?.category === category);
}

/** The shop tab a type is sold in, or `undefined` (paths, unknown ids). */
export function shopCategoryOf(typeId: string): ShopCategory | undefined {
  return byId.get(typeId)?.shop?.category;
}

/**
 * The unlock condition of a type with sanitized numbers (a whole number of at
 * least 1, a known building that is not the type itself), or `undefined` if
 * the type is free – or its condition is broken: a broken entry never locks a
 * type for good. A test also fails on broken entries.
 */
export function unlockOf(typeId: string): UnlockDef | undefined {
  const def = byId.get(typeId)?.unlock as Partial<Record<string, unknown>> | undefined;
  if (!def) {
    return undefined;
  }
  const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;
  switch (def['kind']) {
    case 'count':
      return typeof def['building'] === 'string' && def['building'] !== typeId && byId.has(def['building']) && whole(def['count'])
        ? { kind: 'count', building: def['building'], count: def['count'] }
        : undefined;
    case 'houses':
      return whole(def['count']) ? { kind: 'houses', count: def['count'] } : undefined;
    case 'earned':
      return whole(def['coins']) ? { kind: 'earned', coins: def['coins'] } : undefined;
    default:
      return undefined;
  }
}

/** The ids of all types that have to be unlocked, in the order of the file. */
export const LOCKED_TYPE_IDS: readonly string[] = BUILDING_TYPES.filter((type) => unlockOf(type.id) !== undefined).map((type) => type.id);
