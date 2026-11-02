"""Extract one source-time phrase for playback; no model or network needed."""
import json
import os
from pathlib import Path
import sys
import wave

import av
import numpy as np


def extract(source, output, start, end):
    start, end = float(start), float(end)
    if not 0 <= start < end:
        raise ValueError("Invalid phrase interval")
    if end - start > 120:
        raise ValueError("Phrase preview is limited to 120 seconds")
    count = 0
    with av.open(source) as container, wave.open(str(output), "wb") as target:
        if not container.streams.audio:
            raise ValueError("Source has no audio")
        stream = container.streams.audio[0]
        origin = float(stream.start_time or 0) * float(stream.time_base)
        container.seek(max(0, int((start + origin) * av.time_base)))
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        target.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        for frame in container.decode(stream):
            if frame.time is None:
                raise ValueError("Audio timestamps are unavailable")
            for chunk in resampler.resample(frame):
                time = float(chunk.time) - origin
                if time >= end:
                    if not count:
                        raise ValueError("No audio in phrase interval")
                    return count
                data = chunk.to_ndarray().reshape(-1)
                left = max(0, int(round((start - time) * 16000)))
                right = min(len(data), int(round((end - time) * 16000)))
                if right > left:
                    target.writeframes(data[left:right].astype("<i2").tobytes())
                    count += right - left
        for chunk in resampler.resample(None):
            time = float(chunk.time) - origin
            data = chunk.to_ndarray().reshape(-1)
            left = max(0, int(round((start - time) * 16000)))
            right = min(len(data), int(round((end - time) * 16000)))
            if right > left:
                target.writeframes(data[left:right].astype("<i2").tobytes())
                count += right - left
    if not count:
        raise ValueError("No audio in phrase interval")
    return count


def main():
    job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    status = Path(job["status"])
    result = {"state": "error"}
    try:
        extract(job["input"], job["output"], job["start"], job["end"])
        if os.name != "nt":
            raise RuntimeError("Playback from the AE panel requires Windows")
        os.startfile(job["output"])
        result = {"state": "done"}
    except Exception as exc:
        result["message"] = str(exc)
    finally:
        temporary = status.with_suffix(".tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, status)
    return 0 if result["state"] == "done" else 1


if __name__ == "__main__":
    raise SystemExit(main())
