import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES } from '../../src/data/buildings';
import { HAT_IDS } from '../../src/data/residents';
import { t, type TextKey } from '../../src/data/texts';
import type { Rect } from '../../src/ui/cameraMath';
import { layoutBuildUi } from '../../src/ui/buildLayout';
import { CARD_MIN_FONT, CARD_ROW_GAP, fitRows, oneLineHeight, residentCardLayout } from '../../src/ui/residentCardLayout';
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

/** The longest text each row of the card can have (job, hat, home, activity). */
function longestRows(): string[] {
  const longest = (texts: string[]): string => texts.reduce((a, b) => (b.length > a.length ? b : a), '');
  const jobs = BUILDING_TYPES.flatMap((type) => (type.jobKey ? [t(type.jobKey)] : [])).concat(t('job.none'));
  const hats = HAT_IDS.map((id) => t('resident.hat', { color: t(`hat.${id}` as TextKey) }));
  const homes = BUILDING_TYPES.filter((type) => type.category === 'house').map((type) => t('resident.home', { house: t(type.nameKey) }));
  const goods = ['berries', 'wood', 'stone', 'cake', 'furniture'].map((id) => t(`good.${id}` as TextKey));
  const activities = ['boat', 'toWork', 'work', 'toHome', 'rest', 'stroll', 'visit', 'wait'].map((id) => t(`activity.${id}` as TextKey)).concat(goods.map((good) => t('activity.carry', { good })));
  return [longest(jobs.map((job) => t('resident.job', { job }))), longest(hats), longest([...homes, t('resident.homeless')]), longest(activities)];
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
      const parts = [layout.close, layout.name, layout.picture, layout.column];
      for (const part of parts) {
        expect(inside(part, layout.rect), what).toBe(true);
      }
      for (let i = 0; i < parts.length; i += 1) {
        for (let j = i + 1; j < parts.length; j += 1) {
          expect(overlap(parts[i] as Rect, parts[j] as Rect), `${what} ${String(i)}/${String(j)}`).toBe(false);
        }
      }
      expect(layout.close.width, what).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
      expect(layout.close.height, what).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
      expect(layout.picture.width, what).toBeGreaterThanOrEqual(56);
      expect(layout.column.width, what).toBeGreaterThanOrEqual(150);
      expect(layout.maxFont).toBeGreaterThanOrEqual(CARD_MIN_FONT);
    }
  });

  it('alle vier Zeilen passen in einer Schriftgröße von mindestens 12 px – auch mit den längsten Texten', () => {
    const rows = longestRows();
    expect(rows.every((row) => row.length > 0)).toBe(true);
    for (const [width, height] of SCREENS) {
      const card = cardOf(width, height);
      if (!card?.fits) {
        continue;
      }
      const layout = residentCardLayout(card);
      const { font, heights } = fitRows(rows.length, layout.column.height, layout.maxFont, (row, size) => rowHeight(rows[row] ?? '', size, layout.column.width));
      const what = `${String(width)}×${String(height)}`;
      expect(font, what).toBeGreaterThanOrEqual(CARD_MIN_FONT);
      expect(font, what).toBeGreaterThanOrEqual(14);
      expect(heights.reduce((sum, h) => sum + h, 0) + CARD_ROW_GAP * 3, what).toBeLessThanOrEqual(layout.column.height + 0.001);
    }
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
      expect(layout.rect.width).toBeLessThanOrEqual(360);
      expect(layout.rect.width * layout.rect.height).toBeLessThan(card.rect.width * card.rect.height * 0.8);
      expect(layout.rect.y + layout.rect.height).toBeCloseTo(card.rect.y + card.rect.height, 6);
    }
    const tall = cardOf(1024, 768);
    expect(tall && residentCardLayout(tall).compact).toBe(false);
  });

  it('stellt das Bild links neben die Zeilen', () => {
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
