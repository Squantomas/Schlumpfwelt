import { beforeEach, describe, expect, it } from 'vitest';
import type { Point } from '../../src/ui/cameraMath';
import { GestureTracker, type GestureHandlers } from '../../src/ui/gestures';

interface Log {
  begins: number;
  pans: [number, number][];
  pinches: { from: Point; to: Point; scale: number }[];
  taps: Point[];
  flings: [number, number][];
}

let log: Log;
let tracker: GestureTracker;
/** Was `begin` zurückgibt: true = „die Berührung hat nur das Nachgleiten angehalten“. */
let swallowNextTap = false;

beforeEach(() => {
  log = { begins: 0, pans: [], pinches: [], taps: [], flings: [] };
  swallowNextTap = false;
  const handlers: GestureHandlers = {
    begin: () => {
      log.begins += 1;
      return swallowNextTap;
    },
    pan: (dx, dy) => log.pans.push([dx, dy]),
    pinch: (from, to, scale) => log.pinches.push({ from, to, scale }),
    tap: (at) => log.taps.push(at),
    fling: (vx, vy) => log.flings.push([vx, vy]),
  };
  tracker = new GestureTracker(handlers, { tapMaxMovePx: 10 });
});

describe('Tippen', () => {
  it('Berühren und Loslassen ohne Bewegung ist ein Tipp', () => {
    tracker.down(1, 100, 200, 0);
    tracker.up(1, 100, 200, 80);
    expect(log.taps).toEqual([{ x: 100, y: 200 }]);
    expect(log.pans).toEqual([]);
    expect(log.flings).toEqual([]);
  });

  it('kleine Bewegung unter der Schwelle bleibt ein Tipp', () => {
    tracker.down(1, 100, 200, 0);
    tracker.move(1, 105, 204, 20);
    tracker.up(1, 105, 204, 60);
    expect(log.taps).toHaveLength(1);
    expect(log.pans).toEqual([]);
  });

  it('genau auf der Schwelle ist es noch ein Tipp', () => {
    tracker.down(1, 0, 0, 0);
    tracker.move(1, 10, 0, 20);
    tracker.up(1, 10, 0, 40);
    expect(log.taps).toHaveLength(1);
  });

  it('Bewegung über der Schwelle ist ein Ziehen, kein Tipp', () => {
    tracker.down(1, 100, 200, 0);
    tracker.move(1, 120, 200, 20);
    tracker.up(1, 120, 200, 40);
    expect(log.taps).toEqual([]);
    expect(log.pans.length).toBeGreaterThan(0);
  });

  it('Hin- und Zurückziehen über die Schwelle ist kein Tipp mehr', () => {
    tracker.down(1, 100, 200, 0);
    tracker.move(1, 150, 200, 20);
    tracker.move(1, 100, 200, 40);
    tracker.up(1, 100, 200, 60);
    expect(log.taps).toEqual([]);
  });

  it('meldet den Beginn einer Geste', () => {
    tracker.down(1, 0, 0, 0);
    expect(log.begins).toBe(1);
  });
});

describe('Tippen: Randfälle', () => {
  it('loslassen weit vom Start ohne Bewegungsereignis ist kein Tipp (zusammengefasste Moves)', () => {
    tracker.down(1, 100, 100, 0);
    tracker.up(1, 160, 100, 80);
    expect(log.taps).toEqual([]);
    expect(log.pans).toEqual([[60, 0]]);
  });

  it('loslassen knapp innerhalb der Schwelle ist ein Tipp', () => {
    tracker.down(1, 100, 100, 0);
    tracker.up(1, 106, 108, 80);
    expect(log.taps).toEqual([{ x: 106, y: 108 }]);
  });

  it('eine Berührung, die nur das Nachgleiten anhält, ist kein Tipp', () => {
    swallowNextTap = true;
    tracker.down(1, 100, 100, 0);
    tracker.up(1, 100, 100, 60);
    expect(log.taps).toEqual([]);
    expect(log.begins).toBe(1);
  });

  it('die nächste Berührung ohne Nachgleiten tippt wieder', () => {
    swallowNextTap = true;
    tracker.down(1, 100, 100, 0);
    tracker.up(1, 100, 100, 60);
    swallowNextTap = false;
    tracker.down(1, 100, 100, 500);
    tracker.up(1, 100, 100, 560);
    expect(log.taps).toEqual([{ x: 100, y: 100 }]);
  });

  it('eine Berührung, die das Nachgleiten anhält und dann zieht, zieht trotzdem', () => {
    swallowNextTap = true;
    tracker.down(1, 100, 100, 0);
    tracker.move(1, 150, 100, 20);
    expect(log.pans).toEqual([[50, 0]]);
  });
});

describe('Ziehen', () => {
  it('meldet beim Überschreiten der Schwelle den ganzen Weg ab dem Start', () => {
    tracker.down(1, 100, 100, 0);
    tracker.move(1, 105, 100, 10);
    expect(log.pans).toEqual([]);
    tracker.move(1, 115, 100, 20);
    expect(log.pans).toEqual([[15, 0]]);
  });

  it('meldet danach nur die Änderung seit dem letzten Mal', () => {
    tracker.down(1, 100, 100, 0);
    tracker.move(1, 130, 100, 10);
    tracker.move(1, 140, 120, 20);
    tracker.move(1, 130, 120, 30);
    expect(log.pans).toEqual([
      [30, 0],
      [10, 20],
      [-10, 0],
    ]);
  });

  it('die Summe aller Schritte ist der Weg des Fingers', () => {
    tracker.down(1, 50, 50, 0);
    for (let i = 1; i <= 20; i += 1) {
      tracker.move(1, 50 + i * 7, 50 - i * 3, i * 16);
    }
    const sum = log.pans.reduce<[number, number]>((acc, [dx, dy]) => [acc[0] + dx, acc[1] + dy], [0, 0]);
    expect(sum).toEqual([140, -60]);
  });

  it('ignoriert Bewegung ohne gedrückten Zeiger', () => {
    tracker.move(1, 100, 100, 0);
    tracker.move(1, 300, 300, 10);
    expect(log.pans).toEqual([]);
  });
});

describe('Nachgleiten', () => {
  it('schnelles Ziehen und Loslassen ergibt eine Wischgeschwindigkeit', () => {
    tracker.down(1, 100, 100, 0);
    for (let i = 1; i <= 6; i += 1) {
      tracker.move(1, 100 + i * 20, 100, i * 16);
    }
    tracker.up(1, 220, 100, 100);
    expect(log.flings).toHaveLength(1);
    const [vx, vy] = log.flings[0] ?? [0, 0];
    expect(vx).toBeCloseTo(20 / 16, 5);
    expect(vy).toBe(0);
  });

  it('kein Nachgleiten, wenn der Finger vor dem Loslassen ruhte', () => {
    tracker.down(1, 100, 100, 0);
    tracker.move(1, 200, 100, 16);
    tracker.move(1, 300, 100, 32);
    tracker.up(1, 300, 100, 400);
    expect(log.flings).toEqual([]);
  });

  it('kein Nachgleiten bei langsamem Ziehen', () => {
    tracker.down(1, 100, 100, 0);
    for (let i = 1; i <= 10; i += 1) {
      tracker.move(1, 100 + i * 2, 100, i * 16);
    }
    tracker.up(1, 120, 100, 170);
    expect(log.flings).toEqual([]);
  });

  it('begrenzt die Geschwindigkeit', () => {
    tracker.down(1, 0, 0, 0);
    tracker.move(1, 500, 0, 5);
    tracker.move(1, 1000, 0, 10);
    tracker.up(1, 1000, 0, 12);
    const [vx, vy] = log.flings[0] ?? [0, 0];
    expect(Math.hypot(vx, vy)).toBeLessThanOrEqual(4 + 1e-9);
    expect(Math.hypot(vx, vy)).toBeGreaterThan(3);
  });

  it('ein Tipp löst kein Nachgleiten aus', () => {
    tracker.down(1, 100, 100, 0);
    tracker.up(1, 100, 100, 50);
    expect(log.flings).toEqual([]);
  });
});

describe('Zwei Finger (Pinch)', () => {
  it('meldet Mitte alt/neu und das Verhältnis der Abstände', () => {
    tracker.down(1, 100, 100, 0);
    tracker.down(2, 200, 100, 5);
    tracker.move(2, 300, 100, 20);
    expect(log.pinches).toHaveLength(1);
    const pinch = log.pinches[0];
    expect(pinch?.from).toEqual({ x: 150, y: 100 });
    expect(pinch?.to).toEqual({ x: 200, y: 100 });
    expect(pinch?.scale).toBeCloseTo(2, 10);
  });

  it('Finger zusammenführen ergibt einen Faktor unter 1', () => {
    tracker.down(1, 100, 100, 0);
    tracker.down(2, 300, 100, 5);
    tracker.move(1, 150, 100, 20);
    expect(log.pinches[0]?.scale).toBeCloseTo(0.75, 10);
  });

  it('zieht beim Pinch nicht', () => {
    tracker.down(1, 100, 100, 0);
    tracker.down(2, 200, 100, 5);
    tracker.move(1, 80, 100, 20);
    tracker.move(2, 220, 100, 25);
    expect(log.pans).toEqual([]);
  });

  it('endet nie als Tipp', () => {
    tracker.down(1, 100, 100, 0);
    tracker.down(2, 200, 100, 5);
    tracker.up(2, 200, 100, 30);
    tracker.up(1, 100, 100, 40);
    expect(log.taps).toEqual([]);
  });

  it('endet nie als Tipp, auch wenn die Finger kaum bewegt wurden und zuerst der erste losgelassen wird', () => {
    tracker.down(1, 100, 100, 0);
    tracker.down(2, 200, 100, 5);
    tracker.up(1, 100, 100, 30);
    tracker.up(2, 200, 100, 40);
    expect(log.taps).toEqual([]);
    expect(log.flings).toEqual([]);
  });

  it('der übrige Finger zieht danach ohne Sprung weiter', () => {
    tracker.down(1, 100, 100, 0);
    tracker.down(2, 200, 100, 5);
    tracker.move(1, 90, 100, 10);
    tracker.up(2, 200, 100, 20);
    expect(log.pans).toEqual([]);
    tracker.move(1, 95, 100, 30);
    expect(log.pans).toEqual([[5, 0]]);
    tracker.up(1, 95, 100, 40);
    expect(log.taps).toEqual([]);
  });

  it('ein dritter Finger wird ignoriert', () => {
    tracker.down(1, 100, 100, 0);
    tracker.down(2, 200, 100, 5);
    tracker.down(3, 150, 300, 6);
    tracker.move(3, 150, 500, 10);
    expect(log.pinches).toEqual([]);
    tracker.up(3, 150, 500, 20);
    expect(log.taps).toEqual([]);
    expect(log.begins).toBe(1);
  });

  it('ein neuer Tipp danach funktioniert wieder', () => {
    tracker.down(1, 100, 100, 0);
    tracker.down(2, 200, 100, 5);
    tracker.up(1, 100, 100, 30);
    tracker.up(2, 200, 100, 40);
    tracker.down(1, 50, 60, 1000);
    tracker.up(1, 50, 60, 1050);
    expect(log.taps).toEqual([{ x: 50, y: 60 }]);
    expect(log.begins).toBe(2);
  });
});

describe('Abbrechen', () => {
  it('nach einem Abbruch geht die nächste Berührung mit derselben Nummer wieder', () => {
    tracker.down(1, 100, 100, 0);
    tracker.cancel(1);
    tracker.down(1, 50, 50, 100);
    tracker.up(1, 50, 50, 150);
    expect(log.taps).toEqual([{ x: 50, y: 50 }]);
  });

  it('ein abgebrochener Zeiger gibt weder Tipp noch Nachgleiten', () => {
    tracker.down(1, 100, 100, 0);
    tracker.cancel(1);
    tracker.up(1, 100, 100, 50);
    expect(log.taps).toEqual([]);
    expect(tracker.active).toBe(false);
  });

  it('ist nach dem Loslassen nicht mehr aktiv', () => {
    tracker.down(1, 100, 100, 0);
    expect(tracker.active).toBe(true);
    tracker.up(1, 100, 100, 50);
    expect(tracker.active).toBe(false);
  });
});
