import type { Autosave } from './autosave';

/**
 * Saves when the page goes out of sight or is closed. `visibilitychange` comes
 * first on tablets and phones (switching apps, locking the screen), `pagehide`
 * is the last chance elsewhere. Returns a function that removes the listeners.
 */
export function saveWhenLeaving(autosave: Autosave, doc: Document = document, win: Window = window): () => void {
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') {
      void autosave.flush();
    }
  };
  const onPageHide = (): void => {
    void autosave.flush();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
  };
}
