// Gives each panel idle / loading / error / empty / ready with an
// AbortController per key (audit F-08, F-09): a panel that requests a new
// key while an old request is in flight cancels the old one instead of
// racing it, and a panel is never stuck on "Loading…" after a failure.
// Skeleton, Empty and Error are this state machine's visual half.
//
// Components never import this module (scripts/check-tiers.mjs enforces
// it): only a page composes a `resource()` and hands components the
// state it produces.

import { type Store, store } from "./store.js";

export type ResourceState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "empty" }
  | { status: "error"; error: unknown };

export type Fetcher<T> = (signal: AbortSignal) => Promise<T>;

/** True when `data` should be treated as the empty state rather than
 * ready: `null`/`undefined`, an empty array, or an object with no keys.
 * A caller with its own notion of empty (e.g. `{ items: [] }`) should
 * pass `isEmpty` instead of relying on this default. */
function defaultIsEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "object") return Object.keys(data).length === 0;
  return false;
}

export interface Resource<T> extends Pick<Store<ResourceState<T>>, "get" | "subscribe"> {
  /** Run the fetcher again with the same key, aborting any request for
   * that key already in flight. */
  reload(): void;
  /** Abort any in-flight request and leave the resource idle. */
  cancel(): void;
}

/** Create a `resource(key, fetcher)`: the only thing in the client that
 * calls `fetch`. `key` identifies this resource for its AbortController
 * (a panel that reloads under a new key gets a fresh controller); pass a
 * stable string per panel, e.g. the endpoint path. */
export function resource<T>(
  key: string,
  fetcher: Fetcher<T>,
  options: { isEmpty?: (data: T) => boolean } = {},
): Resource<T> {
  const isEmpty = options.isEmpty ?? defaultIsEmpty;
  const state = store<ResourceState<T>>({ status: "idle" });
  let controller: AbortController | null = null;

  function run(): void {
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    state.set({ status: "loading" });
    fetcher(mine.signal).then(
      (data) => {
        if (mine.signal.aborted) return;
        state.set(isEmpty(data) ? { status: "empty" } : { status: "ready", data });
      },
      (error: unknown) => {
        if (mine.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(`resource(${key}) failed`, error);
        state.set({ status: "error", error });
      },
    );
  }

  run();

  return {
    get: state.get,
    subscribe: state.subscribe,
    reload: run,
    cancel() {
      controller?.abort();
      state.set({ status: "idle" });
    },
  };
}
