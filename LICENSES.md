# Лицензии

Собственный код NOIR CAPTIONS — лицензия пока не выбрана (все права принадлежат автору).

Зависимости (проверьте актуальные лицензии перед коммерческим распространением):

| Компонент | Лицензия (по информации авторов) |
|---|---|
| faster-whisper | MIT |
| CTranslate2 | MIT |
| PyAV (`av`) | BSD-3-Clause (включает FFmpeg, LGPL) |
| huggingface_hub, tokenizers | Apache-2.0 |
| numpy | BSD-3-Clause |
| onnxruntime | MIT |
| Модели Whisper (OpenAI) и конверсии Systran | MIT |
| NVIDIA cuBLAS / cuDNN (pip-пакеты `nvidia-*`) | NVIDIA Software License — не часть репозитория, ставятся из PyPI на компьютер пользователя |
| Шрифты в пресетах (Montserrat, Inter, Bodoni Moda, Playfair Display) | SIL OFL (не входят в репозиторий; пользователь ставит сам) |
| Шрифты интерфейса панели (`cep/fonts`: Inter, Montserrat, Unbounded) | SIL OFL (тексты лицензий рядом) |
| Иконки панели (`cep/js/icons.js`, часть Lucide 0.460.0) | ISC (`cep/icons/LICENSE-lucide.txt`) |
| Детектор лиц YuNet (`recognition/models/face_detection_yunet_2023mar.onnx`, OpenCV Zoo) | MIT |

Перед продажей: убедиться в условиях redistribution для CUDA-библиотек (рекомендуется не включать их в поставку,
а ставить с PyPI, как сейчас) и выбрать лицензию собственного кода.
Звуки `sfx/**/*.wav` сгенерированы скриптом `sfx/generate_sfx.py` (синтез, без сторонних сэмплов) — ограничений нет.
Видео-референсы в корне репозитория принадлежат их авторам и используются только для разработки;
перед публичным распространением их нужно убрать.
