"""Left/right margin of the caption text in frames_tmp/center*.png (dark background 0.08,0.08,0.12) and the offset from the frame centre."""
import json, os
from PIL import Image, ImageChops
here = os.path.dirname(os.path.abspath(__file__)); fr = os.path.join(here, "frames_tmp")
man = json.load(open(os.path.join(fr, "manifest.json"), encoding="utf-8")); out = {}
for key in ("center", "center_first"):
    s = man["sets"][key]; f = s["frames"][0]; im = Image.open(os.path.join(fr, f["file"])).convert("RGB"); W, H = im.size
    bg = im.getpixel((5, 5)); diff = ImageChops.difference(im, Image.new("RGB", im.size, bg)).convert("L").point(lambda v: 255 if v > 24 else 0)
    bb = diff.getbbox()
    if not bb: out[key] = {"layer": s["layer"], "t": f["t"], "note": "no text pixels (caption already faded out)"}; print(key, out[key]); continue
    l, t, r, b = bb
    out[key] = {"layer": s["layer"], "t": f["t"], "size": [W, H], "bbox": [l, t, r, b], "left_margin": l, "right_margin": W - r, "offset_from_center_px": round((l + r) / 2 - W / 2, 1), "text_center_y": (t + b) / 2}
    print(key, out[key])
json.dump(out, open(os.path.join(here, "center_measure.json"), "w"), ensure_ascii=False, indent=1)
