import Phaser from 'phaser';
import { t } from '../../data/texts';
import type { DayPhase } from '../../parent/dayClock';
import { addGraphics } from '../../ui/FastGraphics';
import { createLabel, setLabelSize } from '../../ui/label';
import { nightLayout, nightLook, type NightLayout, type NightLook } from '../../ui/nightLayout';
import type { Rect } from '../../ui/cameraMath';
import { RoundButton } from '../../ui/RoundButton';
import { COLORS } from '../../ui/style';
import { uiKey } from '../../art/catalog';
import type { ViewSize } from '../../ui/viewport';
import type { MenuSpot } from './VillageMenu';

/**
 * Evening and night over the whole game (M8). In the evening a warm glow and a deep blue come slowly over the island
 * (two coloured rectangles, only their alpha changes – cheap in every frame) while everybody walks home; in the night
 * the blue is deep, with the moon, a few stars and "Gute Nacht! Morgen geht es weiter.". Evening and night swallow
 * every tap (a veil over everything); the only way out is the parents' button (the PIN). In the morning it all fades
 * away. Lives in the UI layer, above the controls and the menu, below the parents' menu and the "other window" layer.
 * Moon, stars and sentence are drawn once per screen size.
 */
export class NightLayer {
  private readonly veil: Phaser.GameObjects.Zone;
  private readonly warm: Phaser.GameObjects.Graphics;
  private readonly dark: Phaser.GameObjects.Graphics;
  /** Moon and stars (M9: pictures), made again only when the size of the screen changes. */
  private readonly sky: Phaser.GameObjects.Container;
  private readonly sentence: Phaser.GameObjects.Text;
  private readonly caption: Phaser.GameObjects.Text;
  private readonly button: RoundButton;
  private layoutData: NightLayout | undefined;
  private look: NightLook = { warm: 0, dark: 0, sky: 0, blocks: false };
  /** How long the night has gone on (ms of frames), for the sky fading in. */
  private nightMs = 0;

  constructor(scene: Phaser.Scene, uiLayer: Phaser.GameObjects.Layer, onParent: (eventTime: number) => void) {
    this.veil = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive();
    this.warm = addGraphics(scene);
    this.dark = addGraphics(scene);
    this.sky = scene.add.container(0, 0);
    this.sentence = createLabel(scene, t('night.text'), 32);
    this.caption = createLabel(scene, t('night.parent'), 18);
    this.button = new RoundButton(scene, 0, 0, { radius: 36, icon: 'lock', onTap: onParent });
    uiLayer.add([this.veil, this.warm, this.dark, this.sky, this.sentence, this.caption, this.button]);
    this.apply();
  }

  /** Does the layer swallow taps now (evening and night)? */
  get blocks(): boolean {
    return this.look.blocks;
  }

  /** Is the parents' button there (the night)? */
  get skyShown(): boolean {
    return this.look.sky > 0;
  }

  /** `toolbar`: where the toolbar is (the button keeps clear of it on a narrow upright screen). */
  layout(size: ViewSize, toolbar?: Rect): void {
    const { width, height } = size;
    const layout = nightLayout(width, height, toolbar);
    this.layoutData = layout;
    this.veil.setSize(width, height);
    if (this.veil.input) {
      this.veil.input.hitArea = new Phaser.Geom.Rectangle(0, 0, width, height);
    }
    this.warm.clear().fillStyle(COLORS.duskWarm, 1).fillRect(0, 0, width, height);
    this.dark.clear().fillStyle(COLORS.nightSky, 1).fillRect(0, 0, width, height);
    this.sky.removeAll(true);
    const scene = this.sky.scene;
    for (const star of layout.stars) {
      // The star fills 0.7 of the half picture, its glow all of it.
      this.sky.add(scene.add.image(star.x, star.y, uiKey('night-star')).setDisplaySize(star.radius * 4, star.radius * 4));
    }
    const { moon } = layout;
    // The disc of the moon has 0.66 of the half picture; around it its soft glow.
    const side = (moon.radius / 0.66) * 2;
    this.sky.add(scene.add.image(moon.x, moon.y, uiKey('moon')).setDisplaySize(side, side));
    const { text } = layout;
    this.sentence.setWordWrapWidth(text.width);
    let font = layout.textFont;
    setLabelSize(this.sentence, font, text.width);
    while (this.sentence.height > text.height && font > 14) {
      font -= 1;
      setLabelSize(this.sentence, font, text.width);
    }
    this.sentence.setPosition(text.x + text.width / 2, text.y + text.height / 2);
    const { button, caption } = layout;
    this.button.setRadius(button.width / 2).setPosition(button.x + button.width / 2, button.y + button.height / 2);
    setLabelSize(this.caption, 18, caption.width);
    this.caption.setPosition(caption.x + caption.width / 2, caption.y + caption.height / 2);
  }

  /** Once per frame: the phase of the day, how long it has gone on, and the frame time (ms). */
  update(phase: DayPhase, phaseMs: number, frameMs: number, duskMs: number, dawnMs: number): void {
    this.nightMs = phase === 'night' ? this.nightMs + Math.min(frameMs, 250) : 0;
    const look = nightLook(phase, phaseMs, this.nightMs, duskMs, dawnMs);
    const before = this.look;
    if (look.warm !== before.warm || look.dark !== before.dark || look.sky !== before.sky || look.blocks !== before.blocks) {
      this.look = look;
      this.apply();
    }
  }

  /** A reload in the night: the night is there at once, without fading in. */
  showNightNow(): void {
    this.nightMs = Number.POSITIVE_INFINITY;
  }

  /** For the page marker: where the parents' button is (CSS px), only in the night. */
  get spots(): Record<string, MenuSpot> {
    const layout = this.layoutData;
    if (!layout || !this.skyShown) {
      return {};
    }
    const { button } = layout;
    return { 'night-parent': { x: button.x + button.width / 2, y: button.y + button.height / 2, w: button.width, h: button.height } };
  }

  /** What the layer shows, for the page marker (`dark` and `sky` rounded). */
  get shown(): { readonly dark: number; readonly warm: number; readonly sky: number; readonly blocks: boolean } {
    const round = (value: number): number => Math.round(value * 100) / 100;
    return { dark: round(this.look.dark), warm: round(this.look.warm), sky: round(this.look.sky), blocks: this.look.blocks };
  }

  private apply(): void {
    const { warm, dark, sky, blocks } = this.look;
    this.veil.setVisible(blocks);
    this.warm.setVisible(warm > 0).setAlpha(warm);
    this.dark.setVisible(dark > 0).setAlpha(dark);
    for (const object of [this.sky, this.sentence, this.caption]) {
      object.setVisible(sky > 0).setAlpha(sky);
    }
    // The button only takes taps once the night is really there.
    this.button.setVisible(sky > 0 && blocks).setAlpha(sky);
  }
}
