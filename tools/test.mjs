// Yume Forge — theme engine tests.
//
//   node tools/test.mjs
//
// Covers the parts with real logic in them: colour maths, the token ramps
// derived from three base colours, CSS compilation and share-code round trips.
// The UI is verified by eye via tools/mock.html.

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
require(resolve(dirname(fileURLToPath(import.meta.url)), "../lib/theme-engine.js"));
const E = globalThis.YumeEngine;

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log("  ok    " + msg); }
  else { fail++; console.log("  FAIL  " + msg); }
};
const group = (name) => console.log("\n" + name);

const lightnessOf = (t, k) => parseFloat(t.tokens[k].split(" ")[2]);

/* ------------------------------------------------------------------ colour */

group("hex <-> hsl round-trip");
for (const hex of ["#0b1240", "#ffd75e", "#f4f6ff", "#000000", "#8beaff", "#7aa2f7"]) {
  const back = E.hslToHex(E.hexToHsl(hex));
  const delta = [1, 3, 5].reduce(
    (a, i) => a + Math.abs(parseInt(hex.substr(i, 2), 16) - parseInt(back.substr(i, 2), 16)), 0);
  ok(delta <= 3, `${hex} -> ${back} (channel delta ${delta})`);
}
// "bad" is deliberately not the test case here — b/a/d are all hex digits, so
// it legitimately expands to #bbaadd.
ok(E.hexToRgb("nope") === null, "malformed hex returns null rather than NaN soup");
ok(E.hexToRgb("") === null && E.hexToRgb(undefined) === null, "empty and undefined are handled");
ok(E.hexToRgb("#abc").r === 0xaa, "3-digit shorthand expands");
ok(E.hexToHsl("zzzzzz") === null, "hexToHsl propagates the null");

/* -------------------------------------------------------------- derivation */

group("token derivation — dark");
const dark = E.makeTheme({ name: "Test", mode: "dark", bg: "#12141c", text: "#e8e6e1", accent: "#7aa2f7" });
const required = [
  "--bg-000", "--bg-500", "--text-000", "--text-500", "--accent-brand",
  "--accent-900", "--brand-900", "--border-100", "--pictogram-400",
];
ok(required.every((k) => k in dark.tokens), `all ${Object.keys(dark.tokens).length} tokens present`);
ok(lightnessOf(dark, "--bg-000") > lightnessOf(dark, "--bg-500"), "surface ramp descends 000 -> 500");
ok(lightnessOf(dark, "--text-000") > lightnessOf(dark, "--text-500"), "muted text is dimmer than primary");
ok(lightnessOf(dark, "--border-100") > 50, "dark themes get a light border");
ok(Object.values(dark.tokens).every((v) => /^[\d.]+ [\d.]+% [\d.]+%$/.test(v)),
   "every token is a bare H S% L% triplet");

group("token derivation — light");
const light = E.makeTheme({ mode: "light", bg: "#f6f5f1", text: "#22242c", accent: "#5f9339" });
ok(lightnessOf(light, "--bg-000") > lightnessOf(light, "--bg-500"), "surface ramp still descends 000 -> 500");
ok(lightnessOf(light, "--text-000") < lightnessOf(light, "--text-500"), "muted text is lighter, not darker");
ok(lightnessOf(light, "--border-100") < 50, "light themes get a dark border");

group("derivation clamps");
const extreme = E.makeTheme({ mode: "dark", bg: "#000000", text: "#ffffff", accent: "#ff0000" });
const ls = Object.values(extreme.tokens).map((v) => parseFloat(v.split(" ")[2]));
ok(ls.every((l) => l >= 0 && l <= 100), "pure black bg produces no out-of-range lightness");

/* ---------------------------------------------------------------- compile */

group("CSS compilation");
const css = E.compileCss(dark);
ok(css.includes(`html[data-cct-theme="${dark.id}"]`), "scoped to its own id");
ok(css.includes("!important"), "tokens marked !important so they beat Claude's own");
ok(E.compileCss(dark, { root: "#preview" }).includes("#preview,"), "root override for the editor preview");
ok(E.compileCss({ ...dark, css: "& .x { color: red }" }).includes(`html[data-cct-theme="${dark.id}"] .x`),
   "& expands to the theme selector in author CSS");

group("selector safety");
const nasty = E.makeTheme({ name: "evil" });
nasty.id = 'x"] , * { background: red } [a="';
const nastyCss = E.compileCss(nasty);
ok(!nastyCss.includes('"] ,'), "a hostile id cannot break out of the attribute selector");

/* ------------------------------------------------------------ share codes */

group("share codes");
const code = E.encodeShare(dark);
ok(code.startsWith("YUME1:"), "carries a recognisable prefix");
ok(!/[+/=]/.test(code.slice(6)), "base64url — survives being pasted into a URL or chat");
const imported = E.decodeShare(code);
ok(imported.name === dark.name && imported.accent === dark.accent, "name and accent survive the trip");
ok(JSON.stringify(imported.tokens) === JSON.stringify(dark.tokens), "token map is identical");
ok(imported.id !== dark.id, "import mints a fresh id so it can't clobber an existing theme");
ok(E.decodeShare(JSON.stringify(E.exportable(dark))).name === dark.name, "raw exported JSON is also accepted");
ok(E.decodeShare(`  ${code.slice(0, 20)}\n${code.slice(20)}  `).name === dark.name,
   "whitespace and line wrapping are tolerated");

/* A pretty-printed .yume.json is the file the export button writes, so it is
   the most common import there is — and it used to be corrupted on the way in.
   decodeShare squeezed whitespace out of EVERYTHING before parsing (needed for
   a base64 code that a chat app has wrapped), which inside JSON string values
   is destroying data, not tidying it. It still parsed, so the import claimed
   success and the theme rendered wrong. */
group("share codes — whitespace is data inside JSON");
const spaced = E.makeTheme({
  name: "Two Words", mode: "dark", bg: "#101018", text: "#eeeeee", accent: "#ffcc00",
  rawCss: "__YUME_ROOT__ .outer .inner { border: 1px solid white; margin: 0 0 0 4px; }",
  features: ["party", "stars"],
});
const prettyFile = JSON.stringify(E.exportable(spaced), null, 2);
const fromFile = E.decodeShare(prettyFile);
ok(fromFile.name === "Two Words", "a space in the name survives a pretty-printed JSON import");
ok(fromFile.rawCss.includes("1px solid white"), "spaces inside declarations survive");
ok(fromFile.rawCss.includes(".outer .inner"), "descendant selectors are not collapsed into compound ones");
ok(JSON.stringify(fromFile.features) === JSON.stringify(spaced.features), "features survive the file path");
// Bind the decode once. Calling it twice inline mints two different ids, so
// the normalisation below would be substituting the wrong one.
const fromCode = E.decodeShare(E.encodeShare(spaced));
const norm = (t) => E.compileCss(t).split(t.id).join("ID");
ok(norm(fromFile) === norm(fromCode), "the file and the share code compile to identical CSS");
ok(!E.compileCss(fromFile).includes("__YUME_ROOT__"), "the portable root marker is expanded on compile");

for (const junk of ["garbage!!", "", "YUME1:notbase64!!!", JSON.stringify({ name: "x" })]) {
  let threw = false;
  try { E.decodeShare(junk); } catch { threw = true; }
  ok(threw, `rejects ${JSON.stringify(junk.slice(0, 22))}`);
}

/* --------------------------------------------------------- theme options */

group("per-theme options");
const optTheme = { id: "final-fantasy", options: [
  { id: "rich-text", label: "Colourful text", default: false },
  { id: "on-by-default", label: "Something else", default: true },
]};
ok(JSON.stringify(E.enabledOptions(optTheme, {})) === JSON.stringify(["on-by-default"]),
   "with nothing stored, declared defaults decide");
ok(JSON.stringify(E.enabledOptions(optTheme, { "final-fantasy": { "rich-text": true } })) ===
   JSON.stringify(["rich-text", "on-by-default"]), "a stored true switches an off-by-default option on");
ok(JSON.stringify(E.enabledOptions(optTheme, { "final-fantasy": { "on-by-default": false } })) ===
   JSON.stringify([]), "a stored false overrides an on-by-default option");
ok(JSON.stringify(E.enabledOptions(optTheme, { "some-other-theme": { "rich-text": true } })) ===
   JSON.stringify(["on-by-default"]), "another theme's settings do not leak in");
ok(JSON.stringify(E.enabledOptions({ id: "x" }, {})) === JSON.stringify([]),
   "a theme with no options yields none");
// An unknown id in storage must not appear in the stamped attribute — CSS
// would then gate on something the theme never declared.
ok(JSON.stringify(E.enabledOptions(optTheme, { "final-fantasy": { "bogus": true } })) ===
   JSON.stringify(["on-by-default"]), "stored ids the theme never declared are ignored");

// Options have to survive export, or a shared theme lands with no settings.
const withOpts = E.makeTheme({ name: "Opt", rawCss: "__YUME_ROOT__{}", options: optTheme.options });
const back = E.decodeShare(E.encodeShare(withOpts));
ok(JSON.stringify(back.options) === JSON.stringify(optTheme.options),
   "declared options round-trip through a share code");

/* Sounds are the one asset class that does NOT live inside the stylesheet —
   content.js plays them from the extension's files. A shared theme must carry
   its own, or it arrives mute on any build without those files. */
group("theme-embedded sounds");
const voiced = E.makeTheme({
  name: "Voiced", rawCss: "__YUME_ROOT__{}",
  sounds: { hover: "data:audio/wav;base64,UklGRiQAAABXQVZF", chirp: "data:audio/wav;base64,UklGRiQAAABXQVZG" },
});
const voicedBack = E.decodeShare(E.encodeShare(voiced));
ok(Object.keys(voicedBack.sounds).length === 2, "sound map survives the share code");
ok(voicedBack.sounds.hover === voiced.sounds.hover, "data URIs arrive byte-identical");
ok(Object.keys(E.makeTheme({}).sounds).length === 0, "a theme without sounds gets an empty map, not undefined");

/* ------------------------------------------------------------------ misc */

group("helpers");
ok(E.isCustomId(dark.id) && !E.isCustomId("dracula"), "custom vs bundled id detection");
ok(E.isLight("#ffffff") && !E.isLight("#000000"), "luminance check picks black/white text correctly");
ok(E.makeTheme({}).id !== E.makeTheme({}).id, "ids are unique");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
