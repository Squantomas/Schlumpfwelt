import { describe, expect, it } from 'vitest';
import { MenuFlow, rejectionText } from '../../src/ui/menuFlow';

describe('Menü: Ablauf', () => {
  it('ist zu, öffnet auf zwei Knöpfe und schließt wieder', () => {
    const menu = new MenuFlow<string>();
    expect(menu.mode).toBe('closed');
    expect(menu.isOpen).toBe(false);
    menu.open();
    expect(menu.mode).toBe('menu');
    expect(menu.message).toBeUndefined();
    menu.close();
    expect(menu.mode).toBe('closed');
  });

  it('eine gewählte Datei wartet auf ✓: erst dann kommt das Dorf heraus', () => {
    const menu = new MenuFlow<string>();
    menu.open();
    menu.ask('dorf aus der datei');
    expect(menu.mode).toBe('confirm');
    expect(menu.pending).toBe('dorf aus der datei');
    expect(menu.confirm()).toBe('dorf aus der datei');
    expect(menu.mode).toBe('closed');
    expect(menu.pending).toBeUndefined();
  });

  it('✕ vergisst die Datei und geht zurück zu den zwei Knöpfen', () => {
    const menu = new MenuFlow<string>();
    menu.open();
    menu.ask('x');
    menu.cancel();
    expect(menu.mode).toBe('menu');
    expect(menu.pending).toBeUndefined();
    expect(menu.confirm()).toBeUndefined();
  });

  it('✓ ohne wartendes Dorf tut nichts', () => {
    const menu = new MenuFlow<string>();
    expect(menu.confirm()).toBeUndefined();
    menu.open();
    expect(menu.confirm()).toBeUndefined();
    expect(menu.mode).toBe('menu');
  });

  it('ein Satz bleibt im Menü stehen, bis etwas anderes passiert', () => {
    const menu = new MenuFlow<string>();
    menu.open();
    menu.say('menu.errorBroken');
    expect(menu.mode).toBe('menu');
    expect(menu.message).toBe('menu.errorBroken');
    menu.ask('x');
    expect(menu.message).toBeUndefined();
    menu.cancel();
    expect(menu.message).toBeUndefined();
    menu.say('menu.fileSaved');
    menu.close();
    menu.open();
    expect(menu.message).toBeUndefined();
  });

  it('ein verspätetes Ergebnis nach dem Schließen öffnet nichts', () => {
    const menu = new MenuFlow<string>();
    menu.open();
    menu.close();
    menu.ask('zu spät');
    menu.say('menu.errorRead');
    expect(menu.mode).toBe('closed');
    expect(menu.pending).toBeUndefined();
  });

  it('jede Ablehnung hat einen Satz', () => {
    expect(rejectionText('notSave')).toBe('menu.errorNotSave');
    expect(rejectionText('tooNew')).toBe('menu.errorTooNew');
    expect(rejectionText('broken')).toBe('menu.errorBroken');
  });
});
