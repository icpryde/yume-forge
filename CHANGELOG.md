# Changelog

## 1.1.0 — 2026-07-31

Final Fantasy comes to chatgpt.com.

- The popup now has **Claude / OpenAI** tabs; each site keeps its own selected
  theme (`cctTheme` / `cctThemeGpt`), and imports file themselves under the
  right tab automatically.
- New bundled theme: **💎 Final Fantasy (OpenAI)** — the full treatment on
  ChatGPT's Chat surface: night sky + starfields + moon + horizon, menu-window
  composer and replies with the crystal, pixel fonts (12px grid-aligned
  prose), the party idling on the composer (kneeling under the greeting,
  bobbing while ChatGPT works), working-Mog on the thinking dot, sidebar item
  icons + hover hand, themed menus/dialogs/tooltips, gold buttons, menu
  sounds, and all three chocobo runs.
- The inline canvas ("writing block") is themed too — including a cascade-layer
  override for ChatGPT's `!`-suffixed tailwind fills.
- Export/import carries the theme's site; older builds simply ignore it.
- Test coverage: a chatgpt-shaped smoke fixture, a gpt round-trip in
  pack-test (40 probes incl. the layer war and inline-style wins), and popup
  site-tab assertions.

Known gap, pending a logged-in DOM report: Pro-only surfaces (the Work tab's
task rows, sidebar section lists) are covered by token-level styling but their
markup-specific dressing may need one follow-up pass.

## 1.0.0 — 2026-07-29

First public release.

- Yume Forge Modified browser add-on with import, export, sharing, and theme
  studio support.
- Final Fantasy theme for Claude Home and Code views.
- One complete add-on download with Final Fantasy already bundled.
- Interactive party, crystal, menu styling, pixel fonts, ambience, sounds,
  accessibility-aware motion, and optional theme settings.
