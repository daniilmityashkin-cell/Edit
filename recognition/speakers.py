"""NOIR CAPTIONS — who speaks: two voices, told apart on this computer (numpy only, no network, no extra models).

Each recognized phrase gets a voice print: the timbre (MFCC mean and spread over its voiced frames) and the pitch (median F0).
The phrases are split into two groups by k-means; if the two groups are not clearly different (one person talking, or two
very similar voices) nothing is marked — better no colours than wrong ones. Speaker 0 is whoever speaks first.

Honest limits: it works per phrase (a phrase where both talk goes to one of them), and two voices of the same kind
(two men with similar voices) may not be told apart. The user can switch a phrase to the other speaker in the panel.
"""
import numpy as np

SR = 16000
WIN, HOP, NFFT, NMEL, NCEP = 640, 160, 1024, 40, 20


def _mel_bank():
    def hz2mel(f):
        return 2595.0 * np.log10(1.0 + f / 700.0)

    def mel2hz(m):
        return 700.0 * (10 ** (m / 2595.0) - 1.0)

    pts = mel2hz(np.linspace(hz2mel(80.0), hz2mel(7600.0), NMEL + 2))
    bins = np.floor((NFFT + 1) * pts / SR).astype(int)
    bank = np.zeros((NMEL, NFFT // 2 + 1))
    for m in range(1, NMEL + 1):
        a, b, c = bins[m - 1], bins[m], bins[m + 1]
        for k in range(a, b):
            bank[m - 1, k] = (k - a) / max(1, b - a)
        for k in range(b, c):
            bank[m - 1, k] = (c - k) / max(1, c - b)
    return bank


_BANK = _mel_bank()
_DCT = np.cos(np.pi / NMEL * (np.arange(NMEL)[None, :] + 0.5) * np.arange(1, NCEP)[:, None])   # cepstra 1..19 (no energy)


def _frames(x):
    n = 1 + max(0, (len(x) - WIN) // HOP)
    idx = np.arange(WIN)[None, :] + HOP * np.arange(n)[:, None]
    return x[idx] * np.hanning(WIN)[None, :]


def _pitch(fr):
    """Median F0 of voiced frames, YIN (cumulative mean normalised difference: no octave jumps like plain autocorrelation)."""
    lo, hi = SR // 400, SR // 70
    f0 = []
    for f in fr[:: max(1, len(fr) // 120)]:
        f = f - f.mean()
        if (f ** 2).sum() <= 1e-9:
            continue
        n = len(f) - hi
        d = np.array([((f[:n] - f[t:t + n]) ** 2).sum() for t in range(hi + 1)])
        cm = d[1:] * np.arange(1, hi + 1) / np.maximum(np.cumsum(d[1:]), 1e-12)
        cand = np.where(cm[lo - 1:] < 0.15)[0]
        if len(cand):
            t = cand[0] + lo - 1
            while t + 1 < len(cm) and cm[t + 1] < cm[t]:
                t += 1
        else:
            t = int(np.argmin(cm[lo - 1:])) + lo - 1
            if cm[t] > 0.35:
                continue
        f0.append(SR / (t + 1))
    return float(np.median(f0)) if len(f0) >= 3 else 0.0


def voice_print(x):
    """Feature vector of one stretch of audio, or None if it is too short / silent."""
    if len(x) < int(0.35 * SR):
        return None
    fr = _frames(x.astype(np.float64))
    energy = (fr ** 2).sum(axis=1)
    if energy.max() <= 1e-8:
        return None
    voiced = fr[energy > np.percentile(energy, 40)]
    if len(voiced) < 8:
        return None
    spec = np.abs(np.fft.rfft(voiced, NFFT)) ** 2
    mel = np.log(spec @ _BANK.T + 1e-10)
    cep = mel @ _DCT.T
    f0 = _pitch(voiced)
    return np.concatenate([cep.mean(axis=0), cep.std(axis=0), [np.log(f0) if f0 > 0 else np.nan]])


def _kmeans2(X, seeds=8):
    best = None
    rng = np.random.RandomState(7)
    for _ in range(seeds):
        c = X[rng.choice(len(X), 2, replace=False)]
        for _ in range(50):
            d = ((X[:, None, :] - c[None, :, :]) ** 2).sum(axis=2)
            lab = d.argmin(axis=1)
            if lab.min() == lab.max():
                break
            nc = np.array([X[lab == j].mean(axis=0) for j in range(2)])
            if np.allclose(nc, c):
                break
            c = nc
        inertia = ((X - c[lab]) ** 2).sum()
        if lab.min() != lab.max() and (best is None or inertia < best[0]):
            best = (inertia, lab)
    return None if best is None else best[1]


def _silhouette(X, lab):
    d = np.sqrt(((X[:, None, :] - X[None, :, :]) ** 2).sum(axis=2))
    s = []
    for i in range(len(X)):
        same, other = lab == lab[i], lab != lab[i]
        same[i] = False
        if not same.any() or not other.any():
            continue
        a, b = d[i, same].mean(), d[i, other].mean()
        s.append((b - a) / max(a, b, 1e-9))
    return float(np.mean(s)) if s else 0.0


def assign_speakers(audio, segments, offset=0.0, min_score=0.12):
    """audio: float32 mono 16 kHz starting at `offset` seconds of the file; segments: noir-captions segments (times in file
    seconds). Sets seg["speaker"] = 0/1 when two voices are found. Returns {"speakers": 1|2, "score": float}."""
    prints, idx = [], []
    for i, s in enumerate(segments):
        a = int(max(0.0, s["start"] - offset) * SR)
        b = int(max(0.0, s["end"] - offset) * SR)
        v = voice_print(audio[a:b])
        if v is not None:
            prints.append(v)
            idx.append(i)
    if len(prints) < 3:
        return {"speakers": 1, "score": 0.0}
    X = np.array(prints)
    raw = X.copy()
    col = X[:, -1]
    X[np.isnan(col), -1] = np.nanmedian(col) if np.isfinite(col).any() else 0.0
    X = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-9)
    X[:, -1] *= 3.0                         # pitch is the strongest single cue
    lab = _kmeans2(X)
    if lab is None:
        return {"speakers": 1, "score": 0.0}
    score = _silhouette(X, lab)
    durs = np.array([segments[i]["end"] - segments[i]["start"] for i in idx])
    share = min(durs[lab == 0].sum(), durs[lab == 1].sum()) / max(1e-9, durs.sum())
    # Clustering always finds two groups; they are two PEOPLE only if the voices really differ: the pitch of the groups
    # (in semitones) or the timbre (distance of the mean MFCC against their spread inside the groups).
    f = raw[:, -1]
    fa, fb = f[(lab == 0) & np.isfinite(f)], f[(lab == 1) & np.isfinite(f)]
    semis = abs(np.median(fa) - np.median(fb)) * 12 / np.log(2) if len(fa) and len(fb) else 0.0
    m = raw[:, :NCEP - 1]
    within = np.sqrt((m[lab == 0].var(axis=0) + m[lab == 1].var(axis=0)) / 2 + 1e-9)
    timbre = float(np.sqrt((((m[lab == 0].mean(axis=0) - m[lab == 1].mean(axis=0)) / within) ** 2).mean()))
    info = {"score": round(score, 3), "pitch_semitones": round(float(semis), 2), "timbre": round(timbre, 2)}
    # (the user switched «two speakers» on, so a real difference in either is enough; a single voice shows neither)
    if score < min_score or share < 0.08 or (semis < 1.5 and timbre < 4.0):
        info["speakers"] = 1
        return info
    first = lab[0]
    by = {idx[k]: int(lab[k] != first) for k in range(len(idx))}
    last = 0
    for i, s in enumerate(segments):         # short phrases without a print take the previous speaker
        last = by.get(i, last)
        s["speaker"] = last
    info["speakers"] = 2
    return info
