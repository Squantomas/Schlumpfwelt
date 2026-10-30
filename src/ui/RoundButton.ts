import Phaser from 'phaser';
import { COLORS, MIN_TAP_SIZE } from './style';

export type ButtonIcon = 'play' | 'plus' | 'minus' | 'check' | 'cross';

/** `confirm` is green (✓), `cancel` red (✕), `normal` yellow. */
export type ButtonVariant = 'normal' | 'confirm' | 'cancel';

const VARIANT_COLORS: Readonly<Record<ButtonVariant, { readonly face: number; readonly shade: number; readonly icon: number }>> = {
  normal: { face: COLORS.button, shade: COLORS.buttonShade, icon: COLORS.buttonIcon },
  confirm: { face: COLORS.confirm, shade: COLORS.confirmShade, icon: 0xffffff },
  cancel: { face: COLORS.cancel, shade: COLORS.cancelShade, icon: 0xffffff },
};

export interface RoundButtonOptions {
  /** Radius in CSS px; never smaller than half of {@link MIN_TAP_SIZE}. */
  readonly radius: number;
  readonly icon: ButtonIcon;
  /** Colours; default `normal` (yellow). */
  readonly variant?: ButtonVariant;
  /** Called when the button is released (tap or click). */
  readonly onTap: () => void;
}

/** Big round button with an icon. Works the same with finger and mouse. */
export class RoundButton extends Phaser.GameObjects.Container {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly icon: ButtonIcon;
  private readonly variant: ButtonVariant;
  private radius = 0;
  private pressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, options: RoundButtonOptions) {
    super(scene, x, y);
    this.icon = options.icon;
    this.variant = options.variant ?? 'normal';
    this.face = scene.add.graphics();
    this.add(this.face);
    this.setRadius(options.radius);

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      this.face.setScale(0.92);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.pressed = false;
      this.face.setScale(1);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      this.face.setScale(1);
      // Only a press that started on this button counts (not a drag that ends here),
      // and not a touch the system interrupted (touchcancel).
      if (this.pressed && !pointer.wasCanceled) {
        this.pressed = false;
        options.onTap();
      }
      this.pressed = false;
    });

    scene.add.existing(this);
  }

  /** Current radius in CSS px. */
  get buttonRadius(): number {
    return this.radius;
  }

  setRadius(radius: number): this {
    this.radius = Math.max(radius, MIN_TAP_SIZE / 2);
    this.draw();

    const size = this.radius * 2;
    this.setSize(size, size);
    const hitArea = new Phaser.Geom.Circle(this.radius, this.radius, this.radius);
    if (this.input) {
      this.input.hitArea = hitArea;
    } else {
      this.setInteractive({
        hitArea,
        hitAreaCallback: (area: Phaser.Geom.Circle, x: number, y: number) => area.contains(x, y),
        useHandCursor: true,
      });
    }
    return this;
  }

  /** A dimmed button looks switched off (it still takes taps, the owner decides what they do). */
  setDimmed(dimmed: boolean): this {
    this.face.setAlpha(dimmed ? 0.45 : 1);
    return this;
  }

  private draw(): void {
    const r = this.radius;
    const colors = VARIANT_COLORS[this.variant];
    const g = this.face.clear();
    g.fillStyle(colors.shade).fillCircle(0, r * 0.08, r);
    g.fillStyle(COLORS.buttonRim).fillCircle(0, 0, r);
    g.fillStyle(colors.face).fillCircle(0, 0, r * 0.86);

    switch (this.icon) {
      case 'play': {
        const s = r * 0.42;
        g.fillStyle(colors.icon).fillTriangle(-s * 0.7, -s, -s * 0.7, s, s, 0);
        break;
      }
      case 'check': {
        strokeLine(g, colors.icon, r * 0.2, [
          [-r * 0.42, r * 0.02],
          [-r * 0.12, r * 0.32],
          [r * 0.44, -r * 0.3],
        ]);
        break;
      }
      case 'cross': {
        const a = r * 0.34;
        strokeLine(g, colors.icon, r * 0.2, [[-a, -a], [a, a]]);
        strokeLine(g, colors.icon, r * 0.2, [[-a, a], [a, -a]]);
        break;
      }
      case 'plus':
      case 'minus': {
        const arm = r * 0.4;
        const thickness = r * 0.2;
        g.fillStyle(colors.icon).fillRoundedRect(-arm, -thickness / 2, arm * 2, thickness, thickness / 2);
        if (this.icon === 'plus') {
          g.fillRoundedRect(-thickness / 2, -arm, thickness, arm * 2, thickness / 2);
        }
        break;
      }
    }
  }
}

/** A thick line through the points with round ends and corners. */
function strokeLine(g: Phaser.GameObjects.Graphics, color: number, width: number, points: readonly (readonly [number, number])[]): void {
  g.lineStyle(width, color, 1);
  g.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      g.moveTo(x, y);
    } else {
      g.lineTo(x, y);
    }
  });
  g.strokePath();
  g.fillStyle(color);
  for (const [x, y] of points) {
    g.fillCircle(x, y, width / 2);
  }
}
