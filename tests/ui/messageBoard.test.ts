import { describe, expect, it } from 'vitest';
import { MessageBoard } from '../../src/ui/messageBoard';

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
    board.announce('Neu im Shop: Bank!', 1000, 7000);
    expect(board.current(1000)).toBe('Neu im Shop: Bank!');
    expect(board.current(7999)).toBe('Neu im Shop: Bank!');
    expect(board.current(8000)).toBe('Das ist von allein gewachsen.');
    expect(board.hasExplanation).toBe(true);
  });

  it('löscht ein Tipp während der Neuigkeit nur die Erklärung, nicht die Neuigkeit', () => {
    const board = new MessageBoard();
    board.explain('Alt.');
    board.announce('Neu!', 0, 5000);
    board.clearExplanation();
    expect(board.current(100)).toBe('Neu!');
    expect(board.current(5000)).toBeUndefined();
  });

  it('eine Erklärung, die während der Neuigkeit kommt, erscheint nach ihr', () => {
    const board = new MessageBoard();
    board.announce('Neu!', 0, 5000);
    board.explain('Hier geht das nicht.');
    expect(board.current(10)).toBe('Neu!');
    expect(board.current(5001)).toBe('Hier geht das nicht.');
  });
});
