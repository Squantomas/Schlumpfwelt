/** Scene keys – one place, so scenes can start each other without typos. */
export const SCENES = {
  boot: 'boot',
  island: 'island',
} as const;

export type SceneKey = (typeof SCENES)[keyof typeof SCENES];

/** Events that `IslandScene` emits on `scene.events`. */
export const ISLAND_EVENTS = {
  /** A tile was tapped (short touch, not a drag or pinch). Payload: {@link TileTapEvent}. */
  tileTap: 'tile-tap',
} as const;

export interface TileTapEvent {
  /** Tile column and row (0-based). */
  readonly x: number;
  readonly y: number;
}
