// Yume Forge — shop item icons.
//
//   node tools/items.mjs
//
// Draws the tiny equipment icons that replace the speech-bubble glyph on each
// Recents row, the way a JRPG shop or inventory list marks each line with the
// kind of thing it is.
//
// Output is one horizontal sheet; the theme picks a cell per row with
// nth-of-type, so a long list reads as a varied inventory rather than the same
// glyph repeated.
//
// No auto-outline here (unlike the party): at 12px an added silhouette ring
// eats most of the readable area, so each icon draws its own keyline where it
// actually helps.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Monochrome blue. Full colour made the sidebar noisy against the menu-blue
// chrome, so the whole set collapses to one hue with three values — keyline,
// body, highlight — which still reads as pixel art but sits quietly in the
// list. Every semantic key maps into that ramp so the icon art didn't have to
// be redrawn.
const BLUE_KEY = "#0d1330";
const BLUE_MID = "#4a6fd0";
const BLUE_BODY = "#7fa8ff";
const BLUE_HI = "#cfe0ff";

const PALETTE = {
  ".": null,
  K: BLUE_KEY,   // keyline
  S: BLUE_BODY,  // steel      -> body
  W: BLUE_HI,    // highlight
  D: BLUE_MID,   // dark steel -> shade
  G: BLUE_HI,    // gold       -> highlight
  T: BLUE_MID,   // leather    -> shade
  R: BLUE_BODY,  // red        -> body
  B: BLUE_MID,   // blue       -> shade
  P: BLUE_HI,    // gem setting-> highlight
  C: BLUE_HI,    // gem        -> highlight
};

const SIZE = 12;

const ICONS = {
  sword: [
    ".....SW.....",
    ".....SW.....",
    ".....SW.....",
    ".....SW.....",
    ".....SW.....",
    "....KSWK....",
    "..GGGGGGGG..",
    ".....TT.....",
    ".....TT.....",
    "....GGGG....",
    "............",
    "............",
  ],
  shield: [
    "..KKKKKKKK..",
    "..KBBBBBBK..",
    "..KBSSSSBK..",
    "..KBSGGSBK..",
    "..KBSGGSBK..",
    "..KBSSSSBK..",
    "..KBBBBBBK..",
    "...KBBBBK...",
    "....KBBK....",
    ".....KK.....",
    "............",
    "............",
  ],
  helm: [
    "............",
    "...KKKKKK...",
    "..KSSSSSSK..",
    ".KSSSSSSSSK.",
    ".KSWWWWWWSK.",
    ".KSKKKKKKSK.",
    ".KSSSSSSSSK.",
    "..KSSSSSSK..",
    "...KKKKKK...",
    "............",
    "............",
    "............",
  ],
  // Needs a thumb: without one the silhouette reads as an animal head.
  gauntlet: [
    "............",
    "....KKKK....",
    "...KSSSSK...",
    "...KSSSSK...",
    ".KKKSSSSK...",
    ".KSSSSSSK...",
    ".KSSSSSSK...",
    "..KSSSSSK...",
    "..KSSSSSK...",
    "...KKKKK....",
    "............",
    "............",
  ],
  staff: [
    ".....PP.....",
    "....PCCP....",
    "....PCCP....",
    ".....PP.....",
    ".....TT.....",
    ".....TT.....",
    ".....TT.....",
    ".....TT.....",
    ".....TT.....",
    ".....TT.....",
    ".....TT.....",
    "............",
  ],
  potion: [
    ".....KK.....",
    ".....KK.....",
    "....KKKK....",
    "....KWWK....",
    "...KWWWWK...",
    "...KWRRWK...",
    "...KRRRRK...",
    "...KRRRRK...",
    "...KRRRRK...",
    "....KKKK....",
    "............",
    "............",
  ],
  armor: [
    "............",
    "..KK....KK..",
    ".KBBK..KBBK.",
    ".KBBBKKBBBK.",
    ".KBBBBBBBBK.",
    ".KBGGGGGGBK.",
    ".KBBBBBBBBK.",
    ".KBBBBBBBBK.",
    "..KBBBBBBK..",
    "...KKKKKK...",
    "............",
    "............",
  ],
  ring: [
    "............",
    ".....PP.....",
    "....PCCP....",
    ".....PP.....",
    "...GGGGGG...",
    "..GG....GG..",
    "..GG....GG..",
    "..GG....GG..",
    "...GG..GG...",
    "....GGGG....",
    "............",
    "............",
  ],
  boots: [
    "............",
    ".KK...KK....",
    ".KTK..KTK...",
    ".KTK..KTK...",
    ".KTK..KTK...",
    ".KTTK.KTTK..",
    ".KTTTKKTTTK.",
    ".KKKKKKKKKK.",
    "............",
    "............",
    "............",
    "............",
  ],
  // --- beyond CYCLE_COUNT: addressed directly, not part of the Recents cycle
  tome: [
    "............",
    "..KKKKKKKK..",
    "..KRRRRRRK..",
    "..KRGGGGRK..",
    "..KRGRRGRK..",
    "..KRGRRGRK..",
    "..KRGGGGRK..",
    "..KRRRRRRK..",
    "..KKKKKKKK..",
    "............",
    "............",
    "............",
  ],
  brush: [
    "..........KK",
    ".........KWK",
    "........KWWK",
    ".......KWWK.",
    "......KWWK..",
    ".....KDDK...",
    "....KDDDK...",
    "...KSSSSK...",
    "...KSSSSK...",
    "...KSSSSK...",
    "....KKKK....",
    "............",
  ],
  flask: [
    "....KKKK....",
    "....KWWK....",
    "....KWWK....",
    "...KKWWKK...",
    "...KWWWWK...",
    "..KWWWWWWK..",
    "..KWSSSSWK..",
    ".KWSSSSSSWK.",
    ".KSSSSSSSSK.",
    ".KSSSSSSSSK.",
    "..KSSSSSSK..",
    "...KKKKKK...",
  ],
};

// Recents cycles through the equipment icons only; brush and flask are picked
// out by name for the bottom tray.
const CYCLE_COUNT = 10;

/* ---------------------------------------------------------------- compile */

function validate(name, rows) {
  if (rows.length !== SIZE) throw new Error(`${name} has ${rows.length} rows, expected ${SIZE}`);
  rows.forEach((row, i) => {
    if (row.length !== SIZE) throw new Error(`${name} row ${i} is ${row.length} wide, expected ${SIZE}`);
    for (const c of row) if (!(c in PALETTE)) throw new Error(`${name} row ${i}: unknown key "${c}"`);
  });
}

const names = Object.keys(ICONS);
const buckets = {};

names.forEach((name, index) => {
  const rows = ICONS[name];
  validate(name, rows);
  const ox = index * SIZE;
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      if (!PALETTE[key]) { x++; continue; }
      let run = 1;
      while (x + run < row.length && row[x + run] === key) run++;
      (buckets[key] ||= []).push(`M${ox + x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  });
});

const paths = Object.entries(buckets)
  .map(([k, d]) => `<path fill="${PALETTE[k]}" d="${d.join("")}"/>`)
  .join("");

const sheetW = names.length * SIZE;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${SIZE}" ` +
  `viewBox="0 0 ${sheetW} ${SIZE}" shape-rendering="crispEdges">${paths}</svg>`;

const toDataUri = (s) =>
  "data:image/svg+xml," +
  encodeURIComponent(s)
    .replace(/'/g, "%27").replace(/%20/g, " ").replace(/%3D/g, "=")
    .replace(/%3A/g, ":").replace(/%2F/g, "/");

// One rule per cell so the theme can cycle with nth-of-type. background-size is
// set to (count * 100%) wide, which makes each step exactly one icon.
const steps = names
  .map((name, i) =>
    `:root { --yume-ff-item-${i}: ${(i / (names.length - 1) * 100).toFixed(4)}%; } /* ${name} */`
  )
  .join("\n");

const css = `/* GENERATED by tools/items.mjs — do not edit by hand.
   ${names.length} shop icons, ${SIZE}x${SIZE} each, on one ${sheetW}x${SIZE} sheet:
   ${names.join(", ")}.

   Consumers set background-size: ${names.length}00% 100% and select a cell with
   background-position-x from the --yume-ff-item-N values below (percentages,
   because a percentage position on a sheet this size resolves to exact pixel
   offsets only when expressed as i/(n-1)). */

:root {
  --yume-ff-items: url("${toDataUri(svg)}");
  --yume-ff-item-size: ${SIZE};
  --yume-ff-item-count: ${names.length};
  --yume-ff-item-cycle: ${CYCLE_COUNT};
}

${steps}
`;

await mkdir(resolve(ROOT, "sprites"), { recursive: true });
await writeFile(resolve(ROOT, "sprites/items.css"), css, "utf8");

console.log(`${names.length} items ${sheetW}x${SIZE} — ${svg.length}b svg -> sprites/items.css`);
