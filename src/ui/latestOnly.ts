/**
 * Only the newest of several asynchronous requests counts (a file chooser that never answers must not block the
 * next tap on "Aus Datei laden": the new request replaces the old one, and an answer that comes late is dropped).
 */
export class LatestOnly {
  private current = 0;

  /** Starts a request and returns its token; every older token is no longer current. */
  start(): number {
    this.current += 1;
    return this.current;
  }

  /** Is this the newest request, and was nothing cancelled since? */
  isCurrent(token: number): boolean {
    return token === this.current;
  }

  /** Drops every request that is still waiting. */
  cancel(): void {
    this.current += 1;
  }
}
