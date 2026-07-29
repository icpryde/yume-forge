// Yume Forge — popup import/export test.
//
//   node tools/popup-test.mjs
//
// Drives the real popup page in a browser: seeds a packaged theme through the
// import path, then clicks the export button on the resulting card and captures
// what would have been downloaded.
//
// Worth having because the popup is where the two halves meet, and its bugs are
// the quiet kind — a file saved under a machine-specific random name, a toast
// claiming success after a failure. Neither shows up in an engine test.
//
// Note on scope: the BUNDLED export path can't be exercised here. It calls
// fetch(chrome.runtime.getURL(...)), and Chrome blocks fetch on file:// even
// with --allow-file-access-from-files. tools/pack-test.mjs covers that path
// through the identical packer instead.

import { writeFile, rm, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findChrome } from "./chrome.mjs";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = findChrome();

const pkg = await readFile(resolve(ROOT, "dist/final-fantasy.yume.json"), "utf8");

// A driver page: it loads popup.html in an iframe so the popup's own scripts
// run unmodified, then reaches in to exercise them.
const driver = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<iframe id="f" src="../popup/popup.html" style="width:420px;height:700px;border:0"></iframe>
<script>
const THEME_JSON = ${JSON.stringify(pkg)};
const out = { steps: [] };

const done = (extra) => { Object.assign(out, extra || {}); document.title = "POPUP:" + encodeURIComponent(JSON.stringify(out)); };

document.getElementById("f").addEventListener("load", async () => {
  try {
    const w = document.getElementById("f").contentWindow;
    const d = w.document;

    // Capture downloads instead of performing them.
    const saved = [];
    const realClick = w.HTMLAnchorElement.prototype.click;
    w.HTMLAnchorElement.prototype.click = function () {
      if (this.download) { saved.push(this.download); return; }
      return realClick.apply(this, arguments);
    };
    // The clipboard is unavailable in a headless file:// context; make the
    // failure deterministic so the toast branch under test is the real one.
    let clipboardCalls = 0;
    Object.defineProperty(w.navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => { clipboardCalls++; return Promise.reject(new Error("no clipboard here")); } },
    });

    // 1. Import, through the popup's own code path.
    await w.importFrom(THEME_JSON);
    await new Promise((r) => setTimeout(r, 250));

    const cards = [...d.querySelectorAll(".theme-card")];
    const mine = cards.find((c) => (c.querySelector(".theme-name") || {}).textContent?.includes("Final Fantasy")
                                && c.querySelector('.tool[title="Delete"]'));
    out.steps.push("cards after import: " + cards.length);
    if (!mine) return done({ error: "no imported Final Fantasy card found" });

    out.importedName = mine.querySelector(".theme-name").textContent.trim();
    out.hasExportButton = !!mine.querySelector('.tool[title^="Export"]');
    out.hasDeleteButton = !!mine.querySelector('.tool[title="Delete"]');

    // 2. Export it again — the pass-it-on case.
    mine.querySelector('.tool[title^="Export"]').click();
    await new Promise((r) => setTimeout(r, 600));

    out.downloads = saved;
    out.clipboardAttempted = clipboardCalls > 0;
    out.toast = (d.getElementById("toast") || {}).textContent || "";

    // 3. Per-theme settings: the gear appears only where options exist.
    const allCards = [...d.querySelectorAll(".theme-card")];
    const gearCards = allCards.filter((c) => c.querySelector('.tool[title="Theme settings"]'));
    out.cardsTotal = allCards.length;
    out.cardsWithGear = gearCards.map((c) => (c.querySelector(".theme-name") || {}).textContent.trim());

    const ff = allCards.find((c) => /Final Fantasy/.test((c.querySelector(".theme-name")||{}).textContent || "")
                                 && !c.querySelector('.tool[title="Delete"]'));
    if (ff) {
      const gear = ff.querySelector('.tool[title="Theme settings"]');
      out.ffHasGear = !!gear;
      out.panelBeforeClick = !!ff.querySelector(".theme-settings");
      gear.click();
      await new Promise((r) => setTimeout(r, 200));

      // renderList() rebuilds the DOM, so re-find the card.
      const ff2 = [...d.querySelectorAll(".theme-card")]
        .find((c) => /Final Fantasy/.test((c.querySelector(".theme-name")||{}).textContent || "")
                  && !c.querySelector('.tool[title="Delete"]'));
      const panel = ff2 && ff2.querySelector(".theme-settings");
      out.panelAfterClick = !!panel;
      out.optionLabels = panel ? [...panel.querySelectorAll(".opt-label")].map((n) => n.textContent) : [];

      const box = panel && panel.querySelector('input[type="checkbox"]');
      out.defaultChecked = box ? box.checked : null;
      if (box) {
        box.checked = true;
        box.dispatchEvent(new w.Event("change", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 250));
        const stored = await w.YumeEngine.loadOptions();
        out.storedAfterToggle = stored["final-fantasy"] || null;
        // And the resolution the content script will perform off that storage.
        out.resolvedOptions = w.YumeEngine.enabledOptions(
          { id: "final-fantasy", options: [{ id: "rich-text", default: false }] }, stored);
        // Toggling must not collapse the panel out from under the click.
        out.panelStillOpen = !!d.querySelector(".theme-settings");
      }
    }

    // 4. And the payload itself is still a working theme.
    const stored = (await w.YumeEngine.loadCustom()).find((t) => t.name === "Final Fantasy");
    out.storedHasRawCss = !!(stored && stored.rawCss);
    out.storedFeatures = stored ? stored.features : null;
    out.storedSoundCount = stored && stored.sounds ? Object.keys(stored.sounds).length : 0;
    done();
  } catch (e) {
    done({ error: e.message + " | " + (e.stack || "").split("\\n")[1] });
  }
});
</script></body></html>`;

const file = resolve(ROOT, "tools/.popup-test.html");
await writeFile(file, driver, "utf8");
const { stdout } = await run(CHROME, [
  "--headless", "--disable-gpu", "--allow-file-access-from-files",
  "--virtual-time-budget=12000", "--dump-dom", "file://" + file,
], { maxBuffer: 200 * 1024 * 1024 });
await rm(file, { force: true });

let bad = 0;
const ok = (m) => console.log("ok   " + m);
const fail = (m) => { bad++; console.log("FAIL " + m); };

const m = /<title>POPUP:([\s\S]*?)<\/title>/.exec(stdout);
if (!m) {
  fail("the popup driver never reported — check for a script error in popup.js");
} else {
  const r = JSON.parse(decodeURIComponent(m[1].replace(/&amp;/g, "&")));
  if (r.error) {
    fail("driving the popup threw: " + r.error);
  } else {
    r.importedName.includes("Final Fantasy")
      ? ok(`imported card reads "${r.importedName}"`)
      : fail(`imported card reads "${r.importedName}"`);

    r.hasExportButton && r.hasDeleteButton
      ? ok("imported card has both export and delete tools")
      : fail(`imported card tools: export=${r.hasExportButton} delete=${r.hasDeleteButton}`);

    r.storedHasRawCss
      ? ok("the stored theme kept its packaged stylesheet")
      : fail("the stored theme has no rawCss — the import dropped the whole theme");

    r.storedSoundCount === 8
      ? ok("the stored theme kept all 8 embedded sounds")
      : fail(`the stored theme has ${r.storedSoundCount} sounds, expected 8 — a shared theme would arrive mute`);

    JSON.stringify(r.storedFeatures) === JSON.stringify(["party", "stars", "banner", "composer-glow", "replies"])
      ? ok("the stored theme kept its feature list")
      : fail("stored features are " + JSON.stringify(r.storedFeatures));

    // The fix: a custom theme's filename comes from its NAME. Its id is
    // `custom-<random>` — different on every machine and identifying nothing.
    const f = (r.downloads || [])[0];
    f === "final-fantasy.yume.json"
      ? ok(`re-export saved as "${f}"`)
      : fail(`re-export saved as "${f}" — expected "final-fantasy.yume.json"`);

    // --- per-theme settings ---
    r.ffHasGear ? ok("Final Fantasy card has a settings gear")
                : fail("Final Fantasy card has no settings gear");
    // Two: the bundled Final Fantasy and the copy imported at the top of this
    // test, which carries the same declarations. Every other card has none.
    r.cardsWithGear.length === 2 && r.cardsWithGear.every((n) => /Final Fantasy/.test(n))
      ? ok(`only themes declaring options show a gear (${r.cardsWithGear.length} of ${r.cardsTotal} cards)`)
      : fail(`${r.cardsWithGear.length} cards show a gear: ${r.cardsWithGear.join(", ")}`);
    !r.panelBeforeClick && r.panelAfterClick
      ? ok("the gear opens the settings panel")
      : fail(`panel before=${r.panelBeforeClick} after=${r.panelAfterClick}`);
    JSON.stringify(r.optionLabels) === JSON.stringify(["Colourful text", "Menu sounds", "Horizon scenery"])
      ? ok(`panel lists the declared options (${r.optionLabels.join(", ")})`)
      : fail("panel options are " + JSON.stringify(r.optionLabels));
    r.defaultChecked === false
      ? ok("Colourful text is off by default, as declared")
      : fail(`Colourful text defaulted to ${r.defaultChecked}`);
    r.storedAfterToggle && r.storedAfterToggle["rich-text"] === true
      ? ok("toggling writes the value to storage")
      : fail("after toggling, storage holds " + JSON.stringify(r.storedAfterToggle));
    JSON.stringify(r.resolvedOptions) === JSON.stringify(["rich-text"])
      ? ok("content.js would stamp data-yume-opt=\"rich-text\"")
      : fail("resolved options are " + JSON.stringify(r.resolvedOptions));
    r.panelStillOpen
      ? ok("the panel stays open after a toggle")
      : fail("the panel closed on toggle — the checkbox would appear to snap back");

    // Clipboard failure must not be reported as a clipboard success.
    r.clipboardAttempted
      ? ok("export attempted the clipboard copy")
      : fail("export never tried the clipboard");
    /copied/i.test(r.toast)
      ? fail(`the toast claims "${r.toast}" although the clipboard write rejected`)
      : ok(`toast tells the truth after a clipboard failure: "${r.toast}"`);
  }
}

console.log(bad ? `\n${bad} check(s) failed` : "\npopup import/export verified");
process.exit(bad ? 1 : 0);
