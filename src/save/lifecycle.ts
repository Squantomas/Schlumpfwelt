import type { Autosave } from './autosave';

/**
 * Runs `action` when the page goes out of sight or is closed. `visibilitychange` comes first on tablets and phones
 * (switching apps, locking the screen), `pagehide` is the last chance elsewhere. Returns a function that removes the
 * listeners. (M8: the parents' settings and today's play time are written then, too.)
 */
export function whenLeaving(action: () => void, doc: Document = document, win: Window = window): () => void {
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') {
      action();
    }
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', action);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', action);
  };
}

/**
 * Saves when the page goes out of sight or is closed (see {@link whenLeaving}). `prepare` runs first: commands that
 * were sent but whose tick did not come yet are applied, so the last building is part of what is saved. Returns a
 * function that removes the listeners.
 */
export function saveWhenLeaving(autosave: Autosave, prepare: () => void = () => undefined, doc: Document = document, win: Window = window): () => void {
  return whenLeaving(
    () => {
      prepare();
      void autosave.flush();
    },
    doc,
    win,
  );
}
