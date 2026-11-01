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
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err: unknown) => {
      console.warn('Service worker registration failed', err);
    });
  });
}
