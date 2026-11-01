import Phaser from 'phaser';
import { CAMERA_CONFIG } from '../data/camera';
import { buildingType } from '../data/buildings';
import { buildingAt, isConnected } from '../sim/buildings';
import { activityOf } from '../sim/residents';
import { moodOf, workPaces } from '../sim/mood';
import { hash2 } from '../sim/random';
import type { GameSession } from '../save/session';
import type { Simulation } from '../sim/simulation';
import { isLand, landBounds, terrainAt, type Terrain } from '../sim/world';
import { BuildTool, type Preview } from '../ui/buildTool';
import { zoomLayout } from '../ui/buildLayout';
import { growRect, tileAtWorld, visibleRect, type CameraBounds, type Point, type Rect } from '../ui/cameraMath';
import { landRegions } from '../ui/cameraRegions';
import { FrameStats } from '../ui/frameStats';
import { simulationDelta } from '../ui/frameTime';
import { glideAllowed, landingGlide, rectGlide } from '../ui/boatCamera';
import { RESIDENT_BODY_Y, residentAt } from '../ui/residentHit';
import { moodReason } from '../ui/residentInfo';
import { RoundButton } from '../ui/RoundButton';
import { COLORS, TILE_SIZE, rgb } from '../ui/style';
import { onViewportChange, type ViewSize } from '../ui/viewport';
import { BuildUI } from './island/BuildUI';
import { GROUND_EDGE_PX, releaseGroundBlocks, blockArea, blockShown, blocksTouching, groundBlocks, paintGroundBlock, type GroundBlock } from './island/groundTexture';
import {
  GLINT_KEY,
  OBJECT_ORIGIN,
  RING_KEY,
  RING_OUTER_FRACTION,
  RING_SIZE,
  ROCK_KEYS,
  TEXTURE_SCALE,
  TREE_KEYS,
  registerIslandTextures,
} from './island/objectTextures';
import { LostOverlay } from './island/LostOverlay';
import { registerResidentTextures } from './island/residentTextures';
import { ResidentView } from './island/ResidentView';
import { VillageMenu } from './island/VillageMenu';
import { VillageView } from './island/VillageView';
import { WorldCameraController } from './island/WorldCameraController';
import { ISLAND_EVENTS, SCENES, type TileTapEvent } from './keys';
import { markActiveScene, markCamera, markPerf, markSave, markTap, markVillage } from './sceneMarker';

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
  private glideFor: 'boat' | 'house' | undefined;
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

  constructor(private readonly session: GameSession) {
    super(SCENES.island);
    this.simulation = session.simulation;
  }

  create(): void {
    markActiveScene(SCENES.island);

    const { seed, world } = this.simulation.state;
    registerIslandTextures(this);
    registerResidentTextures(this);
    // A restarted scene starts clean (the instance is reused).
    this.glints = [];
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
    this.village = new VillageView(this, this.worldLayer, this.simulation);
    this.village.sync();
    this.residentView = new ResidentView(this, this.worldLayer, this.simulation);
    this.buildTool = new BuildTool(
      () => this.simulation.state,
      (command) => {
        if (command.type === 'assignHome') {
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
      blocksPoint: (x, y) => this.lost.isOpen || this.menu.isOpen || this.buildUI.coversPoint(x, y),
      // The wheel is for the island only: not over panels, not while the menu or the shop covers it.
      blocksWheel: (x, y) => this.lost.isOpen || this.menu.isOpen || this.buildUI.shopOpen || this.buildUI.coversPoint(x, y) || this.buildUI.overMenuButton(x, y),
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
    this.menu = new VillageMenu(this, this.uiLayer, this.session, {
      touched: (time) => {
        this.buildUI.touched(time);
      },
      onReplaced: () => {
        // A new village from a file: the scene starts again and builds everything from the new state.
        this.scene.restart();
      },
    });
    // Last in the UI layer, so it covers everything: after another window took over the saving nothing may be built here.
    this.lost = new LostOverlay(this, this.uiLayer, () => {
      window.location.reload();
    });
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
      menuOpen: this.menu.isOpen,
      lostOpen: this.lost.isOpen,
      cardOpen: this.buildTool.cardOpen,
      gestureActive,
    });
    if (this.controller.glidingTo) {
      // A glide to the chosen house goes on while choosing (and stops with any touch or another tool).
      const keep = this.glideFor === 'house' ? this.houseGlideAllowed(gestureActive) : allowed;
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
    return this.buildTool.tool === 'home' && !gestureActive && !this.buildUI.shopOpen && !this.menu.isOpen && !this.lost.isOpen;
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
      paintGroundBlock(texture.getContext(), world, seed, block);
      texture.refresh();
      // Only the inner part is shown: the outermost pixels of a canvas are a little off and must not cover the neighbour.
      const shown = blockShown(block);
      texture.add('shown', 0, GROUND_EDGE_PX, GROUND_EDGE_PX, shown.width, shown.height);
      this.worldLayer.add(this.add.image(shown.x, shown.y, key, 'shown').setOrigin(0, 0).setDepth(0));
      this.groundBlocks.push({ block, key, texture });
    }
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
          this.drawnTerrain[y * world.width + x] = now;
        }
      }
    }
    if (changed.length === 0) {
      return;
    }
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
        paintGroundBlock(entry.texture.getContext(), world, seed, entry.block);
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

  /** A short touch on the world: announce the tile and show a soft ring on it. */
  private handleTap(world: Point, eventTime: number): void {
    // Right after ✓ or ✕ (double taps) a tap on the world must not start a new preview.
    if (this.lost.isOpen || this.menu.isOpen || this.buildUI.worldTapsPaused(eventTime)) {
      return;
    }
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
    if (this.lost.isOpen || this.menu.isOpen || this.buildUI.shopOpen || this.buildTool.tool !== 'view' || this.controller.view.zoom < GRAB_MIN_ZOOM) {
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
    if (this.controller.view.zoom >= GRAB_MIN_ZOOM || this.buildTool.tool !== 'view' || this.lost.isOpen || this.menu.isOpen || this.buildUI.shopOpen) {
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
      menuSpots: JSON.stringify(this.lost.isOpen ? this.lost.spots : this.menu.spots),
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
          activity: activityOf(resident),
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
