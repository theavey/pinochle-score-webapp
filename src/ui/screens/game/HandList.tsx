import { draftFromHand } from '../../../domain/draft';
import type { GameScore } from '../../../domain/scoring';
import type { Game } from '../../../domain/types';
import { playerName, signed, teamName, total } from '../../format';
import { dispatch, useStore } from '../../store';

export function HandList({ game, score }: { game: Game; score: GameScore }) {
  const { state } = useStore();
  if (score.results.length === 0) {
    return <p class="muted center">No hands yet. Scores will appear here.</p>;
  }

  const edit = (index: number) => {
    const hand = game.hands[index];
    if (!hand) return;
    dispatch({ type: 'setDraft', gameId: game.id, draft: draftFromHand(hand), now: Date.now() });
    document.getElementById('hand-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section class="card hand-list" aria-label="Hands">
      <div class="row space">
        <h2>Hands</h2>
        <span class="muted small">Tap a hand to fix it</span>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Bid</th>
            <th scope="col" class="team-0-text num">
              {teamName(state, game.seats, 0)}
            </th>
            <th scope="col" class="team-1-text num">
              {teamName(state, game.seats, 1)}
            </th>
          </tr>
        </thead>
        <tbody>
          {[...score.results].reverse().map((r) => {
            const h = r.hand;
            const flag = h.kind === 'thrownIn' ? 'threw in' : r.score.made ? null : 'set';
            const editingThis = game.draft?.editingHandId === h.id;
            return (
              <tr
                key={h.id}
                class={`${flag ? 'row-set' : ''}${editingThis ? ' row-editing' : ''}${
                  score.decidingHand === r.index ? ' row-deciding' : ''
                }`}
              >
                <td>
                  <button
                    type="button"
                    class="row-btn"
                    aria-label={`Edit hand ${r.index + 1}`}
                    onClick={() => {
                      edit(r.index);
                    }}
                  >
                    {r.index + 1}
                  </button>
                </td>
                <td
                  onClick={() => {
                    edit(r.index);
                  }}
                >
                  <div class={`team-${r.score.bidderTeam}-text`}>
                    {playerName(state, h.players[h.bidder])} <strong>{h.bid}</strong>
                  </div>
                  <div class="muted tiny">
                    {[h.stuck ? 'stuck' : null, flag].filter(Boolean).join(' · ') ||
                      `dealt by ${playerName(state, h.players[h.dealer])}`}
                  </div>
                </td>
                {([0, 1] as const).map((t) => (
                  <td
                    key={t}
                    class="num"
                    onClick={() => {
                      edit(r.index);
                    }}
                  >
                    <div class={r.score.delta[t] < 0 ? 'neg tiny' : 'muted tiny'}>
                      {signed(r.score.delta[t])}
                    </div>
                    <div class="running">{total(r.totals[t])}</div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
