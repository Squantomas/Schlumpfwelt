import { describe, expect, it } from 'vitest';
import { amountText, itemName, listText, totalUnits } from '../../src/ui/costText';

describe('costText', () => {
  it('schreibt Mengen mit Einzahl und Mehrzahl', () => {
    expect(amountText('stone', 1)).toBe('1 Stein');
    expect(amountText('stone', 2)).toBe('2 Steine');
    expect(amountText('wood', 3)).toBe('3 Holz');
    expect(amountText('coins', 20)).toBe('20 Taler');
    expect(amountText('berries', 1)).toBe('1 Beere');
    expect(amountText('cake', 2)).toBe('2 Beerenkuchen');
    expect(amountText('furniture', 1)).toBe('1 Möbelstück');
  });

  it('formatiert große Zahlen deutsch und lässt unbekannte Dinge sichtbar', () => {
    expect(amountText('coins', 1500)).toBe('1.500 Taler');
    expect(amountText('unicorn', 2)).toBe('2 unicorn');
    expect(itemName('unicorn')).toBe('unicorn');
  });

  it('nennt Namen im Plural oder Singular', () => {
    expect(itemName('stone')).toBe('Steine');
    expect(itemName('stone', 1)).toBe('Stein');
  });

  it('macht Listen in der Reihenfolge des Lagers: Taler zuerst', () => {
    expect(listText({})).toBe('');
    expect(listText({ wood: 3 })).toBe('3 Holz');
    expect(listText({ wood: 3, coins: 20 })).toBe('20 Taler und 3 Holz');
    expect(listText({ stone: 2, wood: 3, coins: 1 })).toBe('1 Taler, 3 Holz und 2 Steine');
    expect(listText({ wood: 0, stone: 2 })).toBe('2 Steine');
  });

  it('zählt die Einheiten', () => {
    expect(totalUnits({})).toBe(0);
    expect(totalUnits({ coins: 3, wood: 1 })).toBe(4);
  });
});
