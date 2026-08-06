// ─── calculator-feed.mjs ────────────────────────────────────────────────────
// Place in the BESS Revenue Intelligence dashboard repo as:
//     api/calculator-feed.mjs
//
// Serves the calculator feed to the GreenVoltis BESS Calculator only. The feed
// carries realised per-zone revenue, so it is deliberately NOT in public/ where
// Vercel's CDN would serve it to anyone who guessed the filename.
//
// Setup
// -----
// 1. The pipeline writes ../data/calculator_feed.json relative to this file
//    (calculator_feed.py already targets bess-dashboard/data/).
// 2. Vercel -> this project -> Settings -> Environment Variables:
//        GV_FEED_KEY = <long random string>
//    Generate one with:  openssl rand -hex 32
// 3. Set the identical value in the BESS Calculator project.
//
// The .mjs extension forces ESM regardless of what package.json says, and
// createRequire loads the JSON without needing import assertions. The file is
// resolved statically so Vercel bundles it into the function at build time —
// no vercel.json includeFiles needed.

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const feed = require("../data/calculator_feed.json");

// Constant-time comparison so response latency cannot be used to recover the key
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function handler(req, res) {
  const expected = process.env.GV_FEED_KEY;

  // Fail closed: without a configured key the endpoint serves nothing.
  if (!expected) {
    console.error("GV_FEED_KEY is not set — refusing to serve the feed.");
    return res.status(503).json({ error: "feed not configured" });
  }

  const provided = req.headers["x-gv-feed-key"];
  if (!safeEqual(String(provided || ""), expected)) {
    // No detail in the response — a caller without the key learns nothing.
    return res.status(401).json({ error: "unauthorized" });
  }

  // Intentionally no Access-Control-Allow-Origin: this is a server-to-server
  // endpoint and a browser must not be able to call it from a page.
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return res.status(200).json(feed);
}
