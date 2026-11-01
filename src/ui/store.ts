import { useEffect, useState } from 'preact/hooks';
import { ActionError, reduce } from '../domain/reducer';
import type { Action } from '../domain/reducer';
import type { AppState } from '../domain/types';
import { STORAGE_KEY, getStorage, loadState, saveState } from '../storage/persist';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
  canUndo: boolean;
}

export interface StoreSnapshot {
  state: AppState;
  /** Persistent problem shown as a banner (storage blocked/full/corrupt). */
  banner: string | null;
  toast: Toast | null;
}

const storage = getStorage();
const loaded = loadState(storage);

let snapshot: StoreSnapshot = { state: loaded.state, banner: loaded.warning, toast: null };
const undoStack: AppState[] = [];
const MAX_UNDO = 20;
const listeners = new Set<() => void>();
let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function emit(next: Partial<StoreSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const l of listeners) l();
}

function persist(state: AppState) {
  const res = saveState(storage, state);
  if (!res.ok && storage) emit({ banner: res.error });
  else if (res.ok && snapshot.banner && loaded.storageAvailable) emit({ banner: null });
}

export function showToast(message: string, kind: Toast['kind'] = 'info', canUndo = false) {
  clearTimeout(toastTimer);
  toastSeq += 1;
  emit({ toast: { id: toastSeq, message, kind, canUndo } });
  toastTimer = setTimeout(
    () => {
      emit({ toast: null });
    },
    canUndo ? 6000 : 3500,
  );
}

export function dismissToast() {
  clearTimeout(toastTimer);
  emit({ toast: null });
}

/**
 * Apply an action, save it, and notify the UI. Returns false (and shows the
 * reason) if the action was rejected. `undoMessage` makes it undoable.
 */
export function dispatch(action: Action, undoMessage?: string): boolean {
  let next: AppState;
  try {
    next = reduce(snapshot.state, action);
  } catch (err) {
    if (err instanceof ActionError) {
      showToast(err.message, 'error');
      return false;
    }
    throw err;
  }
  if (undoMessage) {
    undoStack.push(snapshot.state);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }
  emit({ state: next });
  persist(next);
  if (undoMessage) showToast(undoMessage, 'info', true);
  return true;
}

export function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  emit({ state: prev });
  persist(prev);
  showToast('Undone');
}

export function getState(): AppState {
  return snapshot.state;
}

/** Another tab saved newer data: pick it up so tabs don't overwrite each other. */
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY || e.storageArea !== storage) return;
  const res = loadState(storage);
  if (!res.warning) {
    undoStack.length = 0;
    emit({ state: res.state });
  }
});

export function useStore(): StoreSnapshot {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => {
      setTick((t) => t + 1);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return snapshot;
}
