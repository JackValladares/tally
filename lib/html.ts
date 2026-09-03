// Escaping tagged template. Retires the manual-escaping class of bug (audit
// F-07): every interpolation is escaped by default, and `raw()` is the one
// explicit opt-out for markup a caller has already built with `html`
// itself (composition) or knows is safe (a literal SVG path). Every
// component in lib/components renders through this — nothing under
// lib/ ever assigns to `.innerHTML` directly (scripts/check-tiers.mjs
// enforces the second half of that sentence).

/** Marks a string as pre-escaped so `html` interpolates it verbatim. */
export type Raw = { readonly __html: string };

/** Wrap a string that is already safe HTML (or the output of another
 * `html` call) so it is not re-escaped when interpolated. */
export function raw(value: string): Raw {
  return { __html: value };
}

const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch] ?? ch);
}

function isRaw(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && "__html" in value;
}

/** A value that can be interpolated into an `html` template. */
export type Interpolated = string | number | boolean | Raw | null | undefined | Interpolated[];

function stringify(value: Interpolated): string {
  if (value === null || value === undefined || value === false) return "";
  if (value === true) return "";
  if (Array.isArray(value)) return value.map(stringify).join("");
  if (isRaw(value)) return value.__html;
  if (typeof value === "number") return String(value);
  return escapeHtml(value);
}

/**
 * Tagged template that escapes every interpolation by default.
 *
 *   html`<span class="t-money__cur">${symbol}</span>`
 *
 * Nesting composes safely because the inner call already returns a `Raw`:
 *
 *   html`<div>${html`<b>${name}</b>`}</div>`
 */
export function html(strings: TemplateStringsArray, ...values: Interpolated[]): Raw {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    out += stringify(values[i]);
    out += strings[i + 1] ?? "";
  }
  return raw(out);
}

/** Render a `Raw` fragment into a container, replacing its children. The
 * only sanctioned assignment to `innerHTML` in the whole client. */
export function render(container: Element, fragment: Raw): void {
  container.innerHTML = fragment.__html;
}
