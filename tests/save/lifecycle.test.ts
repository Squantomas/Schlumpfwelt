import { describe, expect, it } from 'vitest';
import { whenLeaving } from '../../src/save/lifecycle';

describe('whenLeaving: beim Verstecken und Schließen der Seite (M8: auch die Eltern-Einstellungen)', () => {
  it('ruft die Aktion bei „hidden“ und „pagehide“, nicht bei „visible“, und lässt sich abmelden', () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }) as unknown as Document;
    const win = new EventTarget() as unknown as Window;
    let calls = 0;
    const stop = whenLeaving(() => {
      calls += 1;
    }, doc, win);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toBe(0);
    (doc as unknown as { visibilityState: string }).visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toBe(1);
    win.dispatchEvent(new Event('pagehide'));
    expect(calls).toBe(2);
    stop();
    win.dispatchEvent(new Event('pagehide'));
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toBe(2);
  });
});
