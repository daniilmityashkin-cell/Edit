"""Run with .venv Python: python -m unittest discover -s tests -p test_preview_audio.py."""
from pathlib import Path
import sys
import tempfile
import unittest
import wave

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from recognition.preview_audio import extract


class AudioPreviewTests(unittest.TestCase):
    def test_extract_interval_and_channels(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            tone = (np.sin(np.arange(96000) * 2 * np.pi * 440 / 48000) * 12000).astype("<i2")
            with wave.open(str(root / "source.wav"), "wb") as audio:
                audio.setparams((2, 2, 48000, 0, "NONE", "not compressed"))
                audio.writeframes(np.column_stack([tone, tone]).tobytes())
            count = extract(str(root / "source.wav"), root / "phrase.wav", 0.5, 0.9)
            self.assertAlmostEqual(count, 6400, delta=1)
            with wave.open(str(root / "phrase.wav")) as audio:
                self.assertEqual(audio.getnchannels(), 1)
                self.assertEqual(audio.getframerate(), 16000)
                self.assertEqual(audio.getnframes(), count)
                self.assertGreater(np.abs(np.frombuffer(audio.readframes(count), dtype="<i2")).max(), 1000)

    def test_reject_invalid_interval(self):
        for start, end in [(1, 0), (-1, 2), (0, 121)]:
            with self.assertRaises(ValueError):
                extract("unused", "unused", start, end)


if __name__ == "__main__":
    unittest.main()
