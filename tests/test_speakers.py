"""Two-voice separation on synthetic speech-like audio (glottal pulses through vowel formants).
    python3 tests/test_speakers.py [extra.mp4 ...]   — with files: prints what is found in them (energy-based phrases)."""
import os, sys, subprocess
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "recognition"))
from speakers import assign_speakers, SR
from scipy.signal import lfilter

VOWELS = [(730, 1090, 2440), (270, 2290, 3010), (300, 870, 2240), (530, 1840, 2480), (570, 840, 2410), (440, 1020, 2240)]
rng = np.random.RandomState(1)

def voice(f0, k, dur):
    n = int(dur * SR); out = np.zeros(n); t = 0
    while t < n:
        sub = int(SR * rng.uniform(0.12, 0.25)); v = VOWELS[rng.randint(len(VOWELS))]
        f = f0 * rng.uniform(0.9, 1.12); src = np.zeros(sub); src[::max(1, int(SR / f))] = 1.0
        y = src
        for F in v:
            F *= k; r = np.exp(-np.pi * 90 / SR); th = 2 * np.pi * F / SR
            y = lfilter([1 - r], [1, -2 * r * np.cos(th), r * r], y)
        out[t:t + sub] = y[: n - t]; t += sub
    return out / (np.abs(out).max() + 1e-9) * 0.5 + rng.normal(0, 0.003, n)

def build(plan):
    audio, segs, t = [], [], 0.3
    audio.append(np.zeros(int(0.3 * SR)))
    for who, dur in plan:
        f0, k = (115, 1.0) if who == 0 else (215, 1.17)
        audio.append(voice(f0, k, dur)); segs.append({"start": t, "end": t + dur, "who": who}); t += dur
        gap = rng.uniform(0.2, 0.6); audio.append(np.zeros(int(gap * SR))); t += gap
    return np.concatenate(audio).astype(np.float32), segs

ok = True
def check(name, cond):
    global ok
    print(("  ok  " if cond else "  FAIL ") + name); ok &= bool(cond)

audio, segs = build([(0, 1.6), (1, 1.2), (0, 2.0), (1, 1.5), (1, 0.9), (0, 1.3), (1, 1.8), (0, 1.1)])
info = assign_speakers(audio, segs)
check("two voices found (score %.2f)" % info["score"], info["speakers"] == 2)
check("each phrase goes to the right voice", all(s["speaker"] == s["who"] for s in segs))
check("speaker 0 is the one who speaks first", segs[0]["speaker"] == 0)

audio, segs = build([(0, 1.5), (0, 1.1), (0, 2.0), (0, 1.4), (0, 0.9), (0, 1.7), (0, 1.2)])
info = assign_speakers(audio, segs)
check("one voice: nothing marked %s" % info, info["speakers"] == 1 and not any("speaker" in s for s in segs))

audio, segs = build([(0, 1.5), (1, 0.2), (0, 1.0)])
check("too little audio: nothing marked", assign_speakers(audio, segs)["speakers"] == 1)

for f in sys.argv[1:]:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    a = np.frombuffer(raw, np.float32)
    e = np.array([np.sqrt((a[i:i + 800] ** 2).mean()) for i in range(0, len(a) - 800, 800)]); on = e > max(0.01, np.percentile(e, 40))
    segs, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and (on[j] or (j + 6 < len(on) and on[j:j + 6].any())): j += 1
            if j - i > 8: segs.append({"start": i * 0.05, "end": j * 0.05})
            i = j
        i += 1
    print(os.path.basename(f), assign_speakers(a, segs), "phrases:", len(segs), "→", "".join(str(s.get("speaker", "-")) for s in segs))
sys.exit(0 if ok else 1)
