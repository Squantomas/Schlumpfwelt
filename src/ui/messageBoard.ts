/**
 * The two kinds of short messages in the hint bar, kept apart:
 * - an **explanation** ("Das ist von allein gewachsen.") stays until the child taps something else;
 * - a piece of **news** ("Neu im Shop: …") shows for a while and goes away by itself.
 * News is shown over a standing explanation, and when it is over the explanation is there again
 * (it was never lost). Pure and tested; the building controls only draw what `current` says.
 */
export class MessageBoard {
  private explanation: string | undefined;
  private news: { readonly text: string; readonly until: number } | undefined;

  /** An explanation that stays until {@link clearExplanation}. */
  explain(text: string): void {
    this.explanation = text;
  }

  /** The child tapped something else: the explanation goes away (news stays until its time is up). */
  clearExplanation(): void {
    this.explanation = undefined;
  }

  /** News that shows for `durationMs` from `now`. */
  announce(text: string, now: number, durationMs: number): void {
    this.news = { text, until: now + durationMs };
  }

  /** What the hint bar shows at time `now`: news while it lasts, else the explanation, else nothing. */
  current(now: number): string | undefined {
    if (this.news && now < this.news.until) {
      return this.news.text;
    }
    return this.explanation;
  }

  get hasExplanation(): boolean {
    return this.explanation !== undefined;
  }
}
