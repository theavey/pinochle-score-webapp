import { computeStats } from '../../domain/stats';
import { pct, playerName } from '../format';
import { href } from '../router';
import { useStore } from '../store';

export function Stats() {
  const { state } = useStore();
  const { players, partnerships } = computeStats(state.games);
  const rows = [...players.values()].sort(
    (a, b) => b.wins / (b.decided || 1) - a.wins / (a.decided || 1) || b.games - a.games,
  );
  const pairs = [...partnerships]
    .filter((p) => p.decided > 0)
    .sort((a, b) => b.wins / b.decided - a.wins / a.decided || b.decided - a.decided);

  return (
    <main class="page">
      <header class="topbar">
        <a class="icon-btn" href={href({ name: 'home' })} aria-label="Back to home">
          ‹
        </a>
        <h1>Stats</h1>
        <span class="icon-btn" aria-hidden="true" />
      </header>

      {rows.length === 0 ? (
        <p class="muted center">Play a game to see stats.</p>
      ) : (
        <>
          <section class="card scroll-x">
            <h2>Players</h2>
            <table class="stats-table">
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col" class="num" title="Won–lost (finished games)">
                    W–L
                  </th>
                  <th scope="col" class="num">
                    Win
                  </th>
                  <th scope="col" class="num" title="Bids taken">
                    Bids
                  </th>
                  <th scope="col" class="num" title="Bids made (excludes throw-ins)">
                    Made
                  </th>
                  <th scope="col" class="num">
                    Avg bid
                  </th>
                  <th scope="col" class="num">
                    High
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.playerId}>
                    <th scope="row">{playerName(state, r.playerId)}</th>
                    <td class="num">
                      {r.wins}–{r.decided - r.wins}
                    </td>
                    <td class="num">{pct(r.wins, r.decided)}</td>
                    <td class="num">{r.bidsWon}</td>
                    <td class="num">{pct(r.bidsMade, r.bidsMade + r.bidsSet)}</td>
                    <td class="num">{r.bidsWon ? Math.round(r.totalBid / r.bidsWon) : '–'}</td>
                    <td class="num">{r.highestBid || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p class="muted tiny">
              Win/loss counts finished and called games. Abandoned games are ignored. Bids are
              credited to whoever bid, even after a substitution.
            </p>
          </section>

          {pairs.length > 0 && (
            <section class="card">
              <h2>Partnerships</h2>
              <ul class="pair-list">
                {pairs.map((p) => (
                  <li key={p.players.join('|')} class="row space">
                    <span>
                      {playerName(state, p.players[0])} &amp; {playerName(state, p.players[1])}
                    </span>
                    <span>
                      <strong>
                        {p.wins}–{p.decided - p.wins}
                      </strong>{' '}
                      <span class="muted">{pct(p.wins, p.decided)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
