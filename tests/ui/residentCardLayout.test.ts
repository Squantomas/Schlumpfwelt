import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES } from '../../src/data/buildings';
import { HAT_IDS } from '../../src/data/residents';
import { t, type TextKey } from '../../src/data/texts';
import type { Rect } from '../../src/ui/cameraMath';
import { layoutBuildUi } from '../../src/ui/buildLayout';
import type { MoodFactors } from '../../src/sim/mood';
import { CARD_MIN_FONT, CARD_ROW_GAP, COMPACT_ROWS, MOVE_MIN_W, TALL_ROWS, fitRows, oneLineHeight, residentCardLayout } from '../../src/ui/residentCardLayout';
import { moodLine, moodTip } from '../../src/ui/residentInfo';
import { MIN_TAP_SIZE } from '../../src/ui/style';

const SCREENS = [
  [320, 568],
  [568, 320],
  [640, 360],
  [360, 640],
  [1024, 768],
  [768, 1024],
  [1280, 800],
  [390, 844],
  [844, 390],
  [320, 480],
  [1366, 1024],
] as const;

function cardOf(width: number, height: number) {
  const layout = layoutBuildUi({
    width,
    height,
    toolCount: 4,
    stockCount: 6,
    shopOpen: false,
    shopCount: 6,
    shopTabs: 4,
    hasChip: false,
    hasPreview: false,
    hintAtTop: false,
    hasMenu: false,
    infoOpen: true,
    residentOpen: true,
    hintHeight: 0,
  });
  return layout.card;
}

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - 0.001 && inner.y >= outer.y - 0.001 && inner.x + inner.width <= outer.x + outer.width + 0.001 && inner.y + inner.height <= outer.y + outer.height + 0.001;

const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.width - 0.001 && b.x < a.x + a.width - 0.001 && a.y < b.y + b.height - 0.001 && b.y < a.y + a.height - 0.001;

/** A careful guess at how wide bold letters are (wider than the real font) and how a row wraps. */
const LETTER = 0.62;
function rowHeight(text: string, font: number, width: number): number {
  const perLine = Math.max(1, Math.floor(width / (LETTER * font)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(' ')) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need > perLine && used > 0) {
      lines += 1;
      used = word.length;
    } else {
      used = need;
    }
  }
  return oneLineHeight(font) + (lines - 1) * Math.ceil(font * 1.3);
}

/** The longest text each row of the card can have: job, hat, home, activity, mood, tip (compact: job, home, mood, tip). */
function longestRows(compact: boolean): string[] {
  const longest = (texts: string[]): string => texts.reduce((a, b) => (b.length > a.length ? b : a), '');
  const jobs = BUILDING_TYPES.flatMap((type) => (type.jobKey ? [t(type.jobKey)] : [])).concat(t('job.none'));
  const hats = HAT_IDS.map((id) => t('resident.hat', { color: t(`hat.${id}` as TextKey) }));
  const homes = BUILDING_TYPES.filter((type) => type.category === 'house').map((type) => t('resident.home', { house: t(type.nameKey) }));
  const goods = ['berries', 'wood', 'stone', 'cake', 'furniture'].map((id) => t(`good.${id}` as TextKey));
  const activities = ['boat', 'toWork', 'work', 'toHome', 'rest', 'stroll', 'visit', 'wait'].map((id) => t(`activity.${id}` as TextKey)).concat(goods.map((good) => t('activity.carry', { good })));
  const factors: MoodFactors[] = [];
  for (const mood of ['happy', 'normal', 'sad'] as const) {
    for (let bits = 0; bits < 16; bits += 1) {
      factors.push({ mood, homeless: (bits & 1) > 0, deco: (bits & 2) > 0, far: (bits & 4) > 0, near: false, hungry: (bits & 8) > 0 });
    }
  }
  const job = longest(jobs.map((name) => t('resident.job', { job: name })));
  const home = longest([...homes, t('resident.homeless')]);
  const mood = longest(factors.map(moodLine));
  const tip = longest(factors.map((f) => t(moodTip(f))));
  return compact ? [job, home, mood, tip] : [job, longest(hats), home, longest(activities), mood, tip];
}

describe('residentCardLayout', () => {
  it('legt Name, ✕, Bild und Zeilen in die Karte, ohne Überlappung – auf allen Schirmen, auf die die Karte passt', () => {
    for (const [width, height] of SCREENS) {
      const card = cardOf(width, height);
      expect(card, `${String(width)}×${String(height)}`).toBeDefined();
      if (!card?.fits) {
        continue;
      }
      const layout = residentCardLayout(card);
      const what = `${String(width)}×${String(height)}`;
      expect(inside(layout.rect, card.rect), what).toBe(true);
      const parts = [layout.close, layout.name, layout.picture, layout.column, layout.move, layout.mood];
      for (const part of parts) {
        expect(inside(part, layout.rect), what).toBe(true);
      }
      for (let i = 0; i < parts.length; i += 1) {
        for (let j = i + 1; j < parts.length; j += 1) {
          // The mood sits on the corner of the picture on purpose.
          if (parts[i] === layout.picture && parts[j] === layout.mood) {
            continue;
          }
          expect(overlap(parts[i] as Rect, parts[j] as Rect), `${what} ${String(i)}/${String(j)}`).toBe(false);
        }
      }
      expect(overlap(layout.picture, layout.mood), what).toBe(true);
      expect(layout.close.width, what).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
      expect(layout.close.height, what).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
      // Korrekturrunde 1: room for the word "Umziehen" at 14 px (about 71 px wide with its outline) and a bigger finger.
      expect(layout.move.width, what).toBeGreaterThanOrEqual(MOVE_MIN_W);
      expect(MOVE_MIN_W).toBeGreaterThanOrEqual(80);
      expect(layout.move.height, what).toBeGreaterThanOrEqual(MIN_TAP_SIZE + 4);
      expect(layout.mood.width, what).toBeGreaterThanOrEqual(24);
      expect(layout.rows, what).toBe(layout.compact ? COMPACT_ROWS : TALL_ROWS);
      expect(layout.picture.width, what).toBeGreaterThanOrEqual(56);
      expect(layout.column.width, what).toBeGreaterThanOrEqual(150);
      expect(layout.maxFont).toBeGreaterThanOrEqual(CARD_MIN_FONT);
    }
  });

  it('alle Zeilen passen in einer Schriftgröße von mindestens 12 px – auch mit den längsten Texten (Stimmung und Tipp dabei)', () => {
    const fonts: Record<string, number> = {};
    for (const [width, height] of SCREENS) {
      const card = cardOf(width, height);
      if (!card?.fits) {
        continue;
      }
      const layout = residentCardLayout(card);
      const rows = longestRows(layout.compact);
      expect(rows).toHaveLength(layout.rows);
      expect(rows.every((row) => row.length > 0)).toBe(true);
      const { font, heights } = fitRows(rows.length, layout.column.height, layout.maxFont, (row, size) => rowHeight(rows[row] ?? '', size, layout.column.width));
      const what = `${String(width)}×${String(height)}`;
      fonts[what] = font;
      expect(font, what).toBeGreaterThanOrEqual(CARD_MIN_FONT);
      expect(heights.reduce((sum, h) => sum + h, 0) + CARD_ROW_GAP * (rows.length - 1), what).toBeLessThanOrEqual(layout.column.height + 0.001);
    }
    // The two phone screens of the smoke test, upright and sideways, and every tablet stay well readable.
    expect(fonts['320×568']).toBeGreaterThanOrEqual(13);
    expect(fonts['568×320']).toBeGreaterThanOrEqual(14);
    expect(fonts['1024×768']).toBeGreaterThanOrEqual(16);
    expect(fonts['768×1024']).toBeGreaterThanOrEqual(16);
  });

  it('ist auf flachen Schirmen kompakt: schmaler und nicht höher als nötig, unten über der Werkzeugleiste', () => {
    for (const [width, height] of [
      [568, 320],
      [640, 360],
      [844, 390],
    ] as const) {
      const card = cardOf(width, height);
      if (!card?.fits) {
        throw new Error(`keine Karte auf ${String(width)}×${String(height)}`);
      }
      const layout = residentCardLayout(card);
      expect(layout.compact).toBe(true);
      expect(layout.rect.width).toBeLessThanOrEqual(460);
      // Only as high as four rows at 15 px need (one line each on a wide card).
      expect(layout.rect.height).toBeLessThanOrEqual(8 + 40 + 4 + 4 * oneLineHeight(15) + 3 * CARD_ROW_GAP + 8);
      expect(layout.rect.y + layout.rect.height).toBeCloseTo(card.rect.y + card.rect.height, 6);
    }
    const tall = cardOf(1024, 768);
    expect(tall && residentCardLayout(tall).compact).toBe(false);
  });

  it('stellt Bild und „Umziehen“ links neben die Zeilen, den Knopf unter das Bild', () => {
    for (const size of [
      [1024, 768],
      [568, 320],
    ] as const) {
      const card = cardOf(size[0], size[1]);
      if (!card) {
        throw new Error('no card');
      }
      const layout = residentCardLayout(card);
      expect(layout.column.x).toBeGreaterThan(layout.picture.x + layout.picture.width);
      expect(layout.column.x).toBeGreaterThan(layout.move.x + layout.move.width);
      expect(layout.move.y).toBeGreaterThanOrEqual(layout.picture.y + layout.picture.height);
    }
  });
});

describe('fitRows: eine Schriftgröße für alle Zeilen', () => {
  const lineOf = (font: number): number => oneLineHeight(font);

  it('nimmt die größte Schrift, mit der alles passt', () => {
    const fit = fitRows(4, 4 * lineOf(17) + 3 * CARD_ROW_GAP, 20, (_, font) => lineOf(font));
    expect(fit.font).toBe(17);
    expect(fit.heights).toEqual([lineOf(17), lineOf(17), lineOf(17), lineOf(17)]);
    expect(fitRows(4, 1000, 20, (_, font) => lineOf(font)).font).toBe(20);
  });

  it('geht nie unter 12 px, auch wenn es dann nicht passt', () => {
    expect(fitRows(4, 10, 20, (_, font) => lineOf(font)).font).toBe(CARD_MIN_FONT);
  });

  it('eine umbrechende Zeile macht alle kleiner, nicht nur sich selbst', () => {
    // Row 2 wraps to two lines up to 15 px.
    const measure = (row: number, font: number): number => (row === 2 && font > 15 ? 2 : 1) * lineOf(font);
    const fit = fitRows(4, 4 * lineOf(16) + 3 * CARD_ROW_GAP, 20, measure);
    expect(fit.font).toBe(15);
    expect(fit.heights.every((h) => h === lineOf(15))).toBe(true);
  });

  it('misst nur wenige Größen', () => {
    let calls = 0;
    fitRows(4, 4 * lineOf(13) + 3 * CARD_ROW_GAP, 20, (_, font) => {
      calls += 1;
      return lineOf(font);
    });
    expect(calls).toBeLessThanOrEqual(4 * 5);
  });
});
