import { buildingType, typesOf } from '../data/buildings';
import type { TextKey } from '../data/texts';
import {
  buildingAt,
  canPlace,
  isConnected,
  isPath,
  lineTiles,
  type PlacementResult,
  type PlacementView,
  type Tile,
} from '../sim/buildings';
import type { Command } from '../sim/commands';

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

export interface PathPreviewTile extends Tile {
  /** `ok`: will be laid; `existing`: already a path; `blocked`: can not be laid there. */
  readonly status: 'ok' | 'existing' | 'blocked';
  /** Why a blocked tile can not take a path. */
  readonly reason?: PlacementResult;
}

export type Preview =
  | { readonly kind: 'none' }
  /** A house or decoration, top left tile (x, y). */
  | { readonly kind: 'place'; readonly typeId: string; readonly x: number; readonly y: number; readonly result: PlacementResult }
  | { readonly kind: 'path'; readonly tiles: readonly PathPreviewTile[] }
  /** A chosen building and, once a tile was tapped, where it would go. */
  | {
      readonly kind: 'move';
      readonly id: number;
      readonly typeId: string;
      readonly from: Tile;
      readonly target?: { readonly x: number; readonly y: number; readonly result: PlacementResult };
    }
  /** A building or path tile marked for demolition; `tiles` is everything that disappears. */
  | { readonly kind: 'demolish'; readonly tiles: readonly Tile[] };

type Pending =
  | { readonly kind: 'none' }
  | { readonly kind: 'place'; readonly x: number; readonly y: number }
  | { readonly kind: 'path'; readonly anchor: Tile; readonly target?: Tile; readonly horizontalFirst: boolean }
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

export class BuildTool {
  private current: ToolId = 'view';
  private pending: Pending = { kind: 'none' };
  private readonly variants: Record<'house' | 'deco', string>;
  private changes = 0;

  constructor(
    private readonly getState: () => PlacementView,
    private readonly send: (command: Command) => void,
  ) {
    this.variants = {
      house: typesOf('house')[0]?.id ?? '',
      deco: typesOf('deco')[0]?.id ?? '',
    };
  }

  /** Counts every change of tool, variant or preview (for redrawing). */
  get version(): number {
    return this.changes;
  }

  get tool(): ToolId {
    return this.current;
  }

  /** The chosen type of the house or deco tool, `undefined` for the other tools. */
  get variant(): string | undefined {
    return this.current === 'house' || this.current === 'deco' ? this.variants[this.current] : undefined;
  }

  /** The variants the picker offers for the current tool (empty for other tools). */
  get variantCategory(): 'house' | 'deco' | undefined {
    return this.current === 'house' || this.current === 'deco' ? this.current : undefined;
  }

  /** Switches to a tool; choosing the active tool again goes back to "view". */
  selectTool(tool: ToolId): void {
    this.current = tool === this.current ? 'view' : tool;
    this.pending = { kind: 'none' };
    this.changes += 1;
  }

  /** Back to "view" (the ✕ in the hint bar). */
  exitTool(): void {
    this.current = 'view';
    this.pending = { kind: 'none' };
    this.changes += 1;
  }

  /** Chooses a variant for the house or deco tool; a placed preview stays where it is. */
  selectVariant(typeId: string): void {
    const category = this.variantCategory;
    if (category && buildingType(typeId)?.category === category) {
      this.variants[category] = typeId;
      this.changes += 1;
    }
  }

  /** The short sentence that tells what to do now (`undefined` in "view"). */
  get hint(): TextKey | undefined {
    switch (this.current) {
      case 'view':
        return undefined;
      case 'path':
        return this.pending.kind === 'path' ? 'hint.pathEnd' : 'hint.pathStart';
      case 'house':
      case 'deco':
        return 'hint.place';
      case 'move':
        return this.pending.kind === 'move' ? 'hint.moveTarget' : 'hint.moveSelect';
      case 'demolish':
        return 'hint.demolish';
    }
  }

  /**
   * A tile was tapped. Returns a text key when the child should get a short
   * explanation ("Hier geht das nicht.").
   */
  tap(tile: Tile): TextKey | undefined {
    const state = this.getState();
    switch (this.current) {
      case 'view': {
        const building = buildingAt(state, tile.x, tile.y);
        if (building && buildingType(building.type)?.needsPath && !isConnected(state, building.id)) {
          return 'hint.needsPath';
        }
        return undefined;
      }
      case 'house':
      case 'deco': {
        const typeId = this.variants[this.current];
        const anchor = anchorFor(typeId, tile);
        this.pending = { kind: 'place', x: anchor.x, y: anchor.y };
        this.changes += 1;
        return undefined;
      }
      case 'path':
        return this.tapPath(tile);
      case 'move':
        return this.tapMove(tile);
      case 'demolish': {
        const building = buildingAt(state, tile.x, tile.y);
        if (!building && !isPath(state, tile.x, tile.y)) {
          this.pending = { kind: 'none' };
          this.changes += 1;
          return 'hint.nothingToDemolish';
        }
        this.pending = { kind: 'demolish', x: tile.x, y: tile.y };
        this.changes += 1;
        return undefined;
      }
    }
  }

  private tapPath(tile: Tile): TextKey | undefined {
    const pending = this.pending;
    if (pending.kind !== 'path') {
      this.pending = { kind: 'path', anchor: tile, horizontalFirst: true };
    } else if (tile.x === pending.anchor.x && tile.y === pending.anchor.y) {
      // Back to the first tile only.
      this.pending = { kind: 'path', anchor: tile, horizontalFirst: true };
    } else if (pending.target && tile.x === pending.target.x && tile.y === pending.target.y) {
      // Tapping the end again turns the corner the other way round.
      this.pending = { ...pending, horizontalFirst: !pending.horizontalFirst };
    } else {
      this.pending = { kind: 'path', anchor: pending.anchor, target: tile, horizontalFirst: true };
    }
    this.changes += 1;
    return undefined;
  }

  private tapMove(tile: Tile): TextKey | undefined {
    const state = this.getState();
    const building = buildingAt(state, tile.x, tile.y);
    const pending = this.pending;
    // Another building than the chosen one: choose that one instead.
    if (building && !(pending.kind === 'move' && pending.id === building.id)) {
      this.pending = { kind: 'move', id: building.id };
      this.changes += 1;
      return undefined;
    }
    if (pending.kind === 'move') {
      const typeId = buildingTypeOf(state, pending.id);
      this.pending = { kind: 'move', id: pending.id, target: anchorFor(typeId, tile) };
      this.changes += 1;
      return undefined;
    }
    this.changes += 1;
    this.pending = { kind: 'none' };
    return isPath(state, tile.x, tile.y) ? 'hint.pathNoMove' : 'hint.nothingToMove';
  }

  /** What to show right now, computed from the pending taps and the current state. */
  preview(): Preview {
    const state = this.getState();
    const pending = this.pending;
    switch (pending.kind) {
      case 'none':
        return { kind: 'none' };
      case 'place': {
        const typeId = this.variants[this.current === 'deco' ? 'deco' : 'house'];
        return { kind: 'place', typeId, x: pending.x, y: pending.y, result: canPlace(state, typeId, pending.x, pending.y) };
      }
      case 'path': {
        const line = pending.target ? lineTiles(pending.anchor, pending.target, pending.horizontalFirst) : [pending.anchor];
        const tiles = line.map((tile): PathPreviewTile => {
          if (isPath(state, tile.x, tile.y)) {
            return { ...tile, status: 'existing' };
          }
          const result = canPlace(state, 'path', tile.x, tile.y);
          return result === 'ok' ? { ...tile, status: 'ok' } : { ...tile, status: 'blocked', reason: result };
        });
        return { kind: 'path', tiles };
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
          ...(target ? { target: { x: target.x, y: target.y, result: canPlace(state, building.type, target.x, target.y, building.id) } } : {}),
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
        return preview.tiles.some((tile) => tile.status === 'ok');
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
      return 'hint.cantBuild';
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

function buildingTypeOf(state: PlacementView, id: number): string {
  return state.buildings.find((b) => b.id === id)?.type ?? '';
}
