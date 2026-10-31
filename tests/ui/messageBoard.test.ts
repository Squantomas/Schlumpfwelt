import { describe, expect, it } from 'vitest';
import { MessageBoard, newsVisible } from '../../src/ui/messageBoard';

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
