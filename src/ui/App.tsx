import { useRoute } from './router';
import { GameScreen } from './screens/game/GameScreen';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { JoinSync } from './screens/JoinSync';
import { NewGame } from './screens/NewGame';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { dismissToast, undo, useStore } from './store';

function Screen() {
  const route = useRoute();
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'new':
      return <NewGame />;
    case 'game':
      return <GameScreen key={route.id} id={route.id} />;
    case 'history':
      return <History />;
    case 'stats':
      return <Stats />;
    case 'settings':
      return <Settings />;
    case 'join':
      return <JoinSync code={route.code} />;
  }
}

export function App() {
  const { banner, toast } = useStore();
  return (
    <>
      {banner && (
        <div class="banner" role="alert">
          {banner}
        </div>
      )}
      <Screen />
      <div class="toast-region" aria-live="polite">
        {toast && (
          <div key={toast.id} class={`toast toast-${toast.kind}`}>
            <span>{toast.message}</span>
            {toast.canUndo && (
              <button type="button" class="toast-btn" onClick={undo}>
                Undo
              </button>
            )}
            <button type="button" class="toast-close" aria-label="Dismiss" onClick={dismissToast}>
              ×
            </button>
          </div>
        )}
      </div>
    </>
  );
}
