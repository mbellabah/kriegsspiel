import { useSyncExternalStore } from 'react';
import { Vector2D } from '../types/game';

// Cursor position lives outside React state so only the small components that display it
// (tooltip, grid readout) re-render on mouse movement, not the whole map view.
export interface HoverState {
  coords: Vector2D | null;
  screen: { x: number; y: number } | null;
}

let current: HoverState = { coords: null, screen: null };
const listeners = new Set<() => void>();

export const hoverStore = {
  get: (): HoverState => current,
  set(next: HoverState) {
    current = next;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useHover = (): HoverState => useSyncExternalStore(hoverStore.subscribe, hoverStore.get);
