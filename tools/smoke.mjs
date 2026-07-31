// Yume Forge — runtime smoke test.
//
//   node tools/smoke.mjs
//
// `node --check` only parses. It cannot see that a function was deleted while
// its call sites remain — which shipped twice as "the party vanished", because
// a ReferenceError inside syncParty kills every pass silently.
//
// This actually EXECUTES content.js against a stand-in claude.ai DOM in a real
// browser and fails on any thrown error, unhandled rejection or console error.
// It also drives the states that only occur over time: theme switch, streaming
// start/stop, composer teardown on navigation, and resize.

import { writeFile, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findChrome } from "./chrome.mjs";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = findChrome();

// Enough of claude.ai's shape for the detectors to have something to chew on.
const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>smoke</title>
<script>
  // Storage seed for the dev shim (localStorage-backed): select the theme the
  // way the popup would, before theme-engine/content load and read it.
  localStorage.clear();
  localStorage.setItem("sync:cctTheme", JSON.stringify("final-fantasy"));

  // Chrome logs an autoplay violation into the extension's error panel the
  // moment an AudioContext is constructed before the page has seen a real
  // user gesture. Synthetic events grant no activation, so across this whole
  // drive — hovers, clicks, everything — the correct construction count is
  // exactly zero. Anything above zero is the warning shipping again.
  window.__audioCtxCount = 0;
  const RealAC = window.AudioContext;
  window.AudioContext = function (...a) { window.__audioCtxCount++; return new RealAC(...a); };
</script>
</head>
<body class="font-ui">
<aside class="dframe-sidebar" aria-label="Sidebar"><div class="dframe-sidebar-body">
  <div class="shrink-0"><div class="contents">
    <button data-row-main-button data-row><span class="df-leading-slot"></span><span>New</span></button>
  </div></div>
  <div class="df-recents-anchor"><div class="group/section">
    <div data-row-key="chat:0"><div><div data-row>
      <a data-row-main-button href="#"><span class="df-leading-slot"></span><span>Chat</span></a>
    </div></div></div>
  </div></div>
</div></aside>

<main class="dframe-content">
  <div role="article" aria-label="Message 1">
    <div class="group group/message-row"><div class="contents">
      <div data-is-streaming="false" class="group relative" id="reply">
        <div class="font-claude-response"><p>Filled reply.</p></div>
        <button class="group/status"><div class="relative h-5 overflow-hidden"><div class="pt-1">
          <svg data-cds="Spark" viewBox="0 0 20 20" width="20" height="20"><path d="M0 0h20v20H0z"/></svg>
        </div></div><span>Thinking</span></button>
      </div>
    </div></div>
  </div>

  <!-- the empty next-turn placeholder -->
  <div role="article" aria-label="Message 2"><div class="contents">
    <div data-is-streaming="false" class="group relative" id="placeholder">
      <div class="font-claude-response"></div>
    </div>
  </div></div>

  <!-- the sprite-strip logo -->
  <div class="w-8 text-accent-brand inline-block overflow-hidden">
    <div class="[&>svg]:block"><svg viewBox="0 0 32 288" width="32" height="288"><path d="M0 0h32v288H0z"/></svg></div>
  </div>

  <div class="sticky bottom-0 z-[5]" id="strip">
    <div><div class="font-normal flex gap-1.5 items-center justify-between" id="banner">
      <span>You've used 75% of your weekly limit</span><button>x</button>
    </div></div>
    <div id="composerWrap"><fieldset><div class="relative">
      <div class="cursor-text flex flex-col">
        <div class="relative"><div data-testid="chat-input" role="textbox">hi</div></div>
      </div>
    </div></fieldset></div>
    <div data-disclaimer="true">disclaimer</div>
  </div>
</main>

<script>
  window.__errors = [];
  addEventListener("error", (e) => window.__errors.push("error: " + (e.message || e)));
  addEventListener("unhandledrejection", (e) => window.__errors.push("rejection: " + e.reason));
  const realError = console.error;
  console.error = (...a) => { window.__errors.push("console.error: " + a.join(" ")); realError(...a); };

  // No local chrome stub here — theme-engine.js installs its dev shim
  // (localStorage-backed, dispatches real onChanged events, carries a runtime
  // id). Smoke used to ship its own stub whose set() swallowed change events;
  // every storage-driven path was untestable against it, and the split-brain
  // between two fakes is exactly how that went unnoticed.
</script>
<script src="../lib/theme-engine.js"></script>
<script src="../content.js"></script>
<script>
  // Exercise the states that only happen over time.
  window.__drive = async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const root = document.documentElement;
    await wait(500);                                   // initial passes

    document.getElementById("reply").setAttribute("data-is-streaming", "true");
    await wait(500);                                   // streaming
    document.getElementById("reply").setAttribute("data-is-streaming", "false");
    await wait(500);                                   // finished

    // --- extended-thinking lifecycle, replayed from a live claude.ai capture.
    // While Claude thinks, the streamed reasoning ALREADY sits inside
    // .font-claude-response, collapsed and marked [data-find-omitted]; the
    // visible window is empty. Stamping data-yume-reply off that text is what
    // flickered the moogle (frame + crystal mid-thinking, second moogle below).
    // The answer then lands OUTSIDE the marker, and the settled DOM drops the
    // marker nodes. Assert the stamp fires exactly at the response, not before.
    const think = document.createElement("div");
    think.setAttribute("data-is-streaming", "true");
    think.className = "group relative";
    think.id = "thinker";
    think.innerHTML =
      '<div class="font-claude-response">' +
      '<div><div data-find-omitted>streamed reasoning text, hidden behind the status row</div>' +
      '<div class="overflow-hidden" data-find-omitted></div></div></div>' +
      '<button class="group/status"><span>Honing</span></button>';
    document.getElementById("reply").parentElement.append(think);
    await wait(600);                                   // marker passes run
    if (think.hasAttribute("data-yume-reply")) {
      window.__errors.push("thinking-phase wrapper was stamped data-yume-reply — " +
        "the frame/crystal would appear mid-thinking and the moogle would flicker");
    }

    // Response begins: first real text lands outside the marker.
    const answer = document.createElement("p");
    answer.textContent = "The answer.";
    think.querySelector(".font-claude-response").append(answer);
    await wait(600);
    if (!think.hasAttribute("data-yume-reply")) {
      window.__errors.push("response text did not stamp data-yume-reply — replies would never get their window");
    }

    // Settled: Claude removes the marker nodes; the stamp must survive.
    think.querySelectorAll("[data-find-omitted]").forEach((n) => n.remove());
    think.setAttribute("data-is-streaming", "false");
    await wait(600);
    if (!think.hasAttribute("data-yume-reply")) {
      window.__errors.push("stamp was lost when the thinking nodes were removed after settling");
    }

    // --- chocobo drive-bys, forced through the test/preview hook with short
    // durations. Variant A must knock the party over and stand them back up;
    // B/C must mount their clip wrapper inside the composer and clean up.
    chrome.storage.local.set({ yumeChocoNow: { v: "a", dur: 900 } });
    // The trips happen inside the crossing segment, which sits in the middle
    // of the parkour route — sample late enough to be sure it has started.
    await wait(750);
    if (!document.querySelector(".yume-choco-a")) {
      window.__errors.push("choco A: box bird not on the page mid-run");
    }
    if (!document.querySelector(".yume-choco-sky")) {
      window.__errors.push("choco A: sky bird not mounted on <body> — the ground segments would be clipped away");
    }
    if (![...document.querySelectorAll(".yume-party-member")].some((m) => m.dataset.pose === "fall")) {
      window.__errors.push("choco A: no party member fell as the bird passed");
    }
    await wait(2100);
    if (document.querySelector(".yume-choco, .yume-choco-sky")) {
      window.__errors.push("choco A: sprite still present after the run ended");
    }
    if ([...document.querySelectorAll(".yume-party-member")].some((m) => m.dataset.pose !== "idle")) {
      window.__errors.push("choco A: party did not stand back up");
    }

    chrome.storage.local.set({ yumeChocoNow: { v: "b", dur: 600 } });
    await wait(300);
    const clip = document.querySelector(".yume-choco-clip");
    if (!clip || !clip.closest('div[class*="cursor-text"]')) {
      window.__errors.push("choco B: clip wrapper not mounted inside the composer");
    } else if (!(parseInt(clip.querySelector(".yume-choco").style.getPropertyValue("--choco-dist")) > 0)) {
      window.__errors.push("choco B: travel distance was not measured");
    }
    await wait(700);
    chrome.storage.local.set({ yumeChocoNow: "c" });   // bare-string form
    await wait(250);
    if (!document.querySelector(".yume-choco-c")) {
      window.__errors.push("choco C: sprite not on the page mid-run");
    }
    // C got the default 4.2s duration; abort it the way a theme switch would
    // and confirm nothing is left behind.
    chrome.storage.sync.set({ cctTheme: "dracula" });
    await wait(300);
    if (document.querySelector(".yume-choco, .yume-choco-clip")) {
      window.__errors.push("choco C: abort on theme switch left the sprite behind");
    }
    chrome.storage.sync.set({ cctTheme: "final-fantasy" });
    await wait(400);

    dispatchEvent(new Event("resize"));                // viewport change
    dispatchEvent(new Event("scroll"));
    await wait(400);

    document.getElementById("composerWrap").remove();  // navigation teardown
    await wait(500);

    // --- the Code tab: same machinery, different shell. The epitaxy prompt
    // appears (as if the user opened claude.ai/code) and the party and the
    // chocobo must adopt it as their stage.
    const code = document.createElement("div");
    code.className = "epitaxy-root";
    code.innerHTML = '<div class="epitaxy-composer-width" style="position:relative">' +
      '<div class="chips-decoy" style="width:600px;height:28px">Default · repo · main</div>' +
      '<div class="epitaxy-prompt" style="position:relative;width:600px;height:60px">' +
      '<div class="tiptap" contenteditable="true"></div></div></div>';
    document.body.append(code);
    await wait(600);   // party debounce
    if (!document.querySelector(".epitaxy-prompt .yume-party")) {
      window.__errors.push("code tab: party did not mount on the epitaxy prompt");
    }
    // The chip row sits exactly where the Home banner-hunter looks. It must
    // never be styled: on the code tab the hunt stands down entirely.
    const decoy = code.querySelector(".chips-decoy");
    if (decoy.getAttribute("style") !== "width:600px;height:28px") {
      window.__errors.push("code tab: the banner hunter styled the chip row -> " +
        decoy.getAttribute("style"));
    }
    chrome.storage.local.set({ yumeChocoNow: { v: "b", dur: 500 } });
    await wait(250);
    if (!document.querySelector(".epitaxy-prompt .yume-choco-clip")) {
      window.__errors.push("code tab: chocobo clip run did not mount inside the epitaxy prompt");
    }
    await wait(600);
    code.remove();
    await wait(500);

    chrome.storage.sync.set({ cctTheme: "dracula" }); // theme switch away
    await wait(400);
    if (root.getAttribute("data-cct-theme") !== "dracula") {
      window.__errors.push("storage-driven theme switch did not reach the html attribute");
    }
    chrome.storage.sync.set({ cctTheme: "" });         // no theme
    await wait(400);
    chrome.storage.sync.set({ cctTheme: "final-fantasy" });
    await wait(400);
    if (root.getAttribute("data-cct-theme") !== "final-fantasy") {
      window.__errors.push("switching back to final-fantasy did not restore the attribute");
    }

    // --- menu sounds. Declarations for bundled themes come from themes.json,
    // which file:// cannot fetch, so exercise the option through a CUSTOM
    // theme carrying its own declarations — the same shape an imported Final
    // Fantasy has. The sound files also cannot be fetched here; the point is
    // that the whole chain (option resolution -> attribute stamp -> hover and
    // click handlers -> loader failure) runs without a single throw.
    chrome.storage.local.set({ yumeCustomThemes: [{
      schema: 1, id: "custom-smoke-snd", name: "Sound probe", emoji: "S",
      mode: "dark", bg: "#000010", text: "#ffffff", accent: "#ffd75e",
      tokens: { "--bg-000": "230 60% 10%" }, css: "", rawCss: "",
      features: ["party"],
      options: [{ id: "menu-sounds", label: "Menu sounds", default: true }],
    }]});
    chrome.storage.sync.set({ cctTheme: "custom-smoke-snd" });
    await wait(400);
    if (root.getAttribute("data-yume-opt") !== "menu-sounds") {
      window.__errors.push("menu-sounds option was not stamped for a theme that declares it " +
        "(got: " + root.getAttribute("data-yume-opt") + ")");
    }
    const target = document.querySelector("button[data-row-main-button]");
    for (let i = 0; i < 3; i++) {
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await wait(60);
    }
    target.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    target.click();
    await wait(400);   // loader promise settles (fetch fails on file://) — must not reject unhandled

    chrome.storage.sync.set({ cctTheme: "final-fantasy" });
    await wait(300);

    // Icon-glyph adoption: a menu portals in with an Anthropicons PUA glyph;
    // the marker must stamp its host span.
    const fakeMenu = document.createElement("div");
    fakeMenu.setAttribute("role", "menu");
    fakeMenu.innerHTML = "<button role=menuitem><span>\uE098</span><span>Routines</span></button>";
    document.body.append(fakeMenu);
    await wait(250);
    const glyphHost = fakeMenu.querySelector("span");
    if (glyphHost.dataset.yumeIcon !== "bolt") {
      window.__errors.push("icon glyph U+E098 was not marked as bolt (got: " +
        glyphHost.dataset.yumeIcon + ")");
    }
    fakeMenu.remove();

    if (window.__audioCtxCount !== 0) {
      window.__errors.push("an AudioContext was constructed without user activation (" +
        window.__audioCtxCount + "x) — Chrome logs the autoplay violation into the error panel");
    }
    if (!navigator.userActivation) {
      window.__errors.push("navigator.userActivation missing — the gesture gate would never open");
    }

    return window.__errors;
  };
  window.__drive().then((errs) => {
    document.title = "SMOKE:" + (errs.length ? errs.join(" | ") : "clean");
  });
</script>
</body>
</html>`;

// The same machinery against chatgpt.com's shape. The hostname can't be faked
// under file://, so the site override global routes content.js down the
// chatgpt branches; everything else — engine shim, storage, observers — is
// identical to the real page.
const GPT_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>smoke-gpt</title>
<script>
  localStorage.clear();
  localStorage.setItem("sync:cctThemeGpt", JSON.stringify("final-fantasy-gpt"));
  window.__YUME_TEST_SITE = "chatgpt";
  window.__audioCtxCount = 0;
  const RealAC = window.AudioContext;
  window.AudioContext = function (...a) { window.__audioCtxCount++; return new RealAC(...a); };
</script>
</head>
<body>
<div id="stage-slideover-sidebar"><nav aria-label="Chat history">
  <a class="__menu-item" data-testid="create-new-chat-button" href="#"><div class="icon"><svg></svg></div>New chat</a>
</nav></div>

<main>
  <section data-testid="conversation-turn-1" data-turn="user" id="uturn">
    <div data-message-author-role="user"><div class="user-message-bubble-color">hello there</div></div>
  </section>
  <section data-testid="conversation-turn-2" data-turn="assistant" id="aturn">
    <div data-message-author-role="assistant"><div class="markdown prose"><p>A filled reply.</p></div></div>
  </section>

  <div id="footer">
    <!-- shaped like a usage banner; the hunter must NEVER touch it on gpt -->
    <div id="gpt-decoy" style="width:600px;height:24px">You have 3 messages left today</div>
    <form data-type="unified-composer" style="position:relative;width:640px">
      <div class="relative">
        <div data-composer-surface="true" style="position:relative;height:52px">
          <div id="prompt-textarea" contenteditable="true" role="textbox"></div>
        </div>
      </div>
    </form>
  </div>
</main>

<script>
  window.__errors = [];
  addEventListener("error", (e) => window.__errors.push("error: " + (e.message || e)));
  addEventListener("unhandledrejection", (e) => window.__errors.push("rejection: " + e.reason));
  const realError = console.error;
  console.error = (...a) => { window.__errors.push("console.error: " + a.join(" ")); realError(...a); };
</script>
<script src="../lib/theme-engine.js"></script>
<script src="../content.js"></script>
<script>
  window.__drive = async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const root = document.documentElement;
    await wait(500);

    if (root.getAttribute("data-cct-theme") !== "final-fantasy-gpt") {
      window.__errors.push("gpt: cctThemeGpt selection did not reach the html attribute");
    }
    if (!document.querySelector("form[data-type='unified-composer'] > .yume-party")) {
      window.__errors.push("gpt: party did not mount on the composer form");
    }
    if (!document.getElementById("aturn").hasAttribute("data-yume-reply")) {
      window.__errors.push("gpt: filled assistant turn was not stamped data-yume-reply");
    }
    if (document.getElementById("uturn").hasAttribute("data-yume-reply")) {
      window.__errors.push("gpt: USER turn was stamped data-yume-reply");
    }
    if (!document.getElementById("aturn").hasAttribute("data-yume-latest")) {
      window.__errors.push("gpt: newest reply was not stamped data-yume-latest");
    }

    // Thinking lifecycle: while .result-thinking is on the body the turn must
    // stay unstamped (the frame would wrap an empty window); the stamp lands
    // when the class drops and real text exists.
    const think = document.createElement("section");
    think.setAttribute("data-turn", "assistant");
    think.setAttribute("data-testid", "conversation-turn-3");
    think.innerHTML = "<div data-message-author-role='assistant'>" +
      "<div class='markdown prose result-thinking'><p></p></div></div>";
    document.getElementById("aturn").after(think);
    await wait(600);
    if (think.hasAttribute("data-yume-reply")) {
      window.__errors.push("gpt: thinking turn was stamped data-yume-reply mid-thinking");
    }
    const md = think.querySelector(".markdown");
    md.classList.remove("result-thinking");
    md.querySelector("p").textContent = "The answer arrives.";
    await wait(600);
    if (!think.hasAttribute("data-yume-reply")) {
      window.__errors.push("gpt: settled turn was never stamped data-yume-reply");
    }
    if (!think.hasAttribute("data-yume-latest")) {
      window.__errors.push("gpt: latest tag did not move to the newest reply");
    }

    // The working stamp: while the stop button exists, the NEWEST assistant
    // turn wears data-yume-working (Mog's perch); it clears when the button
    // goes. Both edges matter — a stuck stamp leaves Mog hopping forever.
    const stop = document.createElement("button");
    stop.setAttribute("data-testid", "stop-button");
    document.querySelector("[data-composer-surface]").append(stop);
    await wait(600);
    if (!think.hasAttribute("data-yume-working")) {
      window.__errors.push("gpt: newest assistant turn was not stamped data-yume-working while generating");
    }
    if (document.getElementById("aturn").hasAttribute("data-yume-working")) {
      window.__errors.push("gpt: an older turn was stamped data-yume-working");
    }
    stop.remove();
    await wait(600);
    if (document.querySelector("[data-yume-working]")) {
      window.__errors.push("gpt: data-yume-working survived the stop button's removal");
    }

    // Chocobo parkour: sky bird on <body>, box bird on the form, party trips.
    chrome.storage.local.set({ yumeChocoNow: { v: "a", dur: 900 } });
    await wait(750);
    if (!document.querySelector("form[data-type='unified-composer'] .yume-choco-a")) {
      window.__errors.push("gpt choco A: box bird not mounted on the composer form");
    }
    if (!document.querySelector("body > .yume-choco-sky")) {
      window.__errors.push("gpt choco A: sky bird not mounted on body");
    }
    if (![...document.querySelectorAll(".yume-party-member")].some((m) => m.dataset.pose === "fall")) {
      window.__errors.push("gpt choco A: no party member fell");
    }
    await wait(2100);
    if (document.querySelector(".yume-choco, .yume-choco-sky")) {
      window.__errors.push("gpt choco A: sprite left behind after the run");
    }

    // Variant B must clip inside the composer SURFACE (where the paint lives),
    // not the form — a form-level clip would hide behind the surface fill.
    chrome.storage.local.set({ yumeChocoNow: { v: "b", dur: 600 } });
    await wait(300);
    const clip = document.querySelector(".yume-choco-clip");
    if (!clip || !clip.parentElement.hasAttribute("data-composer-surface")) {
      window.__errors.push("gpt choco B: clip wrapper not mounted on [data-composer-surface]");
    }
    await wait(800);

    // The banner hunter stands down on chatgpt: the decoy keeps its exact
    // inline style through every pass.
    const decoy = document.getElementById("gpt-decoy");
    if (decoy.getAttribute("style") !== "width:600px;height:24px") {
      window.__errors.push("gpt: banner hunter styled the decoy -> " + decoy.getAttribute("style"));
    }

    // Anthropicons adoption is claude-only; the glyph must NOT be marked here.
    const fakeMenu = document.createElement("div");
    fakeMenu.setAttribute("role", "menu");
    fakeMenu.innerHTML = "<button role=menuitem><span></span><span>Routines</span></button>";
    document.body.append(fakeMenu);
    await wait(250);
    if (fakeMenu.querySelector("span").dataset.yumeIcon) {
      window.__errors.push("gpt: PUA glyph was marked on chatgpt (claude-only mechanism)");
    }
    fakeMenu.remove();

    // Theme off and back on through the gpt slot.
    chrome.storage.sync.set({ cctThemeGpt: "" });
    await wait(400);
    if (root.getAttribute("data-cct-theme")) {
      window.__errors.push("gpt: clearing cctThemeGpt did not clear the attribute");
    }
    if (document.querySelector(".yume-party")) {
      window.__errors.push("gpt: party left behind after the theme was cleared");
    }
    chrome.storage.sync.set({ cctThemeGpt: "final-fantasy-gpt" });
    await wait(500);
    if (root.getAttribute("data-cct-theme") !== "final-fantasy-gpt") {
      window.__errors.push("gpt: switching back did not restore the attribute");
    }
    // The CLAUDE slot must mean nothing here.
    chrome.storage.sync.set({ cctTheme: "dracula" });
    await wait(300);
    if (root.getAttribute("data-cct-theme") !== "final-fantasy-gpt") {
      window.__errors.push("gpt: a claude-slot write changed the chatgpt tab's theme");
    }

    if (window.__audioCtxCount !== 0) {
      window.__errors.push("gpt: AudioContext constructed without user activation (" +
        window.__audioCtxCount + "x)");
    }
    return window.__errors;
  };
  window.__drive().then((errs) => {
    document.title = "SMOKE:" + (errs.length ? errs.join(" | ") : "clean");
  });
</script>
</body>
</html>`;

let failed = 0;

async function drivePage(label, html, budget) {
  const file = resolve(ROOT, "tools/.smoke.html");
  await writeFile(file, html, "utf8");
  const { stdout } = await run(CHROME, [
    "--headless", "--disable-gpu", "--allow-file-access-from-files",
    "--virtual-time-budget=" + budget, "--dump-dom",
    "file://" + file,
  ], { maxBuffer: 40 * 1024 * 1024 });
  await rm(file, { force: true });

  const m = /<title>SMOKE:([\s\S]*?)<\/title>/.exec(stdout);
  if (!m) {
    failed++;
    console.log(`${label}: FAILED — the driver never completed (a throw at load time stops everything)`);
    const early = /Uncaught[^<\n]*/.exec(stdout);
    if (early) console.log("  " + early[0]);
    return;
  }
  const result = m[1].trim();
  if (result === "clean") {
    console.log(`${label}: clean — content.js ran through every state with no errors`);
    return;
  }
  failed++;
  console.log(`${label} FAILED:`);
  for (const e of result.split(" | ")) console.log("  " + e);
}

await drivePage("smoke (claude)", PAGE, 22000);
await drivePage("smoke (chatgpt)", GPT_PAGE, 16000);
process.exit(failed ? 1 : 0);
