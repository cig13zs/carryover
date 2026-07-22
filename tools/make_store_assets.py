"""Generate Chrome Web Store listing images for Carryover.

Sizes are fixed by Google: screenshots 1280x800, small promo tile 440x280.
Everything is drawn here rather than screenshotted so the output is exact and
reproducible, and so no third-party logo or brand colour can sneak in.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "store-assets")
BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
REG  = r"C:\Windows\Fonts\segoeui.ttf"
MONO = r"C:\Windows\Fonts\consola.ttf"

INK, MUTED, BG, PANEL, LINE = "#18181b", "#5d5d66", "#fbfbfa", "#ffffff", "#e6e6e3"
PILL_BG, PILL_INK, GREEN = "#18181b", "#fafafa", "#4ade80"

def f(path, size):
    return ImageFont.truetype(path, size)

def w(d, text, font):
    return d.textbbox((0, 0), text, font=font)[2]

def pill(d, x, y, tokens="~38.2k", pct=39, scale=1.0, draw=True):
    """The extension's actual pill, drawn to match the real UI."""
    fs   = int(19 * scale)
    font = f(REG, fs)
    btnf = f(BOLD, fs)
    label = tokens + "  ·  " + str(pct) + "%"
    pad, gap = int(18 * scale), int(15 * scale)
    bw   = w(d, "Carry over", btnf) + int(34 * scale)
    barw = int(58 * scale)
    h    = int(52 * scale)
    total = pad + w(d, label, font) + gap + barw + gap + bw + int(12 * scale)
    if not draw:
        return total
    d.rounded_rectangle([x, y, x + total, y + h], radius=h // 2, fill=PILL_BG)
    cx = x + pad
    d.text((cx, y + h // 2), label, font=font, fill=PILL_INK, anchor="lm")
    cx += w(d, label, font) + gap
    bh, by = int(6 * scale), y + h // 2 - int(3 * scale)
    d.rounded_rectangle([cx, by, cx + barw, by + bh], radius=bh // 2, fill="#3f3f46")
    d.rounded_rectangle([cx, by, cx + int(barw * pct / 100), by + bh], radius=bh // 2, fill=GREEN)
    cx += barw + gap
    d.rounded_rectangle([cx, y + int(8 * scale), cx + bw, y + h - int(8 * scale)],
                        radius=(h - int(16 * scale)) // 2, fill=PILL_INK)
    d.text((cx + bw // 2, y + h // 2), "Carry over", font=btnf, fill=PILL_BG, anchor="mm")
    d.text((x + total + int(16 * scale), y + h // 2), "♥", font=f(REG, int(20 * scale)),
           fill="#c9c9cf", anchor="lm")
    return total

def base(title, sub):
    img = Image.new("RGB", (1280, 800), BG)
    d = ImageDraw.Draw(img)
    d.text((80, 92), title, font=f(BOLD, 54), fill=INK)
    d.text((80, 168), sub, font=f(REG, 26), fill=MUTED)
    return img, d

def shot_pill(site):
    img, d = base("See how full your chat is getting",
                  "A quiet pill in the corner. No tab to open, nothing to sign into.")
    d.rounded_rectangle([80, 260, 1200, 700], radius=18, fill=PANEL, outline=LINE, width=2)
    d.rounded_rectangle([80, 260, 1200, 322], radius=18, fill="#f4f4f2", outline=LINE, width=2)
    d.rectangle([80, 300, 1200, 322], fill="#f4f4f2")
    for i, c in enumerate(["#e0e0dd", "#e0e0dd", "#e0e0dd"]):
        d.ellipse([108 + i * 22, 282, 120 + i * 22, 294], fill=c)
    d.text((196, 291), site, font=f(REG, 17), fill=MUTED, anchor="lm")
    for i, ln in enumerate([620, 900, 760, 540]):
        yy = 370 + i * 62
        d.rounded_rectangle([120, yy, 120 + ln, yy + 26], radius=8, fill="#eeeeec")
    total = pill(d, 0, 0, draw=False)
    pill(d, 1160 - total, 610)
    return img

def shot_panel():
    img, d = base("Then move it into a new chat",
                  "It shows you the handoff before you paste it, and you can trim it first.")
    d.rounded_rectangle([80, 260, 1200, 720], radius=18, fill="#1c1c20")
    d.text((116, 300), "12 messages  ·  ~6.4k tokens in the handoff",
           font=f(REG, 19), fill="#a1a1aa")
    d.rounded_rectangle([116, 340, 1164, 660], radius=12, fill="#111114")
    lines = [
        ("# Context handoff", "#e7e7ea"),
        ("", None),
        ("Source: " + "ChatGPT" + "  ·  12 messages  ·  ~6.4k tokens (estimated)", "#8b8b93"),
        ("", None),
        ("## What we were working on", "#e7e7ea"),
        ("Build a Chrome extension that tracks context usage.", "#b9b9c0"),
        ("", None),
        ("## Decisions and constraints", "#e7e7ea"),
        ("- The problem was hashed class names, so we decided to", "#b9b9c0"),
        ("  use a structural reader instead of fixed selectors.", "#b9b9c0"),
        ("- Never use innerHTML for this, it has to stay XSS-safe.", "#b9b9c0"),
    ]
    yy = 362
    for text, col in lines:
        if text:
            d.text((140, yy), text, font=f(MONO, 17), fill=col)
        yy += 26
    for i, (lbl, fill, tcol) in enumerate([("Copy", "#fafafa", "#18181b"),
                                           ("Save .md", None, "#fafafa")]):
        bx = 116 + i * 122
        if fill:
            d.rounded_rectangle([bx, 678, bx + 104, 706], radius=14, fill=fill)
        else:
            d.rounded_rectangle([bx, 678, bx + 118, 706], radius=14, outline="#4b4b52", width=2)
        d.text((bx + (52 if fill else 59), 692), lbl, font=f(BOLD, 16), fill=tcol, anchor="mm")
    d.text((1164, 692), "Ko-fi", font=f(REG, 16), fill="#8b8b93", anchor="rm")
    return img

def shot_privacy():
    img, d = base("It cannot leak your conversations",
                  "Not a promise about how the data is handled. There is no data and no connection.")
    items = [
        ("No network requests", "No server, no API key, no analytics, no telemetry."),
        ("No declared permissions", "No permissions key and no host_permissions key in the manifest."),
        ("No remote code, no dependencies", "Two files. You can read the whole thing in a few minutes."),
        ("Nothing is generated", "The handoff is extracted from text already on the page, so it\ncannot invent a decision you never made."),
    ]
    yy = 268
    for head, body in items:
        h = 118 if "\n" in body else 96
        d.rounded_rectangle([80, yy, 1200, yy + h], radius=14, fill=PANEL, outline=LINE, width=2)
        d.ellipse([116, yy + 34, 140, yy + 58], outline=GREEN, width=3)
        d.line([122, yy + 46, 127, yy + 52], fill=GREEN, width=3)
        d.line([127, yy + 52, 135, yy + 40], fill=GREEN, width=3)
        d.text((166, yy + 26), head, font=f(BOLD, 25), fill=INK)
        d.multiline_text((166, yy + 60), body, font=f(REG, 19), fill=MUTED, spacing=6)
        yy += h + 14
    return img

def promo_tile():
    img = Image.new("RGB", (440, 280), BG)
    d = ImageDraw.Draw(img)
    d.text((36, 44), "Carryover", font=f(BOLD, 44), fill=INK)
    d.multiline_text((36, 104), "See how full an AI chat is,\nthen carry it into a new one.",
                     font=f(REG, 19), fill=MUTED, spacing=7)
    pill(d, 36, 196, scale=0.62)
    # ponytail: no emoji here. Pillow renders Segoe UI emoji as tofu boxes, and a
    # missing glyph on the store tile looks broken rather than minimal.
    d.rounded_rectangle([300, 44, 404, 74], radius=15, fill="#dcfce7")
    d.text((352, 59), "FREE", font=f(BOLD, 15), fill="#16a34a", anchor="mm")
    return img

SITES = {"chatgpt": "chatgpt.com", "deepseek": "chat.deepseek.com", "grok": "grok.com"}

def main():
    os.makedirs(OUT, exist_ok=True)
    made = []
    for key, host in SITES.items():
        d = os.path.join(OUT, key)
        os.makedirs(d, exist_ok=True)
        for name, img in [("01-pill", shot_pill(host)),
                          ("02-handoff", shot_panel()),
                          ("03-privacy", shot_privacy())]:
            p = os.path.join(d, name + ".png")
            img.save(p)
            made.append((p, img.size))
        p = os.path.join(d, "promo-440x280.png")
        promo_tile().save(p)
        made.append((p, (440, 280)))
    ok = True
    for p, size in made:
        real = Image.open(p).size
        good = real in ((1280, 800), (440, 280)) and real == size
        ok = ok and good
        print(("OK  " if good else "BAD ") + str(real) + "  " + os.path.relpath(p, OUT))
    print("ALL SIZES VALID" if ok else "SIZE MISMATCH")

main()