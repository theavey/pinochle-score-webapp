import { MAX_NAME_LENGTH } from '../domain/reducer';
import { RULE_LIMITS } from '../domain/rules';
import type { AppState, Game, Hand, HandDraft, Player, Rules } from '../domain/types';
import { SCHEMA_VERSION } from '../domain/types';
import {
  ValidationError,
  arr,
  bool,
  int,
  nullable,
  obj,
  oneOf,
  str,
  tuple2,
  tuple4,
} from './validate';
import type { Validator } from './validate';

const LIMITS = {
  players: 1_000,
  games: 5_000,
  handsPerGame: 500,
};

const id = str({ min: 1, max: 64 });
const time = int({ min: 0, max: 8.64e15 });
const seat = oneOf(0, 1, 2, 3);
const points = int({ min: 0, max: RULE_LIMITS.maxEntry });
const draftText = str({ max: 8 });

const player: Validator<Player> = obj({
  id,
  name: str({ min: 1, max: MAX_NAME_LENGTH }),
  createdAt: time,
});

export const rulesValidator: Validator<Rules> = obj({
  targetScore: int(RULE_LIMITS.targetScore),
  minBid: int(RULE_LIMITS.minBid),
  trickTotal: int(RULE_LIMITS.trickTotal),
  meldNeedsTrick: bool,
  bidderGoesOut: bool,
  allowThrowIn: bool,
  throwInDefenderScoring: oneOf('meld', 'meldPlusAllTricks', 'nothing'),
  stuckDealer: bool,
});

const handBase = {
  id,
  createdAt: time,
  dealer: seat,
  players: tuple4(id),
  bidder: seat,
  bid: points,
  stuck: bool,
  meld: tuple2(points),
};

const playedHand = obj({
  ...handBase,
  kind: oneOf('played'),
  tricks: tuple2(points),
  tookTrick: tuple2(bool),
});
const thrownInHand = obj({ ...handBase, kind: oneOf('thrownIn') });

const hand: Validator<Hand> = (v, path) => {
  const kind = (v as { kind?: unknown } | null)?.kind;
  return kind === 'thrownIn' ? thrownInHand(v, path) : playedHand(v, path);
};

const draft: Validator<HandDraft> = obj({
  editingHandId: nullable(id),
  dealer: seat,
  bidder: nullable(seat),
  bid: draftText,
  stuck: bool,
  meld: tuple2(draftText),
  defenderTricks: draftText,
  tookTrick: tuple2(bool),
  thrownIn: bool,
});

const game: Validator<Game> = (v, path) => {
  const g = obj({
    id,
    createdAt: time,
    updatedAt: time,
    seats: tuple4(id),
    firstDealer: seat,
    rules: rulesValidator,
    hands: arr(hand, { max: LIMITS.handsPerGame }),
    endedEarly: nullable(obj({ kind: oneOf('called', 'abandoned'), at: time })),
    draft: nullable(draft),
  })(v, path);
  if (new Set(g.seats).size !== 4) throw new ValidationError(`${path}.seats`, 'duplicate player');
  if (new Set(g.hands.map((h) => h.id)).size !== g.hands.length) {
    throw new ValidationError(`${path}.hands`, 'duplicate hand id');
  }
  return g;
};

/**
 * Validate an entire app state, including cross-references (every player id
 * used by a game must exist). Throws ValidationError on the first problem.
 */
export function validateAppState(raw: unknown): AppState {
  const s = obj({
    schemaVersion: oneOf(SCHEMA_VERSION),
    players: arr(player, { max: LIMITS.players }),
    games: arr(game, { max: LIMITS.games }),
    defaultRules: rulesValidator,
    settings: obj({ keepAwake: bool }),
  })(raw, '');

  const playerIds = new Set(s.players.map((p) => p.id));
  if (playerIds.size !== s.players.length) throw new ValidationError('players', 'duplicate id');
  if (new Set(s.games.map((g) => g.id)).size !== s.games.length) {
    throw new ValidationError('games', 'duplicate id');
  }
  s.games.forEach((g, gi) => {
    const refs = [...g.seats, ...g.hands.flatMap((h) => h.players)];
    if (refs.some((p) => !playerIds.has(p))) {
      throw new ValidationError(`games[${gi}]`, 'refers to an unknown player');
    }
  });
  return s;
}
