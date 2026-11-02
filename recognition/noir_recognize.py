"""NOIR CAPTIONS — локальное распознавание речи.

Берёт аудио/видео файл, распознаёт речь faster-whisper'ом и пишет JSON
в формате noir-captions/1 (см. docs/ARCHITECTURE.md).

Время в JSON — секунды от начала ИСХОДНОГО файла (не композиции).
Пересчёт в время композиции делает After Effects.

Пример:
    python noir_recognize.py --input clip.mp4 --output out.json --language ru
    python noir_recognize.py --input clip.mp4 --output out.json --start 3.5 --end 18
    python noir_recognize.py --job job.json   # так запускает After Effects

--job: JSON-файл с теми же ключами (input, output, status, model, ...).
Через файл, а не командную строку — чтобы кириллица в путях не ломалась в cmd.

Ход работы пишется в --status (JSON), чтобы AE мог показывать этап.
Содержимое речи в лог не пишется.
"""
import argparse
import json
import os
import sys
import time
import traceback

SCHEMA = "noir-captions/1"
SAMPLE_RATE = 16000
_DLL_HANDLES = []  # держим ссылки, чтобы каталоги DLL не отключились


def add_cuda_dll_dirs():
    """На Windows pip-пакеты nvidia-* кладут DLL в site-packages/nvidia/*/bin,
    которых нет в PATH. Без этого CTranslate2 не находит cuBLAS/cuDNN."""
    if os.name != "nt":
        return
    for base in sys.path:
        nv = os.path.join(base, "nvidia")
        if not os.path.isdir(nv):
            continue
        for sub in os.listdir(nv):
            bin_dir = os.path.join(nv, sub, "bin")
            if os.path.isdir(bin_dir):
                _DLL_HANDLES.append(os.add_dll_directory(bin_dir))
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")


class Status:
    def __init__(self, path):
        self.path = path

    def write(self, state, message="", progress=None, **extra):
        if not self.path:
            return
        data = {"state": state, "message": message, "progress": progress,
                "time": time.time(), "pid": os.getpid()}
        data.update(extra)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, self.path)


def pick_device(requested):
    if requested != "auto":
        return requested
    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() > 0:
            return "cuda"
    except Exception:
        pass
    return "cpu"


def clean_words(raw_words, offset, warnings):
    """Нормализует слова: сдвиг на offset, нулевые/отрицательные длительности,
    наложения, пустые токены."""
    words = []
    for w in raw_words:
        text = w.word.strip()
        if not text:
            continue
        start = float(w.start) + offset
        end = float(w.end) + offset
        if end < start:
            start, end = end, start
        if words and start < words[-1]["end"]:
            # наложение с предыдущим словом — режем по середине
            mid = (start + words[-1]["end"]) / 2.0
            words[-1]["end"] = max(words[-1]["start"] + 0.01, mid)
            start = max(start, words[-1]["end"])
        if end - start < 0.04:
            end = start + 0.04
            warnings.append({"code": "short_word", "start": round(start, 3)})
        words.append({
            "text": text,
            "start": round(start, 3),
            "end": round(end, 3),
            "conf": round(float(w.probability), 3),
        })
    return words


def run(args):
    status = Status(args.status)
    warnings = []

    status.write("loading_audio", "Чтение аудио")
    if not os.path.isfile(args.input):
        raise FileNotFoundError("Файл не найден: " + args.input)

    from faster_whisper import decode_audio
    audio = decode_audio(args.input, sampling_rate=SAMPLE_RATE)
    total = len(audio) / SAMPLE_RATE

    start = max(0.0, args.start or 0.0)
    end = min(total, args.end) if args.end else total
    if end - start < 0.1:
        raise ValueError("Пустой диапазон аудио: %.2f–%.2f с" % (start, end))
    audio = audio[int(start * SAMPLE_RATE):int(end * SAMPLE_RATE)]

    device = pick_device(args.device)
    compute_type = args.compute_type or ("float16" if device == "cuda" else "int8")
    status.write("loading_model", "Загрузка модели %s (%s)" % (args.model, device),
                 device=device)

    from faster_whisper import WhisperModel
    try:
        model = WhisperModel(args.model, device=device, compute_type=compute_type)
    except Exception as e:
        if device == "cuda":
            warnings.append({"code": "gpu_failed", "message": str(e)[:300]})
            device, compute_type = "cpu", "int8"
            status.write("loading_model", "GPU недоступна, загрузка на CPU", device=device)
            model = WhisperModel(args.model, device=device, compute_type=compute_type)
        else:
            raise

    status.write("transcribing", "Распознавание", progress=0.0, device=device)
    segments_iter, info = model.transcribe(
        audio,
        language=None if args.language == "auto" else args.language,
        beam_size=args.beam_size,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,  # меньше «зацикливаний» и выдуманного текста
        initial_prompt=args.prompt or None,
    )

    segments = []
    span = end - start
    for i, seg in enumerate(segments_iter):
        words = clean_words(seg.words or [], start, warnings)
        if not words:
            continue
        segments.append({
            "id": "s%d" % (i + 1),
            "start": words[0]["start"],
            "end": words[-1]["end"],
            "text": seg.text.strip(),
            "words": words,
        })
        status.write("transcribing", "Распознавание",
                     progress=round(min(1.0, (seg.end) / span), 3), device=device)

    if not segments:
        warnings.append({"code": "empty", "message": "Речь не найдена"})

    result = {
        "schema": SCHEMA,
        "language": info.language,
        "source": {"file": os.path.abspath(args.input), "start": round(start, 3),
                   "end": round(end, 3), "duration": round(total, 3)},
        "engine": {"name": "faster-whisper", "model": args.model, "device": device,
                   "compute_type": compute_type},
        "segments": segments,
        "warnings": warnings,
    }
    tmp = args.output + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    os.replace(tmp, args.output)
    status.write("done", "Готово: слов — %d" % sum(len(s["words"]) for s in segments),
                 progress=1.0, device=device)


def main():
    p = argparse.ArgumentParser(description="NOIR CAPTIONS speech recognition")
    p.add_argument("--job", default="", help="JSON-файл задания (перекрывает аргументы)")
    p.add_argument("--input", default="")
    p.add_argument("--output", default="")
    p.add_argument("--status", default="")
    p.add_argument("--language", default="ru")
    p.add_argument("--model", default="large-v3")
    p.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    p.add_argument("--compute-type", default="")
    p.add_argument("--beam-size", type=int, default=5)
    p.add_argument("--start", type=float, default=0.0, help="начало диапазона в файле, с")
    p.add_argument("--end", type=float, default=0.0, help="конец диапазона в файле, с (0 = до конца)")
    p.add_argument("--prompt", default="", help="словарь имён/терминов подсказкой модели")
    args = p.parse_args()
    if args.job:
        with open(args.job, encoding="utf-8") as f:
            for k, v in json.load(f).items():
                setattr(args, k.replace("-", "_"), v)
    if not args.input or not args.output:
        p.error("нужны --input и --output (или --job)")

    add_cuda_dll_dirs()
    try:
        run(args)
    except Exception as e:
        msg = str(e)
        if "out of memory" in msg.lower():
            msg = "Не хватило памяти видеокарты. Выберите модель меньше или CPU. (" + msg[:200] + ")"
        Status(args.status).write("error", msg, trace=traceback.format_exc()[-2000:])
        print("ERROR: " + msg, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
