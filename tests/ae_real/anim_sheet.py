"""Contact sheets from frames_tmp/manifest.json (made by anim.jsx): 270 px wide frames, 8 per row, time label on each."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
here = os.path.dirname(os.path.abspath(__file__)); fr = os.path.join(here, "frames_tmp")
man = json.load(open(os.path.join(fr, "manifest.json"), encoding="utf-8"))
try: font = ImageFont.truetype("arial.ttf", 22)
except Exception: font = ImageFont.load_default()
for key, out in (("in", "anim_in.png"), ("accent", "anim_accent.png"), ("out", "anim_out.png")):
    s = man["sets"][key]; frames = [f for f in s["frames"] if f["saved"]]
    W = 270; ims = []
    for f in frames:
        im = Image.open(os.path.join(fr, f["file"])).convert("RGB"); h = round(im.height * W / im.width); ims.append((f, im.resize((W, h), Image.LANCZOS)))
    h = ims[0][1].height; cols = 8; rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (W + 4), rows * (h + 4)), (40, 0, 40)); d = ImageDraw.Draw(sheet)
    for i, (f, im) in enumerate(ims):
        x, y = (i % cols) * (W + 4), (i // cols) * (h + 4); sheet.paste(im, (x, y))
        rel = f["t"] - (s["inPoint"] if key != "out" else s["outPoint"])
        d.text((x + 6, y + 6), "%+.3f s (t=%.3f)" % (rel, f["t"]), fill=(255, 220, 0), font=font)
    sheet.save(os.path.join(here, out)); print(out, sheet.size, len(ims), "frames;", s["layer"], "in", s["inPoint"], "out", s["outPoint"])
