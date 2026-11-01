import { BUILDING_PAD, SIGN_BUBBLE, SIGN_SIZE } from '../../art/village';

/**
 * Keys and sizes of the pictures of buildings, paths and the signs over them (M9: SVG from `src/art/village.ts`).
 * A building picture is its footprint plus {@link PAD} on the left, right and below, and its height above it.
 */
export { PATH_SIGN_KEY as MARKER_KEY, PUFF_KEY, buildingKey as buildingTextureKey, buildingOrigin, buildingSize as buildingTextureSize, pathKey as pathTextureKey } from '../../art/catalog';
export { CHIMNEYS } from '../../art/village';

export const PAD = BUILDING_PAD;
export const MARKER_SIZE = SIGN_SIZE;
export const MARKER_BUBBLE = SIGN_BUBBLE;
