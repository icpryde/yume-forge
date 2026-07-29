#!/usr/bin/env python3
"""Yume Forge — rip party + crystal assets from local source images.

    python3 tools/rip-assets.py

This is the alternative to the hand-drawn assets: `tools/sprites.mjs` writes
sprites/party.css from ASCII art, this writes the same file from real sprite
sheets sitting in sources/sprites/. Whichever you run last wins; re-run the other
to switch back.

Inputs (sources/sprites/, names configurable below):
    PC _ Computer - Final Fantasy ... Battle Sprites.png   6x10 grid, magenta key
    crystal.png                                            upscaled, alpha already

Outputs:
    sprites/party.css     --yume-party-sprite + frame metrics
    sprites/crystal.css   --yume-ff-crystal
    sprites/moogle.css    --yume-ff-moogle (replaces Claude's spark glyph)
    sprites/cursor.css    --yume-ff-cursor (select hand)

Two things this has to get right:

  * Frame pairs share a crop box. Bottom-aligning each frame independently
    would cancel the very bob we want to keep, so each character's two frames
    are cropped with the union of both bounding boxes.

  * Characters are bottom-aligned to a common baseline so the party stands on
    one floor, and centred horizontally in a uniform cell.
"""

import base64
import io
import re
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

SRC_DIR = ROOT / "sources/sprites"
SHEET = next(SRC_DIR.glob("*Battle Sprites*.png"), None)
MOOGLE_SHEET = next(SRC_DIR.glob("*Mog.png"), None)
CRYSTAL = SRC_DIR / "crystal.png"
CURSOR = SRC_DIR / "finger-select.webp"

# Indices into the connected-component list built by components(), in reading
# order. Run with --list to dump a numbered contact sheet and pick others.
MOOGLE_FRAMES = (12, 13)

# Magenta chroma key used by the sheet, plus a small tolerance for any stray
# near-matches introduced by re-encoding.
KEY = (255, 5, 238)
KEY_TOL = 12

# Grid geometry, measured from the sheet: 6 rows x 10 columns on a ~31.8px pitch.
ROW_BANDS = [(8, 32), (39, 64), (71, 96), (103, 127), (135, 159), (166, 191)]
COL_X = [7, 39, 71, 103, 135, 167, 199, 231, 263, 295]
CELL = 32

# Columns 1 and 2 are the extremes of the idle cycle (1->2->3->4->1); measured
# by pixel diff, c1 vs c2 differs most while c1 vs c4 is nearly identical.
IDLE_FRAMES = (0, 1)

# Per-character strips for the interactive party. Frames 0-1 are the idle pair;
# 2-4 are one-shot poses played on click; 5 is the knocked-flat frame (the
# sheet's rightmost column), reserved for the chocobo drive-by gag — it is
# deliberately NOT in the click-pose pool. Column indices into the sheet.
POSE_FRAMES = (0, 1, 6, 7, 8, 9)

# Row index -> label. Rows 1/2/5/6 are Warrior, Monk, White Mage, Black Mage.
PARTY_ROWS = [(0, "warrior"), (1, "monk"), (4, "white-mage"), (5, "black-mage")]

GAP = 3
FACE_RIGHT = True   # flip so the party faces the composer's send button


def dekey(img):
    """Magenta -> transparent."""
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if abs(r - KEY[0]) <= KEY_TOL and abs(g - KEY[1]) <= KEY_TOL and abs(b - KEY[2]) <= KEY_TOL:
                px[x, y] = (0, 0, 0, 0)
    return img


def cell(sheet, row, col):
    y0, y1 = ROW_BANDS[row]
    x0 = COL_X[col]
    # Take the full grid cell, not the tight band — the pose may extend past
    # whatever the neighbouring column happened to occupy.
    return dekey(sheet.crop((x0, y0, x0 + CELL, min(y1 + 1, sheet.height))))


def union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def build_party():
    sheet = Image.open(SHEET).convert("RGBA")
    chars = []

    for row, name in PARTY_ROWS:
        frames = [cell(sheet, row, c) for c in IDLE_FRAMES]
        # Shared crop box: preserves the bob between the two frames.
        box = None
        for f in frames:
            box = union(box, f.getbbox())
        if box is None:
            raise SystemExit(f"row {row} ({name}) is empty — check the grid geometry")
        frames = [f.crop(box) for f in frames]
        if FACE_RIGHT:
            frames = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames]
        chars.append({"name": name, "frames": frames, "w": frames[0].width, "h": frames[0].height})

    cw = max(c["w"] for c in chars)
    ch = max(c["h"] for c in chars)
    frame_w = len(chars) * cw + (len(chars) - 1) * GAP
    sheet_out = Image.new("RGBA", (frame_w * 2, ch), (0, 0, 0, 0))

    for fi in range(2):
        for i, c in enumerate(chars):
            img = c["frames"][fi]
            x = fi * frame_w + i * (cw + GAP) + (cw - img.width) // 2  # centre
            y = ch - img.height                                        # baseline
            sheet_out.paste(img, (x, y), img)

    return sheet_out, frame_w, ch, cw, chars


def build_party_strips():
    """
    One strip per character, POSE_FRAMES wide.

    The combined two-frame sheet can't drive click animations: every character
    shares its background-position, so they'd all react together. Separate
    strips let each injected element hold its own frame index.

    All frames of a character share one crop box (so the idle bob survives) and
    sit on a common baseline within a uniform cell.
    """
    sheet = Image.open(SHEET).convert("RGBA")
    strips = []

    for row, name in PARTY_ROWS:
        frames = [cell(sheet, row, c) for c in POSE_FRAMES]
        box = None
        for f in frames:
            box = union(box, f.getbbox())
        if box is None:
            raise SystemExit(f"row {row} ({name}) is empty")
        frames = [f.crop(box) for f in frames]
        if FACE_RIGHT:
            frames = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames]

        strips.append({"name": name, "frames": frames})

    # One cell size for every character, not per-character: the CSS gives all
    # four elements the same box, so differing cell aspects would stretch some
    # sprites to fit.
    cw = max(f.width for st in strips for f in st["frames"])
    ch = max(f.height for st in strips for f in st["frames"])
    for st in strips:
        strip = Image.new("RGBA", (cw * len(st["frames"]), ch), (0, 0, 0, 0))
        for i, f in enumerate(st["frames"]):
            strip.paste(f, (i * cw + (cw - f.width) // 2, ch - f.height), f)
        st["img"] = strip
        st["w"], st["h"] = cw, ch

    return strips


def components(img, min_px=40):
    """
    Isolate every sprite as a connected blob of non-transparent pixels.

    The moogle sheet isn't on a usable grid — sprites touch horizontally and the
    rows are different heights — so row/column band detection produces garbage.
    Flood-filling each blob and sorting into reading order is reliable, and the
    resulting index is stable enough to reference frames by number.
    """
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    out = []

    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or px[x0, y0][3] == 0:
                continue
            stack = [(x0, y0)]
            seen[y0][x0] = True
            mnx = mxx = x0
            mny = mxy = y0
            n = 0
            while stack:
                cx, cy = stack.pop()
                n += 1
                mnx, mxx = min(mnx, cx), max(mxx, cx)
                mny, mxy = min(mny, cy), max(mxy, cy)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] != 0:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            if n >= min_px:
                out.append((mnx, mny, mxx + 1, mxy + 1))

    # Reading order: banded by row, then left to right.
    out.sort(key=lambda b: (b[1] // 12, b[0]))
    return out


def build_moogle():
    sheet = dekey(Image.open(MOOGLE_SHEET).convert("RGBA"))
    boxes = components(sheet)
    if max(MOOGLE_FRAMES) >= len(boxes):
        raise SystemExit(
            f"moogle sheet yielded {len(boxes)} sprites; MOOGLE_FRAMES {MOOGLE_FRAMES} is out of range"
        )

    frames = [sheet.crop(boxes[i]) for i in MOOGLE_FRAMES]
    # Uniform cell, bottom-aligned and centred — the CSS hop supplies the
    # vertical motion, so the frames themselves must sit on a common baseline
    # or the hop would fight a baked-in offset.
    cw = max(f.width for f in frames)
    ch = max(f.height for f in frames)
    out = Image.new("RGBA", (cw * 2, ch), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * cw + (cw - f.width) // 2, ch - f.height), f)
    return out, cw, ch, len(boxes)


def build_cursor():
    """
    Extract the select hand from finger-select.webp.

    Two wrinkles this has to handle:

      * The hand's fill is white and so is the background, so a plain colour key
        would hollow the hand out. Background is identified by flood-filling
        white inward from the border instead — interior white is enclosed by the
        black keyline and never reached.

      * WebP is lossy, so the source has ~458 colours where the art has 3.
        Everything is snapped to the nearest palette entry first, otherwise the
        flood fill leaks through half-tone pixels along the keyline.
    """
    img = Image.open(CURSOR).convert("RGBA")
    w, h = img.size
    px = img.load()

    palette = [(0, 0, 0), (167, 169, 173), (255, 255, 255)]

    def snap(p):
        r, g, b, _ = p
        return min(palette, key=lambda c: (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2)

    for y in range(h):
        for x in range(w):
            c = snap(px[x, y])
            px[x, y] = (c[0], c[1], c[2], 255)

    # Flood the background in from every border pixel that is white.
    WHITE = (255, 255, 255, 255)
    stack = []
    for x in range(w):
        stack += [(x, 0), (x, h - 1)]
    for y in range(h):
        stack += [(0, y), (w - 1, y)]

    seen = [[False] * w for _ in range(h)]
    while stack:
        x, y = stack.pop()
        if not (0 <= x < w and 0 <= y < h) or seen[y][x] or px[x, y] != WHITE:
            continue
        seen[y][x] = True
        px[x, y] = (0, 0, 0, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]

    box = img.getbbox()
    if box is None:
        raise SystemExit("finger-select.webp came out empty — the flood fill ate everything")
    img = img.crop(box)

    img, scale = pixelate(img)
    return round_fingertip(img), scale


def round_fingertip(img):
    """
    Round off the pointing finger's squared tip.

    The SOURCE art ends the finger in a flat face: the white fill rows all stop
    at one column, and the next column is a solid black cap running the full
    height of the tip, flush with the bottom outline. At 2x on the send button
    that hard 90-degree face reads as "cut off".

    One pixel of geometry rounds it: the middle fill row pushes INTO the cap
    column and gains a new cap one pixel further out; the fill rows above and
    below keep the old cap as corner steps; and the bottom outline's flush last
    pixel is cleared so the lower corner steps like the upper one. Art surgery,
    so the anatomy is asserted first — if the source sprite ever changes, this
    fails loudly instead of drawing on the wrong pixels.
    """
    w, h = img.size
    px = img.load()
    BLACK = (0, 0, 0, 255)

    # The cap: rightmost column with any opaque pixels — expected all black.
    tip_x = max(x for x in range(w) for y in range(h) if px[x, y][3])
    cap = [y for y in range(h) if px[tip_x, y][3]]
    # The fill: non-black rows one column in.
    fill = [y for y in range(h) if px[tip_x - 1, y][3] and px[tip_x - 1, y][:3] != (0, 0, 0)]

    ok = (cap and fill and 2 <= len(fill) <= 4
          and all(px[tip_x, y][:3] == (0, 0, 0) for y in cap)
          and fill == list(range(fill[0], fill[0] + len(fill)))
          and set(fill) <= set(cap))
    if not ok:
        raise SystemExit(
            f"fingertip anatomy changed (cap rows {cap}, fill rows {fill} at x={tip_x}) — "
            "re-derive round_fingertip")

    mid = fill[len(fill) // 2]
    out = Image.new("RGBA", (w + 1, h), (0, 0, 0, 0))
    out.paste(img, (0, 0))
    opx = out.load()
    opx[tip_x, mid] = px[tip_x - 1, mid]   # apex: fill pushes into the cap column
    opx[tip_x + 1, mid] = BLACK            # and gets its own cap one pixel out
    # Bottom outline runs flush with the cap; clear its last pixel so the lower
    # corner steps too. (The top outline already stops a column short.)
    below = fill[-1] + 1
    if below in cap:
        opx[tip_x, below] = (0, 0, 0, 0)
    return out


def pixelate(img, min_run=4, min_count=3):
    """
    Recover the native pixel grid of an upscaled sprite.

    native_scale()'s modal-run trick works on clean nearest-neighbour upscales
    but not here: lossy ringing along every black/white edge snaps to the grey
    palette entry and leaves 1px bands, which drag the mode down to 1. Two
    changes make it robust:

      * ignore runs shorter than min_run when inferring the cell size, and take
        the *smallest* frequently-occurring run rather than the most common one
        (long runs are whole limbs, not cells);
      * majority-vote every source cell instead of sampling its centre, so a
        stray artifact pixel can't decide the output.

    Also tolerates non-integer scales — 500px / 16 cells is 31.25, so runs
    alternate between 31 and 32 and no single integer divides the image.
    """
    px = img.load()
    runs = Counter()
    for y in range(img.height):
        x = 0
        while x < img.width:
            r = 1
            while x + r < img.width and px[x + r, y] == px[x, y]:
                r += 1
            if r >= min_run:
                runs[r] += 1
            x += r

    frequent = [r for r, c in runs.items() if c >= min_count]
    if not frequent:
        raise SystemExit("couldn't infer a pixel grid — is the source actually upscaled pixel art?")
    cell_px = min(frequent)

    nw = max(1, round(img.width / cell_px))
    nh = max(1, round(img.height / cell_px))

    out = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    dst = out.load()
    for y in range(nh):
        y0 = int(y * img.height / nh)
        y1 = max(y0 + 1, int((y + 1) * img.height / nh))
        for x in range(nw):
            x0 = int(x * img.width / nw)
            x1 = max(x0 + 1, int((x + 1) * img.width / nw))
            votes = Counter(
                px[sx, sy] for sy in range(y0, y1) for sx in range(x0, x1)
            )
            dst[x, y] = votes.most_common(1)[0][0]
    return out, cell_px


def native_scale(img):
    """Infer the upscale factor of a nearest-neighbour enlargement."""
    px = img.load()
    runs = Counter()
    for y in range(img.height):
        x = 0
        while x < img.width:
            r = 1
            while x + r < img.width and px[x + r, y] == px[x, y]:
                r += 1
            runs[r] += 1
            x += r
    return runs.most_common(1)[0][0]


def build_crystal():
    img = Image.open(CRYSTAL).convert("RGBA")
    box = img.getbbox()
    img = img.crop(box)
    scale = native_scale(img)
    w = max(1, round(img.width / scale))
    h = max(1, round(img.height / scale))
    # Sample the centre of each source cell rather than resizing, so no edge
    # pixel gets averaged or dropped.
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    src = img.load()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            sx = min(img.width - 1, int((x + 0.5) * img.width / w))
            sy = min(img.height - 1, int((y + 0.5) * img.height / h))
            dst[x, y] = src[sx, sy]
    return out, scale


def data_uri(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    raw = buf.getvalue()
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii"), len(raw)


def main():
    if SHEET is None or not SHEET.exists():
        raise SystemExit("no '*Battle Sprites*.png' found in sources/sprites/")
    if not CRYSTAL.exists():
        raise SystemExit("crystal.png not found in sources/sprites/")
    if not CURSOR.exists():
        raise SystemExit("finger-select.webp not found in sources/sprites/")

    if MOOGLE_SHEET is None or not MOOGLE_SHEET.exists():
        raise SystemExit("no '*Mog.png' found in sources/sprites/")

    party, frame_w, frame_h, cw, chars = build_party()
    party_uri, party_bytes = data_uri(party)

    (ROOT / "sprites/party.css").write_text(
        f"""/* GENERATED by tools/rip-assets.py — do not edit by hand.
   Source: {SHEET.name}
   Party: {', '.join(c['name'] for c in chars)} (rows {', '.join(str(r + 1) for r, _ in PARTY_ROWS)},
   idle columns {IDLE_FRAMES[0] + 1} and {IDLE_FRAMES[1] + 1}).
   Frame {frame_w}x{frame_h}px, cell {cw}x{frame_h}. Consumers set
   background-size: 200% 100% and step background-position-x 0% -> 100%.

   Re-run `node tools/sprites.mjs` to go back to the hand-drawn party. */

:root {{
  --yume-party-sprite: url("{party_uri}");
  --yume-party-frame-w: {frame_w};
  --yume-party-frame-h: {frame_h};
}}
""",
        encoding="utf8",
    )

    crystal, scale = build_crystal()
    crystal_uri, crystal_bytes = data_uri(crystal)

    (ROOT / "sprites/crystal.css").write_text(
        f"""/* GENERATED by tools/rip-assets.py — do not edit by hand.
   Source: {CRYSTAL.name} ({scale}x upscale, resampled to {crystal.width}x{crystal.height} native).
   Aspect is {crystal.width}:{crystal.height} — scale it by integers only. */

:root {{
  --yume-ff-crystal: url("{crystal_uri}");
  --yume-ff-crystal-w: {crystal.width};
  --yume-ff-crystal-h: {crystal.height};
}}
""",
        encoding="utf8",
    )

    cursor, cur_scale = build_cursor()
    cursor_uri, cursor_bytes = data_uri(cursor)
    (ROOT / "sprites/cursor.css").write_text(
        f"""/* GENERATED by tools/rip-assets.py — do not edit by hand.
   Source: {CURSOR.name} ({cur_scale}x upscale, resampled to
   {cursor.width}x{cursor.height} native). Points RIGHT; mirror with
   scaleX(-1) where a left-pointing hand reads better.

   Re-run `node tools/cursor.mjs` to go back to the drawn hand. */

:root {{
  --yume-ff-cursor: url("{cursor_uri}");
  --yume-ff-cursor-w: {cursor.width};
  --yume-ff-cursor-h: {cursor.height};
}}
""",
        encoding="utf8",
    )
    cursor.save(ROOT / "sprites/cursor.png")

    moogle, mw, mh, n_sprites = build_moogle()
    moogle_uri, moogle_bytes = data_uri(moogle)
    (ROOT / "sprites/moogle.css").write_text(
        f"""/* GENERATED by tools/rip-assets.py — do not edit by hand.
   Source: {MOOGLE_SHEET.name} (sprites {MOOGLE_FRAMES[0]} and {MOOGLE_FRAMES[1]} of
   {n_sprites} isolated by connected-component labelling).
   Frame {mw}x{mh}. Consumers set background-size: 200% 100% and step
   background-position-x 0% -> 100%; the hop is a CSS transform, not baked in. */

:root {{
  --yume-ff-moogle: url("{moogle_uri}");
  --yume-ff-moogle-w: {mw};
  --yume-ff-moogle-h: {mh};
}}
""",
        encoding="utf8",
    )
    moogle.save(ROOT / "sprites/moogle.png")

    strips = build_party_strips()
    strip_css = []
    for i, st in enumerate(strips):
        uri, _ = data_uri(st["img"])
        strip_css.append(f'  --yume-party-{i}: url("{uri}");')
    cw = max(st["w"] for st in strips)
    ch = max(st["h"] for st in strips)
    (ROOT / "sprites/party-strips.css").write_text(
        "/* GENERATED by tools/rip-assets.py — do not edit by hand.\n"
        f"   One strip per party member, {len(POSE_FRAMES)} frames each\n"
        f"   (idle pair + {len(POSE_FRAMES) - 2} click poses), cell {cw}x{ch}.\n"
        "   content.js injects one element per strip so each can animate alone. */\n\n"
        ":root {\n" + "\n".join(strip_css) + "\n"
        f"  --yume-party-count: {len(strips)};\n"
        f"  --yume-party-poses: {len(POSE_FRAMES)};\n"
        f"  --yume-party-cell-w: {cw};\n"
        f"  --yume-party-cell-h: {ch};\n}}\n",
        encoding="utf8",
    )
    for st in strips:
        st["img"].save(ROOT / f"sprites/party-{st['name']}.png")
    print(f"strips  {len(strips)} x {len(POSE_FRAMES)} poses, cell {cw}x{ch}")

    party.save(ROOT / "sprites/party.png")
    crystal.save(ROOT / "sprites/crystal-native.png")

    print(f"party   {party.width}x{party.height}  frame {frame_w}x{frame_h}  cell {cw}x{frame_h}  ({party_bytes}b png)")
    for c in chars:
        print(f"          {c['name']:<12} {c['w']}x{c['h']}")
    print(f"crystal {crystal.width}x{crystal.height} native (from {scale}x upscale, {crystal_bytes}b png)")
    print(f"cursor  {cursor.width}x{cursor.height} native (from {cur_scale}x upscale, {cursor_bytes}b png)")
    print(f"moogle  {mw}x{mh} x2 frames {MOOGLE_FRAMES} of {n_sprites} ({moogle_bytes}b png)")


if __name__ == "__main__":
    main()
