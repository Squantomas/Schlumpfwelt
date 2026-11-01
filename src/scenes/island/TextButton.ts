import Phaser from 'phaser';
import type { Rect } from '../../ui/cameraMath';
import { addGraphics } from '../../ui/FastGraphics';
import { createLabel, setLabelSize } from '../../ui/label';
import { COLORS } from '../../ui/style';

/**
 * A big rounded button with a word on it (M8: the keys of the parents' keypad, the choices of the limit and the
 * buttons of the settings). Works the same with finger and mouse; only a press that started on it counts. It is
 * placed and sized with {@link place} (CSS px); a highlighted one is the chosen choice.
 */
export class TextButton extends Phaser.GameObjects.Container {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly caption: Phaser.GameObjects.Text;
  private rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private font = 20;
  private highlighted = false;
  private pressed = false;

  constructor(scene: Phaser.Scene, text: string, onTap: (eventTime: number) => void) {
    super(scene, 0, 0);
    this.face = addGraphics(scene);
    this.caption = createLabel(scene, text, 20);
    this.add([this.face, this.caption]);
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      this.setScale(0.96);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.pressed = false;
      this.setScale(1);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      this.setScale(1);
      if (this.pressed && !pointer.wasCanceled) {
        this.pressed = false;
        onTap(pointer.event?.timeStamp ?? this.scene.time.now);
      }
      this.pressed = false;
    });
    scene.add.existing(this);
  }

  /** Sizes the button to `rect` (CSS px) with letters of `font` px (smaller if the word is too wide), and puts it there. */
  place(rect: Rect, font: number): this {
    this.rect = rect;
    this.font = font;
    this.setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
    this.setSize(rect.width, rect.height);
    const hitArea = new Phaser.Geom.Rectangle(0, 0, rect.width, rect.height);
    if (this.input) {
      this.input.hitArea = hitArea;
    } else {
      this.setInteractive({ hitArea, hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number) => area.contains(x, y), useHandCursor: true });
    }
    this.caption.setWordWrapWidth(rect.width - 16);
    setLabelSize(this.caption, font, rect.width - 16);
    this.draw();
    return this;
  }

  setText(text: string): this {
    if (this.caption.text !== text) {
      this.caption.setText(text);
      setLabelSize(this.caption, this.font, this.rect.width - 16);
    }
    return this;
  }

  /** A new word (M9: the sound switches say what is now); takes effect with the next {@link place}. */
  setCaption(text: string): this {
    if (this.caption.text !== text) {
      this.caption.setText(text);
    }
    return this;
  }

  setHighlighted(highlighted: boolean): this {
    if (highlighted !== this.highlighted) {
      this.highlighted = highlighted;
      this.draw();
    }
    return this;
  }

  private draw(): void {
    const { width: w, height: h } = this.rect;
    const radius = Math.min(w, h) * 0.22;
    this.face.clear();
    this.face.fillStyle(COLORS.toolFaceShade).fillRoundedRect(-w / 2, -h / 2 + 4, w, h, radius);
    this.face.fillStyle(this.highlighted ? COLORS.toolActive : COLORS.buttonRim).fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    this.face.fillStyle(this.highlighted ? COLORS.toolActive : COLORS.panel).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, radius * 0.8);
  }
}
