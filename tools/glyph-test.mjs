// Yume Forge — working-glyph state test.
//
//   node tools/glyph-test.mjs
//
// The moogle replacing Claude's working glyph has regressed in a dozen ways,
// every time because a state only reachable on the live site behaved unlike the
// mock. This reproduces the REAL markup — transcribed from console dumps of
// claude.ai — in each state, and asserts on computed style rather than eyeball:
//
//   1. the original glyph is not visible
//   2. a moogle is drawn in its place
//   3. exactly one moogle per state, never two
//
// Structures below are verbatim from the page; do not "tidy" the class strings.

import { writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findChrome } from "./chrome.mjs";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = findChrome();

// The status button, exactly as claude.ai renders it.
const statusButton = `
  <button class="group/status flex items-center gap-2 py-1 text-sm transition-colors text-left cursor-pointer text-text-500">
    <div class="relative h-5 flex items-center justify-center shrink-0 overflow-hidden transition-[width,margin-right]">
      <div class="pt-1 transition-opacity duration-150 motion-reduce:transition-none">
        <svg data-cds="Spark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20" height="20" fill="#d97757" aria-hidden="true"><path d="M50 0 60 40 100 50 60 60 50 100 40 60 0 50 40 40Z"/></svg>
      </div>
    </div>
    <span class="inline-flex items-center gap-1 min-w-0"><span class="truncate font-base">Weighing options</span></span>
  </button>`;

// The sprite-strip logo, both sizes, as dumped from the page.
const stripLogo = (px) => `
  <div class="${px === 20 ? "!w-5 !text-brand-200 " : ""}w-8 text-accent-brand inline-block overflow-hidden select-none" data-state="closed">
    <div class="[&>svg]:block [&>svg]:w-full [&>svg]:fill-current" style="transform: matrix(1,0,0,1,0,-${px * 3})">
      <svg viewBox="0 0 ${px} ${px * 9}" width="${px}" height="${px * 9}" fill="#ffd35c"><path d="M0 0h${px}v${px * 9}H0z"/></svg>
    </div>
  </div>`;

const STATES = {
  // Claude is working. The reply body is NOT empty on the real site: the
  // streamed reasoning already sits inside it, collapsed and marked
  // data-find-omitted (captured from claude.ai). content.js deliberately does
  // not stamp data-yume-reply for that text — stamping mid-thinking is what
  // flickered the moogle — so this state models the wrapper unstamped WITH
  // the hidden text present.
  thinking: `
    <div role="article"><div class="contents">
      <div data-is-streaming="true" class="group relative">
        <div class="font-claude-response">
          <div><div data-find-omitted>streamed reasoning, collapsed behind the status row</div>
          <div class="overflow-hidden" data-find-omitted></div></div>
        </div>
        ${statusButton}
      </div>
    </div></div>`,

  // Same, plus the strip logo mounted alongside — the state the recording shows.
  thinkingWithLogo: `
    <div role="article"><div class="contents">
      <div data-is-streaming="true" class="group relative">
        <div class="font-claude-response"></div>
        ${statusButton}
      </div>
    </div></div>
    ${stripLogo(32)}`,

  // Finished: the reply has text, and the status row is now its summary line.
  finished: `
    <div role="article"><div class="contents">
      <div data-is-streaming="false" data-yume-reply="1" class="group relative">
        ${statusButton}
        <div class="font-claude-response"><p>A finished reply.</p></div>
      </div>
    </div></div>
    ${stripLogo(32)}`,
};

const page = `<!doctype html>
<html lang="en" data-cct-theme="final-fantasy">
<head><meta charset="utf-8">
<link rel="stylesheet" href="../sprites/moogle.css">
<link rel="stylesheet" href="../sprites/crystal.css">
<link rel="stylesheet" href="../themes/_base.css">
<link rel="stylesheet" href="../themes/final-fantasy.css">
</head>
<body>
${Object.entries(STATES).map(([k, html]) => `<main class="dframe-content" id="${k}">${html}</main>`).join("\n")}
<script>
window.addEventListener("load", () => {
  const drawsMoogle = (el) => {
    const a = getComputedStyle(el, "::after");
    return a.content !== "none" && /moogle|data:image/.test(a.backgroundImage);
  };
  const visible = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const c = getComputedStyle(n);
      if (c.opacity === "0" || c.visibility === "hidden" || c.display === "none") return false;
      n = n.parentElement;
    }
    return true;
  };

  // Invalid selectors are dropped SILENTLY by the browser — a :has() nested
  // inside another :has() is invalid, and losing that rule is exactly how both
  // slots ended up drawing a moogle with no error anywhere. So assert the
  // stylesheet kept every rule it was given.
  const authored = {};
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules } catch { continue }
    for (const r of rules || []) if (r.selectorText) {
      // Plain includes(), not a regex: this lives inside a template literal,
      // where an escaped forward slash collapses and breaks the pattern.
      const t = r.selectorText;
      if (t.includes("group") || t.includes("text-accent-brand") || t.includes("text-brand-200")) {
        // Full text as the key: truncating collides distinct rules and
        // under-counts, which reads as "a rule was dropped".
        authored[r.selectorText] = true;
      }
    }
  }
  const out = { _parsedGlyphRules: Object.keys(authored).length };
  for (const state of ${JSON.stringify(Object.keys(STATES))}) {
    const root = document.getElementById(state);
    const glyphs = [...root.querySelectorAll('svg[data-cds="Spark"], div[class~="text-accent-brand"] svg, div[class~="text-brand-200"] svg')];
    const moogles = [...root.querySelectorAll("*")].filter(drawsMoogle);
    out[state] = {
      visibleGlyphs: glyphs.filter(visible).length,
      moogles: moogles.length,
      visibleMoogles: moogles.filter(visible).length,
      where: moogles.filter(visible).map((el) => {
        const a = getComputedStyle(el, "::after");
        return (el.tagName.toLowerCase() + "." +
          (el.className || "").toString().split(/\s+/).slice(0, 2).join(".")) +
          " content=" + a.content.slice(0, 6);
      }),
    };
  }
  document.title = "GLYPH:" + JSON.stringify(out);
});
</script>
</body></html>`;

const file = resolve(ROOT, "tools/.glyph.html");
await writeFile(file, page, "utf8");

const { stdout } = await run(CHROME, [
  "--headless", "--disable-gpu", "--allow-file-access-from-files",
  "--virtual-time-budget=4000", "--dump-dom", "file://" + file,
], { maxBuffer: 40 * 1024 * 1024 });

await rm(file, { force: true });

const m = /<title>GLYPH:([\s\S]*?)<\/title>/.exec(stdout);
if (!m) { console.log("FAILED — page never reported"); process.exit(1); }

const res = JSON.parse(m[1].replace(/&quot;/g, '"'));
let bad = 0;

// Authored count, kept in step by hand: if a rule stops parsing this drops and
// the test fails instead of the behaviour quietly changing.
const EXPECT_GLYPH_RULES = 7;
const parsed = res._parsedGlyphRules;
delete res._parsedGlyphRules;
if (parsed < EXPECT_GLYPH_RULES) {
  bad++;
  console.log(`FAIL selector parsing   ${parsed} glyph rules survived, expected >= ${EXPECT_GLYPH_RULES}` +
              " — a selector was rejected and dropped");
} else {
  console.log(`ok   selector parsing   ${parsed} glyph rules parsed`);
}

for (const [state, r] of Object.entries(res)) {
  // Finished state deliberately shows no moogle on the status row — the crystal
  // is the marker there — but the strip logo under the reply still gets one.
  const wantMoogles = 1;
  const ok = r.visibleGlyphs === 0 && r.visibleMoogles === wantMoogles;
  if (!ok) bad++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${state.padEnd(18)} visibleGlyphs=${r.visibleGlyphs} (want 0)  ` +
    `visibleMoogles=${r.visibleMoogles} (want ${wantMoogles})` +
    (ok ? "" : "\n       drawn on: " + (r.where || []).join("  |  "))
  );
}
console.log(bad ? `\n${bad} state(s) wrong` : "\nall states correct");
process.exit(bad ? 1 : 0);
