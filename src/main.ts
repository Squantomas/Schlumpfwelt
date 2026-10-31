import Phaser from 'phaser';
import './style.css';
import { t } from './data/texts';
import { BootScene } from './scenes/BootScene';
import { IslandScene } from './scenes/IslandScene';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import { Autosave } from './save/autosave';
import { openSaveStore } from './save/indexedDbStore';
import { saveWhenLeaving } from './save/lifecycle';
import { GameSession } from './save/session';
import { MemoryStore } from './save/saveStore';
import { acquireSaveLock } from './save/tabLock';
import { parseStartParams, prepareStart } from './save/startup';
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

/** A new island for a new village: `Math.random` is fine here, only `src/sim/` has to be deterministic. */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

async function start(root: HTMLElement): Promise<void> {
  // `?seed=N` (tests) neither loads nor saves unless `&save=1` is added (see `src/save/startup.ts`).
  const params = parseStartParams(window.location.search);
  // One window saves: a second one (web app and browser tab) plays on without saving, so it can not overwrite the first.
  const lock = params.persist ? await acquireSaveLock() : 'granted';
  const store = params.persist ? await openSaveStore(lock === 'unsupported') : new MemoryStore();
  const begin = await prepareStart(params, store, randomSeed, lock !== 'taken');

  const simulation = new Simulation(begin.state);
  const autosave = begin.autosave ? new Autosave(store, () => simulation.state) : undefined;
  if (autosave) {
    saveWhenLeaving(autosave);
  }
  const session = new GameSession(simulation, store, autosave, begin.kind, begin.notice);
  const view = measureViewport(root);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: root,
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
    scene: [new BootScene(), new IslandScene(session)],
  });

  game.events.once(Phaser.Core.Events.READY, () => {
    watchViewport(game, root);
  });
  registerServiceWorker();
}

void start(container);
