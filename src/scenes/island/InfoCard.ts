import type Phaser from 'phaser';
import { formatNumber, t } from '../../data/texts';
import type { Rect } from '../../ui/cameraMath';
import { flowSlots, type InfoCardLayout } from '../../ui/infoCardLayout';
import { createLabel, setLabelSize } from '../../ui/label';
import type { CardStatus, InfoItem, ProductionInfo } from '../../ui/productionInfo';
import { RoundButton } from '../../ui/RoundButton';
import { COLORS } from '../../ui/style';
import { goodTextureKey, nearbyTextureKey } from './goodTextures';

/** At most this many pictures per side ("needs" / "makes"); the market needs two, the most. */
const MAX_ITEMS = 4;

interface Slot {
  readonly icon: Phaser.GameObjects.Image;
  readonly amount: Phaser.GameObjects.Text;
}

/**
 * The big card that opens when a production building is tapped: its name, what
 * it needs and makes (pictures with an arrow), what it is doing in one short
 * sentence and a progress bar for the running round. Close with the big ✕ (the
 * tap beside the card is handled by the scene). It only draws what it is given.
 */
export class InfoCard {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly arrow: Phaser.GameObjects.Graphics;
  private readonly barGraphics: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly needsCaption: Phaser.GameObjects.Text;
  private readonly makesCaption: Phaser.GameObjects.Text;
  private readonly closeButton: RoundButton;
  private readonly needs: Slot[] = [];
  private readonly makes: Slot[] = [];
  private layoutData: InfoCardLayout | undefined;
  private lastStatus = '';
  private rectValue: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private open = false;
  private shownProgress = -1;

  constructor(
    scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Layer,
    onClose: (eventTime: number) => void,
  ) {
    this.panel = scene.add.graphics();
    this.arrow = scene.add.graphics();
    this.barGraphics = scene.add.graphics();
    this.name = createLabel(scene, '', 28);
    this.status = createLabel(scene, '', 20);
    this.needsCaption = createLabel(scene, t('info.needs'), 16);
    this.makesCaption = createLabel(scene, t('info.makes'), 16);
    this.closeButton = new RoundButton(scene, 0, 0, { radius: 32, icon: 'cross', variant: 'cancel', onTap: onClose });
    const slot = (): Slot => ({ icon: scene.add.image(0, 0, goodTextureKey('coins')), amount: createLabel(scene, '', 18) });
    for (let i = 0; i < MAX_ITEMS; i += 1) {
      this.needs.push(slot());
      this.makes.push(slot());
    }
    uiLayer.add([
      this.panel,
      this.arrow,
      this.barGraphics,
      this.name,
      this.status,
      this.needsCaption,
      this.makesCaption,
      ...this.needs.flatMap((s) => [s.icon, s.amount]),
      ...this.makes.flatMap((s) => [s.icon, s.amount]),
      this.closeButton,
    ]);
    this.hide();
  }

  /** The card's rectangle while it is open (an empty one otherwise). */
  get rect(): Rect {
    return this.open ? this.rectValue : { x: 0, y: 0, width: 0, height: 0 };
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The position of the ✕ (CSS px), for the smoke test. */
  get closeSpot(): { x: number; y: number } {
    return { x: this.closeButton.x, y: this.closeButton.y };
  }

  hide(): void {
    this.open = false;
    this.lastStatus = '';
    this.shownProgress = -1;
    for (const object of this.objects()) {
      object.setVisible(false);
    }
  }

  private objects(): (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible)[] {
    const slots = [...this.needs, ...this.makes].flatMap((s) => [s.icon, s.amount]);
    return [this.panel, this.arrow, this.barGraphics, this.name, this.status, this.needsCaption, this.makesCaption, this.closeButton, ...slots];
  }

  /** Shows the card at `layout` for a building with this name and these pictures. */
  show(layout: InfoCardLayout, name: string, info: ProductionInfo): void {
    this.open = true;
    this.layoutData = layout;
    this.rectValue = layout.rect;
    this.lastStatus = '';
    this.shownProgress = -1;
    const { rect } = layout;
    const g = this.panel.clear();
    g.fillStyle(COLORS.stoneDark, 0.35).fillRoundedRect(rect.x, rect.y + 6, rect.width, rect.height, 26);
    g.fillStyle(COLORS.cardRim).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 26);
    g.fillStyle(COLORS.cardFace).fillRoundedRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8, 22);
    this.panel.setVisible(true);

    this.closeButton.setVisible(true).setPosition(layout.close.x + layout.close.width / 2, layout.close.y + layout.close.height / 2);
    this.name.setVisible(true).setText(name);
    setLabelSize(this.name, layout.compact ? 24 : 30, layout.name.width);
    this.name.setPosition(layout.name.x + layout.name.width / 2, layout.name.y + layout.name.height / 2);

    const slots = flowSlots(layout.flow, info.needs.length, info.makes.length);
    const iconSize = Math.min(slots.slot * 0.86, layout.flow.height);
    this.placeItems(this.needs, info.needs, slots.needs, iconSize);
    this.placeItems(this.makes, info.makes, slots.makes, iconSize);
    this.drawArrow(slots.arrow, iconSize);

    const captions = layout.captions;
    this.needsCaption.setVisible(captions !== undefined && info.needs.length > 0);
    this.makesCaption.setVisible(captions !== undefined);
    if (captions) {
      setLabelSize(this.needsCaption, 18, captions.needs.width);
      setLabelSize(this.makesCaption, 18, captions.makes.width);
      // Each caption stands over the middle of its pictures.
      const middle = (spots: readonly { readonly x: number }[], fallback: number): number =>
        spots.length === 0 ? fallback : spots.reduce((sum, spot) => sum + spot.x, 0) / spots.length;
      this.needsCaption.setPosition(middle(slots.needs, captions.needs.x + captions.needs.width / 2), captions.needs.y + captions.needs.height / 2);
      this.makesCaption.setPosition(middle(slots.makes, captions.makes.x + captions.makes.width / 2), captions.makes.y + captions.makes.height / 2);
    }
    this.status.setVisible(true);
    this.barGraphics.setVisible(true);
  }

  private placeItems(
    slots: readonly Slot[],
    items: readonly InfoItem[],
    spots: readonly { readonly x: number; readonly y: number }[],
    iconSize: number,
  ): void {
    slots.forEach((slot, index) => {
      const item = items[index];
      const spot = spots[index];
      const visible = item !== undefined && spot !== undefined;
      slot.icon.setVisible(visible);
      slot.amount.setVisible(visible && (item.amount ?? 1) > 1);
      if (!visible) {
        return;
      }
      slot.icon.setTexture(item.kind === 'item' ? goodTextureKey(item.id) : nearbyTextureKey(item.id)).setDisplaySize(iconSize, iconSize).setPosition(spot.x, spot.y);
      if ((item.amount ?? 1) > 1) {
        slot.amount.setText(formatNumber(item.amount ?? 1));
        setLabelSize(slot.amount, Math.max(14, iconSize * 0.42), iconSize * 0.7);
        slot.amount.setPosition(spot.x + iconSize * 0.34, spot.y + iconSize * 0.34);
      }
    });
  }

  private drawArrow(arrow: { readonly x: number; readonly y: number } | undefined, size: number): void {
    const g = this.arrow.clear();
    this.arrow.setVisible(arrow !== undefined);
    if (!arrow) {
      return;
    }
    const half = Math.min(15, size * 0.32);
    g.fillStyle(COLORS.stockNumber);
    g.fillRoundedRect(arrow.x - half, arrow.y - 3.5, half * 1.3, 7, 3.5);
    g.fillTriangle(arrow.x + half * 0.3 - 2, arrow.y - half * 0.75, arrow.x + half * 0.3 - 2, arrow.y + half * 0.75, arrow.x + half, arrow.y);
  }

  /** Shows the sentence and the progress bar. Cheap if nothing changed since the last call. */
  setStatus(status: CardStatus | undefined): void {
    const layout = this.layoutData;
    if (!this.open || !layout || !status) {
      return;
    }
    const text = t(status.text, status.params);
    if (text !== this.lastStatus) {
      this.lastStatus = text;
      this.status.setText(text).setWordWrapWidth(layout.status.width);
      setLabelSize(this.status, layout.compact ? 17 : 22, layout.status.width);
      // Long sentences shrink until they fit the field.
      let size = layout.compact ? 17 : 22;
      while (this.status.height > layout.status.height && size > 11) {
        size -= 1;
        setLabelSize(this.status, size, layout.status.width);
      }
      this.status.setPosition(layout.status.x + layout.status.width / 2, layout.status.y + layout.status.height / 2);
    }
    // The bar moves in steps of 2%.
    const progress = Math.round(status.progress * 50) / 50;
    if (progress !== this.shownProgress) {
      this.shownProgress = progress;
      const bar = layout.bar;
      const g = this.barGraphics.clear();
      g.fillStyle(COLORS.progressTrack).fillRoundedRect(bar.x, bar.y, bar.width, bar.height, bar.height / 2);
      if (progress > 0) {
        g.fillStyle(COLORS.progressFill).fillRoundedRect(bar.x, bar.y, Math.max(bar.height, bar.width * progress), bar.height, bar.height / 2);
      }
    }
  }
}
