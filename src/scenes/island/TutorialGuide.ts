import type Phaser from 'phaser';
import { TUTORIAL_RULES } from '../../data/tutorial';
import { addGraphics } from '../../ui/FastGraphics';
import { COLORS } from '../../ui/style';
import { ART_SCALE, HAND_KEY } from '../../art/catalog';
import { HAND_SIZE, HAND_TIP } from '../../art/icons';
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
  private readonly hand: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Graphics;
  private shownAt: { readonly x: number; readonly y: number; readonly fromBelow: boolean } | undefined;

  constructor(scene: Phaser.Scene, uiLayer: Phaser.GameObjects.Layer) {
    this.glow = addGraphics(scene);
    this.glow.fillStyle(COLORS.handGlow, 0.22).fillCircle(0, 0, GLOW_BASE);
    this.glow.lineStyle(6, COLORS.handGlow, 0.95).strokeCircle(0, 0, GLOW_BASE);
    // The picture of the hand (M9), its origin at the fingertip.
    this.hand = scene.add.image(0, 0, HAND_KEY).setOrigin(HAND_TIP.x / HAND_SIZE.width, HAND_TIP.y / HAND_SIZE.height);
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
  update(
    target: { readonly x: number; readonly y: number; readonly radius: number } | undefined,
    view: ViewSize,
    time: number,
    band?: { readonly top: number; readonly bottom: number },
  ): void {
    if (!target) {
      this.shownAt = undefined;
      this.hand.setVisible(false);
      this.glow.setVisible(false);
      return;
    }
    const pose = handPose(target, view, undefined, band);
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
    this.hand.setVisible(true).setPosition(pose.x, pose.y + toward * gap).setScale(1 / ART_SCALE, (pose.fromBelow ? -1 : 1) / ART_SCALE);
  }
}
