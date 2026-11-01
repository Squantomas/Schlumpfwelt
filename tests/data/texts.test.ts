import { describe, expect, it } from 'vitest';
import texts from '../../src/data/texts.de.json';
import { missingParams } from '../../src/ui/costText';
import theme from '../../src/data/theme.json';

import { format, formatNumber, placeholdersOf, t, themeValues, type TextKey } from '../../src/data/texts';

/**
 * Placeholders that are filled at runtime via `t(key, params)` instead of the
 * theme. Add new names here when a text needs one (e.g. `count`).
 */
const RUNTIME_PLACEHOLDERS = new Set<string>(['count', 'name', 'list', 'way', 'good', 'current', 'needed', 'news', 'valuable', 'job', 'color', 'house', 'activity', 'mood', 'reason', 'a', 'b', 'minutes', 'used', 'allowed']);

const keys = Object.keys(texts) as TextKey[];

describe('t()', () => {
  it('liefert die Texte aus texts.de.json', () => {
    expect(t('boot.tapToPlay')).toBe('Tippen zum Spielen');
  });

  it('füllt den Spielnamen aus dem Theme', () => {
    expect(t('app.title')).toBe(theme.gameName);
    expect(t('boot.title')).toBe(theme.gameName);
  });
});

describe('format()', () => {
  it('füllt alle Begriffe aus dem Theme', () => {
    expect(format('{creatures} im {village}')).toBe(`${theme.terms.creatures} im ${theme.terms.village}`);
  });

  it('füllt Parameter und formatiert Zahlen deutsch', () => {
    expect(format('{name} hat {count} Beeren', { name: 'Ole', count: 1234 })).toBe('Ole hat 1.234 Beeren');
  });

  it('lässt Parameter Vorrang vor dem Theme', () => {
    expect(format('{gameName}', { gameName: 'Testwelt' })).toBe('Testwelt');
  });

  it('lässt unbekannte Platzhalter sichtbar stehen', () => {
    expect(format('Hallo {niemand}!')).toBe('Hallo {niemand}!');
  });

  it('greift nicht auf geerbte Eigenschaften zu', () => {
    expect(format('{toString}')).toBe('{toString}');
    expect(format('{constructor}', {})).toBe('{constructor}');
  });

  it('ersetzt mehrfach vorkommende Platzhalter', () => {
    expect(format('{a}-{a}', { a: 1 })).toBe('1-1');
  });
});

describe('formatNumber()', () => {
  it('schreibt Zahlen deutsch mit Tausenderpunkt', () => {
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(1234)).toBe('1.234');
    expect(formatNumber(99999)).toBe('99.999');
  });

  it('macht aus „+{count}“ das „+1“ über den Gebäuden', () => {
    expect(t('effect.plus', { count: 1 })).toBe('+1');
    expect(t('effect.plus', { count: 1500 })).toBe('+1.500');
  });
});

describe('placeholdersOf()', () => {
  it('findet alle Platzhalter ohne Doppelte', () => {
    expect(placeholdersOf('{a} und {b} und {a}')).toEqual(['a', 'b']);
    expect(placeholdersOf('kein Platzhalter')).toEqual([]);
  });
});

describe('texts.de.json', () => {
  it('enthält nur nicht-leere Texte', () => {
    for (const key of keys) {
      expect(texts[key].trim(), key).not.toBe('');
    }
  });

  it('verwendet nur Platzhalter aus dem Theme oder bekannte Laufzeit-Parameter', () => {
    for (const key of keys) {
      for (const name of placeholdersOf(texts[key])) {
        const known = themeValues.has(name) || RUNTIME_PLACEHOLDERS.has(name);
        expect(known, `${key}: unbekannter Platzhalter {${name}}`).toBe(true);
      }
    }
  });
});

describe('theme.json', () => {
  it('hat einen Spielnamen und nur nicht-leere Begriffe', () => {
    expect(theme.gameName.trim()).not.toBe('');
    for (const [name, value] of Object.entries(theme.terms)) {
      expect(value.trim(), name).not.toBe('');
    }
  });
});

describe('Hinweis mit Ausweg', () => {
  const longest = (missing: Record<string, number>, key: 'hint.missing' | 'hint.missingOne'): string => t(key, missingParams(missing));

  it('nennt den Ausweg zur ersten fehlenden Sache: Taler → Markt, Holz → Holzfäller, Stein → Steinbruch', () => {
    expect(longest({ coins: 5 }, 'hint.missing')).toBe('Dir fehlen 5 Taler. Taler bringt der Markt – oder reiß etwas ab.');
    expect(longest({ wood: 3 }, 'hint.missing')).toBe('Dir fehlen 3 Holz. Holz bringt der Holzfäller – oder reiß etwas ab.');
    expect(longest({ stone: 2 }, 'hint.missing')).toBe('Dir fehlen 2 Steine. Steine bringt der Steinbruch – oder reiß etwas ab.');
    expect(longest({ stone: 1 }, 'hint.missingOne')).toBe('Dir fehlt 1 Stein. Steine bringt der Steinbruch – oder reiß etwas ab.');
  });

  it('nennt bei mehreren fehlenden Dingen den Ausweg zum ersten (Taler vor Holz vor Stein)', () => {
    expect(longest({ coins: 30, wood: 8, stone: 2 }, 'hint.missing')).toContain('Taler bringt der Markt');
    expect(longest({ wood: 8, stone: 2 }, 'hint.missing')).toContain('Holz bringt der Holzfäller');
  });

  it('bleibt kurz genug für die Hinweisleiste eines Handys quer (höchstens drei Zeilen, etwa 100 Zeichen)', () => {
    const worst = longest({ coins: 40, wood: 14, stone: 5 }, 'hint.missing');
    expect(worst.length).toBeLessThanOrEqual(100);
  });
});
