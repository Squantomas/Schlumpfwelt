import type Phaser from 'phaser';
import type { Rect } from '../../ui/cameraMath';
import type { InfoCardLayout } from '../../ui/infoCardLayout';
import { createLabel, setLabelSize } from '../../ui/label';
import { residentCardLayout, type ResidentCardLayout } from '../../ui/residentCardLayout';
import type { ResidentInfo } from '../../ui/residentInfo';
import { RoundButton } from '../../ui/RoundButton';
import { COLORS } from '../../ui/style';
import { RESIDENT_SIZE, residentTextureKey } from './residentTextures';
import { addGraphics } from '../../ui/FastGraphics';

/**
 * The card that opens when a resident is tapped (M6), at the place of the
 * info card: their name and a big ✕ at the top, a big picture of them (with
 * their hat) on the left, and on the right their job, hat, home and what they
 * are doing right now. It only draws what {@link residentInfo} says; the scene
 * keeps it up to date (once per tick).
 */
export class ResidentCard {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly picture: Phaser.GameObjects.Image;
  private readonly lines: Phaser.GameObjects.Text[];
  private readonly closeButton: RoundButton;
  private layoutData: { readonly card: InfoCardLayout; readonly parts: ResidentCardLayout } | undefined;
  private shown = '';
  private open = false;

  constructor(scene: Phaser.Scene, uiLayer: Phaser.GameObjects.Layer, onClose: (eventTime: number) => void) {
    this.panel = addGraphics(scene);
    this.name = createLabel(scene, '', 28);
    this.picture = scene.add.image(0, 0, residentTextureKey(0));
    this.lines = [0, 1, 2, 3].map(() => createLabel(scene, '', 18).setOrigin(0, 0.5).setAlign('left'));
    this.closeButton = new RoundButton(scene, 0, 0, { radius: 32, icon: 'cross', variant: 'cancel', onTap: onClose });
    uiLayer.add([this.panel, this.picture, this.name, ...this.lines, this.closeButton]);
    this.hide();
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The card's rectangle while it is open (an empty one otherwise). */
  get rect(): Rect {
    return this.open && this.layoutData ? this.layoutData.card.rect : { x: 0, y: 0, width: 0, height: 0 };
  }

  /** The position of the ✕ (CSS px), for the smoke test. */
  get closeSpot(): { x: number; y: number } {
    return { x: this.closeButton.x, y: this.closeButton.y };
  }

  hide(): void {
    this.open = false;
    this.shown = '';
    for (const object of [this.panel, this.name, this.picture, ...this.lines, this.closeButton]) {
      object.setVisible(false);
    }
  }

  /** Shows the card at `layout` (the place of the info card) for the resident `info`. */
  show(layout: InfoCardLayout, info: ResidentInfo): void {
    if (this.layoutData?.card !== layout) {
      this.layoutData = { card: layout, parts: residentCardLayout(layout) };
      this.shown = '';
      this.drawFrame(layout, this.layoutData.parts);
    }
    this.open = true;
    this.update(info);
  }

  private drawFrame(layout: InfoCardLayout, parts: ResidentCardLayout): void {
    const { rect } = layout;
    const g = this.panel.clear();
    g.fillStyle(COLORS.stoneDark, 0.35).fillRoundedRect(rect.x, rect.y + 6, rect.width, rect.height, 26);
    g.fillStyle(COLORS.cardRim).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 26);
    g.fillStyle(COLORS.cardFace).fillRoundedRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8, 22);
    const { picture } = parts;
    // A soft round spot behind the picture.
    g.fillStyle(COLORS.cardRim, 0.45).fillEllipse(picture.x + picture.width / 2, picture.y + picture.height * 0.9, picture.width * 0.8, picture.height * 0.22);
    this.closeButton.setPosition(layout.close.x + layout.close.width / 2, layout.close.y + layout.close.height / 2);
  }

  /** Writes what the resident is doing now; cheap when nothing changed. */
  update(info: ResidentInfo): void {
    const data = this.layoutData;
    if (!data) {
      return;
    }
    const key = `${String(info.id)}|${String(info.hat)}|${info.name}|${info.lines.join('|')}|${info.activity}`;
    for (const object of [this.panel, this.name, this.picture, ...this.lines, this.closeButton]) {
      object.setVisible(true);
    }
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    const { card, parts } = data;
    this.name.setText(info.name);
    setLabelSize(this.name, card.compact ? 24 : 30, card.name.width);
    this.name.setPosition(card.name.x + card.name.width / 2, card.name.y + card.name.height / 2);

    const { picture } = parts;
    const scale = Math.min(picture.width / RESIDENT_SIZE.width, picture.height / RESIDENT_SIZE.height);
    this.picture
      .setTexture(residentTextureKey(info.hat))
      .setDisplaySize(RESIDENT_SIZE.width * scale, RESIDENT_SIZE.height * scale)
      .setPosition(picture.x + picture.width / 2, picture.y + picture.height / 2);

    const texts = [...info.lines, info.activity];
    this.lines.forEach((label, index) => {
      const rect = parts.lines[index as 0 | 1 | 2 | 3];
      const text = texts[index] ?? '';
      const activity = index === 3;
      label.setText(text).setWordWrapWidth(activity ? rect.width : null);
      let size = activity ? Math.max(parts.lineFont, Math.min(22, Math.floor(rect.height * 0.42))) : parts.lineFont;
      setLabelSize(label, size, rect.width);
      // The activity may wrap; it shrinks until it fits its field (never under 12 px).
      while (activity && label.height > rect.height && size > 12) {
        size -= 1;
        setLabelSize(label, size, rect.width);
      }
      label.setPosition(rect.x, rect.y + rect.height / 2);
    });
  }
}
