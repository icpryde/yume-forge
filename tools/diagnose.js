// Yume Forge — theme diagnostic.
//
// Paste into the DevTools console ON a claude.ai tab (the normal "top"
// context — this deliberately uses NO chrome.* APIs, so it needs no context
// switching), then send back the printed report.
//
// It answers, in one paste, the questions that otherwise take a dozen rounds:
//   * is the extension's CSS actually loaded, and how much of it
//   * is the theme selected (the html attribute content.js stamps)
//   * do the sprite variables resolve (undefined vars = invisible icons)
//   * did the pixel fonts load
//   * what colour is the reply text really computing to
//   * WHICH BUILD of claude.ai is this — the sidebar markup differs between
//     A/B variants, and every icon rule is keyed to a structure
(() => {
  const R = {};
  const root = document.documentElement;

  R.theme = root.getAttribute("data-cct-theme") || "(none — no theme selected)";
  R.features = root.getAttribute("data-yume-feat") || "(none)";
  R.options = root.getAttribute("data-yume-opt") || "(none)";
  R.mode = root.getAttribute("data-mode") || root.dataset.mode || "(unknown)";

  // Extension stylesheets: content-script CSS shows up with a
  // chrome-extension:// href. Zero means nothing was injected at all.
  const sheets = [...document.styleSheets];
  R.extSheets = sheets.filter((s) => (s.href || "").startsWith("chrome-extension://")).length;
  R.totalSheets = sheets.length;

  // Sprite variables. A missing sheet leaves these empty, and
  // `background-image: var(--undefined)` silently draws nothing.
  const cs = getComputedStyle(root);
  const vars = ["--yume-ff-moon", "--yume-ff-silhouette", "--yume-party-sprite",
                "--yume-ff-moogle", "--yume-shop-0", "--yume-nav-0",
                "--yume-ff-choco", "--yume-ff-menu-crystal"];
  R.spriteVars = {};
  for (const v of vars) {
    const val = cs.getPropertyValue(v).trim();
    R.spriteVars[v.replace("--yume-", "")] = val ? "ok (" + val.length + " chars)" : "MISSING";
  }

  // document.fonts.check() lies here: it answers true when the family would
  // simply FALL BACK. Measure instead — a pixel font's advance width differs
  // sharply from the generic fallback's.
  const widthOf = (fam) => {
    const c = document.createElement("canvas").getContext("2d");
    c.font = '40px ' + fam;
    return Math.round(c.measureText("MMMMM").width);
  };
  const base = widthOf("monospace");
  R.fonts = {
    silkscreen: widthOf('"Yume Silkscreen", monospace') !== base ? "loaded" : "NOT LOADED (falling back)",
    pressStart: widthOf('"Yume Press Start", monospace') !== base ? "loaded" : "NOT LOADED (falling back)",
  };

  // What the reply text actually computes to — the "black text" complaint.
  const reply = document.querySelector(".font-claude-response") ||
                document.querySelector('[data-testid="chat-input"]');
  if (reply) {
    const rs = getComputedStyle(reply);
    R.replyText = { color: rs.color, font: rs.fontFamily.split(",")[0], size: rs.fontSize };
  } else {
    R.replyText = "(no reply on screen — open a conversation and re-run)";
  }

  // Build fingerprint: these are the hooks the theme's icon rules depend on.
  // A different claude.ai variant changes them, and icons vanish while
  // colours and sprites keep working.
  const probe = (sel) => document.querySelectorAll(sel).length;
  R.buildMarkers = {
    "sidebar (.dframe-sidebar-body)": probe(".dframe-sidebar-body"),
    "nav rows (.contents > [data-row-main-button])": probe(".dframe-sidebar-body .contents > button[data-row-main-button]"),
    "recents anchor (.df-recents-anchor)": probe(".df-recents-anchor"),
    "recents rows ([data-row-key])": probe(".df-recents-anchor [data-row-key]"),
    "leading slots (.df-leading-slot)": probe(".df-leading-slot"),
    "products block (.df-products-block)": probe(".df-products-block"),
    "epitaxy (code shell)": probe(".epitaxy-root"),
    "frame mode": (document.querySelector(".dframe-root") || {}).dataset?.frameMode || "(none)",
  };
  R.navLabels = [...document.querySelectorAll(".dframe-sidebar-body [data-row-main-button]")]
    .slice(0, 8).map((b) => b.textContent.trim().slice(0, 18));

  R.chrome = (navigator.userAgent.match(/Chrome\/[\d.]+/) || ["?"])[0];
  R.url = location.pathname;

  const report = "YUME DIAGNOSTIC\n" + JSON.stringify(R, null, 2);
  console.log(report);
  try {
    copy(report);            // DevTools helper; puts it on the clipboard
    console.log("^ copied to clipboard — paste that back.");
  } catch { console.log("^ select the JSON above and copy it."); }
  return R;
})();
