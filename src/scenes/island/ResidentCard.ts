import type Phaser from 'phaser';
import { t } from '../../data/texts';
import type { Rect } from '../../ui/cameraMath';
import type { InfoCardLayout } from '../../ui/infoCardLayout';
import { createLabel, setLabelSize } from '../../ui/label';
import { CARD_ROW_GAP, TALL_ROWS, fitRows, residentCardLayout, type ResidentCardLayout } from '../../ui/residentCardLayout';
import type { Mood } from '../../sim/mood';
import { cardRows, type ResidentInfo } from '../../ui/residentInfo';
import { RoundButton } from '../../ui/RoundButton';
import { SquareButton } from '../../ui/SquareButton';
import { COLORS } from '../../ui/style';
import { drawMoveHomeIcon } from '../../ui/toolIcons';
import { RESIDENT_SIZE, moodTextureKey, residentTextureKey } from './residentTextures';
import { addGraphics } from '../../ui/FastGraphics';

/** The word under the picture of the button "Umziehen" is never smaller than this (CSS px). */
const MOVE_CAPTION_MIN = 12;
/** …and it is as big as the rows of the card, but at least this (as far as the button has room for it, CSS px). */
const MOVE_CAPTION_WISH = 14;

/**
 * The card that opens when a resident is tapped (M6), at the place of the
 * info card: their name and a big ✕ at the top, a big picture of them (with
 * their hat, and their mood in its corner – M7) on the left with the button
 * "Umziehen" below it, and on the right their job, hat, home, what they are
 * doing right now, how they feel and a tip – all rows in one font size (see
 * `residentCardLayout.ts`; compact on flat screens with four rows). It only
 * draws what {@link residentInfo} says; the scene keeps it up to date (once
 * per tick). A tap on the dimmed "Umziehen" (still on the boat) puts a short
 * sentence in place of the tip ("Lumo steigt gleich aus."), until they are on
 * land or the card closes.
 */
export class ResidentCard {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly picture: Phaser.GameObjects.Image;
  private readonly moodIcon: Phaser.GameObjects.Image;
  private readonly lines: Phaser.GameObjects.Text[];
  private readonly closeButton: RoundButton;
  private readonly moveButton: SquareButton;
  private layoutData: { readonly card: InfoCardLayout; readonly parts: ResidentCardLayout } | undefined;
  private shown = '';
  private open = false;
  private rowFont = 0;
  private canMove = false;
  private mood: Mood = 'normal';
  /** What the card shows now, and the sentence in place of the tip after a tap on the dimmed "Umziehen" (for whom). */
  private info: ResidentInfo | undefined;
  private note: { readonly residentId: number; readonly text: string } | undefined;

  constructor(
    scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Layer,
    onClose: (eventTime: number) => void,
    onMove: (eventTime: number) => void,
    onMoveRefused: (eventTime: number) => void,
  ) {
    this.panel = addGraphics(scene);
    this.name = createLabel(scene, '', 28);
    this.picture = scene.add.image(0, 0, residentTextureKey(0));
    this.moodIcon = scene.add.image(0, 0, moodTextureKey('normal'));
    this.lines = Array.from({ length: TALL_ROWS }, () => createLabel(scene, '', 18).setOrigin(0, 0).setAlign('left'));
    this.closeButton = new RoundButton(scene, 0, 0, { radius: 32, icon: 'cross', variant: 'cancel', onTap: onClose });
    this.moveButton = new SquareButton(scene, {
      label: t('resident.move'),
      minCaptionFont: MOVE_CAPTION_MIN,
      content: addGraphics(scene),
      fitContent: (content, width, height) => {
        drawMoveHomeIcon(content as Phaser.GameObjects.Graphics, Math.min(width, height));
      },
      onTap: (time) => {
        if (this.canMove) {
          onMove(time);
          return;
        }
        // Still on the boat (the button looks switched off): say why instead of doing nothing.
        const info = this.info;
        if (info) {
          this.note = { residentId: info.id, text: t('resident.boatWait', { name: info.name }) };
          this.update(info);
        }
        onMoveRefused(time);
      },
    });
    uiLayer.add([this.panel, this.picture, this.moodIcon, this.name, ...this.lines, this.closeButton, this.moveButton]);
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

  /** The middle and size of the button "Umziehen" (CSS px) and whether it works now, for the smoke test. */
  get moveSpot(): { x: number; y: number; w: number; h: number; enabled: boolean; font: number } | undefined {
    const move = this.open ? this.layoutData?.parts.move : undefined;
    return move ? { x: move.x + move.width / 2, y: move.y + move.height / 2, w: move.width, h: move.height, enabled: this.canMove, font: this.moveButton.captionFont } : undefined;
  }

  /** The font size of the rows (CSS px; the same for all of them), for the smoke test. */
  get rowsFont(): number {
    return this.rowFont;
  }

  /** The mood the picture in the corner shows (heart, face, cloud), for the smoke test. */
  get shownMood(): Mood {
    return this.mood;
  }

  /** Does the card show the sentence of the dimmed "Umziehen" ("… steigt gleich aus.")? For the smoke test. */
  get noteShown(): boolean {
    return this.open && this.note !== undefined;
  }

  /** How many rows the card shows now (six, or four on a compact card), for the smoke test. */
  get rowCount(): number {
    return this.layoutData?.parts.rows ?? 0;
  }

  hide(): void {
    this.open = false;
    this.shown = '';
    this.note = undefined;
    this.info = undefined;
    for (const object of [this.panel, this.name, this.picture, this.moodIcon, ...this.lines, this.closeButton, this.moveButton]) {
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
    const { close, move, mood } = parts;
    this.closeButton.setRadius(close.width / 2).setPosition(close.x + close.width / 2, close.y + close.height / 2);
    this.moveButton.layoutTo(move.width, move.height).setPosition(move.x + move.width / 2, move.y + move.height / 2);
    this.moodIcon.setDisplaySize(mood.width, mood.height).setPosition(mood.x + mood.width / 2, mood.y + mood.height / 2);
  }

  /** Writes what the resident is doing now; cheap when nothing changed. */
  update(info: ResidentInfo): void {
    const data = this.layoutData;
    if (!data) {
      return;
    }
    const { parts } = data;
    this.info = info;
    // The sentence of the dimmed button is for this resident on the boat only: on land "Umziehen" works.
    if (this.note && (this.note.residentId !== info.id || info.canMove)) {
      this.note = undefined;
    }
    const rows = cardRows(info, parts.compact, this.note?.text);
    const key = `${String(info.id)}|${String(info.hat)}|${info.name}|${info.mood}|${String(info.canMove)}|${rows.join('|')}`;
    for (const object of [this.panel, this.name, this.picture, this.moodIcon, this.closeButton, this.moveButton]) {
      object.setVisible(true);
    }
    if (key === this.shown) {
      return;
    }
    this.shown = key;
    this.name.setText(info.name);
    setLabelSize(this.name, parts.nameFont, parts.name.width);
    this.name.setPosition(parts.name.x + parts.name.width / 2, parts.name.y + parts.name.height / 2);

    const { picture } = parts;
    const scale = Math.min(picture.width / RESIDENT_SIZE.width, picture.height / RESIDENT_SIZE.height);
    this.picture
      .setTexture(residentTextureKey(info.hat))
      .setDisplaySize(RESIDENT_SIZE.width * scale, RESIDENT_SIZE.height * scale)
      .setPosition(picture.x + picture.width / 2, picture.y + picture.height / 2);
    this.moodIcon.setTexture(moodTextureKey(info.mood)).setDisplaySize(parts.mood.width, parts.mood.height);
    this.mood = info.mood;
    this.canMove = info.canMove;
    this.moveButton.setDimmed(!info.canMove);

    // One font size for all rows; a long row wraps to the width of the column.
    const { column } = parts;
    const shown = this.lines.slice(0, rows.length);
    this.lines.forEach((label, index) => {
      label.setVisible(index < rows.length);
    });
    shown.forEach((label, index) => {
      label.setText(rows[index] ?? '').setWordWrapWidth(column.width);
    });
    const measure = (row: number, font: number): number => {
      const label = shown[row];
      if (!label) {
        return 0;
      }
      setLabelSize(label, font);
      return label.height;
    };
    const { font, heights } = fitRows(shown.length, column.height, parts.maxFont, measure);
    this.rowFont = font;
    // The word of "Umziehen" as big as the rows (at least 14 px), as far as the button has room.
    this.moveButton.setCaptionFont(Math.max(MOVE_CAPTION_WISH, font));
    const total = heights.reduce((sum, h) => sum + h, 0) + CARD_ROW_GAP * (heights.length - 1);
    let y = column.y + Math.max(0, (column.height - total) / 2);
    shown.forEach((label, index) => {
      setLabelSize(label, font);
      label.setPosition(column.x, y);
      y += (heights[index] ?? label.height) + CARD_ROW_GAP;
    });
  }
}
