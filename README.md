# Yume Forge

A fork of [Yume Themes for Claude](https://chromewebstore.google.com/detail/ipfkpkhddkhndibomlaklpfaikjfdlgb)
(by Mohamed El-Harras) with three things added:

1. **Import / export / share** — every theme has a **⤓** button that writes a
   self-contained `.yume.json` and copies a `YUME1:` code. Import a file, a
   code, or a `.zip` of either.
2. **A Final Fantasy theme** — menu-blue windows with hard white frames, a
   crystal beside every reply, and a four-person party idling on the composer.
3. **A theme studio** — build themes from three colours, fine-tune all 29 of
   Claude's design tokens, add custom CSS, preview live on claude.ai. Present
   but not surfaced in the popup right now; it's the options page.

## Download

The [latest release](https://github.com/icpryde/yume-forge/releases/latest)
contains one download:

- **`yume-forge.zip`** — the complete modified Yume Forge browser add-on,
  including the bundled Final Fantasy theme and all other themes.

Final Fantasy is already included. No separate theme download or import is
needed.

The original's 24 themes are all still here and untouched. The theme covers
both faces of claude.ai: the Home chat and the **Code tab** (a separate app
shell — its prompt becomes the menu window, the party and chocobo stage on it,
the peeking mascot yields its perch, and every pulsing "working" dot is a
hopping Mog).

Final Fantasy also hides a **chocobo**: every 5–10 minutes (first appearance
60–120 s after load) it picks one of three drive-bys — a parkour run that
sprints in along the bottom of the screen, leaps onto the composer, bowls the
party over one by one, leaps off the far edge and sprints back out (the whole
route is measured per-run, so any window width works); or clipped behind the
composer's top line in either direction, emerging from one frame edge and
vanishing into the other. It
skips hidden tabs and reduced-motion users. To preview without waiting:
`chrome.storage.local.set({ yumeChocoNow: "a" })` (or `"b"`/`"c"`) from any
extension console.

## Install

It's an unpacked extension — nothing to build.

1. Unzip `yume-forge.zip` if you haven't (Load unpacked needs a folder, not
   the archive)
2. Open `chrome://extensions` (or `arc://extensions`)
3. Turn on **Developer mode** (top right)
4. **Load unpacked** → select the `yume-forge` folder
5. Reload any open claude.ai tab

After changing any file, press **↻** on the extension's card. Reloading the
claude.ai tab alone is not enough.

Because it's unpacked it will never auto-update, and nothing can overwrite your
edits.

### What changed from the store version

- **Removed `background.js`.** The original ran a service worker that fetched
  CSS from a GitHub repo every 6 hours and injected it into claude.ai. That's a
  legitimate technique (Dark Reader does the same, and the Web Store forbids
  remote *JavaScript* but not remote CSS) — but it meant arbitrary styling could
  land on your Claude sessions with no review. Gone, along with the `alarms`
  permission.
- **Removed the store `key` and `update_url`** so Chrome loads it unpacked and
  never replaces it.
- **Removed `_metadata/`**, the store's signed file-hash manifest — Chrome would
  otherwise flag the modified files as tampered.

Permissions are now just `storage`.

## Sharing themes

Every card in the popup carries a **⤓** button. It writes
`<id>.yume.json` and copies a `YUME1:…` code to the clipboard at the same time —
the file for sending, the code for pasting into a chat. Either one imports.

To bring one in, use **📥 Import a theme** (file) or **Paste code**. Imports
always mint a fresh id, so receiving a theme can never overwrite one of yours.

The importer takes a `.yume.json`, a `.txt` code, **or a `.zip` containing
either** — handing someone an archive is the natural way to share a theme, and
making them unzip it first is a papercut on the one step that should be
frictionless. `lib/themezip.js` walks the central directory and inflates with
`DecompressionStream("deflate-raw")`, which the browser already ships, so this
costs no dependency. The file type is sniffed from the magic bytes, not the
extension.

### Building the shareable zip

```bash
node tools/package.mjs            # -> ~/Downloads/yume-forge.zip
node tools/package.mjs --out .    # somewhere else
```

Unzip `yume-forge.zip`, then **Load unpacked** the folder.

The file list is an explicit **allowlist**. A denylist ships whatever new junk
lands in the tree next, and you find out after handing the file to someone. The
3.3MB of sprite source sheets are excluded: they are inputs for `tools/rip-*.py`
only, and the generated CSS carries the art as data URIs.

### What travels with a theme

Everything except code. The stylesheet carries every sprite and font as data
URIs; the package carries the sounds the same way, and the player prefers a
theme's embedded audio over this build's bundled files — so a theme shared to
someone on an older copy still looks *and sounds* complete. What cannot travel
is behaviour: the party, the chocobo and the sound engine are extension code,
and themes are deliberately data-only (the same stance as removing the store
version's remote-CSS updater — nothing a theme file contains can execute).

### Exports are self-contained

This is the part that took work. A theme like Final Fantasy is not three
colours — it is ~1000 lines of CSS, nine generated sprite sheets, two webfonts
and a handful of behaviours in `content.js`. The original share format carried
only a token map, so exporting it produced a file that looked right in the
popup and rendered none of the theme.

`lib/packer.js` flattens a theme into one object with nothing left to fetch:

- every `--yume-*` variable it references, resolved **transitively** (the
  party's frame width is a `calc()` over `--yume-party-poses`, so stopping at
  direct references would ship a broken sprite sheet) and inlined — the sprites
  are already data URIs
- the `@font-face` rules for the families it names, woff2 inlined
- its stylesheet, with `html[data-cct-theme="<id>"]` rewritten to the portable
  marker `__YUME_ROOT__`, which the compiler expands to whatever selector the
  theme lands under once imported
- the **feature names** it needs from `content.js`

That last one matters. The party sprites, shooting stars, banner styling and
composer glow were gated on the literal id `final-fantasy`; an imported copy
arrives as `custom-…`, so every one of them would have silently switched off.
`content.js` now stamps `data-yume-feat` on `<html>` from the active theme and
gates on that, and `themes/_base.css` reads the same attribute.

The same packer runs in both places — `tools/pack-theme.mjs` feeds it the disk,
`popup.js` feeds it `chrome.runtime.getURL` — so a theme exported from the
command line is byte-identical to one exported from the popup.

```bash
node tools/pack-theme.mjs final-fantasy   # -> dist/final-fantasy.yume.json + .txt
node tools/pack-theme.mjs --all
```

## Per-theme settings

Some themes have options. Those cards get a **⚙** in the popup; clicking it
expands a panel inside the card. Only themes that declare options show a gear —
Final Fantasy is currently the only one, so the other 24 cards stay clean.

Final Fantasy currently has three: **Colourful text** (off), **Menu sounds**
(on — the classic cursor blip on hover or keyboard focus, a chime on select;
Web Audio, unlocked by the first click per the browser's autoplay policy) and
**Horizon scenery** (on — a silhouetted scene pinned to the bottom-right of
the viewport, behind everything; widening the window reveals more of its left).

A theme declares its options in `themes/themes.json`:

```json
{ "id": "final-fantasy", "options": [
    { "id": "rich-text", "label": "Colourful text",
      "hint": "Bold, italics, headings, links and code picked out in menu colours",
      "default": false }
]}
```

Values live in `chrome.storage.sync` under `yumeThemeOptions`, so a theme and
the way you have it set up travel together across machines. `content.js` stamps
the enabled ids on `<html>` as `data-yume-feat`'s sibling `data-yume-opt`, and
the CSS gates on it:

```css
html[data-cct-theme="final-fantasy"][data-yume-opt~="rich-text"] .font-claude-response strong { … }
```

Declarations travel with an export, so an imported theme keeps its gear — but
the *values* deliberately do not, since settings are per-person and shipping
yours would silently reconfigure someone else's copy.

**Why a gear and not a right-click:** a context menu inside a popup collides
with the browser's own, and nothing about a card suggests you can right-click
it. The card already had a tool row (export, delete), so the gear just joins it.

## Making a theme

The studio (**editor/**) is still in the tree and still reachable as the
extension's options page, but it is not surfaced in the popup right now.

Pick a background, text and accent colour and it derives Claude's whole token
ramp from them — surfaces, text tiers, borders, brand and pictogram colours. The
deltas came from measuring the shipped themes, so derived palettes land in the
same range the hand-authored ones do.

- **Advanced tokens** — raw `H S% L%` triplets. Edits stick until you press
  *Re-derive tokens*, so changing a base colour won't silently throw away your
  tuning.
- **Custom CSS** — appended after the palette. `&` expands to the theme's root
  selector:
  ```css
  & [data-user-message-bubble="true"] { border-radius: 2px !important; }
  ```
- **Live on claude.ai** — pushes the working copy to any open claude.ai tab as
  you edit. Cleared automatically when the studio closes.

A theme built here is a token map; a theme like Final Fantasy is hand-written
CSS plus generated assets. Both export through the same button — the packer
just has more to flatten for the second kind.

## The Final Fantasy theme

Everything is CSS — no DOM injection. The pieces:

| Piece | How |
|---|---|
| Menu windows | gradient fill + 2px white border + inner bevel + hard drop shadow, on bubbles, the composer, menus, dialogs and tooltips |
| Sidebar edge | claude.ai's 1px hairline rebuilt as a window edge: white keyline, blue bevel, hard drop |
| Breathing glow | `ff-breathe` on the composer, 4.2s |
| Crystal | `::before` on `div[data-is-streaming]`. Claude renders no avatar, so the reply is indented 34px and the crystal hangs in the gutter that creates |
| Party | `::before` on the composer, a 2-frame sheet stepped with `steps(1)` |
| Party gating | parked at `animation-play-state: paused`, released by `html:has(div[data-is-streaming="true"])` — so they move only while Claude is working, no JS |
| Select hand | on `a[data-row-main-button]` hover (pointing right, at the row) and on the send button, mirrored to point left and at 2x |
| Composer row | attach / model / mic / voice / mode pills restyled as menu chips — cosmetic only, no layout or pointer-events changes |
| Moon | top-right on `html::before`, halo baked into the SVG (a CSS filter there would blur the scenery gradients sharing the layer) |
| Starfields | two layers on `body::before` / `body::after`, falling at 210s and 128s; the near one twinkles |
| Motes | crystal sparkles falling on `html::after`, 34s |
| Shooting stars | spawned from `content.js` every 9–27s with a random angle, start point, length and speed; ~18% of the time they come in pairs |
| Reply windows | Claude's replies get the dialogue-box frame in a deeper blue than your messages (`--ff-window-reply` vs `--ff-window-user`); the newest one breathes |
| Banners | `content.js` finds them by geometry and pads them clear of the party, then tags them `data-yume-party-pad` so CSS can style them as a small window |
| Nav icons | the six sidebar rows get pixel icons from `nav-icons.png`, mapped by `nth-of-type` and scoped to `.dframe-sidebar-body` so the Design row keeps its paintbrush |
| Shop icons | Recents rows swap their speech-bubble glyph for equipment icons — sword, axe, shield, staff, flask, boots, helm, gloves — cycled by `nth-of-type` so a long list reads as an inventory |
| Moogle | replaces Claude's `svg[data-cds="Spark"]` working glyph. Painted on the glyph's own wrapper via `:has()`, so it inherits that wrapper's existing fade-in/fade-out for free — no new state to track. Hops while streaming, settles when done |
| Type | Silkscreen for chrome, Press Start 2P for the greeting; prose deliberately stays in a readable face |

**A note on `cct-fall`:** the original extension's keyframe ran
`translateY(-460px) → 0` on layers positioned `top: -460px; bottom: 0`. At the
start of every cycle that leaves the bottom 460px of the viewport uncovered, so
particles vanish in a block and sweep back down — visible on Sakura and every
other particle theme too. It now runs `0 → +460px`, which keeps the viewport
covered at both ends; the tile is exactly 460 tall so the wrap is invisible.

**Why the stars need two layers:** opacity animates per *element*, not per
background layer. On a single tile every star would twinkle in lockstep or none
would, so "some twinkle, some hold steady" needs two elements. The differing
fall durations give the sky some parallax depth as a bonus.

**Full pixel mode:** in `themes/final-fantasy.css`, set `--ff-body` to
`var(--ff-pixel-ui)`. It's authentic and much harder to read — hence the default.

All animation is disabled under `prefers-reduced-motion`.

### Two sources for the party and crystal

The theme ships with hand-drawn assets, and a ripper that swaps in real sprites
from image files in `sources/sprites/`. Both write the same generated files, so
whichever generator you run last wins:

```bash
node tools/sprites.mjs        # drawn party   -> sprites/party.css
node tools/crystal.mjs        # drawn crystal -> sprites/crystal.css
node tools/cursor.mjs         # drawn hand    -> sprites/cursor.css
node tools/items.mjs          # shop icons    -> sprites/items.css
node tools/ambience.mjs       # motes/stars/moon -> sprites/ambience.css

python3 tools/rip-assets.py     # ripped party + crystal + moogle from the PNGs
python3 tools/rip-nav-icons.py  # nav / tray / gear icons from the three sheets
```

`rip-nav-icons.py` takes an AI-generated pixel-art sheet — which only *looks*
like pixel art; every block is soft with gradients and ringing — keys the pink,
splits it by connected component, infers each sprite's real cell size from its
modal run length, majority-votes each cell, and snaps the result to a small
blue/gold palette. Without that last step it renders as mush at 24px.

One generator per asset file, on purpose. The crystal used to be emitted by
`ambience.mjs`, which meant regenerating the starfield silently reverted a
ripped crystal back to the drawn one. Now `ambience.mjs` only owns things with
a single source, and anything with two sources gets its own generator.

The theme reads the `*-w` / `*-h` custom properties each generator emits and
derives its sizes from them, so switching an asset's source never requires a
CSS edit.

`tools/rip-assets.py` reads `*Battle Sprites*.png`, `*Mog.png` and
`crystal.png`, keys out the magenta, takes idle columns 1 and 2 (measured as
the extremes of the 1→2→3→4 cycle), and composes 2-frame sheets. Rows 1/2/5/6 —
Warrior, Monk, White Mage, Black Mage — configurable via `PARTY_ROWS`; the
moogle pair via `MOOGLE_FRAMES`.

`finger-select.webp` needs two things the other sources don't. Its background
is white *and so is the hand's fill*, so a colour key would hollow the hand
out — the background is found by flood-filling white inward from the border
instead, which never reaches the interior because the black keyline encloses
it. And WebP is lossy, so the file has ~458 colours where the art has three;
everything is snapped to the nearest palette entry first, or the flood leaks
through half-tone pixels along the keyline.

Recovering its pixel grid also needed a sturdier method than the crystal's.
Lossy ringing leaves 1px grey bands along every edge, which drags the modal run
length down to 1 and defeats the simple approach; `pixelate()` ignores runs
shorter than 4px, takes the *smallest* frequently-occurring run rather than the
most common, and majority-votes each source cell instead of sampling its
centre. It also tolerates non-integer scales — 500px over 16 cells is 31.25, so
no single integer divides the image.

The moogle sheet isn't on a usable grid — sprites touch and rows differ in
height — so band detection produces garbage. It's split by connected-component
labelling instead, sorted into reading order, which is why frames are
referenced by index.

Three details it has to get right:

- **Frame pairs share a crop box.** Bottom-aligning each frame on its own
  bounding box would cancel the idle bob; each character's two frames are
  cropped with the union of both boxes so the motion survives.
- **Characters are bottom-aligned** to one baseline and centred in a uniform
  cell, so the party stands on a single floor.
- **The moogle's hop is CSS, not baked in.** Its frames are bottom-aligned for
  exactly that reason — a baked-in vertical offset would fight the transform.

The hand-drawn set stays in the repo either way. Those are original art in the
classic party-archetype style, not traced from anything — use them if you ever
want a version with no third-party assets in it.

**Ripped game sprites are fine for a personal build but aren't yours to
redistribute.** Before publishing, restore the original-art generators:

```bash
node tools/sprites.mjs
node tools/crystal.mjs
node tools/cursor.mjs
node tools/ambience.mjs
```

The `tools/rip-*.py` scripts need the source sheets in `sources/sprites/`, and those
are **not** in `yume-forge.zip` (3.3MB, and the art is already baked into the
generated CSS as data URIs). They now refuse to run without them rather than
overwriting the generated CSS with an empty one — which is what
`rip-nav-icons.py` used to do, silently, taking all 17 nav/tray/gear icons with
it.

## Working on it

```bash
node tools/check.mjs       # everything below, in order — run this one
node tools/sprites.mjs     # party sheet   -> sprites/party.css
node tools/silhouette.mjs  # horizon scene -> sprites/silhouette.css
python3 tools/rip-choco.py       # chocobo run cycle -> sprites/chocobo.css
python3 tools/rip-shop-icons.py  # recents equipment  -> sprites/shop-icons.css
node tools/ambience.mjs    # motes + stars -> sprites/ambience.css
node tools/test.mjs        # theme engine tests
node tools/smoke.mjs       # runs content.js against a stand-in claude.ai DOM
node tools/glyph-test.mjs  # working-glyph states, asserted on computed style
sh tools/convert-sounds.sh # sources/sounds -> the shipped wavs (gains documented inside)
node tools/pack-test.mjs   # bundled vs exported-and-reimported, diffed
node tools/popup-test.mjs  # drives the real popup through import -> export
node tools/package.mjs     # build the shareable extension zip
node tools/zip-test.mjs    # verify it + theme-import test fixtures
```

The browser-driving suites find Chrome themselves (`tools/chrome.mjs`, which
also checks Chromium/Brave/Edge and the usual Linux and Windows paths). Set
`CHROME=/path/to/binary` to point them somewhere else.

`popup-test` and `zip-test` need a packed theme and the built extension; they
skip themselves with a note when those are absent, so
`node tools/check.mjs` on a fresh copy runs what it can and passes:

```bash
node tools/pack-theme.mjs final-fantasy && node tools/package.mjs && node tools/check.mjs
```

Sprites are authored as ASCII grids at the top of `tools/sprites.mjs` — edit the
characters, re-run, done. The compiler pads the art, paints the silhouette
outline itself, and merges runs into one `<path>` per colour (which took the
sheet from 50KB to 9KB).

`tools/glyph-test.mjs` reproduces the real status-row and logo markup in each
state (thinking, thinking-with-logo, finished) and asserts on computed style:
the original glyph invisible, exactly one moogle drawn, and — the one that bit
hardest — that every glyph selector actually **parsed**. A `:has()` nested
inside another `:has()` is invalid CSS; the browser drops the whole rule with no
error, which is indistinguishable from a logic bug until you count the rules
that survived.

`tools/pack-test.mjs` builds the same markup twice — once under the bundled
theme with its link tags, once under the packaged theme imported as a single
compiled `<style>` — and diffs `getComputedStyle` across 18 probes. It earned
its keep immediately: the generated sprite sheets label each variable with a
trailing comment, and splitting the `:root` block on `;` left that comment
glued to the front of the next declaration, so its name failed the
"starts with `--`" test. Every variable after the first was dropped. The export
still produced a plausible file and a theme card that looked fine; five nav and
recents icons just computed to `background-image: none`.

`tools/smoke.mjs` is the one that matters before shipping a content.js change.
`node --check` only parses — it cannot see a function deleted out from under its
own call sites, which silently kills every pass with a ReferenceError and looks
exactly like "the feature stopped working". The smoke test executes the script
against a stand-in DOM and drives the states that only occur over time: theme
switch, streaming start/stop, composer teardown on navigation, resize, scroll.

`tools/mock.html` is an offline harness: it mirrors the parts of claude.ai's DOM
that themes hook, so you can iterate without a live session. Change the
`data-cct-theme` attribute on `<html>` to preview any theme.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --screenshot=/tmp/mock.png --window-size=1280,760 tools/mock.html
```

The popup and studio also open straight off disk — `lib/theme-engine.js` shims
`chrome.storage` onto `localStorage` when there's no extension context. Chrome
blocks `fetch()` on `file://`, so pass `--allow-file-access-from-files` if you
want the popup's theme list to populate.

## Layout

```
manifest.json            MV3; content script + the full theme CSS list
content.js               stamps data-cct-theme; compiles+injects custom themes
lib/theme-engine.js      colour maths, token derivation, compiler, share codes
lib/packer.js            flattens a theme into a self-contained export
lib/themezip.js          reads a zipped theme bundle in the popup
popup/                   theme picker
editor/                  the studio
themes/                  _base.css + one file per theme + themes.json
fonts/                   Press Start 2P, Silkscreen (both OFL 1.1)
sprites/                 GENERATED — party + ambience + horizon data URIs
sounds/                  GENERATED — menu blips (16-bit mono, peaks matched)
tools/                   generators, tests, offline harness
sources/                 original art + audio (build inputs only, never shipped)
dist/                    GENERATED — packed .yume.json / .yume.txt exports
```

Adding a bundled theme is still the original's three steps: drop in
`themes/<id>.css`, add it to `content_scripts[0].css` in the manifest, add an
entry to `themes/themes.json`.

## Credits

- Original extension by **Mohamed El-Harras**.
- **Press Start 2P** © 2012 CodeMan38, **Silkscreen** © 2001 Jason Kottke —
  both SIL Open Font License 1.1 (`fonts/OFL.txt`).

This is an unofficial, non-commercial fan project. Final Fantasy and related
names and characters are trademarks or copyrighted works of their respective
owners. This project is not affiliated with or endorsed by Square Enix.
