/**
 * Which frame time the simulation gets. Phaser's `delta` is smoothed over ten
 * frames and replaced by a 60 fps step while the game "cools down" (the first
 * 120 frames) or when a frame is very slow. Both would hide how much real time
 * passed. The simulation therefore gets the raw time since the last frame; the
 * clock of the simulation alone caps it (`MAX_FRAME_MS`, nothing is caught up,
 * no income in the background).
 */
export function simulationDelta(rawDeltaMs: number, smoothedDeltaMs: number): number {
  if (Number.isFinite(rawDeltaMs) && rawDeltaMs >= 0) {
    return rawDeltaMs;
  }
  return Number.isFinite(smoothedDeltaMs) && smoothedDeltaMs >= 0 ? smoothedDeltaMs : 0;
}
