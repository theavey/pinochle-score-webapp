import { teamPlayers } from '../domain/seats';
import type { AppState, PlayerId, SeatQuad, Team } from '../domain/types';

export function playerName(state: AppState, id: PlayerId): string {
  return state.players.find((p) => p.id === id)?.name ?? 'Unknown';
}

export function teamName(state: AppState, seats: SeatQuad<PlayerId>, team: Team): string {
  const [a, b] = teamPlayers(seats, team);
  return `${playerName(state, a)} & ${playerName(state, b)}`;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/** Display a possibly negative total with a proper minus sign. */
export function total(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function pct(num: number, den: number): string {
  return den === 0 ? '–' : `${Math.round((100 * num) / den)}%`;
}

export function newId(): string {
  return crypto.randomUUID();
}
