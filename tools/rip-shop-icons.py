#!/usr/bin/env python3
"""Yume Forge — extract the Recents equipment icons from shop-items.png.

    python3 tools/rip-shop-icons.py

Input: sources/sprites/shop-items.png — an FF item-icon sheet with real alpha
(the icons are pre-cut), plus a magenta (255,0,220) panel region on the right
holding unrelated cursor sprites. The magenta is keyed out and components are
detected on alpha, clustered into reading order exactly like the other rippers.

Output: sprites/shop-icons.css with --yume-shop-0..7 — the eight icons the
Recents rows cycle through (rows are assigned 8n+1..8n+8 in the theme). These
supersede the AI-generated --yume-gear-* set; the gear vars stay defined but
unreferenced.

The picks are BY INDEX into reading order, so the count is asserted: a
different sheet fails loudly here rather than silently shipping the wrong art.
"""

import base64
import io
import json
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "sources/sprites/shop-items.png"
OUT = ROOT / "sprites/shop-icons.css"

EXPECT_ITEMS = 51

# Reading-order component index -> recents slot, chosen to keep each slot's
# meaning from the previous set where an equivalent exists (sword, axe, shield,
# staff, helm) and to upgrade the rest to proper equipment.
# Nav replacements from the same sheet: component index -> emitted var name.
# The blue-hooded mage head takes over the sidebar's Artifacts row.
NAV_PICKS = [
    (5, "nav-artifacts"),
    (3, "nav-more"),      # the frog — the code tab's "More" row
    (11, "icon-bolt"),      # Routines (replaces Anthropicons U+E098)
    (2, "icon-hourglass"),  # Dispatch (U+E05E)
    (47, "icon-star"),      # Customize sidebar (U+E0D6)
    (45, "icon-bag"),       # money pouch — chatgpt profile row trailing glyph
]

PICKS = [
    (17, "sword"),
    (20, "axe"),
    (31, "shield"),
    (22, "staff"),
    (33, "armor"),
    (19, "hammer"),
    (32, "helm"),
    (34, "gauntlet"),
]

MIN_PX = 40
ALPHA_MIN = 40


def main():
    img = Image.open(SRC).convert("RGBA")
    px = img.load()
    w, h = img.size

    # Key out the magenta panels; the icons themselves carry real alpha.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and abs(r - 255) <= 12 and abs(g - 0) <= 12 and abs(b - 220) <= 12:
                px[x, y] = (0, 0, 0, 0)

    seen = [[False] * w for _ in range(h)]
    boxes = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or px[x0, y0][3] < ALPHA_MIN:
                continue
            q = deque([(x0, y0)])
            seen[y0][x0] = True
            mnx = mxx = x0
            mny = mxy = y0
            n = 0
            while q:
                cx, cy = q.popleft()
                n += 1
                mnx, mxx = min(mnx, cx), max(mxx, cx)
                mny, mxy = min(mny, cy), max(mxy, cy)
                for dx in (-2, -1, 0, 1, 2):
                    for dy in (-2, -1, 0, 1, 2):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] >= ALPHA_MIN:
                            seen[ny][nx] = True
                            q.append((nx, ny))
            if n >= MIN_PX:
                boxes.append((mnx, mny, mxx + 1, mxy + 1))

    # Reading order: cluster on vertical centres, then left to right.
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows, cur = [], [boxes[0]]
    for b in boxes[1:]:
        if abs((b[1] + b[3]) / 2 - (cur[-1][1] + cur[-1][3]) / 2) <= 14:
            cur.append(b)
        else:
            rows.append(cur)
            cur = [b]
    rows.append(cur)
    ordered = []
    for r in rows:
        ordered.extend(sorted(r, key=lambda b: b[0]))

    if len(ordered) != EXPECT_ITEMS:
        raise SystemExit(
            f"expected {EXPECT_ITEMS} components in {SRC.name}, found {len(ordered)} — "
            "the sheet changed; re-derive the PICKS indices before regenerating."
        )

    lines, total = [], 0
    for idx, name in NAV_PICKS:
        icon = img.crop(ordered[idx])
        buf = io.BytesIO()
        icon.save(buf, format="PNG", optimize=True)
        raw = buf.getvalue()
        total += len(raw)
        uri = "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
        lines.append(f'  --yume-shop-{name}: url("{uri}");   /* {name} */')
        print(f"  shop/{name:<13} {icon.width}x{icon.height}  ({len(raw)}b)")
    for slot, (idx, name) in enumerate(PICKS):
        icon = img.crop(ordered[idx])
        buf = io.BytesIO()
        icon.save(buf, format="PNG", optimize=True)
        raw = buf.getvalue()
        total += len(raw)
        uri = "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
        lines.append(f'  --yume-shop-{slot}: url("{uri}");   /* {name} */')
        print(f"  shop/{name:<9} {icon.width}x{icon.height}  ({len(raw)}b)")

    OUT.write_text(
        "/* GENERATED by tools/rip-shop-icons.py — do not edit by hand.\n"
        "   Eight equipment icons for the Recents rows, cut from shop-items.png\n"
        "   (real alpha; magenta cursor panels keyed out). Order matches the\n"
        "   8n+1..8n+8 row assignment in the theme. */\n\n"
        ":root {\n" + "\n".join(lines) + "\n}\n",
        encoding="utf8",
    )
    print(f"wrote sprites/shop-icons.css ({total}b of png)")


if __name__ == "__main__":
    main()
