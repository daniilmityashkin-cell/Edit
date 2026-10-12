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
BG = (8, 8, 11)
GLOWS = [(0.28, 0.30, 780, (78, 46, 120), 0.85),   # (x, y, radius px, rgb, strength)
         (0.76, 0.88, 820, (120, 64, 28), 0.70),
         (0.62, 0.05, 600, (30, 52, 96), 0.55)]
BG_DRIFT = 110                                   # px of slow horizontal glow drift
CAPTION_COLOR = (238, 238, 240)
AUDIO = True
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
    """Dark gradient with soft coloured glows + film grain, wider than the frame so it can drift."""
    bw = W + 2 * BG_DRIFT
    yy, xx = np.mgrid[0:H, 0:bw].astype(np.float32)
    img = np.empty((H, bw, 3), np.float32)
    img[:] = BG
    for gx, gy, r, col, k in GLOWS:
        d2 = ((xx - (gx * W + BG_DRIFT)) ** 2 + (yy - gy * H) ** 2) / (r * r)
        a = (np.exp(-d2 * 1.6) * k)[..., None]
        img += a * np.array(col, np.float32)
    vig = 1 - 0.35 * (((xx - bw / 2) / (bw / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / 2
    img *= vig[..., None]
    rng = np.random.default_rng(7)
    img += rng.normal(0, 2.2, (H, bw, 1)).astype(np.float32)
    return np.clip(img, 0, 255).astype(np.uint8)


def bg_frame(bg, t, font):
    ox = int(BG_DRIFT + BG_DRIFT * 0.9 * math.sin(2 * math.pi * t / 9.0))
    img = Image.fromarray(np.ascontiguousarray(bg[:, ox:ox + W]))
    d = ImageDraw.Draw(img)
    tw = d.textlength(CAPTION, font=font)
    d.text(((W - tw) / 2, 52), CAPTION, font=font, fill=CAPTION_COLOR)
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


# ---------------- sound design ----------------
SR = 44100


def whoosh(dur, f0, f1, pan0, pan1, peak=0.45, gain=1.0, seed=0):
    """Band-limited noise sweep (f0->f1 Hz) with a bell envelope and a stereo pan sweep."""
    n = int(dur * SR)
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 1, n)
    u = np.linspace(0, 1, n)
    fc = f0 * (f1 / f0) ** u
    a = 1 - np.exp(-2 * np.pi * fc / SR)          # one-pole lowpass coefficient
    lp1 = np.empty(n)
    lp2 = np.empty(n)
    y1 = y2 = 0.0
    for k in range(n):
        y1 += a[k] * (noise[k] - y1)
        y2 += a[k] * (y1 - y2)
        lp1[k], lp2[k] = y1, y2
    band = lp2 - np.convolve(lp2, np.ones(64) / 64, mode="same")   # drop the lowest rumble
    env = np.where(u < peak, (u / peak) ** 1.6, ((1 - u) / (1 - peak)) ** 2.2)
    sig = band * env
    sig /= np.max(np.abs(sig)) + 1e-9
    pan = pan0 + (pan1 - pan0) * u                 # -1 left .. 1 right
    return np.stack([sig * np.sqrt((1 - pan) / 2), sig * np.sqrt((1 + pan) / 2)], 1) * gain


def thump(freq=62, dur=0.32, gain=0.55):
    n = int(dur * SR)
    u = np.arange(n) / SR
    f = freq * (1 + 1.2 * np.exp(-u * 28))
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) * np.exp(-u * 11)
    sig[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return np.stack([sig, sig], 1) * gain


def build_audio(path):
    total = int(DUR * SR)
    mix = np.zeros((total + 2 * SR, 2))

    def add(sig, at):
        i = int(at * SR)
        mix[i:i + len(sig)] += sig[: len(mix) - i]

    # cards flying in from the right: whoosh right->left, soft landing thump
    for i in range(4):
        t0 = INTRO_DELAY + i * INTRO_STAGGER
        add(whoosh(1.15, 500, 5200, 0.8, -0.2 + 0.3 * i - 0.6, peak=0.28, gain=0.55, seed=i), t0)
        add(thump(58 + 5 * i, gain=0.38), t0 + INTRO_DUR * 0.72)
    # carousel steps
    for k, st in enumerate(STEPS):
        add(whoosh(1.3, 380, 4200, 0.7, -0.7, peak=0.5, gain=0.5, seed=10 + k), st - 0.15)
        add(thump(52, gain=0.3), st + STEP_DUR - 0.05)
    # quiet sub drone under everything
    u = np.arange(total) / SR
    drone = 0.05 * np.sin(2 * np.pi * 43 * u) * np.minimum(1, u / 1.5) * np.minimum(1, (DUR - u) / 1.5)
    mix[:total] += drone[:, None]
    mix = mix[:total]
    fade = np.minimum(1, (DUR - np.arange(total) / SR) / 0.6)
    mix *= fade[:, None]
    mix *= 0.72 / (np.max(np.abs(mix)) + 1e-9)
    pcm = (mix * 32767).astype("<i2")
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def shift_at(t):
    s = 0.0
    for st in STEPS:
        s += ease_io((t - st) / STEP_DUR)
    return s


def main():
    SILENT = OUT + ".silent.mp4"
    print(f"videos: {VIDEOS}", file=sys.stderr)
    need = NFR + int(FPS * 6)
    clips = [load(v, need) for v in VIDEOS]
    nv = len(clips)
    mask = rounded_mask()
    shadow, pad = shadow_sprite(mask)
    bg = background()
    font = ImageFont.truetype(FONT, 52)

    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", SILENT],
        stdin=subprocess.PIPE)

    for f in range(NFR):
        t = f / FPS
        canvas = bg_frame(bg, t, font)
        s = shift_at(t)
        for n in range(0, 8):                       # strip card n, video n % nv
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
            if n >= 4:                                # incoming cards fade in at the right edge
                alpha = min(1.0, max(0.0, (4.0 - slot) / 0.35))
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
    if AUDIO:
        wav = OUT + ".wav"
        build_audio(wav)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", SILENT, "-i", wav, "-c:v", "copy",
                        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT], check=True)
        import os
        os.remove(SILENT)
        os.remove(wav)
    else:
        import os
        os.replace(SILENT, OUT)


if __name__ == "__main__":
    main()
