#!/usr/bin/env python3
"""Yume Forge — extract the sidebar nav icons from nav-icons.png.

    python3 tools/rip-nav-icons.py

Input is an AI-generated pixel-art sheet: a 3x2 grid of icons on a flat pink
background, at ~1254px with 86k colours. It looks like pixel art but isn't —
every "pixel" is a soft block with gradients and ringing, so it has to be
re-quantised onto a real grid or it renders as mush at 24px.

Pipeline, in order, each step earning its place:

  1. key the pink by distance, generously — the background bleeds into the
     outlines and a strict match leaves a halo
  2. split into 6 sprites by connected component, sorted reading order
  3. infer each sprite's native cell size from its modal run length, ignoring
     short runs (those are ringing, not real pixels)
  4. majority-vote each cell rather than sampling its centre, so one stray
     artifact pixel can't decide an output pixel
  5. snap to a small palette so the result reads as pixel art rather than as a
     photograph of pixel art

Output: sprites/nav-icons.css with --yume-nav-0 .. --yume-nav-5, in the order
the sidebar rows appear (New, Chats and tasks, Projects, Artifacts, Scheduled,
Customize).
"""

import base64
import io
from collections import Counter, deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# Two sheets, each a flat-pink grid. Names are in the order the rows appear.
SHEETS = [
    (ROOT / "sources/sprites/nav-icons.png", "nav",
     ["new", "chats", "projects", "artifacts", "scheduled", "customize"]),
    (ROOT / "sources/sprites/tray-icons.png", "tray",
     ["brush", "palette", "potion"]),
    (ROOT / "sources/sprites/gear-icons.png", "gear",
     ["sword", "axe", "shield", "staff", "flask", "boots", "helm", "gloves"]),
]

BG_TOL = 78          # generous: the pink bleeds into the black keylines

# The theme is blue and gold; snapping to this keeps the set coherent and kills
# the AI gradients. Ordered light -> dark within each hue family.
PALETTE = [
    (0, 0, 0, 0),
    (13, 14, 32, 255),      # keyline
    (255, 255, 255, 255),   # white
    (222, 232, 255, 255),   # pale
    (255, 215, 94, 255),    # gold
    (198, 150, 40, 255),    # gold shade
    (79, 118, 232, 255),    # blue light
    (42, 74, 190, 255),     # blue
    (24, 40, 118, 255),     # blue dark
    (110, 205, 120, 255),   # green
    (168, 118, 226, 255),   # purple
    (214, 66, 60, 255),      # red
    (214, 170, 110, 255),    # wood / palette board
    (150, 110, 66, 255),     # wood shade
    (176, 214, 236, 255),    # glass
]


def keyed(img):
    """Key out the sheet's own background colour.

    The pink differs slightly per sheet (250,90,163 vs 249,82,165 vs 250,3,162),
    so it is measured rather than hardcoded — a fixed value leaves a halo on the
    sheets that don't match it.
    """
    BG = Counter(img.getdata()).most_common(1)[0][0][:3]
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2]) < BG_TOL:
                px[x, y] = (0, 0, 0, 0)
    return img


def components(img, min_px=400):
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    out = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or px[x0, y0][3] == 0:
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
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] != 0:
                            seen[ny][nx] = True
                            q.append((nx, ny))
            if n >= min_px:
                out.append((mnx, mny, mxx + 1, mxy + 1))
    # Reading order. Banding by a fixed fraction of sheet height mis-sorted a
    # single row of icons with differing heights — a tall one and a short one
    # landed either side of a band edge and came out in the wrong order. Cluster
    # on vertical CENTRES with a tolerance of half the median icon height, which
    # holds for one row or several.
    if not out:
        return out
    heights = sorted(b[3] - b[1] for b in out)
    tol = max(8, heights[len(heights) // 2] // 2)

    # Sort by vertical centre FIRST, then walk that order clustering into rows.
    # Seeding the cluster from the unsorted list while iterating the sorted one
    # put the seed in the wrong row and shifted every icon by one.
    by_centre = sorted(out, key=lambda b: (b[1] + b[3]) / 2)
    rows, cur = [], [by_centre[0]]
    for b in by_centre[1:]:
        cy = (b[1] + b[3]) / 2
        ref = (cur[-1][1] + cur[-1][3]) / 2
        if abs(cy - ref) <= tol:
            cur.append(b)
        else:
            rows.append(cur)
            cur = [b]
    rows.append(cur)

    ordered = []
    for r in rows:
        ordered.extend(sorted(r, key=lambda b: b[0]))
    return ordered


def snap(px):
    r, g, b, a = px
    if a < 110:
        return (0, 0, 0, 0)
    best, bd = PALETTE[1], 1 << 30
    for c in PALETTE[1:]:
        d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2
        if d < bd:
            bd, best = d, c
    return best


def cell_size(img, min_run=6, min_count=3):
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
    freq = [r for r, c in runs.items() if c >= min_count]
    return min(freq) if freq else max(1, img.width // 20)


def pixelate(img):
    cell = cell_size(img)
    nw = max(1, round(img.width / cell))
    nh = max(1, round(img.height / cell))
    src = img.load()
    out = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    dst = out.load()
    for y in range(nh):
        y0, y1 = int(y * img.height / nh), max(int(y * img.height / nh) + 1, int((y + 1) * img.height / nh))
        for x in range(nw):
            x0, x1 = int(x * img.width / nw), max(int(x * img.width / nw) + 1, int((x + 1) * img.width / nw))
            votes = Counter(snap(src[sx, sy]) for sy in range(y0, y1) for sx in range(x0, x1))
            dst[x, y] = votes.most_common(1)[0][0]
    return out, cell


def data_uri(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    raw = buf.getvalue()
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii"), len(raw)


def main():
    # The source sheets are build inputs and are deliberately NOT shipped in
    # yume-forge-modified.zip (they are 3.3MB and the art is already baked into the
    # generated CSS as data URIs). Running this script without them used to
    # print three "skip" lines, exit 0, and then unconditionally overwrite
    # sprites/nav-icons.css with an empty :root — wiping all 17 nav/tray/gear
    # variables. Nothing errored; the sidebar icons just silently stopped
    # drawing, and the inputs needed to regenerate them were not in the zip.
    #
    # Bail out before touching anything, the way tools/rip-assets.py does.
    missing = [src.name for src, _, _ in SHEETS if not src.exists()]
    if len(missing) == len(SHEETS):
        raise SystemExit(
            "none of the source sheets are present in sources/sprites/:\n  "
            + "\n  ".join(missing)
            + "\n\nThese are build inputs, excluded from the shareable zip. "
              "sprites/nav-icons.css is already generated and checked in — "
              "nothing to do unless you are changing the art."
        )

    lines, total = [], 0
    for src, prefix, names in SHEETS:
        if not src.exists():
            # A PARTIAL run would drop that sheet's variables from the output,
            # which is the same silent breakage in miniature.
            raise SystemExit(
                f"{src.name} is missing, but the other sheets are present.\n"
                "Refusing to write a partial sprites/nav-icons.css — it would "
                "drop every variable from this sheet."
            )
        sheet = keyed(Image.open(src).convert("RGBA"))
        boxes = components(sheet)
        if len(boxes) != len(names):
            print(f"warning: {src.name} yielded {len(boxes)} sprites, expected {len(names)}")
        for i, box in enumerate(boxes[: len(names)]):
            icon, cell = pixelate(sheet.crop(box))
            uri, size = data_uri(icon)
            total += size
            lines.append(f'  --yume-{prefix}-{i}: url("{uri}");   /* {names[i]} */')
            icon.save(ROOT / f"sprites/{prefix}-{names[i]}.png")
            print(f"  {prefix}/{names[i]:<11} {icon.width}x{icon.height}  (cell {cell}px, {size}b)")

    (ROOT / "sprites/nav-icons.css").write_text(
        "/* GENERATED by tools/rip-nav-icons.py — do not edit by hand.\n"
        "   Sheets re-quantised onto their real pixel grid; order matches the\n"
        "   rows they belong to. */\n\n"
        ":root {\n" + "\n".join(lines) + "\n}\n",
        encoding="utf8",
    )
    print(f"wrote sprites/nav-icons.css ({total}b of png)")


if __name__ == "__main__":
    main()
