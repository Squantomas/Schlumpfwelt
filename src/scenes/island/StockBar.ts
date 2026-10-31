import type Phaser from 'phaser';
import { ITEM_IDS } from '../../data/goods';
import { formatNumber } from '../../data/texts';
import type { Rect } from '../../ui/cameraMath';
import { createLabel, setLabelSize } from '../../ui/label';
import { COLORS } from '../../ui/style';
import type { StockLayout } from '../../ui/stockLayout';
import { goodTextureKey } from './goodTextures';
import { addGraphics } from '../../ui/FastGraphics';

interface Chip {
  readonly id: string;
  readonly icon: Phaser.GameObjects.Image;
  readonly number: Phaser.GameObjects.Text;
  shown: number;
  /** Scale of the picture at rest (it pops from there). */
  iconScale: number;
  tweens: Phaser.Tweens.Tween[];
}

/** The pop when a number changes: grows a little and settles back (ms). */
const POP_MS = 260;
const POP_SCALE = 1.35;

/**
 * The store bar at the top left: a picture and a big number for coins and
 * each good. A number that changes pops briefly. It only shows the numbers it
 * is given ({@link StockBar.update}) and does nothing while they stay the same.
 */
export class StockBar {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly chips: Chip[] = [];
  private layoutData: StockLayout | undefined;
  private rectValue: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private textJson = '{}';

  constructor(
    private readonly scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Layer,
  ) {
    this.panel = addGraphics(scene);
    uiLayer.add(this.panel);
    for (const id of ITEM_IDS) {
      const icon = scene.add.image(0, 0, goodTextureKey(id));
      const number = createLabel(scene, '0', 20);
      uiLayer.add([icon, number]);
      this.chips.push({ id, icon, number, shown: 0, iconScale: 1, tweens: [] });
    }
  }

  /** The panel's rectangle (CSS px). */
  get rect(): Rect {
    return this.rectValue;
  }

  /** The numbers as shown, as JSON (for the smoke test). */
  get shownText(): string {
    return this.textJson;
  }

  /** Puts the chips where the layout says. */
  layout(layout: StockLayout): void {
    this.layoutData = layout;
    this.rectValue = layout.rect;
    const { rect } = layout;
    const g = this.panel.clear();
    g.fillStyle(COLORS.panel, 0.6).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 16);
    g.lineStyle(3, COLORS.toolActiveRim, 0.6).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 16);
    this.chips.forEach((chip, index) => {
      const spot = layout.chips[index];
      if (!spot) {
        return;
      }
      g.fillStyle(COLORS.stockChipShade).fillRoundedRect(spot.x, spot.y + 2, layout.chipW, layout.chipH, layout.chipH * 0.3);
      g.fillStyle(COLORS.stockChip).fillRoundedRect(spot.x, spot.y, layout.chipW, layout.chipH, layout.chipH * 0.3);
      chip.icon
        .setDisplaySize(layout.iconSize, layout.iconSize)
        .setPosition(spot.x + layout.chipPad + layout.iconSize / 2, spot.y + layout.chipH / 2);
      chip.iconScale = chip.icon.scaleX;
      this.place(chip);
    });
  }

  /** Writes the number of one chip (shrinks it if it is too wide) and puts it in its field. */
  private place(chip: Chip): void {
    const layout = this.layoutData;
    const index = this.chips.indexOf(chip);
    const spot = layout?.chips[index];
    if (!layout || !spot) {
      return;
    }
    const left = spot.x + layout.chipPad + layout.iconSize + 4;
    const field = spot.x + layout.chipW - layout.chipPad - left;
    chip.number.setText(formatNumber(chip.shown));
    setLabelSize(chip.number, layout.fontSize, field);
    chip.number.setPosition(left + field / 2, spot.y + layout.chipH / 2 + 1);
  }

  /** Shows the numbers of the store; changed ones pop. Returns whether any number changed. */
  update(inventory: Readonly<Record<string, number>>, animate = true): boolean {
    let changed = false;
    for (const chip of this.chips) {
      const value = inventory[chip.id] ?? 0;
      if (value === chip.shown) {
        continue;
      }
      changed = true;
      chip.shown = value;
      this.place(chip);
      if (animate) {
        this.pop(chip);
      }
    }
    if (changed) {
      this.textJson = JSON.stringify(Object.fromEntries(this.chips.map((chip) => [chip.id, chip.shown])));
    }
    return changed;
  }

  private pop(chip: Chip): void {
    for (const tween of chip.tweens) {
      tween.stop();
    }
    chip.number.setScale(POP_SCALE);
    chip.icon.setScale(chip.iconScale * POP_SCALE);
    chip.tweens = [
      this.scene.tweens.add({ targets: chip.number, scale: 1, duration: POP_MS, ease: 'Back.easeOut' }),
      this.scene.tweens.add({ targets: chip.icon, scale: chip.iconScale, duration: POP_MS, ease: 'Back.easeOut' }),
    ];
  }
}
