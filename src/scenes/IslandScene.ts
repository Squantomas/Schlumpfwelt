import Phaser from 'phaser';
import { t } from '../data/texts';
import type { Simulation } from '../sim/simulation';
import { createLabel, setLabelSize } from '../ui/label';
import { COLORS, clamp, rgb } from '../ui/style';
import { onViewportChange, type ViewSize } from '../ui/viewport';
import { SCENES } from './keys';
import { markActiveScene } from './sceneMarker';

/** The island is drawn at this radius and scaled to the screen. */
const BASE_RADIUS = 100;
/** Outer edge of the shallow water around the island, relative to the grass radius. */
const SHALLOW_FACTOR = 1.35;
const WAVE_COUNT = 3;

/**
 * "Hallo Insel": a round placeholder island in the sea.
 *
 * This scene drives the simulation – `simulation.update()` is called here and
 * nowhere else. The display only reads the state; the waves are drawn from the
 * smooth simulation time `(tick + alpha) * tickMs`, so they move fluidly
 * although the simulation only ticks 10 times per second, and stand still
 * while the simulation is paused.
 */
export class IslandScene extends Phaser.Scene {
  private readonly simulation: Simulation;
  private waves!: Phaser.GameObjects.Graphics;
  private island!: Phaser.GameObjects.Container;
  private islandRadius = BASE_RADIUS;

  constructor(simulation: Simulation) {
    super(SCENES.island);
    this.simulation = simulation;
  }

  create(): void {
    markActiveScene(SCENES.island);

    this.waves = this.add.graphics();
    this.island = this.add.container(0, 0, [drawIsland(this)]);
    const greeting = createLabel(this, t('island.greeting'), 64);

    onViewportChange(this, ({ width, height }: ViewSize) => {
      const m = Math.min(width, height);
      const gap = m * 0.04;

      setLabelSize(greeting, clamp(m * 0.11, 34, 112), width * 0.9);
      greeting.setPosition(width / 2, Math.max(12, height * 0.05) + greeting.height / 2);

      const top = greeting.y + greeting.height / 2 + gap;
      const available = Math.max(1, height - top - gap);
      this.islandRadius = clamp(Math.min(width * 0.46, available * 0.5) / SHALLOW_FACTOR, 40, 520);
      this.island.setPosition(width / 2, top + available / 2).setScale(this.islandRadius / BASE_RADIUS);
    });

    this.cameras.main.fadeIn(300, ...rgb(COLORS.water));
  }

  override update(_time: number, delta: number): void {
    const alpha = this.simulation.update(delta);
    const seconds = ((this.simulation.state.tick + alpha) * this.simulation.tickMs) / 1000;
    this.drawWaves(seconds);
  }

  /** Foam rings that slowly drift away from the beach and fade out. */
  private drawWaves(seconds: number): void {
    const r = this.islandRadius;
    const g = this.waves.clear();
    for (let i = 0; i < WAVE_COUNT; i += 1) {
      const progress = (seconds * 0.2 + i / WAVE_COUNT) % 1;
      const opacity = 0.6 * (1 - progress) * Math.min(1, progress * 5);
      g.lineStyle(Math.max(2, r * 0.03), COLORS.foam, opacity);
      g.strokeCircle(this.island.x, this.island.y, r * (SHALLOW_FACTOR + 0.05 + progress * 0.45));
    }
  }
}

/** Placeholder island from simple shapes, centred on (0, 0) with radius {@link BASE_RADIUS}. */
function drawIsland(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const R = BASE_RADIUS;
  const g = scene.add.graphics();

  g.fillStyle(COLORS.waterShallow).fillCircle(0, 0, R * SHALLOW_FACTOR);
  g.fillStyle(COLORS.sandShade).fillCircle(0, R * 0.05, R * 1.13);
  g.fillStyle(COLORS.sand).fillCircle(0, 0, R * 1.12);
  g.fillStyle(COLORS.grassShade).fillCircle(0, R * 0.04, R * 0.95);
  g.fillStyle(COLORS.grass).fillCircle(0, 0, R * 0.94);

  const flowers: readonly [number, number][] = [
    [-0.15, 0.2],
    [0.1, 0.55],
    [0.55, -0.05],
    [-0.6, 0.05],
    [-0.05, -0.15],
  ];
  for (const [x, y] of flowers) {
    g.fillStyle(COLORS.flower).fillCircle(x * R, y * R, R * 0.045);
    g.fillStyle(COLORS.flowerCenter).fillCircle(x * R, y * R, R * 0.02);
  }

  // Sorted top to bottom, so lower trees overlap the ones behind them.
  const trees: readonly [number, number, number][] = [
    [0.3, -0.55, 1],
    [-0.4, -0.45, 1.15],
    [0.62, 0.3, 0.9],
    [-0.42, 0.5, 1],
  ];
  for (const [x, y, size] of trees) {
    drawTree(g, x * R, y * R, R * 0.17 * size);
  }
  return g;
}

function drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, crown: number): void {
  g.fillStyle(COLORS.grassShade).fillEllipse(x, y + crown * 1.25, crown * 1.6, crown * 0.5);
  g.fillStyle(COLORS.treeTrunk).fillRoundedRect(x - crown * 0.22, y, crown * 0.44, crown * 1.2, crown * 0.12);
  g.fillStyle(COLORS.treeCrown).fillCircle(x, y - crown * 0.1, crown);
  g.fillStyle(COLORS.treeCrownLight).fillCircle(x - crown * 0.35, y - crown * 0.45, crown * 0.4);
}
