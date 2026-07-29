// Yume Forge — build the shareable zips.
//
//   node tools/package.mjs [--out ~/Downloads]
//
// Produces two archives:
//
//   yume-forge.zip                    the extension, ready to Load unpacked
//   yume-forge-final-fantasy.zip      just the Final Fantasy theme, importable
//                                     straight from the popup (lib/themezip.js
//                                     reads the archive, so nobody has to
//                                     unzip anything)
//
// The extension list is an explicit ALLOWLIST. A denylist ("everything except
// *.png") silently ships whatever new junk lands in the tree next — an editor
// backup, a .env, a screenshot — and the failure mode is that you find out
// after handing the file to someone.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, rm, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => resolve(ROOT, p);

const argOut = process.argv.indexOf("--out");
const OUT = argOut > 0 && process.argv[argOut + 1]
  ? resolve(process.argv[argOut + 1].replace(/^~/, homedir()))
  : join(homedir(), "Downloads");

/* ----------------------------------------------------------- extension */

// Everything the extension needs at runtime, plus the dev tooling and README
// so this is a working copy rather than a black box.
//
// Excluded on purpose:
//   sources/ — the original sprite sheets and audio (build inputs for
//     tools/rip-*.py and convert-sounds.sh only; the generated CSS carries the
//     art as data URIs and merely cites the sources in comments).
//   sprites/*.png, *.svg — debug dumps from the same rippers. Nothing loads
//     them; grep for them in the CSS and you get comments.
//   dist/ — generated exports; the theme zip is built from them separately.
//   .DS_Store — Finder litter, and it lands in every folder if you let it.
const INCLUDE = [
  "manifest.json",
  "content.js",
  "README.md",
  "lib/theme-engine.js",
  "lib/packer.js",
  "lib/themezip.js",
  "popup/",
  "editor/",
  "themes/",
  "fonts/",
  "icons/",
  "sprites/*.css",
  "sounds/",
  "tools/",
];

// Within the copied dirs, drop these. Kept narrow and explicit.
const PRUNE = [
  "tools/.glyph.html", "tools/.pack-a.html", "tools/.pack-b.html", "tools/.b64check.html",
];

const NAME = "yume-forge";

async function sh(cmd, args, cwd) {
  const { stdout } = await run(cmd, args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function buildExtensionZip() {
  const stage = join(await mkTemp(), NAME);
  await mkdir(stage, { recursive: true });

  for (const item of INCLUDE) {
    if (item.includes("*")) {
      // Only pattern in use is a per-dir extension filter.
      const [dir, pat] = [dirname(item), item.split("/").pop()];
      const ext = pat.replace("*", "");
      const names = (await sh("ls", [rel(dir)])).split("\n").filter((n) => n.endsWith(ext));
      await mkdir(join(stage, dir), { recursive: true });
      for (const n of names) await cp(rel(join(dir, n)), join(stage, dir, n));
    } else if (item.endsWith("/")) {
      await cp(rel(item), join(stage, item), { recursive: true });
    } else {
      await mkdir(join(stage, dirname(item)), { recursive: true });
      await cp(rel(item), join(stage, item));
    }
  }

  for (const p of PRUNE) await rm(join(stage, p), { force: true });
  // Finder litter copies along with the directories it lives in — and so do
  // the test harnesses' scratch pages (tools/.*.html and friends). Prune every
  // dotfile: nothing legitimate in this tree hides behind a dot.
  await sh("find", [stage, "-name", ".DS_Store", "-delete"]);
  await sh("find", [join(stage, "tools"), "-name", ".*", "-type", "f", "-delete"]);

  const out = join(OUT, `${NAME}.zip`);
  await rm(out, { force: true });
  // -r recurse, -q quiet, -X drop macOS extended attributes so the archive has
  // no __MACOSX/ shadow entries.
  await sh("zip", ["-rqX", out, NAME], dirname(stage));
  return { out, stage };
}

/* --------------------------------------------------------- theme bundle */

const THEME_ID = "final-fantasy";

async function buildThemeZip() {
  const json = rel(`dist/${THEME_ID}.yume.json`);
  if (!existsSync(json)) {
    throw new Error(`dist/${THEME_ID}.yume.json is missing — run: node tools/pack-theme.mjs ${THEME_ID}`);
  }
  const pkg = JSON.parse(await readFile(json, "utf8"));

  const folder = `${NAME}-${THEME_ID}`;
  const stage = join(await mkTemp(), folder);
  await mkdir(stage, { recursive: true });

  await cp(json, join(stage, `${THEME_ID}.yume.json`));
  await cp(rel(`dist/${THEME_ID}.yume.txt`), join(stage, `${THEME_ID}.yume.txt`));

  await writeFile(join(stage, "READ ME FIRST.txt"), `${pkg.emoji} ${pkg.name} — a theme for Yume Forge
${"=".repeat(56)}

TO INSTALL
----------
1. Click the Yume Forge icon in your browser toolbar.
2. Click "Import a theme" at the bottom.
3. Pick this zip. That's it — no need to unzip it first.
4. The theme appears under "Mine". Click it.

The popup reads the archive itself, so the zip is the thing you hand over.


WHAT'S IN HERE
--------------
${THEME_ID}.yume.json   the theme. This is what gets imported.
${THEME_ID}.yume.txt    the same theme as a YUME1: text code, for pasting
                            into a chat instead of sending a file. Import it
                            with "Paste code".

Both are self-contained: the sprites, the pixel fonts and the whole stylesheet
are inlined. Nothing is downloaded when the theme runs.


YOU NEED THE EXTENSION
----------------------
This file is the theme, not the code that runs it. It needs Yume Forge itself
(yume-forge.zip) — the Chrome Web Store version can't read it.


WHAT THE THEME DOES
-------------------
Blue menu windows with the white FF border, the four FF1 party members idling
above the composer (click one), Mog as the working glyph, a crystal, pixel
fonts, a breathing glow on the chat box, drifting motes, a moon and the odd
shooting star.

This is an unofficial, non-commercial fan project. Final Fantasy and related
names and characters belong to their respective owners. This project is not
affiliated with or endorsed by Square Enix.
`, "utf8");

  const out = join(OUT, `${folder}.zip`);
  await rm(out, { force: true });
  await sh("zip", ["-rqX", out, folder], dirname(stage));
  return { out, stage };
}

let tmpN = 0;
async function mkTemp() {
  // No Math.random(): a counter is enough and keeps runs reproducible.
  const dir = join(tmpdir(), `yume-pkg-${process.pid}-${tmpN++}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

/* ------------------------------------------------------------------ go */

await mkdir(OUT, { recursive: true });

const ext = await buildExtensionZip();
const theme = await buildThemeZip();

for (const { out } of [ext, theme]) {
  const s = await stat(out);
  const n = (await sh("unzip", ["-l", out])).trim().split("\n").pop().trim().split(/\s+/)[1];
  console.log(`${(s.size / 1024).toFixed(0).padStart(5)}KB  ${String(n).padStart(3)} files  ${out}`);
}
