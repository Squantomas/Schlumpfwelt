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
