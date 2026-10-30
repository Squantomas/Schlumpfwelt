import type Phaser from 'phaser';
import { COLORS, FONT_FAMILY, cssColor } from './style';
import { renderScaleOf } from './viewport';

/**
 * Big, friendly text: white with a dark outline, readable on water and grass.
 * Rendered at the render scale, so it stays sharp on HiDPI screens.
 */
export function createLabel(scene: Phaser.Scene, text: string, fontSize: number): Phaser.GameObjects.Text {
  const label = scene.add
    .text(0, 0, text, {
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: cssColor(COLORS.textFill),
      align: 'center',
    })
    .setOrigin(0.5);
  setLabelSize(label, fontSize);
  return label;
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

function applySize(label: Phaser.GameObjects.Text, fontSize: number): void {
  const outline = Math.max(2, Math.round(fontSize * 0.14));
  label
    .setResolution(renderScaleOf(label.scene))
    .setFontSize(fontSize)
    .setStroke(cssColor(COLORS.textOutline), outline)
    .setShadow(0, Math.max(2, Math.round(fontSize * 0.06)), cssColor(COLORS.textShadow), 0, true, true);
}
