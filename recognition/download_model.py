r"""NOIR CAPTIONS — скачивание модели распознавания (с прогрессом, вне After Effects).

    .venv\Scripts\python.exe recognition\download_model.py large-v3

Модели: large-v3 (~3 ГБ), large-v3-turbo (~1.6 ГБ), medium (~1.5 ГБ), small (~0.5 ГБ).
Скачивание можно прерывать и запускать снова — докачает с того же места.
Качается только модель с Hugging Face; ваши файлы никуда не отправляются.
"""
import sys

from faster_whisper.utils import download_model

MODELS = ["large-v3", "large-v3-turbo", "medium", "small"]


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "large-v3"
    if name not in MODELS:
        print("Неизвестная модель: %s. Доступны: %s" % (name, ", ".join(MODELS)))
        return 2
    print("Скачиваю модель %s ..." % name)
    path = download_model(name)
    print("\nГотово: %s" % path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
