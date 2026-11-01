import { PARENT_RULES } from '../data/parent';

/**
 * The parents' PIN (M8). It is never kept as it was typed: only a salted hash is stored. This protects children from
 * the settings, not secrets from experts – a plain FNV-1a hash, stretched over a few rounds, is enough (the PIN has
 * only 10 000 values anyway; "PIN vergessen?" is the way out for the parents).
 */
export interface PinRecord {
  readonly salt: string;
  readonly hash: string;
}

/** Exactly `pinLength` digits. */
export function isPin(text: string): boolean {
  return new RegExp(`^\\d{${String(PARENT_RULES.pinLength)}}$`).test(text);
}

/** FNV-1a (32 bit) of a text, as 8 hex digits. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The hash of a PIN with its salt (the same PIN with another salt gives another hash). */
export function hashPin(pin: string, salt: string): string {
  let hash = fnv1a(`${salt}:${pin}`);
  for (let round = 0; round < 64; round += 1) {
    hash = fnv1a(`${hash}:${salt}:${pin}:${String(round)}`);
  }
  return hash;
}

/** A new random salt (outside the simulation, so `Math.random` is fine; tests pass their own). */
export function newSalt(random: () => number = Math.random): string {
  let salt = '';
  for (let i = 0; i < 4; i += 1) {
    salt += Math.floor(random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
  }
  return salt;
}

export function makePin(pin: string, salt: string): PinRecord {
  return { salt, hash: hashPin(pin, salt) };
}

export function pinMatches(record: PinRecord | null, pin: string): boolean {
  return record !== null && isPin(pin) && hashPin(pin, record.salt) === record.hash;
}

/** A stored PIN record, or `null` if `raw` is none (anything odd counts as "no PIN yet"). */
export function readPin(raw: unknown): PinRecord | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { salt, hash } = raw as Record<string, unknown>;
  if (typeof salt !== 'string' || typeof hash !== 'string' || !/^[0-9a-f]{1,64}$/.test(salt) || !/^[0-9a-f]{8}$/.test(hash)) {
    return null;
  }
  return { salt, hash };
}
