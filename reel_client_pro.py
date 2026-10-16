#!/usr/bin/env python3
"""Client reel v3 — calmer, 'pro editor' cut to DBT (ΔXIUS LIИK, VΛVILONΞC), 143.55 BPM.

Track window 47.895 s .. 62.895 s: three bass hits, a breath of silence, the drop at reel 5.49 s.
Structure:
  intro (cinematic, cuts on the 3 bass hits) -> breath (slow push, dip) -> DROP: flash + zoom-through
  into 3 vertical strips (one per beat) -> middle strip opens to full -> 2 full shots (zoom / whip) ->
  2x2 grid (one panel per beat) -> grid flies apart revealing the next shot -> zoom -> final close-up
  (same as the opener, so the reel loops cleanly).
Transitions: zoom-through with radial blur, whip pan with motion blur, punch-in, slide with blur.
Original colours, no grade.

Usage: python3 reel_client_pro.py IMG_0360.mp4 track.mp3 out.mp4
"""
import math
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/user/Edit")
from reel_client import SEG, Seg  # noqa: E402
from reel_multiscreen import FPS, H, NFR, W, cover, ease  # noqa: E402

TRACK_START = 47.895
DROP = 53.395 - TRACK_START          # 5.5 s into the reel
BPM = 143.55
Q = FPS * 60 / BPM                   # frames per beat (12.54)
GAP = 10

F = lambda t: int(round(t * FPS))    # noqa: E731
D = F(DROP)
HITS = [F(48.806 - TRACK_START), F(50.056 - TRACK_START), F(51.306 - TRACK_START)]
BREATH = F(52.60 - TRACK_START)      # bass stops here, silence until the drop


def BT(k):
    """frame of beat k after the drop"""
    return int(round(D + Q * k))


def ease_in(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * x


def ease_io(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


# ---------------- shots ----------------
class Shot:
    """Full-frame shot from frame a to b. tin/tout: 'zoom', 'whip', 'punch', None."""

    def __init__(self, a, b, src, z0=1.0, z1=1.06, tin=None, tout=None, wdir=1, fy=0.5, off=0, show=None):
        self.a, self.b, self.src, self.z0, self.z1 = a, b, src, z0, z1
        self.off, self.show = off, a if show is None else show
        self.tin, self.tout, self.wdir, self.fy = tin, tout, wdir, fy


def radial(S, src, i, w, h, z, amount, fy=0.5):
    """zoom blur: average of progressively larger crops"""
    n = 1 + int(amount * 6)
    acc = np.zeros((h, w, 3), np.float32)
    for k in range(n):
        acc += cover(S[src].frame(i), w, h, z * (1 + 0.035 * amount * k), fy=fy)
    return (acc / n).astype(np.uint8)


def mblur(img, px, axis):
    """motion blur of length px along axis (box of shifted copies)"""
    px = int(abs(px))
    if px < 2:
        return img
    n = min(10, px // 6 + 2)
    acc = img.astype(np.float32)
    for k in range(1, n):
        acc += np.roll(img, int(k * px / n), axis=axis)
    return (acc / n).astype(np.uint8)


def render_shot(s, f, S):
    lt = f - s.a
    dur = s.b - s.a
    z = s.z0 + (s.z1 - s.z0) * ease_io(lt / max(1, dur - 1))
    blur, shift = 0.0, 0
    # incoming transition
    if s.tin == "zoom" and lt < 6:
        e = 1 - ease((lt + 1) / 6)
        z *= 1 + 0.45 * e
        blur = max(blur, e)
    elif s.tin == "whip" and lt < 5:
        e = 1 - ease((lt + 1) / 5)
        shift = int(-s.wdir * W * 0.6 * e)
    elif s.tin == "punch" and lt < 8:
        z *= 1 + 0.10 * (1 - ease((lt + 1) / 8))
    # outgoing transition
    left = s.b - f
    if s.tout == "zoom" and left <= 5:
        e = ease_in((6 - left) / 6)
        z *= 1 + 0.6 * e
        blur = max(blur, e)
    elif s.tout == "whip" and left <= 4:
        e = ease_in((5 - left) / 5)
        shift = int(s.wdir * W * 0.6 * e)
    img = radial(S, s.src, lt + s.off, W, H, z, blur, s.fy) if blur > 0.05 else cover(S[s.src].frame(lt + s.off), W, H, z, fy=s.fy)
    if shift:
        img = mblur(np.roll(img, shift, axis=1), abs(shift) * 0.5, 1)
    return img


# ---------------- multi-screen moments ----------------
def strips(f, S, a, srcs, open_at, open_dur):
    """3 vertical strips slide in one per beat (alternating from top/bottom with motion blur);
    at open_at the middle one opens to full screen."""
    c = np.zeros((H, W, 3), np.uint8)
    sw = W // 3
    if f >= open_at:
        e = ease_io((f - open_at) / open_dur)
        x0 = int(sw * (1 - e)) + int(GAP / 2 * (1 - e))
        w = int(sw - GAP + (W - sw + GAP) * e)
        lt = f - BT(1)
        x0 = max(0, x0)
        w = min(W - x0, w)
        for k in (0, 2):                                         # side strips get pushed out
            if e < 1:
                lt_k = f - BT(k)
                img = cover(S[srcs[k]].frame(lt_k), sw - GAP, H - GAP)
                dx = int((-1 if k == 0 else 1) * sw * 1.2 * e)
                xk = k * sw + GAP // 2 + dx
                xa, xb = max(0, xk), min(W, xk + sw - GAP)
                if xb > xa:
                    c[GAP // 2:H - GAP // 2, xa:xb] = img[:, xa - xk:xb - xk]
        img = cover(S[srcs[1]].frame(lt), w, H - int(GAP * (1 - e)) if e < 1 else H)
        y0 = int(GAP / 2 * (1 - e))
        c[y0:y0 + img.shape[0], x0:x0 + w] = img
        return c
    for k in range(3):
        st = BT(k)
        if f < st:
            continue
        lt = f - st
        img = cover(S[srcs[k]].frame(lt), sw - GAP, H - GAP, 1.05 + 0.05 * math.exp(-lt / 4))
        e = 1 - ease((lt + 1) / 6)
        dy = int((-1 if k % 2 == 0 else 1) * H * e)
        if e > 0.02:
            img = mblur(img, H * 0.12 * e, 0)
        y = GAP // 2 + dy
        x = k * sw + GAP // 2
        ya, yb = max(0, y), min(H, y + H - GAP)
        if yb > ya:
            c[ya:yb, x:x + sw - GAP] = img[ya - y:yb - y]
    return c


def grid(f, S, a, srcs, burst_at, burst_dur, behind):
    """2x2 grid: one panel per beat with a soft scale-pop; at burst_at the four panels fly apart
    towards their corners revealing `behind` (a Shot)."""
    cw, ch = W // 2, H // 2
    if f >= burst_at:
        c = render_shot(behind, f, S).copy()
    else:
        c = np.zeros((H, W, 3), np.uint8)
    e_b = ease_in((f - burst_at) / burst_dur) if f >= burst_at else 0.0
    for k, (cx, cy) in enumerate([(0, 0), (1, 0), (0, 1), (1, 1)]):
        st = int(round(a + Q * k))
        if f < st:
            continue
        lt = f - st
        if e_b >= 1:
            continue
        pop = 1 - ease((lt + 1) / 7)
        w, h = cw - GAP, ch - GAP
        sc = 1 - 0.12 * pop
        pw, ph = int(w * sc), int(h * sc)
        img = cover(S[srcs[k]].frame(lt), pw, ph, 1.06, fy=0.4)
        x = cx * cw + GAP // 2 + (w - pw) // 2
        y = cy * ch + GAP // 2 + (h - ph) // 2
        if e_b > 0:
            x += int((-1 if cx == 0 else 1) * cw * 1.1 * e_b)
            y += int((-1 if cy == 0 else 1) * ch * 1.1 * e_b)
            img = mblur(img, cw * 0.25 * e_b, 1)
        xa, xb, ya, yb = max(0, x), min(W, x + pw), max(0, y), min(H, y + ph)
        if xb > xa and yb > ya:
            c[ya:yb, xa:xb] = img[ya - y:yb - y, xa - x:xb - x]
    return c


# ---------------- timeline ----------------
def plan():
    T = []
    # intro: hard cuts on the three bass hits
    T.append(("shot", Shot(0, HITS[0], 11, 1.10, 1.03)))
    T.append(("shot", Shot(HITS[0], HITS[1], 4, 1.0, 1.05, tin="punch", tout="whip", wdir=1)))
    T.append(("shot", Shot(HITS[1], HITS[2], 19, 1.08, 1.0, tin="whip", wdir=1)))
    # last intro shot carries through the breath with a slow push, then zooms through into the drop
    T.append(("shot", Shot(HITS[2], D, 15, 1.0, 1.22, tin="punch", tout="zoom", fy=0.35)))
    # drop: 3 strips, middle opens on beat 3
    T.append(("strips", D, BT(4), dict(srcs=[2, 13, 7], open_at=BT(3), open_dur=7)))
    T.append(("shot", Shot(BT(4), BT(6), 13, 1.0, 1.06, tout="zoom", off=BT(4) - BT(1))))
    T.append(("shot", Shot(BT(6), BT(8), 16, 1.0, 1.06, tin="zoom", tout="whip", wdir=-1)))
    T.append(("shot", Shot(BT(8), BT(10), 8, 1.04, 1.0, tin="whip", wdir=-1)))
    # 2x2 grid, one panel per beat, flies apart on beat 14
    behind = Shot(BT(14), BT(16), 17, 1.12, 1.02, tout="zoom")
    T.append(("grid", BT(10), BT(14) + 7, dict(srcs=[22, 20, 21, 14], burst_at=BT(14), burst_dur=7,
                                                behind=behind)))
    behind.show = BT(14) + 7
    T.append(("shot", behind))
    T.append(("shot", Shot(BT(16), BT(18), 23, 1.0, 1.05, tin="zoom", tout="whip", wdir=1)))
    # finale: the opener's close-up again (seamless loop), slow push, fade at the very end
    T.append(("shot", Shot(BT(18), NFR, 11, 1.02, 1.12, tin="whip", wdir=1)))
    return T


def flash_gain(f):
    """exposure accents: big on the drop, small on the grid pops and the bass hits"""
    g = 0.0
    if 0 <= f - D < 6:
        g = max(g, 0.85 * math.exp(-(f - D) / 1.6))
    for h in HITS:
        if 0 <= f - h < 4:
            g = max(g, 0.25 * math.exp(-(f - h) / 1.2))
    return g


def main():
    src, track, out = sys.argv[1:4]
    S = {k: Seg(src, a, b) for k, (a, b) in SEG.items()}
    T = plan()
    silent = out + ".silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-b:v", "14M",
                            "-maxrate", "18M", "-bufsize", "28M", "-pix_fmt", "yuv420p", silent],
                           stdin=subprocess.PIPE)
    for f in range(NFR):
        c = None
        for item in T:
            kind = item[0]
            if kind == "shot":
                s = item[1]
                if s.show <= f < s.b:
                    c = render_shot(s, f, S)
            elif item[1] <= f < item[2]:
                p = item[3]
                c = strips(f, S, item[1], **p) if kind == "strips" else grid(f, S, item[1], **p)
        if c is None:
            c = np.zeros((H, W, 3), np.uint8)
        x = c.astype(np.float32)
        if BREATH <= f < D:                                   # the breath: gentle dip in the silence
            x *= 1 - 0.35 * ease_io((f - BREATH) / (D - BREATH))
        if f < 8:                                             # fade in from black
            x *= (f + 1) / 8
        if f >= NFR - 10:                                     # fade out (loops back to the fade in)
            x *= (NFR - f) / 10
        g = flash_gain(f)
        if g:
            x = x + (255 - x) * g
        enc.stdin.write(np.clip(x, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", silent, "-ss", str(TRACK_START), "-i", track,
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-t", "15",
                    "-af", "volume=-1dB,afade=t=in:d=0.25,afade=t=out:st=14.5:d=0.5", "-movflags", "+faststart", out],
                   check=True, stdin=subprocess.DEVNULL)
    os.remove(silent)


if __name__ == "__main__":
    main()
