// Yume Forge — run-lifecycle grab (chatgpt.com).
//
// PASTE THIS FIRST into the DevTools console on your logged-in chatgpt.com
// tab, THEN send a message (ideally one that makes it think for a while).
// It records the newest reply's structure every 250ms for 40 seconds and
// puts a compact report on the clipboard when it's done — paste that back.
//
// This answers, per phase of YOUR build's run (thinking / searching /
// reasoning / streaming / settled): which hooks exist, so Mog's "working"
// test can be keyed to the real thing instead of guesses.
(() => {
  const frames = [];
  const started = Date.now();
  const timer = setInterval(() => {
    const turns = document.querySelectorAll('section[data-turn="assistant"]');
    const last = turns[turns.length - 1];
    if (!last) return;
    const q = (s) => !!last.querySelector(s);
    const classInv = new Set();
    for (const el of last.querySelectorAll("*")) {
      const c = String(el.className);
      // Collect distinctive class fragments; skip tailwind noise.
      for (const m of c.split(/\s+/)) {
        if (/thinking|shimmer|loading|stream|progress|activity|thought|answer|status/i.test(m)) classInv.add(m.slice(0, 40));
      }
    }
    frames.push({
      t: Date.now() - started,
      copyBtn: q('[data-testid="copy-turn-action-button"]'),
      actionsRow: q('[aria-label="Response actions"]'),
      thinking: q(".result-thinking"),
      streamCls: q(".streaming-animation"),
      stopBtn: !!document.querySelector('[data-testid="stop-button"]'),
      speechBtn: !!document.querySelector('[data-testid="composer-speech-button"]'),
      working: last.hasAttribute("data-yume-working"),
      testids: [...last.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")).slice(0, 12),
      cls: [...classInv].slice(0, 12),
      textLen: (last.textContent || "").length,
    });
    if (Date.now() - started > 40000) {
      clearInterval(timer);
      // Compress runs of identical states so the paste stays small.
      const key = (f) => JSON.stringify([f.copyBtn, f.actionsRow, f.thinking, f.streamCls, f.stopBtn, f.speechBtn, f.working, f.testids, f.cls]);
      const out = [];
      for (const f of frames) {
        if (out.length && key(out[out.length - 1].f) === key(f)) { out[out.length - 1].n++; out[out.length - 1].f.textLen = f.textLen; }
        else out.push({ n: 1, f });
      }
      const report = "YUME RUN GRAB\n" + out.map((r) => r.n + "x " + JSON.stringify(r.f)).join("\n");
      console.log(report);
      try { copy(report); console.log("^ on the clipboard — paste it back."); } catch {}
    }
  }, 250);
  return "recording for 40s — send your message now";
})();
