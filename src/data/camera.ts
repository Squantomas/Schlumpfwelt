import camera from './camera.json';

/** Camera tuning from `camera.json`. */
export const CAMERA_CONFIG: Readonly<{
  /** Water around the map the camera may still show, in tiles. */
  marginTiles: number;
  /** The screen centre may be on land or this many tiles away from it. */
  landMarginTiles: number;
  /** Free tiles around the island in the start view. */
  startPaddingTiles: number;
  /** Biggest zoom: one tile is this many CSS pixels. */
  maxTileCssPx: number;
  /** Zoom factor of one tap on the + / − buttons. */
  buttonZoomFactor: number;
  /** Zoom per wheel pixel (exponent): factor = exp(-deltaY * this). */
  wheelZoomPerPixel: number;
  /** Movement up to this many CSS px still counts as a tap. */
  tapMaxMovePx: number;
}> = camera;
