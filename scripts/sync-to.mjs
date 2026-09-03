// Vendors dist/ into a consuming app so its existing build and Docker pipeline
// carry Tally with no changes of their own.
//
//   node scripts/sync-to.mjs ../household-budget            # → src/web/public/tally/
//   node scripts/sync-to.mjs ../other-app --into public/ui   # custom target dir
//   node scripts/sync-to.mjs ../household-budget --check     # exit 1 if the vendored copy is stale
//
// The copy is meant to be committed in the consuming repo, reviewed in the
// same diff as the change that needed it.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("usage: sync-to <app-dir> [--into <relative dir>] [--check]");
  process.exit(2);
}
const intoIdx = args.indexOf("--into");
const into = intoIdx >= 0 ? args[intoIdx + 1] : "src/web/public/tally";
const check = args.includes("--check");
const dest = path.resolve(target, into);

if (!existsSync("dist/VERSION.json")) {
  console.error("dist/ is missing: run `npm run build` first");
  process.exit(1);
}
const ours = JSON.parse(readFileSync("dist/VERSION.json", "utf8"));

if (check) {
  const theirsPath = path.join(dest, "VERSION.json");
  if (!existsSync(theirsPath)) {
    console.error(`no vendored copy at ${dest}`);
    process.exit(1);
  }
  const theirs = JSON.parse(readFileSync(theirsPath, "utf8"));
  if (theirs.cssSha256 !== ours.cssSha256) {
    console.error(
      `stale: vendored ${theirs.version} (${theirs.builtAt}) ≠ dist ${ours.version} (${ours.builtAt}). Run sync-to.`,
    );
    process.exit(1);
  }
  console.log(`up to date: ${theirs.version} @ ${theirs.cssSha256.slice(0, 12)}`);
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync("dist", dest, { recursive: true });

// The catalogue ships with the primitives it documents. The consuming app
// serves it at /dev, so a component's specimen page cannot drift from the
// component -- which is the whole argument for moving it in-repo rather
// than leaving it in a folder outside both.
const catalogDest = path.join(dest, "catalog");
cpSync("catalog", catalogDest, { recursive: true });

// In this repo the catalogue sits beside dist/, so it references
// ../dist/tally.js -- from index.html's tags and from catalog.js's import
// alike. Vendored, the bundle is its parent directory. Rewriting every text
// file on copy keeps the source page working locally against a fresh build
// and correct once vendored, rather than picking one and breaking the other.
for (const name of readdirSync(catalogDest)) {
  if (!/\.(html|js|css)$/.test(name)) continue;
  const file = path.join(catalogDest, name);
  const before = readFileSync(file, "utf8");
  const after = before.replaceAll("../dist/", "../");
  if (after !== before) writeFileSync(file, after, "utf8");
}

// The catalogue reads fixtures over fetch; without them it renders its
// static sections and nothing else.
if (existsSync("fixtures")) {
  cpSync("fixtures", path.join(dest, "fixtures"), { recursive: true });
}

console.log(`vendored tally ${ours.version} (+ catalog, fixtures) → ${dest}`);
