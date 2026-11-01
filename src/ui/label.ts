import type Phaser from 'phaser';
import { COLORS, FONT_FAMILY, cssColor } from './style';
import { renderScaleOf } from './viewport';

/**
 * Big, friendly text: white with a dark outline, readable on water and grass.
 * Rendered at the render scale, so it stays sharp on HiDPI screens.
 */
export function createLabel(scene: Phaser.Scene, text: string, fontSize: number): Phaser.GameObjects.Text {
  // The whole style at once: the text is measured and drawn only once (every Phaser setter would draw it again).
  return scene.add
    .text(0, 0, text, {
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: cssColor(COLORS.textFill),
      align: 'center',
      ...sizeStyle(fontSize, renderScaleOf(scene)),
    })
    .setOrigin(0.5);
}

/**
 * Sets the font size (CSS px) and shrinks it if the text would be wider than
 * `maxWidth`. Call again after viewport changes.
 */
export function setLabelSize(label: Phaser.GameObjects.Text, fontSize: number, maxWidth = Infinity): void {
  applySize(label, fontSize);
  if (label.width > maxWidth) {
    applySize(label, Math.max(1, Math.floor((fontSize * maxWidth) / label.width)));
  }
}

/** Font size, outline, shadow and resolution of a label of `fontSize` CSS px. */
function sizeStyle(fontSize: number, resolution: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: `${String(fontSize)}px`,
    stroke: cssColor(COLORS.textOutline),
    strokeThickness: Math.max(2, Math.round(fontSize * 0.14)),
    shadow: { offsetX: 0, offsetY: Math.max(2, Math.round(fontSize * 0.06)), color: cssColor(COLORS.textShadow), blur: 0, stroke: true, fill: true },
    resolution,
  };
}

/** Changes the size only if it differs: each change measures and draws the text again (the slow part of a frame). */
function applySize(label: Phaser.GameObjects.Text, fontSize: number): void {
  const next = sizeStyle(fontSize, renderScaleOf(label.scene));
  const style = label.style;
  const shadow = next.shadow;
  const same =
    style.fontSize === next.fontSize &&
    style.stroke === next.stroke &&
    style.strokeThickness === next.strokeThickness &&
    style.resolution === next.resolution &&
    style.shadowOffsetX === shadow?.offsetX &&
    style.shadowOffsetY === shadow.offsetY &&
    style.shadowColor === shadow.color &&
    style.shadowBlur === shadow.blur &&
    style.shadowStroke &&
    style.shadowFill;
  if (!same) {
    label.setStyle(next);
  }
}
