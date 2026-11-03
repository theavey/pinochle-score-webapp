import { render } from 'preact';
import { scoreGame } from './domain/scoring';
import { requestPersistence } from './storage/persist';
import { App } from './ui/App';
import { navigate } from './ui/router';
import { getState } from './ui/store';
import './styles.css';

/** Reopening the app mid-game should land straight back on the scoresheet. */
function resumeRecentGame() {
  if (window.location.hash && window.location.hash !== '#/') return;
  const recent = getState()
    .games.filter((g) => Date.now() - g.updatedAt < 12 * 60 * 60 * 1000)
    .filter((g) => scoreGame(g).status === 'active')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (recent) navigate({ name: 'game', id: recent.id }, true);
}

resumeRecentGame();

const root = document.getElementById('app');
if (root) render(<App />, root);

void requestPersistence();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((registration) => {
        // Browsers only look for a new version when the app is (re)loaded,
        // but an installed app is usually just resumed. Check again whenever
        // it comes back to the foreground (at most once a minute). The new
        // service worker reloads the page itself once it takes over.
        let lastCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 60_000) return;
          lastCheck = Date.now();
          registration.update().catch(() => undefined);
        });
      })
      .catch((err: unknown) => {
        console.warn('Service worker registration failed', err);
      });
  });
}
