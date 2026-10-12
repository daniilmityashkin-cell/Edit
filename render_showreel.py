#!/usr/bin/env python3
"""Showreel: 4 vertical videos in phone-like cards on a grid, with intro, bobbing and carousel.

Usage: python3 render_showreel.py [out.mp4]
All look/timing parameters are in the CONFIG block below.
"""
import glob
import math
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------------- CONFIG ----------------
CAPTION = "ТГ:@noirout"
OUT = sys.argv[1] if len(sys.argv) > 1 else "showreel.mp4"
W, H, FPS, DUR = 1920, 1080, 30, 14.0
CW, CH, RADIUS, GAP = 420, 747, 58, 36        # card size, corner radius, gap
CARD_Y = 215                                   # top of the card row
BOB_AMP, BOB_PERIOD = 14, 3.2                  # vertical float of cards
INTRO_DELAY, INTRO_DUR, INTRO_STAGGER = 0.2, 1.5, 0.14
STEPS = [6.0, 9.0, 12.0]                       # carousel shifts (seconds)
STEP_DUR = 1.1
BG, GRID, GRID_STEP = (236, 236, 236), (214, 214, 214), 48
FONT = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
VIDEOS = sorted(glob.glob("/home/user/Edit/*.mp4"))
# ----------------------------------------

P = CW + GAP
X0 = (W - (4 * P - GAP)) // 2
NFR = int(DUR * FPS)


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 4


def ease_io(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * x * (x * (x * 6 - 15) + 10)


def load(path, n):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-t", str(n / FPS + 0.5),
           "-vf", f"fps={FPS},scale={CW}:{CH}:force_original_aspect_ratio=increase,crop={CW}:{CH}",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    fs = CW * CH * 3
    return np.frombuffer(raw, np.uint8)[: len(raw) // fs * fs].reshape(-1, CH, CW, 3)


def rounded_mask(scale=4):
    m = Image.new("L", (CW * scale, CH * scale), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, CW * scale - 1, CH * scale - 1], RADIUS * scale, fill=255)
    return m.resize((CW, CH), Image.LANCZOS)


def background():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for x in range(0, W, GRID_STEP):
        d.line([(x, 0), (x, H)], fill=GRID, width=1)
    for y in range(0, H, GRID_STEP):
        d.line([(0, y), (W, y)], fill=GRID, width=1)
    font = ImageFont.truetype(FONT, 52)
    tw = d.textlength(CAPTION, font=font)
    d.text(((W - tw) / 2, 52), CAPTION, font=font, fill=(40, 40, 40))
    return img


def shadow_sprite(mask):
    pad = 60
    s = Image.new("L", (CW + 2 * pad, CH + 2 * pad), 0)
    s.paste(mask.point(lambda v: int(v * 0.35)), (pad, pad + 14))
    return s.filter(ImageFilter.GaussianBlur(26)), pad


def paste(canvas, sprite_rgb, mask, x, y, alpha=1.0, blur=0.0, scale=1.0):
    sp = Image.fromarray(sprite_rgb)
    m = mask
    if scale != 1.0:
        w, h = int(CW * scale), int(CH * scale)
        sp, m = sp.resize((w, h), Image.BILINEAR), m.resize((w, h), Image.BILINEAR)
        x += (CW - w) / 2
        y += (CH - h) / 2
    if blur > 0.5:
        pad = int(blur * 2)
        big = Image.new("RGB", (sp.width + 2 * pad, sp.height + 2 * pad))
        big.paste(sp, (pad, pad))
        bm = Image.new("L", big.size, 0)
        bm.paste(m, (pad, pad))
        k = ImageFilter.BoxBlur(blur)
        # horizontal-ish motion blur: blur then keep the sharp core mixed in
        sp = Image.blend(big.filter(k), big, 0.25)
        m = bm.filter(k)
        x -= pad
        y -= pad
    if alpha < 1.0:
        m = m.point(lambda v: int(v * alpha))
    canvas.paste(sp, (int(round(x)), int(round(y))), m)


def shift_at(t):
    s = 0.0
    for st in STEPS:
        s += ease_io((t - st) / STEP_DUR)
    return s


def main():
    print(f"videos: {VIDEOS}", file=sys.stderr)
    need = NFR + int(FPS * 6)
    clips = [load(v, need) for v in VIDEOS]
    nv = len(clips)
    mask = rounded_mask()
    shadow, pad = shadow_sprite(mask)
    bg = background()

    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT],
        stdin=subprocess.PIPE)

    for f in range(NFR):
        t = f / FPS
        canvas = bg.copy()
        s = shift_at(t)
        for n in range(-2, 8):                       # strip card n, video n % nv
            slot = n - s
            if slot < -1.6 or slot > 4.6:
                continue
            i = n % nv
            x = X0 + slot * P
            # intro only for the initial 4 cards
            alpha, blur, scale = 1.0, 0.0, 1.0
            if 0 <= n < 4:
                p = (t - INTRO_DELAY - n * INTRO_STAGGER) / INTRO_DUR
                e = ease_out(p)
                x += (1 - e) * (W - x + 80)
                alpha = min(1.0, max(0.0, p * 3))
                scale = 0.9 + 0.1 * e
                blur = (1 - e) ** 2 * 38
            if alpha <= 0:
                continue
            # motion blur during carousel steps
            for st in STEPS:
                q = (t - st) / STEP_DUR
                if 0 < q < 1:
                    blur = max(blur, math.sin(math.pi * q) * 14)
            bob = BOB_AMP * math.sin(2 * math.pi * (t / BOB_PERIOD) + n * 1.3)
            y = CARD_Y + bob
            if x < -CW * 1.5 or x > W + 50:
                continue
            # soft shadow
            canvas.paste((0, 0, 0), (int(x) - pad, int(y) - pad), shadow.point(lambda v: int(v * alpha)))
            fr = clips[i][min(f + (n // nv) * 90 + (0 if n >= 0 else 0), len(clips[i]) - 1)]
            paste(canvas, fr, mask, x, y, alpha, blur, scale)
        enc.stdin.write(np.asarray(canvas).tobytes())
        if f % 60 == 0:
            print(f"frame {f}/{NFR}", file=sys.stderr)
    enc.stdin.close()
    enc.wait()


if __name__ == "__main__":
    main()
