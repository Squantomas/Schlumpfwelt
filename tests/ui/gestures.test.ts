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

describe('Tragen (M7): ein Druck auf einen Bewohner trägt ihn statt der Kamera', () => {
  interface CarryLog {
    grabs: Point[];
    carries: Point[];
    drops: Point[];
    cancels: number;
    pans: [number, number][];
    pinches: number;
    taps: Point[];
    flings: number;
    panStarts: Point[];
  }
  let carry: CarryLog;
  /** Nur Drücke links von x = 50 treffen einen Bewohner. */
  let carrier: GestureTracker;
  /** Was `begin` zurückgibt: true = „die Berührung hat nur das Nachgleiten angehalten“. */
  let stopsGlide = false;
  /** Was `mayCarry` sagt (false = der Abend bedeckt die Insel). */
  let carryAllowed = true;

  beforeEach(() => {
    carry = { grabs: [], carries: [], drops: [], cancels: 0, pans: [], pinches: 0, taps: [], flings: 0, panStarts: [] };
    stopsGlide = false;
    carrier = new GestureTracker(
      {
        begin: () => stopsGlide,
        pan: (dx, dy) => carry.pans.push([dx, dy]),
        pinch: () => {
          carry.pinches += 1;
        },
        tap: (at) => carry.taps.push(at),
        fling: () => {
          carry.flings += 1;
        },
        grab: (at) => {
          carry.grabs.push(at);
          return at.x < 50;
        },
        carry: (at) => carry.carries.push(at),
        drop: (at) => carry.drops.push(at),
        cancelCarry: () => {
          carry.cancels += 1;
        },
        panStart: (at) => carry.panStarts.push(at),
        mayCarry: () => carryAllowed,
      },
      { tapMaxMovePx: 10 },
    );
    carryAllowed = true;
  });

  it('der Abend beginnt, während ein Finger auf einem Bewohner liegt: loslassen, der Rest der Berührung tut nichts (Korrekturrunde 1)', () => {
    carrier.down(1, 20, 20, 0);
    carrier.letGo();
    expect(carry.cancels).toBe(1);
    carrier.move(1, 80, 80, 20);
    carrier.down(2, 200, 200, 25);
    carrier.move(2, 260, 260, 30);
    carrier.up(1, 90, 90, 40);
    carrier.up(2, 270, 270, 50);
    expect(carry.carries).toEqual([]);
    expect(carry.drops).toEqual([]);
    expect(carry.pans).toEqual([]);
    expect(carry.pinches).toBe(0);
    expect(carry.taps).toEqual([]);
    expect(carrier.active).toBe(false);
    // The next touch is an ordinary one again.
    carrier.down(3, 100, 100, 100);
    carrier.up(3, 100, 100, 120);
    expect(carry.taps).toEqual([{ x: 100, y: 100 }]);
  });

  it('beim Tragen loslassen von außen: kein Absetzen; ohne Halten tut letGo nichts', () => {
    carrier.down(1, 20, 20, 0);
    carrier.move(1, 60, 40, 20);
    expect(carrier.carrying).toBe(true);
    carrier.letGo();
    carrier.move(1, 90, 80, 30);
    carrier.up(1, 95, 85, 40);
    expect(carry.carries).toEqual([{ x: 60, y: 40 }]);
    expect(carry.drops).toEqual([]);
    expect(carry.cancels).toBe(1);
    carrier.down(2, 100, 100, 50);
    carrier.letGo();
    carrier.move(2, 140, 100, 60);
    expect(carry.pans.length).toBeGreaterThan(0);
    expect(carry.cancels).toBe(1);
  });

  it('ist die Insel bedeckt, wird aus Halten kein Tragen (mayCarry)', () => {
    carrier.down(1, 20, 20, 0);
    carryAllowed = false;
    carrier.move(1, 60, 40, 20);
    carrier.up(1, 70, 50, 40);
    expect(carry.carries).toEqual([]);
    expect(carry.drops).toEqual([]);
    expect(carry.cancels).toBe(1);
    expect(carry.taps).toEqual([]);
    expect(carry.pans).toEqual([]);
  });

  it('Druck auf einen Bewohner und Ziehen: tragen, loslassen = absetzen; die Kamera bewegt sich nicht', () => {
    carrier.down(1, 20, 20, 0);
    expect(carrier.carrying).toBe(false);
    carrier.move(1, 25, 22, 10);
    expect(carry.carries).toEqual([]);
    carrier.move(1, 60, 40, 20);
    expect(carrier.carrying).toBe(true);
    carrier.move(1, 90, 80, 30);
    carrier.up(1, 95, 85, 40);
    expect(carry.grabs).toEqual([{ x: 20, y: 20 }]);
    expect(carry.carries).toEqual([
      { x: 60, y: 40 },
      { x: 90, y: 80 },
    ]);
    expect(carry.drops).toEqual([{ x: 95, y: 85 }]);
    expect(carry.pans).toEqual([]);
    expect(carry.flings).toBe(0);
    expect(carry.taps).toEqual([]);
    expect(carry.cancels).toBe(0);
    expect(carrier.active).toBe(false);
  });

  it('Druck auf einen Bewohner ohne Bewegung bleibt ein Tipp (die Karte öffnet sich), nichts wird abgesetzt', () => {
    carrier.down(1, 20, 20, 0);
    carrier.move(1, 24, 20, 10);
    carrier.up(1, 24, 20, 50);
    expect(carry.taps).toEqual([{ x: 24, y: 20 }]);
    expect(carry.drops).toEqual([]);
    expect(carry.cancels).toBe(1);
  });

  it('zusammengefasste Bewegung im Loslassen: trotzdem getragen und abgesetzt', () => {
    carrier.down(1, 20, 20, 0);
    carrier.up(1, 80, 20, 30);
    expect(carry.carries).toEqual([{ x: 80, y: 20 }]);
    expect(carry.drops).toEqual([{ x: 80, y: 20 }]);
    expect(carry.taps).toEqual([]);
  });

  it('Druck neben dem Bewohner verschiebt weiter die Kamera', () => {
    carrier.down(1, 100, 100, 0);
    carrier.move(1, 130, 100, 20);
    carrier.up(1, 140, 100, 40);
    expect(carry.grabs).toEqual([{ x: 100, y: 100 }]);
    expect(carry.pans.length).toBeGreaterThan(0);
    expect(carry.carries).toEqual([]);
    expect(carry.drops).toEqual([]);
  });

  it('ein zweiter Finger beendet das Tragen ohne Absetzen und kneift – Kneifen bleibt Kneifen', () => {
    carrier.down(1, 20, 20, 0);
    carrier.move(1, 60, 20, 10);
    carrier.down(2, 200, 200, 20);
    expect(carry.cancels).toBe(1);
    carrier.move(2, 220, 220, 30);
    expect(carry.pinches).toBe(1);
    carrier.up(2, 220, 220, 40);
    carrier.move(1, 80, 20, 50);
    carrier.up(1, 80, 20, 60);
    expect(carry.drops).toEqual([]);
    expect(carry.taps).toEqual([]);
    expect(carry.carries).toEqual([{ x: 60, y: 20 }]);
    // The finger that stays pans on.
    expect(carry.pans.length).toBeGreaterThan(0);
  });

  it('ein zweiter Finger, bevor sich der erste bewegt hat: auch kein Tipp', () => {
    carrier.down(1, 20, 20, 0);
    carrier.down(2, 200, 200, 10);
    carrier.up(2, 200, 200, 20);
    carrier.up(1, 20, 20, 30);
    expect(carry.cancels).toBe(1);
    expect(carry.taps).toEqual([]);
    expect(carry.drops).toEqual([]);
  });

  it('der Browser nimmt den Finger weg (touchcancel): kein Absetzen', () => {
    carrier.down(1, 20, 20, 0);
    carrier.move(1, 60, 20, 10);
    carrier.cancel(1);
    expect(carry.cancels).toBe(1);
    expect(carry.drops).toEqual([]);
    expect(carrier.active).toBe(false);
  });

  it('wer nur das Nachgleiten anhält, hebt nichts auf', () => {
    stopsGlide = true;
    carrier.down(1, 20, 20, 0);
    carrier.move(1, 60, 20, 10);
    carrier.up(1, 60, 20, 20);
    expect(carry.grabs).toEqual([]);
    expect(carry.carries).toEqual([]);
    expect(carry.pans.length).toBeGreaterThan(0);
  });

  it('panStart meldet einmal den Startpunkt, wenn der Finger die Kamera zu ziehen beginnt – nicht beim Tragen, Tippen oder Kneifen', () => {
    carrier.down(1, 100, 100, 0);
    carrier.move(1, 105, 100, 10);
    expect(carry.panStarts).toEqual([]);
    carrier.move(1, 130, 100, 20);
    carrier.move(1, 160, 100, 30);
    carrier.up(1, 160, 100, 40);
    expect(carry.panStarts).toEqual([{ x: 100, y: 100 }]);
    // Merged into the release: still once.
    carrier.down(1, 300, 300, 100);
    carrier.up(1, 360, 300, 120);
    expect(carry.panStarts).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 300 },
    ]);
    carry.panStarts = [];
    carrier.down(1, 20, 20, 200);
    carrier.move(1, 60, 20, 210);
    carrier.up(1, 60, 20, 220);
    carrier.down(1, 100, 100, 300);
    carrier.up(1, 102, 100, 310);
    carrier.down(1, 100, 100, 400);
    carrier.down(2, 200, 200, 410);
    carrier.move(2, 230, 230, 420);
    carrier.up(2, 230, 230, 430);
    carrier.up(1, 100, 100, 440);
    expect(carry.panStarts).toEqual([]);
  });

  it('ohne grab-Rückruf (alte Nutzer) bleibt alles wie vorher', () => {
    tracker.down(1, 20, 20, 0);
    tracker.move(1, 60, 20, 10);
    tracker.up(1, 60, 20, 20);
    expect(log.pans.length).toBeGreaterThan(0);
  });
});
