import { buildingType, shopCategoryOf, type ShopCategory } from '../data/buildings';
import { TUTORIAL_RULES, type TutorialStepDef, type TutorialStepId } from '../data/tutorial';
import { canPlacePath, checkPlacement, isPath, unconnectedBuildings, wouldBeConnected, type PlacementView, type Tile } from '../sim/buildings';
import { findRoute } from '../sim/route';
import { anchorFor, type Preview, type ToolId } from './buildTool';

/**
 * The guided start (M8): a few short steps for the first minutes of a new village – tap a resident, open the shop, set
 * a flower, watch the market earn coins, build a house, lay a path to it, and a last "Super!". Pure and tested; the
 * scene only shows what this says (a sentence in the hint bar, a pointing hand and a soft glow).
 *
 * Rules:
 * - It never blocks and never forces a way: every step only has a **goal**, read from the village and the controls
 *   (`advanceTutorial`), and it counts however it was reached – also before the step is shown (a house built early
 *   skips the step "house"). The hand only suggests the next tap. Moving a resident by dragging is not a step.
 * - It uses only what the child can do anyway: it sends no commands, and the simulation knows nothing about it.
 * - It can be skipped at any time (✕ beside the sentence); finished or skipped, it never comes back by itself (only
 *   the parents' "Tutorial noch einmal" starts it again).
 * - The record is kept in the parents' settings entry, not in the village (see `docs/ENTSCHEIDUNGEN.md`): a reload in
 *   the middle goes on where it was; a village from before M8, or one loaded from a file, has none and counts as done.
 */
export type TutorialStatus = 'active' | 'done' | 'skipped';

export interface TutorialRecord {
  readonly status: TutorialStatus;
  /** Index into `TUTORIAL_RULES.steps` of the step shown now. */
  readonly step: number;
  /** Decoration and houses of the village when the tutorial began (kept at the lowest since: demolishing lowers it). */
  readonly base: { readonly deco: number; readonly houses: number };
  /** The coins earned when the current step began (the step "coins" wants to see the market earn while it is shown). */
  readonly earned: number;
  /** Did the child open the card of a resident, or the shop, since the tutorial began? */
  readonly seen: { readonly resident: boolean; readonly shop: boolean };
}

/** What the tutorial looks at in a frame. */
export interface TutorialView {
  readonly deco: number;
  readonly houses: number;
  readonly earned: number;
  /** Houses without a path next to them. */
  readonly unconnectedHouses: number;
  readonly residentCard: boolean;
  readonly shopOpen: boolean;
  /** Was there a tap (anywhere) since the last frame? */
  readonly tapped: boolean;
}

export const TUTORIAL_FORMAT = 'village-tutorial';

/** Counts what the goals need, from the village. */
export function villageCounts(state: PlacementView): Pick<TutorialView, 'deco' | 'houses' | 'unconnectedHouses'> {
  let deco = 0;
  let houses = 0;
  for (const building of state.buildings) {
    const category = buildingType(building.type)?.category;
    if (category === 'deco') {
      deco += 1;
    } else if (category === 'house') {
      houses += 1;
    }
  }
  const unconnectedHouses = unconnectedBuildings(state).filter((id) => {
    const building = state.buildings.find((b) => b.id === id);
    return building !== undefined && buildingType(building.type)?.category === 'house';
  }).length;
  return { deco, houses, unconnectedHouses };
}

export function startTutorial(view: Pick<TutorialView, 'deco' | 'houses' | 'earned'>): TutorialRecord {
  return { status: 'active', step: 0, base: { deco: view.deco, houses: view.houses }, earned: view.earned, seen: { resident: false, shop: false } };
}

/** Finished for good (a village from before M8, a loaded file). */
export const TUTORIAL_DONE: TutorialRecord = { status: 'done', step: TUTORIAL_RULES.steps.length, base: { deco: 0, houses: 0 }, earned: 0, seen: { resident: true, shop: true } };

/** The record as it is stored (plain data, with a format name so nothing else is taken for it). */
export function storeTutorial(record: TutorialRecord): Record<string, unknown> {
  return { format: TUTORIAL_FORMAT, ...structuredClone(record) };
}

function count(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined;
}

/** A stored record, `undefined` if `raw` is none (never throws; everything is checked). */
export function readTutorial(raw: unknown): TutorialRecord | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const data = raw as Record<string, unknown>;
  const status = data['status'];
  if (data['format'] !== TUTORIAL_FORMAT || (status !== 'active' && status !== 'done' && status !== 'skipped')) {
    return undefined;
  }
  if (status !== 'active') {
    return { ...TUTORIAL_DONE, status };
  }
  const base = (typeof data['base'] === 'object' && data['base'] !== null ? data['base'] : {}) as Record<string, unknown>;
  const seen = (typeof data['seen'] === 'object' && data['seen'] !== null ? data['seen'] : {}) as Record<string, unknown>;
  const step = count(data['step']);
  const deco = count(base['deco']);
  const houses = count(base['houses']);
  const earned = count(data['earned']);
  if (step === undefined || deco === undefined || houses === undefined || earned === undefined) {
    return undefined;
  }
  if (step >= TUTORIAL_RULES.steps.length) {
    return TUTORIAL_DONE;
  }
  return { status, step, base: { deco, houses }, earned, seen: { resident: seen['resident'] === true, shop: seen['shop'] === true } };
}

/**
 * The tutorial of this game: a **new** village starts it (unless it was finished or skipped before); a loaded village
 * goes on with the stored record – without one (a village from before M8) it counts as done.
 */
export function tutorialFor(kind: 'new' | 'loaded', stored: unknown, view: Pick<TutorialView, 'deco' | 'houses' | 'earned'>): TutorialRecord {
  const record = readTutorial(stored);
  if (kind === 'new') {
    return record && record.status !== 'active' ? record : startTutorial(view);
  }
  return record ?? TUTORIAL_DONE;
}

export function currentStep(record: TutorialRecord): TutorialStepDef | undefined {
  return record.status === 'active' ? TUTORIAL_RULES.steps[record.step] : undefined;
}

export function skipTutorial(record: TutorialRecord): TutorialRecord {
  return record.status === 'active' ? { ...record, status: 'skipped' } : record;
}

function reached(id: TutorialStepId, record: TutorialRecord, view: TutorialView, tapCounts: boolean): boolean {
  switch (id) {
    case 'resident':
      return record.seen.resident;
    case 'shop':
      // Whoever has already bought something knows the shop.
      return record.seen.shop || view.deco > record.base.deco || view.houses > record.base.houses;
    case 'deco':
      return view.deco > record.base.deco;
    case 'coins':
      return view.earned > record.earned;
    case 'house':
      return view.houses > record.base.houses;
    case 'path':
      return view.unconnectedHouses === 0;
    case 'praise':
      return tapCounts;
  }
}

/**
 * One frame: notes what the child has seen and moves on past every step whose goal is reached (several at once if they
 * were done early). A tap only ends the step that was shown before this frame (the ✓ that laid the path does not also
 * end the praise). Returns the same object when nothing changed.
 */
export function advanceTutorial(record: TutorialRecord, view: TutorialView): TutorialRecord {
  if (record.status !== 'active') {
    return record;
  }
  const seen = { resident: record.seen.resident || view.residentCard, shop: record.seen.shop || view.shopOpen };
  const base = { deco: Math.min(record.base.deco, view.deco), houses: Math.min(record.base.houses, view.houses) };
  let next: TutorialRecord = { ...record, seen, base };
  const first = next.step;
  for (;;) {
    const step = TUTORIAL_RULES.steps[next.step];
    if (!step) {
      next = { ...next, status: 'done' };
      break;
    }
    if (!reached(step.id, next, view, view.tapped && next.step === first)) {
      break;
    }
    next = { ...next, step: next.step + 1, earned: view.earned };
  }
  const same =
    next.status === record.status &&
    next.step === record.step &&
    next.earned === record.earned &&
    seen.resident === record.seen.resident &&
    seen.shop === record.seen.shop &&
    base.deco === record.base.deco &&
    base.houses === record.base.houses;
  return same ? record : next;
}

/** What the controls show right now (from `BuildTool`). */
export interface TutorialUi {
  readonly tool: ToolId;
  readonly shopTab: ShopCategory;
  readonly item: string | undefined;
  readonly preview: Preview;
  readonly canConfirm: boolean;
  /** An open card: of a resident or of a building (it covers the hint bar while looking). */
  readonly card?: 'resident' | 'info' | undefined;
}

/**
 * Where the hand points: a control (a name of `BuildUI.spots`, e.g. `tool-shop`, `item-flower`, `confirm`), a resident,
 * a free place for the item being placed, the start or the end of a new path – or nowhere.
 */
export type TutorialTarget =
  | { readonly kind: 'spot'; readonly name: string }
  | { readonly kind: 'resident' }
  | { readonly kind: 'place'; readonly typeId: string }
  | { readonly kind: 'pathStart' }
  | { readonly kind: 'pathEnd' }
  | { readonly kind: 'none' };

/**
 * What the sentence says: the sentence of the step, or one that leads back to it first (close the card, close the shop,
 * end the tool with the blue arrow, back to the shop with the chip). Each belongs to its own target of the hand.
 */
export type TutorialSentence = TutorialStepId | 'closeCard' | 'closeShop' | 'exit' | 'chip';

/**
 * The hand and the sentence that go together (Korrekturrunde 1): `firm` – the sentence goes before the hint of the
 * open tool (it leads elsewhere, so the tool's "Tippe auf die Wiese …" would not match the hand). Without `firm`, the
 * tool's own hint says what the hand shows (the place, the ✓) and goes first.
 */
export interface TutorialHint {
  readonly target: TutorialTarget;
  readonly sentence: TutorialSentence;
  readonly firm: boolean;
}

const spot = (name: string): TutorialTarget => ({ kind: 'spot', name });
const hintOf = (target: TutorialTarget, sentence: TutorialSentence, firm = false): TutorialHint => ({ target, sentence, firm });

/** Back to looking at the island: close the shop, or end the tool (with the blue arrow in the hint bar). */
function backToView(ui: TutorialUi): TutorialHint | undefined {
  if (ui.tool === 'shop') {
    return hintOf(spot('shop-close'), 'closeShop');
  }
  return ui.tool === 'view' ? undefined : hintOf(spot('exit'), 'exit', true);
}

function buyHint(step: TutorialStepDef, ui: TutorialUi, category: 'deco' | 'house'): TutorialHint {
  const item = step.item ?? '';
  const id = step.id;
  switch (ui.tool) {
    case 'view':
      return hintOf(spot('tool-shop'), id);
    case 'shop': {
      const tab = shopCategoryOf(item);
      return hintOf(tab !== undefined && ui.shopTab !== tab ? spot(`tab-${tab}`) : spot(`item-${item}`), id);
    }
    case 'place': {
      const chosen = ui.item;
      if (chosen === undefined || buildingType(chosen)?.category !== category) {
        return hintOf(spot('chip'), 'chip', true);
      }
      return hintOf(ui.canConfirm ? spot('confirm') : { kind: 'place', typeId: chosen }, id);
    }
    case 'path':
    case 'move':
    case 'demolish':
    case 'home':
      return hintOf(spot('exit'), 'exit', true);
  }
}

/** The hand and its sentence for this step and these controls. */
export function tutorialHint(step: TutorialStepDef | undefined, ui: TutorialUi): TutorialHint | undefined {
  if (!step) {
    return undefined;
  }
  // An open card covers the hint bar: first close it (the first step is done by opening it).
  if (ui.card !== undefined && step.id !== 'resident' && ui.tool !== 'shop') {
    return hintOf(spot('card-close'), 'closeCard', true);
  }
  switch (step.id) {
    case 'resident':
      return backToView(ui) ?? hintOf({ kind: 'resident' }, 'resident');
    case 'shop':
      return ui.tool === 'view' ? hintOf(spot('tool-shop'), 'shop') : (backToView(ui) ?? hintOf({ kind: 'none' }, 'shop'));
    case 'deco':
      return buyHint(step, ui, 'deco');
    case 'house':
      return buyHint(step, ui, 'house');
    case 'coins':
      // The store bar is always to be seen, with any tool and over the shop: the market earns while the child goes on.
      return hintOf(spot('stock'), 'coins', true);
    case 'praise':
      // The praise points at nothing; it goes before the tool's hint (the path just laid leaves the tool on) and ends
      // with the next tap. Over the shop the child first closes it.
      return ui.tool === 'shop' ? hintOf(spot('shop-close'), 'closeShop') : hintOf({ kind: 'none' }, 'praise', true);
    case 'path': {
      if (ui.tool === 'view') {
        return hintOf(spot('tool-path'), 'path');
      }
      if (ui.tool !== 'path') {
        return backToView(ui) ?? hintOf({ kind: 'none' }, 'path');
      }
      if (ui.canConfirm) {
        return hintOf(spot('confirm'), 'path');
      }
      return hintOf(ui.preview.kind === 'path' ? { kind: 'pathEnd' } : { kind: 'pathStart' }, 'path');
    }
  }
}

export function tutorialTarget(step: TutorialStepDef | undefined, ui: TutorialUi): TutorialTarget {
  return tutorialHint(step, ui)?.target ?? { kind: 'none' };
}

/** A resident on the screen (CSS px: the middle of the body, where a tap finds them). */
export interface ScreenResident {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** The resident the hand points at; `onScreen` false: nobody can be tapped now, the camera should glide to this one. */
export interface ResidentChoice extends ScreenResident {
  readonly onScreen: boolean;
}

/** How far inside the screen (CSS px) a resident must be for the hand to point at them. */
export const RESIDENT_EDGE = 24;

/**
 * Which resident the hand of the first step points at (Korrekturrunde 1: on a phone held sideways the free band
 * between the bars is low, and nobody was inside it – the hand was missing). In this order:
 * 1. a resident in the free band (between the bars, a little inside);
 * 2. else any resident on the screen who is not under a bar or a button (`covered`) – a tap there reaches them;
 * 3. else nobody can be tapped: the one nearest to the middle of the band, with `onScreen` false (the scene lets the
 *    camera glide there gently).
 * The one from before (`sticky`) stays as long as they are in the best group, so the hand does not jump about.
 */
export function pickTutorialResident(
  residents: readonly ScreenResident[],
  view: { readonly width: number; readonly height: number },
  band: { readonly top: number; readonly bottom: number },
  sticky: number | undefined,
  covered: (x: number, y: number) => boolean,
): ResidentChoice | undefined {
  const top = Math.max(0, Math.min(band.top, view.height));
  const bottom = Math.max(top, Math.min(band.bottom, view.height));
  const inset = Math.min(RESIDENT_EDGE, (bottom - top) / 4);
  const middle = { x: view.width / 2, y: (top + bottom) / 2 };
  const onScreen = (r: ScreenResident): boolean =>
    r.x >= RESIDENT_EDGE && r.x <= view.width - RESIDENT_EDGE && r.y >= RESIDENT_EDGE && r.y <= view.height - RESIDENT_EDGE && !covered(r.x, r.y);
  const inBand = (r: ScreenResident): boolean => onScreen(r) && r.y >= top + inset && r.y <= bottom - inset;
  const distance = (r: ScreenResident): number => Math.hypot(r.x - middle.x, r.y - middle.y);
  for (const group of [residents.filter(inBand), residents.filter(onScreen)]) {
    const kept = group.find((r) => r.id === sticky);
    const best = kept ?? [...group].sort((a, b) => distance(a) - distance(b) || a.id - b.id)[0];
    if (best) {
      return { id: best.id, x: best.x, y: best.y, onScreen: true };
    }
  }
  const nearest = [...residents].sort((a, b) => distance(a) - distance(b) || a.id - b.id)[0];
  return nearest ? { id: nearest.id, x: nearest.x, y: nearest.y, onScreen: false } : undefined;
}

/** Tiles within `radius` of (0, 0), nearest first (rings by distance, then row by row). */
function offsets(radius: number): readonly Tile[] {
  const list: Tile[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius) {
        list.push({ x: dx, y: dy });
      }
    }
  }
  return list.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y) || a.y - b.y || a.x - b.x);
}

/**
 * A free place for `typeId` near `near`: the tile to tap (see `anchorFor`), nearest first. Places that only lack coins
 * count too (the hint then says what is missing). A house prefers a place without a path next to it, so the next step
 * (a path to the house) has something to do.
 */
export function suggestPlace(state: PlacementView, typeId: string, near: Tile, radius = TUTORIAL_RULES.searchRadius): Tile | undefined {
  const house = buildingType(typeId)?.category === 'house';
  let fallback: Tile | undefined;
  for (const offset of offsets(radius)) {
    const tile = { x: near.x + offset.x, y: near.y + offset.y };
    const anchor = anchorFor(typeId, tile);
    const result = checkPlacement(state, typeId, anchor.x, anchor.y).result;
    if (result !== 'ok' && result !== 'cost') {
      continue;
    }
    if (!house || !wouldBeConnected(state, typeId, anchor.x, anchor.y)) {
      return tile;
    }
    fallback ??= tile;
  }
  return fallback;
}

/**
 * Where a path to the first house without one could go: `start` an existing path tile, `end` a free tile right next to
 * the house (the front first), with a route between them. `undefined` if every house has a path or none can be found.
 */
export function pathTargets(state: PlacementView): { readonly start: Tile; readonly end: Tile } | undefined {
  const houseId = unconnectedBuildings(state).find((id) => {
    const building = state.buildings.find((b) => b.id === id);
    return building !== undefined && buildingType(building.type)?.category === 'house';
  });
  const house = state.buildings.find((b) => b.id === houseId);
  const type = house ? buildingType(house.type) : undefined;
  if (!house || !type) {
    return undefined;
  }
  const { w, h } = type.footprint;
  const sides: Tile[] = [];
  for (let dx = 0; dx < w; dx += 1) {
    sides.push({ x: house.x + dx, y: house.y + h });
  }
  for (let dy = h - 1; dy >= 0; dy -= 1) {
    sides.push({ x: house.x - 1, y: house.y + dy }, { x: house.x + w, y: house.y + dy });
  }
  for (let dx = 0; dx < w; dx += 1) {
    sides.push({ x: house.x + dx, y: house.y - 1 });
  }
  const paths: Tile[] = state.paths.map((index) => ({ x: index % state.world.width, y: Math.floor(index / state.world.width) }));
  const candidates = sides
    .filter((tile) => canPlacePath(state, tile.x, tile.y) === 'ok')
    .map((end, order) => {
      let start: Tile | undefined;
      let best = Number.POSITIVE_INFINITY;
      for (const tile of paths) {
        const distance = Math.abs(tile.x - end.x) + Math.abs(tile.y - end.y);
        if (distance < best && isPath(state, tile.x, tile.y)) {
          best = distance;
          start = tile;
        }
      }
      return { end, start, best, order };
    })
    .filter((candidate): candidate is { end: Tile; start: Tile; best: number; order: number } => candidate.start !== undefined)
    .sort((a, b) => a.best - b.best || a.order - b.order);
  for (const candidate of candidates.slice(0, 6)) {
    if (findRoute(state, candidate.start, candidate.end).ok) {
      return { start: candidate.start, end: candidate.end };
    }
  }
  return undefined;
}

/**
 * Where the hand sits: its fingertip on the point, the hand above it pointing down – or below it pointing up when the
 * point is high on the screen. The point is kept on the screen (`margin` from the edges).
 */
export function handPose(point: { readonly x: number; readonly y: number }, view: { readonly width: number; readonly height: number }, margin = 28): { readonly x: number; readonly y: number; readonly fromBelow: boolean } {
  const x = Math.min(Math.max(point.x, margin), Math.max(margin, view.width - margin));
  const y = Math.min(Math.max(point.y, margin), Math.max(margin, view.height - margin));
  return { x, y, fromBelow: y < view.height * 0.4 };
}
