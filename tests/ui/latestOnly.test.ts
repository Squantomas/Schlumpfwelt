import { describe, expect, it } from 'vitest';
import { LatestOnly } from '../../src/ui/latestOnly';

describe('LatestOnly (R3: der Dateiwähler darf den Knopf nicht festhalten)', () => {
  it('nur die neueste Anfrage zählt', () => {
    const picks = new LatestOnly();
    const first = picks.start();
    expect(picks.isCurrent(first)).toBe(true);
    const second = picks.start();
    expect(picks.isCurrent(first)).toBe(false);
    expect(picks.isCurrent(second)).toBe(true);
  });

  it('cancel verwirft alles, was noch wartet; danach geht eine neue Anfrage wieder', () => {
    const picks = new LatestOnly();
    const waiting = picks.start();
    picks.cancel();
    expect(picks.isCurrent(waiting)).toBe(false);
    const next = picks.start();
    expect(picks.isCurrent(next)).toBe(true);
  });
});
