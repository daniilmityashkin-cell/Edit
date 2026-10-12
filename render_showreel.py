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
BG = (7, 7, 10)
# animated gradient blobs: (cx, cy, radius px, base hue 0..1, strength, speed)
GLOWS = [(0.25, 0.30, 820, 0.76, 0.95, 1.0),
         (0.78, 0.82, 860, 0.07, 0.80, 0.8),
         (0.60, 0.08, 700, 0.60, 0.70, 1.2),
         (0.10, 0.90, 640, 0.92, 0.55, 0.9)]
HUE_CYCLE = 0.30                                 # how much the hues travel over the whole clip
CAPTION_COLOR = (238, 238, 240)
AUDIO = True
MUSIC_GAIN, SFX_GAIN, MASTER_PEAK = 0.9, 0.45, 0.40   # music bed, transition sounds, overall ceiling
FONT = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
import os
# source clips: every mp4 here except rendered outputs (showreel*.mp4 and OUT itself)
VIDEOS = sorted(p for p in glob.glob("/home/user/Edit/*.mp4")
                if not os.path.basename(p).startswith("showreel")
                and os.path.abspath(p) != os.path.abspath(OUT))
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


def hsv(h, sat, val):
    import colorsys
    return np.array(colorsys.hsv_to_rgb(h % 1.0, sat, val), np.float32) * 255


_GRAIN = None


def background():
    """Static helpers for the animated gradient: low-res coordinate grid + film grain."""
    global _GRAIN
    sw, sh = W // 4, H // 4
    yy, xx = np.mgrid[0:sh, 0:sw].astype(np.float32)
    _GRAIN = np.random.default_rng(7).normal(0, 2.4, (H + 64, W + 64)).astype(np.float32)
    return xx * 4, yy * 4


def bg_frame(grid, t, font):
    """Gradients drift on Lissajous paths, breathe, and slowly shift hue (they 'shimmer')."""
    xx, yy = grid
    img = np.empty(xx.shape + (3,), np.float32)
    img[:] = BG
    for k, (gx, gy, r, h0, st, sp) in enumerate(GLOWS):
        cx = (gx + 0.12 * math.sin(2 * math.pi * sp * t / 7.0 + k * 1.7)) * W
        cy = (gy + 0.14 * math.cos(2 * math.pi * sp * t / 9.0 + k * 2.3)) * H
        rr = r * (1 + 0.18 * math.sin(2 * math.pi * sp * t / 5.5 + k))
        d2 = ((xx - cx) ** 2 + (yy - cy) ** 2) / (rr * rr)
        pulse = 0.85 + 0.15 * math.sin(2 * math.pi * t / 4.0 + k * 1.1)
        col = hsv(h0 + HUE_CYCLE * t / DUR + 0.04 * math.sin(t * 0.9 + k), 0.78, 0.55)
        img += (np.exp(-d2 * 1.5) * st * pulse)[..., None] * col
    # slow diagonal light band sweeping across (adds the "iridescent" feel)
    ph = (xx * 0.55 + yy * 0.35) / 900.0 - t * 0.22
    band = np.maximum(0, np.sin(ph * 2 * math.pi)) ** 6 * 0.10
    img += band[..., None] * hsv(0.62 + 0.3 * t / DUR, 0.5, 1.0)
    big = np.asarray(Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32)
    ox, oy = (int(t * 997) % 64), (int(t * 631) % 64)
    big += _GRAIN[oy:oy + H, ox:ox + W, None]
    vy, vx = np.ogrid[0:H, 0:W]
    vig = 1 - 0.30 * (((vx - W / 2) / (W / 2)) ** 2 + ((vy - H / 2) / (H / 2)) ** 2) / 2
    big *= vig[..., None].astype(np.float32)
    out = Image.fromarray(np.clip(big, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(out)
    tw = d.textlength(CAPTION, font=font)
    d.text(((W - tw) / 2, 52), CAPTION, font=font, fill=CAPTION_COLOR)
    return out


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
BPM = 96
BEAT = 60.0 / BPM


def lowpass(x, fc, order=2):
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    for _ in range(order):
        acc = 0.0
        for k in range(len(x)):
            acc += a * (x[k] - acc)
            y[k] = acc
        x = y.copy()
    return y


def whoosh(dur, f0, f1, pan0, pan1, peak=0.45, gain=1.0, seed=0):
    """Noise sweep f0->f1 Hz (time-varying lowpass minus a fixed lowpass = band) with bell envelope."""
    n = int(dur * SR)
    noise = np.random.default_rng(seed).normal(0, 1, n)
    u = np.linspace(0, 1, n)
    a = 1 - np.exp(-2 * np.pi * (f0 * (f1 / f0) ** u) / SR)
    y1 = y2 = 0.0
    out = np.empty(n)
    for k in range(n):
        y1 += a[k] * (noise[k] - y1)
        y2 += a[k] * (y1 - y2)
        out[k] = y2
    out -= np.convolve(out, np.ones(24) / 24, mode="same") * 0.0
    out -= lowpass(out, 220, 1)                       # remove rumble so it is audible on phones
    env = np.where(u < peak, (u / peak) ** 1.4, ((1 - u) / (1 - peak)) ** 1.8)
    sig = out * env
    sig /= np.max(np.abs(sig)) + 1e-9
    pan = pan0 + (pan1 - pan0) * u
    return np.stack([sig * np.sqrt((1 - pan) / 2), sig * np.sqrt((1 + pan) / 2)], 1) * gain


def hit(freq=70, dur=0.35, gain=0.7):
    """Kick/impact with harmonics + a click, so it is audible even on tiny speakers."""
    n = int(dur * SR)
    u = np.arange(n) / SR
    f = freq * (1 + 2.0 * np.exp(-u * 30))
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = (np.sin(ph) + 0.45 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)) * np.exp(-u * 10)
    click = np.random.default_rng(1).normal(0, 1, n) * np.exp(-u * 380) * 0.5
    sig = sig + click
    sig[: int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    return np.stack([sig, sig], 1) * gain / 1.4


def tick(freq=1800, dur=0.12, gain=0.35):
    n = int(dur * SR)
    u = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * freq * u) + 0.5 * np.sin(2 * np.pi * freq * 2.01 * u)) * np.exp(-u * 45)
    return np.stack([sig, sig], 1) * gain


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def pluck(freq, dur=0.9, gain=0.3, bright=3.0):
    n = int(dur * SR)
    u = np.arange(n) / SR
    sig = np.zeros(n)
    for h, amp in ((1, 1.0), (2, 0.5), (3, 0.28), (4, 0.15), (5, 0.08)):
        sig += amp * np.sin(2 * np.pi * freq * h * u) * np.exp(-u * (3 + bright * h))
    sig[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return sig * gain


def pad(freqs, dur, gain=0.12):
    n = int(dur * SR)
    u = np.arange(n) / SR
    sig = np.zeros(n)
    for f in freqs:
        for det in (-0.004, 0.0, 0.004):
            sig += np.sin(2 * np.pi * f * (1 + det) * u) + 0.4 * np.sin(2 * np.pi * 2 * f * (1 + det) * u)
    env = np.minimum(1, u / 0.8) * np.minimum(1, (dur - u) / 0.9)
    return sig * env * gain / (len(freqs) * 3)


def reverb(x, secs=1.6, wet=0.3, seed=5):
    """Cheap room: convolve with exponentially decaying, darkened noise (FFT)."""
    n = int(secs * SR)
    rng = np.random.default_rng(seed)
    ir = rng.normal(0, 1, (n, 2)) * np.exp(-np.arange(n) / SR * 3.2)[:, None]
    for c in range(2):
        ir[:, c] = lowpass(ir[:, c], 3500, 1)
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
    m = len(x) + n
    nfft = 1 << (m - 1).bit_length()
    out = np.stack([np.fft.irfft(np.fft.rfft(x[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[:len(x)]
                    for c in range(2)], 1)
    return x * (1 - wet * 0.5) + out * wet * 2.0


def tine(freq, dur=3.0, gain=0.2, vel=1.0):
    """Soft electric-piano (Rhodes-like) note: sine + fast-decaying bell partial, slow tremolo."""
    n = int(dur * SR)
    u = np.arange(n) / SR
    body = np.sin(2 * np.pi * freq * u) * np.exp(-u * 0.65)
    body += 0.35 * np.sin(2 * np.pi * freq * 2 * u) * np.exp(-u * 2.2)
    bell = 0.5 * vel * np.sin(2 * np.pi * freq * 6.0 * u) * np.exp(-u * 14)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 4.5 * u)
    sig = (body + bell) * trem
    sig[: int(0.006 * SR)] *= np.linspace(0, 1, int(0.006 * SR))
    sig *= np.minimum(1, (dur - u) / 0.2)
    return sig * gain


def build_music(total):
    """Warm lo-fi cinematic bed: Fmaj7 - Em7 - Dm7 - Cmaj7 electric-piano chords, sparse bell melody,
    soft sub-bass, muted brush beat, all through a small room reverb. 80 BPM."""
    beat = 60.0 / 80
    bar = 4 * beat
    L = np.zeros(total + 4 * SR)
    R = np.zeros_like(L)

    def put(sig, at, pan=0.0):
        i = int(at * SR)
        sig = sig[: len(L) - i]
        L[i:i + len(sig)] += sig * math.sqrt((1 - pan) / 2)
        R[i:i + len(sig)] += sig * math.sqrt((1 + pan) / 2)

    chords = [(53, [0, 4, 7, 11]), (52, [0, 3, 7, 10]), (50, [0, 3, 7, 10]), (48, [0, 4, 7, 11])]
    melody = {0: [(7, 0), (5, 1.5), (4, 2.5)], 1: [(2, 0.5), (4, 2), (7, 3)],
              2: [(5, 0), (7, 1.5), (9, 3)], 3: [(7, 0.5), (4, 2), (2, 3.5)]}   # (scale degree offset, beat)
    scale_off = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]
    rng = np.random.default_rng(11)
    for b in range(int(DUR / bar) + 2):
        root, iv = chords[b % 4]
        t0 = b * bar
        for k, x in enumerate(iv):                       # gently rolled chord
            put(tine(midi(root + 12 + x), bar + 0.6, 0.13), t0 + k * 0.045, pan=-0.25 + 0.17 * k)
        put(tine(midi(root - 12), bar, 0.20, vel=0.1), t0)                     # sub/bass note
        put(tine(midi(root), 1.2, 0.12, vel=0.1), t0 + 2.5 * beat)
        for deg, bt in melody[b % 4]:                    # sparse bell melody
            note = root + 24 + scale_off[min(deg, len(scale_off) - 1) % len(scale_off)]
            put(tine(midi(note), 1.6, 0.13, vel=1.4), t0 + bt * beat, pan=0.3)
        # muted kick (1 and 2.5) + soft rim on 3 + brushed hats
        for bt in (0, 2.5):
            n = int(0.25 * SR)
            u = np.arange(n) / SR
            ph = 2 * np.pi * np.cumsum(55 * (1 + 1.6 * np.exp(-u * 28))) / SR
            kick = (np.sin(ph) + 0.5 * np.sin(2 * ph)) * np.exp(-u * 14) * 0.22
            put(kick, t0 + bt * beat)
        for k in range(8):
            n = int(0.07 * SR)
            h = rng.normal(0, 1, n) * np.exp(-np.arange(n) / SR * 70)
            h -= lowpass(h, 4000, 1)
            put(h * (0.045 if k % 2 else 0.028), t0 + k * beat / 2, pan=0.2 * (-1) ** k)
        n = int(0.12 * SR)
        sn = rng.normal(0, 1, n) * np.exp(-np.arange(n) / SR * 32)
        sn -= lowpass(sn, 1500, 1)
        put(sn * 0.10, t0 + 2 * beat)
    x = np.stack([L, R], 1)[:total + 2 * SR]
    x = reverb(x, 1.6, 0.32)[:total]
    return x * np.minimum(1, np.arange(total) / SR / 1.0)[:, None]


def build_audio(path):
    total = int(DUR * SR)
    music = build_music(total) * MUSIC_GAIN
    fx = np.zeros((total + 2 * SR, 2))

    def add(sig, at):
        i = int(at * SR)
        fx[i:i + len(sig)] += sig[: len(fx) - i]

    for i in range(4):                                  # cards flying in from the right (short, soft)
        t0 = INTRO_DELAY + i * INTRO_STAGGER
        add(whoosh(0.42, 900, 5200, 0.8, -0.4 + 0.2 * i, peak=0.25, gain=SFX_GAIN * 0.8, seed=i), t0 + 0.05)
        add(tick(1400 + 220 * i, 0.09, gain=SFX_GAIN * 0.30), t0 + INTRO_DUR * 0.72)
    for k, st in enumerate(STEPS):                      # carousel steps
        add(whoosh(0.5, 700, 5000, 0.7, -0.7, peak=0.45, gain=SFX_GAIN * 0.85, seed=10 + k), st + 0.1)
        add(tick(1900, 0.09, gain=SFX_GAIN * 0.28), st + STEP_DUR - 0.05)
    mix = music + fx[:total]
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    mix *= np.minimum(1, (DUR - np.arange(total) / SR) / 0.8)[:, None]
    mix *= MASTER_PEAK / (np.max(np.abs(mix)) + 1e-9)
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix * 32767).astype("<i2").tobytes())


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
