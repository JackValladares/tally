// Builds dist/ from src/: one CSS bundle with the font copied beside it, and
// (once lib/ has modules) one JS bundle. esbuild inlines the @imports, keeps
// @layer intact, and rewrites url(./fonts/x.woff2) to the copied file.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as esbuild from "esbuild";

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
  };
  writeFileSync("dist/VERSION.json", `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(`tally ${pkg.version} → dist/ (${css.length} bytes css)`);
}
