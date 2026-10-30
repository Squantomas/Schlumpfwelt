import Phaser from 'phaser';
import { t } from '../data/texts';
import { createLabel, setLabelSize } from '../ui/label';
import { RoundButton } from '../ui/RoundButton';
import { COLORS, clamp, rgb } from '../ui/style';
import { onViewportChange, type ViewSize } from '../ui/viewport';
import { SCENES } from './keys';
import { markActiveScene } from './sceneMarker';

const FADE_MS = 250;

/**
 * Start screen "Tippen zum Spielen". The first touch is needed anyway before
 * tablets allow sound (from M9 on), so the game starts with a big tap.
 * Tapping anywhere starts – the button only shows where.
 */
export class BootScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    this.started = false;
    markActiveScene(SCENES.boot);

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

      setLabelSize(title, clamp(m * 0.13, 40, 128), width * 0.9);
      title.setPosition(width / 2, height * 0.24);

      button.setRadius(clamp(m * 0.15, 56, 120)).setPosition(width / 2, height * 0.54);

      setLabelSize(hint, clamp(m * 0.06, 26, 56), width * 0.9);
      hint.setPosition(width / 2, button.y + button.buttonRadius * 1.15 + hint.height * 0.6);
    });
  }

  private startGame(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    // M9: unlock audio here – browsers only allow sound after a user gesture.
    this.cameras.main.fadeOut(FADE_MS, ...rgb(COLORS.water));
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.island);
    });
  }
}
