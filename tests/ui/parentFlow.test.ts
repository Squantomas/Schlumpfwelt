import { describe, expect, it } from 'vitest';
import { ParentFlow, type PinKeeper } from '../../src/ui/parentFlow';

class Pins implements PinKeeper {
  pin: string | undefined;
  get hasPin(): boolean {
    return this.pin !== undefined;
  }
  checkPin(pin: string): boolean {
    return pin === this.pin;
  }
  setPin(pin: string): void {
    this.pin = pin;
  }
}

function type(flow: ParentFlow, digits: string): void {
  for (const digit of digits) {
    flow.press(Number(digit));
  }
}

describe('Eltern-Menü: PIN festlegen, prüfen, ändern, vergessen (M8)', () => {
  it('beim ersten Öffnen zweimal dieselbe PIN, dann die Einstellungen', () => {
    const pins = new Pins();
    const flow = new ParentFlow(pins);
    expect(flow.mode).toBe('closed');
    flow.open();
    expect(flow.mode).toBe('newPin');
    expect(flow.prompt).toBe('parent.newPin');
    type(flow, '25');
    expect(flow.digits).toBe('25');
    flow.back();
    expect(flow.digits).toBe('2');
    type(flow, '580');
    expect(flow.mode).toBe('repeatPin');
    expect(flow.prompt).toBe('parent.repeat');
    expect(flow.digits).toBe('');
    type(flow, '2580');
    expect(flow.mode).toBe('settings');
    expect(flow.message).toBe('parent.pinSaved');
    expect(pins.pin).toBe('2580');
  });

  it('zwei verschiedene PINs: freundlich von vorn, nichts gespeichert', () => {
    const pins = new Pins();
    const flow = new ParentFlow(pins);
    flow.open();
    type(flow, '1234');
    type(flow, '4321');
    expect(flow.mode).toBe('newPin');
    expect(flow.message).toBe('parent.pinMismatch');
    expect(pins.pin).toBeUndefined();
    // The sentence goes with the next digit.
    flow.press(1);
    expect(flow.message).toBeUndefined();
  });

  it('mit PIN: falsch sagt es nur, beliebig oft – richtig öffnet die Einstellungen', () => {
    const pins = new Pins();
    pins.pin = '2580';
    const flow = new ParentFlow(pins);
    flow.open();
    expect(flow.mode).toBe('enterPin');
    for (let i = 0; i < 20; i += 1) {
      type(flow, '0000');
      expect(flow.mode).toBe('enterPin');
      expect(flow.message).toBe('parent.pinWrong');
      expect(flow.digits).toBe('');
    }
    type(flow, '2580');
    expect(flow.mode).toBe('settings');
  });

  it('PIN ändern in den Einstellungen', () => {
    const pins = new Pins();
    pins.pin = '2580';
    const flow = new ParentFlow(pins);
    flow.open();
    type(flow, '2580');
    flow.changePin();
    expect(flow.mode).toBe('newPin');
    type(flow, '1357');
    type(flow, '1357');
    expect(pins.pin).toBe('1357');
    expect(flow.mode).toBe('settings');
  });

  it('PIN vergessen: eine Rechenaufgabe (12–29 mal 12–29), falsch gibt eine neue, richtig eine neue PIN', () => {
    const pins = new Pins();
    pins.pin = '2580';
    const values = [0, 0.99, 0.5, 0.25];
    let i = 0;
    const flow = new ParentFlow(pins, () => values[i++ % values.length] ?? 0);
    flow.open();
    flow.forgot();
    expect(flow.mode).toBe('question');
    expect(flow.question).toEqual([12, 29]);
    expect(flow.length).toBe(3);
    type(flow, '111');
    expect(flow.mode).toBe('question');
    expect(flow.message).toBe('parent.questionWrong');
    expect(flow.question).toEqual([21, 16]);
    type(flow, '336');
    expect(flow.mode).toBe('newPin');
    expect(flow.message).toBe('parent.questionRight');
    type(flow, '9999');
    type(flow, '9999');
    expect(pins.pin).toBe('9999');
  });

  it('jede Aufgabe hat drei Ziffern und Zahlen zwischen 12 und 29', () => {
    const flow = new ParentFlow({ hasPin: true, checkPin: () => false, setPin: () => undefined });
    for (let n = 0; n < 200; n += 1) {
      flow.open();
      flow.forgot();
      const [a, b] = flow.question;
      expect(a).toBeGreaterThanOrEqual(12);
      expect(b).toBeLessThanOrEqual(29);
      expect(String(a * b)).toHaveLength(3);
      flow.close();
    }
  });

  it('Tasten außerhalb der Eingabe tun nichts', () => {
    const pins = new Pins();
    pins.pin = '2580';
    const flow = new ParentFlow(pins);
    flow.press(1);
    expect(flow.digits).toBe('');
    flow.open();
    flow.press(12);
    flow.press(-1);
    expect(flow.digits).toBe('');
    type(flow, '2580');
    flow.press(3);
    expect(flow.digits).toBe('');
    flow.forgot();
    expect(flow.mode).toBe('settings');
    flow.close();
    expect(flow.isOpen).toBe(false);
  });
});
