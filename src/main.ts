import Phaser from 'phaser';
import './style.css';
import { t } from './data/texts';
import { BootScene } from './scenes/BootScene';
import { IslandScene } from './scenes/IslandScene';
import { Simulation } from './sim/simulation';
import { COLORS } from './ui/style';
import { measureViewport, watchViewport } from './ui/viewport';

document.title = t('app.title');

// iOS Safari ignores `user-scalable=no`; block its page pinch-zoom gesture.
// Touch events still reach Phaser, so in-game gestures keep working.
document.addEventListener(
  'gesturestart',
  (event: Event) => {
    event.preventDefault();
  },
  { passive: false },
);

const container = document.getElementById('game');
if (!container) {
  throw new Error('Missing <div id="game"> in index.html');
}

const simulation = new Simulation();
const view = measureViewport(container);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: container,
  backgroundColor: COLORS.water,
  banner: false,
  disableContextMenu: true,
  // No sound until M9; then the start screen tap unlocks Web Audio.
  audio: { noAudio: true },
  scale: {
    mode: Phaser.Scale.NONE,
    width: view.width,
    height: view.height,
    zoom: 1 / view.renderScale,
    autoRound: true,
    expandParent: false,
  },
  render: {
    antialias: true,
  },
  scene: [new BootScene(), new IslandScene(simulation)],
});

game.events.once(Phaser.Core.Events.READY, () => {
  watchViewport(game, container);
});
