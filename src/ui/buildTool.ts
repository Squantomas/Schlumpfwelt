import { buildingType, typesOf, type BuildingCategory } from '../data/buildings';
import type { TextKey } from '../data/texts';
import {
  buildingAt,
  buildingAtPoint,
  checkPlacement,
  isConnected,
  isPath,
  type PlacementProblem,
  type PlacementView,
  type Tile,
} from '../sim/buildings';
import type { Command } from '../sim/commands';
import { findRoute, type RouteFailure } from '../sim/route';
import type { Point } from './cameraMath';
import { TILE_SIZE } from './style';

/**
 * The building tools without Phaser: which tool is on, what is chosen, what
 * the child has tapped so far (the "preview") and which commands ✓ sends.
 * Building works by tapping and confirming, never by dragging:
 *
 *   tool + variant → tap a tile (preview, green or red) → tap another tile
 *   (preview moves) → ✓ builds, ✕ cancels – the tool stays on.
 *
 * It only reads the simulation state (through `getState`) and sends commands
 * (through `send`); the scene draws whatever `preview()` says.
 */

export type ToolId = 'view' | 'path' | 'house' | 'deco' | 'move' | 'demolish';

/** The tools in the order of the toolbar (without "view", which is "no tool"). */
export const TOOLS: readonly Exclude<ToolId, 'view'>[] = ['path', 'house', 'deco', 'move', 'demolish'];

/**
 * Tools that place things of a category, and which category: the toolbar shows
 * the picker with all types of that category. A new category (M3: production
 * buildings) only needs a tool and a line here.
 */
export const TOOL_CATEGORIES: Readonly<Partial<Record<ToolId, BuildingCategory>>> = {
  house: 'house',
  deco: 'deco',
};

export interface PathPreviewTile extends Tile {
  /** `ok`: will be laid; `existing`: already a path; `blocked`: can not be laid there. */
  readonly status: 'ok' | 'existing' | 'blocked';
  /** Why a blocked end tile can not take a path. */
  readonly problem?: PlacementProblem;
}

export type Preview =
  | { readonly kind: 'none' }
  /** A house or decoration, top left tile (x, y). */
  | ({ readonly kind: 'place'; readonly typeId: string; readonly x: number; readonly y: number } & PlacementProblem)
  /** The route of a new path. `error` is set when there is none (blocked end, no way, too long). */
  | { readonly kind: 'path'; readonly tiles: readonly PathPreviewTile[]; readonly error?: RouteFailure }
  /** A chosen building and, once a tile was tapped, where it would go. */
  | {
      readonly kind: 'move';
      readonly id: number;
      readonly typeId: string;
      readonly from: Tile;
      readonly target?: { readonly x: number; readonly y: number } & PlacementProblem;
    }
  /** A building or path tile marked for demolition; `tiles` is everything that disappears. */
  | { readonly kind: 'demolish'; readonly tiles: readonly Tile[] };

type Pending =
  | { readonly kind: 'none' }
  /** `tile` is the tapped tile; the top left tile follows from it and the type (see {@link anchorFor}). */
  | { readonly kind: 'place'; readonly tile: Tile; readonly typeId: string }
  | { readonly kind: 'path'; readonly anchor: Tile; readonly target?: Tile }
  | { readonly kind: 'move'; readonly id: number; readonly target?: Tile }
  | { readonly kind: 'demolish'; readonly x: number; readonly y: number };

/**
 * The top left tile of a thing of the given type if the child tapped `tile`:
 * the tapped tile is its bottom row, in the middle (for even widths: the left
 * one) – so the finger does not cover the thing.
 */
export function anchorFor(typeId: string, tile: Tile): Tile {
  const type = buildingType(typeId);
  if (!type) {
    return tile;
  }
  return { x: tile.x - Math.floor((type.footprint.w - 1) / 2), y: tile.y - (type.footprint.h - 1) };
}

/** The sentence that explains why something can not be built there. */
export function problemHint(problem: PlacementProblem): TextKey | undefined {
  switch (problem.result) {
    case 'ok':
      return undefined;
    case 'blocked':
      return 'hint.occupied';
    case 'outOfMap':
      return 'hint.edge';
    case 'terrain':
      switch (problem.terrain) {
        case 'water':
          return 'hint.water';
        case 'forest':
          return 'hint.forest';
        case 'rock':
          return 'hint.rock';
        case 'sand':
          return 'hint.sand';
        case 'grass':
        case undefined:
          return 'hint.cantBuild';
      }
  }
}

export class BuildTool {
  private current: ToolId = 'view';
  private pending: Pending = { kind: 'none' };
  private readonly variants = new Map<ToolId, string>();
  private changes = 0;
  private cache: { readonly key: string; readonly preview: Preview } | undefined;

  constructor(
    private readonly getState: () => PlacementView,
    private readonly send: (command: Command) => void,
  ) {
    for (const [tool, category] of Object.entries(TOOL_CATEGORIES) as [ToolId, BuildingCategory][]) {
      this.variants.set(tool, typesOf(category)[0]?.id ?? '');
    }
  }

  /** Counts every change of tool, variant or preview (for redrawing). */
  get version(): number {
    return this.changes;
  }

  get tool(): ToolId {
    return this.current;
  }

  /** The chosen type of a tool that places things, `undefined` for the other tools. */
  get variant(): string | undefined {
    return this.variants.get(this.current);
  }

  /** The category the picker offers for the current tool (none for other tools). */
  get variantCategory(): BuildingCategory | undefined {
    return TOOL_CATEGORIES[this.current];
  }

  /**
   * Switches to a tool. Choosing the tool that is already on keeps it on (the
   * picker may open again); going back to "view" is {@link exitTool}.
   */
  selectTool(tool: ToolId): void {
    if (tool === this.current) {
      return;
    }
    this.current = tool;
    this.pending = { kind: 'none' };
    this.changes += 1;
  }

  /** Back to "view" (the ✕ in the hint bar). */
  exitTool(): void {
    this.current = 'view';
    this.pending = { kind: 'none' };
    this.changes += 1;
  }

  /** Chooses a variant for the current tool; a placed preview stays where it is and changes its type. */
  selectVariant(typeId: string): void {
    const category = this.variantCategory;
    if (category && buildingType(typeId)?.category === category) {
      this.variants.set(this.current, typeId);
      if (this.pending.kind === 'place') {
        this.pending = { ...this.pending, typeId };
      }
      this.changes += 1;
    }
  }

  /**
   * The short sentence that tells what to do now (`undefined` in "view"). A
   * red preview says why it does not work.
   */
  get hint(): TextKey | undefined {
    const problem = this.problemOf(this.preview());
    if (problem) {
      return problem;
    }
    switch (this.current) {
      case 'view':
        return undefined;
      case 'path':
        return this.pending.kind === 'path' ? 'hint.pathEnd' : 'hint.pathStart';
      case 'move':
        return this.pending.kind === 'move' ? 'hint.moveTarget' : 'hint.moveSelect';
      case 'demolish':
        return 'hint.demolish';
      case 'house':
      case 'deco':
        return 'hint.place';
    }
  }

  private problemOf(preview: Preview): TextKey | undefined {
    switch (preview.kind) {
      case 'place':
        return problemHint(preview);
      case 'move':
        return preview.target ? problemHint(preview.target) : undefined;
      case 'path': {
        if (preview.error === 'noRoute') {
          return 'hint.noRoute';
        }
        if (preview.error === 'tooLong') {
          return 'hint.routeTooLong';
        }
        const blocked = preview.tiles.find((tile) => tile.problem !== undefined);
        return blocked?.problem ? problemHint(blocked.problem) : undefined;
      }
      case 'none':
      case 'demolish':
        return undefined;
    }
  }

  /**
   * A tile was tapped; `world` is the tapped point in world pixels. Houses
   * are hit by their picture (a tap on a roof counts, although the tile under
   * the finger is behind the house). Returns a text key when the child should
   * get a short explanation ("Hier geht das nicht.").
   */
  tap(tile: Tile, world?: Point): TextKey | undefined {
    const state = this.getState();
    const building = world ? buildingAtPoint(state, world.x, world.y, TILE_SIZE) : buildingAt(state, tile.x, tile.y);
    const category = this.variantCategory;
    if (category) {
      this.pending = { kind: 'place', tile, typeId: this.variants.get(this.current) ?? '' };
      this.changes += 1;
      return undefined;
    }
    switch (this.current) {
      case 'view':
        return building && buildingType(building.type)?.needsPath && !isConnected(state, building.id) ? 'hint.needsPath' : undefined;
      case 'path':
        return this.tapPath(tile);
      case 'move':
        return this.tapMove(tile, building?.id);
      case 'demolish': {
        if (building) {
          this.pending = { kind: 'demolish', x: building.x, y: building.y };
        } else if (isPath(state, tile.x, tile.y)) {
          this.pending = { kind: 'demolish', x: tile.x, y: tile.y };
        } else {
          this.pending = { kind: 'none' };
          this.changes += 1;
          return 'hint.nothingToDemolish';
        }
        this.changes += 1;
        return undefined;
      }
      case 'house':
      case 'deco':
        return undefined;
    }
  }

  private tapPath(tile: Tile): TextKey | undefined {
    const pending = this.pending;
    if (pending.kind !== 'path' || (tile.x === pending.anchor.x && tile.y === pending.anchor.y)) {
      // First tap, or back to the first tile only.
      this.pending = { kind: 'path', anchor: pending.kind === 'path' ? pending.anchor : tile };
    } else {
      // Every other tap puts the end there.
      this.pending = { kind: 'path', anchor: pending.anchor, target: tile };
    }
    this.changes += 1;
    return undefined;
  }

  private tapMove(tile: Tile, buildingId: number | undefined): TextKey | undefined {
    const state = this.getState();
    const pending = this.pending;
    // Another building than the chosen one: choose that one instead.
    if (buildingId !== undefined && !(pending.kind === 'move' && pending.id === buildingId)) {
      this.pending = { kind: 'move', id: buildingId };
      this.changes += 1;
      return undefined;
    }
    this.changes += 1;
    if (pending.kind === 'move') {
      const typeId = state.buildings.find((b) => b.id === pending.id)?.type ?? '';
      this.pending = { kind: 'move', id: pending.id, target: anchorFor(typeId, tile) };
      return undefined;
    }
    this.pending = { kind: 'none' };
    return isPath(state, tile.x, tile.y) ? 'hint.pathNoMove' : 'hint.nothingToMove';
  }

  /** What to show right now, computed from the pending taps and the current state (cached until something changes). */
  preview(): Preview {
    const key = `${String(this.changes)}|${String(this.getState().revision)}`;
    if (this.cache?.key !== key) {
      this.cache = { key, preview: this.computePreview() };
    }
    return this.cache.preview;
  }

  private computePreview(): Preview {
    const state = this.getState();
    const pending = this.pending;
    switch (pending.kind) {
      case 'none':
        return { kind: 'none' };
      case 'place': {
        const anchor = anchorFor(pending.typeId, pending.tile);
        return { kind: 'place', typeId: pending.typeId, x: anchor.x, y: anchor.y, ...checkPlacement(state, pending.typeId, anchor.x, anchor.y) };
      }
      case 'path': {
        const tileOf = (tile: Tile): PathPreviewTile => {
          if (isPath(state, tile.x, tile.y)) {
            return { ...tile, status: 'existing' };
          }
          const problem = checkPlacement(state, 'path', tile.x, tile.y);
          return problem.result === 'ok' ? { ...tile, status: 'ok' } : { ...tile, status: 'blocked', problem };
        };
        if (!pending.target) {
          return { kind: 'path', tiles: [tileOf(pending.anchor)] };
        }
        const route = findRoute(state, pending.anchor, pending.target);
        if (route.ok) {
          return { kind: 'path', tiles: route.tiles.map(tileOf) };
        }
        if (route.reason === 'startBlocked' || route.reason === 'endBlocked') {
          // The red end says why (water, forest, a house …).
          return { kind: 'path', tiles: [tileOf(pending.anchor), tileOf(pending.target)], error: route.reason };
        }
        const blocked = (tile: Tile): PathPreviewTile => ({ ...tile, status: 'blocked' });
        return { kind: 'path', tiles: [blocked(pending.anchor), blocked(pending.target)], error: route.reason };
      }
      case 'move': {
        const building = state.buildings.find((b) => b.id === pending.id);
        if (!building) {
          return { kind: 'none' };
        }
        const target = pending.target;
        return {
          kind: 'move',
          id: building.id,
          typeId: building.type,
          from: { x: building.x, y: building.y },
          ...(target ? { target: { x: target.x, y: target.y, ...checkPlacement(state, building.type, target.x, target.y, building.id) } } : {}),
        };
      }
      case 'demolish': {
        const building = buildingAt(state, pending.x, pending.y);
        const type = building ? buildingType(building.type) : undefined;
        if (building && type) {
          const tiles: Tile[] = [];
          for (let dy = 0; dy < type.footprint.h; dy += 1) {
            for (let dx = 0; dx < type.footprint.w; dx += 1) {
              tiles.push({ x: building.x + dx, y: building.y + dy });
            }
          }
          return { kind: 'demolish', tiles };
        }
        return isPath(state, pending.x, pending.y) ? { kind: 'demolish', tiles: [{ x: pending.x, y: pending.y }] } : { kind: 'none' };
      }
    }
  }

  /** Is there something ✓ can do right now? */
  get canConfirm(): boolean {
    const preview = this.preview();
    switch (preview.kind) {
      case 'none':
        return false;
      case 'place':
        return preview.result === 'ok';
      case 'path':
        return preview.error === undefined && preview.tiles.some((tile) => tile.status === 'ok');
      case 'move':
        return preview.target !== undefined && preview.target.result === 'ok' && (preview.target.x !== preview.from.x || preview.target.y !== preview.from.y);
      case 'demolish':
        return true;
    }
  }

  /** Is there a preview (so ✓ and ✕ are shown)? */
  get hasPreview(): boolean {
    return this.preview().kind !== 'none';
  }

  /**
   * ✓: sends the command for the preview. The tool stays on, the preview is
   * gone. Returns a text key when nothing could be built.
   */
  confirm(): TextKey | undefined {
    const preview = this.preview();
    if (preview.kind === 'none') {
      return undefined;
    }
    if (!this.canConfirm) {
      return this.problemOf(preview) ?? 'hint.cantBuild';
    }
    switch (preview.kind) {
      case 'place':
        this.send({ type: 'placeBuilding', buildingType: preview.typeId, x: preview.x, y: preview.y });
        break;
      case 'path':
        this.send({ type: 'placePaths', tiles: preview.tiles.filter((tile) => tile.status === 'ok').map(({ x, y }) => ({ x, y })) });
        break;
      case 'move':
        if (preview.target) {
          this.send({ type: 'moveBuilding', id: preview.id, x: preview.target.x, y: preview.target.y });
        }
        break;
      case 'demolish': {
        const tile = preview.tiles[0];
        if (tile) {
          this.send({ type: 'demolish', x: tile.x, y: tile.y });
        }
        break;
      }
    }
    this.pending = { kind: 'none' };
    this.changes += 1;
    return undefined;
  }

  /** ✕: drops the preview; the tool stays on. */
  cancel(): void {
    this.pending = { kind: 'none' };
    this.changes += 1;
  }

  /**
   * Call when the simulation changed: a preview that points at something that
   * is gone (a demolished or moved building) is dropped.
   */
  refresh(): void {
    if (this.pending.kind !== 'none' && this.preview().kind === 'none') {
      this.pending = { kind: 'none' };
    }
    this.changes += 1;
  }
}
