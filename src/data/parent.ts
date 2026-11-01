import parentJson from './parent.json';

/**
 * The numbers of the parents' menu and the daily limit (M8), from `parent.json` – changeable without code.
 *
 * - `limitChoices`: the minutes a day the parents can pick (`0` = no limit, "Aus"); `defaultLimit` is the one a new
 *   game starts with (no limit).
 * - `extraMinutes`: "Heute noch 10 Minuten mehr".
 * - `warnMinutes`: this long before the time is up, a gentle sentence says that it will soon be evening (no countdown).
 * - `saveEverySeconds`: the counted time is written this often while playing (and when the page is left), so a reload
 *   never gives the time back.
 * - `dusk`: the evening lasts at least `minSeconds` and at most `maxSeconds` – it ends early once everybody is in bed.
 * - `dawnSeconds`: how long it takes to get light again in the morning (or when the parents give more time).
 * - `pinLength`: digits of the PIN.
 * - `question`: "PIN vergessen?" asks for the product of two numbers from `min` to `max` (e.g. 23 × 14): easy for
 *   an adult (or a calculator), hard for a child of 6 to 10.
 */
export interface ParentRules {
  readonly limitChoices: readonly number[];
  readonly defaultLimit: number;
  readonly extraMinutes: number;
  readonly warnMinutes: number;
  readonly saveEverySeconds: number;
  readonly dusk: { readonly minSeconds: number; readonly maxSeconds: number };
  readonly dawnSeconds: number;
  readonly pinLength: number;
  readonly question: { readonly min: number; readonly max: number };
}

export const PARENT_RULES: ParentRules = parentJson;
