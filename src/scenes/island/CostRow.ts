import Phaser from 'phaser';
import type { CostMap } from '../../data/buildings';
import { ITEM_IDS, isItem } from '../../data/goods';
import { formatNumber } from '../../data/texts';
import { createLabel, setLabelSize } from '../../ui/label';
import { COLORS, cssColor } from '../../ui/style';
import { goodTextureKey } from './goodTextures';

interface CostEntry {
  readonly icon: Phaser.GameObjects.Image;
  readonly amount: Phaser.GameObjects.Text;
}

const MAX_ENTRIES = ITEM_IDS.length;

/**
 * A row of little pictures with numbers: what something costs, e.g. a coin
 * with 20 and a log with 5. What the player is short of is shown in a warm red
 * number. The container sits at the centre of the row.
 */
export class CostRow extends Phaser.GameObjects.Container {
  private readonly entries: CostEntry[] = [];
  private cost: CostMap = {};
  private missing: Readonly<Record<string, number>> = {};
  private rowWidth = 0;
  private rowHeight = 0;
  private key = '';

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    for (let i = 0; i < MAX_ENTRIES; i += 1) {
      const icon = scene.add.image(0, 0, goodTextureKey(ITEM_IDS[0] ?? 'coins')).setVisible(false);
      const amount = createLabel(scene, '0', 14).setVisible(false);
      this.add([icon, amount]);
      this.entries.push({ icon, amount });
    }
    scene.add.existing(this);
  }

  /** Sets what is shown; `missing` marks the amounts the player is short of. Cheap if nothing changed. */
  setCost(cost: CostMap, missing: Readonly<Record<string, number>> = {}): this {
    const key = JSON.stringify([cost, missing]);
    if (key !== this.key) {
      this.key = key;
      this.cost = cost;
      this.missing = missing;
      this.relayout();
    }
    return this;
  }

  /** Sets the size of the row in CSS px. */
  layoutTo(width: number, height: number): this {
    if (width !== this.rowWidth || height !== this.rowHeight) {
      this.rowWidth = width;
      this.rowHeight = height;
      this.relayout();
    }
    return this;
  }

  private relayout(): void {
    const ids = ITEM_IDS.filter((id) => isItem(id) && (this.cost[id] ?? 0) > 0);
    const slot = this.rowWidth / Math.max(1, ids.length);
    const iconSize = Math.max(10, Math.min(this.rowHeight * 0.95, slot * 0.5));
    const fontSize = Math.max(10, Math.min(this.rowHeight * 0.78, 17));
    this.entries.forEach((entry, index) => {
      const id = ids[index];
      entry.icon.setVisible(id !== undefined);
      entry.amount.setVisible(id !== undefined);
      if (id === undefined) {
        return;
      }
      const left = -this.rowWidth / 2 + slot * index;
      entry.icon
        .setTexture(goodTextureKey(id))
        .setDisplaySize(iconSize, iconSize)
        .setPosition(left + iconSize / 2 + 1, 0);
      const short = (this.missing[id] ?? 0) > 0;
      entry.amount.setText(formatNumber(this.cost[id] ?? 0)).setColor(short ? cssColor(COLORS.costMissing) : cssColor(COLORS.textFill));
      const field = Math.max(8, slot - iconSize - 3);
      setLabelSize(entry.amount, fontSize, field);
      entry.amount.setPosition(left + iconSize + 3 + field / 2, 0);
    });
  }
}
