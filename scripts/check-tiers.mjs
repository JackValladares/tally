// The rules neither Biome nor Stylelint express. Fails the lint script on any hit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const roots = ["src", "lib", "catalog", "scripts"].filter((d) => {
  try {
    return statSync(d).isDirectory();
  } catch {
    return false;
  }
});
const files = [];
function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js|ts|css|html)$/.test(e)) files.push(p);
  }
}
for (const r of roots) walk(r);

const rules = [
  // tier direction
  {
    re: /from\s+["'][^"']*\/(components|patterns)\//,
    in: /^lib\/primitives\//,
    msg: "primitives may not import components or patterns",
  },
  {
    re: /from\s+["'][^"']*\/patterns\//,
    in: /^lib\/components\//,
    msg: "components may not import patterns",
  },
  // no fetching below pages
  {
    re: /\bfetch\(|XMLHttpRequest|from\s+["'][^"']*\/resource["']/,
    in: /^lib\/(primitives|components|patterns)\//,
    msg: "only pages may fetch or use resource()",
  },
  // rendering goes through the escaping template
  {
    re: /\.innerHTML\s*=/,
    in: /^lib\/(?!html\.)/,
    msg: "innerHTML outside lib/html: use the html`` template",
  },
  // backend spec bans
  {
    re: /toISOString\(\)\.slice\(/,
    in: /^(lib|catalog)\//,
    msg: "toISOString().slice: dates are CalDate strings from the server (spec B-16)",
  },
  {
    re: /Number\(\s*[\w.]*\.(amount|balance|limit|spent|projected)\b/,
    in: /^(lib|catalog)\//,
    msg: "money is already a number (spec B-15)",
  },
  {
    re: /\bkey\s*[:=]\s*[\w.]*institution\b/,
    in: /^(lib|catalog)\//,
    msg: "key on itemId/accountId, never institution (spec B-04)",
  },
  {
    re: /\baliased\b/i,
    in: /^(lib|catalog|src)\//,
    msg: "no aliased indicator, in any form (spec §3)",
  },
  { re: /\balert\(/, in: /^(lib|catalog)\//, msg: "alert(): use Toast (audit F-09)" },
  {
    re: /preserveAspectRatio="none"/,
    in: /./,
    msg: 'preserveAspectRatio="none" stretches marks and text (audit F-05)',
  },
  // resting tints come from tone tokens
  {
    re: /color-mix\([^)]*\)\s*;/,
    in: /^src\/(primitives|components)\.css$/,
    msg: "resting tint via color-mix: read a --tone-* token instead",
    allowIf:
      /(hover|focus|--_bg:|--_bd:|currentcolor|area|__area|\.t-btn|\.t-chart|backdrop|spec-)/i,
  },
];

let hits = 0;
for (const f of files) {
  if (f.endsWith("check-tiers.mjs")) continue;
  const src = readFileSync(f, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(\/\*|\*|\/\/)/.test(line)) continue;
    for (const r of rules) {
      if (!r.in.test(f)) continue;
      if (r.re.test(line) && !r.allowIf?.test(line)) {
        hits++;
        console.log(`${f}:${i + 1}: ${r.msg}\n    ${line.trim()}`);
      }
    }
  }
}
if (hits) {
  console.error(`\ncheck-tiers: ${hits} problem(s)`);
  process.exit(1);
}
console.log(`check-tiers: ${files.length} files clean`);
