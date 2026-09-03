// A static server that answers /api/v1/<path> from fixtures/<state>/<path>.json,
// so the whole UI runs with no database, no Plaid key and no Anthropic key.
//
//   node scripts/serve-fixtures.mjs               # http://localhost:4180, state "populated"
//   STATE=empty node scripts/serve-fixtures.mjs   # start in another state
//   node scripts/serve-fixtures.mjs --catalog     # also serve catalog/ and dist/ at /
//
// Switch state at runtime: GET /__state/empty (or populated, error, midsync).
// A path missing from the current state falls back to "populated"; a path
// missing there is a 404 with the contract's error envelope.

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const port = Number(process.env.PORT || 4180);
let state = process.env.STATE || "populated";
const catalog = process.argv.includes("--catalog");
const root = process.cwd();
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function fixture(p) {
  for (const s of [state, "populated"]) {
    const f = path.join(root, "fixtures", s, `${p}.json`);
    try {
      await stat(f);
      return readFile(f);
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const send = (code, body, type = "application/json; charset=utf-8") => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  };
  try {
    if (url.pathname.startsWith("/__state/")) {
      state = url.pathname.slice(9) || "populated";
      return send(200, JSON.stringify({ state }));
    }
    if (url.pathname === "/__state") return send(200, JSON.stringify({ state }));
    const api = url.pathname.match(/^\/api\/v1\/(.+)$/) || url.pathname.match(/^\/api\/(.+)$/);
    if (api) {
      const body = await fixture(api[1].replace(/\/+$/, ""));
      if (body) return send(req.method === "POST" && api[1] === "sync" ? 202 : 200, body);
      return send(
        404,
        JSON.stringify({
          error: { code: "NOT_FOUND", message: `no fixture for ${api[1]} in state ${state}` },
        }),
      );
    }
    if (catalog) {
      if (url.pathname === "/") {
        // A real redirect, not just an internal path swap: the catalogue's
        // own relative asset links (./catalog.css, ./catalog.js) resolve
        // against the browser's address bar, so it has to actually say
        // /catalog/index.html or those 404 while the page still 200s.
        res.writeHead(302, { location: "/catalog/index.html" });
        return res.end();
      }
      const p = url.pathname;
      if (p.startsWith("/catalog") || p.startsWith("/dist") || p.startsWith("/fixtures")) {
        const f = path.join(root, p);
        const body = await readFile(f).catch(() => null);
        if (body) return send(200, body, types[path.extname(f)] || "application/octet-stream");
      }
    }
    send(404, JSON.stringify({ error: { code: "NOT_FOUND", message: url.pathname } }));
  } catch (e) {
    send(500, JSON.stringify({ error: { code: "INTERNAL", message: "fixture server error" } }));
    console.error(e);
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    `fixtures: http://localhost:${port}/api/v1/…  state=${state}${catalog ? "  catalogue at /" : ""}`,
  ),
);
