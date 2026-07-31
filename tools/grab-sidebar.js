// Yume Forge — sidebar structure grab (chatgpt.com).
//
// Paste into the DevTools console on your LOGGED-IN chatgpt.com tab, then
// paste back what it puts on the clipboard. It captures the sidebar's markup
// skeleton (plus the profile row and any open menu) so section boxes and icon
// rules can be keyed to the real logged-in structure — the anonymous build
// doesn't have Pinned/Projects at all.
//
// Avatars and any data: URIs are stripped; chat titles are kept (they're the
// same ones visible in your own sidebar).
(() => {
  const strip = (html) =>
    html
      .replace(/src="data:[^"]*"/g, 'src="data:…"')
      .replace(/href="data:[^"]*"/g, 'href="data:…"')
      .replace(/url\(data:[^)]*\)/g, "url(data:…)");
  const skel = (el, depth) => {
    if (!el || depth > 14) return "";
    const attrs = [...el.attributes]
      .filter((a) => /^(class|id|href|role|type|aria-|data-)/.test(a.name))
      .map((a) => `${a.name}="${a.value.slice(0, 110)}"`)
      .join(" ");
    const kids = [...el.children].map((c) => skel(c, depth + 1)).join("");
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.nodeValue.trim())
      .map((n) => n.nodeValue.trim().slice(0, 40))
      .join(" ");
    return `<${el.tagName.toLowerCase()} ${attrs}>${text}${kids}</${el.tagName.toLowerCase()}>`;
  };
  const side = document.querySelector("#stage-slideover-sidebar");
  const out =
    "YUME SIDEBAR GRAB\n" +
    "build: " + (document.documentElement.getAttribute("data-build") || "?") + "\n\n" +
    strip(skel(side, 0));
  console.log(out.length + " chars");
  try { copy(out); console.log("^ on the clipboard — paste it back."); }
  catch { console.log(out); }
  return "done";
})();
