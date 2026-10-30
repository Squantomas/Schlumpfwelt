import Phaser from 'phaser';
import { COLORS, MIN_TAP_SIZE } from './style';

export type ButtonIcon = 'play' | 'plus' | 'minus';

export interface RoundButtonOptions {
  /** Radius in CSS px; never smaller than half of {@link MIN_TAP_SIZE}. */
  readonly radius: number;
  readonly icon: ButtonIcon;
  /** Called when the button is released (tap or click). */
  readonly onTap: () => void;
}

/** Big round button with an icon. Works the same with finger and mouse. */
export class RoundButton extends Phaser.GameObjects.Container {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly icon: ButtonIcon;
  private radius = 0;
  private pressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, options: RoundButtonOptions) {
    super(scene, x, y);
    this.icon = options.icon;
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

  private draw(): void {
    const r = this.radius;
    const g = this.face.clear();
    g.fillStyle(COLORS.buttonShade).fillCircle(0, r * 0.08, r);
    g.fillStyle(COLORS.buttonRim).fillCircle(0, 0, r);
    g.fillStyle(COLORS.button).fillCircle(0, 0, r * 0.86);

    switch (this.icon) {
      case 'play': {
        const s = r * 0.42;
        g.fillStyle(COLORS.buttonIcon).fillTriangle(-s * 0.7, -s, -s * 0.7, s, s, 0);
        break;
      }
      case 'plus':
      case 'minus': {
        const arm = r * 0.4;
        const thickness = r * 0.2;
        g.fillStyle(COLORS.buttonIcon).fillRoundedRect(-arm, -thickness / 2, arm * 2, thickness, thickness / 2);
        if (this.icon === 'plus') {
          g.fillRoundedRect(-thickness / 2, -arm, thickness, arm * 2, thickness / 2);
        }
        break;
      }
    }
  }
}
