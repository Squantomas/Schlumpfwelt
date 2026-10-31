import Phaser from 'phaser';
import { ellipseOutline, ellipseTriangles, roundRectOutline, roundRectPieces, type Pieces } from './shapes';

/**
 * A Graphics object that draws its round shapes (rounded rectangles, circles,
 * ellipses) from a few flat pieces instead of Phaser's 100 points per arc,
 * which Phaser cuts into triangles again in every frame (see `shapes.ts`).
 * It looks the same; everything else is Phaser's Graphics. Create it with
 * {@link addGraphics} instead of `scene.add.graphics()`.
 */
export class FastGraphics extends Phaser.GameObjects.Graphics {
  private fillPieces(pieces: Pieces): this {
    for (const rect of pieces.rects) {
      super.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    for (const [a, b, c] of pieces.triangles) {
      super.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
    }
    return this;
  }

  override fillRoundedRect(x: number, y: number, width: number, height: number, radius: Phaser.Types.GameObjects.Graphics.RoundedRectRadius | number = 20): this {
    if (typeof radius !== 'number') {
      return super.fillRoundedRect(x, y, width, height, radius);
    }
    return this.fillPieces(roundRectPieces(x, y, width, height, radius));
  }

  override strokeRoundedRect(x: number, y: number, width: number, height: number, radius: Phaser.Types.GameObjects.Graphics.RoundedRectRadius | number = 20): this {
    if (typeof radius !== 'number') {
      return super.strokeRoundedRect(x, y, width, height, radius);
    }
    return this.strokePoints(roundRectOutline(x, y, width, height, radius), true, true);
  }

  override fillCircle(x: number, y: number, radius: number): this {
    return this.fillPieces({ rects: [], triangles: ellipseTriangles(x, y, radius, radius) });
  }

  override strokeCircle(x: number, y: number, radius: number): this {
    return this.strokePoints(ellipseOutline(x, y, radius, radius), true, true);
  }

  override fillEllipse(x: number, y: number, width: number, height: number, smoothness?: number): this {
    return this.fillPieces({ rects: [], triangles: ellipseTriangles(x, y, width / 2, height / 2, smoothness) });
  }

  override strokeEllipse(x: number, y: number, width: number, height: number, smoothness?: number): this {
    return this.strokePoints(ellipseOutline(x, y, width / 2, height / 2, smoothness), true, true);
  }
}

/** A new {@link FastGraphics} in the scene (like `scene.add.graphics()`). */
export function addGraphics(scene: Phaser.Scene): FastGraphics {
  const graphics = new FastGraphics(scene);
  scene.add.existing(graphics);
  return graphics;
}
