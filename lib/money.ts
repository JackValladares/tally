// Money: the one place an amount is turned into markup.
//
// The suite's signature primitive, and the reason it exists is the design
// analysis's sharpest finding — this app's entire content is numerals, and
// a $15,373.68 headline differed from a $1.00 line item only by font-size.
// So the currency symbol and the cents recede, the integer carries the eye,
// and the two statement sizes step up to the figure face at weight 600.
//
// Every call site formats through here rather than calling
// Intl.NumberFormat itself, which is what stops "$1,234.5" and "1234.50"
// and "$1,234.50" all appearing on the same screen.

import { html, type Raw, raw } from "./html.js";

export type MoneySize = "sm" | "md" | "lg" | "xl";
export type Valence = "positive" | "negative" | "neutral";

export interface MoneyOptions {
  size?: MoneySize;
  /** Omit to let the sign of the value decide nothing — neutral is the default. */
  valence?: Valence;
  /** From the capabilities probe, never hardcoded. */
  currency?: string;
  locale?: string;
  /** Render a true minus (U+2212) rather than a hyphen. */
  showSign?: boolean;
}

interface Parts {
  sign: string;
  currency: string;
  integer: string;
  cents: string;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: "currency", currency });
    formatters.set(key, f);
  }
  return f;
}

/**
 * Splits a formatted amount into the pieces the type treatment needs.
 * formatToParts rather than string surgery, so a locale that puts the
 * symbol after the number, or groups differently, still comes apart
 * correctly.
 */
export function moneyParts(value: number, locale = "en-US", currency = "USD"): Parts {
  const parts = formatterFor(locale, currency).formatToParts(Math.abs(value));
  let cur = "";
  let integer = "";
  let cents = "";
  let seenDecimal = false;
  for (const p of parts) {
    if (p.type === "currency") cur += p.value;
    else if (p.type === "decimal") {
      seenDecimal = true;
      cents += p.value;
    } else if (p.type === "fraction") cents += p.value;
    else if (p.type === "integer" || p.type === "group") {
      if (seenDecimal) cents += p.value;
      else integer += p.value;
    }
  }
  return { sign: value < 0 ? "−" : "", currency: cur, integer, cents };
}

/** The primitive. Returns a fragment; callers put it where it belongs. */
export function money(value: number, options: MoneyOptions = {}): Raw {
  const {
    size = "md",
    valence = "neutral",
    currency = "USD",
    locale = "en-US",
    showSign = true,
  } = options;
  const p = moneyParts(value, locale, currency);
  const sign = showSign && p.sign ? `<span class="t-money__sign">${p.sign}</span>` : "";
  return raw(
    `<span class="t-money t-money--${size}" data-valence="${valence}">` +
      sign +
      `<span class="t-money__cur">${p.currency}</span>` +
      p.integer +
      `<span class="t-money__cents">${p.cents}</span>` +
      "</span>",
  );
}

/** A stat tile: label, figure, optional foot. Composed, not bespoke. */
export function stat(label: string, figure: Raw, foot?: Raw | string): Raw {
  return html`<div class="t-card t-stat">
    <span class="t-stat__label">${label}</span>
    ${figure}
    ${foot ? html`<span class="t-stat__foot">${foot}</span>` : ""}
  </div>`;
}
