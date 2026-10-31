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
 * `look` only holds parameters for the placeholder graphics (shape name,
 * palette name from `style.ts`, height above the footprint in world pixels);
 * real graphics replace the placeholders in M8.
 */

export type BuildingCategory = 'path' | 'house' | 'deco' | 'production';

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
  readonly look: {
    readonly shape: string;
    readonly palette?: string;
    /** How far the picture reaches up over the footprint, in world pixels. */
    readonly rise: number;
  };
}

/** Shapes the placeholder graphics can draw (`look.shape`). */
export const BUILDING_SHAPES = ['path', 'mushroomHouse', 'flower', 'bush', 'fence', 'bench', 'lantern', 'fountain', 'lumberjackHut', 'berryGarden', 'quarry', 'carpenterShop', 'bakery', 'market'] as const;

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
