# Установка NOIR CAPTIONS (Windows 11 + After Effects)

Всё работает локально: без аккаунтов, платных API и телеметрии. Интернет нужен только для скачивания
программ и модели распознавания. Ваше аудио и видео никуда не отправляются.

## Что нужно
- Windows 11, After Effects 2024 или новее (список шрифтов в панели — с AE 24.0).
- Видеокарта NVIDIA (желательно, 6+ ГБ); без неё распознавание идёт на процессоре, медленнее.
- ~6 ГБ свободного места (Python-окружение ~3 ГБ с CUDA + модель 0.5–3 ГБ).
- Git и Python 3.12.

## По порядку

### 1. Скачать проект
```
cd C:\Users\<имя>
git clone https://github.com/daniilmityashkin-cell/edit.git
cd edit
git checkout noir-captions-stage1
```
(Без Git: на GitHub выберите ветку `noir-captions-stage1` → Code → Download ZIP и распакуйте в `C:\Users\<имя>\edit`.)

### 2. Python 3.12
https://www.python.org/downloads/ → при установке отметьте **Add python.exe to PATH**.
Проверка: `py -3.12 --version`.

### 3. Движок распознавания
В PowerShell из папки проекта:
```
powershell -ExecutionPolicy Bypass -File recognition\setup_windows.ps1
```
Скрипт создаёт `.venv` внутри проекта и ставит faster-whisper (и CUDA-библиотеки для NVIDIA).
Системные настройки, драйверы и PATH не меняются. В конце должно быть:
`faster-whisper 1.2.1 | CUDA устройств: 1` (0 — значит работать будет на CPU).

### 4. Скачать модель (один раз)
```
.venv\Scripts\python.exe recognition\download_model.py small
.venv\Scripts\python.exe recognition\download_model.py large-v3
```
`small` (~0.5 ГБ) — для быстрой проверки, `large-v3` (~3 ГБ) — максимум точности,
`large-v3-turbo` (~1.6 ГБ) — компромисс. Видно прогресс; можно прервать и запустить снова — докачает.
Модели лежат в `C:\Users\<имя>\.cache\huggingface\hub`.

### 5. Установить панель в After Effects
PowerShell **от имени администратора**, из папки проекта:
```
powershell -ExecutionPolicy Bypass -File scripts\install_panel.ps1
```
Либо вручную скопируйте `ae\NOIR Captions.jsx` в
`C:\Program Files\Adobe\Adobe After Effects <версия>\Support Files\Scripts\ScriptUI Panels\`.

### 6. Настройки AE
`Edit → Preferences → Scripting & Expressions`:
- включить **Allow Scripts to Write Files and Access Network** (обязательно: иначе панель не запустит Python);
- по желанию выключить **Warn User When Executing Files**, чтобы AE не спрашивал разрешение при каждом распознавании.

Перезапустите AE.

### 7. Первый запуск
`Window → NOIR Captions.jsx`. При первом открытии панель спросит папку проекта — впишите в поле
«Папка» внизу окна `C:\Users\<имя>\edit` и нажмите OK (запомнится).

### 8. Проверка
1. Откройте композицию, выделите слой со звуком.
2. Вкладка «Речь» → язык «Русский» → «Распознать речь».
3. Вкладка «Текст» — проверьте распознанное.
4. Вкладка «Стиль» → пресет → «Создать субтитры» (кнопка сверху).

## Обновление
```
cd C:\Users\<имя>\edit
git pull
```
и перезапустить AE. Код панели грузится из папки проекта, поэтому копировать файлы заново обычно не нужно.
Файл `ae\NOIR Captions.jsx` (загрузчик) менялся редко — если в CHANGELOG сказано, что он обновлён,
запустите `scripts\install_panel.ps1` ещё раз.

## Резервная копия
- **Код**: всё на GitHub. Зафиксированные версии — ветки `backup/v…`
  (например `backup/v0.4.0-2026-10-29`); вернуться: `git checkout backup/v0.4.0-2026-10-29`.
  Скачать архивом: на GitHub выберите ветку → Code → Download ZIP.
- **Ваши пресеты стилей и звуки** лежат ВНЕ проекта и в Git не попадают:
  `C:\Users\<имя>\AppData\Roaming\NOIR Captions\styles\*.json` и `...\NOIR Captions\sfx\` — скопируйте эти папки в надёжное место.
- Настройки панели хранятся в настройках AE и восстанавливаются сами при первом запуске (стиль по умолчанию).
- Модели можно не бэкапить — скачиваются заново.

## Удаление
1. Удалить `NOIR Captions.jsx` из `...\Scripts\ScriptUI Panels\`.
2. Удалить папку проекта `C:\Users\<имя>\edit` (вместе с `.venv`).
3. По желанию: `%TEMP%\NOIR_Captions` (временные файлы), модели в
   `C:\Users\<имя>\.cache\huggingface\hub\models--Systran--faster-whisper-*`, свои пресеты в
   `%APPDATA%\NOIR Captions`.
Создаваемые субтитры — обычные слои AE; они остаются в проектах и без панели.

## Переустановка с нуля
Удалить `.venv`, затем повторить шаги 3–5. Модели и пресеты сохраняются.
