// A small observable so a member or date-range change notifies every
// subscribed panel rather than the page re-running everything. This is
// the piece that lets tabs lazy-load on first show and keep the active
// scope in sync without a framework.

export type Unsubscribe = () => void;
export type Listener<T> = (value: T) => void;

export interface Store<T> {
  /** Current value. */
  get(): T;
  /** Replace the value. Listeners run only when the value actually changed
   * (`Object.is`), so setting the same scope twice is a no-op. */
  set(value: T): void;
  /** Merge a partial update into the current value (object stores only). */
  update(patch: Partial<T>): void;
  /** Subscribe to changes; returns an unsubscribe function. Does not call
   * the listener immediately — callers that want the current value read
   * `get()` first. */
  subscribe(listener: Listener<T>): Unsubscribe;
}

/** Create a small observable store seeded with `initial`. */
export function store<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener(value);
    },
    update(patch: Partial<T>) {
      this.set({ ...value, ...patch });
    },
    subscribe(listener: Listener<T>): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
