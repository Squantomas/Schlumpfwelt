import { describe, expect, it } from 'vitest';
import { hashPin, isPin, makePin, newSalt, pinMatches, readPin } from '../../src/parent/pin';

describe('PIN: nur als gesalzener Hash gespeichert (M8)', () => {
  it('genau vier Ziffern sind eine PIN', () => {
    expect(isPin('1234')).toBe(true);
    expect(isPin('0000')).toBe(true);
    for (const text of ['', '123', '12345', '12a4', ' 1234', '١٢٣٤']) {
      expect(isPin(text)).toBe(false);
    }
  });

  it('die richtige PIN passt, jede andere nicht', () => {
    const record = makePin('4711', 'beef');
    expect(pinMatches(record, '4711')).toBe(true);
    let others = 0;
    for (let n = 0; n < 10_000; n += 1) {
      const pin = String(n).padStart(4, '0');
      if (pin !== '4711' && pinMatches(record, pin)) {
        others += 1;
      }
    }
    expect(others).toBe(0);
    expect(pinMatches(null, '4711')).toBe(false);
    expect(pinMatches(record, '47111')).toBe(false);
  });

  it('die PIN steht nicht im Klartext da, und gleiche PINs ergeben mit anderem Salz andere Hashes', () => {
    const a = makePin('1234', '0001');
    const b = makePin('1234', '0002');
    expect(JSON.stringify(a)).not.toContain('1234');
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(hashPin('1234', '0001')).toBe(a.hash);
  });

  it('das Salz kommt aus dem übergebenen Zufall', () => {
    expect(newSalt(() => 0)).toBe('0000000000000000');
    expect(newSalt(() => 0.999999)).toMatch(/^[0-9a-f]{16}$/);
    expect(newSalt()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ein gespeicherter Eintrag wird geprüft; Unsinn heißt „noch keine PIN“', () => {
    const record = makePin('1234', 'abcd');
    expect(readPin(JSON.parse(JSON.stringify(record)))).toEqual(record);
    for (const raw of [undefined, null, 5, 'abc', {}, { salt: 'x!', hash: 'deadbeef' }, { salt: 'ab', hash: '123' }, { salt: 1, hash: 'deadbeef' }]) {
      expect(readPin(raw)).toBeNull();
    }
  });
});
