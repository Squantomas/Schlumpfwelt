import type Phaser from 'phaser';
import { uiKey } from '../../art/catalog';
import { ICON_BOX } from '../../art/icons';

/**
 * The interface pictures (M9) as images: toolbar, shop tabs, menu buttons, lock and star. They are drawn in a
 * {@link ICON_BOX} square; a picture always fills the square it is given (CSS px).
 */
export function iconImage(scene: Phaser.Scene, name: string): Phaser.GameObjects.Image {
  return scene.add.image(0, 0, uiKey(name));
}

/** Fits a square picture into `width × height` (the `fitContent` of a `SquareButton`). */
export function fitIcon(content: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics, width: number, height: number): void {
  const side = Math.min(width, height);
  (content as Phaser.GameObjects.Image).setDisplaySize(side, side);
}

/** The star "new" of the outer radius `r` (CSS px): the star fills about 0.8 of its picture. */
export function starImage(scene: Phaser.Scene, r: number): Phaser.GameObjects.Image {
  const side = (r * 2 * ICON_BOX) / 54;
  return iconImage(scene, 'star').setDisplaySize(side, side);
}
