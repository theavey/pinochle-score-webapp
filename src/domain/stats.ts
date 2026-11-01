import { scoreGame } from './scoring';
import { teamPlayers } from './seats';
import type { Game, PlayerId } from './types';

export interface PlayerStats {
  playerId: PlayerId;
  games: number;
  /** Games that ended with a winner (won to target, or called with a leader). */
  decided: number;
  wins: number;
  bidsWon: number;
  bidsMade: number;
  bidsSet: number;
  throwIns: number;
  stuck: number;
  totalBid: number;
  highestBid: number;
}

export interface PartnershipStats {
  players: [PlayerId, PlayerId];
  games: number;
  decided: number;
  wins: number;
}

function emptyPlayer(playerId: PlayerId): PlayerStats {
  return {
    playerId,
    games: 0,
    decided: 0,
    wins: 0,
    bidsWon: 0,
    bidsMade: 0,
    bidsSet: 0,
    throwIns: 0,
    stuck: 0,
    totalBid: 0,
    highestBid: 0,
  };
}

/**
 * Aggregate stats across games. Wins and partnerships are credited to the
 * final seating of each game; bids are credited to whoever actually sat in
 * the bidding seat on that hand (handles mid-game substitutions).
 */
export function computeStats(games: readonly Game[]): {
  players: Map<PlayerId, PlayerStats>;
  partnerships: PartnershipStats[];
} {
  const players = new Map<PlayerId, PlayerStats>();
  const pairs = new Map<string, PartnershipStats>();
  const get = (id: PlayerId) => {
    let s = players.get(id);
    if (!s) {
      s = emptyPlayer(id);
      players.set(id, s);
    }
    return s;
  };

  for (const game of games) {
    if (game.hands.length === 0) continue;
    const score = scoreGame(game);
    if (score.status === 'abandoned') continue;
    const finished = score.status !== 'active';

    const inGame = new Set<PlayerId>();
    for (const hand of game.hands) for (const p of hand.players) inGame.add(p);
    for (const p of game.seats) inGame.add(p);
    for (const p of inGame) get(p).games += 1;

    for (const r of score.results) {
      const s = get(r.hand.players[r.hand.bidder]);
      s.bidsWon += 1;
      s.totalBid += r.hand.bid;
      s.highestBid = Math.max(s.highestBid, r.hand.bid);
      if (r.hand.stuck) s.stuck += 1;
      if (r.hand.kind === 'thrownIn') s.throwIns += 1;
      else if (r.score.made) s.bidsMade += 1;
      else s.bidsSet += 1;
    }

    for (const team of [0, 1] as const) {
      const ids = teamPlayers(game.seats, team);
      const key = [...ids].sort().join('|');
      let ps = pairs.get(key);
      if (!ps) {
        ps = { players: [...ids].sort() as [PlayerId, PlayerId], games: 0, decided: 0, wins: 0 };
        pairs.set(key, ps);
      }
      ps.games += 1;
      if (finished && score.winner !== null) {
        ps.decided += 1;
        if (score.winner === team) ps.wins += 1;
        for (const id of ids) {
          get(id).decided += 1;
          if (score.winner === team) get(id).wins += 1;
        }
      }
    }
  }

  return { players, partnerships: [...pairs.values()] };
}
