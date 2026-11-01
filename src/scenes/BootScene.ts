import Phaser from 'phaser';
import { t } from '../data/texts';
import { createLabel, setLabelSize } from '../ui/label';
import { RoundButton } from '../ui/RoundButton';
import { COLORS, clamp, rgb } from '../ui/style';
import { onViewportChange, type ViewSize } from '../ui/viewport';
import { TITLE_KEY } from '../art/catalog';
import { TITLE_SIZE } from '../art/title';
import type { AudioEngine } from '../audio/engine';
import { loadArt } from './art/artLoader';
import { SCENES } from './keys';
import { markActiveScene, markAudio } from './sceneMarker';

const FADE_MS = 250;

/**
 * Start screen "Tippen zum Spielen". The first touch is needed anyway before
 * tablets allow sound (M9), so the game starts with a big tap.
 * Tapping anywhere starts – the button only shows where.
 *
 * M9: first all pictures are made (`loadArt`, well under a second); only then
 * the title picture, the name of the game and the button appear and the scene
 * counts as started (`data-scene="boot"`).
 */
export class BootScene extends Phaser.Scene {
  private started = false;

  constructor(private readonly audio: AudioEngine) {
    super(SCENES.boot);
  }

  create(): void {
    this.started = false;
    this.cameras.main.setBackgroundColor(COLORS.water);
    void loadArt(this).then(() => {
      if (this.scene.isActive()) {
        this.showTitle();
      }
    });
  }

  private showTitle(): void {
    markActiveScene(SCENES.boot);
    markAudio(this.audio.describe());

    const picture = this.add.image(0, 0, TITLE_KEY);
    const tapZone = this.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    tapZone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.startGame());

    const title = createLabel(this, t('boot.title'), 64);
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

    onViewportChange(this, ({ width, height }: ViewSize) => {
      const m = Math.min(width, height);
      tapZone.setSize(width, height);
      const wide = width > height * 1.25;
      // Upright: name on top, the island in the middle, the button below. Wide: the island on the left, name and button on the right.
      const pictureBox = wide ? { x: 0, y: height * 0.08, w: width * 0.58, h: height * 0.88 } : { x: 0, y: height * 0.2, w: width, h: height * 0.46 };
      const fit = Math.min(pictureBox.w / TITLE_SIZE.width, pictureBox.h / TITLE_SIZE.height);
      picture.setScale(fit / 2).setPosition(pictureBox.x + pictureBox.w / 2, pictureBox.y + pictureBox.h / 2);
      const column = wide ? { x: width * 0.79, w: width * 0.4 } : { x: width / 2, w: width * 0.9 };

      setLabelSize(title, clamp(m * (wide ? 0.11 : 0.12), 34, 120), column.w);
      title.setPosition(column.x, wide ? height * 0.24 : height * 0.11);

      button.setRadius(clamp(m * (wide ? 0.14 : 0.13), 52, 110)).setPosition(column.x, wide ? height * 0.56 : height * 0.77);

      setLabelSize(hint, clamp(m * 0.055, 22, 52), column.w);
      hint.setPosition(column.x, button.y + button.buttonRadius * 1.12 + hint.height * 0.6);
    });
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
