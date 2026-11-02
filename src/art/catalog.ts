import { BUILDING_TYPES, type BuildingType } from '../data/buildings';
import { ITEM_IDS } from '../data/goods';
import { HAT_IDS } from '../data/residents';
import { COLORS, TILE_SIZE } from '../ui/style';
import {
  BOAT_SIZE,
  BOAT_WATER,
  MOOD_SIZE,
  RESIDENT_FOOT,
  RESIDENT_SIZE,
  RING_SIZE,
  SLEEP_SIZE,
  drawBoatBack,
  drawBoatFront,
  drawCloud,
  drawFace,
  drawHeart,
  drawInvite,
  drawResident,
  drawResidentRing,
  drawSleep,
  hatColors,
} from './figures';
import { GOOD_BOX, HAND_SIZE, HAND_TIP, ICON_BOX, NEARBY_IDS, UI_ICONS, drawGoodIcon, drawHand } from './icons';
import {
  PATTERN_SIZE,
  drawBigRock,
  drawBlossomTree,
  drawForestPattern,
  drawGlint,
  drawGrassPattern,
  drawGroundFlowers,
  drawGroundMushroom,
  drawGroundPebbles,
  drawGroundShell,
  drawGroundTuft,
  drawPineTree,
  drawPuff,
  drawRing,
  drawRockPair,
  drawRockPattern,
  drawRoundTree,
  drawSandPattern,
  drawShoreWave,
  drawSmallRock,
  drawSmoke,
  drawWaterPattern,
} from './nature';
import { Svg, hex } from './svg';
import { TITLE_SIZE, drawTitle } from './title';
import { BUILDING_DRAWERS, BUILDING_PAD, type BuildingLook, SIGN_SIZE, drawNeedSign, drawPathSign, drawPathTile } from './village';

/**
 * Every picture of the game (M9) under a fixed key: its size in the world or on the screen (logical px), the point it
 * stands on (the anchor: the feet, the front edge of the footprint), how many texture pixels it gets per logical
 * pixel, how it is drawn as SVG, and what it shows – the text the prompt templates in `docs/assets/` are made of. A
 * raster file `public/assets/<key>.png` or `.webp` replaces the SVG of its key (`source.ts`).
 */

export type AssetGroup = 'ground' | 'nature' | 'building' | 'path' | 'sign' | 'good' | 'figure' | 'mood' | 'effect' | 'ui' | 'title';

export interface AssetEntry {
  readonly key: string;
  readonly group: AssetGroup;
  /** Logical size (world px, or CSS px for the interface). */
  readonly width: number;
  readonly height: number;
  /** Texture pixels per logical pixel (2: sharp on the tablet when zoomed in; the ground is painted 1:1). */
  readonly scale: number;
  /** The point the picture stands on, in logical px from its top left; centred pictures have none. */
  readonly anchor?: { readonly x: number; readonly y: number };
  /** Tiles to repeat without a seam (the ground patterns). */
  readonly tiles?: boolean;
  /** What the picture shows (English, for the prompt of an image generator). */
  readonly subject: string;
  /** Colours the prompt must name first (the residents: skin, cheeks, clothes, shoes and hat from the theme). */
  readonly colours?: readonly number[];
  readonly draw: (s: Svg) => void;
}

export const ART_SCALE = 2;

/** The texture key of a building type (`bld-house-red`). */
export function buildingKey(typeId: string): string {
  return `bld-${typeId}`;
}

/** The path tile for the four neighbours in `mask` (1 up, 2 right, 4 down, 8 left). */
export function pathKey(mask: number): string {
  return `path-${String(mask)}`;
}

export function goodKey(id: string): string {
  return `good-${id}`;
}

export function needKey(id: string): string {
  return `need-${id}`;
}

/** The round sign over a building: `path`, `tree`, `rock` or `good-<id>`. */
export function signKey(kind: string): string {
  return kind === 'path' ? PATH_SIGN_KEY : `sign-${kind}`;
}

export function residentKey(hat: string): string {
  return `resident-${hat}`;
}

export function uiKey(name: string): string {
  return `ui-${name}`;
}

export const PATH_SIGN_KEY = 'marker-path';
export const TREE_KEYS = ['tree-round', 'tree-pine', 'tree-blossom'] as const;
export const ROCK_KEYS = ['rock-big', 'rock-pair', 'rock-small'] as const;
export const GROUND_PATTERN_KEYS = { grass: 'ground-grass', forest: 'ground-forest', rock: 'ground-rock', sand: 'ground-sand', water: 'ground-water' } as const;
export const GROUND_STAMP_KEYS = { flowers: 'ground-flowers', tuft: 'ground-tuft', mushroom: 'ground-mushroom', pebbles: 'ground-pebbles', shell: 'ground-shell' } as const;
export const STAMP_SIZE = 20;
export const GLINT_KEY = 'water-glint';
export const GLINT_SIZE = { width: 28, height: 12 } as const;
export const SHORE_WAVE_KEY = 'shore-wave';
export const SHORE_WAVE_SIZE = { width: 48, height: 14 } as const;
export const TAP_RING_KEY = 'tap-ring';
export const TAP_RING_SIZE = 128;
/** The outer edge of the tap ring as a fraction of half its size (the ring is drawn 18 px inside, with a 5 px line). */
export const TAP_RING_OUTER_FRACTION = 0.89;
export const PUFF_KEY = 'puff';
export const PUFF_SIZE = 64;
export const SMOKE_KEY = 'smoke';
export const SMOKE_SIZE = 32;
export const BOAT_BACK_KEY = 'resident-boat-back';
export const BOAT_FRONT_KEY = 'resident-boat-front';
export const RESIDENT_RING_KEY = 'resident-ring';
export const SLEEP_KEY = 'resident-sleep';
export const TITLE_KEY = 'title-scene';
export const HAND_KEY = 'ui-hand';

export function moodKey(mood: string): string {
  return `mood-${mood}`;
}

/** Where trees and rocks stand: the foot point as a fraction of the picture (for `setOrigin`). */
export const OBJECT_ORIGIN = { tree: { x: 0.5, y: 0.92 }, rock: { x: 0.5, y: 0.86 } } as const;

/** Size of the picture of a building type: its footprint plus a margin, and its height above the footprint. */
export function buildingSize(type: Pick<BuildingType, 'footprint' | 'look'>): { width: number; height: number } {
  return { width: type.footprint.w * TILE_SIZE + 2 * BUILDING_PAD, height: type.footprint.h * TILE_SIZE + type.look.rise + BUILDING_PAD };
}

/** Where the front edge of the footprint (bottom centre) lies in the picture of a building, as fraction (for `setOrigin`). */
export function buildingOrigin(type: Pick<BuildingType, 'footprint' | 'look'>): { x: number; y: number } {
  const { height } = buildingSize(type);
  return { x: 0.5, y: (height - BUILDING_PAD) / height };
}

const SHAPE_SUBJECTS: Readonly<Record<string, string>> = {
  mushroomHouse: 'a cosy round mushroom house: a cream stem with a little round belly, a wooden arched door, two round windows, a big domed cap with white dots',
  gardenHouse: 'a mushroom house with a small garden beside it: a picket fence, flower beds and a tiny path',
  flower: 'a small group of three garden flowers with five round petals and green leaves',
  bush: 'a round leafy bush with a few red berries',
  fence: 'a short wooden picket fence with rounded tops, two posts and a rail',
  bench: 'a small wooden park bench with a backrest',
  lantern: 'a little garden lantern on a dark post with a warm glowing lamp',
  fountain: 'a round stone fountain with splashing water and a basin',
  flowerbed: 'a long flower bed with soft soil and colourful flowers in a row',
  pond: 'a small round pond with water lilies, reeds and stones around it',
  lumberjackHut: 'a small log cabin of a woodcutter with a chimney, an axe in a stump and stacked logs',
  berryGarden: 'a berry garden: rows of round berry bushes with red berries in dark soil, a little wooden sign',
  quarry: 'a small quarry: grey boulders, cut stone blocks, a pick and a cart',
  carpenterShop: 'a carpenter workshop with a wide door, a stove pipe, a saw and planks outside',
  bakery: 'a cosy bakery with a round window, a chimney, a bread sign and a bench with fresh loaves',
  market: 'a village market: two stalls with striped awnings, baskets of goods and a scale',
  islandTree: 'a young round leafy tree in a small patch of soil, ready to be planted',
  islandRock: 'a single rounded grey boulder on a small patch of ground',
  islandBeach: 'one tile of beach sand with small ripples and a shell',
  islandMeadow: 'one tile of fresh green meadow with grass tufts',
  invite: 'a small sailing boat with a white sail carrying one gnome with a red pointed hat',
};

const GOOD_SUBJECTS: Readonly<Record<string, string>> = {
  coins: 'two shiny golden coins, one in front of the other',
  wood: 'three stacked wooden logs with light cut ends',
  stone: 'one rounded grey stone block',
  berries: 'a small bunch of red berries with a leaf',
  furniture: 'a small wooden chair',
  cake: 'a two-layer cake with white icing and a berry on top',
  tree: 'a small round tree',
  rock: 'one rounded grey stone',
};

const UI_SUBJECTS: Readonly<Record<string, string>> = {
  'tool-path': 'button symbol: four stone path tiles in an L shape',
  'tool-shop': 'button symbol: a little market stall with a red and white striped awning and a coin',
  'tool-move': 'button symbol: a cross of four arrows (move)',
  'tool-demolish': 'button symbol: a wooden hammer, tilted',
  'tab-houses': 'tab symbol: a red mushroom house',
  'tab-deco': 'tab symbol: a pink flower',
  'tab-production': 'tab symbol: a wooden workshop with a red roof and a chimney',
  'tab-island': 'tab symbol: a tiny sand island with one tree in the sea',
  'move-home': 'button symbol: an arrow pointing into a mushroom house',
  lock: 'a golden padlock (something is still locked)',
  star: 'a golden five-pointed star with a white rim (something new)',
  'file-save': 'button symbol: an arrow down into a tray (save a file)',
  'file-load': 'button symbol: an arrow up out of a tray (load a file)',
  'sound-on': 'button symbol: a loudspeaker with two sound waves',
  'sound-off': 'button symbol: a loudspeaker with a small red cross',
  music: 'button symbol: two musical notes',
  moon: 'a friendly sleeping crescent-like full moon with a soft glow',
  'night-star': 'a small twinkling night star with a soft glow',
};

function entry(key: string, group: AssetGroup, width: number, height: number, subject: string, draw: (s: Svg) => void, extra: Partial<AssetEntry> = {}): AssetEntry {
  return { key, group, width, height, scale: ART_SCALE, subject, draw, ...extra };
}

function buildEntries(): AssetEntry[] {
  const list: AssetEntry[] = [];
  const pattern = (key: string, subject: string, draw: (s: Svg) => void): AssetEntry =>
    entry(key, 'ground', PATTERN_SIZE, PATTERN_SIZE, `${subject}, seen from straight above, filling the whole square edge to edge, seamless tile (left joins right, top joins bottom), no objects, no shadows`, draw, {
      scale: 1,
      tiles: true,
    });
  list.push(
    pattern(GROUND_PATTERN_KEYS.grass, 'soft green meadow grass with lighter and darker patches and tiny tufts', drawGrassPattern),
    pattern(GROUND_PATTERN_KEYS.forest, 'dark green forest floor with moss, fallen needles and a few leaves', drawForestPattern),
    pattern(GROUND_PATTERN_KEYS.rock, 'grey stony ground with flat slabs and pebbles', drawRockPattern),
    pattern(GROUND_PATTERN_KEYS.sand, 'warm light beach sand with soft ripples and specks', drawSandPattern),
    pattern(GROUND_PATTERN_KEYS.water, 'calm deep turquoise sea water with small light wave lines', drawWaterPattern),
  );
  const stamp = (key: string, subject: string, draw: (s: Svg) => void): AssetEntry => entry(key, 'ground', STAMP_SIZE, STAMP_SIZE, `${subject}, tiny detail lying on the ground, seen from above`, draw, { scale: 1 });
  list.push(
    stamp(GROUND_STAMP_KEYS.flowers, 'three tiny meadow flowers', drawGroundFlowers),
    stamp(GROUND_STAMP_KEYS.tuft, 'a tuft of grass', drawGroundTuft),
    stamp(GROUND_STAMP_KEYS.mushroom, 'a tiny red toadstool with white dots', drawGroundMushroom),
    stamp(GROUND_STAMP_KEYS.pebbles, 'three small grey pebbles', drawGroundPebbles),
    stamp(GROUND_STAMP_KEYS.shell, 'a small sea shell', drawGroundShell),
  );
  const trees: readonly [string, number, number, string, (s: Svg) => void][] = [
    ['tree-round', 84, 108, 'a round leafy tree with a brown trunk and a red apple', drawRoundTree],
    ['tree-pine', 72, 120, 'a soft rounded pine tree of four tiers', drawPineTree],
    ['tree-blossom', 84, 104, 'a round tree full of small pink blossoms', drawBlossomTree],
  ];
  for (const [key, width, height, subject, draw] of trees) {
    list.push(entry(key, 'nature', width, height, subject, draw, { anchor: { x: width * OBJECT_ORIGIN.tree.x, y: height * OBJECT_ORIGIN.tree.y } }));
  }
  const rocks: readonly [string, number, number, string, (s: Svg) => void][] = [
    ['rock-big', 96, 78, 'a big rounded grey boulder with a smaller one beside it', drawBigRock],
    ['rock-pair', 100, 66, 'two rounded grey rocks side by side', drawRockPair],
    ['rock-small', 72, 58, 'a small rounded grey rock with a grass tuft', drawSmallRock],
  ];
  for (const [key, width, height, subject, draw] of rocks) {
    list.push(entry(key, 'nature', width, height, subject, draw, { anchor: { x: width * OBJECT_ORIGIN.rock.x, y: height * OBJECT_ORIGIN.rock.y } }));
  }
  list.push(
    entry(GLINT_KEY, 'effect', GLINT_SIZE.width, GLINT_SIZE.height, 'a small bright glint of light on water, a short white arc', drawGlint),
    entry(SHORE_WAVE_KEY, 'effect', SHORE_WAVE_SIZE.width, SHORE_WAVE_SIZE.height, 'a small white foam wave line, a flat arc', drawShoreWave),
    entry(TAP_RING_KEY, 'effect', TAP_RING_SIZE, TAP_RING_SIZE, 'a soft white glowing ring (marks a tapped spot)', drawRing),
    entry(PUFF_KEY, 'effect', PUFF_SIZE, PUFF_SIZE, 'a soft round white puff of dust', drawPuff),
    entry(SMOKE_KEY, 'effect', SMOKE_SIZE, SMOKE_SIZE, 'a small soft grey-white curl of chimney smoke', drawSmoke),
  );

  for (const type of BUILDING_TYPES) {
    const draw: ((s: Svg, look: BuildingLook) => void) | undefined = type.look.shape === 'invite' ? drawInvite : BUILDING_DRAWERS[type.look.shape];
    if (!draw) {
      continue;
    }
    const { width, height } = buildingSize(type);
    const look = { shape: type.look.shape, ...(type.look.palette ? { palette: type.look.palette } : {}), ...(type.look.scale ? { scale: type.look.scale } : {}) };
    const colour = type.look.palette ? ` (main colour of the cap or roof: ${type.look.palette})` : '';
    const subject = `${SHAPE_SUBJECTS[type.look.shape] ?? type.look.shape}${colour}; it stands on a ground area of ${String(type.footprint.w)} × ${String(type.footprint.h)} tiles`;
    list.push(entry(buildingKey(type.id), 'building', width, height, subject, (s) => draw(s, look), { anchor: { x: width / 2, y: height - BUILDING_PAD } }));
  }
  for (let mask = 0; mask < 16; mask += 1) {
    const ways = [
      [1, 'up'],
      [2, 'right'],
      [4, 'down'],
      [8, 'left'],
    ]
      .filter(([bit]) => (mask & Number(bit)) !== 0)
      .map(([, name]) => name);
    const subject = `one tile of a light stone path seen from above, ${ways.length === 0 ? 'a single round patch' : `leading ${ways.join(', ')} to the edge of the tile`}, transparent elsewhere`;
    list.push(entry(pathKey(mask), 'path', TILE_SIZE, TILE_SIZE, subject, (s) => drawPathTile(s, mask)));
  }
  const signSubject = (what: string): string => `a round friendly sign bubble with a short point at the bottom and a small red "!" badge, showing ${what} inside`;
  list.push(entry(PATH_SIGN_KEY, 'sign', SIGN_SIZE.width, SIGN_SIZE.height, signSubject('a few stone path tiles'), drawPathSign, { anchor: { x: SIGN_SIZE.width / 2, y: SIGN_SIZE.height } }));
  for (const id of [...NEARBY_IDS, ...ITEM_IDS.map((good) => `good-${good}`)]) {
    const good = id.startsWith('good-') ? id.slice(5) : id;
    list.push(
      entry(signKey(id), 'sign', SIGN_SIZE.width, SIGN_SIZE.height, signSubject(GOOD_SUBJECTS[good] ?? good), (s) => drawNeedSign(s, good), {
        anchor: { x: SIGN_SIZE.width / 2, y: SIGN_SIZE.height },
      }),
    );
  }
  for (const id of ITEM_IDS) {
    list.push(entry(goodKey(id), 'good', GOOD_BOX, GOOD_BOX, `small symbol: ${GOOD_SUBJECTS[id] ?? id}`, (s) => s.add(drawGoodIcon(s, id))));
  }
  for (const id of NEARBY_IDS) {
    list.push(entry(needKey(id), 'good', GOOD_BOX, GOOD_BOX, `small symbol: ${GOOD_SUBJECTS[id] ?? id}`, (s) => s.add(drawGoodIcon(s, id))));
  }

  for (const hat of HAT_IDS) {
    list.push(
      entry(
        residentKey(hat),
        'figure',
        RESIDENT_SIZE.width,
        RESIDENT_SIZE.height,
        `a small round friendly gnome standing, front view: big eyes, cheeks ${hex(COLORS.cheek)}, a soft pointed hat whose tip falls to the side with a pompom (hat colour: ${hat}, ${hex(hatColors(hat).hat)}), a simple tunic and trousers ${hex(COLORS.tunic)}, round shoes ${hex(COLORS.shoe)}; skin ${hex(COLORS.skin)} with shading ${hex(COLORS.skinShade)}`,
        (s) => drawResident(s, hatColors(hat)),
        { anchor: RESIDENT_FOOT, colours: [COLORS.skin, COLORS.skinShade, COLORS.cheek, COLORS.tunic, COLORS.shoe, hatColors(hat).hat] },
      ),
    );
  }
  list.push(
    entry(BOAT_BACK_KEY, 'figure', BOAT_SIZE.width, BOAT_SIZE.height, 'the back part of a small sailing boat: only the mast, a white sail and ripples on the water (the hull is a separate picture)', drawBoatBack, { anchor: BOAT_WATER }),
    entry(BOAT_FRONT_KEY, 'figure', BOAT_SIZE.width, BOAT_SIZE.height, 'the front part of a small sailing boat: only the round wooden hull with a light rim (mast and sail are a separate picture)', drawBoatFront, { anchor: BOAT_WATER }),
    entry(RESIDENT_RING_KEY, 'figure', RING_SIZE.width, RING_SIZE.height, 'a flat golden oval ring lying on the ground (marks the chosen figure)', drawResidentRing),
    entry(moodKey('happy'), 'mood', MOOD_SIZE, MOOD_SIZE, 'a red heart with a white rim (happy)', drawHeart),
    entry(moodKey('normal'), 'mood', MOOD_SIZE, MOOD_SIZE, 'a round yellow face with a straight mouth and a white rim (all right)', drawFace),
    entry(moodKey('sad'), 'mood', MOOD_SIZE, MOOD_SIZE, 'a small grey-blue cloud with one blue drop and a white rim (sad)', drawCloud),
    entry(SLEEP_KEY, 'mood', SLEEP_SIZE, SLEEP_SIZE, 'three warm white letters z of growing size with a dark blue rim and a soft warm glow, rising to the top right (sleeping, seen over a dark night sky)', drawSleep),
  );

  for (const [name, draw] of Object.entries(UI_ICONS)) {
    list.push(entry(uiKey(name), 'ui', ICON_BOX, ICON_BOX, UI_SUBJECTS[name] ?? name, draw));
  }
  list.push(entry(HAND_KEY, 'ui', HAND_SIZE.width, HAND_SIZE.height, 'a white cartoon hand with a dark rim, the index finger pointing straight down (shows where to tap)', drawHand, { anchor: HAND_TIP }));
  list.push(
    entry(
      TITLE_KEY,
      'title',
      TITLE_SIZE.width,
      TITLE_SIZE.height,
      'the title picture: a small round island in the sea seen slightly from above with three mushroom houses, a stone path, trees, flowers, three small gnomes with pointed hats and a little sailing boat arriving; transparent around the island, no text',
      drawTitle,
    ),
  );
  return list;
}

export const ASSETS: readonly AssetEntry[] = buildEntries();

const BY_KEY: ReadonlyMap<string, AssetEntry> = new Map(ASSETS.map((asset) => [asset.key, asset]));

export function assetEntry(key: string): AssetEntry | undefined {
  return BY_KEY.get(key);
}

/** The SVG document of one picture, at its texture size (logical size × scale). */
export function assetSvg(asset: AssetEntry): string {
  const s = new Svg(asset.width, asset.height);
  asset.draw(s);
  return s.toString(asset.scale);
}

/** The size of the texture of a picture in pixels. */
export function textureSize(asset: Pick<AssetEntry, 'width' | 'height' | 'scale'>): { width: number; height: number } {
  return { width: Math.round(asset.width * asset.scale), height: Math.round(asset.height * asset.scale) };
}
