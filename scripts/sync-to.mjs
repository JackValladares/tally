// Vendors dist/ into a consuming app so its existing build and Docker pipeline
// carry Tally with no changes of their own.
//
//   node scripts/sync-to.mjs ../household-budget            # → src/web/public/tally/
//   node scripts/sync-to.mjs ../other-app --into public/ui   # custom target dir
//   node scripts/sync-to.mjs ../household-budget --check     # exit 1 if the vendored copy is stale
//
// The copy is meant to be committed in the consuming repo, reviewed in the
// same diff as the change that needed it.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
console.log(`vendored tally ${ours.version} → ${dest}`);
