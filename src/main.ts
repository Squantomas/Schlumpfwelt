import Phaser from 'phaser';
import './style.css';
import { t } from './data/texts';
import { BootScene } from './scenes/BootScene';
import { IslandScene } from './scenes/IslandScene';
import { Simulation } from './sim/simulation';
import { createInitialState } from './sim/state';
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

/**
 * Seed of the island: `?seed=123` in the address picks a fixed island (for
 * tests and for sharing), otherwise every start gets a new one (until saving
 * arrives in M5).
 */
function pickSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed');
  const parsed = param === null || param.trim() === '' ? Number.NaN : Number(param);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Math.floor(Math.random() * 2 ** 32);
}

const simulation = new Simulation(createInitialState(pickSeed()));
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
  // Phaser replaces a frame time over 1000 / min ms by a 60 fps step (it takes that for a tab that was in the
  // background). With the default of 5 fps, a slow device (or headless Chromium, about 4 fps) would let the
  // simulation run at a fraction of real time; the clock itself caps every frame at 250 ms.
  fps: { min: 1 },
  scene: [new BootScene(), new IslandScene(simulation)],
});

game.events.once(Phaser.Core.Events.READY, () => {
  watchViewport(game, container);
});
