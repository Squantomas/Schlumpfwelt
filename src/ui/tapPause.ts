/**
 * After a tap on a control (✓, ✕, a tool …) taps on the world are ignored for
 * a moment: a double tap on ✓ would otherwise fall through to the map as soon
 * as the button is gone and start a new preview. Times are the times of the
 * browser events (not of the frames), so slow frames that handle both taps
 * together do not hide a double tap.
 */
export const WORLD_TAP_PAUSE_MS = 300;

/** Should a tap on the world at `tapTime` be ignored, given the last tap on a control at `controlTapTime`? */
export function worldTapIgnored(tapTime: number, controlTapTime: number): boolean {
  const since = tapTime - controlTapTime;
  return since >= 0 && since < WORLD_TAP_PAUSE_MS;
}
