import buildingsJson from './buildings.json';
import type { TextKey } from './texts';
import type { Terrain } from '../sim/world';

/**
 * The things that can be built, from `buildings.json`: paths, houses and
 * decoration. Production buildings join in M3 (`category` gets a new value).
 *
 * `look` only holds parameters for the placeholder graphics (shape name,
 * palette name from `style.ts`, height above the footprint in world pixels);
 * real graphics replace the placeholders in M8.
 */

export type BuildingCategory = 'path' | 'house' | 'deco';

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
  readonly look: {
    readonly shape: string;
    readonly palette?: string;
    /** How far the picture reaches up over the footprint, in world pixels. */
    readonly rise: number;
  };
}

/** Shapes the placeholder graphics can draw (`look.shape`). */
export const BUILDING_SHAPES = ['path', 'mushroomHouse', 'flower', 'bush', 'fence', 'bench', 'lantern', 'fountain'] as const;

export const BUILDING_TYPES: readonly BuildingType[] = buildingsJson.types as readonly BuildingType[];

const byId = new Map<string, BuildingType>(BUILDING_TYPES.map((type) => [type.id, type]));

/** The type with this id, or `undefined` for unknown ids (e.g. from damaged commands). */
export function buildingType(id: string): BuildingType | undefined {
  return byId.get(id);
}

/** All types of a category, in the order of the file. */
export function typesOf(category: BuildingCategory): readonly BuildingType[] {
  return BUILDING_TYPES.filter((type) => type.category === category);
}
