import { describe, expect, it } from 'vitest';
import { MessageBoard, newsVisible, pickHint } from '../../src/ui/messageBoard';

describe('MessageBoard: Erklärung und Neuigkeit (N3)', () => {
  it('zeigt eine Erklärung, bis sie gelöscht wird – ohne Zeitablauf', () => {
    const board = new MessageBoard();
    expect(board.current(0)).toBeUndefined();
    board.explain('Das bleibt.');
    expect(board.current(0)).toBe('Das bleibt.');
    expect(board.current(1_000_000)).toBe('Das bleibt.');
    board.clearExplanation();
    expect(board.current(1_000_001)).toBeUndefined();
  });

  it('zeigt eine Neuigkeit über einer stehenden Erklärung, danach ist die Erklärung wieder da', () => {
    const board = new MessageBoard();
    board.explain('Das ist von allein gewachsen.');
    board.announce('Neu im Shop: Bank!', 7000);
    expect(board.current(1000)).toBe('Neu im Shop: Bank!');
    expect(board.current(1000)).toBe('Neu im Shop: Bank!');
    expect(board.current(7999)).toBe('Neu im Shop: Bank!');
    expect(board.current(8000)).toBe('Das ist von allein gewachsen.');
    expect(board.hasExplanation).toBe(true);
  });

  it('löscht ein Tipp während der Neuigkeit nur die Erklärung, nicht die Neuigkeit', () => {
    const board = new MessageBoard();
    board.explain('Alt.');
    board.announce('Neu!', 5000);
    board.clearExplanation();
    expect(board.current(100)).toBe('Neu!');
    expect(board.current(5100)).toBeUndefined();
  });

  it('eine Erklärung, die während der Neuigkeit kommt, erscheint nach ihr', () => {
    const board = new MessageBoard();
    board.announce('Neu!', 5000);
    board.explain('Hier geht das nicht.');
    expect(board.current(10)).toBe('Neu!');
    expect(board.current(5010)).toBe('Hier geht das nicht.');
  });

  it('hält die Neuigkeit zurück, solange eine Vorschau mit eigenem Hinweis da ist (ihre Zeit läuft weiter)', () => {
    const board = new MessageBoard();
    board.announce('Neu!', 5000);
    expect(board.current(100, false)).toBeUndefined();
    board.explain('Alt.');
    expect(board.current(100, false)).toBe('Alt.');
    expect(board.current(100, true)).toBe('Neu!');
    expect(board.current(6000, true)).toBe('Alt.');
  });

  it('zählt die Zeit der Neuigkeit erst ab dem ersten Zeigen: eine lange Vorschau davor verschluckt sie nicht (B2)', () => {
    const board = new MessageBoard();
    board.announce('Neu im Shop: Strand!', 7000);
    // 20 Sekunden lang steht eine Vorschau: die Neuigkeit wird zurückgehalten.
    for (let now = 0; now <= 20_000; now += 1000) {
      expect(board.current(now, false)).toBeUndefined();
    }
    // Danach wird sie voll gezeigt: 7 Sekunden ab jetzt.
    expect(board.current(20_500, true)).toBe('Neu im Shop: Strand!');
    expect(board.current(27_000, true)).toBe('Neu im Shop: Strand!');
    expect(board.current(27_500, true)).toBeUndefined();
  });
});

describe('Neuigkeit nur, wo die Hinweisleiste sie zeigt (Nacharbeit #17)', () => {
  it('erlaubt sie nur ohne Vorschau, ohne offenen Shop und ohne Infokarte', () => {
    expect(newsVisible({ hasPreview: false, shopOpen: false, inspectedId: undefined })).toBe(true);
    expect(newsVisible({ hasPreview: true, shopOpen: false, inspectedId: undefined })).toBe(false);
    expect(newsVisible({ hasPreview: false, shopOpen: true, inspectedId: undefined })).toBe(false);
    expect(newsVisible({ hasPreview: false, shopOpen: false, inspectedId: 3 })).toBe(false);
    expect(newsVisible({ hasPreview: false, shopOpen: false, inspectedId: undefined, menuOpen: true })).toBe(false);
    expect(newsVisible({ hasPreview: false, shopOpen: false, inspectedId: undefined, menuOpen: false })).toBe(true);
  });

  it('startet die Uhr nicht, solange die Neuigkeit zurückgehalten wird, und zeigt sie danach volle 7 s', () => {
    const board = new MessageBoard();
    board.announce('Neu im Shop: Bank!', 7000);
    // Shop (or card) open for a long time: asked every frame with withNews = false.
    for (let now = 0; now < 60_000; now += 1000) {
      expect(board.current(now, newsVisible({ hasPreview: false, shopOpen: true, inspectedId: undefined }))).toBeUndefined();
    }
    expect(board.current(60_000, newsVisible({ hasPreview: false, shopOpen: false, inspectedId: undefined }))).toBe('Neu im Shop: Bank!');
    expect(board.current(66_999)).toBe('Neu im Shop: Bank!');
    expect(board.current(67_000)).toBeUndefined();
  });
});

describe('Vorrang in der Hinweisleiste: das Tutorial verdrängt nichts und wird nie für immer verdrängt (M8)', () => {
  const base = { shopOpen: false, cardOpen: false, tutorial: 'Tippe auf einen Bewohner.' };

  it('ohne andere Meldung steht der Satz des Tutorials da', () => {
    expect(pickHint(base)).toEqual({ text: 'Tippe auf einen Bewohner.', source: 'tutorial' });
  });

  it('Neu im Shop, Fehler, Tragen und Werkzeug-Hinweise gehen vor', () => {
    expect(pickHint({ ...base, message: 'Neu im Shop: Bank!' })).toEqual({ text: 'Neu im Shop: Bank!', source: 'message' });
    expect(pickHint({ ...base, message: 'Hier geht das nicht.', toolHint: 'Tippe auf die Wiese.' })?.source).toBe('message');
    expect(pickHint({ ...base, toolHint: 'Zieh Lumo auf ein Haus.' })).toEqual({ text: 'Zieh Lumo auf ein Haus.', source: 'tool' });
    expect(pickHint({ ...base, message: 'Bald wird es Abend …' })?.source).toBe('message');
  });

  it('Shop und Karten zeigen nichts daneben', () => {
    expect(pickHint({ ...base, shopOpen: true, message: 'x' })).toBeUndefined();
    expect(pickHint({ ...base, cardOpen: true })).toBeUndefined();
    expect(pickHint({ ...base, cardOpen: true, cardFallback: 'Arbeitet.' })).toEqual({ text: 'Arbeitet.', source: 'card' });
  });

  it('nach der Neuigkeit, der Erklärung und dem Werkzeug ist der Satz wieder da', () => {
    const board = new MessageBoard();
    board.explain('Hier geht das nicht.');
    board.announce('Neu im Shop: Bank!', 7000);
    const at = (now: number, toolHint?: string) => pickHint({ ...base, message: board.current(now), toolHint });
    expect(at(0)?.text).toBe('Neu im Shop: Bank!');
    expect(at(7000)?.text).toBe('Hier geht das nicht.');
    board.clearExplanation();
    expect(at(7001, 'Tippe auf den Anfang vom Weg.')?.source).toBe('tool');
    expect(at(7002)).toEqual({ text: 'Tippe auf einen Bewohner.', source: 'tutorial' });
    expect(pickHint({ shopOpen: false, cardOpen: false })).toBeUndefined();
  });
});
