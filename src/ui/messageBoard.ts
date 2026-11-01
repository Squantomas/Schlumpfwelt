/**
 * The two kinds of short messages in the hint bar, kept apart:
 * - an **explanation** ("Das ist von allein gewachsen.") stays until the child taps something else;
 * - a piece of **news** ("Neu im Shop: …") shows for a while and goes away by itself.
 * News is shown over a standing explanation, and when it is over the explanation is there again
 * (it was never lost). Pure and tested; the building controls only draw what `current` says.
 */
export class MessageBoard {
  private explanation: string | undefined;
  /** `until` is set when the news is first really shown: a preview that keeps it back does not use up its time. */
  private news: { readonly text: string; readonly durationMs: number; until: number | undefined } | undefined;

  /** An explanation that stays until {@link clearExplanation}. */
  explain(text: string): void {
    this.explanation = text;
  }

  /** The child tapped something else: the explanation goes away (news stays until its time is up). */
  clearExplanation(): void {
    this.explanation = undefined;
  }

  /** News that shows for `durationMs`, counted from the first time it is really shown. */
  announce(text: string, durationMs: number): void {
    this.news = { text, durationMs, until: undefined };
  }

  /**
   * What the hint bar shows at time `now`: news while it lasts, else the explanation, else nothing. `withNews = false`
   * keeps the news back (its time starts only when it is shown): while a preview is on, its own hint ("Du bekommst 5 Taler zurück. Dann ✓.") matters more.
   */
  current(now: number, withNews = true): string | undefined {
    if (withNews && this.news) {
      this.news.until ??= now + this.news.durationMs;
      if (now < this.news.until) {
        return this.news.text;
      }
    }
    return this.explanation;
  }

  get hasExplanation(): boolean {
    return this.explanation !== undefined;
  }
}

/**
 * Does the hint bar show news right now? Not while a preview is on (its own hint matters more), not while the shop is open,
 * an info card is open or the menu behind the gear is open (they cover or replace the hint bar). Only where this is true may the news clock run.
 */
export function newsVisible(situation: {
  readonly hasPreview: boolean;
  readonly shopOpen: boolean;
  readonly inspectedId: number | undefined;
  readonly menuOpen?: boolean;
}): boolean {
  return !situation.hasPreview && !situation.shopOpen && situation.inspectedId === undefined && situation.menuOpen !== true;
}

/** Where the sentence of the hint bar comes from (`tutorial`: the guided start, M8 – then the bar has its own ✕ to skip it). */
export type HintSource = 'card' | 'message' | 'tool' | 'tutorial';

/**
 * What the hint bar shows (M8: the rule of precedence, tested). From the top:
 * 1. the open shop: nothing (it explains itself);
 * 2. an open card: nothing beside it – only its own sentence when it does not fit (`cardFallback`);
 * 3. a message of the board: news ("Neu im Shop", while it runs) or an explanation (errors, letting go of a carried
 *    resident, the boat, "Bald wird es Abend …" – each stays until the next tap);
 * 4. the hint of the tool (what to tap next, carrying a resident);
 * 5. the sentence of the tutorial, only when nothing else has something to say.
 * So the tutorial never hides anything – and nothing hides it for good: every message above it goes away with a tap
 * or by itself (news), and a tool hint with the end of the tool; then its sentence is there again.
 */
export function pickHint(sources: {
  readonly shopOpen: boolean;
  readonly cardOpen: boolean;
  readonly cardFallback?: string | undefined;
  readonly message?: string | undefined;
  readonly toolHint?: string | undefined;
  readonly tutorial?: string | undefined;
}): { readonly text: string; readonly source: HintSource } | undefined {
  if (sources.shopOpen) {
    return undefined;
  }
  if (sources.cardOpen) {
    return sources.cardFallback === undefined ? undefined : { text: sources.cardFallback, source: 'card' };
  }
  if (sources.message !== undefined) {
    return { text: sources.message, source: 'message' };
  }
  if (sources.toolHint !== undefined) {
    return { text: sources.toolHint, source: 'tool' };
  }
  return sources.tutorial === undefined ? undefined : { text: sources.tutorial, source: 'tutorial' };
}
