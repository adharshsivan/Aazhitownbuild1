/**
 * Lokam Mini — EventBus
 * Lightweight, leak-safe, typed publish-subscribe bus for cross-module decoupling.
 */

import type { EventCallback, EventKey, EventPayload, GameEventMap, UnsubscribeFn } from './types';

export class EventBus {
  private listeners = new Map<EventKey, Set<EventCallback<any>>>();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<K extends EventKey>(event: K, callback: EventCallback<K>): UnsubscribeFn {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);

    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Subscribe once. Automatically unsubscribes after first execution.
   */
  once<K extends EventKey>(event: K, callback: EventCallback<K>): UnsubscribeFn {
    const wrapper: EventCallback<K> = (payload) => {
      this.off(event, wrapper);
      callback(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove a specific listener.
   */
  off<K extends EventKey>(event: K, callback: EventCallback<K>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Dispatch an event to all registered listeners.
   */
  emit<K extends EventKey>(
    ...args: GameEventMap[K] extends void
      ? [event: K]
      : [event: K, payload: GameEventMap[K]]
  ): void {
    const [event, payload] = args;
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;

    // Iterate over a snapshot in case listeners unsubscribe during emission
    const snapshot = Array.from(set);
    for (const callback of snapshot) {
      try {
        callback(payload as EventPayload<K>);
      } catch (err) {
        console.error(`[EventBus] Uncaught error in listener for event "${event}":`, err);
      }
    }
  }

  /**
   * Check if any listeners exist for an event.
   */
  hasListeners(event: EventKey): boolean {
    const set = this.listeners.get(event);
    return Boolean(set && set.size > 0);
  }

  /**
   * Clear all registered listeners.
   */
  clear(): void {
    this.listeners.clear();
  }
}
