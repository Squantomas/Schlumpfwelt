import Phaser from 'phaser';
import { t } from '../../data/texts';
import { createLabel, setLabelSize } from '../../ui/label';
import { lostLayout, type LostLayout } from '../../ui/lostLayout';
import { RoundButton } from '../../ui/RoundButton';
import { COLORS } from '../../ui/style';
import type { ViewSize } from '../../ui/viewport';
import type { MenuSpot } from './VillageMenu';

/** Smallest size of the sentence (CSS px): longer sentences shrink down to it. */
const MIN_TEXT_FONT = 13;

/**
 * The layer over the whole game after another window has taken over the saving: this window would not save any more,
 * so everything a child built here would be lost. The veil blocks every tap (and so every building), the panel says it in
 * one sentence, and one big "play" button reloads the page – the window then takes over again and reads the newest
 * village. No automatic reload when the window gets the focus: two open windows would take turns forever. Lives in the UI
 * layer, CSS pixels; the layout is {@link lostLayout}.
 */
export class LostOverlay {
  private readonly veil: Phaser.GameObjects.Zone;
  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly sentence: Phaser.GameObjects.Text;
  private readonly caption: Phaser.GameObjects.Text;
  private readonly play: RoundButton;
  private size: ViewSize = { width: 1, height: 1 };
  private layoutData: LostLayout | undefined;
  private open = false;

  constructor(scene: Phaser.Scene, uiLayer: Phaser.GameObjects.Layer, onPlay: () => void) {
    this.veil = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive();
    this.dim = scene.add.graphics();
    this.panel = scene.add.graphics();
    this.sentence = createLabel(scene, t('save.lostWindow'), 19);
    this.caption = createLabel(scene, t('lost.play'), 22);
    this.play = new RoundButton(scene, 0, 0, { radius: 48, icon: 'play', onTap: () => onPlay() });
    uiLayer.add([this.veil, this.dim, this.panel, this.sentence, this.caption, this.play]);
    this.refresh();
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Shows or hides the layer (cheap when nothing changes). */
  setOpen(open: boolean): void {
    if (open !== this.open) {
      this.open = open;
      this.refresh();
    }
  }

  layout(size: ViewSize): void {
    this.size = size;
    this.refresh();
  }

  /** For the page marker: where the button is (CSS px), empty while the layer is closed. */
  get spots(): Record<string, MenuSpot> {
    const layout = this.layoutData;
    if (!layout) {
      return {};
    }
    const { button, panel } = layout;
    return {
      'lost-play': { x: button.x + button.width / 2, y: button.y + button.height / 2, w: button.width, h: button.height },
      'lost-panel': { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2, w: panel.width, h: panel.height },
    };
  }

  private refresh(): void {
    this.layoutData = this.open ? lostLayout(this.size.width, this.size.height) : undefined;
    for (const object of [this.veil, this.dim, this.panel, this.sentence, this.caption, this.play]) {
      object.setVisible(this.open);
    }
    const layout = this.layoutData;
    if (!layout) {
      return;
    }
    const { width, height } = this.size;
    this.veil.setSize(width, height);
    if (this.veil.input) {
      this.veil.input.hitArea = new Phaser.Geom.Rectangle(0, 0, width, height);
    }
    this.dim.clear().fillStyle(COLORS.black, 0.6).fillRect(0, 0, width, height);
    const { panel, text, button, caption } = layout;
    this.panel.clear();
    this.panel.fillStyle(COLORS.panel, 0.97).fillRoundedRect(panel.x, panel.y, panel.width, panel.height, 22);
    this.panel.lineStyle(3, COLORS.toolActiveRim, 0.75).strokeRoundedRect(panel.x, panel.y, panel.width, panel.height, 22);

    let font = layout.textFont;
    this.sentence.setWordWrapWidth(text.width).setText(t('save.lostWindow'));
    setLabelSize(this.sentence, font, text.width);
    while (this.sentence.height > text.height && font > MIN_TEXT_FONT) {
      font -= 1;
      setLabelSize(this.sentence, font, text.width);
    }
    this.sentence.setPosition(text.x + text.width / 2, text.y + text.height / 2);
    this.play.setRadius(button.width / 2).setPosition(button.x + button.width / 2, button.y + button.height / 2);
    setLabelSize(this.caption, layout.captionFont, caption.width);
    this.caption.setPosition(caption.x + caption.width / 2, caption.y + caption.height / 2);
  }
}
