import { describe, expect, it } from 'vitest';
import { BUILDING_SHAPES, BUILDING_TYPES, SHOP_CATEGORIES } from '../../src/data/buildings';
import { ITEM_IDS } from '../../src/data/goods';
import { HAT_IDS } from '../../src/data/residents';
import {
  ASSETS,
  GROUND_PATTERN_KEYS,
  GROUND_STAMP_KEYS,
  ROCK_KEYS,
  TREE_KEYS,
  assetEntry,
  assetSvg,
  buildingKey,
  buildingOrigin,
  buildingSize,
  goodKey,
  needKey,
  pathKey,
  residentKey,
  signKey,
  textureSize,
  uiKey,
} from '../../src/art/catalog';
import { BUILDING_DRAWERS } from '../../src/art/village';
import { TOOLS } from '../../src/ui/buildTool';
import { TILE_SIZE } from '../../src/ui/style';

describe('Bilder-Katalog (M9)', () => {
  it('jeder Schlüssel kommt genau einmal vor und taugt als Dateiname', () => {
    const keys = ASSETS.map((asset) => asset.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('jede Form aus buildings.json (außer dem Weg) wird gezeichnet und von mindestens einem Typ benutzt', () => {
    for (const shape of BUILDING_SHAPES) {
      if (shape !== 'path') {
        expect(shape === 'invite' || shape in BUILDING_DRAWERS, shape).toBe(true);
        expect(BUILDING_TYPES.some((type) => type.look.shape === shape), shape).toBe(true);
      }
    }
  });

  it('jeder Bautyp (außer dem Weg) hat ein Bild in der Größe seines Grundrisses, das auf dem Boden der Kachel steht', () => {
    for (const type of BUILDING_TYPES) {
      if (type.category === 'path') {
        continue;
      }
      const asset = assetEntry(buildingKey(type.id));
      expect(asset, type.id).toBeDefined();
      const { width, height } = buildingSize(type);
      expect(asset?.width).toBe(width);
      expect(asset?.height).toBe(height);
      expect(width, type.id).toBeGreaterThanOrEqual(type.footprint.w * TILE_SIZE);
      expect(height, type.id).toBeGreaterThanOrEqual(type.footprint.h * TILE_SIZE);
      const origin = buildingOrigin(type);
      expect(origin.x).toBe(0.5);
      expect(origin.y).toBeGreaterThan(0.5);
      expect(origin.y).toBeLessThan(1);
      expect(asset?.anchor?.y).toBeCloseTo(origin.y * height);
    }
  });

  it('alle Bilder, die das Spiel benutzt, sind im Katalog', () => {
    const needed = [
      ...TREE_KEYS,
      ...ROCK_KEYS,
      ...Object.values(GROUND_PATTERN_KEYS),
      ...Object.values(GROUND_STAMP_KEYS),
      ...Array.from({ length: 16 }, (_, mask) => pathKey(mask)),
      ...ITEM_IDS.flatMap((id) => [goodKey(id), signKey(`good-${id}`)]),
      ...['tree', 'rock'].flatMap((id) => [needKey(id), signKey(id)]),
      signKey('path'),
      ...HAT_IDS.map(residentKey),
      ...TOOLS.map((tool) => uiKey(`tool-${tool}`)),
      ...SHOP_CATEGORIES.map((category) => uiKey(`tab-${category}`)),
      ...['move-home', 'lock', 'star', 'hand', 'file-save', 'file-load', 'sound-on', 'sound-off', 'music', 'moon', 'night-star'].map(uiKey),
      'mood-happy',
      'mood-normal',
      'mood-sad',
      'resident-sleep',
      'resident-ring',
      'resident-boat-back',
      'resident-boat-front',
      'water-glint',
      'shore-wave',
      'tap-ring',
      'puff',
      'smoke',
      'title-scene',
    ];
    for (const key of needed) {
      expect(assetEntry(key), key).toBeDefined();
    }
  });

  it('jedes Bild ist ein SVG-Dokument in Texturgröße, ohne kaputte Zahlen und mit eindeutigen Verläufen', () => {
    for (const asset of ASSETS) {
      const svg = assetSvg(asset);
      const size = textureSize(asset);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), asset.key).toBe(true);
      expect(svg, asset.key).toContain(`width="${String(size.width)}" height="${String(size.height)}"`);
      expect(svg, asset.key).toContain(`viewBox="0 0 ${String(asset.width)} ${String(asset.height)}"`);
      expect(svg, asset.key).not.toMatch(/NaN|undefined|Infinity/);
      const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
      expect(new Set(ids).size, asset.key).toBe(ids.length);
      for (const used of svg.matchAll(/url\(#([^)]+)\)/g)) {
        expect(ids, `${asset.key}: ${String(used[1])}`).toContain(used[1]);
      }
      // Some shapes must be there (a picture is never empty).
      expect(svg.length, asset.key).toBeGreaterThan(200);
    }
  });

  it('dasselbe Bild kommt jedes Mal gleich heraus (kein Zufall in den Zeichnungen)', () => {
    for (const asset of ASSETS) {
      expect(assetSvg(asset)).toBe(assetSvg(asset));
    }
  });

  it('der Boden wird 1:1 gemalt, alles andere doppelt so fein', () => {
    for (const asset of ASSETS) {
      expect(asset.scale, asset.key).toBe(asset.group === 'ground' ? 1 : 2);
    }
  });

  it('Bewohner haben ihre Mützenfarbe und den Fußpunkt zwischen den Füßen', () => {
    const red = assetEntry(residentKey('red'));
    const blue = assetEntry(residentKey('blue'));
    if (!red || !blue) {
      throw new Error('Bewohner fehlen im Katalog');
    }
    expect(assetSvg(red)).not.toBe(assetSvg(blue));
    const asset = red;
    expect(asset?.anchor).toEqual({ x: 20, y: 63 });
  });
});
