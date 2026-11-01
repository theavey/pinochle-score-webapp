import { scoreGame } from '../../domain/scoring';
import type { GameStatus } from '../../domain/scoring';
import { formatDate, teamName, total } from '../format';
import { href } from '../router';
import { useStore } from '../store';

const STATUS: Record<GameStatus, string> = {
  active: 'In progress',
  won: 'Finished',
  called: 'Called early',
  abandoned: 'Abandoned',
};

export function History() {
  const { state } = useStore();
  const games = [...state.games].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <main class="page">
      <header class="topbar">
        <a class="icon-btn" href={href({ name: 'home' })} aria-label="Back to home">
          ‹
        </a>
        <h1>History</h1>
        <span class="icon-btn" aria-hidden="true" />
      </header>

      {games.length === 0 && <p class="muted center">No games yet.</p>}

      <ul class="history-list">
        {games.map((g) => {
          const s = scoreGame(g);
          return (
            <li key={g.id}>
              <a class="card card-link" href={href({ name: 'game', id: g.id })}>
                <div class="row space">
                  <span class="eyebrow">{formatDate(g.createdAt)}</span>
                  <span class={`badge status-${s.status}`}>{STATUS[s.status]}</span>
                </div>
                {([0, 1] as const).map((t) => (
                  <div key={t} class={`history-team team-${t}-text${s.winner === t ? ' won' : ''}`}>
                    <span>
                      {s.winner === t && <span aria-label="winner">🏆 </span>}
                      {teamName(state, g.seats, t)}
                    </span>
                    <strong>{total(s.totals[t])}</strong>
                  </div>
                ))}
                <div class="muted small">
                  {g.hands.length} hand{g.hands.length === 1 ? '' : 's'} · to {g.rules.targetScore}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
