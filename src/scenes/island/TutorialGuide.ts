import type Phaser from 'phaser';
import { TUTORIAL_RULES } from '../../data/tutorial';
import { addGraphics } from '../../ui/FastGraphics';
import { COLORS } from '../../ui/style';
import { handPose } from '../../ui/tutorial';
import type { ViewSize } from '../../ui/viewport';

/** The glow is drawn once at this radius and scaled to its target. */
const GLOW_BASE = 40;

/**
 * The pointing hand of the guided start (M8): a white hand whose fingertip rests on the place to tap next – above it
 * pointing down, or below it pointing up near the top of the screen – bobbing gently, with a soft pulsing glow around
 * the place. Both are drawn once and only moved, scaled and faded (cheap); they take no taps (the child taps the
 * thing below). Lives in the UI layer above the controls.
 */
export class TutorialGuide {
  private readonly hand: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private shownAt: { readonly x: number; readonly y: number; readonly fromBelow: boolean } | undefined;

  constructor(scene: Phaser.Scene, uiLayer: Phaser.GameObjects.Layer) {
    this.glow = addGraphics(scene);
    this.glow.fillStyle(COLORS.handGlow, 0.22).fillCircle(0, 0, GLOW_BASE);
    this.glow.lineStyle(6, COLORS.handGlow, 0.95).strokeCircle(0, 0, GLOW_BASE);
    this.hand = addGraphics(scene);
    drawHand(this.hand);
    this.glow.setVisible(false);
    this.hand.setVisible(false);
    uiLayer.add([this.glow, this.hand]);
  }

  /** Where the hand points now (CSS px), for the page marker; `undefined` when it is hidden. */
  get pointsAt(): { readonly x: number; readonly y: number; readonly fromBelow: boolean } | undefined {
    return this.shownAt;
  }

  /**
   * Once per frame: points at `target` (CSS px, `radius` of the glow) or hides. `time` in ms (the scene's clock), for
   * the bobbing and the pulse.
   */
  update(target: { readonly x: number; readonly y: number; readonly radius: number } | undefined, view: ViewSize, time: number): void {
    if (!target) {
      this.shownAt = undefined;
      this.hand.setVisible(false);
      this.glow.setVisible(false);
      return;
    }
    const pose = handPose(target, view);
    this.shownAt = pose;
    const beat = Math.sin((time / TUTORIAL_RULES.pulseMs) * Math.PI * 2);
    const radius = Math.max(26, Math.min(70, target.radius));
    this.glow
      .setVisible(true)
      .setPosition(pose.x, pose.y)
      .setScale((radius / GLOW_BASE) * (1 + 0.08 * beat))
      .setAlpha(0.65 + 0.3 * beat);
    // The fingertip stays near the middle of the place, a little towards the hand; it bobs towards it and back.
    const toward = pose.fromBelow ? 1 : -1;
    const gap = Math.min(radius * 0.35, 18) + 4 + 5 * (1 + beat);
    this.hand.setVisible(true).setPosition(pose.x, pose.y + toward * gap).setScale(1, pose.fromBelow ? -1 : 1);
  }
}

/** A white hand with a dark rim, the index finger down, the fingertip at (0, 0); about 46 × 70 CSS px. */
function drawHand(g: Phaser.GameObjects.Graphics): void {
  const parts = (grow: number, color: number): void => {
    g.fillStyle(color, 1);
    // Index finger.
    g.fillRoundedRect(-7 - grow, -40 - grow, 14 + 2 * grow, 42 + 2 * grow, 7 + grow);
    // Palm with the folded fingers.
    g.fillRoundedRect(-9 - grow, -66 - grow, 34 + 2 * grow, 34 + 2 * grow, 10 + grow);
    g.fillRoundedRect(5 - grow, -40 - grow, 10 + 2 * grow, 14 + 2 * grow, 5 + grow);
    g.fillRoundedRect(14 - grow, -42 - grow, 10 + 2 * grow, 14 + 2 * grow, 5 + grow);
    // Thumb.
    g.fillRoundedRect(-19 - grow, -58 - grow, 14 + 2 * grow, 22 + 2 * grow, 7 + grow);
  };
  g.clear();
  parts(3, COLORS.handRim);
  parts(0, COLORS.handFill);
  // A small nail on the fingertip.
  g.fillStyle(COLORS.handGlow, 1).fillRoundedRect(-4, -10, 8, 7, 3);
}
