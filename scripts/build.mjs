// Builds dist/ from src/: one CSS bundle with the font copied beside it, and
// (once lib/ has modules) one JS bundle. esbuild inlines the @imports, keeps
// @layer intact, and rewrites url(./fonts/x.woff2) to the copied file.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

/**
 * A stable hash over a set of directories: every file's path and contents,
 * walked in sorted order so the result does not depend on readdir order or
 * on when anything was written. VERSION.json itself is excluded, since it
 * is the thing being stamped.
 */
function hashTree(dirs) {
  const hash = createHash("sha256");
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      if (name === "VERSION.json") continue;
      if (statSync(full).isDirectory()) walk(full);
      else hash.update(full).update(readFileSync(full));
    }
  };
  for (const d of dirs) walk(d);
  return hash.digest("hex");
}

const watch = process.argv.includes("--watch");
const hasLib =
  existsSync("lib") && readdirSync("lib").some((f) => f.endsWith(".ts") || f.endsWith(".js"));

const options = {
  entryPoints: [
    { in: "src/tally.css", out: "tally" },
    ...(hasLib ? [{ in: "lib/index.ts", out: "tally" }] : []),
  ],
  outdir: "dist",
  bundle: true,
  minify: false,
  legalComments: "none",
  loader: { ".woff2": "file" },
  assetNames: "fonts/[name]",
  entryNames: "[name]",
  format: "esm",
  target: ["es2022", "chrome120", "firefox120", "safari17"],
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
  mkdirSync("dist", { recursive: true });
  const css = readFileSync("dist/tally.css");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const stamp = {
    name: pkg.name,
    version: pkg.version,
    builtAt: new Date().toISOString(),
    cssSha256: createHash("sha256").update(css).digest("hex"),
    // Everything the consumer actually vendors, not just the stylesheet.
    // sync-to now carries dist/, catalog/ and fixtures/, and a hash of one
    // file cannot notice a change in the other two -- which is precisely
    // the silent drift the check exists to catch.
    payloadSha256: hashTree(["dist", "catalog", "fixtures"]),
  };
  writeFileSync("dist/VERSION.json", `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(`tally ${pkg.version} → dist/ (${css.length} bytes css)`);
}
