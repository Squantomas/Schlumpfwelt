import { buildingType, shopCategoryOf, type ShopCategory } from '../data/buildings';
import type { TextKey, TextParams } from '../data/texts';
import {
  buildingAt,
  buildingAtPoint,
  checkPlacement,
  isConnected,
  isPath,
  wouldBeConnected,
  type PlacedBuilding,
  type PlacementProblem,
  type PlacementView,
  type Tile,
} from '../sim/buildings';
import { placementCommand, type Command } from '../sim/commands';
import { plantedRefund, plantedTypeAt } from '../sim/island';
import type { DeepReadonly } from '../sim/readonly';
import type { SimState } from '../sim/state';
import { ITEM_IDS } from '../data/goods';
import { canAfford, missingFor, refundFor } from '../sim/economy';
import { findRoute, type RouteFailure } from '../sim/route';
import { checkHome, checkInvite, type HomeResult, type InviteResult } from '../sim/residents';
import { isUnlocked } from '../sim/unlocks';
import { terrainAt, type Terrain } from '../sim/world';
import type { Point } from './cameraMath';
import { listText, missingParams, totalUnits } from './costText';
import { ResidentDrag, houseAtPoint, type DropResult } from './residentDrag';
import { TILE_SIZE } from './style';

/**
 * The building tools without Phaser: which tool is on, what is chosen, what
 * the child has tapped so far (the "preview") and which commands ✓ sends.
 * Building works by tapping and confirming, never by dragging:
 *
 *   shop item → tap a tile (preview, green or red) → tap another tile
 *   (preview moves) → ✓ builds, ✕ cancels – the item stays chosen.
 *
 * It only reads the simulation state (through `getState`) and sends commands
 * (through `send`); the scene draws whatever `preview()` says.
 *
 * Moving house (M7) works both ways: by carrying a resident onto a house while
 * looking (the one exception to "never by dragging", see {@link ResidentDrag})
 * or by tapping: "Umziehen" on the resident's card → tap a house (green with
 * room, red when full) → ✓.
 */

/** What the tools read: the placement rules' view plus the working state (for refunds), the tick (for the cards) and the residents (M6). */
export type BuildToolState = PlacementView & DeepReadonly<Pick<SimState, 'production' | 'tick' | 'earnedCoins' | 'residents' | 'boats' | 'nextResidentId'>>;

/** `home` (M7): choosing a new house for a resident (reached by "Umziehen" on their card). */
export type ToolId = 'view' | 'path' | 'shop' | 'place' | 'move' | 'demolish' | 'home';

/** The tools that have a button in the toolbar. */
export type ToolbarToolId = Exclude<ToolId, 'view' | 'place' | 'home'>;

/**
 * The buttons of the toolbar, in order (without "view", which is "no tool",
 * "place", which is reached by choosing something in the shop, and "home",
 * which is reached from a resident's card): the shop replaces the three buy
 * tools of M2/M3 (house, building, deco).
 */
export const TOOLS: readonly ToolbarToolId[] = ['path', 'shop', 'move', 'demolish'];

export interface PathPreviewTile extends Tile {
  /** `ok`: will be laid; `existing`: already a path; `blocked`: can not be laid there. */
  readonly status: 'ok' | 'existing' | 'blocked';
  /** Why a blocked end tile can not take a path. */
  readonly problem?: PlacementProblem;
}

export type Preview =
  | { readonly kind: 'none' }
  /** A house or decoration, top left tile (x, y). */
  | ({ readonly kind: 'place'; readonly typeId: string; readonly x: number; readonly y: number; readonly connected: boolean } & PlacementProblem)
  /** The route of a new path. `error` is set when there is none (blocked end, no way, too long). */
  | { readonly kind: 'path'; readonly tiles: readonly PathPreviewTile[]; readonly error?: RouteFailure }
  /** A chosen building and, once a tile was tapped, where it would go. */
  | {
      readonly kind: 'move';
      readonly id: number;
      readonly typeId: string;
      readonly from: Tile;
      readonly target?: { readonly x: number; readonly y: number; readonly connected: boolean } & PlacementProblem;
    }
  /** A building or path tile marked for demolition; `tiles` is everything that disappears, `refund` what the player gets back. */
  | { readonly kind: 'demolish'; readonly tiles: readonly Tile[]; readonly refund: Readonly<Record<string, number>> }
  /** Inviting a resident (M6): no place to tap, ✓ sends the boat. `home` is the house they would move into, `missing` what coins are missing. */
  | {
      readonly kind: 'invite';
      readonly typeId: string;
      readonly result: InviteResult;
      readonly home?: number;
      readonly missing?: Readonly<Record<string, number>>;
    }
  /**
   * A new home for a resident (M7): the house tapped with the tool "home", or the house under the finger while a
   * resident is carried (`carried`: no ✓ / ✕ then, letting go decides). `used` / `capacity` for the "2/2".
   * `waiting`: a carried resident over a house with room, but the finger has not stayed there long enough yet (see
   * `DROP_DWELL_MS`) – letting go now would move nobody, so it is not green yet.
   */
  | {
      readonly kind: 'home';
      readonly residentId: number;
      readonly houseId: number;
      readonly result: HomeResult;
      readonly used: number;
      readonly capacity: number;
      readonly carried: boolean;
      readonly waiting: boolean;
    };

type Pending =
  | { readonly kind: 'none' }
  /** `tile` is the tapped tile; the top left tile follows from it and the type (see {@link anchorFor}). */
  | { readonly kind: 'place'; readonly tile: Tile; readonly typeId: string }
  | { readonly kind: 'path'; readonly anchor: Tile; readonly target?: Tile }
  | { readonly kind: 'move'; readonly id: number; readonly target?: Tile }
  | { readonly kind: 'demolish'; readonly x: number; readonly y: number }
  | { readonly kind: 'invite'; readonly typeId: string }
  | { readonly kind: 'home'; readonly houseId: number };

/** What letting go of a carried resident says (a short notice), if anything. */
export interface DropNotice {
  readonly key: TextKey;
  readonly params: TextParams;
}

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

/**
 * The sentence that explains why something can not be built there. `typeId`
 * (optional) is the thing that was meant: island items say it in their own
 * words ("Das geht nur auf der Wiese.").
 */
export function problemHint(problem: PlacementProblem, forPath = false, typeId?: string): TextKey | undefined {
  switch (problem.result) {
    case 'ok':
      return undefined;
    case 'locked':
      return 'hint.locked';
    case 'noCoast':
      return 'hint.islandNoCoast';
    case 'full':
      return 'hint.full';
    case 'blocked':
      return 'hint.occupied';
    case 'outOfMap':
      return 'hint.edge';
    case 'noNearby':
      return problem.terrain === 'rock' ? 'hint.noRock' : 'hint.noForest';
    case 'cost':
      return totalUnits(problem.missing ?? {}) === 1 ? 'hint.missingOne' : 'hint.missing';
    case 'terrain': {
      const island = typeId === undefined ? undefined : islandHint(typeId, problem.terrain);
      if (island) {
        return island;
      }
      switch (problem.terrain) {
        case 'water':
          return 'hint.water';
        case 'forest':
          return forPath ? 'hint.forestPath' : 'hint.forest';
        case 'rock':
          return forPath ? 'hint.rockPath' : 'hint.rock';
        case 'sand':
          return 'hint.sand';
        case 'grass':
        case undefined:
          return 'hint.cantBuild';
      }
    }
  }
}

/** The sentence that says where to tap for the item that is being placed. */
function placeHint(typeId: string | undefined): TextKey {
  const action = buildingType(typeId ?? '')?.island?.action;
  if (action === 'fillLand') {
    return 'hint.placeWater';
  }
  return action === 'makeMeadow' ? 'hint.placeSand' : 'hint.place';
}

/** What an island item says when the ground under it is wrong (`undefined`: not an island item). */
function islandHint(typeId: string, terrain: Terrain | undefined): TextKey | undefined {
  switch (buildingType(typeId)?.island?.action) {
    case 'plantTree':
    case 'placeRock':
      // On water the plain "Hier ist Wasser." says it best; a tree or rock already there is "occupied".
      return terrain === 'water' ? 'hint.water' : terrain === 'forest' || terrain === 'rock' ? 'hint.occupied' : 'hint.islandGrassOnly';
    case 'fillLand':
      return 'hint.islandWaterOnly';
    case 'makeMeadow':
      return terrain === 'water' ? 'hint.water' : 'hint.islandSandOnly';
    case undefined:
      return undefined;
  }
}

/** The values for the placeholders of the hint of a problem (`{list}` of the missing amounts for `cost`). */
export function problemParams(problem: PlacementProblem): TextParams | undefined {
  return problem.result === 'cost' ? missingParams(problem.missing ?? {}) : undefined;
}

/** A demolished building and what the player got back for it (for the little display where it stood). */
export interface RefundInfo {
  /** The tile that was demolished (top left of the building). */
  readonly at: Tile;
  readonly refund: Readonly<Record<string, number>>;
}

export class BuildTool {
  private current: ToolId = 'view';
  private pending: Pending = { kind: 'none' };
  /** The shop item that is being placed (while the tool is `place`; kept while the shop is open from there). */
  private chosen: string | undefined;
  /** What the shop returns to when it is closed with ✕. */
  private backTo: 'view' | 'place' = 'view';
  private tab: ShopCategory = 'houses';
  /** How many unlocked types the player has been told about (the message "Neu im Shop"). */
  private readonly announced: Set<string>;
  /** How many unlocked types the player has seen in the shop (the star on the shop button). */
  private readonly seenInShop: Set<string>;
  /** The types that were unlocked since the shop was last open: their cards carry a star. */
  private fresh = new Set<string>();
  private changes = 0;
  private cache: { readonly key: string; readonly preview: Preview } | undefined;
  private inspected: number | undefined;
  /** The resident whose card is open (M6; only while looking; never together with a building's card). */
  private inspectedResident: number | undefined;
  /** Has the child chosen a card since the tool was switched on (or the last ✓)? Only then a card it can not pay says what is missing. */
  private variantChosen = false;
  private lastStoreKey = 0;
  /** The resident who gets a new home with the tool "home" (M7). */
  private mover: number | undefined;
  /** Carrying a resident onto a house while looking (M7). */
  private readonly drag: ResidentDrag;

  /** `onRefund` is called when ✓ demolishes a building that gives something back (for the little "+10" display). */
  constructor(
    private readonly getState: () => BuildToolState,
    private readonly send: (command: Command) => void,
    private readonly onRefund?: (info: RefundInfo) => void,
  ) {
    // By id, not by position in the list: a state that is loaded (M5) must not announce what it already had.
    this.announced = new Set(this.getState().unlocked);
    this.seenInShop = new Set(this.getState().unlocked);
    this.lastStoreKey = this.storeKey();
    this.drag = new ResidentDrag(this.getState, this.send);
  }

  /**
   * Looks at the store: while a building tool is on, a change of any amount counts as a change of the tool (for redrawing),
   * so a preview that was red because something was missing turns green when it arrives, and the other way round.
   * Call once per frame before reading {@link version}. (`preview()` also knows the store by itself.)
   */
  sync(): void {
    const key = this.storeKey();
    if (key !== this.lastStoreKey) {
      this.lastStoreKey = key;
      if (this.current !== 'view') {
        this.changes += 1;
      }
    }
    // Things unlocked while the shop is open count as seen at once, but their cards carry the star.
    if (this.current === 'shop') {
      this.markShopSeen();
    }
  }

  /** Counts every change of tool, variant, preview, carried resident and (see {@link sync}) store, for redrawing. */
  get version(): number {
    return this.changes + this.drag.version;
  }

  /** A number that changes when the amount of something in the store changes (no allocation, called every frame). */
  private storeKey(): number {
    const { inventory } = this.getState();
    let key = 17;
    for (const id of ITEM_IDS) {
      key = (Math.imul(key, 31) + (inventory[id] ?? 0)) | 0;
    }
    return key;
  }

  get tool(): ToolId {
    return this.current;
  }

  /** The shop item that is being placed, `undefined` for the other tools. */
  get item(): string | undefined {
    return this.current === 'place' ? this.chosen : undefined;
  }

  /**
   * Switches to a tool of the toolbar. `shop` opens the shop. Choosing the
   * tool that is already on keeps it on; going back to "view" is {@link exitTool}.
   * Items are placed with {@link chooseItem}, so `place` can not be selected here.
   */
  selectTool(tool: ToolId): void {
    if (tool === this.current || tool === 'place' || tool === 'home') {
      return;
    }
    this.drag.cancel();
    this.mover = undefined;
    if (tool === 'shop') {
      this.openShop();
      return;
    }
    this.current = tool;
    this.chosen = undefined;
    this.pending = { kind: 'none' };
    this.inspected = undefined;
    this.inspectedResident = undefined;
    this.variantChosen = false;
    this.changes += 1;
  }

  /** Back to "view" (the ✕ in the hint bar). Leaving "home" opens the card of that resident again. */
  exitTool(): void {
    if (this.current === 'home' && this.mover !== undefined && this.getState().residents.some((r) => r.id === this.mover)) {
      this.inspectedResident = this.mover;
      this.inspected = undefined;
    }
    this.mover = undefined;
    this.current = 'view';
    this.chosen = undefined;
    this.pending = { kind: 'none' };
    this.changes += 1;
  }

  // --- The shop ---

  get shopOpen(): boolean {
    return this.current === 'shop';
  }

  /** The tab of the shop that is shown (the shop opens on the tab of the item that was placed last). */
  get shopTab(): ShopCategory {
    return this.tab;
  }

  setShopTab(category: ShopCategory): void {
    if (category !== this.tab) {
      this.tab = category;
      this.changes += 1;
    }
  }

  /**
   * Opens the shop. A place that was tapped while placing an item is kept (but
   * hidden by the shop): ✕ in the shop ({@link closeShop}) goes back to it,
   * and choosing another item puts that one on the same place.
   */
  openShop(): void {
    if (this.current === 'shop') {
      return;
    }
    this.backTo = this.current === 'place' && this.chosen !== undefined ? 'place' : 'view';
    this.drag.cancel();
    this.mover = undefined;
    this.current = 'shop';
    if (this.backTo !== 'place') {
      this.pending = { kind: 'none' };
    }
    this.inspected = undefined;
    this.inspectedResident = undefined;
    this.fresh = new Set(this.getState().unlocked.filter((id) => !this.seenInShop.has(id)));
    this.markShopSeen();
    this.changes += 1;
  }

  /** ✕ in the shop: back to what was on before (placing the chosen item, or looking). */
  closeShop(): void {
    if (this.current !== 'shop') {
      return;
    }
    this.current = this.backTo === 'place' && this.chosen !== undefined ? 'place' : 'view';
    if (this.current === 'view') {
      this.chosen = undefined;
    }
    this.fresh = new Set();
    this.changes += 1;
  }

  private markShopSeen(): void {
    const unlocked = this.getState().unlocked;
    for (const id of unlocked) {
      if (!this.seenInShop.has(id)) {
        this.seenInShop.add(id);
        this.fresh.add(id);
      }
    }
  }

  /** Is there something in the shop the player has not seen yet? (The star on the shop button.) */
  get shopHasNews(): boolean {
    return this.current !== 'shop' && this.getState().unlocked.some((id) => !this.seenInShop.has(id));
  }

  /** Is this item new in the shop (unlocked since the shop was last open)? Its card carries a star. */
  isFresh(typeId: string): boolean {
    return this.fresh.has(typeId);
  }

  /** The types that were unlocked since the last call (for the message "Neu im Shop: …"); each is announced once. */
  takeAnnouncements(): string[] {
    const unlocked = this.getState().unlocked;
    const news = unlocked.filter((id) => !this.announced.has(id));
    for (const id of news) {
      this.announced.add(id);
    }
    return news;
  }

  /**
   * A card of the shop was tapped: starts placing that item (the shop closes).
   * A locked item is not chosen; the answer is the sentence "Das ist noch
   * gesperrt." Tapping a card the player can not pay for does choose it –
   * the hint then says what is missing (as in M3).
   */
  chooseItem(typeId: string): TextKey | undefined {
    if (shopCategoryOf(typeId) === undefined) {
      return undefined;
    }
    if (!isUnlocked(this.getState(), typeId)) {
      return 'hint.locked';
    }
    const invite = buildingType(typeId)?.category === 'resident';
    if (invite) {
      // Inviting needs room in a house (the card says so and can not be chosen; this is the same rule).
      const room = checkInvite(this.getState(), typeId).result;
      if (room === 'noHouse' || room === 'full') {
        return room === 'noHouse' ? 'hint.noHouse' : 'hint.residentsFull';
      }
    }
    // A place that was tapped before stays; the new item is shown on it.
    const keep = this.pending.kind === 'place' ? this.pending.tile : undefined;
    this.chosen = typeId;
    this.current = 'place';
    // An invitation needs no place: the preview (the house they will live in) is there at once.
    this.pending = invite ? { kind: 'invite', typeId } : keep ? { kind: 'place', tile: keep, typeId } : { kind: 'none' };
    this.inspected = undefined;
    this.inspectedResident = undefined;
    this.tab = shopCategoryOf(typeId) ?? this.tab;
    this.fresh = new Set();
    this.variantChosen = true;
    this.changes += 1;
    return undefined;
  }

  /** The production building whose info card is open (only while looking), if any. */
  get inspectedId(): number | undefined {
    return this.current === 'view' ? this.inspected : undefined;
  }

  /** Opens the info card of a production building (a tap on the sign above it). */
  inspect(buildingId: number): void {
    const building = this.getState().buildings.find((b) => b.id === buildingId);
    if (this.current === 'view' && building && buildingType(building.type)?.category === 'production') {
      this.inspected = buildingId;
      this.inspectedResident = undefined;
      this.changes += 1;
    }
  }

  /** The resident whose card is open (only while looking), if any. */
  get inspectedResidentId(): number | undefined {
    return this.current === 'view' ? this.inspectedResident : undefined;
  }

  /** Opens the card of a resident (a tap on them while looking); a building's card closes. */
  inspectResident(residentId: number): void {
    if (this.current !== 'view' || !this.getState().residents.some((r) => r.id === residentId) || this.inspectedResident === residentId) {
      return;
    }
    this.inspectedResident = residentId;
    this.inspected = undefined;
    this.changes += 1;
  }

  /** Is a card open (a production building's or a resident's)? */
  get cardOpen(): boolean {
    return this.inspectedId !== undefined || this.inspectedResidentId !== undefined;
  }

  /** Closes the card (of a building or a resident). */
  closeInfo(): void {
    if (this.inspected !== undefined || this.inspectedResident !== undefined) {
      this.inspected = undefined;
      this.inspectedResident = undefined;
      this.changes += 1;
    }
  }

  // --- Moving house (M7) ---

  /** Can this resident move house now? Not while they are still on the boat. */
  canMoveHome(residentId: number): boolean {
    const resident = this.getState().residents.find((r) => r.id === residentId);
    return resident !== undefined && resident.doing !== 'boat';
  }

  /**
   * "Umziehen" on the card of the resident: the card closes and the child taps the new house (then ✓). Returns false
   * (and changes nothing) if no card of a resident is open or they can not move now.
   */
  startMoveHome(): boolean {
    const residentId = this.inspectedResidentId;
    if (residentId === undefined || !this.canMoveHome(residentId)) {
      return false;
    }
    this.drag.cancel();
    this.current = 'home';
    this.mover = residentId;
    this.chosen = undefined;
    this.pending = { kind: 'none' };
    this.inspected = undefined;
    this.inspectedResident = undefined;
    this.variantChosen = false;
    this.changes += 1;
    return true;
  }

  /**
   * A press on a resident while looking (M7): can they be carried? Moving the finger then carries them
   * ({@link carryResident}); released without moving it stays a tap ({@link cancelCarry}, then the tap opens the card).
   */
  grabResident(residentId: number, at: Point): boolean {
    return this.current === 'view' && this.drag.grab(residentId, at);
  }

  /** The finger carries the resident to `at` (world px); `overUi`: over a bar or the card, where no house can be hit. An open card closes. */
  carryResident(at: Point, overUi = false): void {
    const first = this.drag.carried === undefined;
    this.drag.carry(at, overUi);
    if (first && this.drag.carried && (this.inspected !== undefined || this.inspectedResident !== undefined)) {
      // The card would cover the houses: it closes while carrying.
      this.inspected = undefined;
      this.inspectedResident = undefined;
      this.changes += 1;
    }
  }

  /** Let go at `at` (world px): a house with room → `assignHome`. Returns what to tell the child (moved in, full, their own house), if anything. */
  dropResident(at: Point, overUi = false): DropNotice | undefined {
    return dropNotice(this.drag.drop(at, overUi), (id) => this.residentName(id));
  }

  /** The carrying ends without letting go on anything (a second finger, the system took the pointer, a tap). */
  cancelCarry(): void {
    this.drag.cancel();
  }

  /** Once per frame (time in ms, one clock): a carried resident who stayed over a house with room long enough turns it green. */
  updateCarry(now: number): void {
    this.drag.update(now);
  }

  /** The resident being carried, where the finger is (world px) and over which house – or `undefined`. */
  get carried(): ResidentDrag['carried'] {
    return this.drag.carried;
  }

  /** Can the player pay for the chosen item right now? (`true` when nothing is chosen.) */
  get itemAffordable(): boolean {
    const item = this.item;
    return item === undefined || canAfford(this.getState(), item);
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
    const preview = this.preview();
    if (preview.kind === 'demolish' && totalUnits(preview.refund) > 0) {
      return 'hint.refund';
    }
    if (preview.kind === 'invite') {
      return 'hint.invite';
    }
    if (this.drag.carried) {
      return preview.kind === 'home' && !preview.waiting ? 'hint.dragDrop' : 'hint.dragHome';
    }
    if (preview.kind === 'home') {
      return 'hint.homeConfirm';
    }
    // A place that works, but where the building will have no path yet: say what to do next.
    const noPath = this.noPathHint(preview);
    if (noPath) {
      return noPath;
    }
    // Before a place is tapped: an item the player can not pay for says what is missing.
    const item = this.item;
    if (preview.kind === 'none' && item && this.variantChosen && !this.itemAffordable) {
      return totalUnits(missingFor(this.getState(), item)) === 1 ? 'hint.missingOne' : 'hint.missing';
    }
    switch (this.current) {
      case 'view':
      case 'shop':
        return undefined;
      case 'path':
        return this.pending.kind === 'path' ? 'hint.pathEnd' : 'hint.pathStart';
      case 'move':
        return this.pending.kind === 'move' ? 'hint.moveTarget' : 'hint.moveSelect';
      case 'demolish':
        return 'hint.demolish';
      case 'place':
        return placeHint(item);
      case 'home':
        return 'hint.homeSelect';
    }
  }

  private noPathHint(preview: Preview): TextKey | undefined {
    const target = preview.kind === 'place' ? preview : preview.kind === 'move' ? preview.target : undefined;
    const typeId = preview.kind === 'place' ? preview.typeId : preview.kind === 'move' ? preview.typeId : undefined;
    const type = typeId ? buildingType(typeId) : undefined;
    if (target?.result !== 'ok' || target.connected || !type?.needsPath) {
      return undefined;
    }
    return type.category === 'production' ? 'hint.noPathWork' : 'hint.noPathHouse';
  }

  /** The values for the placeholders of {@link hint} (`{list}`), if it has any. */
  get hintParams(): TextParams | undefined {
    const preview = this.preview();
    switch (preview.kind) {
      case 'place':
        return problemParams(preview);
      case 'move':
        return preview.target ? problemParams(preview.target) : undefined;
      case 'demolish':
        return totalUnits(preview.refund) > 0 ? { list: listText(preview.refund) } : undefined;
      case 'none': {
        const carried = this.drag.carried?.residentId ?? (this.current === 'home' ? this.mover : undefined);
        if (carried !== undefined) {
          return { name: this.residentName(carried) };
        }
        const item = this.item;
        return item && this.variantChosen && !this.itemAffordable ? missingParams(missingFor(this.getState(), item)) : undefined;
      }
      case 'invite':
        return preview.result === 'cost' ? missingParams(preview.missing ?? {}) : undefined;
      case 'home':
        return { name: this.residentName(preview.residentId), current: preview.used, needed: preview.capacity };
      case 'path':
        return undefined;
    }
  }

  /** The name of a resident ('' if they are not there). */
  private residentName(residentId: number | undefined): string {
    return this.getState().residents.find((r) => r.id === residentId)?.name ?? '';
  }

  private problemOf(preview: Preview): TextKey | undefined {
    switch (preview.kind) {
      case 'place':
        return problemHint(preview, false, preview.typeId);
      case 'move':
        return preview.target ? problemHint(preview.target, false, preview.typeId) : undefined;
      case 'path': {
        if (preview.error === 'noRoute') {
          return 'hint.noRoute';
        }
        if (preview.error === 'tooLong') {
          return 'hint.routeTooLong';
        }
        const blocked = preview.tiles.find((tile) => tile.problem !== undefined);
        return blocked?.problem ? problemHint(blocked.problem, true) : undefined;
      }
      case 'invite':
        return inviteProblem(preview);
      case 'home':
        return homeProblem(preview.result);
      case 'none':
      case 'demolish':
        return undefined;
    }
  }

  /**
   * What is under the finger: first the tile (a building's footprint, then a path), and only if the tile is empty
   * the picture of a house reaching over it (its roof).
   */
  private under(tile: Tile, world?: Point): { readonly footprint: DeepReadonly<PlacedBuilding> | undefined; readonly building: DeepReadonly<PlacedBuilding> | undefined } {
    const state = this.getState();
    const footprint = buildingAt(state, tile.x, tile.y);
    const onPath = isPath(state, tile.x, tile.y);
    // A tree or rock the player planted counts like a path: the tile wins over the roof of a house behind it.
    const onPlanted = plantedTypeAt(state, tile.x, tile.y) !== undefined;
    const roof = world && !footprint && !onPath && !onPlanted ? buildingAtPoint(state, world.x, world.y, TILE_SIZE) : undefined;
    return { footprint, building: footprint ?? roof };
  }

  /**
   * Would a tap here, while looking, do something with a building – open the card of a production building, or say
   * that a house needs a path? There a resident nearby only keeps the taps close to the body (see `residentHit.ts`).
   */
  buildingAnswersTap(tile: Tile, world?: Point): boolean {
    const { building } = this.under(tile, world);
    const type = building ? buildingType(building.type) : undefined;
    if (!building || !type) {
      return false;
    }
    return type.category === 'production' || (type.needsPath && !isConnected(this.getState(), building.id));
  }

  /**
   * A tile was tapped; `world` is the tapped point in world pixels. Houses
   * are hit by their picture (a tap on a roof counts, although the tile under
   * the finger is behind the house). Returns a text key when the child should
   * get a short explanation ("Hier geht das nicht.").
   */
  tap(tile: Tile, world?: Point): TextKey | undefined {
    const state = this.getState();
    const { footprint, building } = this.under(tile, world);
    switch (this.current) {
      case 'place':
        if (this.pending.kind === 'invite' || buildingType(this.chosen ?? '')?.category === 'resident') {
          // An invitation has no place: a tap on the island only brings its preview back.
          if (this.pending.kind !== 'invite') {
            this.pending = { kind: 'invite', typeId: this.chosen ?? '' };
            this.changes += 1;
          }
          return undefined;
        }
        this.pending = { kind: 'place', tile, typeId: this.chosen ?? '' };
        this.changes += 1;
        return undefined;
      case 'shop':
        return undefined;
      case 'view': {
        const type = building ? buildingType(building.type) : undefined;
        if (building && type?.category === 'production') {
          // A production building opens its info card (it says by itself if a path is missing).
          this.inspected = building.id;
          this.inspectedResident = undefined;
          this.changes += 1;
          return undefined;
        }
        this.closeInfo();
        return building && type?.needsPath && !isConnected(state, building.id) ? 'hint.needsPath' : undefined;
      }
      case 'path':
        return this.tapPath(tile);
      case 'move':
        return this.tapMove(tile, building?.id, footprint?.id);
      case 'home': {
        // Only houses count, by their picture: a flower or a path in front of a house does not hide it.
        const houseId = world ? houseAtPoint(state, world) : building && buildingType(building.type)?.category === 'house' ? building.id : undefined;
        if (houseId !== undefined) {
          this.pending = { kind: 'home', houseId };
          this.changes += 1;
          return undefined;
        }
        this.pending = { kind: 'none' };
        this.changes += 1;
        return 'hint.homePickHouse';
      }
      case 'demolish': {
        if (building) {
          this.pending = { kind: 'demolish', x: building.x, y: building.y };
        } else if (isPath(state, tile.x, tile.y) || plantedTypeAt(state, tile.x, tile.y) !== undefined) {
          // A path, or a tree / rock the player planted.
          this.pending = { kind: 'demolish', x: tile.x, y: tile.y };
        } else {
          this.pending = { kind: 'none' };
          this.changes += 1;
          // Trees and rocks the island grew by itself stay.
          const terrain = terrainAt(state.world, tile.x, tile.y);
          return terrain === 'forest' || terrain === 'rock' ? 'hint.naturalObject' : 'hint.nothingToDemolish';
        }
        this.changes += 1;
        return undefined;
      }
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

  /**
   * `buildingId` is the building under the finger (footprint or, on an empty
   * tile, roof), `footprintId` only the one whose footprint is on the tile.
   * With a building already chosen, the tile is the target – unless it is on
   * the footprint of another building, which is then chosen instead.
   */
  private tapMove(tile: Tile, buildingId: number | undefined, footprintId: number | undefined): TextKey | undefined {
    const state = this.getState();
    const pending = this.pending;
    if (pending.kind === 'move') {
      if (footprintId !== undefined && footprintId !== pending.id) {
        this.pending = { kind: 'move', id: footprintId };
        this.changes += 1;
        return undefined;
      }
    } else if (buildingId !== undefined) {
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
    const key = `${String(this.changes)}|${String(this.drag.version)}|${String(this.getState().revision)}|${String(this.storeKey())}`;
    if (this.cache?.key !== key) {
      this.cache = { key, preview: this.computePreview() };
    }
    return this.cache.preview;
  }

  private computePreview(): Preview {
    const state = this.getState();
    const carried = this.drag.carried;
    if (carried) {
      const target = carried.target;
      return target ? { kind: 'home', residentId: carried.residentId, ...target, carried: true, waiting: target.result === 'ok' && !carried.ready } : { kind: 'none' };
    }
    const pending = this.pending;
    switch (pending.kind) {
      case 'none':
        return { kind: 'none' };
      case 'place': {
        const anchor = anchorFor(pending.typeId, pending.tile);
        const connected = wouldBeConnected(state, pending.typeId, anchor.x, anchor.y);
        return { kind: 'place', typeId: pending.typeId, x: anchor.x, y: anchor.y, connected, ...checkPlacement(state, pending.typeId, anchor.x, anchor.y) };
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
          ...(target
            ? { target: { x: target.x, y: target.y, connected: wouldBeConnected(state, building.type, target.x, target.y), ...checkPlacement(state, building.type, target.x, target.y, building.id) } }
            : {}),
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
          return { kind: 'demolish', tiles, refund: refundFor(state, building.id) };
        }
        if (isPath(state, pending.x, pending.y)) {
          return { kind: 'demolish', tiles: [{ x: pending.x, y: pending.y }], refund: {} };
        }
        return plantedTypeAt(state, pending.x, pending.y) !== undefined
          ? { kind: 'demolish', tiles: [{ x: pending.x, y: pending.y }], refund: plantedRefund(state, pending.x, pending.y) }
          : { kind: 'none' };
      }
      case 'home': {
        const mover = this.mover;
        const check = mover === undefined ? undefined : checkHome(state, mover, pending.houseId);
        if (mover === undefined || !check || check.result === 'noResident' || check.result === 'noHouse') {
          return { kind: 'none' };
        }
        return { kind: 'home', residentId: mover, houseId: pending.houseId, ...check, carried: false, waiting: false };
      }
      case 'invite': {
        const check = checkInvite(state, pending.typeId);
        return {
          kind: 'invite',
          typeId: pending.typeId,
          result: check.result,
          ...(check.home !== undefined ? { home: check.home } : {}),
          ...(check.missing ? { missing: check.missing } : {}),
        };
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
      case 'invite':
        return preview.result === 'ok';
      case 'home':
        return !preview.carried && preview.result === 'ok';
    }
  }

  /** Is there a preview (so ✓ and ✕ are shown)? A carried resident has none: letting go decides. */
  get hasPreview(): boolean {
    const preview = this.preview();
    return preview.kind !== 'none' && !(preview.kind === 'home' && preview.carried);
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
        this.send(placementCommand(preview.typeId, preview.x, preview.y));
        this.variantChosen = false;
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
          if (totalUnits(preview.refund) > 0) {
            this.onRefund?.({ at: tile, refund: preview.refund });
          }
        }
        break;
      }
      case 'invite':
        // The boat comes: back to looking, so the child sees it arrive (and does not invite twice by accident).
        this.send({ type: 'inviteResident', typeId: preview.typeId });
        this.exitTool();
        return undefined;
      case 'home':
        // Moved in: back to looking, with the card of the resident open (it shows the new home).
        this.send({ type: 'assignHome', residentId: preview.residentId, houseId: preview.houseId });
        this.exitTool();
        return undefined;
    }
    this.pending = { kind: 'none' };
    this.changes += 1;
    return undefined;
  }

  /** ✕: drops the preview; the tool stays on. An invitation has nothing else to show: ✕ ends it. */
  cancel(): void {
    if (this.pending.kind === 'invite') {
      this.exitTool();
      return;
    }
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
    // The resident who was choosing a home is gone (a loaded village): nothing to choose for.
    if (this.current === 'home' && !this.getState().residents.some((r) => r.id === this.mover)) {
      this.mover = undefined;
      this.exitTool();
    }
    const inspected = this.inspected;
    if (inspected !== undefined && !this.getState().buildings.some((b) => b.id === inspected)) {
      this.inspected = undefined;
    }
    this.dropMissingResident();
    this.changes += 1;
  }

  /** A resident whose card is open is always there (residents are never removed in the game, but a loaded village may differ). */
  dropMissingResident(): void {
    const resident = this.inspectedResident;
    if (resident !== undefined && !this.getState().residents.some((r) => r.id === resident)) {
      this.inspectedResident = undefined;
      this.changes += 1;
    }
  }
}

/**
 * What letting go says: "moved in" for a house with room; "hold a moment" when it was let go there too soon (a swipe);
 * why not for a full house or their own; and beside the houses (meadow, a bar) where to let go next time.
 */
export function dropNotice(result: DropResult | undefined, nameOf: (residentId: number) => string): DropNotice | undefined {
  if (!result) {
    return undefined;
  }
  const name = nameOf(result.residentId);
  const target = result.target;
  if (!target) {
    return { key: 'hint.dragNoHouse', params: { name } };
  }
  const params = { name, current: target.used, needed: target.capacity };
  if (result.moved) {
    return { key: 'hint.homeMoved', params };
  }
  const key = homeProblem(target.result) ?? 'hint.dragHold';
  return { key, params };
}

/** Why a resident can not move into the house (M7): it is full, it is their own, or it is no house. */
function homeProblem(result: HomeResult): TextKey | undefined {
  switch (result) {
    case 'ok':
      return undefined;
    case 'full':
      return 'hint.homeFull';
    case 'same':
      return 'hint.homeSame';
    case 'noHouse':
    case 'noResident':
      return 'hint.homePickHouse';
  }
}

/** Why ✓ can not invite: every house is full, the village is full, or coins are missing. */
function inviteProblem(preview: Extract<Preview, { kind: 'invite' }>): TextKey | undefined {
  switch (preview.result) {
    case 'ok':
      return undefined;
    case 'noHouse':
      return 'hint.noHouse';
    case 'full':
      return 'hint.residentsFull';
    case 'cost':
      return totalUnits(preview.missing ?? {}) === 1 ? 'hint.missingOne' : 'hint.missing';
  }
}
