import Phaser from 'phaser';
import { createLabel, setLabelSize } from './label';
import { COLORS } from './style';
import { addGraphics } from './FastGraphics';

export interface SquareButtonOptions {
  /** Short word under the picture; a line break (`\n`) is allowed. */
  readonly label: string;
  /** The picture. It is centred in the upper part of the button. */
  readonly content: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  /** Called whenever the button changes size: fit the picture into `width × height` (CSS px). */
  readonly fitContent: (content: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics, width: number, height: number) => void;
  /** Called when the button is released after being pressed (tap or click). */
  readonly onTap: (eventTime: number) => void;
  /** An extra row at the bottom of the button (the cost); it gets `layoutTo(width, height)` and is placed there. */
  readonly footer?: Phaser.GameObjects.Container & { layoutTo: (width: number, height: number) => unknown };
  /**
   * The word under the picture is never smaller than this (CSS px): if it would have to shrink further to fit the
   * button, it is left out and the picture alone stays (tabs and toolbar).
   */
  readonly minCaptionFont?: number;
}

/** Share of the button height that the picture may use; the rest is for the label. */
const PICTURE_SHARE = 0.64;
/** With a footer row (the cost): picture, then the name, then the footer. */
const FOOTER_PICTURE_SHARE = 0.44;
const FOOTER_SHARE = 0.3;

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
  private readonly footer: SquareButtonOptions['footer'];
  private readonly minCaptionFont: number | undefined;
  private captionOff = false;

  constructor(scene: Phaser.Scene, options: SquareButtonOptions) {
    super(scene, 0, 0);
    this.content = options.content;
    this.fitContent = options.fitContent;
    this.footer = options.footer;
    this.minCaptionFont = options.minCaptionFont;
    this.face = addGraphics(scene);
    this.caption = createLabel(scene, options.label, 14);
    this.add([this.face, options.content, this.caption]);
    if (this.footer) {
      this.add(this.footer);
    }

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
    const withFooter = this.footer !== undefined;
    const pictureHeight = height * (withFooter ? FOOTER_PICTURE_SHARE : PICTURE_SHARE);
    this.fitContent(this.content, width * 0.8, pictureHeight * 0.9);
    this.content.setPosition(0, -height / 2 + pictureHeight / 2 + height * 0.04);
    if (this.footer) {
      const footerHeight = height * FOOTER_SHARE;
      const captionHeight = height - pictureHeight - footerHeight - height * 0.04;
      setLabelSize(this.caption, Math.max(11, Math.min(15, captionHeight * 0.8)), width - 6);
      this.caption.setPosition(0, -height / 2 + height * 0.04 + pictureHeight + captionHeight / 2);
      this.footer.layoutTo(width - 8, footerHeight * 0.8);
      this.footer.setPosition(0, height / 2 - footerHeight / 2 - height * 0.03);
    } else {
      const lines = this.caption.text.split('\n').length;
      const minFont = this.minCaptionFont ?? 11;
      setLabelSize(this.caption, Math.max(minFont, Math.min(17, height * (lines > 1 ? 0.15 : 0.19))), width - 6);
      this.caption.setPosition(0, height / 2 - (height * (1 - PICTURE_SHARE)) / 2 - height * 0.02);
      // Too narrow for the word at the minimum size: the picture alone (centred and a bit bigger).
      const tooNarrow = this.captionOff || (this.minCaptionFont !== undefined && Number.parseFloat(String(this.caption.style.fontSize)) < this.minCaptionFont);
      this.caption.setVisible(!tooNarrow);
      if (tooNarrow) {
        this.fitContent(this.content, width * 0.8, height * 0.8);
        this.content.setPosition(0, 0);
      }
    }
    this.draw();
    return this;
  }

  /** Leaves the word out on purpose (so all buttons of a row look alike when one of them has no room for it); takes effect with the next `layoutTo`. */
  setCaptionOff(off: boolean): this {
    this.captionOff = off;
    return this;
  }

  /** The size of the word under the picture in CSS px (0 if it is left out): for the smoke test. */
  get captionFont(): number {
    return this.caption.visible ? Number.parseFloat(String(this.caption.style.fontSize)) : 0;
  }

  /** A dimmed button looks switched off (what it needs is missing); it still takes taps. */
  setDimmed(dimmed: boolean): this {
    const alpha = dimmed ? 0.55 : 1;
    this.face.setAlpha(alpha);
    this.content.setAlpha(alpha);
    this.caption.setAlpha(dimmed ? 0.8 : 1);
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
