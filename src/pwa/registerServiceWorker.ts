/**
 * Makes the game work without a network and installable: registers the service worker that `vite build` writes
 * (`sw.js`, see `scripts/pwaPlugin.mjs`). Only in the built game – the development server has no worker, so
 * changes show up at once. A failing registration (private window, old browser) is silent: the game just needs the network then.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }
  const register = (): void => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' }).catch(() => {
      // Not allowed here: nothing to do.
    });
  };
  // After the game is up, so the first start is not slowed down by caching all files.
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
