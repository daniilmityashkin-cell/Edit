"""Caption style from a reference video: a synthetic clip with known captions, and the reference clips in the project root.
    python3 tests/test_style_video.py"""
import json, os, sys, tempfile
import numpy as np
import cv2
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "recognition"))
from style_from_video import analyse

ok = True
def check(name, cond):
    global ok
    print(("  ok  " if cond else "  FAIL ") + name); ok &= bool(cond)

# 1080×1920-like clip (270×480): moving gradient background, white CAPS captions, 2 words, centred at 70% height, hard cuts
tmp = os.path.join(tempfile.mkdtemp(), "synthetic.mp4")
vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), 24, (270, 480))
words = ["HELLO WORLD", "BIG MONEY", "NOIR STYLE", "TRY THIS", "WATCH NOW", "MAKE IT", "SO EASY", "RIGHT HERE"]
rng = np.random.RandomState(3)
for f in range(24 * 8):
    y, x = np.mgrid[0:480, 0:270]
    img = np.dstack([(60 + 40 * np.sin((x + f * 3) / 40.0)), (50 + 30 * np.cos((y + f) / 55.0)), 70 + 0 * x]).astype(np.uint8)
    img = cv2.GaussianBlur(img + rng.randint(0, 12, img.shape).astype(np.uint8), (3, 3), 0)
    text = words[(f // 24) % len(words)]
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_DUPLEX, 0.9, 2)
    cv2.putText(img, text, ((270 - tw) // 2, int(480 * 0.70 + th / 2)), cv2.FONT_HERSHEY_DUPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
    vw.write(img[..., ::-1])
vw.release()
r = analyse(tmp)
print("   ", r.get("report"))
st = r.get("style", {})
check("synthetic: captions found", r["found"])
check("synthetic: height ≈ 70%% (%s)" % st.get("posY"), abs(st.get("posY", 0) - 70) < 5)
check("synthetic: white", min(st.get("color", [0])) > 0.8)
check("synthetic: capitals", st.get("caps") is True)
check("synthetic: 2 words on screen (%s)" % st.get("maxWords"), st.get("maxWords") == 2)
check("synthetic: hard cut", st.get("animIn") == "none")

# zoom-in entrance: every word lands from 170% to 100% over 4 frames (24 fps) — like Street Talk accents
tmp2 = os.path.join(tempfile.mkdtemp(), "zoom.mp4")
vw = cv2.VideoWriter(tmp2, cv2.VideoWriter_fourcc(*"mp4v"), 24, (270, 480))
for f in range(24 * 8):
    img = np.full((480, 270, 3), 40, np.uint8); img[:, :, 2] = 60
    text, k = words[(f // 24) % len(words)].split()[0], f % 24
    sc = 0.9 * (1.7 - 0.7 * min(1.0, k / 4.0))
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_DUPLEX, sc, 2)
    cv2.putText(img, text, ((270 - tw) // 2, int(480 * 0.5 + th / 2)), cv2.FONT_HERSHEY_DUPLEX, sc, (255, 255, 255), 2, cv2.LINE_AA)
    vw.write(img[..., ::-1])
vw.release()
r = analyse(tmp2)
check("zoom entrance detected (%s)" % r.get("style", {}).get("animIn"), r["found"] and r["style"]["animIn"] == "zoomBlur")

refs = {"1774639922519426331.mp4": True, "-1185032360033910595.mp4": False, "5370295588757133741.mp4": False, "-8540180581903458381.mp4": False}
for name, has in refs.items():
    p = os.path.join(ROOT, name)
    if not os.path.exists(p):
        continue
    r = analyse(p)
    check("%s: captions %s" % (name, "found" if has else "not found (scene text only)"), r["found"] == has)
    if has:
        st = r["style"]
        check("%s: red caps, one word, top of the frame (%s)" % (name, r["report"][2]), st["caps"] and st["color"][0] > 0.6 and st["color"][1] < 0.2 and st["maxWords"] == 1 and st["posY"] < 25)
sys.exit(0 if ok else 1)
