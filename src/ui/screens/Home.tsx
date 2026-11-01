import { scoreGame } from '../../domain/scoring';
import { formatDateTime, teamName, total } from '../format';
import { href } from '../router';
import { useStore } from '../store';

export function Home() {
  const { state } = useStore();
  const active = state.games
    .map((g) => ({ g, s: scoreGame(g) }))
    .filter(({ s }) => s.status === 'active')
    .sort((a, b) => b.g.updatedAt - a.g.updatedAt);

  return (
    <main class="page">
      <header class="hero">
        <div class="hero-mark" aria-hidden="true">
          ♠<span class="red">♥</span>
        </div>
        <h1>Pinochle Score</h1>
        <p class="muted">Partnership scorekeeper</p>
      </header>

      {active.map(({ g, s }) => (
        <a key={g.id} class="card card-link resume" href={href({ name: 'game', id: g.id })}>
          <div class="eyebrow">Resume game · {formatDateTime(g.updatedAt)}</div>
          <div class="resume-score">
            <span class="team-0-text">
              {teamName(state, g.seats, 0)} <strong>{total(s.totals[0])}</strong>
            </span>
            <span class="team-1-text">
              {teamName(state, g.seats, 1)} <strong>{total(s.totals[1])}</strong>
            </span>
          </div>
          <div class="muted small">
            Hand {g.hands.length + 1}
            {g.draft ? ' · entry in progress' : ''}
          </div>
        </a>
      ))}

      <nav class="menu" aria-label="Main">
        <a class="btn btn-primary btn-big" href={href({ name: 'new' })}>
          New game
        </a>
        <a class="btn btn-big" href={href({ name: 'history' })}>
          History
        </a>
        <a class="btn btn-big" href={href({ name: 'stats' })}>
          Stats
        </a>
        <a class="btn btn-big" href={href({ name: 'settings' })}>
          Settings &amp; backup
        </a>
      </nav>
    </main>
  );
}
