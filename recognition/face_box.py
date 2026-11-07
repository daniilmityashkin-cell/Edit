"""NOIR CAPTIONS - find the largest face in ONE video frame (to keep subtitles off the face).

Runs only on this computer. Usage (After Effects starts it): python face_box.py job.json
job.json: {"input": "video file", "time": seconds in the source file, "status": "status.json to write"}
The result is written to the status file:
  {"state": "done", "found": true, "box": {"x":..,"y":..,"w":..,"h":..}, "frame": [w, h], "faces": n}   (box in fractions of the frame)
  {"state": "error", "message": "..."}
Needs OpenCV: pip install opencv-python-headless  (see recognition/requirements-face.txt)
"""
import json
import os
import sys


def write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def display_rotation(stream):
    """Clockwise degrees the player turns the stored picture (phone videos are often stored sideways)."""
    try:
        r = stream.metadata.get("rotate")
        if r is not None:
            return int(float(r)) % 360
    except Exception:
        pass
    try:  # newer FFmpeg: display matrix side data
        for sd in getattr(stream, "side_data", {}) or {}:
            if "DISPLAYMATRIX" in str(sd).upper():
                return int(round(-float(stream.side_data[sd]))) % 360
    except Exception:
        pass
    return 0


def grab_frames(path, times):
    """RGB frames (as shown by a player) at the given seconds; missing ones are skipped."""
    import av
    import numpy as np
    out = []
    with av.open(path) as container:
        if not container.streams.video:
            raise ValueError("В файле нет видео (только звук).")
        stream = container.streams.video[0]
        rot = display_rotation(stream)
        for t in times:
            try:
                container.seek(int(max(0.0, t) / float(stream.time_base)), stream=stream, backward=True, any_frame=False)
            except Exception:
                continue
            last = None
            for i, frame in enumerate(container.decode(stream)):
                last = frame
                if frame.time is None or frame.time + 1e-3 >= t or i > 600:
                    break
            if last is None:
                continue
            img = last.to_ndarray(format="rgb24")
            frot = getattr(last, "rotation", 0) or 0          # PyAV 14+: rotation of this frame
            r = rot or (int(-frot) % 360 if frot else 0)
            if r == 90:
                img = np.rot90(img, k=-1)
            elif r == 180:
                img = np.rot90(img, k=2)
            elif r == 270:
                img = np.rot90(img, k=1)
            out.append(np.ascontiguousarray(img))
    if not out:
        raise ValueError("Не удалось прочитать кадр.")
    return out


def grab_frame(path, t):
    return grab_frames(path, [t])[0]


YUNET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "face_detection_yunet_2023mar.onnx")


def find_faces_yunet(img):
    """YuNet (OpenCV DNN face detector, MIT licence): sees turned, small and partly lit faces that Haar cascades miss."""
    import cv2
    if not os.path.exists(YUNET) or not hasattr(cv2, "FaceDetectorYN"):
        return None
    h, w = img.shape[:2]
    scale = 960.0 / max(h, w) if max(h, w) > 960 else 1.0
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    if scale != 1.0:
        bgr = cv2.resize(bgr, (int(w * scale), int(h * scale)))
    gh, gw = bgr.shape[:2]
    det = cv2.FaceDetectorYN.create(YUNET, "", (gw, gh), 0.8, 0.3, 50)
    _, faces = det.detect(bgr)
    found = []
    if faces is not None:
        for f in faces:
            x, y, fw, fh = [int(v) for v in f[:4]]
            if fw * fh >= (0.03 * gw) ** 2:
                found.append((max(0, x), max(0, y), fw, fh))
    return found, gw, gh


def find_faces(img):
    import cv2
    got = None
    try:
        got = find_faces_yunet(img)
    except Exception:
        got = None
    if got is not None:          # YuNet ran: trust it, including "no face" (Haar cascades mistake round shapes for faces)
        return got
    h, w = img.shape[:2]
    scale = 640.0 / max(h, w) if max(h, w) > 640 else 1.0
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    if scale != 1.0:
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)))
    gray = cv2.equalizeHist(gray)
    gh, gw = gray.shape[:2]
    min_size = (max(24, int(0.05 * gw)), max(24, int(0.05 * gw)))
    found = []
    for name in ("haarcascade_frontalface_default.xml", "haarcascade_frontalface_alt2.xml", "haarcascade_profileface.xml"):
        cascade = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, name))
        if cascade.empty():
            continue
        faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=4, minSize=min_size)
        if len(faces) == 0 and "profile" in name:       # profile cascade only sees one side: try the mirrored frame
            flipped = cascade.detectMultiScale(cv2.flip(gray, 1), scaleFactor=1.08, minNeighbors=4, minSize=min_size)
            faces = [(gw - x - fw, y, fw, fh) for (x, y, fw, fh) in flipped]
        found += [tuple(int(v) for v in f) for f in faces]
        if found and "frontal" in name:
            break
    return found, gw, gh


def main(job_path):
    with open(job_path, "r", encoding="utf-8") as f:
        job = json.load(f)
    status = job["status"]
    try:
        try:
            import cv2
        except ImportError:
            write(status, {"state": "error", "message": "Для поиска лица нужен OpenCV. В PowerShell из папки проекта:\n"
                           ".venv\\Scripts\\python.exe -m pip install opencv-python-headless"})
            return
        if not hasattr(cv2, "CascadeClassifier"):
            write(status, {"state": "error", "message": "Установлен OpenCV без каскадов (версия 5). В PowerShell из папки проекта:\n"
                           ".venv\\Scripts\\python.exe -m pip install \"opencv-python-headless>=4.8,<5\""})
            return
        t = float(job.get("time", 0))
        # the exact frame first, then neighbours within a second: a blink or motion blur on one frame should not lose the face
        frames = grab_frames(job["input"], [t, t + 0.25, t - 0.25, t + 0.6, t - 0.6, t + 1.0, t - 1.0])
        img, faces, gw, gh = frames[0], [], 1, 1
        for candidate in frames:
            faces, gw, gh = find_faces(candidate)
            if faces:
                img = candidate
                break
        if not faces:
            write(status, {"state": "done", "found": False, "faces": 0, "frame": [int(img.shape[1]), int(img.shape[0])]})
            return
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        write(status, {"state": "done", "found": True, "faces": len(faces), "frame": [int(img.shape[1]), int(img.shape[0])],
                       "box": {"x": round(x / gw, 4), "y": round(y / gh, 4), "w": round(w / gw, 4), "h": round(h / gh, 4)}})
    except Exception as e:
        write(status, {"state": "error", "message": "Поиск лица: " + str(e)})


if __name__ == "__main__":
    main(sys.argv[1])
