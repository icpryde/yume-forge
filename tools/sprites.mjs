// Yume Forge — pixel sprite compiler.
//
//   node tools/sprites.mjs
//
// Turns the ASCII maps below into a two-frame SVG sprite sheet and writes it
// out as a ready-to-paste CSS data URI (sprites/party.css).
//
// Why ASCII: the party sprites are the one asset people will actually want to
// tweak. Editing a grid of characters beats editing 400 <rect> elements or a
// base64 blob, and the compiler handles silhouette outlining plus run-length
// merging, so the art stays simple to author and the output stays small.
//
// The characters are original art in the classic 8/16-bit party archetype
// style (fighter / martial artist / healer / mage) — drawn for this theme, not
// traced from any published game's sprite sheets.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ----------------------------------------------------------------- palette */

const OUTLINE = "@";

const PALETTE = {
  ".": null,            // transparent
  [OUTLINE]: "#0d0a1c", // auto-generated silhouette outline
  K: "#151226",         // interior shadow / eyes
  S: "#f5c9a0",         // skin
  H: "#f2d06b",         // hair
  W: "#f4f6ff",         // white cloth
  R: "#d8342f",         // red
  B: "#3f63d8",         // robe blue
  D: "#22357e",         // deep blue
  G: "#c3ccdd",         // steel
  O: "#e8802f",         // orange gi
  Y: "#ffe14d",         // glow / gold
  T: "#a8703c",         // leather / staff
};

/* -------------------------------------------------------------- characters */
// Every map is 14 columns wide and 18 rows tall. The compiler pads one pixel
// on each side and paints the silhouette outline itself, so don't draw one.
// `legRow` is the row removed on the squashed (knee-bend) pose, so the feet
// stay planted while the body dips a pixel.

// Side-on poses, all facing right, so the party reads as a marching line the
// way an overworld sprite row does. Profile rules that make it read at 16px:
// skin pixels sit on the right edge of the head, exactly one eye is visible
// and set right-of-centre, and the legs stagger instead of mirroring.

const WARRIOR = {
  name: "warrior",
  legRow: 15,
  map: [
    "..............",
    "...RR.........",
    "..RRRGGGG.....",
    "..GGGGGGGG....",
    "..GGGSSSSS....",
    "..GGGSKSSS....",
    "..GGGSSSSS....",
    "...GSSSSS.....",
    "..GGGGGGG.....",
    "..GGDDBBDG....",
    "..SGDDBBDG....",
    "..SGDDBBDG....",
    "...GDDBBD.....",
    "....DDDDD.....",
    "....DD.DD.....",
    "....DD.DD.....",
    "....DD..DD....",
    "....KK..KK....",
  ],
};

const MONK = {
  name: "monk",
  legRow: 15,
  map: [
    "..............",
    "...KKKK.......",
    "..KKKKKK......",
    "..RRRRRRR.....",
    "..KSSSSSS.....",
    "..KSSKSSS.....",
    "..KSSSSSS.....",
    "...SSSSS......",
    "....SSSS......",
    "..OOOOOOO.....",
    "..SOOOOOOS....",
    ".SSOOOOOOSS...",
    "..SOOOOOOS....",
    "..OOOOOOO.....",
    "...WWWWW......",
    "...OO.OO......",
    "...OO..OO.....",
    "...SS..SS.....",
  ],
};

const WHITE_MAGE = {
  // The hood needs an interior shadow row: skin against white cloth has almost
  // no contrast at this size, and without it she just reads as a ghost.
  name: "white-mage",
  legRow: 16,
  map: [
    "...WWWW.......",
    "..WWWWWW......",
    "..WWWWWWW.....",
    "..WWKKKKW.....",
    "..WWSSSSS.....",
    "..WWSKSSS.....",
    "..WWSSSSS.....",
    "...WWSSS......",
    "..WWWWWWW.....",
    ".WWWWWWWWW....",
    ".WRRRRRRRW....",
    ".WWWWWWWWW....",
    ".SWWWWWWWW....",
    ".SWWWWWWWW....",
    ".WWWWWWWWW....",
    ".WRRRRRRRW....",
    ".WWWWWWWWW....",
    "..WW...WW.....",
  ],
};

const BLACK_MAGE = {
  name: "black-mage",
  legRow: 15,
  map: [
    "....BB........",
    "...BBBB.......",
    "..BBBBBB......",
    "..BBBBBBB.....",
    ".BBBBBBBBB....",
    "BBBBBBBBBBB...",
    "BBBBBBBBBBBB..",
    "..KKKKKKK.....",
    "..KKKKYKK.....",
    "..KKKKKKK.....",
    "...BBBBBB.....",
    "..TBBBBBBT....",
    "..TBBBBBBT....",
    "...BBBBBB.....",
    "...BBBBBB.....",
    "...BBBBBB.....",
    "...BB..BB.....",
    "...KK..KK.....",
  ],
};

const PARTY = [WARRIOR, MONK, WHITE_MAGE, BLACK_MAGE];

const SRC_W = 14;
const SRC_H = 18;
const PAD = 1;                 // room for the generated outline
const CELL_W = SRC_W + PAD * 2;
const CELL_H = SRC_H + PAD * 2;
const GAP = 3;

/* ---------------------------------------------------------------- compiler */

function validate(ch) {
  if (ch.map.length !== SRC_H) {
    throw new Error(`${ch.name} has ${ch.map.length} rows, expected ${SRC_H}`);
  }
  ch.map.forEach((row, i) => {
    if (row.length !== SRC_W) {
      throw new Error(`${ch.name} row ${i} is ${row.length} wide, expected ${SRC_W}`);
    }
    for (const c of row) {
      if (!(c in PALETTE)) throw new Error(`${ch.name} row ${i}: unknown palette key "${c}"`);
      if (c === OUTLINE) throw new Error(`${ch.name} row ${i}: don't draw outlines, they're generated`);
    }
  });
}

/** Squashed pose: drop one leg row so the body dips while feet stay planted. */
const pose = (ch, down) =>
  down ? { rows: ch.map.filter((_, i) => i !== ch.legRow), dy: 1 } : { rows: ch.map, dy: 0 };

/**
 * Pad by one pixel and paint every transparent cell that touches art.
 * This is what stops flat-coloured sprites reading as blobs against a
 * mid-tone background.
 */
function outline(rows) {
  const w = rows[0].length + PAD * 2;
  const grid = [
    ".".repeat(w),
    ...rows.map((r) => "." + r + "."),
    ".".repeat(w),
  ].map((r) => r.split(""));

  const solid = (y, x) =>
    y >= 0 && y < grid.length && x >= 0 && x < w && grid[y][x] !== "." && grid[y][x] !== OUTLINE;

  const out = grid.map((r) => r.slice());
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== ".") continue;
      if (solid(y - 1, x) || solid(y + 1, x) || solid(y, x - 1) || solid(y, x + 1)) {
        out[y][x] = OUTLINE;
      }
    }
  }
  return out.map((r) => r.join(""));
}

/**
 * Collect run-length-merged spans for one posed character, bucketed by colour.
 * Emitting one <path> per colour instead of one <rect> per run roughly halves
 * the sheet, which matters because it ships as a data URI in a stylesheet.
 */
function collect(rows, ox, oy, buckets) {
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      if (!PALETTE[key]) { x++; continue; }
      let run = 1;
      while (x + run < row.length && row[x + run] === key) run++;
      (buckets[key] ||= []).push(`M${ox + x} ${oy + y}h${run}v1h-${run}z`);
      x += run;
    }
  });
}

function buildSheet() {
  PARTY.forEach(validate);

  const frameW = PARTY.length * CELL_W + (PARTY.length - 1) * GAP;
  const buckets = {};

  for (let frame = 0; frame < 2; frame++) {
    PARTY.forEach((ch, i) => {
      // Alternate the phase across the party so the idle reads as four
      // separate people breathing, not one puppet.
      const down = (i % 2 === 0) === (frame === 1);
      const { rows, dy } = pose(ch, down);
      collect(outline(rows), frame * frameW + i * (CELL_W + GAP), dy, buckets);
    });
  }

  const paths = Object.entries(buckets)
    .map(([key, d]) => `<path fill="${PALETTE[key]}" d="${d.join("")}"/>`)
    .join("");

  const sheetW = frameW * 2;
  return {
    frameW,
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${CELL_H}" ` +
      `viewBox="0 0 ${sheetW} ${CELL_H}" shape-rendering="crispEdges">` +
      paths +
      `</svg>`,
  };
}

/** Percent-encode for CSS url() — smaller and more legible than base64. */
const toDataUri = (svg) =>
  "data:image/svg+xml," +
  encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/");

/* ------------------------------------------------------------------- main */

const { svg, frameW } = buildSheet();

const css = `/* GENERATED by tools/sprites.mjs — do not edit by hand.
   Two-frame party idle. Frame ${frameW}x${CELL_H}px, cell ${CELL_W}x${CELL_H}.
   Consumers set background-size: 200% 100% and step between
   background-position-x: 0% and 100%. */

:root {
  --yume-party-sprite: url("${toDataUri(svg)}");
  --yume-party-frame-w: ${frameW};
  --yume-party-frame-h: ${CELL_H};
}
`;

await mkdir(resolve(ROOT, "sprites"), { recursive: true });
await writeFile(resolve(ROOT, "sprites/party.css"), css, "utf8");
await writeFile(resolve(ROOT, "sprites/party.svg"), svg, "utf8");

console.log(`party sheet ${frameW * 2}x${CELL_H}px — ${svg.length} bytes svg, ${css.length} bytes css`);
