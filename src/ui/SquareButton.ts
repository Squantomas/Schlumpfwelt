import Phaser from 'phaser';
import { createLabel, setLabelSize } from './label';
import { COLORS } from './style';

export interface SquareButtonOptions {
  /** Short word under the picture; a line break (`\n`) is allowed. */
  readonly label: string;
  /** The picture. It is centred in the upper part of the button. */
  readonly content: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  /** Called whenever the button changes size: fit the picture into `width × height` (CSS px). */
  readonly fitContent: (content: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics, width: number, height: number) => void;
  /** Called when the button is released after being pressed (tap or click). */
  readonly onTap: (eventTime: number) => void;
}

/** Share of the button height that the picture may use; the rest is for the label. */
const PICTURE_SHARE = 0.64;

/**
 * Big rounded button with a picture and a short word underneath (toolbar and
 * picker). Works the same with finger and mouse; only a press that started on
 * the button counts as a tap. The container sits at the centre of the button.
 */
export class SquareButton extends Phaser.GameObjects.Container {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly caption: Phaser.GameObjects.Text;
  private readonly content: SquareButtonOptions['content'];
  private readonly fitContent: SquareButtonOptions['fitContent'];
  private buttonWidth = 0;
  private buttonHeight = 0;
  private highlighted = false;
  private pressed = false;

  constructor(scene: Phaser.Scene, options: SquareButtonOptions) {
    super(scene, 0, 0);
    this.content = options.content;
    this.fitContent = options.fitContent;
    this.face = scene.add.graphics();
    this.caption = createLabel(scene, options.label, 14);
    this.add([this.face, options.content, this.caption]);

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      this.setScale(0.95);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.pressed = false;
      this.setScale(1);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      this.setScale(1);
      if (this.pressed && !pointer.wasCanceled) {
        this.pressed = false;
        options.onTap(pointer.event?.timeStamp ?? this.scene.time.now);
      }
      this.pressed = false;
    });
    scene.add.existing(this);
  }

  /** Sets the size in CSS px and lays out picture and label. */
  layoutTo(width: number, height: number): this {
    this.buttonWidth = width;
    this.buttonHeight = height;
    this.setSize(width, height);
    if (this.input) {
      this.input.hitArea = new Phaser.Geom.Rectangle(0, 0, width, height);
    } else {
      this.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, width, height), hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number) => area.contains(x, y), useHandCursor: true });
    }
    const pictureHeight = height * PICTURE_SHARE;
    this.fitContent(this.content, width * 0.8, pictureHeight * 0.9);
    this.content.setPosition(0, -height / 2 + pictureHeight / 2 + height * 0.04);
    const lines = this.caption.text.split('\n').length;
    setLabelSize(this.caption, Math.max(11, Math.min(17, height * (lines > 1 ? 0.15 : 0.19))), width - 6);
    this.caption.setPosition(0, height / 2 - (height * (1 - PICTURE_SHARE)) / 2 - height * 0.02);
    this.draw();
    return this;
  }

  /** Highlights the button (active tool, chosen variant). */
  setHighlighted(on: boolean): this {
    if (on !== this.highlighted) {
      this.highlighted = on;
      this.draw();
    }
    return this;
  }

  private draw(): void {
    const w = this.buttonWidth;
    const h = this.buttonHeight;
    const radius = Math.min(w, h) * 0.2;
    const g = this.face.clear();
    const lift = this.highlighted ? -4 : 0;
    g.fillStyle(this.highlighted ? COLORS.buttonShade : COLORS.toolFaceShade).fillRoundedRect(-w / 2, -h / 2 + 4 + lift, w, h, radius);
    g.fillStyle(this.highlighted ? COLORS.toolActiveRim : COLORS.buttonRim).fillRoundedRect(-w / 2, -h / 2 + lift, w, h, radius);
    g.fillStyle(this.highlighted ? COLORS.toolActive : COLORS.toolFace).fillRoundedRect(-w / 2 + 3, -h / 2 + 3 + lift, w - 6, h - 6, radius * 0.8);
    this.face.setPosition(0, 0);
  }
}
