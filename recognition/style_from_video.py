"""NOIR CAPTIONS — caption style from a reference video, measured on this computer (OpenCV + numpy, no network).

What it looks for: rendered captions — straight horizontal rows of letter-like shapes of one flat colour, roughly centred,
that change over time. Scene text (signs, posters) usually fails one of these tests; it is not perfect.
What it measures: height in the frame, letter height (→ font size), colours (main and accent), capitals or not, words per
screen, letter width (condensed or not), outline/shadow, and how text appears (hard cut, fade, zoom from big, pop).
What it cannot: the font itself, exact animation curves, effects — the panel takes them from the closest built-in style.

Usage: python style_from_video.py job.json   job: {"input": video, "status": status.json}
Status result: {"state": "done", "found": true, "style": {...measurements...}, "report": [...]} or {"found": false, ...}
"""
import json
import os
import sys

import numpy as np

W = 360          # analysis width
FPS = 12.0       # sampling rate


def write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def frames(path, fps=FPS, limit=60.0):
    """Downscaled RGB frames at ~fps for the first `limit` seconds, as a player shows them (rotation applied)."""
    import av
    import cv2
    from face_box import display_rotation
    out, times = [], []
    with av.open(path) as c:
        if not c.streams.video:
            raise ValueError("В файле нет видео.")
        s = c.streams.video[0]
        rot = display_rotation(s)
        nxt = 0.0
        for fr in c.decode(s):
            t = fr.time or 0.0
            if t > limit:
                break
            if t + 1e-6 < nxt:
                continue
            nxt = t + 1.0 / fps
            img = fr.to_ndarray(format="rgb24")
            if rot == 90:
                img = np.rot90(img, 3)
            elif rot == 180:
                img = np.rot90(img, 2)
            elif rot == 270:
                img = np.rot90(img, 1)
            h = int(round(img.shape[0] * W / img.shape[1]))
            out.append(cv2.resize(np.ascontiguousarray(img), (W, h), interpolation=cv2.INTER_AREA))
            times.append(t)
    return out, times


def colour_masks(img):
    """Candidate text masks: near-white, near-black, and bright saturated colours by hue (8 bins)."""
    import cv2
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    out = [("white", (v > 215) & (s < 45))]
    sat = (s > 120) & (v > 110)
    for b in range(8):
        lo, hi = b * 180 // 8, (b + 1) * 180 // 8
        out.append(("hue%d" % b, sat & (h >= lo) & (h < hi)))
    return out


def lines_in(img):
    """Text-like rows in one frame: [{y, h, x0, x1, n, words, color, caps_cv, aspect, outline}]"""
    import cv2
    H = img.shape[0]
    found = []
    for name, m in colour_masks(img):
        m8 = m.astype(np.uint8)
        n, lab, stats, cent = cv2.connectedComponentsWithStats(m8, 8)
        g = []
        for i in range(1, n):
            x, y, w, h, a = stats[i]
            if h < 0.012 * H or h > 0.2 * H or a < 10:
                continue
            ar, fill = w / float(h), a / float(w * h)
            if ar < 0.07 or ar > 2.6 or fill < 0.1 or fill > 0.92:
                continue
            if x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1:
                continue
            # letters are drawn with a thin stroke of even width: solid blobs (lamps, windows, faces) are not
            comp = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
            dt = cv2.distanceTransform(np.pad(comp, 1), cv2.DIST_L2, 3)
            sw = 2.0 * float(dt.max())
            if sw / h < 0.05 or sw / h > 0.36 or sw / max(1.0, min(w, h)) > 0.75:
                continue
            g.append((x, y, w, h, i))
        if len(g) < 2:
            continue
        g.sort(key=lambda r: (r[1] + r[3] / 2.0, r[0]))
        used = [False] * len(g)
        for i, a in enumerate(g):
            if used[i]:
                continue
            row = [a]
            used[i] = True
            cy, hh = a[1] + a[3] / 2.0, a[3]
            for j in range(i + 1, len(g)):
                b = g[j]
                if used[j]:
                    continue
                if abs(b[1] + b[3] / 2.0 - cy) < 0.45 * max(hh, b[3]) and 0.55 < b[3] / float(hh) < 1.8:
                    row.append(b)
                    used[j] = True
            row.sort(key=lambda r: r[0])
            # keep the longest run of letters that are close together
            runs, cur = [], [row[0]]
            for b in row[1:]:
                p = cur[-1]
                if b[0] - (p[0] + p[2]) < 1.6 * max(p[3], b[3]):
                    cur.append(b)
                else:
                    runs.append(cur)
                    cur = [b]
            runs.append(cur)
            run = max(runs, key=len)
            if len(run) < 2:
                continue
            hs = np.array([r[3] for r in run], float)
            bottoms = np.array([r[1] + r[3] for r in run], float)
            if np.median(np.abs(bottoms - np.median(bottoms))) > 0.12 * np.median(hs):     # letters stand on one baseline
                continue
            x0, x1 = run[0][0], run[-1][0] + run[-1][2]
            gaps = [run[k + 1][0] - (run[k][0] + run[k][2]) for k in range(len(run) - 1)]
            words = 1 + sum(1 for gp in gaps if gp > 0.42 * np.median(hs))
            pix = np.zeros(m8.shape, bool)
            for r in run:
                pix |= lab == r[4]
            col = img[pix].reshape(-1, 3)
            if len(col) < 20 or col.std(axis=0).mean() > 38:            # rendered text is one flat colour
                continue
            ring = cv2.dilate(pix.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~pix
            around = img[ring].reshape(-1, 3).mean(axis=1) if ring.any() else np.array([128.0])
            found.append({"y": (min(r[1] for r in run) + max(r[1] + r[3] for r in run)) / 2.0 / H, "h": float(np.median(hs)) / H,
                          "x0": x0 / float(W), "x1": x1 / float(W), "n": len(run), "words": words, "mask": name,
                          "color": [round(float(c) / 255.0, 3) for c in np.median(col, axis=0)],
                          "caps_cv": float(hs.std() / max(1e-6, hs.mean())),
                          "aspect": float(np.median([r[2] / float(r[3]) for r in run])),
                          "outline": float((around < 60).mean())})
    # captions sit around the middle of the width
    return [l for l in found if 0.22 < (l["x0"] + l["x1"]) / 2 < 0.78 and l["x1"] - l["x0"] > 0.06]


def analyse(path):
    imgs, times = frames(path)
    if not imgs:
        raise ValueError("Не удалось прочитать кадры.")
    per = [lines_in(im) for im in imgs]
    allL = [dict(l, f=i) for i, ls in enumerate(per) for l in ls]
    report = ["Кадров проверено: %d (%.0f с)" % (len(imgs), times[-1] if times else 0)]
    if not allL:
        return {"found": False, "report": report + ["Отрисованного текста не найдено."]}
    # caption track: lines grouped by vertical band; the band that is present often AND changes is the captions
    bands = {}
    for l in allL:
        bands.setdefault(int(l["y"] * 20), []).append(l)
    best, best_score = None, 0.0
    for k, ls in bands.items():
        fr = sorted(set(l["f"] for l in ls))
        present = len(fr) / float(len(imgs))
        sig = [(round(l["x0"], 2), round(l["x1"], 2), l["n"]) for l in sorted(ls, key=lambda q: q["f"])]
        changes = len(set(sig)) / float(len(sig))
        score = present * (0.3 + changes)
        if score > best_score:
            best, best_score = ls, score
    present = len(set(l["f"] for l in best)) / float(len(imgs))
    sig = set((round(l["x0"], 2), round(l["x1"], 2), l["n"]) for l in best)
    if present < 0.15 or len(sig) < 3:
        return {"found": False, "report": report + ["Текст есть, но он не меняется со временем — похоже на надписи в кадре, а не на субтитры."]}
    # widen to neighbouring bands with the same look (two-line captions)
    y0 = np.median([l["y"] for l in best])
    track = [l for l in allL if abs(l["y"] - y0) < 0.12]
    H_W = imgs[0].shape[0] / float(W)
    hs = np.array([l["h"] for l in track])
    # colours: cluster by the mask they came from
    by = {}
    for l in track:
        by.setdefault(l["mask"], []).append(l)
    order = sorted(by.items(), key=lambda kv: -len(kv[1]))
    main = order[0][1]
    base_color = [round(float(np.median([l["color"][c] for l in main])), 3) for c in range(3)]
    accent = None
    acc = order[1][1] if len(order) > 1 else []
    acc_sig = set((round(l["x0"], 2), round(l["x1"], 2), l["n"]) for l in acc)
    if len(acc) >= max(4, 0.25 * len(main)) and len(acc_sig) >= 3:
        accent = {"color": [round(float(np.median([l["color"][c] for l in acc])), 3) for c in range(3)],
                  "h": float(np.median([l["h"] for l in acc]))}
    h_main = float(np.median([l["h"] for l in main]))
    caps = float(np.median([l["caps_cv"] for l in main])) < 0.13
    size_1080 = h_main * 1080 * H_W / (0.72 if caps else 0.52)          # letter height → font size on a 1080-wide comp
    words = int(round(np.median([l["words"] for l in main])))
    aspect = float(np.median([l["aspect"] for l in main]))
    outline = float(np.median([l["outline"] for l in main]))
    anim = appearance(per, best)
    st = {"posY": round(float(np.median([l["y"] for l in main])) * 100, 1), "size": round(size_1080), "color": base_color, "caps": caps,
          "maxWords": max(1, min(6, words)), "condensed": aspect < 0.42, "shadow": outline > 0.55, "animIn": anim,
          "lines": 2 if len(set(int(l["y"] * 25) for l in main)) > 1 and np.ptp([l["y"] for l in main]) > 1.6 * h_main else 1}
    if accent:
        st["accent"] = {"color": accent["color"], "scale": round(accent["h"] / max(1e-6, h_main), 2)}
    report += ["Субтитры найдены на %d%% кадров" % round(present * 100),
               "Высота: %.0f%% кадра · размер ≈ %d px (кадр 1080) · %s · слов на экране ≈ %d" % (st["posY"], st["size"], "КАПС" if caps else "строчные", st["maxWords"]),
               "Цвет: #%02x%02x%02x" % tuple(int(c * 255) for c in base_color) + (" · акцент #%02x%02x%02x, ×%.1f" % (tuple(int(c * 255) for c in accent["color"]) + (st["accent"]["scale"],)) if accent else ""),
               "Появление: " + {"none": "жёсткая смена", "fade": "проявление", "zoomBlur": "влёт из крупного", "pop": "pop (вырастает)"}[anim]]
    return {"found": True, "style": st, "report": report}


def appearance(per, track):
    """How text comes in: look at the first frames after each appearance in the caption band."""
    band = set(int(l["y"] * 20) for l in track)
    seq = [[l for l in ls if int(l["y"] * 20) in band] for ls in per]
    votes = {"none": 0, "fade": 0, "zoomBlur": 0, "pop": 0}
    def sig(ls):
        return (sum(l["n"] for l in ls), min(l["x0"] for l in ls), max(l["x1"] for l in ls)) if ls else None
    for i in range(1, len(seq) - 3):
        if not seq[i]:
            continue
        a, b = sig(seq[i - 1]), sig(seq[i])
        # new text: after a gap, or the words changed (another count of letters / another width)
        if a is not None and a[0] == b[0] and abs((a[2] - a[1]) - (b[2] - b[1])) < 0.04:
            continue
        h0 = max(l["h"] for l in seq[i])
        later = [max(l["h"] for l in seq[k]) for k in range(i + 1, min(len(seq), i + 4)) if seq[k]]
        if not later:
            continue
        h1 = float(np.median(later))
        n0, n1 = sum(l["n"] for l in seq[i]), float(np.median([sum(l["n"] for l in seq[k]) for k in range(i + 1, min(len(seq), i + 4)) if seq[k]]))
        if h0 > 1.18 * h1:
            votes["zoomBlur"] += 1
        elif h0 < 0.82 * h1:
            votes["pop"] += 1
        elif n0 < 0.6 * n1:
            votes["fade"] += 1
        else:
            votes["none"] += 1
    return max(votes, key=lambda k: (votes[k], k == "none"))


def main():
    job = json.load(open(sys.argv[1], encoding="utf-8"))
    status = job.get("status", "")
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        res = analyse(job["input"])
        res["state"] = "done"
        write(status, res) if status else print(json.dumps(res, ensure_ascii=False, indent=1))
    except ImportError:
        msg = "Нужен OpenCV: запустите recognition\\setup_windows.ps1 с поиском лица (opencv-python-headless)."
        write(status, {"state": "error", "message": msg}) if status else print(msg)
    except Exception as e:
        write(status, {"state": "error", "message": str(e)[:400]}) if status else print("ERROR", e)


if __name__ == "__main__":
    main()
