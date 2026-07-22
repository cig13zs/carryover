"""Generate Carryover extension icons: dark rounded square + white hopping arrow.

Draws at 4x then downsamples with LANCZOS so edges stay clean at 16px.
Run: python tools\\make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "icons"
SIZES = [16, 32, 48, 128]
SCALE = 4
BG = (0x18, 0x18, 0x1B, 255)
FG = (255, 255, 255, 255)


def draw_icon(size: int) -> Image.Image:
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # dark rounded-square background, generous margin
    pad = s * 0.06
    d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=s * 0.22, fill=BG)

    # a thick white arrow that hops: two short strokes rising left-to-right
    # then a longer stroke pointing right, like a bouncing hop-to-next-place.
    w = s * 0.13  # stroke width — thick, legible at 16px

    cx, cy = s * 0.5, s * 0.5
    # hop 1: short low stroke (bottom-left)
    p1a = (s * 0.24, s * 0.62)
    p1b = (s * 0.42, s * 0.46)
    # hop 2: short mid stroke
    p2a = (s * 0.42, s * 0.46)
    p2b = (s * 0.58, s * 0.34)
    # final stroke: longer, pointing toward the arrowhead
    p3a = (s * 0.58, s * 0.34)
    p3b = (s * 0.78, s * 0.34)

    for a, b in ((p1a, p1b), (p2a, p2b), (p3a, p3b)):
        d.line([a, b], fill=FG, width=int(w), joint="curve")
    # round the joints/ends so the hops read as one continuous curve
    for pt in (p1a, p1b, p2b, p3a, p3b):
        r = w / 2
        d.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=FG)

    # arrowhead at the end, pointing right
    tip = (s * 0.86, s * 0.34)
    head_w = w * 1.9
    d.polygon([
        tip,
        (tip[0] - head_w * 1.1, tip[1] - head_w * 0.85),
        (tip[0] - head_w * 1.1, tip[1] + head_w * 0.85),
    ], fill=FG)

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        icon = draw_icon(size)
        out_path = OUT_DIR / f"icon{size}.png"
        icon.save(out_path)
        print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
