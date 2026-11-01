import Phaser from 'phaser';
import { CAMERA_CONFIG } from '../data/camera';
import { buildingType } from '../data/buildings';
import { buildingAt, isConnected, type Tile } from '../sim/buildings';
import { activityOf, allAsleep } from '../sim/residents';
import { t, type TextKey } from '../data/texts';
import { DAY_CLOCK_OPTIONS, localDayKey, type DayEvent } from '../parent/dayClock';
import type { ParentSession } from '../parent/parentSession';
import { moodOf, workPaces } from '../sim/mood';
import { hash2 } from '../sim/random';
import type { GameSession } from '../save/session';
import type { AudioEngine } from '../audio/engine';
import type { SoundKind } from '../audio/recipes';
import type { SoundSettings } from '../parent/settings';
import type { Simulation } from '../sim/simulation';
import { isLand, landBounds, terrainAt, type Terrain } from '../sim/world';
import { BuildTool, TOOLS, type Preview } from '../ui/buildTool';
import { toolbarPanel, zoomLayout } from '../ui/buildLayout';
import { growRect, tileAtWorld, visibleRect, type CameraBounds, type Point, type Rect } from '../ui/cameraMath';
import { landRegions } from '../ui/cameraRegions';
import { FrameStats } from '../ui/frameStats';
import { simulationDelta } from '../ui/frameTime';
import { bandGlide, glideAllowed, landingGlide, rectGlide } from '../ui/boatCamera';
import { RESIDENT_BODY_Y, residentAt } from '../ui/residentHit';
import {
  TUTORIAL_DONE,
  advanceTutorial,
  currentStep,
  pathTargets,
  pickTutorialResident,
  readTutorial,
  skipTutorial,
  startTutorial,
  storeTutorial,
  inFreeBand,
  placeCandidates,
  pickPlace,
  tutorialGlideDue,
  tutorialHint,
  villageCounts,
  type TutorialHint,
  type TutorialRecord,
  type TutorialSentence,
} from '../ui/tutorial';
import { moodReason } from '../ui/residentInfo';
import { RoundButton } from '../ui/RoundButton';
import { COLORS, TILE_SIZE, rgb } from '../ui/style';
import { onViewportChange, type ViewSize } from '../ui/viewport';
import { BuildUI } from './island/BuildUI';
import {
  GROUND_EDGE_PX,
  releaseGroundBlocks,
  blockArea,
  blockShown,
  blocksTouching,
  groundBlocks,
  paintGroundBlock,
  type GroundArt,
  type GroundBlock,
  type GroundStamp,
} from './island/groundTexture';
import { GROUND_PATTERN_KEYS, GROUND_STAMP_KEYS } from '../art/catalog';
import { artCanvas } from './art/artLoader';
import {
  GLINT_KEY,
  OBJECT_ORIGIN,
  RING_KEY,
  RING_OUTER_FRACTION,
  RING_SIZE,
  ROCK_KEYS,
  SHORE_WAVE_KEY,
  TEXTURE_SCALE,
  TREE_KEYS,
} from './island/objectTextures';
import { LostOverlay } from './island/LostOverlay';
import { NightLayer } from './island/NightLayer';
import { ParentPanel } from './island/ParentPanel';
import { TutorialGuide } from './island/TutorialGuide';
import { ResidentView } from './island/ResidentView';
import { VillageMenu } from './island/VillageMenu';
import { VillageView } from './island/VillageView';
import { WorldCameraController } from './island/WorldCameraController';
import { ISLAND_EVENTS, SCENES, type TileTapEvent } from './keys';
import { markActiveScene, markAudio, markCamera, markParent, markPerf, markSave, markTap, markVillage } from './sceneMarker';

/** Tap ring: how long it takes to grow and fade away (ms). */
const RING_MS = 900;
/** The ring stays fully visible this long before it fades (ms). */
const RING_HOLD_MS = 500;
/** Depth of things above all objects (their depth is their y position in the world). */
const TOP_DEPTH = 1_000_000;
/** The frame times are published every this many frames (`<html data-perf>`). */
const PERF_EVERY = 20;
/** How many of the last frames the published numbers cover. */
const PERF_FRAMES = 300;
/**
 * Residents are picked up only from this zoom on (a tile of 32 CSS px or more, as at the start, M7): further out a
 * press on one of many tiny figures would take the camera's drag away, and a tap still opens their card.
 */
const GRAB_MIN_ZOOM = 0.5;
/** Room over the roof of a house for its "0/2" (world px), when the camera glides to a house chosen as a new home. */
const HOUSE_LABEL_ROOM = 44;
/** The local date is looked at this often (ms): a new day (also at midnight while playing) starts a new account. */
const DAY_KEY_EVERY = 1000;

/** The sentence of each step of the guided start (M8), and of the ways back to it (Korrekturrunde 1). */
const TUTORIAL_TEXTS: Readonly<Record<TutorialSentence, TextKey>> = {
  closeCard: 'tutorial.closeCard',
  closeShop: 'tutorial.closeShop',
  exit: 'tutorial.exit',
  chip: 'tutorial.chip',
  resident: 'tutorial.resident',
  shop: 'tutorial.shop',
  deco: 'tutorial.deco',
  coins: 'tutorial.coins',
  house: 'tutorial.house',
  path: 'tutorial.path',
  praise: 'tutorial.praise',
};

/** What a frame cost on the main thread (ms): the whole frame, the simulation in it, and drawing. */
interface PerfMeter {
  readonly frame: FrameStats;
  readonly sim: FrameStats;
  readonly render: FrameStats;
  /** All frames measured since the scene started (the smoke test waits for new ones). */
  total: number;
  frameStart: number;
  renderStart: number;
  simMs: number;
}

interface Glint {
  readonly sprite: Phaser.GameObjects.Image;
  readonly phase: number;
}

/** A small wave that runs up to the beach (M9): from `start` towards the land (`dx`, `dy`), then fades. */
interface Wave {
  readonly sprite: Phaser.GameObjects.Image;
  readonly phase: number;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/** Waves: one run takes this long (s); a wave starts this far out in the water (world px) and runs to the beach. */
const WAVE_SECONDS = 4.2;
const WAVE_RUN = 16;
/** Trees sway a little (degrees) – only those in view, and not when they are tiny far out. */
const TREE_SWAY_DEG = 1.3;
const TREE_SWAY_MIN_ZOOM = 0.4;

/**
 * The island: ground baked into one texture, trees and rocks as sprites
 * sorted by their y position, a camera you can drag, pinch and wheel-zoom.
 *
 * This scene drives the simulation – `simulation.update()` is called here and
 * nowhere else. The display only reads the state. The glints on the water are
 * drawn from the smooth simulation time `(tick + alpha) * tickMs`, so they
 * move fluidly although the simulation only ticks 10 times per second, and
 * stand still while the simulation is paused.
 *
 * Two cameras: the world camera (behind) shows `worldLayer`; the main camera
 * (in front, CSS pixels as everywhere else) shows `uiLayer`.
 */
export class IslandScene extends Phaser.Scene {
  private readonly simulation: Simulation;
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private worldCamera!: Phaser.Cameras.Scene2D.Camera;
  private controller!: WorldCameraController;
  private glints: Glint[] = [];
  private waves: Wave[] = [];
  /** The trees, for their swaying (M9); a cleared tree is destroyed and dropped here on the next frame. */
  private swayingTrees: { readonly sprite: Phaser.GameObjects.Image; readonly phase: number }[] = [];
  /** The ground patterns and stamps (M9), taken from the loaded pictures in `create`. */
  private groundArt: GroundArt | undefined;
  /** Tree and rock sprites by tile index (`y * width + x`); M2/M3 remove them when forest is cleared. */
  private readonly objects = new Map<number, Phaser.GameObjects.Image>();
  private ring!: Phaser.GameObjects.Image;
  private ringTween: Phaser.Tweens.Tween | undefined;
  private ringFade: Phaser.Tweens.Tween | undefined;
  /** The ground, cut into blocks that are each their own texture (a change uploads only the blocks it touches). */
  private groundBlocks: { readonly block: GroundBlock; readonly key: string; readonly texture: Phaser.Textures.CanvasTexture }[] = [];
  /** The terrain as it is drawn now: the scene compares it with the state when the revision changes. */
  private drawnTerrain: Terrain[] = [];
  private terrainRevision = 0;
  /** What redrawing the ground cost so far (`<html data-repaint>`): number of changes, time of the last and the longest in ms, blocks of the last and in all. */
  private repaint = { count: 0, last: 0, max: 0, blocks: 0, uploaded: 0, blocksTotal: 0 };
  private cameraBounds!: { -readonly [K in keyof CameraBounds]: CameraBounds[K] };
  private zoomButtons: RoundButton[] = [];
  private cameraKey = '';
  private landInView = 0;
  private buildTool!: BuildTool;
  private village!: VillageView;
  private residentView!: ResidentView;
  private perf!: PerfMeter;
  private residentsText = '[]';
  private boatsText = '[]';
  private residentsTick = -1;
  /** The boats the camera already knows (a new one with a guest may make it glide to the landing place). */
  private seenBoats = new Set<number>();
  /** What the running camera glide is for: a boat (only while looking) or the house tapped while choosing a home. */
  private glideFor: 'boat' | 'house' | 'place' | undefined;
  /** A house was tapped while choosing a home: glide to it once the controls are laid out (next frame). */
  private houseGlidePending = false;
  private buildUI!: BuildUI;
  private menu!: VillageMenu;
  private lost!: LostOverlay;
  private savePublished = '';
  private preview: Preview = { kind: 'none' };
  private previewKey = '';
  private publishedRevision = -1;
  private buildings = '[]';
  private paths = '';
  private terrain = '';
  private previewText = 'none';
  private producers = '[]';
  private producersTick = -1;
  /** M8: the parents' menu, the evening and the night, the hand of the guided start. */
  private parentPanel!: ParentPanel;
  private night!: NightLayer;
  private guide!: TutorialGuide;
  private tutorial: TutorialRecord = TUTORIAL_DONE;
  /** Decoration, houses and houses without a path, counted once per change of the village. */
  private tutorialCounts: { revision: number; counts: ReturnType<typeof villageCounts> } | undefined;
  /**
   * Where the hand may suggest to put the item (worked out once per change of the village or item): places near the
   * first house, and – when none of them is to be seen – near the middle of the picture (`around`).
   */
  private tutorialPlace: { key: string; tiles: readonly Tile[] } | undefined;
  private tutorialPlaceAround: { key: string; tiles: readonly Tile[] } | undefined;
  /** The place the hand points at (kept while it is to be seen, so the hand does not jump about). */
  private tutorialPlaceShown: Tile | undefined;
  private tutorialPath: { revision: number; targets: ReturnType<typeof pathTargets> } | undefined;
  /** The resident the hand points at (kept while they stay in the picture, so the hand does not jump about). */
  private tutorialResident: number | undefined;
  /** Nothing to point at in the picture since `since` (a resident, a place): the camera glides there (last at `glidedAt`). */
  private tutorialSearch: { kind: 'resident' | 'place'; since: number; glidedAt: number } | undefined;
  private tutorialHint: TutorialHint | undefined;
  private tutorialTouches = 0;
  private worldTapped = false;
  private dayKey = { at: Number.NEGATIVE_INFINITY, key: '' };
  private dayPublished = '';

  /** Boats that carry a guest: when the guest steps ashore, the boat sound plays (M9). */
  private boatsWithGuest = new Set<number>();
  /** When `data-audio` was last published (ms). */
  private audioMarkedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly session: GameSession,
    private readonly parent: ParentSession,
    private readonly audio: AudioEngine,
  ) {
    super(SCENES.island);
    this.simulation = session.simulation;
  }

  create(): void {
    markActiveScene(SCENES.island);

    const { seed, world } = this.simulation.state;
    // A restarted scene starts clean (the instance is reused).
    this.groundArt = this.collectGroundArt();
    this.glints = [];
    this.waves = [];
    this.swayingTrees = [];
    this.objects.clear();
    this.ringTween = undefined;
    this.ringFade = undefined;
    this.previewKey = '';
    this.publishedRevision = -1;
    this.preview = { kind: 'none' };
    // What the page marker published about the village before a restart (a loaded village) must not look current.
    this.producers = '[]';
    this.producersTick = -1;
    this.residentsText = '[]';
    this.boatsText = '[]';
    this.residentsTick = -1;
    // Boats of a loaded village are no news: the camera only follows boats that set off from now on.
    this.seenBoats = new Set(this.simulation.state.boats.map((boat) => boat.id));
    this.glideFor = undefined;
    this.houseGlidePending = false;
    this.buildings = '[]';
    this.paths = '';
    this.previewText = 'none';
    this.cameraKey = '';
    this.savePublished = '';
    this.drawnTerrain = [...world.tiles];
    this.terrainRevision = this.simulation.state.revision;
    this.repaint = { count: 0, last: 0, max: 0, blocks: 0, uploaded: 0, blocksTotal: 0 };
    this.tutorial = readTutorial(this.parent.tutorial) ?? TUTORIAL_DONE;
    this.tutorialCounts = undefined;
    this.tutorialPlace = undefined;
    this.tutorialPlaceAround = undefined;
    this.tutorialPlaceShown = undefined;
    this.tutorialPath = undefined;
    this.tutorialResident = undefined;
    this.tutorialSearch = undefined;
    this.tutorialHint = undefined;
    this.tutorialTouches = 0;
    this.worldTapped = false;
    this.dayKey = { at: Number.NEGATIVE_INFINITY, key: '' };
    this.dayPublished = '';

    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();

    // World camera behind, main camera (UI) in front and see-through.
    this.worldCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'world');
    Phaser.Utils.Array.SendToBack(this.cameras.cameras, this.worldCamera);
    this.worldCamera.setBackgroundColor(COLORS.waterDeep).ignore(this.uiLayer);
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)').ignore(this.worldLayer);

    this.buildGround(seed);
    this.buildObjects(seed);
    this.buildGlints(seed);
    this.buildWaves(seed);
    this.village = new VillageView(this, this.worldLayer, this.simulation);
    this.village.sync();
    this.village.onSound = (kind) => {
      this.playSound(kind);
    };
    this.boatsWithGuest = new Set(this.simulation.state.boats.filter((boat) => boat.passenger !== null).map((boat) => boat.id));
    this.residentView = new ResidentView(this, this.worldLayer, this.simulation);
    this.buildTool = new BuildTool(
      () => this.simulation.state,
      (command) => {
        if (command.type === 'assignHome') {
          this.playSound('moveHome');
          // Moving house (✓ on the card, or let go on a house): the figure glides from where it is drawn now to the
          // door of the new home – nobody jumps across the island.
          const at = this.residentView.positionOf(command.residentId);
          if (at) {
            this.residentView.letGo(command.residentId, at, command.houseId);
          }
        }
        this.simulation.send(command);
      },
      ({ at, refund }) => {
        // What the player gets back for a demolished building floats up where it stood.
        const type = buildingAt(this.simulation.state, at.x, at.y);
        const size = type ? buildingType(type.type)?.footprint : undefined;
        this.village.popAmounts(
          (at.x + (size?.w ?? 1) / 2) * TILE_SIZE,
          (at.y + (size?.h ?? 1) / 2) * TILE_SIZE,
          Object.entries(refund),
          this.controller.view.zoom,
        );
      },
    );
    this.terrain = terrainLetters(world);
    this.ring = this.add.image(0, 0, RING_KEY).setDepth(TOP_DEPTH).setVisible(false);
    this.worldLayer.add(this.ring);

    const bounds = {
      ...growRect(
        { x: 0, y: 0, width: world.width * TILE_SIZE, height: world.height * TILE_SIZE },
        CAMERA_CONFIG.marginTiles * TILE_SIZE,
      ),
      // The screen centre stays on or right next to land: the island can never leave the picture.
      centerRegions: landRegions(world, TILE_SIZE, CAMERA_CONFIG.landMarginTiles),
    };
    // The camera reads this object each time; new land (a filled beach) replaces the regions.
    this.cameraBounds = bounds;
    this.controller = new WorldCameraController(this, this.worldCamera, {
      bounds,
      focus: islandFocus(world),
      focusPadding: 12,
      tileSize: TILE_SIZE,
      maxTileCssPx: CAMERA_CONFIG.maxTileCssPx,
      minStartTileCssPx: CAMERA_CONFIG.minStartTileCssPx,
      // The start village sits in the middle of the island.
      startCenter: { x: (world.width / 2) * TILE_SIZE, y: (world.height / 2) * TILE_SIZE },
      tapMaxMovePx: CAMERA_CONFIG.tapMaxMovePx,
      wheelZoomPerPixel: CAMERA_CONFIG.wheelZoomPerPixel,
      blocksCamera: (object) => object.displayList === this.uiLayer,
      blocksPoint: (x, y) => this.covered || this.buildUI.coversPoint(x, y),
      // The wheel is for the island only: not over panels, not while the menu or the shop covers it.
      blocksWheel: (x, y) => this.covered || this.buildUI.shopOpen || this.buildUI.coversPoint(x, y) || this.buildUI.overMenuButton(x, y),
      onTap: (point, _screen, time) => this.handleTap(point, time),
      // M7: a press on a resident while looking carries them to a house.
      onGrab: (point) => this.grabResident(point),
      onCarry: (point, screen) => {
        // Carrying starts: an old explanation ("Lumo wohnt jetzt hier!") gives way to what to do now.
        if (!this.buildTool.carried) {
          this.buildUI.clearNotice();
        }
        this.buildTool.carryResident(point, this.buildUI.coversPoint(screen.x, screen.y));
      },
      onDrop: (point, screen) => {
        this.dropResident(point, this.buildUI.coversPoint(screen.x, screen.y));
      },
      onCancelCarry: () => {
        // A second finger, the system took the pointer: the figure slides back from where it hangs.
        const carried = this.buildTool.carried;
        if (carried) {
          this.residentView.letGo(carried.residentId, this.residentView.positionOf(carried.residentId) ?? carried.at);
        }
        this.buildTool.cancelCarry();
      },
      // The evening covers the island: a press held from before must not start carrying (Korrekturrunde 1).
      mayCarry: () => !this.covered,
      onPanStart: (point) => {
        this.explainNoGrab(point);
      },
    });

    const zoomIn = new RoundButton(this, 0, 0, {
      radius: 34, // the real size comes from `zoomLayout` in the layout callback
      icon: 'plus',
      onTap: () => this.controller.zoomBy(CAMERA_CONFIG.buttonZoomFactor),
    });
    const zoomOut = new RoundButton(this, 0, 0, {
      radius: 34, // the real size comes from `zoomLayout` in the layout callback
      icon: 'minus',
      onTap: () => this.controller.zoomBy(1 / CAMERA_CONFIG.buttonZoomFactor),
    });
    this.uiLayer.add([zoomIn, zoomOut]);
    this.zoomButtons = [zoomIn, zoomOut];
    this.buildUI = new BuildUI(
      this,
      this.uiLayer,
      this.buildTool,
      () => this.simulation.state,
      () => {
        this.previewKey = '';
      },
      () => {
        this.menu.open();
      },
      () => this.menu.isOpen,
    );
    this.buildUI.onSound = (kind) => {
      this.playSound(kind);
    };
    this.buildUI.onSkipTutorial = () => {
      this.setTutorial(skipTutorial(this.tutorial));
      this.buildUI.showNotice('tutorial.skipped');
    };
    // The hand of the guided start points at controls too: above them, below the menu.
    this.guide = new TutorialGuide(this, this.uiLayer);
    this.menu = new VillageMenu(this, this.uiLayer, this.session, {
      touched: (time) => {
        this.buildUI.touched(time);
      },
      onReplaced: () => {
        // A village from a file has its own start: the guided start is over (M8). The scene starts again and builds everything from the new state.
        if (this.tutorial.status === 'active') {
          this.setTutorial({ ...TUTORIAL_DONE });
        }
        this.scene.restart();
      },
      onParent: () => {
        this.parentPanel.open();
      },
      soundOn: () => this.parent.sound.on,
      onSound: (on) => {
        this.setSound({ on });
      },
    });
    // Evening and night over everything (M8), below the parents' menu (the way out of the night) and the "other window" layer.
    this.night = new NightLayer(this, this.uiLayer, (time) => {
      this.buildUI.touched(time);
      this.parentPanel.open();
    });
    this.parentPanel = new ParentPanel(this, this.uiLayer, this.parent, {
      touched: (time) => {
        this.buildUI.touched(time);
      },
      onSound: (change) => {
        this.setSound(change);
      },
      onTutorialAgain: () => {
        this.setTutorial(startTutorial({ ...this.countsForTutorial(), earned: this.simulation.state.earnedCoins }));
      },
      onClose: () => undefined,
    });
    // Last in the UI layer, so it covers everything: after another window took over the saving nothing may be built here.
    this.lost = new LostOverlay(this, this.uiLayer, () => {
      window.location.reload();
    });
    if (this.parent.clock.phase === 'night') {
      // A reload in the night (M8): it is night at once – everybody is in bed, nothing moves.
      this.simulation.send({ type: 'setBedtime', bedtime: true, instant: true });
      this.simulation.send({ type: 'setPaused', paused: true });
      this.simulation.applyPending();
      this.night.showNightNow();
    }
    const startNotice = this.session.takeNotice();
    if (startNotice) {
      this.buildUI.showNotice(startNotice);
    }

    onViewportChange(this, ({ width, height }: ViewSize) => {
      this.controller.layout({ width, height });

      // The zoom buttons sit at the top right; the bottom belongs to the toolbar.
      const zoom = zoomLayout(width, height);
      zoomIn.setRadius(zoom.radius).setPosition(zoom.zoomIn.x, zoom.zoomIn.y);
      zoomOut.setRadius(zoom.radius).setPosition(zoom.zoomOut.x, zoom.zoomOut.y);
      this.buildUI.layout(
        { width, height },
        {
          'zoom-in': { x: zoomIn.x, y: zoomIn.y, enabled: true },
          'zoom-out': { x: zoomOut.x, y: zoomOut.y, enabled: true },
        },
      );
      this.menu.layout({ width, height });
      this.night.layout({ width, height }, toolbarPanel(width, height, TOOLS.length).rect);
      this.parentPanel.layout({ width, height });
      this.lost.layout({ width, height });
    });

    const fade = rgb(COLORS.waterDeep);
    this.cameras.main.fadeIn(300, ...fade);
    this.worldCamera.fadeIn(300, ...fade);

    this.startPerf();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.groundBlocks = releaseGroundBlocks(this.groundBlocks, (key) => this.textures.remove(key));
    });
  }

  /**
   * Measures every frame on the main thread, from its start (Phaser's `prestep`) to the end of drawing (`postrender`):
   * the whole frame, the simulation in it and drawing (`<html data-perf>`, M6). The smoke test reads it with the
   * processor slowed down four times.
   */
  private startPerf(): void {
    const perf: PerfMeter = {
      frame: new FrameStats(PERF_FRAMES),
      sim: new FrameStats(PERF_FRAMES),
      render: new FrameStats(PERF_FRAMES),
      total: 0,
      frameStart: 0,
      renderStart: 0,
      simMs: 0,
    };
    this.perf = perf;
    const onPreStep = (): void => {
      perf.frameStart = performance.now();
      perf.simMs = 0;
    };
    const onPreRender = (): void => {
      perf.renderStart = performance.now();
    };
    const onPostRender = (): void => {
      if (perf.frameStart === 0) {
        return;
      }
      const now = performance.now();
      perf.frame.add(now - perf.frameStart);
      perf.render.add(now - perf.renderStart);
      perf.sim.add(perf.simMs);
      perf.frameStart = 0;
      perf.total += 1;
      if (perf.total % PERF_EVERY === 0) {
        this.publishPerf();
      }
    };
    const events = this.game.events;
    events.on(Phaser.Core.Events.PRE_STEP, onPreStep);
    events.on(Phaser.Core.Events.PRE_RENDER, onPreRender);
    events.on(Phaser.Core.Events.POST_RENDER, onPostRender);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      events.off(Phaser.Core.Events.PRE_STEP, onPreStep);
      events.off(Phaser.Core.Events.PRE_RENDER, onPreRender);
      events.off(Phaser.Core.Events.POST_RENDER, onPostRender);
    });
  }

  private publishPerf(): void {
    const round = (value: number): number => Math.round(value * 100) / 100;
    const frame = this.perf.frame.summary();
    const sim = this.perf.sim.summary();
    const render = this.perf.render.summary();
    const { state } = this.simulation;
    markPerf(
      JSON.stringify({
        total: this.perf.total,
        frames: frame.frames,
        mean: round(frame.mean),
        p95: round(frame.p95),
        max: round(frame.max),
        simMean: round(sim.mean),
        simP95: round(sim.p95),
        renderMean: round(render.mean),
        renderP95: round(render.p95),
        residents: state.residents.length,
        boats: state.boats.length,
      }),
    );
  }

  override update(time: number, delta: number): void {
    // The raw frame time, not Phaser's smoothed `delta`: only the clock of the simulation caps a frame (see frameTime.ts).
    const simStart = performance.now();
    const alpha = this.simulation.update(simulationDelta(this.game.loop.rawDelta, delta));
    this.perf.simMs += performance.now() - simStart;
    const seconds = ((this.simulation.state.tick + alpha) * this.simulation.tickMs) / 1000;

    this.session.autosave?.update(time);
    this.lost.setOpen(this.session.autosave?.isLost === true);
    this.updateDay(time);
    this.followNewBoats();
    // A carried resident who stayed over a house with room a moment turns it green (one clock: the frame time).
    this.buildTool.updateCarry(time);
    // The glide to a boat counts real time (like the simulation); inertia and smooth zoom keep Phaser's delta.
    this.controller.update(delta, simulationDelta(this.game.loop.rawDelta, delta));
    this.publishCamera();
    this.residentView.update(alpha, seconds, this.controller.view.zoom, this.buildTool.inspectedResidentId, this.buildTool.carried);
    this.updateVillage(seconds, delta);

    for (const { sprite, phase } of this.glints) {
      const wave = 0.5 + 0.5 * Math.sin(seconds * 1.6 + phase);
      sprite.setAlpha(0.15 + 0.45 * wave).setScale((0.8 + 0.3 * wave) / TEXTURE_SCALE);
    }
    this.updateWaves(seconds);
    this.updateTreeSway(seconds);
    this.audio.update();
    if (time - this.audioMarkedAt >= 500 || time < this.audioMarkedAt) {
      this.audioMarkedAt = time;
      markAudio(this.audio.describe());
    }
    this.updateTutorial(time);
  }

  /** Is the island covered (another window, the menu, the parents' menu, the evening or the night)? Then it takes no touch. */
  private get covered(): boolean {
    return this.lost.isOpen || this.menu.isOpen || this.parentPanel.isOpen || this.night.blocks;
  }

  /**
   * The daily limit (M8): counts this frame's visible play (the raw frame time, capped like the simulation – never the
   * difference of two wall-clock times), looks at the local date once a second, and follows the turns of the day:
   * a gentle sentence a few minutes before the end, then the evening (everybody walks home to bed, nothing is made),
   * the night (the game stands still and is saved) and the morning (it gets light, everybody wakes up).
   */
  private updateDay(time: number): void {
    const state = this.simulation.state;
    if (time - this.dayKey.at >= DAY_KEY_EVERY || time < this.dayKey.at) {
      this.dayKey = { at: time, key: localDayKey(new Date()) };
    }
    const frameMs = this.game.loop.rawDelta;
    const clock = this.parent.clock;
    const events = this.parent.update({
      frameMs,
      dayKey: this.dayKey.key,
      // Only visible, running play: not in the background, not with the parents' menu or the "other window" layer open.
      counting: document.visibilityState === 'visible' && !this.lost.isOpen && !this.parentPanel.isOpen,
      allAsleep: clock.phase === 'dusk' && allAsleep(state),
    });
    for (const event of events) {
      this.dayEvent(event);
    }
    // The music fades out in the evening and is off at night; in the morning it comes back (M9).
    this.audio.setMode(clock.phase === 'dusk' ? 'dusk' : clock.phase === 'night' ? 'night' : 'day');
    this.night.update(clock.phase, clock.phaseTime, frameMs, DAY_CLOCK_OPTIONS.duskMinMs, DAY_CLOCK_OPTIONS.dawnMs);
  }

  private dayEvent(event: DayEvent): void {
    switch (event) {
      case 'warn':
        // Said only once, no countdown: it waits until the hint bar has really shown it (not under the shop or a
        // card), and then stays until the next tap (Korrekturrunde 1).
        this.buildUI.holdNotice('limit.warn');
        return;
      case 'dusk': {
        // The evening: everything closes, everybody walks home.
        this.menu.close();
        // A finger held on a resident (not moved yet) or carrying one: let go – the rest of that touch does nothing.
        this.controller.letGo();
        const carried = this.buildTool.carried;
        if (carried) {
          this.residentView.letGo(carried.residentId, this.residentView.positionOf(carried.residentId) ?? carried.at);
        }
        this.buildTool.cancelCarry();
        if (this.buildTool.shopOpen) {
          this.buildTool.closeShop();
        }
        if (this.buildTool.tool !== 'view') {
          this.buildTool.exitTool();
        }
        this.buildTool.closeInfo();
        this.controller.stopGlide();
        this.simulation.send({ type: 'setBedtime', bedtime: true });
        return;
      }
      case 'night':
        // The night: the game stands still and is saved – nothing is made, nothing is lost. The evening's sentence has said its piece.
        this.buildUI.clearAllNotices();
        this.playSound('goodNight');
        this.simulation.send({ type: 'setPaused', paused: true });
        this.simulation.applyPending();
        void this.session.autosave?.flush();
        return;
      case 'wake':
        this.simulation.send({ type: 'setBedtime', bedtime: false });
        this.simulation.send({ type: 'setPaused', paused: false });
        return;
      case 'newDay':
        return;
    }
  }

  private countsForTutorial(): ReturnType<typeof villageCounts> {
    const state = this.simulation.state;
    if (this.tutorialCounts?.revision !== state.revision) {
      this.tutorialCounts = { revision: state.revision, counts: villageCounts(state) };
    }
    return this.tutorialCounts.counts;
  }

  private setTutorial(record: TutorialRecord): void {
    this.tutorial = record;
    this.parent.setTutorial(storeTutorial(record));
  }

  /**
   * The guided start (M8): moves on when a goal is reached (from the village and the controls, `advanceTutorial`), puts
   * the sentence of the step into the hint bar and lets the hand point at the next tap.
   */
  private updateTutorial(time: number): void {
    if (this.tutorial.status !== 'active') {
      this.buildUI.setTutorial(undefined);
      this.guide.update(undefined, this.controller.viewSize, time);
      return;
    }
    const state = this.simulation.state;
    const touches = this.buildUI.touchCount;
    // The praise ends with a tap only once it was really to be seen (a tool hint or a message goes before it).
    const praising = currentStep(this.tutorial)?.id === 'praise';
    // (Shown in the last frame: the praise itself, not a sentence that leads to it, like "Tippe auf ✕" on an open card.)
    const praiseShown = this.tutorialHint?.sentence === 'praise' && this.buildUI.tutorialShownAt !== undefined;
    const tapped = (this.worldTapped || touches !== this.tutorialTouches) && (!praising || praiseShown);
    this.worldTapped = false;
    this.tutorialTouches = touches;
    const next = advanceTutorial(this.tutorial, {
      ...this.countsForTutorial(),
      earned: state.earnedCoins,
      residentCard: this.buildTool.inspectedResidentId !== undefined,
      shopOpen: this.buildTool.shopOpen,
      tapped,
    });
    if (next !== this.tutorial) {
      this.setTutorial(next);
    }
    const step = currentStep(this.tutorial);
    const tool = this.buildTool;
    const card = tool.inspectedResidentId !== undefined ? 'resident' : tool.inspectedId !== undefined ? 'info' : undefined;
    const hint = tutorialHint(step, { tool: tool.tool, shopTab: tool.shopTab, item: tool.item, preview: tool.preview(), canConfirm: tool.canConfirm, card });
    this.tutorialHint = hint;
    // While a resident is carried, the bar says only where to let go (Korrekturrunde 2): no sentence of the tutorial.
    const said = hint && tool.carried === undefined ? hint : undefined;
    this.buildUI.setTutorial(said ? t(TUTORIAL_TEXTS[said.sentence]) : undefined, said?.firm ?? false);
    // The hand waits while something else is said in the hint bar (news, an explanation): sentence and hand go together.
    const hidden = this.covered || tool.carried !== undefined || this.buildUI.showsMessage;
    this.guide.update(hint && !hidden ? this.tutorialPoint(hint) : undefined, this.controller.viewSize, time, this.buildUI.freeBand);
  }

  /** Where the hand of the guided start points now (CSS px), if anywhere. */
  private tutorialPoint(hint: TutorialHint): { x: number; y: number; radius: number } | undefined {
    const target = hint.target;
    const state = this.simulation.state;
    const view = this.controller.view;
    const size = this.controller.viewSize;
    const toScreen = (x: number, y: number): { x: number; y: number } => ({ x: (x - view.centerX) * view.zoom + size.width / 2, y: (y - view.centerY) * view.zoom + size.height / 2 });
    const tileTarget = (tile: Tile | undefined): { x: number; y: number; radius: number } | undefined =>
      tile ? { ...toScreen((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE), radius: Math.max(28, (TILE_SIZE * view.zoom) / 1.6) } : undefined;
    if (target.kind === 'none' || target.kind === 'spot') {
      this.tutorialSearch = undefined;
    }
    switch (target.kind) {
      case 'none':
        return undefined;
      case 'spot': {
        const spots = this.buildUI.spotMap;
        // A card on another page of the shop: the hand shows the arrow to it.
        const spot = spots[target.name] ?? (target.name.startsWith('item-') ? (spots['page-next'] ?? spots['page-prev']) : undefined);
        if (!spot) {
          return undefined;
        }
        return { x: spot.x, y: spot.y, radius: Math.max(spot.w ?? 64, spot.h ?? 64) / 2 + 4 };
      }
      case 'resident':
        return this.tutorialResidentPoint(toScreen);
      case 'place':
        return this.tutorialPlacePoint(target.typeId, toScreen, tileTarget);
      case 'pathStart':
      case 'pathEnd': {
        if (this.tutorialPath?.revision !== state.revision) {
          this.tutorialPath = { revision: state.revision, targets: pathTargets(state) };
        }
        const targets = this.tutorialPath.targets;
        const tile = target.kind === 'pathStart' ? targets?.start : targets?.end;
        // Only where a tap reaches the island (Korrekturrunde 2); else the camera glides there gently.
        const point = tileTarget(tile);
        const covers = (x: number, y: number): boolean => this.buildUI.coversPoint(x, y) || this.buildUI.overMenuButton(x, y);
        if (point && inFreeBand(this.controller.viewSize, this.buildUI.freeBand, covers)(point.x, point.y)) {
          this.tutorialSearch = undefined;
          return point;
        }
        this.tutorialGlide('place', tile ? { x: (tile.x + 0.5) * TILE_SIZE, y: (tile.y + 0.5) * TILE_SIZE } : undefined);
        return undefined;
      }
    }
  }

  /**
   * The resident the hand points at (`pickTutorialResident`): one in the free band, else one on the screen that a tap
   * reaches. When nobody can be tapped (a phone held sideways, everybody under the bars) the camera glides gently to
   * the nearest one after a moment – only while just looking, with nothing open and no finger on the island; a touch
   * stops it, and it is not tried again for a few seconds.
   */
  private tutorialResidentPoint(toScreen: (x: number, y: number) => { x: number; y: number }): { x: number; y: number; radius: number } | undefined {
    const size = this.controller.viewSize;
    const residents = this.residentView.spots.map((spot) => ({ id: spot.id, ...toScreen(spot.x, spot.y - RESIDENT_BODY_Y), world: { x: spot.x, y: spot.y - RESIDENT_BODY_Y } }));
    const band = this.buildUI.freeBand;
    const covers = (x: number, y: number): boolean => this.buildUI.coversPoint(x, y) || this.buildUI.overMenuButton(x, y);
    const choice = pickTutorialResident(residents, size, band, this.tutorialResident, covers);
    this.tutorialResident = choice?.id;
    if (choice?.onScreen === true) {
      this.tutorialSearch = undefined;
      return { x: choice.x, y: choice.y, radius: 30 };
    }
    this.tutorialGlide('resident', residents.find((r) => r.id === choice?.id)?.world);
    return undefined;
  }

  /**
   * The place the hand suggests for the item (Korrekturrunde 2): the best free place near the first house that is to
   * be seen in the free band and not under a button (`pickPlace`); if none is, the best one near the middle of the
   * picture; if there is none either, the camera glides gently to the best place near the house (as for a resident).
   */
  private tutorialPlacePoint(
    typeId: string,
    toScreen: (x: number, y: number) => { x: number; y: number },
    tileTarget: (tile: Tile | undefined) => { x: number; y: number; radius: number } | undefined,
  ): { x: number; y: number; radius: number } | undefined {
    const state = this.simulation.state;
    const size = this.controller.viewSize;
    const view = this.controller.view;
    const band = this.buildUI.freeBand;
    const covers = (x: number, y: number): boolean => this.buildUI.coversPoint(x, y) || this.buildUI.overMenuButton(x, y);
    const onScreen = (tiles: readonly Tile[]) => tiles.map((tile) => ({ tile, ...toScreen((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE) }));
    const house = state.buildings.find((b) => buildingType(b.type)?.category === 'house');
    const near = house ? { x: house.x, y: house.y } : { x: Math.floor(state.world.width / 2), y: Math.floor(state.world.height / 2) };
    const key = `${typeId}|${String(state.revision)}|${String(near.x)},${String(near.y)}`;
    if (this.tutorialPlace?.key !== key) {
      this.tutorialPlace = { key, tiles: placeCandidates(state, typeId, near) };
    }
    let place = pickPlace(onScreen(this.tutorialPlace.tiles), size, band, this.tutorialPlaceShown, covers);
    if (!place) {
      // Nothing near the house is to be seen: look around the middle of the band (the child may be somewhere else).
      const middle = {
        x: Math.floor(view.centerX / TILE_SIZE),
        y: Math.floor((view.centerY + ((band.top + band.bottom) / 2 - size.height / 2) / view.zoom) / TILE_SIZE),
      };
      const aroundKey = `${typeId}|${String(state.revision)}|${String(middle.x)},${String(middle.y)}`;
      if (this.tutorialPlaceAround?.key !== aroundKey) {
        this.tutorialPlaceAround = { key: aroundKey, tiles: placeCandidates(state, typeId, middle) };
      }
      place = pickPlace(onScreen(this.tutorialPlaceAround.tiles), size, band, this.tutorialPlaceShown, covers);
    }
    this.tutorialPlaceShown = place?.tile;
    if (place) {
      this.tutorialSearch = undefined;
      return tileTarget(place.tile);
    }
    const best = this.tutorialPlace.tiles[0];
    this.tutorialGlide('place', best ? { x: (best.x + 0.5) * TILE_SIZE, y: (best.y + 0.5) * TILE_SIZE } : undefined);
    return undefined;
  }

  /**
   * Nothing to point at is to be seen: after a moment the camera glides gently to `world` – for a resident only while
   * just looking (`glideAllowed`), for a place only while placing (`placeGlideAllowed`), never with something open or a
   * finger on the island, and never once the child has moved the camera themselves (`tutorialGlideDue`, Korrektur-
   * runde 2); a touch stops it.
   */
  private tutorialGlide(kind: 'resident' | 'place', world: { x: number; y: number } | undefined): void {
    const now = this.time.now;
    if (this.tutorialSearch?.kind !== kind) {
      this.tutorialSearch = { kind, since: now, glidedAt: Number.NEGATIVE_INFINITY };
    }
    const search = this.tutorialSearch;
    const gestureActive = this.controller.gestureActive;
    const may =
      kind === 'place'
        ? this.placeGlideAllowed(gestureActive)
        : glideAllowed({ tool: this.buildTool.tool, shopOpen: this.buildUI.shopOpen, menuOpen: this.covered, lostOpen: this.lost.isOpen, cardOpen: this.buildTool.cardOpen, gestureActive });
    if (world === undefined || this.controller.glidingTo || !may || !tutorialGlideDue(search, now, this.controller.movedByPlayer)) {
      return;
    }
    // Into the middle of the band (not just inside it, as for a house: the hand wants a little room around its target).
    this.controller.glideTo(bandGlide(this.controller.view, this.controller.viewSize, this.buildUI.freeBand, world));
    this.glideFor = kind === 'place' ? 'place' : 'boat';
    search.glidedAt = now;
  }

  /**
   * May the camera glide to a place of the guided start (for the item being placed, the start or the end of the path)?
   * Only with that tool on and nothing open over it.
   */
  private placeGlideAllowed(gestureActive: boolean): boolean {
    const tool = this.buildTool.tool;
    return (tool === 'place' || tool === 'path') && !gestureActive && !this.buildUI.shopOpen && !this.covered && !this.lost.isOpen;
  }

  /**
   * A boat that sets off with a new resident (an invitation, a worker for a new building): while the child is just
   * looking, the camera glides gently to where it lands, unless that is already in the picture. It never jumps, and
   * the next touch stops it (see `CameraRig.glideTo`). While building, moving or demolishing, with the shop, the
   * menu or a card open, the camera stays – and a glide that is running stops (`glideAllowed`).
   */
  private followNewBoats(): void {
    const gestureActive = this.controller.gestureActive;
    const allowed = glideAllowed({
      tool: this.buildTool.tool,
      shopOpen: this.buildUI.shopOpen,
      menuOpen: this.menu.isOpen || this.parentPanel.isOpen || this.night.blocks,
      lostOpen: this.lost.isOpen,
      cardOpen: this.buildTool.cardOpen,
      gestureActive,
    });
    if (this.controller.glidingTo) {
      // A glide to the chosen house goes on while choosing (and stops with any touch or another tool).
      const keep = this.glideFor === 'house' ? this.houseGlideAllowed(gestureActive) : this.glideFor === 'place' ? this.placeGlideAllowed(gestureActive) : allowed;
      if (!keep) {
        this.controller.stopGlide();
      }
    }
    if (!this.controller.glidingTo) {
      this.glideFor = undefined;
    }
    if (this.houseGlidePending) {
      this.houseGlidePending = false;
      this.glideToChosenHouse(gestureActive);
    }
    const boats = this.simulation.state.boats;
    // A guest steps ashore: the boat sound (M9).
    if (boats.length > 0 || this.boatsWithGuest.size > 0) {
      const withGuest = new Set(boats.filter((boat) => boat.passenger !== null).map((boat) => boat.id));
      for (const id of this.boatsWithGuest) {
        if (!withGuest.has(id)) {
          this.playSound('boat');
        }
      }
      this.boatsWithGuest = withGuest;
    }
    if (boats.length === 0 && this.seenBoats.size === 0) {
      return;
    }
    const now = new Set<number>();
    for (const boat of boats) {
      now.add(boat.id);
      if (this.seenBoats.has(boat.id) || boat.passenger === null) {
        continue;
      }
      if (!allowed) {
        continue;
      }
      const width = this.simulation.state.world.width;
      const centre = (index: number): Point => ({ x: ((index % width) + 0.5) * TILE_SIZE, y: (Math.floor(index / width) + 0.5) * TILE_SIZE });
      const target = landingGlide(this.controller.view, this.controller.viewSize, this.buildUI.freeBand, centre(boat.shore), centre(boat.at));
      if (target) {
        this.controller.glideTo(target);
        this.glideFor = 'boat';
      }
    }
    this.seenBoats = now;
  }

  /** While choosing a new home with "Umziehen" – nothing covering the island, no finger on it. */
  private houseGlideAllowed(gestureActive: boolean): boolean {
    return this.buildTool.tool === 'home' && !gestureActive && !this.buildUI.shopOpen && !this.covered;
  }

  /**
   * The house tapped while choosing a new home is (partly) under the hint bar or the toolbar: the camera glides gently
   * until the house, its roof and the "0/2" over it are in the free part of the screen – the same glide as for a boat
   * (`CameraRig.glideTo`), and a touch stops it.
   */
  private glideToChosenHouse(gestureActive: boolean): void {
    const preview = this.buildTool.preview();
    if (preview.kind !== 'home' || preview.carried || !this.houseGlideAllowed(gestureActive)) {
      return;
    }
    const house = this.simulation.state.buildings.find((b) => b.id === preview.houseId);
    const type = house ? buildingType(house.type) : undefined;
    if (!house || !type) {
      return;
    }
    // Roof and "0/2" in the free band – the number stands higher over the sign of a house without a path.
    const top = Math.min(house.y * TILE_SIZE - type.look.rise - HOUSE_LABEL_ROOM, (this.village.homeLabelTop(house.id, this.controller.view.zoom) ?? Infinity) - 4);
    const rect = { x: house.x * TILE_SIZE, y: top, width: type.footprint.w * TILE_SIZE, height: (house.y + type.footprint.h) * TILE_SIZE - top };
    const target = rectGlide(this.controller.view, this.controller.viewSize, this.buildUI.freeBand, rect);
    if (target) {
      this.controller.glideTo(target);
      this.glideFor = 'house';
    }
  }

  /** Publishes the camera for tests (`<html data-camera-*>`); the land count is only recomputed when the view changed. */
  private publishCamera(): void {
    const view = this.controller.view;
    const size = this.controller.viewSize;
    const key = `${String(view.zoom)}|${String(view.centerX)}|${String(view.centerY)}|${String(size.width)}|${String(size.height)}`;
    if (key !== this.cameraKey) {
      this.cameraKey = key;
      this.landInView = countLandIn(this.simulation.state.world, visibleRect(view, size));
    }
    markCamera({
      zoom: view.zoom,
      centerX: view.centerX,
      centerY: view.centerY,
      minZoom: this.controller.limits.min,
      maxZoom: this.controller.limits.max,
      landInView: this.landInView,
    });
  }

  /**
   * Paints the ground block by block (512 px squares, each its own texture and image that reaches a few pixels over its
   * neighbours, so no gap shows between them – and without the unreliable outermost pixels of its canvas) – a change later only paints and uploads the blocks it touches.
   */
  private buildGround(seed: number): void {
    const { world } = this.simulation.state;
    this.groundBlocks = releaseGroundBlocks(this.groundBlocks, (key) => this.textures.remove(key));
    for (const block of groundBlocks(world)) {
      const area = blockArea(block);
      const key = `ground-${String(seed)}-${String(block.bx)}-${String(block.by)}`;
      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
      const texture = this.textures.createCanvas(key, area.width, area.height);
      if (!texture) {
        continue;
      }
      paintGroundBlock(texture.getContext(), world, seed, block, this.groundArt);
      texture.refresh();
      // Only the inner part is shown: the outermost pixels of a canvas are a little off and must not cover the neighbour.
      const shown = blockShown(block);
      texture.add('shown', 0, GROUND_EDGE_PX, GROUND_EDGE_PX, shown.width, shown.height);
      this.worldLayer.add(this.add.image(shown.x, shown.y, key, 'shown').setOrigin(0, 0).setDepth(0));
      this.groundBlocks.push({ block, key, texture });
    }
  }

  /** The ground patterns and stamps among the loaded pictures (M9; the pictures are made once by the start screen). */
  private collectGroundArt(): GroundArt {
    const patterns: Partial<Record<Terrain, CanvasImageSource>> = {};
    for (const [terrain, key] of Object.entries(GROUND_PATTERN_KEYS) as [Terrain, string][]) {
      const canvas = artCanvas(this, key);
      if (canvas) {
        patterns[terrain] = canvas;
      }
    }
    const stamps: Partial<Record<GroundStamp, CanvasImageSource>> = {};
    for (const [name, key] of Object.entries(GROUND_STAMP_KEYS) as [GroundStamp, string][]) {
      const canvas = artCanvas(this, key);
      if (canvas) {
        stamps[name] = canvas;
      }
    }
    return { patterns, stamps };
  }

  /** One tree per forest tile, one rock per rock tile; the sprite's depth is its ground y. */
  private buildObjects(seed: number): void {
    const { world } = this.simulation.state;
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        this.addObject(seed, x, y, false);
      }
    }
  }

  /** Puts the tree or rock of a forest or rock tile on the map (nothing for other terrain). A new one pops in. */
  private addObject(seed: number, x: number, y: number, animate: boolean): void {
    const { world } = this.simulation.state;
    const terrain = terrainAt(world, x, y);
    if (terrain !== 'forest' && terrain !== 'rock') {
      return;
    }
    const r = (n: number): number => hash2(seed + n * 977, x, y);
    const groundX = (x + 0.5 + (r(1) - 0.5) * 0.3) * TILE_SIZE;
    const groundY = (y + 0.84 + (r(2) - 0.5) * 0.2) * TILE_SIZE;
    const isTree = terrain === 'forest';
    const keys = isTree ? TREE_KEYS : ROCK_KEYS;
    const key = keys[Math.floor(r(3) * keys.length)] ?? keys[0];
    const origin = isTree ? OBJECT_ORIGIN.tree : OBJECT_ORIGIN.rock;
    const size = (isTree ? 0.9 + r(4) * 0.25 : 0.85 + r(4) * 0.3) / TEXTURE_SCALE;
    const flip = r(5) < 0.5 ? size : -size;
    const sprite = this.add.image(groundX, groundY, key).setOrigin(origin.x, origin.y).setScale(flip, size).setDepth(groundY);
    this.worldLayer.add(sprite);
    if (isTree) {
      this.swayingTrees.push({ sprite, phase: r(6) * Math.PI * 2 });
    }
    this.objects.set(y * world.width + x, sprite);
    if (animate) {
      sprite.setScale(flip * 0.3, size * 0.3);
      this.tweens.add({ targets: sprite, scaleX: flip, scaleY: size, duration: 320, ease: 'Back.easeOut' });
    }
  }

  /** Makes the ground, the trees and rocks, the sea glints and the camera limits follow the terrain of the state. */
  private syncTerrain(): void {
    const { world, seed } = this.simulation.state;
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    let landChanged = false;
    let cleared = false;
    const changed: { x: number; y: number }[] = [];
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const now = terrainAt(world, x, y);
        const before = this.drawnTerrain[y * world.width + x];
        if (now !== before) {
          changed.push({ x, y });
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
          landChanged ||= isLand(now) !== (before !== undefined && isLand(before));
          cleared ||= now === 'grass' && (before === 'forest' || before === 'rock');
          this.drawnTerrain[y * world.width + x] = now;
        }
      }
    }
    if (changed.length === 0) {
      return;
    }
    // Planted, set or filled – or a planted tree or rock taken away (M9).
    this.playSound(cleared ? 'demolish' : 'build');
    // Ground: only the blocks the changed tiles touch are painted again and uploaded to the graphics card.
    const started = performance.now();
    const touched = new Set<string>();
    for (const { x, y } of changed) {
      for (const block of blocksTouching(world, { x0: x, y0: y, x1: x, y1: y })) {
        touched.add(`${String(block.bx)},${String(block.by)}`);
      }
    }
    for (const entry of this.groundBlocks) {
      if (touched.has(`${String(entry.block.bx)},${String(entry.block.by)}`)) {
        paintGroundBlock(entry.texture.getContext(), world, seed, entry.block, this.groundArt);
        entry.texture.refresh();
      }
    }
    const elapsed = performance.now() - started;
    this.repaint = {
      count: this.repaint.count + 1,
      last: elapsed,
      max: Math.max(this.repaint.max, elapsed),
      blocks: touched.size,
      uploaded: this.repaint.uploaded + touched.size,
      blocksTotal: this.groundBlocks.length,
    };

    for (const { x, y } of changed) {
      const index = y * world.width + x;
      this.objects.get(index)?.destroy();
      this.objects.delete(index);
      this.addObject(seed, x, y, true);
      this.village.puff((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, 1);
    }
    // Sea glints on tiles that are land now.
    this.glints = this.glints.filter(({ sprite }) => {
      if (isLand(terrainAt(world, Math.floor(sprite.x / TILE_SIZE), Math.floor(sprite.y / TILE_SIZE)))) {
        sprite.destroy();
        return false;
      }
      return true;
    });
    // The waves follow the new coast.
    for (const wave of this.waves) {
      wave.sprite.destroy();
    }
    this.waves = [];
    this.buildWaves(seed);
    if (landChanged) {
      // New land is somewhere the camera may look at.
      this.cameraBounds.centerRegions = landRegions(world, TILE_SIZE, CAMERA_CONFIG.landMarginTiles);
    }
    this.terrain = terrainLetters(world);
  }

  /** The tree or rock sprite standing on a tile, if there is one. */
  objectAt(x: number, y: number): Phaser.GameObjects.Image | undefined {
    return this.objects.get(y * this.simulation.state.world.width + x);
  }

  /** A few twinkles on the sea near the coast. */
  private buildGlints(seed: number): void {
    const { world } = this.simulation.state;
    const nearLand = (x: number, y: number): boolean => {
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          if (isLand(terrainAt(world, x + dx, y + dy))) {
            return true;
          }
        }
      }
      return false;
    };
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        if (terrainAt(world, x, y) !== 'water' || hash2(seed + 4242, x, y) > 0.07 || !nearLand(x, y)) {
          continue;
        }
        const sprite = this.add
          .image(
            (x + 0.15 + hash2(seed + 4243, x, y) * 0.7) * TILE_SIZE,
            (y + 0.15 + hash2(seed + 4244, x, y) * 0.7) * TILE_SIZE,
            GLINT_KEY,
          )
          .setScale(1 / TEXTURE_SCALE)
          .setDepth(1);
        this.worldLayer.add(sprite);
        this.glints.push({ sprite, phase: hash2(seed + 4245, x, y) * Math.PI * 2 });
      }
    }
  }

  /** Sound on/off, music, noises (M9): kept in the parents' settings, heard at once. */
  private setSound(change: Partial<SoundSettings>): void {
    this.parent.setSound(change);
    this.audio.setSwitches(this.parent.sound);
    markAudio(this.audio.describe());
  }

  /** A noise of the game (M9); the engine leaves it out when it came too soon after the same one, or the sound is off. */
  private playSound(kind: SoundKind): void {
    this.audio.play(kind, this.time.now);
  }

  /** Small waves that run up to the beach now and then: on some sea tiles next to land (M9, only a picture). */
  private buildWaves(seed: number): void {
    const { world } = this.simulation.state;
    const sides: readonly [number, number][] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        if (terrainAt(world, x, y) !== 'water' || hash2(seed + 5151, x, y) > 0.3) {
          continue;
        }
        const side = sides.find(([dx, dy]) => isLand(terrainAt(world, x + dx, y + dy)));
        if (!side) {
          continue;
        }
        const [dx, dy] = side;
        // The edge of the land tile, a little out in the water (the foam line).
        const edgeX = (x + 0.5 + dx * 0.5) * TILE_SIZE - dx * 6;
        const edgeY = (y + 0.5 + dy * 0.5) * TILE_SIZE - dy * 6;
        const sprite = this.add
          .image(edgeX, edgeY, SHORE_WAVE_KEY)
          .setAngle(dx === 0 ? (dy < 0 ? 0 : 180) : dx > 0 ? 90 : -90)
          .setScale(1 / TEXTURE_SCALE)
          .setAlpha(0)
          .setDepth(1);
        this.worldLayer.add(sprite);
        this.waves.push({ sprite, phase: hash2(seed + 5152, x, y), x: edgeX, y: edgeY, dx, dy });
      }
    }
  }

  private updateWaves(seconds: number): void {
    for (const wave of this.waves) {
      const run = (seconds / WAVE_SECONDS + wave.phase) % 1;
      const back = (1 - run) * WAVE_RUN;
      wave.sprite
        .setPosition(wave.x - wave.dx * back, wave.y - wave.dy * back)
        .setAlpha(Math.sin(run * Math.PI) * 0.85)
        .setScale((0.75 + 0.35 * run) / TEXTURE_SCALE, 1 / TEXTURE_SCALE);
    }
  }

  /** Trees in view sway a little around their foot (only the picture). */
  private updateTreeSway(seconds: number): void {
    if (this.swayingTrees.some(({ sprite }) => !sprite.active)) {
      this.swayingTrees = this.swayingTrees.filter(({ sprite }) => sprite.active);
    }
    if (this.controller.view.zoom < TREE_SWAY_MIN_ZOOM) {
      return;
    }
    const view = this.worldCamera.worldView;
    const left = view.x - TILE_SIZE;
    const right = view.right + TILE_SIZE;
    const top = view.y - TILE_SIZE;
    const bottom = view.bottom + TILE_SIZE * 2;
    for (const { sprite, phase } of this.swayingTrees) {
      if (sprite.x >= left && sprite.x <= right && sprite.y >= top && sprite.y <= bottom) {
        sprite.setAngle(Math.sin(seconds * 0.9 + phase) * TREE_SWAY_DEG);
      }
    }
  }

  /** A short touch on the world: announce the tile and show a soft ring on it. */
  private handleTap(world: Point, eventTime: number): void {
    // Right after ✓ or ✕ (double taps) a tap on the world must not start a new preview.
    if (this.covered || this.buildUI.worldTapsPaused(eventTime)) {
      return;
    }
    this.worldTapped = true;
    this.playSound('tap');
    // The open shop covers the island: a tap beside the panel closes it and does nothing else (no building, no ring).
    if (this.buildUI.shopOpen) {
      this.buildTool.closeShop();
      return;
    }
    // An explanation stays until the next tap.
    this.buildUI.clearNotice();
    // A resident under the finger (M6, only while looking): their card opens – also instead of another open card.
    if (this.buildTool.tool === 'view') {
      const residentId = this.residentAtTap(world);
      if (residentId !== undefined) {
        this.buildTool.inspectResident(residentId);
        return;
      }
    }
    // A tap beside the open card (of a building or a resident) closes it and does nothing else.
    if (this.buildTool.cardOpen) {
      this.buildTool.closeInfo();
      return;
    }
    const map = this.simulation.state.world;
    const tile = tileAtWorld(world, TILE_SIZE, map);
    if (!tile) {
      return;
    }
    const event: TileTapEvent = tile;
    markTap(tile);
    this.events.emit(ISLAND_EVENTS.tileTap, event);
    if (this.buildTool.tool === 'view') {
      this.showRing(tile);
    }
    const notice = this.buildTool.tap(tile, world);
    if (this.buildTool.tool === 'home' && !notice) {
      this.houseGlidePending = true;
    }
    if (notice) {
      this.buildUI.showNotice(notice);
    } else if (this.buildTool.tool === 'view') {
      // The sign above a building is tapped too: a production building opens its card, a house says what is missing.
      const signOf = this.village.markerAt(world.x, world.y);
      if (signOf !== undefined) {
        if (buildingType(this.simulation.state.buildings.find((b) => b.id === signOf)?.type ?? '')?.category === 'production') {
          this.buildTool.inspect(signOf);
        } else {
          this.buildUI.showNotice('hint.needsPath');
        }
      }
    }
  }

  /**
   * A press on the world (M7): a resident under the finger is picked up – only while looking, with nothing covering
   * the island and from {@link GRAB_MIN_ZOOM} on. Moving the finger then carries them; without moving it stays a tap.
   */
  private grabResident(world: Point): boolean {
    if (this.covered || this.buildUI.shopOpen || this.buildTool.tool !== 'view' || this.controller.view.zoom < GRAB_MIN_ZOOM) {
      return false;
    }
    const residentId = this.residentAtTap(world);
    return residentId !== undefined && this.buildTool.grabResident(residentId, world);
  }

  /**
   * A drag of the picture starts (the camera moves): if it started on a resident who can not be carried because the
   * island is too far away ({@link GRAB_MIN_ZOOM}), the hint bar says so – the camera moves as always, nothing is silent.
   */
  private explainNoGrab(world: Point): void {
    if (this.controller.view.zoom >= GRAB_MIN_ZOOM || this.buildTool.tool !== 'view' || this.covered || this.buildUI.shopOpen) {
      return;
    }
    // Only a press right on the figure: dragging the village from afar must not bring up the sentence all the time.
    const residentId = residentAt(this.residentView.spots, world, this.controller.view.zoom, true);
    const name = residentId === undefined ? undefined : this.simulation.state.residents.find((r) => r.id === residentId)?.name;
    if (name !== undefined) {
      this.buildUI.showNotice('hint.dragZoom', { name });
    }
  }

  /** Let go of a carried resident: into the house under the finger if it has room; a short notice says what happened. */
  private dropResident(world: Point, overUi: boolean): void {
    const carried = this.buildTool.carried;
    const notice = this.buildTool.dropResident(world, overUi);
    if (!carried) {
      return;
    }
    const at = this.residentView.positionOf(carried.residentId) ?? world;
    const moved = notice?.key === 'hint.homeMoved';
    this.residentView.letGo(carried.residentId, at, moved ? carried.target?.houseId : undefined);
    if (moved) {
      this.village.puff(at.x, at.y - RESIDENT_BODY_Y, 0.5);
    }
    if (notice) {
      this.buildUI.showNotice(notice.key, notice.params);
    }
  }

  /**
   * The resident drawn under a tapped world point (where the picture is now), if any – within 24 CSS px of the body.
   * On a building that answers the tap (a production building, a house without a path, a sign) only close to the body:
   * far out the building keeps its picture (see `residentHit.ts`).
   */
  private residentAtTap(world: Point): number | undefined {
    const tile = tileAtWorld(world, TILE_SIZE, this.simulation.state.world);
    const onBuilding = (tile !== undefined && this.buildTool.buildingAnswersTap(tile, world)) || this.village.markerAt(world.x, world.y) !== undefined;
    return residentAt(this.residentView.spots, world, this.controller.view.zoom, onBuilding);
  }

  /** Keeps the drawn village and the building controls in line with the state and the tool. */
  private updateVillage(seconds: number, deltaMs: number): void {
    // Terrain first (trees, beaches), so the village and the signs see the new ground.
    if (this.simulation.state.revision !== this.terrainRevision) {
      this.terrainRevision = this.simulation.state.revision;
      this.syncTerrain();
    }
    if (this.village.sync()) {
      this.buildTool.refresh();
    }
    this.buildUI.update();
    // The open shop covers the screen: no zoom buttons over it.
    for (const button of this.zoomButtons) {
      button.setVisible(!this.buildUI.shopOpen);
    }

    const { revision } = this.simulation.state;
    const key = `${String(this.buildTool.version)}|${String(revision)}`;
    if (key !== this.previewKey) {
      this.previewKey = key;
      this.preview = this.buildTool.preview();
      this.previewText = describePreview(this.preview);
      this.village.setPreview(this.preview);
    }
    this.village.setInspect(this.buildTool.inspectedId);
    const view = this.controller.view;
    // The top of the visible world below the hint bar: house signs do not slide under the bar.
    const topEdge = view.centerY - this.controller.viewSize.height / (2 * view.zoom) + this.buildUI.topInset / view.zoom;
    this.village.update(seconds, deltaMs, view.zoom, topEdge, this.residentView.carriedBox);
    this.publishVillage(revision);
  }

  /** Publishes the building state for tests (`<html data-tool data-buildings …>`). */
  private publishVillage(revision: number): void {
    const state = this.simulation.state;
    if (state.tick !== this.producersTick) {
      this.producersTick = state.tick;
      // [building id, status, times delivered, pace] – changes rarely, so the page attribute is rarely written.
      const paces = workPaces(state);
      this.producers = JSON.stringify(state.production.map((p) => [p.buildingId, p.status, p.delivered, paces.get(p.buildingId) ?? 100]));
    }
    if (state.tick !== this.residentsTick || revision !== this.publishedRevision) {
      this.residentsTick = state.tick;
      this.publishResidents();
    }
    if (revision !== this.publishedRevision) {
      this.publishedRevision = revision;
      this.buildings = JSON.stringify(state.buildings.map((b) => [b.id, b.type, b.x, b.y, isConnected(state, b.id) ? 1 : 0]));
      const tiles: string[] = [];
      for (const index of state.paths) {
        tiles.push(`${String(index % state.world.width)},${String(Math.floor(index / state.world.width))}`);
      }
      this.paths = tiles.join(';');
    }
    markVillage({
      tool: this.buildTool.tool,
      variant: this.buildTool.item ?? '',
      preview: this.previewText,
      hint: this.buildUI.shownHint,
      markers: this.village.markerCount,
      buildings: this.buildings,
      paths: this.paths,
      terrain: this.terrain,
      ui: this.buildUI.spots,
      stock: this.buildUI.shownStock,
      producers: this.producers,
      card: this.buildTool.inspectedId === undefined ? '' : String(this.buildTool.inspectedId),
      shop: this.buildUI.shownShopState,
      tip: this.buildUI.shownTip,
      unlocked: state.unlocked.join(','),
      earned: String(state.earnedCoins),
      planted: String(state.planted.length),
      repaint: JSON.stringify(this.repaint),
      menu: this.lost.isOpen ? 'lost' : this.menu.shownState,
      menuSpots: JSON.stringify(this.lost.isOpen ? this.lost.spots : { ...this.menu.spots, ...this.night.spots, ...this.parentPanel.spots }),
      residents: this.residentsText,
      boats: this.boatsText,
      residentCard: this.buildTool.inspectedResidentId === undefined ? '' : String(this.buildTool.inspectedResidentId),
      drag: this.describeDrag(),
      homeLabel: this.village.shownHomeLabel,
      tick: String(state.tick),
    });
    const saveInfo = this.session.describe();
    if (saveInfo !== this.savePublished) {
      this.savePublished = saveInfo;
      markSave(saveInfo);
    }
    this.publishParent();
  }

  /** The guided start, the parents' menu and the day (M8), for tests: `<html data-tutorial data-parent data-limit>`. */
  private publishParent(): void {
    const step = currentStep(this.tutorial);
    const hand = this.guide.pointsAt;
    const tutorial = JSON.stringify({
      status: this.tutorial.status,
      step: step?.id ?? '',
      index: this.tutorial.step,
      shown: this.buildUI.showsTutorial,
      ...(this.tutorialHint && this.tutorial.status === 'active'
        ? { target: describeTarget(this.tutorialHint), sentence: this.tutorialHint.sentence, at: this.buildUI.tutorialShownAt ?? '', said: this.buildUI.tutorialSaid }
        : {}),
      ...(hand ? { hx: Math.round(hand.x), hy: Math.round(hand.y), below: hand.fromBelow } : {}),
    });
    const limit = this.parent.describe();
    const night = JSON.stringify(this.night.shown);
    const bedtime = this.simulation.state.bedtime ? '1' : '0';
    const key = `${tutorial}|${limit}|${night}|${this.parentPanel.shownState}|${bedtime}`;
    if (key !== this.dayPublished) {
      this.dayPublished = key;
      markParent({ tutorial, parent: this.parentPanel.shownState, parentText: this.parentPanel.shownSentence, limit, night, bedtime });
    }
  }

  /** The resident being carried, for tests (`<html data-drag>`): who, where the finger is (CSS px) and the house under it. */
  private describeDrag(): string {
    const carried = this.buildTool.carried;
    if (!carried) {
      return '';
    }
    const view = this.controller.view;
    const size = this.controller.viewSize;
    const target = carried.target;
    return JSON.stringify({
      resident: carried.residentId,
      sx: Math.round((carried.at.x - view.centerX) * view.zoom + size.width / 2),
      sy: Math.round((carried.at.y - view.centerY) * view.zoom + size.height / 2),
      ...(target ? { house: target.houseId, result: target.result, used: target.used, capacity: target.capacity } : {}),
      ready: carried.ready,
    });
  }

  /**
   * The residents and boats for tests (`<html data-residents data-boats>`, once per tick): who, where they work and live,
   * what they do and carry, how they feel and why (M7), and where they are drawn – the feet in world px and the middle
   * of the body on the screen (CSS px), where a tap hits them – `icon` 1 while the good they carry shows over their
   * head, `sign` 1 while the heart or cloud of their mood shows and `glide` 1 while they glide after being let go
   * (Korrekturrunde 1).
   */
  private publishResidents(): void {
    const state = this.simulation.state;
    const view = this.controller.view;
    const size = this.controller.viewSize;
    const round = (value: number): number => Math.round(value * 10) / 10;
    const screen = (x: number, y: number): { sx: number; sy: number } => ({
      sx: round((x - view.centerX) * view.zoom + size.width / 2),
      sy: round((y - view.centerY) * view.zoom + size.height / 2),
    });
    const types = new Map(state.buildings.map((building) => [building.id, building.type]));
    const typeOf = (id: number | null): string => (id === null ? '' : (types.get(id) ?? ''));
    this.residentsText = JSON.stringify(
      state.residents.map((resident) => {
        const at = this.residentView.positionOf(resident.id);
        const factors = moodOf(state, resident);
        return {
          id: resident.id,
          name: resident.name,
          hat: resident.hat,
          job: typeOf(resident.job),
          home: typeOf(resident.home),
          activity: activityOf(resident, state),
          carrying: resident.carrying ?? '',
          timer: resident.timer,
          mood: factors.mood,
          reason: moodReason(factors),
          hungry: resident.hungry,
          homeId: resident.home,
          ...(at ? { x: round(at.x), y: round(at.y), ...screen(at.x, at.y - RESIDENT_BODY_Y), icon: at.carry ? 1 : 0, sign: at.sign ? 1 : 0, glide: at.glide ? 1 : 0 } : {}),
        };
      }),
    );
    this.boatsText = JSON.stringify(
      state.boats.map((boat) => ({ id: boat.id, passenger: boat.passenger, at: boat.at, shore: boat.shore, left: boat.route.length })),
    );
  }

  private showRing(tile: TileTapEvent): void {
    this.ringTween?.stop();
    this.ringFade?.stop();
    // At small zoom a tile is tiny on screen; the ring keeps a minimum size of about 44 CSS px.
    const zoom = this.controller.view.zoom;
    const diameter = Math.max(TILE_SIZE * 1.15, 44 / zoom);
    const base = diameter / (RING_SIZE * TEXTURE_SCALE * RING_OUTER_FRACTION);
    this.ring
      .setPosition((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE)
      .setVisible(true)
      .setAlpha(1)
      .setScale(base * 0.7);
    this.ringTween = this.tweens.add({
      targets: this.ring,
      scale: base * 1.1,
      duration: RING_MS,
      ease: 'Cubic.easeOut',
    });
    this.ringFade = this.tweens.add({
      targets: this.ring,
      alpha: 0,
      delay: RING_HOLD_MS,
      duration: RING_MS - RING_HOLD_MS,
      onComplete: () => this.ring.setVisible(false),
    });
  }
}

/** Number of land tiles that overlap the rectangle (world px). */
function countLandIn(world: Parameters<typeof landBounds>[0], rect: Rect): number {
  const x0 = Math.max(0, Math.floor(rect.x / TILE_SIZE));
  const x1 = Math.min(world.width - 1, Math.floor((rect.x + rect.width) / TILE_SIZE));
  const y0 = Math.max(0, Math.floor(rect.y / TILE_SIZE));
  const y1 = Math.min(world.height - 1, Math.floor((rect.y + rect.height) / TILE_SIZE));
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (isLand(terrainAt(world, x, y))) {
        count += 1;
      }
    }
  }
  return count;
}

/** The area that should be well visible at the start: all land plus a few tiles of water. */
function islandFocus(world: Parameters<typeof landBounds>[0]): Rect {
  const land = landBounds(world);
  const pad = CAMERA_CONFIG.startPaddingTiles;
  if (!land) {
    return { x: 0, y: 0, width: world.width * TILE_SIZE, height: world.height * TILE_SIZE };
  }
  return {
    x: (land.minX - pad) * TILE_SIZE,
    y: (land.minY - pad) * TILE_SIZE,
    width: (land.maxX - land.minX + 1 + 2 * pad) * TILE_SIZE,
    height: (land.maxY - land.minY + 1 + 2 * pad) * TILE_SIZE,
  };
}

/** Terrain as one letter per tile, row by row (for tests): w, s, g, f, r. */
function terrainLetters(world: Parameters<typeof landBounds>[0]): string {
  const letters = { water: 'w', sand: 's', grass: 'g', forest: 'f', rock: 'r' } as const;
  let text = '';
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      text += letters[terrainAt(world, x, y)];
    }
  }
  return text;
}

/** What the preview says, in a few characters (for tests). */
function describePreview(preview: Preview): string {
  switch (preview.kind) {
    case 'none':
      return 'none';
    case 'place':
      return `place:${preview.result}`;
    case 'path': {
      const count = (status: string): number => preview.tiles.filter((tile) => tile.status === status).length;
      return `path:ok=${String(count('ok'))},blocked=${String(count('blocked'))},existing=${String(count('existing'))}`;
    }
    case 'move':
      return preview.target ? `move:${preview.target.result}` : 'move:chosen';
    case 'demolish':
      return `demolish:${String(preview.tiles.length)}`;
    case 'invite':
      return `invite:${preview.result}`;
    case 'home':
      return `home:${preview.result}:${String(preview.used)}/${String(preview.capacity)}${preview.carried ? ':carried' : ''}${preview.waiting ? ':wait' : ''}`;
  }
}

/** The hand's target for the page marker: `spot:<name>`, `resident`, `place:<type>`, `pathStart`, `pathEnd` or `none`. */
function describeTarget(hint: TutorialHint): string {
  const target = hint.target;
  switch (target.kind) {
    case 'spot':
      return `spot:${target.name}`;
    case 'place':
      return `place:${target.typeId}`;
    case 'resident':
    case 'pathStart':
    case 'pathEnd':
    case 'none':
      return target.kind;
  }
}
