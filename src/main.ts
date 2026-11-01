import Phaser from 'phaser';
import './style.css';
import { t } from './data/texts';
import { BootScene } from './scenes/BootScene';
import { IslandScene } from './scenes/IslandScene';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import { Autosave } from './save/autosave';
import { openSaveStore } from './save/indexedDbStore';
import { saveWhenLeaving, whenLeaving } from './save/lifecycle';
import { GameSession } from './save/session';
import { MemoryStore } from './save/saveStore';
import { acquireSaveLock } from './save/tabLock';
import { takeOverSaving } from './save/takeOver';
import { parseStartParams, prepareStart } from './save/startup';
import { Simulation } from './sim/simulation';
import { localDayKey } from './parent/dayClock';
import { ParentSession } from './parent/parentSession';
import { openSettingsStore } from './parent/settingsStore';
import { storeTutorial, tutorialFor, villageCounts } from './ui/tutorial';
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
  // `?nosave=1` (tests) neither loads nor saves; `?seed=N` alone only picks the island of a new village (see `src/save/startup.ts`).
  const params = parseStartParams(window.location.search);
  // The newest window saves (web app and browser tab, or an old forgotten tab): this one takes over – but only if the storage
  // really works – and reads the village, the last one the older window wrote; that window is told and stops (`tabLock.ts`).
  // `lost`: a newer window has taken over – also in a window that does not save the village (a newer save, an unreadable
  // one): its settings must stop being written as well (M8, Korrekturrunde 1).
  const holder: { autosave: Autosave | undefined; lost: boolean } = { autosave: undefined, lost: false };
  // The parents' settings (M8: PIN, daily limit, today's play time, the guided start) have a database of their own, apart
  // from the village – also with `nosave=1`: a test address must not get around the limit.
  const [opened, settingsStore] = await Promise.all([params.persist ? openSaveStore() : Promise.resolve(new MemoryStore()), openSettingsStore()]);
  const store = await takeOverSaving(opened, () =>
    acquireSaveLock(() => {
      holder.lost = true;
      holder.autosave?.markLost();
    }),
  );
  const begin = await prepareStart(params, store, randomSeed);

  const simulation = new Simulation(begin.state);
  const autosave = begin.autosave ? new Autosave(store, () => simulation.state) : undefined;
  holder.autosave = autosave;
  if (autosave) {
    saveWhenLeaving(autosave, () => {
      simulation.applyPending();
    });
  }
  const session = new GameSession(simulation, store, autosave, begin.kind, begin.notice);

  const parent = await ParentSession.open(settingsStore, localDayKey(new Date()));
  if (!params.persist) {
    // A test village that is never saved does not touch the guided start of the real one.
    parent.keepTutorialInMemory();
  }
  // The guided start: a new village begins it (unless it was finished or skipped before), a loaded one goes on with it.
  const counts = { ...villageCounts(simulation.state), earned: simulation.state.earnedCoins };
  const tutorial = storeTutorial(tutorialFor(begin.kind === 'new' ? 'new' : 'loaded', parent.tutorial, counts));
  if (JSON.stringify(tutorial) !== JSON.stringify(parent.tutorial)) {
    parent.setTutorial(tutorial);
  }
  // The newest window counts the time (M5): an older one writes nothing any more – also one without autosave, once the
  // lock tells it. (Without the lock – `nosave=1`, no IndexedDB, no Web Locks – it never learns: see ENTSCHEIDUNGEN.)
  parent.stopWhen(() => holder.lost || holder.autosave?.isLost === true);
  whenLeaving(() => {
    void parent.flush();
  });
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
    scene: [new BootScene(), new IslandScene(session, parent)],
  });

  game.events.once(Phaser.Core.Events.READY, () => {
    watchViewport(game, root);
  });
  registerServiceWorker();
}

void start(container);
