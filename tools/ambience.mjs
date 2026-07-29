// Yume Forge — ambience tile generator.
//
// Deliberately does NOT emit the crystal: that has two possible sources
// (tools/crystal.mjs draws one, tools/rip-assets.py rips one) and this file
// needs to be re-runnable without clobbering whichever you chose.
//
//   node tools/ambience.mjs
//
// Emits the two tiled backdrops the Final Fantasy theme uses:
//
//   • crystal motes — 4-point sparkles + shards drifting down, 280x460 so it
//     loops against _base.css's `cct-fall` keyframe (which translates exactly
//     one tile height).
//   • starfield    — static pinpricks with a very slow parallax drift, giving
//     the menu windows something to float over.
//
// Note: SVGs used as CSS background-image are static — no SMIL, no CSS
// animation inside them. Anything that needs to move has to move as a whole
// layer, which is why twinkle is done as a layer-wide opacity pulse instead of
// per-sparkle.
//
// The PRNG is seeded so regenerating produces byte-identical output; tweak
// SEED (or the density knobs) to reshuffle deliberately rather than by accident.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SEED = 20250727;

/** mulberry32 — tiny deterministic PRNG. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v) => Math.round(v * 100) / 100;

/* -------------------------------------------------------------- shapes */

/** Classic 4-point sparkle with concave waists. */
function sparkle(cx, cy, s) {
  const w = s * 0.26;
  const p = [
    [cx, cy - s], [cx + w, cy - w], [cx + s, cy], [cx + w, cy + w],
    [cx, cy + s], [cx - w, cy + w], [cx - s, cy], [cx - w, cy - w],
  ];
  return "M" + p.map(([x, y]) => `${n(x)} ${n(y)}`).join("L") + "Z";
}

/** Small crystal shard — an elongated diamond. */
function shard(cx, cy, s) {
  const w = s * 0.55;
  return `M${n(cx)} ${n(cy - s)}L${n(cx + w)} ${n(cy)}L${n(cx)} ${n(cy + s)}L${n(cx - w)} ${n(cy)}Z`;
}

/* -------------------------------------------------- crystal motes tile */

const MOTE_W = 280;
const MOTE_H = 460;
const MOTE_COUNT = 30;
const MOTE_COLORS = ["#ffffff", "#8beaff", "#bcd8ff", "#dff6ff"];

function buildMotes() {
  const r = rng(SEED);
  const buckets = {};

  for (let i = 0; i < MOTE_COUNT; i++) {
    const size = 2 + r() * 4.5;
    // Keep shapes fully inside the tile — anything overhanging an edge would
    // be clipped and break the seam.
    const cx = size + r() * (MOTE_W - size * 2);
    const cy = size + r() * (MOTE_H - size * 2);
    const color = MOTE_COLORS[Math.floor(r() * MOTE_COLORS.length)];
    const opacity = n(0.22 + r() * 0.6);
    const d = r() > 0.42 ? sparkle(cx, cy, size) : shard(cx, cy, size * 0.8);
    (buckets[`${color}|${opacity}`] ||= []).push(d);
  }

  const paths = Object.entries(buckets)
    .map(([k, ds]) => {
      const [fill, opacity] = k.split("|");
      return `<path fill="${fill}" opacity="${opacity}" d="${ds.join("")}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MOTE_W}" height="${MOTE_H}">${paths}</svg>`;
}

/* ------------------------------------------------------- starfield tiles */

// Two tiles rather than one. They fall at different speeds (parallax depth)
// and — because opacity animates per *element*, not per background layer —
// living on separate layers is the only way to make some stars twinkle while
// others hold steady. Height matches the mote tile so both can reuse
// _base.css's cct-fall, which translates exactly one tile height.
const STAR_W = 420;
const STAR_H = 460;

function buildStars(seed, count, { bright = false } = {}) {
  const r = rng(seed);
  const buckets = {};

  for (let i = 0; i < count; i++) {
    const size = bright ? (r() > 0.6 ? 2 : 1.6) : 1;
    const cx = n(2 + r() * (STAR_W - 4));
    const cy = n(2 + r() * (STAR_H - 4));
    const opacity = n((bright ? 0.35 : 0.16) + r() * (bright ? 0.5 : 0.38));
    (buckets[opacity] ||= []).push(`M${cx} ${cy}h${size}v${size}h-${size}z`);
  }

  const paths = Object.entries(buckets)
    .map(([opacity, ds]) => `<path fill="#dce9ff" opacity="${opacity}" d="${ds.join("")}"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STAR_W}" height="${STAR_H}">${paths}</svg>`;
}

/* ---------------------------------------------------------------- moon */

const MOON_BOX = 96;   // viewBox — the glow needs room to fade out inside it
const MOON_R = 13;     // disc radius in source pixels

/**
 * Pixel-art moon with a soft halo.
 *
 * The halo is baked into the SVG as a radialGradient rather than applied with
 * a CSS drop-shadow, because this ships as one layer of html::before's
 * background stack — a CSS filter there would blur the scenery gradients too.
 */
function buildMoon() {
  const c = MOON_BOX / 2;
  const runs = [];
  // Rasterise a circle a row at a time so the limb stays crisply stepped
  // instead of anti-aliased.
  for (let y = -MOON_R; y < MOON_R; y++) {
    const half = Math.floor(Math.sqrt(MOON_R * MOON_R - (y + 0.5) * (y + 0.5)));
    if (half <= 0) continue;
    runs.push(`M${c - half} ${c + y}h${half * 2}v1h-${half * 2}z`);
  }

  const craters = [
    [-5, -4, 3], [3, -1, 2], [-2, 5, 2], [6, 4, 1],
  ].map(([dx, dy, r]) =>
    `M${c + dx} ${c + dy}h${r}v${r}h-${r}z`
  ).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MOON_BOX}" height="${MOON_BOX}" ` +
    `viewBox="0 0 ${MOON_BOX} ${MOON_BOX}">` +
    `<defs><radialGradient id="g">` +
    `<stop offset="0%" stop-color="#eef4ff" stop-opacity=".34"/>` +
    `<stop offset="38%" stop-color="#dbe8ff" stop-opacity=".13"/>` +
    `<stop offset="100%" stop-color="#dbe8ff" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<circle cx="${c}" cy="${c}" r="${MOON_BOX / 2}" fill="url(#g)"/>` +
    `<path fill="#f4f6ff" shape-rendering="crispEdges" d="${runs.join("")}"/>` +
    `<path fill="#d3dbf2" shape-rendering="crispEdges" opacity=".85" d="${craters}"/>` +
    `</svg>`
  );
}

/* --------------------------------------------------------------- output */

const toDataUri = (svg) =>
  "data:image/svg+xml," +
  encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/");

const motes = buildMotes();
// Far layer: dense, dim, 1px — reads as depth. Near layer: sparse and bigger,
// and it's the one that twinkles.
const starsFar = buildStars(SEED ^ 0x5f3a, 54);
const starsNear = buildStars(SEED ^ 0x9c11, 16, { bright: true });
const moon = buildMoon();

const css = `/* GENERATED by tools/ambience.mjs — do not edit by hand.
   All three falling tiles are ${MOTE_H}px tall so they loop against
   _base.css's cct-fall keyframe, which translates exactly one tile height.
   Motes ${MOTE_W}x${MOTE_H}; starfields ${STAR_W}x${STAR_H}.
   Moon is ${MOON_BOX}x${MOON_BOX} with the halo baked in — most of that box is
   glow, the disc itself is only ${MOON_R * 2}px across. */

:root {
  --yume-ff-motes: url("${toDataUri(motes)}");
  --yume-ff-stars-far: url("${toDataUri(starsFar)}");
  --yume-ff-stars-near: url("${toDataUri(starsNear)}");
  --yume-ff-moon: url("${toDataUri(moon)}");
}
`;


await mkdir(resolve(ROOT, "sprites"), { recursive: true });
await writeFile(resolve(ROOT, "sprites/ambience.css"), css, "utf8");

console.log(
  `motes ${motes.length}b · stars far ${starsFar.length}b / near ${starsNear.length}b · moon ${moon.length}b → ambience.css`
);
