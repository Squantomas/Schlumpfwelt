import Phaser from 'phaser';
import { t } from '../data/texts';
import { createLabel, setLabelSize } from '../ui/label';
import { RoundButton } from '../ui/RoundButton';
import { BOOT_DOTS, bootLayout, litDots } from '../ui/bootLayout';
import { COLORS, rgb } from '../ui/style';
import { onViewportChange, type ViewSize } from '../ui/viewport';
import { TITLE_KEY } from '../art/catalog';
import { TITLE_SIZE } from '../art/title';
import type { AudioEngine } from '../audio/engine';
import { artProgress, loadArt } from './art/artLoader';
import { SCENES } from './keys';
import { markActiveScene, markAudio } from './sceneMarker';

const FADE_MS = 250;
/** One slow breath of the dot that is being filled (ms). */
const PULSE_MS = 900;

/**
 * Start screen "Tippen zum Spielen". The first touch is needed anyway before
 * tablets allow sound (M9), so the game starts with a big tap.
 * Tapping anywhere starts – the button only shows where.
 *
 * M9: at once the name of the game, a calm sentence and a row of dots that
 * fill while the pictures are painted (`loadArt`, in slices – Korrekturrunde 1);
 * then the title picture and the button appear and the scene counts as started
 * (`data-scene="boot"`). Should painting fail, the start screen appears anyway.
 */
export class BootScene extends Phaser.Scene {
  private started = false;
  private ready = false;
  private title!: Phaser.GameObjects.Text;
  private loadingHint: Phaser.GameObjects.Text | undefined;
  private dots: Phaser.GameObjects.Arc[] = [];
  private pulse = 0;
  private size: ViewSize = { width: 1, height: 1 };
  private showReady: ((size: ViewSize) => void) | undefined;

  constructor(private readonly audio: AudioEngine) {
    super(SCENES.boot);
  }

  create(): void {
    this.started = false;
    this.ready = false;
    this.pulse = 0;
    this.showReady = undefined;
    this.cameras.main.setBackgroundColor(COLORS.water);
    this.title = createLabel(this, t('boot.title'), 64).setDepth(1);
    this.loadingHint = createLabel(this, t('boot.loading'), 24);
    this.dots = Array.from({ length: BOOT_DOTS }, () => this.add.circle(0, 0, 6, COLORS.textFill).setStrokeStyle(2, COLORS.textOutline));
    onViewportChange(this, (size: ViewSize) => {
      this.size = size;
      this.layout();
    });
    void loadArt(this)
      .catch((error: unknown) => {
        console.warn(error);
      })
      .then(() => {
        if (this.scene.isActive()) {
          this.showTitle();
        }
      });
  }

  override update(_time: number, delta: number): void {
    if (this.ready) {
      return;
    }
    const { done, total } = artProgress();
    const lit = litDots(done, total);
    this.pulse = (this.pulse + delta) % PULSE_MS;
    const breath = 0.5 - 0.5 * Math.cos((this.pulse / PULSE_MS) * Math.PI * 2);
    for (const [index, dot] of this.dots.entries()) {
      // Filled dots stay bright; the next one breathes slowly; the rest wait, faint.
      dot.setAlpha(index < lit ? 1 : index === lit ? 0.35 + 0.5 * breath : 0.3);
    }
  }

  private layout(): void {
    const { loading, ready } = bootLayout(this.size);
    if (this.showReady) {
      this.showReady(this.size);
      setLabelSize(this.title, ready.title.size, ready.title.width);
      this.title.setPosition(ready.title.x, ready.title.y);
      return;
    }
    setLabelSize(this.title, loading.title.size, loading.title.width);
    this.title.setPosition(loading.title.x, loading.title.y);
    if (this.loadingHint) {
      setLabelSize(this.loadingHint, loading.hint.size, loading.hint.width);
      this.loadingHint.setPosition(loading.hint.x, loading.hint.y);
    }
    const { dots } = loading;
    for (const [index, dot] of this.dots.entries()) {
      dot.setRadius(dots.radius).setPosition(dots.x + (index - (BOOT_DOTS - 1) / 2) * dots.gap, dots.y);
    }
  }

  private showTitle(): void {
    this.ready = true;
    this.loadingHint?.destroy();
    this.loadingHint = undefined;
    for (const dot of this.dots) {
      dot.destroy();
    }
    this.dots = [];
    markActiveScene(SCENES.boot);
    markAudio(this.audio.describe());

    // Without the title picture (it could not be painted) the screen still has its name and button.
    const picture = this.textures.exists(TITLE_KEY) ? this.add.image(0, 0, TITLE_KEY) : undefined;
    const tapZone = this.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    tapZone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.startGame());

    const button = new RoundButton(this, 0, 0, { radius: 80, icon: 'play', onTap: () => this.startGame() });
    const hint = createLabel(this, t('boot.tapToPlay'), 32);

    this.tweens.add({
      targets: button,
      scale: 1.07,
      duration: 700,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());
    this.input.keyboard?.on('keydown-SPACE', () => this.startGame());

    this.showReady = ({ width, height }: ViewSize) => {
      const { ready } = bootLayout({ width, height });
      tapZone.setSize(width, height);
      if (picture) {
        const fit = Math.min(ready.picture.w / TITLE_SIZE.width, ready.picture.h / TITLE_SIZE.height);
        picture.setScale(fit / 2).setPosition(ready.picture.x + ready.picture.w / 2, ready.picture.y + ready.picture.h / 2);
      }
      button.setRadius(ready.button.radius).setPosition(ready.button.x, ready.button.y);
      setLabelSize(hint, ready.hint.size, ready.hint.width);
      hint.setPosition(ready.hint.x, button.y + button.buttonRadius * 1.12 + hint.height * 0.6);
    };
    this.layout();
  }

  private startGame(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    // Browsers (tablets above all) allow sound only after a touch: this tap unlocks it (M9).
    this.audio.unlock();
    this.audio.play('tap', this.time.now);
    markAudio(this.audio.describe());
    this.cameras.main.fadeOut(FADE_MS, ...rgb(COLORS.water));
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.island);
    });
  }
}
