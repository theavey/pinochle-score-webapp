import { DEFAULT_RULES } from './rules';
import type {
  AppState,
  Game,
  GameId,
  Hand,
  HandDraft,
  HandId,
  Player,
  PlayerId,
  Rules,
  Seat,
  SeatQuad,
  Settings,
} from './types';
import { SCHEMA_VERSION } from './types';
import type { HandInput } from './draft';

export const MAX_NAME_LENGTH = 24;

export function initialState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    players: [],
    games: [],
    tombstones: { games: [], players: [] },
    defaultRules: { ...DEFAULT_RULES },
    settings: { keepAwake: true },
  };
}

/** Collapse whitespace and trim; names are display-only text. */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export function findPlayerByName(state: AppState, name: string): Player | undefined {
  const n = normalizeName(name).toLocaleLowerCase();
  return state.players.find((p) => p.name.toLocaleLowerCase() === n);
}

export type Action =
  | { type: 'addPlayer'; id: PlayerId; name: string; now: number }
  | { type: 'renamePlayer'; id: PlayerId; name: string; now: number }
  | { type: 'deletePlayer'; id: PlayerId; now: number }
  | { type: 'mergePlayers'; from: PlayerId; into: PlayerId; now: number }
  | {
      type: 'createGame';
      id: GameId;
      seats: SeatQuad<PlayerId>;
      firstDealer: Seat;
      rules: Rules;
      now: number;
    }
  | { type: 'setDraft'; gameId: GameId; draft: HandDraft | null; now: number }
  | { type: 'saveHand'; gameId: GameId; handId: HandId; hand: HandInput; now: number }
  | { type: 'deleteHand'; gameId: GameId; handId: HandId; now: number }
  | { type: 'setGameRules'; gameId: GameId; rules: Rules; now: number }
  | { type: 'setSeat'; gameId: GameId; seat: Seat; playerId: PlayerId; now: number }
  | { type: 'endGame'; gameId: GameId; kind: 'called' | 'abandoned'; now: number }
  | { type: 'reopenGame'; gameId: GameId; now: number }
  | { type: 'deleteGame'; gameId: GameId; now: number }
  | { type: 'setDefaultRules'; rules: Rules }
  | { type: 'setSettings'; settings: Partial<Settings> }
  | { type: 'replaceState'; state: AppState };

export class ActionError extends Error {}

function updateGame(state: AppState, id: GameId, f: (g: Game) => Game): AppState {
  const index = state.games.findIndex((g) => g.id === id);
  const game = state.games[index];
  if (!game) throw new ActionError('Game not found');
  const games = [...state.games];
  games[index] = f(game);
  return { ...state, games };
}

function playerInUse(state: AppState, id: PlayerId): boolean {
  return state.games.some(
    (g) => g.seats.includes(id) || g.hands.some((h) => h.players.includes(id)),
  );
}

function replaceId(quad: SeatQuad<PlayerId>, from: PlayerId, into: PlayerId): SeatQuad<PlayerId> {
  return quad.map((p) => (p === from ? into : p)) as SeatQuad<PlayerId>;
}

/**
 * Pure state transition. Throws ActionError for invalid requests so the UI
 * can show a message; never partially applies an action.
 */
export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'addPlayer': {
      const name = normalizeName(action.name);
      if (!name) throw new ActionError('Name is required');
      if (findPlayerByName(state, name)) throw new ActionError(`${name} already exists`);
      return {
        ...state,
        players: [
          ...state.players,
          { id: action.id, name, createdAt: action.now, updatedAt: action.now },
        ],
      };
    }
    case 'renamePlayer': {
      const name = normalizeName(action.name);
      if (!name) throw new ActionError('Name is required');
      const clash = findPlayerByName(state, name);
      if (clash && clash.id !== action.id) throw new ActionError(`${name} already exists`);
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.id ? { ...p, name, updatedAt: action.now } : p,
        ),
      };
    }
    case 'deletePlayer': {
      if (playerInUse(state, action.id)) {
        throw new ActionError('This player appears in saved games. Merge them instead.');
      }
      return {
        ...state,
        players: state.players.filter((p) => p.id !== action.id),
        tombstones: {
          ...state.tombstones,
          players: [
            ...state.tombstones.players,
            { id: action.id, at: action.now, mergedInto: null },
          ],
        },
      };
    }
    case 'mergePlayers': {
      const { from, into } = action;
      if (from === into) throw new ActionError('Pick two different players');
      if (!state.players.some((p) => p.id === into)) throw new ActionError('Player not found');
      const conflict = state.games.some(
        (g) =>
          (g.seats.includes(from) && g.seats.includes(into)) ||
          g.hands.some((h) => h.players.includes(from) && h.players.includes(into)),
      );
      if (conflict) {
        throw new ActionError(
          'Those two played in the same game, so they must be different people',
        );
      }
      return {
        ...state,
        players: state.players.filter((p) => p.id !== from),
        tombstones: {
          ...state.tombstones,
          players: [...state.tombstones.players, { id: from, at: action.now, mergedInto: into }],
        },
        games: state.games.map((g) => ({
          ...g,
          seats: replaceId(g.seats, from, into),
          hands: g.hands.map((h) => ({ ...h, players: replaceId(h.players, from, into) })),
        })),
      };
    }
    case 'createGame': {
      if (new Set(action.seats).size !== 4) throw new ActionError('Pick four different players');
      for (const id of action.seats) {
        if (!state.players.some((p) => p.id === id)) throw new ActionError('Unknown player');
      }
      const game: Game = {
        id: action.id,
        createdAt: action.now,
        updatedAt: action.now,
        seats: [...action.seats],
        firstDealer: action.firstDealer,
        rules: { ...action.rules },
        hands: [],
        endedEarly: null,
        draft: null,
      };
      return { ...state, games: [...state.games, game], defaultRules: { ...action.rules } };
    }
    case 'setDraft':
      // Counts as an update, so a half-entered hand is the newest copy when
      // devices merge (another device's table display can show the live bid).
      return updateGame(state, action.gameId, (g) => ({
        ...g,
        draft: action.draft,
        updatedAt: action.now,
      }));
    case 'saveHand':
      return updateGame(state, action.gameId, (g) => {
        const existing = g.hands.find((h) => h.id === action.handId);
        const hand: Hand = {
          ...action.hand,
          id: action.handId,
          createdAt: existing?.createdAt ?? action.now,
        };
        const hands = existing
          ? g.hands.map((h) => (h.id === action.handId ? hand : h))
          : [...g.hands, hand];
        return { ...g, hands, draft: null, updatedAt: action.now };
      });
    case 'deleteHand':
      return updateGame(state, action.gameId, (g) => ({
        ...g,
        hands: g.hands.filter((h) => h.id !== action.handId),
        draft: g.draft?.editingHandId === action.handId ? null : g.draft,
        updatedAt: action.now,
      }));
    case 'setGameRules':
      return updateGame(state, action.gameId, (g) => ({
        ...g,
        rules: { ...action.rules },
        updatedAt: action.now,
      }));
    case 'setSeat':
      return updateGame(state, action.gameId, (g) => {
        if (!state.players.some((p) => p.id === action.playerId)) {
          throw new ActionError('Unknown player');
        }
        const other = g.seats.findIndex((p, i) => p === action.playerId && i !== action.seat);
        const seats = [...g.seats] as SeatQuad<PlayerId>;
        // Choosing someone already at the table swaps the two seats.
        if (other !== -1) seats[other as Seat] = seats[action.seat];
        seats[action.seat] = action.playerId;
        return { ...g, seats, updatedAt: action.now };
      });
    case 'endGame':
      return updateGame(state, action.gameId, (g) => ({
        ...g,
        endedEarly: { kind: action.kind, at: action.now },
        draft: null,
        updatedAt: action.now,
      }));
    case 'reopenGame':
      return updateGame(state, action.gameId, (g) => ({
        ...g,
        endedEarly: null,
        updatedAt: action.now,
      }));
    case 'deleteGame':
      return {
        ...state,
        games: state.games.filter((g) => g.id !== action.gameId),
        tombstones: {
          ...state.tombstones,
          games: [...state.tombstones.games, { id: action.gameId, at: action.now }],
        },
      };
    case 'setDefaultRules':
      return { ...state, defaultRules: { ...action.rules } };
    case 'setSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'replaceState':
      return action.state;
  }
}
