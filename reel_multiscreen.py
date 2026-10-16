#!/usr/bin/env python3
"""Vertical 9:16 reel (15 s, 30 fps) in the 'multi screen layout' style of the reference:
fast cuts, panels popping in one by one (with a noise frame), panel swaps, collapse to full screen,
inverted flash frames, top/bottom split, stutter cuts, hero shot with slow push-in.
Colour graded (not B/W), film grain + vignette.

Usage:
  python3 reel_multiscreen.py out.mp4 clip1.mp4 clip2.mp4 ... [--audio track.mp3]
Without --audio a placeholder dark synth track is generated (cuts sit on a 100 BPM grid).
"""
import math
import subprocess
import sys

import numpy as np
from PIL import Image

W, H, FPS, DUR = 1080, 1920, 30, 15.0
NFR = int(DUR * FPS)
DEC_W, DEC_H = 720, 1280            # decode size (panels/full frames are resized from this)
GAP = 14                            # black gap between panels
BPM = 100
BEAT = int(round(FPS * 60 / BPM))   # 18 frames

# ---- colour grade (cinematic, slightly desaturated, teal shadows / warm highlights) ----
SAT = 0.82
CONTRAST = 1.18
SHADOW_TINT = np.array([-6, 2, 10], np.float32)
HIGH_TINT = np.array([10, 4, -8], np.float32)
GRAIN = 9.0
VIGNETTE = 0.42


def load(path, start, dur):
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", path, "-t", str(dur),
           "-vf", f"fps={FPS},scale={DEC_W}:{DEC_H}:force_original_aspect_ratio=increase,crop={DEC_W}:{DEC_H}",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    fs = DEC_W * DEC_H * 3
    n = len(raw) // fs
    if n == 0:
        raise SystemExit(f"could not decode {path}")
    return np.frombuffer(raw, np.uint8)[: n * fs].reshape(n, DEC_H, DEC_W, 3)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True).stdout
    return float(out.strip() or 0)


class Src:
    """A source clip; frame(i) returns frame i (looping) as uint8 HxWx3."""

    def __init__(self, path, start=0.0, length=8.0):
        d = duration(path)
        start = min(start, max(0.0, d - 1.0))
        self.f = load(path, start, min(length, max(1.0, d - start)))

    def frame(self, i):
        return self.f[i % len(self.f)]


def cover(img, w, h, zoom=1.0, fx=0.5, fy=0.5):
    """Crop img to w:h aspect (centre fx,fy), apply zoom, resize to w x h."""
    ih, iw = img.shape[:2]
    a = w / h
    if iw / ih > a:
        cw, ch = ih * a, ih
    else:
        cw, ch = iw, iw / a
    cw, ch = cw / zoom, ch / zoom
    x0 = (iw - cw) * fx
    y0 = (ih - ch) * fy
    im = Image.fromarray(img).resize((w, h), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch))
    return np.asarray(im)


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


# ---------------- timeline ----------------
# shots reference sources by index; offsets (in frames) pick different moments of a clip.
def build_timeline(n):
    s = lambda k: k % n               # noqa: E731
    B = BEAT
    T = []
    # hook: fast full-frame cuts
    T += [("full", 0, B, dict(src=s(0), off=0, z0=1.10, z1=1.0))]
    T += [("full", B, 2 * B, dict(src=s(1), off=30, z0=1.0, z1=1.08))]
    T += [("full", 2 * B, 2 * B + 9, dict(src=s(2), off=60, z0=1.05, z1=1.05))]
    T += [("full", 2 * B + 9, 3 * B, dict(src=s(3), off=20, z0=1.05, z1=1.0))]
    # grid 1 (top wide / two middle / bottom wide) builds, swaps, collapses
    g1 = [(0, 0, W, 560), (0, 560, W // 2, 800), (W // 2, 560, W - W // 2, 800), (0, 1360, W, 560)]
    T += [("grid", 3 * B, 6 * B, dict(rects=g1, srcs=[s(1), s(2), s(3), s(0)], offs=[90, 10, 40, 120],
                                       appear=[0, 4, 8, 12], swap_at=[36, 40, 44, 48],
                                       swap_srcs=[s(2), s(3), s(0), s(1)]))]
    T += [("collapse", 6 * B, 6 * B + 6, dict(rect=g1[1], src=s(3)))]
    T += [("full", 6 * B + 6, 8 * B, dict(src=s(3), off=150, z0=1.0, z1=1.06))]
    # split top/bottom (bottom starts inverted, like the reference)
    T += [("split", 8 * B, 10 * B, dict(top=s(0), bot=s(2), offs=(200, 80), inv_frames=4))]
    T += [("full", 10 * B, 11 * B, dict(src=s(1), off=140, z0=1.08, z1=1.0))]
    # grid 2: three vertical strips
    sw = W // 3
    g2 = [(0, 0, sw, H), (sw, 0, sw, H), (2 * sw, 0, W - 2 * sw, H)]
    T += [("grid", 11 * B, 14 * B + 12, dict(rects=g2, srcs=[s(2), s(0), s(3)], offs=[170, 60, 210],
                                             appear=[0, 4, 8], swap_at=[36, 42, 48],
                                             swap_srcs=[s(1), s(2), s(0)]))]
    T += [("collapse", 14 * B + 12, 15 * B, dict(rect=g2[1], src=s(2)))]
    T += [("full", 15 * B, 18 * B, dict(src=s(2), off=100, z0=1.0, z1=1.10))]
    # stutter
    for k in range(3):
        T += [("full", 18 * B + 6 * k, 18 * B + 6 * (k + 1), dict(src=s(k + 1), off=230 + 15 * k, z0=1.12, z1=1.12))]
    # hero shot
    T += [("full", 19 * B, NFR, dict(src=s(0), off=40, z0=1.0, z1=1.09))]
    flashes = {B, B + 1, 7 * B, 16 * B, 17 * B, 21 * B, 21 * B + 1}
    return T, flashes


def noise_panel(w, h, rng):
    v = rng.integers(70, 180, (h // 4 + 1, w // 4 + 1), dtype=np.uint8)
    return np.repeat(np.repeat(v, 4, 0), 4, 1)[:h, :w, None].repeat(3, 2)


def render_frame(f, T, srcs, rng):
    canvas = np.zeros((H, W, 3), np.uint8)
    for kind, a, b, p in T:
        if not (a <= f < b):
            continue
        lt = f - a
        if kind == "full":
            z = p["z0"] + (p["z1"] - p["z0"]) * (lt / max(1, b - a - 1))
            canvas[:] = cover(srcs[p["src"]].frame(p["off"] + lt), W, H, z)
        elif kind == "grid":
            for k, (x, y, w, h) in enumerate(p["rects"]):
                ap = p["appear"][k]
                if lt < ap:
                    continue
                x2, y2, w2, h2 = x + GAP // 2, y + GAP // 2, w - GAP, h - GAP
                if lt == ap:
                    canvas[y2:y2 + h2, x2:x2 + w2] = noise_panel(w2, h2, rng)
                    continue
                if lt >= p["swap_at"][k]:
                    src, off = p["swap_srcs"][k], p["offs"][k] + 300
                else:
                    src, off = p["srcs"][k], p["offs"][k]
                canvas[y2:y2 + h2, x2:x2 + w2] = cover(srcs[src].frame(off + lt), w2, h2, 1.04)
        elif kind == "collapse":
            e = ease((lt + 1) / (b - a))
            x, y, w, h = p["rect"]
            rx, ry = x * (1 - e), y * (1 - e)
            rw, rh = w + (W - w) * e, h + (H - h) * e
            img = cover(srcs[p["src"]].frame(320 + f), max(2, int(rw)), max(2, int(rh)))
            canvas[int(ry):int(ry) + img.shape[0], int(rx):int(rx) + img.shape[1]] = img[: H - int(ry), : W - int(rx)]
        elif kind == "split":
            hh = H // 2
            top = cover(srcs[p["top"]].frame(p["offs"][0] + lt), W, hh - GAP // 2)
            bot = cover(srcs[p["bot"]].frame(p["offs"][1] + lt), W, H - hh - GAP // 2)
            if lt < p["inv_frames"]:
                bot = 255 - bot
            canvas[: hh - GAP // 2] = top
            canvas[hh + GAP // 2:] = bot
    return canvas


def grade(img, f, vig, grain):
    x = img.astype(np.float32)
    lum = x.mean(2, keepdims=True)
    x = lum + (x - lum) * SAT
    x = (x - 128) * CONTRAST + 128
    l = np.clip(lum / 255.0, 0, 1)
    x += SHADOW_TINT * (1 - l) ** 2 + HIGH_TINT * l ** 2
    x *= vig
    ox, oy = (f * 37) % 64, (f * 23) % 64
    x += grain[oy:oy + H, ox:ox + W, None]
    return np.clip(x, 0, 255).astype(np.uint8)


# ---------------- placeholder music (dark post-punk / darkwave, 100 BPM) ----------------
def placeholder_music(path):
    sys.path.insert(0, "/home/user/Edit")
    from render_showreel import SR, lowpass, midi, reverb, saw_note, string_note  # noqa: E402
    total = int(DUR * SR)
    beat = 60.0 / BPM
    L = np.zeros(total + 4 * SR)
    R = np.zeros_like(L)
    rng = np.random.default_rng(9)

    def put(sig, at, pan=0.0):
        i = int(at * SR)
        sig = sig[: len(L) - i]
        L[i:i + len(sig)] += sig * math.sqrt((1 - pan) / 2)
        R[i:i + len(sig)] += sig * math.sqrt((1 + pan) / 2)

    prog = [(45, [57, 60, 64]), (41, [53, 57, 60]), (43, [55, 59, 62]), (40, [52, 55, 59])]   # Am F G Em
    nbars = int(DUR / (4 * beat)) + 2
    for b in range(nbars):
        t0 = b * 4 * beat
        root, ch = prog[b % 4]
        put(string_note(midi(ch[0]), 4 * beat + 0.5, 0.10, attack=0.6) +
            string_note(midi(ch[2]), 4 * beat + 0.5, 0.08, attack=0.6)[: int((4 * beat + 0.5) * SR)], t0, -0.3)
        for k in range(8):                                    # driving 8th bass
            put(saw_note(midi(root), beat * 0.45, 0.22, bright=2.0, nh=10), t0 + k * beat / 2)
        arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24]  # chorus-y guitar-like arpeggio
        for k in range(8):
            put(saw_note(midi(arp[k % 4]), 0.5, 0.06, bright=5, nh=7), t0 + k * beat / 2 + 0.01,
                pan=0.5 * (-1) ** k)
        if b >= 1:
            for k in range(4):
                n = int(0.3 * SR)
                u = np.arange(n) / SR
                if k % 2 == 0:                                # kick
                    ph = 2 * np.pi * np.cumsum(55 * (1 + 2.5 * np.exp(-u * 35))) / SR
                    put((np.sin(ph) + 0.3 * np.sin(2 * ph)) * np.exp(-u * 12) * 0.6, t0 + k * beat)
                else:                                         # gated snare
                    sn = rng.normal(0, 1, n) * np.exp(-u * 14)
                    sn -= lowpass(sn, 700, 1)
                    put(sn * 0.22 + np.sin(2 * np.pi * 190 * u) * np.exp(-u * 30) * 0.2, t0 + k * beat)
            for k in range(8):                                # hats
                n = int(0.05 * SR)
                h = rng.normal(0, 1, n) * np.exp(-np.arange(n) / SR * 90)
                h -= lowpass(h, 6000, 1)
                put(h * 0.05, t0 + k * beat / 2, 0.2)
    x = np.stack([L, R], 1)[: total + 2 * SR]
    x = reverb(x, 1.8, 0.3)[:total]
    x *= np.minimum(1, (DUR - np.arange(total) / SR) / 0.6)[:, None]
    x *= 0.5 / (np.abs(x).max() + 1e-9)
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def main():
    args = sys.argv[1:]
    audio = None
    if "--audio" in args:
        i = args.index("--audio")
        audio = args[i + 1]
        del args[i:i + 2]
    out, clips = args[0], args[1:]
    if not clips:
        raise SystemExit("give at least one clip")
    srcs = [Src(c, start=0.5, length=14.0) for c in clips]
    T, flashes = build_timeline(len(srcs))
    rng = np.random.default_rng(1)
    vy, vx = np.ogrid[0:H, 0:W]
    vig = (1 - VIGNETTE * (((vx - W / 2) / (W / 2)) ** 2 + ((vy - H / 2) / (H / 2)) ** 2) / 2)[..., None]
    vig = vig.astype(np.float32)
    grain = rng.normal(0, GRAIN, (H + 64, W + 64)).astype(np.float32)
    silent = out + ".silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                            "-pix_fmt", "yuv420p", silent], stdin=subprocess.PIPE)
    for f in range(NFR):
        img = render_frame(f, T, srcs, rng)
        if f in flashes:
            img = 255 - img
        if f >= NFR - 12:                                    # fade to black at the very end
            img = (img * ((NFR - f) / 12.0)).astype(np.uint8)
        enc.stdin.write(grade(img, f, vig, grain).tobytes())
    enc.stdin.close()
    enc.wait()
    if audio is None:
        audio = out + ".wav"
        placeholder_music(audio)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", silent, "-i", audio, "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", str(DUR),
                    "-af", f"afade=t=out:st={DUR - 0.6}:d=0.6", "-movflags", "+faststart", out], check=True)
    import os
    os.remove(silent)
    if audio.endswith(".wav") and audio.startswith(out):
        os.remove(audio)


if __name__ == "__main__":
    main()
