// Yume Forge — pack a bundled theme into a shareable file.
//
//   node tools/pack-theme.mjs final-fantasy
//   node tools/pack-theme.mjs --all
//
// Writes dist/<id>.yume.json (import from the popup) and dist/<id>.yume.txt
// (a YUME1: code, for pasting into chat). Both are self-contained: sprites,
// fonts and stylesheet inlined, nothing fetched at runtime.
//
// Uses the same lib/packer.js the popup does, so a theme exported here is
// identical to one exported from the extension.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => resolve(ROOT, p);

// Both libs are plain scripts that publish onto globalThis.
await import(new URL("../lib/theme-engine.js", import.meta.url));
await import(new URL("../lib/packer.js", import.meta.url));
const E = globalThis.YumeEngine;
const P = globalThis.YumePacker;

const readText = (p) => readFile(rel(p), "utf8");
const readBase64 = async (p) => (await readFile(rel(p))).toString("base64");

const data = JSON.parse(await readText("themes/themes.json"));
const all = data.themes || data;

const args = process.argv.slice(2);
const wanted = args.includes("--all")
  ? all.map((t) => t.id)
  : args.filter((a) => !a.startsWith("-"));

if (!wanted.length) {
  console.log("usage: node tools/pack-theme.mjs <theme-id> [...]   |   --all");
  console.log("themes: " + all.map((t) => t.id).join(", "));
  process.exit(1);
}

await mkdir(rel("dist"), { recursive: true });

let bad = 0;
for (const id of wanted) {
  const meta = all.find((t) => t.id === id);
  if (!meta) { console.log(`FAIL ${id} — not in themes/themes.json`); bad++; continue; }

  const packed = await P.packTheme(meta, readText, readBase64);

  // Prove it round-trips before writing: a share code that cannot be decoded
  // is worse than no export at all, because the failure only shows up on the
  // recipient's machine.
  const code = E.encodeShare(packed);
  const back = E.decodeShare(code);
  const compiled = E.compileCss(E.makeTheme(back));
  const sel = `html[data-cct-theme="${E.makeTheme(back).id}"]`;

  const problems = [];
  if (!back.rawCss) problems.push("rawCss lost in the share code");
  if (compiled.includes("__YUME_ROOT__")) problems.push("__YUME_ROOT__ left unexpanded");
  if (!compiled.includes(sel)) problems.push("compiled CSS is not scoped to the theme");
  if (/url\(["']?(?!data:)[^)"']+\.(png|woff2|svg|jpe?g)/i.test(compiled)) {
    problems.push("compiled CSS still points at extension-relative files");
  }
  if (problems.length) {
    console.log(`FAIL ${id}\n     ` + problems.join("\n     "));
    bad++;
    continue;
  }

  await writeFile(rel(`dist/${id}.yume.json`), JSON.stringify(packed, null, 2), "utf8");
  await writeFile(rel(`dist/${id}.yume.txt`), code + "\n", "utf8");

  const kb = (n) => (n / 1024).toFixed(0) + "KB";
  const vars = (packed.rawCss.match(/^\s+--yume-/gm) || []).length;
  const fonts = (packed.rawCss.match(/@font-face/g) || []).length;
  console.log(
    `ok   ${id.padEnd(16)} ${kb(packed.rawCss.length).padStart(6)} css  ` +
    `${String(vars).padStart(2)} assets  ${fonts} font(s)  ` +
    `${Object.keys(packed.sounds || {}).length} sound(s)  ` +
    `${packed.features.length} feature(s)  → dist/${id}.yume.json`
  );
}

process.exit(bad ? 1 : 0);
