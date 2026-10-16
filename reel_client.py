#!/usr/bin/env python3
"""Client reel v2 (fashion lookbook in the park): dynamic re-cut of IMG_0360.mp4 in the reference's
'multi screen layout' style. 1080x1920, 30 fps, 15 s. Original colours (no grade applied).

Everything is cut on the beat. With --audio the tempo and first beat are detected from the track,
otherwise a placeholder track at --bpm is generated.

Usage: python3 reel_client.py IMG_0360.mp4 out.mp4 [--audio track.mp3] [--start 12.5] [--bpm 130]
  --start: where in the track the 15 s should begin (seconds)
"""
import math
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/user/Edit")
import reel_multiscreen as rm  # noqa: E402
from reel_multiscreen import FPS, H, NFR, W, cover, ease  # noqa: E402

SLOW = 1.35         # clips play slightly slowed (frame-blended) so the ~0.5 s shots can fill panels
GAP = 12

# clean shots of IMG_0360 (seconds); its inverted-flash shots are left out
SEG = {
    0: (0.03, 0.70), 1: (0.76, 0.94), 2: (0.99, 1.44), 3: (1.49, 2.20), 4: (2.26, 2.74),
    6: (3.10, 3.77), 7: (3.83, 4.27), 8: (4.33, 4.80), 9: (4.86, 5.57), 11: (5.97, 6.87),
    13: (7.23, 7.90), 14: (7.96, 8.34), 15: (8.40, 8.90), 16: (8.96, 9.67), 17: (9.73, 10.44),
    18: (10.50, 10.97), 19: (11.03, 11.97), 20: (12.03, 12.47), 21: (12.53, 13.27),
    22: (13.33, 13.80), 23: (13.86, 14.54), 24: (14.60, 15.27),
}
CLOSE = [3, 11, 1, 20, 15]                         # close-ups / faces
MID = [0, 2, 6, 7, 8, 13, 14, 16, 21, 22, 23, 24]  # medium / full body
WIDE = [9, 17, 18, 19, 4]                          # wide / scenic


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
        n = len(self.f)
        if n < 2:
            return self.f[0]
        p = 2 * n - 2
        k = i % p
        return self.f[k if k < n else p - k]       # ping-pong: no jump back to the start


# ---------------- beat detection (numpy only) ----------------
def detect_beats(path, start, sr=22050):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-t", "15.5", "-i", path, "-ac", "1",
                          "-ar", str(sr), "-f", "f32le", "-"], capture_output=True, check=True,
                         stdin=subprocess.DEVNULL).stdout
    x = np.frombuffer(raw, np.float32)
    hop, win = 512, 2048
    n = (len(x) - win) // hop
    frames = np.lib.stride_tricks.as_strided(x, (n, win), (x.strides[0] * hop, x.strides[0]))
    spec = np.log1p(np.abs(np.fft.rfft(frames * np.hanning(win), axis=1)) * 10)
    flux = np.maximum(0, np.diff(spec, axis=0)).sum(1)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    env_fps = sr / hop

    def score(bpm, ph):
        period = env_fps * 60 / bpm
        idx = (ph + period * np.arange(int(len(flux) / period))).astype(int)
        return flux[idx[idx < len(flux)]].mean()

    best = (-1e9, 120.0)
    for bpm in np.arange(70, 180, 0.25):
        period = env_fps * 60 / bpm
        s = max(score(bpm, ph) for ph in np.linspace(0, period, 24, endpoint=False))
        s *= 1.0 if 90 <= bpm <= 160 else 0.85
        if s > best[0]:
            best = (s, bpm)
    bpm = best[1]
    period = env_fps * 60 / bpm
    phs = np.linspace(0, period, 64, endpoint=False)
    first = phs[int(np.argmax([score(bpm, p) for p in phs]))] / env_fps
    return float(bpm), float(first)


# ---------------- edit description ----------------
class P:
    """A panel visible from frame a to b. Its rect may animate r0 -> r1 during anim=(fa, fb) (absolute
    frames); enter = slide-in direction; srcs switch every `every` frames; punch = zoom kick on start."""

    def __init__(self, a, b, r0, srcs, r1=None, anim=None, enter=None, every=None, punch=True, fy=None,
                 z=1.04):
        self.a, self.b, self.r0, self.r1, self.anim = a, b, r0, r1, anim
        self.srcs, self.enter, self.every, self.punch, self.fy, self.z = srcs, enter, every, punch, fy, z

    def rect(self, f):
        if self.r1 is None or self.anim is None:
            return self.r0
        e = ease((f - self.anim[0]) / max(1, self.anim[1] - self.anim[0]))
        return tuple(int(round(u + (v - u) * e)) for u, v in zip(self.r0, self.r1))


FULL = (0, 0, W, H)


def g(x, y, w, h):
    """rect with the panel gap taken off"""
    return (x + GAP // 2, y + GAP // 2, w - GAP, h - GAP)


def build(beats):
    """beats: frame index of every beat, starting at the first beat."""
    q = beats[1] - beats[0]                  # frames per beat
    half = q / 2
    it = {"c": 0, "m": 0, "w": 0}

    def nxt(kind):
        pool = {"c": CLOSE, "m": MID, "w": WIDE}[kind]
        v = pool[it[kind] % len(pool)]
        it[kind] += 1
        return v

    def B(k):                                # frame of (fractional) beat k
        return int(round(beats[0] + q * k))

    panels, inv, white, whips, shakes = [], set(), set(), [], set()
    if B(0) > 0:                             # before the first beat
        panels.append(P(0, B(0), FULL, [nxt("c")]))
    b = 0.0
    # 1) hook: half-beat cuts with zoom kicks and whip pans between them (2 beats)
    order = ["c", "m", "w", "m"]
    for k in range(4):
        a, e = B(b + k * 0.5), B(b + (k + 1) * 0.5)
        panels.append(P(a, e, FULL, [nxt(order[k])]))
        whips.append((e, 1 if k % 2 else -1))
    inv |= {B(b + 1), B(b + 1) + 1}
    b += 2
    # 2) 2x2 grid: panels slide in on quarter beats, shuffle every half beat (4 beats)
    e0 = B(b + 4)
    cw, ch = W // 2, H // 2
    dirs = ["left", "top", "bottom", "right"]
    for k, (x, y) in enumerate([(0, 0), (cw, 0), (0, ch), (cw, ch)]):
        srcs = [nxt("m"), nxt("c"), nxt("m"), nxt("w"), nxt("m"), nxt("c"), nxt("m"), nxt("c")]
        panels.append(P(B(b + k * 0.25), e0, g(x, y, cw, ch), srcs, enter=dirs[k], every=max(4, int(half)),
                        fy=0.35))
    shakes |= {B(b + 2), B(b + 3)}
    b += 4
    # 3) one panel blows up to full screen, whip, wide shot with a white flash (2 beats)
    a, e = B(b), B(b + 1)
    panels.append(P(a, e, g(cw, 0, cw, ch), [nxt("c")], r1=FULL, anim=(a, a + 5), punch=False))
    whips.append((e, -1))
    panels.append(P(e, B(b + 2), FULL, [nxt("w")]))
    white |= {e}
    b += 2
    # 4) top/bottom split: divider drops from the top to the middle, swaps each beat (3 beats)
    a, e = B(b), B(b + 3)
    hh = H // 2
    panels.append(P(a, e, g(0, 0, W, 2), [nxt("c"), nxt("m"), nxt("c")], r1=g(0, 0, W, hh), anim=(a, a + 6),
                    every=int(q), fy=0.3, punch=False))
    panels.append(P(a, e, g(0, 2, W, H - 2), [nxt("m"), nxt("w"), nxt("m")], r1=g(0, hh, W, H - hh),
                    anim=(a, a + 6), every=int(q), fy=0.3, punch=False))
    inv |= {a + 6, a + 7}
    shakes |= {B(b + 1), B(b + 2)}
    b += 3
    # 5) three vertical strips drop in alternately, shuffle on half beats, middle one takes over (4 beats)
    a, e = B(b), B(b + 4)
    sw = W // 3
    take = B(b + 3)
    for k in range(3):
        r = g(k * sw, 0, sw if k < 2 else W - 2 * sw, H)
        srcs = [nxt("m"), nxt("c"), nxt("m"), nxt("m"), nxt("c"), nxt("m")]
        panels.append(P(B(b + k * 0.25), take, r, srcs, enter="top" if k % 2 == 0 else "bottom",
                        every=max(4, int(half))))
    panels.append(P(take, e, g(sw, 0, sw, H), [nxt("c")], r1=FULL, anim=(take, take + 5), punch=False))
    shakes |= {B(b + 1), B(b + 2)}
    b += 4
    # 6) full shots on the beat with shake + flash (3 beats)
    for k in range(3):
        a, e = B(b + k), B(b + k + 1)
        panels.append(P(a, e, FULL, [nxt("c" if k == 1 else "m")]))
        shakes.add(a)
        if k < 2:
            whips.append((e, 1 if k == 0 else -1))
    inv |= {B(b + 1)}
    b += 3
    # 7) four horizontal bands slam in from alternating sides, then picture-in-picture (4 beats)
    e = B(b + 2)
    bh = H // 4
    for k in range(4):
        r = g(0, k * bh, W, bh if k < 3 else H - 3 * bh)
        panels.append(P(B(b + k * 0.25), e, r, [nxt("m"), nxt("w"), nxt("c"), nxt("m")],
                        enter="left" if k % 2 == 0 else "right", every=max(4, int(half)), fy=0.3))
    a, e = B(b + 2), B(b + 4)
    panels.append(P(a, e, FULL, [nxt("w")], punch=False, z=1.18))                 # backdrop
    inner = (int(W * 0.14), int(H * 0.16), int(W * 0.72), int(H * 0.68))
    panels.append(P(a, e, (W // 2, H // 2, 2, 2), [nxt("c"), nxt("m"), nxt("c"), nxt("m")], r1=inner,
                    anim=(a, a + 5), every=max(4, int(half)), punch=False))
    white |= {a}
    b += 4
    # 8) stutter: quarter-beat cuts (1 beat)
    for k in range(4):
        panels.append(P(B(b + k * 0.25), B(b + (k + 1) * 0.25), FULL, [nxt("c" if k % 2 else "m")], z=1.12))
    inv |= {B(b + 0.5)}
    b += 1
    # fill any spare time (fast tracks) with beat cuts so the final close-up holds ~1.5 s
    k = 0
    while NFR - B(b + 2) > 50 + q:
        a, e = B(b), B(b + 1)
        panels.append(P(a, e, FULL, [nxt(["m", "w", "c"][k % 3])]))
        shakes.add(a)
        whips.append((e, 1 if k % 2 else -1))
        b += 1
        k += 1
    # 9) finale: coat in the wind, whip, hooded close-up holding to the end
    a, e = B(b), B(b + 2)
    panels.append(P(a, e, FULL, [4]))
    whips.append((e, 1))
    panels.append(P(e, NFR, FULL, [11]))
    inv |= {e + 2, e + 3}
    return panels, inv, white, whips, shakes


# ---------------- render ----------------
def draw_panel(c, p, f, S):
    x, y, w, h = p.rect(f)
    if w < 2 or h < 2:
        return
    lt = f - p.a
    if p.every:
        i = min(lt // p.every, len(p.srcs) - 1)
        src, lt2 = p.srcs[i], lt - i * p.every
    else:
        src, lt2 = p.srcs[0], lt
    z = p.z + (0.14 if p.punch else 0.06 if p.every else 0) * math.exp(-lt2 / 3.0)
    fy = p.fy if p.fy is not None else (0.3 if w > h * 1.1 else 0.5)
    img = cover(S[src].frame(lt2), w, h, z, fy=fy)
    if p.enter and lt < 5:                                        # slide in from an edge
        e = 1 - ease((lt + 1) / 5)
        if p.enter == "left":
            x -= int((x + w) * e)
        elif p.enter == "right":
            x += int((W - x) * e)
        elif p.enter == "top":
            y -= int((y + h) * e)
        else:
            y += int((H - y) * e)
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 > x0 and y1 > y0:
        c[y0:y1, x0:x1] = img[y0 - y:y1 - y, x0 - x:x1 - x]


def hblur(img, k):
    acc = img.astype(np.float32)
    base = acc.copy()
    for s in range(1, k):
        acc += np.roll(base, s * 6, axis=1)
    return (acc / k).astype(np.uint8)


def main():
    args = sys.argv[1:]

    def opt(name, default=None):
        if name in args:
            i = args.index(name)
            v = args[i + 1]
            del args[i:i + 2]
            return v
        return default

    audio = opt("--audio")
    start = float(opt("--start", 0))
    bpm = float(opt("--bpm", 128))
    src, out = args
    first = 0.0
    if audio:
        bpm, first = detect_beats(audio, start)
        print(f"detected {bpm:.2f} BPM, first beat at {first:.3f}s", file=sys.stderr)
    per = FPS * 60 / bpm
    beats = [first * FPS + per * k for k in range(int(NFR / per) + 8)]
    panels, inv, white, whips, shakes = build(beats)

    S = {k: Seg(src, a, b) for k, (a, b) in SEG.items()}
    rng = np.random.default_rng(3)
    silent = out + ".silent.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-b:v", "14M",
                            "-maxrate", "18M", "-bufsize", "28M", "-pix_fmt", "yuv420p", silent],
                           stdin=subprocess.PIPE)
    for f in range(NFR):
        c = np.zeros((H, W, 3), np.uint8)
        for p in panels:
            if p.a <= f < p.b:
                draw_panel(c, p, f, S)
        for wf, d in whips:                                       # whip pan around each listed cut
            if wf - 3 <= f < wf + 3:
                k = 3 - abs(f - wf + 0.5)
                c = np.roll(hblur(c, int(4 + 3 * k)), int(d * 60 * k), axis=1)
        if any(0 <= f - s < 3 for s in shakes):                   # camera shake on hits
            dx, dy = rng.integers(-18, 19, 2)
            c = np.roll(np.roll(c, int(dx), 1), int(dy), 0)
        if f in inv:
            c = 255 - c
        if f in white:
            c = np.clip(c.astype(np.int16) + 150, 0, 255).astype(np.uint8)
        if f >= NFR - 12:
            c = (c * ((NFR - f) / 12.0)).astype(np.uint8)
        enc.stdin.write(c.tobytes())
    enc.stdin.close()
    enc.wait()

    tmp = None
    if audio is None:
        rm.BPM = bpm
        tmp = audio = out + ".wav"
        rm.placeholder_music(audio)
        start = 0.0
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", silent, "-ss", str(start), "-i", audio,
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", "15",
                    "-af", "afade=t=in:d=0.05,afade=t=out:st=14.4:d=0.6", "-movflags", "+faststart", out],
                   check=True, stdin=subprocess.DEVNULL)
    os.remove(silent)
    if tmp:
        os.remove(tmp)


if __name__ == "__main__":
    main()
