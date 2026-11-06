"""face_box.py on a real face (scikit-image astronaut) and on an empty frame. Skipped when av / OpenCV 4 / scikit-image are missing."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

try:
    import av
    import cv2
    import numpy as np
    from skimage import data
    HAVE = hasattr(cv2, "CascadeClassifier")
except Exception:
    HAVE = False

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def make_video(path, frame, n=10):
    container = av.open(path, "w")
    stream = container.add_stream("libx264", rate=10)
    stream.height, stream.width, stream.pix_fmt = frame.shape[0], frame.shape[1], "yuv420p"
    for _ in range(n):
        for packet in stream.encode(av.VideoFrame.from_ndarray(frame, format="rgb24")):
            container.mux(packet)
    for packet in stream.encode():
        container.mux(packet)
    container.close()


def run(video, t, tmp):
    job, status = os.path.join(tmp, "job.json"), os.path.join(tmp, "status.json")
    with open(job, "w", encoding="utf-8") as f:
        json.dump({"input": video, "time": t, "status": status}, f)
    subprocess.run([sys.executable, os.path.join(ROOT, "recognition", "face_box.py"), job], check=True)
    with open(status, encoding="utf-8") as f:
        return json.load(f)


@unittest.skipUnless(HAVE, "needs av, opencv-python-headless<5, scikit-image")
class FaceBox(unittest.TestCase):
    def test_finds_face_and_reports_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            frame = np.zeros((1280, 720, 3), np.uint8)
            frame[:] = (40, 60, 90)
            frame[100:820] = cv2.resize(data.astronaut(), (720, 720))
            make_video(os.path.join(tmp, "face.mp4"), frame)
            make_video(os.path.join(tmp, "blank.mp4"), np.full((1280, 720, 3), (40, 60, 90), np.uint8))
            r = run(os.path.join(tmp, "face.mp4"), 0.5, tmp)
            self.assertEqual(r["state"], "done"); self.assertTrue(r["found"])
            b = r["box"]
            self.assertTrue(0 <= b["x"] < b["x"] + b["w"] <= 1 and 0 <= b["y"] < b["y"] + b["h"] <= 1)
            self.assertTrue(0.05 < b["y"] + b["h"] / 2 < 0.35, b)      # the face is in the upper part of the frame
            r2 = run(os.path.join(tmp, "blank.mp4"), 0.2, tmp)
            self.assertEqual((r2["state"], r2["found"]), ("done", False))
            r3 = run(os.path.join(tmp, "missing.mp4"), 0, tmp)
            self.assertEqual(r3["state"], "error")


if __name__ == "__main__":
    unittest.main()
