/**
 * The three kinds of short messages in the hint bar, kept apart:
 * - an **explanation** ("Das ist von allein gewachsen.") stays until the child taps something else;
 * - a piece of **news** ("Neu im Shop: …") shows for a while and goes away by itself;
 * - a **held** message ("Bald wird es Abend …", Korrekturrunde 1 of M8): it is said only once, so it waits until the
 *   hint bar has really shown it (not while the shop or a card covers the bar, not behind a fresh explanation) – only
 *   a tap after that takes it away.
 * News is shown over a standing explanation, and when it is over the explanation is there again
 * (it was never lost). Pure and tested; the building controls only draw what `current` says.
 */
export class MessageBoard {
  private explanation: string | undefined;
  private held: { readonly text: string; seen: boolean } | undefined;
  /** `until` is set when the news is first really shown: a preview that keeps it back does not use up its time. */
  private news: { readonly text: string; readonly durationMs: number; until: number | undefined } | undefined;

  /** An explanation that stays until {@link clearExplanation}. */
  explain(text: string): void {
    this.explanation = text;
  }

  /** A message that stays until it was shown and the child tapped after that (see {@link shown}). */
  hold(text: string): void {
    this.held = { text, seen: false };
  }

  /** The hint bar shows `text` now (call with what it really shows): a held message with this text may go with the next tap. */
  shown(text: string | undefined): void {
    if (this.held && text === this.held.text) {
      this.held.seen = true;
    }
  }

  /** The child tapped something else: the explanation goes away, and a held message that was seen (news stays until its time is up). */
  clearExplanation(): void {
    this.explanation = undefined;
    if (this.held?.seen === true) {
      this.held = undefined;
    }
  }

  /** Everything that stands goes, also a held message not seen yet (the night: the sentence of the evening is over). */
  clearAll(): void {
    this.explanation = undefined;
    this.held = undefined;
  }

  /** News that shows for `durationMs`, counted from the first time it is really shown. */
  announce(text: string, durationMs: number): void {
    this.news = { text, durationMs, until: undefined };
  }

  /**
   * What the hint bar shows at time `now`: news while it lasts, else the explanation, else a held message, else nothing. `withNews = false`
   * keeps the news back (its time starts only when it is shown): while a preview is on, its own hint ("Du bekommst 5 Taler zurück. Dann ✓.") matters more.
   */
  current(now: number, withNews = true): string | undefined {
    if (withNews && this.news) {
      this.news.until ??= now + this.news.durationMs;
      if (now < this.news.until) {
        return this.news.text;
      }
    }
    return this.explanation ?? this.held?.text;
  }

  /** Is there something a tap would take away now? */
  get hasExplanation(): boolean {
    return this.explanation !== undefined || this.held?.seen === true;
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
 * 4. the hint of the tool (what to tap next, carrying a resident) – unless the tutorial's sentence is `tutorialFirst`
 *    (it leads away from the tool: "Tippe auf den blauen Pfeil …", Korrekturrunde 1);
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
  readonly tutorialFirst?: boolean;
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
  if (sources.tutorialFirst === true && sources.tutorial !== undefined) {
    return { text: sources.tutorial, source: 'tutorial' };
  }
  if (sources.toolHint !== undefined) {
    return { text: sources.toolHint, source: 'tool' };
  }
  return sources.tutorial === undefined ? undefined : { text: sources.tutorial, source: 'tutorial' };
}
