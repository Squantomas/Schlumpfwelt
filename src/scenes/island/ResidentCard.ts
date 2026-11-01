import type Phaser from 'phaser';
import type { Rect } from '../../ui/cameraMath';
import type { InfoCardLayout } from '../../ui/infoCardLayout';
import { createLabel, setLabelSize } from '../../ui/label';
import { CARD_ROW_GAP, fitRows, residentCardLayout, type ResidentCardLayout } from '../../ui/residentCardLayout';
import type { ResidentInfo } from '../../ui/residentInfo';
import { RoundButton } from '../../ui/RoundButton';
import { COLORS } from '../../ui/style';
import { RESIDENT_SIZE, residentTextureKey } from './residentTextures';
import { addGraphics } from '../../ui/FastGraphics';

/**
 * The card that opens when a resident is tapped (M6), at the place of the
 * info card: their name and a big ✕ at the top, a big picture of them (with
 * their hat) on the left, and on the right their job, hat, home and what they
 * are doing right now – all four rows in one font size (see
 * `residentCardLayout.ts`; compact on flat screens). It only draws what
 * {@link residentInfo} says; the scene keeps it up to date (once per tick).
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
  private rowFont = 0;

  constructor(scene: Phaser.Scene, uiLayer: Phaser.GameObjects.Layer, onClose: (eventTime: number) => void) {
    this.panel = addGraphics(scene);
    this.name = createLabel(scene, '', 28);
    this.picture = scene.add.image(0, 0, residentTextureKey(0));
    this.lines = [0, 1, 2, 3].map(() => createLabel(scene, '', 18).setOrigin(0, 0).setAlign('left'));
    this.closeButton = new RoundButton(scene, 0, 0, { radius: 32, icon: 'cross', variant: 'cancel', onTap: onClose });
    uiLayer.add([this.panel, this.picture, this.name, ...this.lines, this.closeButton]);
    this.hide();
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The card's rectangle while it is open (an empty one otherwise). */
  get rect(): Rect {
    return this.open && this.layoutData ? this.layoutData.parts.rect : { x: 0, y: 0, width: 0, height: 0 };
  }

  /** The position and size of the ✕ (CSS px), for the smoke test. */
  get closeSpot(): { x: number; y: number; size: number } {
    return { x: this.closeButton.x, y: this.closeButton.y, size: this.closeButton.buttonRadius * 2 };
  }

  /** The font size of the four rows (CSS px; the same for all of them), for the smoke test. */
  get rowsFont(): number {
    return this.rowFont;
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
      this.drawFrame(this.layoutData.parts);
    }
    this.open = true;
    this.update(info);
  }

  private drawFrame(parts: ResidentCardLayout): void {
    const { rect } = parts;
    const g = this.panel.clear();
    g.fillStyle(COLORS.stoneDark, 0.35).fillRoundedRect(rect.x, rect.y + 6, rect.width, rect.height, 26);
    g.fillStyle(COLORS.cardRim).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 26);
    g.fillStyle(COLORS.cardFace).fillRoundedRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8, 22);
    const { picture } = parts;
    // A soft round spot behind the picture.
    g.fillStyle(COLORS.cardRim, 0.45).fillEllipse(picture.x + picture.width / 2, picture.y + picture.height * 0.9, picture.width * 0.8, picture.height * 0.22);
    const { close } = parts;
    this.closeButton.setRadius(close.width / 2).setPosition(close.x + close.width / 2, close.y + close.height / 2);
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
    const { parts } = data;
    this.name.setText(info.name);
    setLabelSize(this.name, parts.nameFont, parts.name.width);
    this.name.setPosition(parts.name.x + parts.name.width / 2, parts.name.y + parts.name.height / 2);

    const { picture } = parts;
    const scale = Math.min(picture.width / RESIDENT_SIZE.width, picture.height / RESIDENT_SIZE.height);
    this.picture
      .setTexture(residentTextureKey(info.hat))
      .setDisplaySize(RESIDENT_SIZE.width * scale, RESIDENT_SIZE.height * scale)
      .setPosition(picture.x + picture.width / 2, picture.y + picture.height / 2);

    // Job, hat, home, activity: one font size for all four; a long row wraps to the width of the column.
    const texts = [...info.lines, info.activity];
    const { column } = parts;
    this.lines.forEach((label, index) => {
      label.setText(texts[index] ?? '').setWordWrapWidth(column.width);
    });
    const measure = (row: number, font: number): number => {
      const label = this.lines[row];
      if (!label) {
        return 0;
      }
      setLabelSize(label, font);
      return label.height;
    };
    const { font, heights } = fitRows(this.lines.length, column.height, parts.maxFont, measure);
    this.rowFont = font;
    const total = heights.reduce((sum, h) => sum + h, 0) + CARD_ROW_GAP * (heights.length - 1);
    let y = column.y + Math.max(0, (column.height - total) / 2);
    this.lines.forEach((label, index) => {
      setLabelSize(label, font);
      label.setPosition(column.x, y);
      y += (heights[index] ?? label.height) + CARD_ROW_GAP;
    });
  }
}
