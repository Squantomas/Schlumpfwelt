import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { HINT_MIN_HEIGHT, hintBarGeometry, layoutBuildUi, zoomLayout, type BuildLayout } from '../../src/ui/buildLayout';
import { MIN_TAP_SIZE } from '../../src/ui/style';

const SCREENS: readonly (readonly [number, number])[] = [
  [320, 568],
  [568, 320],
  [640, 360],
  [360, 640],
  [667, 375],
  [768, 1024],
  [1024, 768],
  [1280, 800],
];

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width - 0.001 && b.x < a.x + a.width - 0.001 && a.y < b.y + b.height - 0.001 && b.y < a.y + a.height - 0.001;
}

function parts(layout: BuildLayout): [string, Rect][] {
  const list: [string, Rect | undefined][] = [
    ['Werkzeugleiste', layout.toolbar.rect],
    ['Hinweisleiste', layout.hint],
    ['Zoom-Knöpfe', layout.zoom.rect],
    ['Auswahl', layout.picker?.rect],
    ['Chip', layout.chip],
    ['✓', layout.confirm],
    ['✕', layout.cancel],
  ];
  return list.filter((entry): entry is [string, Rect] => entry[1] !== undefined);
}

describe('layoutBuildUi: nichts überlappt, nichts ragt über den Rand', () => {
  for (const [width, height] of SCREENS) {
    for (const variants of [3, 6]) {
      for (const pickerOpen of [true, false]) {
        for (const hasPreview of [true, false]) {
          // Zweizeiliger und fünfzeiliger Hinweis (schmale Schirme brechen um).
          for (const hintHeight of [HINT_MIN_HEIGHT, 120]) {
            const label = `${String(width)}×${String(height)}, ${String(variants)} Varianten, Auswahl ${pickerOpen ? 'offen' : 'als Chip'}, ${hasPreview ? 'mit' : 'ohne'} Vorschau, Hinweis ${String(hintHeight)} px`;
            it(label, () => {
              const layout = layoutBuildUi({ width, height, toolCount: 5, variantCount: variants, pickerOpen, hasPreview, hintHeight, hintAtTop: true });
              // Reicht die Höhe bei offener Auswahl und Vorschau nicht, schließt das UI zuerst die Vorschau – dann gibt es diesen Fall nicht.
              if (pickerOpen && hasPreview && !layout.pickerFitsWithPreview) {
                return;
              }
              const all = parts(layout);
              for (const [name, rect] of all) {
                expect(rect.x, `${name} links`).toBeGreaterThanOrEqual(-0.001);
                expect(rect.y, `${name} oben`).toBeGreaterThanOrEqual(-0.001);
                expect(rect.x + rect.width, `${name} rechts`).toBeLessThanOrEqual(width + 0.001);
                expect(rect.y + rect.height, `${name} unten`).toBeLessThanOrEqual(height + 0.001);
              }
              for (let i = 0; i < all.length; i += 1) {
                for (let j = i + 1; j < all.length; j += 1) {
                  const a = all[i];
                  const b = all[j];
                  if (a && b) {
                    expect(intersects(a[1], b[1]), `${a[0]} überdeckt ${b[0]}`).toBe(false);
                  }
                }
              }
            });
          }
        }
      }
    }
  }

  it.each(SCREENS)('lässt bei %i×%i im Anschauen die Notiz über der Werkzeugleiste frei von den Zoom-Knöpfen', (width, height) => {
    const layout = layoutBuildUi({ width, height, toolCount: 5, variantCount: 0, pickerOpen: true, hasPreview: false, hintHeight: 60, hintAtTop: false });
    expect(layout.hint).toBeDefined();
    if (layout.hint) {
      expect(intersects(layout.hint, layout.toolbar.rect)).toBe(false);
      expect(intersects(layout.hint, layout.zoom.rect)).toBe(false);
      expect(layout.hint.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Auswahl auf niedrigen Schirmen', () => {
  it('blättert mit Pfeilen, sobald der Platz für Deko nicht reicht (568×320)', () => {
    const layout = layoutBuildUi({ width: 568, height: 320, toolCount: 5, variantCount: 6, pickerOpen: true, hasPreview: false, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(layout.picker?.paged).toBe(true);
    expect(layout.picker?.fits).toBe(true);
    expect(layout.picker?.pages).toBeGreaterThan(1);
  });

  it('zeigt 3 Häuser ohne Pfeile, wenn sie ganz passen (568×320)', () => {
    const layout = layoutBuildUi({ width: 568, height: 320, toolCount: 5, variantCount: 3, pickerOpen: true, hasPreview: false, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(layout.picker?.paged).toBe(false);
  });

  it('spart die Zoom-Spalte aus, wenn die Auswahl bis zu den Zoom-Knöpfen hinaufreicht', () => {
    const layout = layoutBuildUi({ width: 568, height: 320, toolCount: 5, variantCount: 6, pickerOpen: true, hasPreview: false, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(layout.picker?.sideInset).toBeGreaterThan(0);
  });

  it('meldet auf 568×320 mit Vorschau, dass die Auswahl nicht passt (ein Tipp auf den Chip schließt dann die Vorschau)', () => {
    const layout = layoutBuildUi({ width: 568, height: 320, toolCount: 5, variantCount: 6, pickerOpen: false, hasPreview: true, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(layout.pickerFitsWithPreview).toBe(false);
    const tablet = layoutBuildUi({ width: 1024, height: 768, toolCount: 5, variantCount: 6, pickerOpen: false, hasPreview: true, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(tablet.pickerFitsWithPreview).toBe(true);
  });
});

describe('Zoom-Knöpfe und Hinweisleiste', () => {
  it.each(SCREENS)('haben bei %i×%i große Knöpfe in der Spalte rechts, die die Hinweisleiste frei lässt', (width, height) => {
    const zoom = zoomLayout(width, height);
    expect(zoom.radius * 2).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
    const bar = hintBarGeometry(width);
    expect(bar.x + bar.width).toBeLessThanOrEqual(zoom.rect.x + 0.001);
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(zoom.rect.x + zoom.rect.width).toBeLessThanOrEqual(width);
  });
});
