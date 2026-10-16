#!/usr/bin/env python3
"""Client reel (fashion lookbook in the park): re-cut of IMG_0360.mp4 in the reference's
'multi screen layout' style. 1080x1920, 30 fps, 15 s, colour (dark moody grade, not B/W).

Usage: python3 reel_client.py IMG_0360.mp4 out.mp4 [--audio track.mp3]
"""
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/user/Edit")
from reel_multiscreen import (FPS, GAP, H, NFR, W, cover, ease, noise_panel,  # noqa: E402
                              placeholder_music)

SLOW = 1.6          # clips play at 1/SLOW speed (frame-blended) so the ~0.5 s shots last longer

# clean shots of IMG_0360 (seconds), numbered as in the cut list; inverted-flash shots left out
SEG = {
    0: (0.03, 0.70), 1: (0.76, 0.94), 2: (0.99, 1.44), 3: (1.49, 2.20), 4: (2.26, 2.74),
    6: (3.10, 3.77), 7: (3.83, 4.27), 8: (4.33, 4.80), 9: (4.86, 5.57), 11: (5.97, 6.87),
    13: (7.23, 7.90), 14: (7.96, 8.34), 15: (8.40, 8.90), 16: (8.96, 9.67), 17: (9.73, 10.44),
    18: (10.50, 10.97), 19: (11.03, 11.97), 20: (12.03, 12.47), 21: (12.53, 13.27),
    22: (13.33, 13.80), 23: (13.86, 14.54), 24: (14.60, 15.27),
}

# ---- dark, moody grade: low saturation (greens especially), cool shadows, crushed blacks ----
SAT, CONTRAST, EXPOSURE = 0.58, 1.22, 0.86
GREEN_KILL = 0.75
SHADOW_TINT = np.array([-4, 2, 9], np.float32)
HIGH_TINT = np.array([4, 2, -2], np.float32)
GRAIN, VIGNETTE = 10.0, 0.55


class Seg:
    def __init__(self, path, a, b):
        vf = (f"setpts={SLOW}*PTS,minterpolate=fps={FPS}:mi_mode=blend,"
              f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}")
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(a), "-t", str(b - a), "-i", path, "-an",
                              "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                             capture_output=True, check=True, stdin=subprocess.DEVNULL).stdout
        fs = W * H * 3
        self.f = np.frombuffer(raw, np.uint8)[: len(raw) // fs * fs].reshape(-1, H, W, 3)

    def frame(self, i):
        """Ping-pong looping so a short shot never jumps back to its start."""
        n = len(self.f)
        if n < 2:
            return self.f[0]
        p = 2 * n - 2
        k = i % p
        return self.f[k if k < n else p - k]


B = 18  # frames per beat (100 BPM)


def timeline():
    g1 = [(0, 0, W, 560), (0, 560, W // 2, 800), (W // 2, 560, W - W // 2, 800), (0, 1360, W, 560)]
    sw = W // 3
    g2 = [(0, 0, sw, H), (sw, 0, sw, H), (2 * sw, 0, W - 2 * sw, H)]
    return [
        # hook
        ("full", 0, B, dict(src=3, z0=1.10, z1=1.0)),
        ("full", B, 2 * B, dict(src=4, z0=1.0, z1=1.08)),
        ("full", 2 * B, 2 * B + 9, dict(src=9, z0=1.05, z1=1.05)),
        ("full", 2 * B + 9, 3 * B, dict(src=19, z0=1.06, z1=1.0)),
        # grid 1: build -> swap -> collapse
        ("grid", 3 * B, 6 * B, dict(rects=g1, srcs=[2, 7, 13, 17], appear=[0, 4, 8, 12],
                                    swap_at=[36, 40, 44, 48], swap_srcs=[14, 8, 22, 18])),
        ("collapse", 6 * B, 6 * B + 6, dict(rect=g1[1], src=8, start=6 * B - (3 * B + 40))),
        ("full", 6 * B + 6, 8 * B, dict(src=11, z0=1.0, z1=1.07)),
        # split top / bottom (bottom starts inverted, like the reference)
        ("split", 8 * B, 10 * B, dict(top=6, bot=21, inv_frames=4)),
        ("full", 10 * B, 11 * B, dict(src=16, z0=1.08, z1=1.0)),
        # grid 2: three vertical strips
        ("grid", 11 * B, 14 * B + 12, dict(rects=g2, srcs=[15, 20, 23], appear=[0, 4, 8],
                                           swap_at=[36, 42, 48], swap_srcs=[0, 1, 24])),
        ("collapse", 14 * B + 12, 15 * B, dict(rect=g2[1], src=1, start=14 * B + 12 - (11 * B + 42))),
        ("full", 15 * B, 18 * B, dict(src=17, z0=1.0, z1=1.10)),
        # stutter
        ("full", 18 * B, 18 * B + 6, dict(src=7, z0=1.12, z1=1.12)),
        ("full", 18 * B + 6, 18 * B + 12, dict(src=14, z0=1.12, z1=1.12)),
        ("full", 18 * B + 12, 19 * B, dict(src=21, z0=1.12, z1=1.12)),
        # finale: coat in the wind, then the hooded close-up with a slow push-in
        ("full", 19 * B, 22 * B, dict(src=4, z0=1.0, z1=1.06)),
        ("full", 22 * B, NFR, dict(src=11, z0=1.0, z1=1.10)),
    ]


FLASHES = {B, B + 1, 7 * B, 16 * B, 22 * B, 22 * B + 1}


def render(f, T, S, rng):
    c = np.zeros((H, W, 3), np.uint8)
    for kind, a, b, p in T:
        if not a <= f < b:
            continue
        lt = f - a
        if kind == "full":
            z = p["z0"] + (p["z1"] - p["z0"]) * lt / max(1, b - a - 1)
            c[:] = cover(S[p["src"]].frame(lt), W, H, z)
        elif kind == "grid":
            for k, (x, y, w, h) in enumerate(p["rects"]):
                ap = p["appear"][k]
                if lt < ap:
                    continue
                x2, y2, w2, h2 = x + GAP // 2, y + GAP // 2, w - GAP, h - GAP
                if lt == ap:
                    c[y2:y2 + h2, x2:x2 + w2] = noise_panel(w2, h2, rng)
                    continue
                sa = p["swap_at"][k]
                src, t0 = (p["swap_srcs"][k], sa) if lt >= sa else (p["srcs"][k], ap)
                c[y2:y2 + h2, x2:x2 + w2] = cover(S[src].frame(lt - t0), w2, h2, 1.04, fy=0.28 if w2 > h2 else 0.5)
        elif kind == "collapse":
            e = ease((lt + 1) / (b - a))
            x, y, w, h = p["rect"]
            rx, ry = int(x * (1 - e)), int(y * (1 - e))
            rw, rh = int(w + (W - w) * e), int(h + (H - h) * e)
            img = cover(S[p["src"]].frame(p["start"] + lt), max(2, rw), max(2, rh))
            c[ry:ry + img.shape[0], rx:rx + img.shape[1]] = img[: H - ry, : W - rx]
        elif kind == "split":
            hh = H // 2
            top = cover(S[p["top"]].frame(lt), W, hh - GAP // 2, fy=0.28)
            bot = cover(S[p["bot"]].frame(lt), W, H - hh - GAP // 2, fy=0.3)
            if lt < p["inv_frames"]:
                bot = 255 - bot
            c[: hh - GAP // 2] = top
            c[hh + GAP // 2:] = bot
    return c


def grade(img, f, vig, grain):
    x = img.astype(np.float32) * EXPOSURE
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    gx = np.maximum(0, g - np.maximum(r, b))            # pull down bright park greens
    x[..., 1] -= gx * GREEN_KILL
    lum = x.mean(2, keepdims=True)
    x = lum + (x - lum) * SAT
    x = (x - 118) * CONTRAST + 118
    l = np.clip(lum / 255.0, 0, 1)
    x += SHADOW_TINT * (1 - l) ** 2 + HIGH_TINT * l ** 2
    x *= vig
    ox, oy = (f * 37) % 64, (f * 23) % 64
    x += grain[oy:oy + H, ox:ox + W, None]
    return np.clip(x, 0, 255).astype(np.uint8)


def main():
    args = sys.argv[1:]
    audio = None
    if "--audio" in args:
        i = args.index("--audio")
        audio = args[i + 1]
        del args[i:i + 2]
    src, out = args
    S = {k: Seg(src, a, b) for k, (a, b) in SEG.items()}
    T = timeline()
    rng = np.random.default_rng(1)
    vy, vx = np.ogrid[0:H, 0:W]
    vig = (1 - VIGNETTE * (((vx - W / 2) / (W / 2)) ** 2 + ((vy - H / 2) / (H / 2)) ** 2) / 2)[..., None]
    vig = vig.astype(np.float32)
    grain = rng.normal(0, GRAIN, (H + 64, W + 64)).astype(np.float32)
    silent = out + ".silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-b:v", "14M", "-maxrate", "18M", "-bufsize", "28M",
                            "-pix_fmt", "yuv420p", silent], stdin=subprocess.PIPE)
    for f in range(NFR):
        img = render(f, T, S, rng)
        if f in FLASHES:
            img = 255 - img
        if f >= NFR - 15:
            img = (img * ((NFR - f) / 15.0)).astype(np.uint8)
        enc.stdin.write(grade(img, f, vig, grain).tobytes())
    enc.stdin.close()
    enc.wait()
    tmp_audio = None
    if audio is None:
        tmp_audio = audio = out + ".wav"
        placeholder_music(audio)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", silent, "-i", audio, "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", "15",
                    "-af", "afade=t=out:st=14.3:d=0.7", "-movflags", "+faststart", out], check=True)
    import os
    os.remove(silent)
    if tmp_audio:
        os.remove(tmp_audio)


if __name__ == "__main__":
    main()
