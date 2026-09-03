// The one place the three shared request parameters (memberId, from, to)
// turn into a query string, and therefore the one place a CalDate string
// gets built for a request. Nothing here calls `toISOString().slice(...)`
// (spec B-16 bans it): dates already arrive as `YYYY-MM-DD` strings from
// callers (a <input type="date"> value, or a preset already expressed as
// CalDate), never carved out of a `Date` instance.

/** A calendar date in the household timezone, `YYYY-MM-DD`. */
export type CalDate = string;

/** The three parameters almost every panel scopes its fetch by. Extra,
 * endpoint-specific params can be passed alongside them. */
export interface QueryParams {
  memberId?: string;
  from?: CalDate;
  to?: CalDate;
  [key: string]: string | number | boolean | undefined;
}

/** Build a `URLSearchParams` from a params object, dropping anything
 * `undefined` so a panel can pass its whole scope object unconditionally
 * (`query({ memberId, from, to, cursor })`) without hand-pruning it. */
export function query(params: QueryParams = {}): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    usp.set(key, String(value));
  }
  return usp;
}
