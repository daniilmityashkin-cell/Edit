/* NOIR · interface strings, RU / EN. t("key") returns the string for the current language; {name} placeholders are filled from vars.
   Host messages (status lines, errors from After Effects) are Russian for now: translating them is a later step. */
(function () {
    "use strict";
    var D = {
        "app.name": ["NOIR Captions", "NOIR Captions"],
        "nav.home": ["Главная", "Home"], "nav.video": ["Видео", "Video"], "nav.text": ["Текст", "Text"], "nav.style": ["Стиль", "Style"],
        "nav.edit": ["Правка", "Edit"], "nav.settings": ["Настройки", "Settings"],
        "state.idle": ["Выделите слой со звуком", "Select a layer with audio"], "state.busy": ["Распознавание", "Recognizing"],
        "state.scan": ["Поиск лица", "Looking for a face"], "state.dirty": ["Текст изменён", "Text changed"], "state.ready": ["Готово к созданию", "Ready to create"],
        "state.done": ["Субтитры на месте", "Captions are up to date"], "state.pending": ["Есть замечания", "Check the remarks"], "state.offline": ["Нет связи с AE", "No connection to AE"],
        "act.recognize": ["Распознать речь", "Recognize speech"], "act.cancel": ["Отменить", "Cancel"], "act.create": ["Создать субтитры", "Create captions"],
        "act.updatePhrase": ["Обновить фразу", "Update phrase"], "act.updateAll": ["Обновить все", "Update all"], "act.preview": ["Превью фразы", "Preview phrase"],
        "act.check": ["Проверить", "Check"], "act.createAnyway": ["Создать с замечаниями", "Create anyway"],
        "act.openJson": ["Открыть JSON", "Open JSON"], "act.saveJson": ["Сохранить JSON", "Save JSON"], "act.importSubs": ["Импорт SRT / VTT", "Import SRT / VTT"],
        "act.exportSrt": ["Экспорт SRT", "Export SRT"], "act.exportVtt": ["Экспорт VTT", "Export VTT"], "act.listen": ["Прослушать", "Listen"],
        "act.undo": ["Отменить правку", "Undo edit"], "act.reset": ["Сбросить текст", "Reset text"], "act.seek": ["К фразе в AE", "Go to phrase"],
        "act.accent": ["Акцент", "Accent"], "act.line": ["Перенос", "Line break"], "act.split": ["Разделить", "Split"],
        "video.title": ["Видео", "Video"], "video.lead": ["Выделите в таймлайне слой со звуком и нажмите «Распознать речь». Всё считается на этом компьютере.", "Select a layer with audio in the timeline and press “Recognize speech”. Everything runs on this computer."],
        "video.language": ["Язык речи", "Speech language"], "video.model": ["Качество", "Quality"], "video.device": ["Устройство", "Device"],
        "video.prompt": ["Имена, бренды и термины", "Names, brands and terms"], "video.promptHint": ["Через запятую — так они распознаются точнее.", "Comma-separated — helps recognition."],
        "video.other": ["Уже есть текст?", "Already have text?"],
        "text.title": ["Текст", "Text"], "text.empty": ["Сначала распознайте речь или откройте готовый текст в разделе «Видео».", "Recognize speech or open a ready text in “Video” first."],
        "text.lead": ["Одна строка — одна фраза. Выделите слово: акцент, перенос строки или разделение фразы. Тайминги слов сохраняются.", "One line is one phrase. Select a word to accent it, break the line or split the phrase. Word timings are kept."],
        "text.phrase": ["Фраза", "Phrase"], "text.words": ["Слова фразы — нажмите, чтобы исправить", "Phrase words — click to fix"], "text.low": ["Неуверенно распознано", "Low confidence"],
        "text.editor": ["Текст субтитров", "Caption text"], "text.files": ["Файлы", "Files"],
        "style.title": ["Стиль", "Style"], "style.lead": ["Выберите вид, затем подстройте размер и положение.", "Pick a look, then adjust size and position."],
        "style.all": ["Все", "All"], "style.fav": ["Избранные", "Favorites"], "style.mine": ["Мои", "Mine"], "style.favorite": ["В избранное", "Favorite"],
        "style.size": ["Размер", "Size"], "style.position": ["Положение", "Position"], "style.intensity": ["Анимация", "Motion"],
        "style.reveal": ["Появление слов", "Word reveal"], "style.layers": ["Слои", "Layers"], "style.format": ["Формат и безопасная зона", "Format and safe area"],
        "style.guides": ["Показать зону", "Show safe area"], "style.guidesOff": ["Убрать", "Remove"], "style.save": ["Сохранить как свой", "Save as mine"],
        "style.export": ["Экспорт", "Export"], "style.import": ["Импорт", "Import"], "style.name": ["Название стиля", "Style name"], "style.custom": ["Свой (изменён)", "Custom (edited)"],
        "pos.preset": ["Как в стиле", "As styled"], "pos.top": ["Вверху", "Top"], "pos.center": ["Центр", "Center"], "pos.bottom": ["Внизу", "Bottom"],
        "int.soft": ["Мягче", "Softer"], "int.normal": ["Обычно", "Normal"], "int.strong": ["Сильнее", "Stronger"],
        "edit.title": ["Правка", "Edit"], "edit.lead": ["Изменяет уже созданные субтитры. Каждое действие отменяется одним Ctrl+Z в AE.", "Changes captions already made. Every action is one Ctrl+Z in AE."],
        "edit.scope": ["Что менять", "Apply to"], "edit.place": ["Положение", "Position"], "edit.reset": ["Исходные места", "Original places"],
        "edit.move": ["Сдвиг и размер", "Move and size"], "edit.step": ["Шаг, px", "Step, px"], "edit.sizeStep": ["Шаг размера, %", "Size step, %"],
        "edit.time": ["Время", "Timing"], "edit.earlier": ["Раньше", "Earlier"], "edit.later": ["Позже", "Later"], "edit.inMinus": ["Начало −", "In −"], "edit.inPlus": ["Начало +", "In +"],
        "edit.outMinus": ["Конец −", "Out −"], "edit.outPlus": ["Конец +", "Out +"], "edit.timeStep": ["Шаг, с", "Step, s"],
        "edit.anim": ["Анимация", "Animation"], "edit.in": ["Появление", "In"], "edit.out": ["Исчезание", "Out"],
        "edit.layers": ["Слои", "Layers"], "edit.applyStyle": ["Применить текущий стиль", "Apply current style"], "edit.makeAccent": ["Сделать акцентом", "Make accent"],
        "edit.makeBase": ["Сделать обычным", "Make regular"], "edit.invert": ["Инверсия", "Invert"], "edit.reflow": ["Перекласть фразу", "Reflow phrase"],
        "edit.behind": ["За выделенным слоем", "Behind selected layer"], "edit.face": ["Лицо", "Face"], "edit.faceFind": ["Найти лицо", "Find face"],
        "edit.faceAvoid": ["Убрать с лица", "Keep off the face"], "edit.delete": ["Удалить субтитры", "Delete captions"],
        "edit.deleteAsk": ["Удалить выбранные субтитры? Отмена — Ctrl+Z в AE.", "Delete the chosen captions? Undo with Ctrl+Z in AE."],
        "edit.tools": ["Инструменты", "Tools"], "edit.counter": ["Счётчик чисел", "Number counter"], "edit.strike": ["Зачеркнуть выделенные", "Strike selected"],
        "edit.strikeRemove": ["Убрать зачёркивания", "Remove strikes"], "edit.mask": ["Видео внутри букв", "Video inside letters"], "edit.maskRemove": ["Убрать маски", "Remove masks"],
        "edit.sfx": ["Звуки", "Sounds"], "edit.sfxSelected": ["Озвучить выделенные", "Add sounds to selected"], "edit.sfxHere": ["Звук в текущее время", "Sound at current time"],
        "edit.sfxRemove": ["Убрать звуки", "Remove sounds"], "edit.sfxFolder": ["Папка звуков", "Sound folder"], "edit.sfxFile": ["Звук", "Sound"],
        "set.title": ["Настройки", "Settings"], "set.font": ["Шрифт", "Font"], "set.look": ["Вид текста", "Text look"], "set.layout": ["Раскладка", "Layout"],
        "set.motion": ["Анимация", "Animation"], "set.recognition": ["Распознавание", "Recognition"], "set.project": ["Проект", "Project"], "set.about": ["О программе", "About"],
        "set.base": ["Обычные слова", "Regular words"], "set.accentSide": ["Акценты", "Accents"], "set.search": ["Найти шрифт", "Find a font"], "set.recent": ["Недавние", "Recent"],
        "set.fromLayer": ["Взять с выделенного слоя", "Take from selected layer"], "set.glow": ["Свечение", "Glow"], "set.current": ["Сейчас", "Current"],
        "set.applyLayers": ["Применить к выделенным слоям", "Apply to selected layers"], "set.applyAll": ["Ко всем субтитрам", "To all captions"],
        "set.uiLang": ["Язык интерфейса", "Interface language"], "set.advanced": ["Расширенный режим", "Advanced mode"], "set.advancedHint": ["Показывает все параметры стиля и инструменты.", "Shows every style parameter and tool."],
        "set.previews": ["Удалить старые превью", "Remove old previews"], "set.log": ["Журнал", "Log"], "set.logEmpty": ["Записей нет.", "No entries."],
        "set.logFile": ["Полный журнал: папка пользователя AE → NOIR Captions → noir.log", "Full log: AE user folder → NOIR Captions → noir.log"],
        "set.noFonts": ["Список шрифтов недоступен в этой версии AE — введите PostScript-имя.", "Font list is unavailable in this AE version — type a PostScript name."],
        "set.ps": ["PostScript-имя", "PostScript name"],
        "issues.title": ["Перед созданием", "Before creating"], "issues.note": ["Безопасная зона оценивается приблизительно. Проверьте результат в композиции.", "The safe area is approximate. Check the result in the comp."],
        "assist.open": ["Помощник", "Assistant"], "home.hint": ["Наведите на шар — откроются разделы. Нажмите на шар — помощник.", "Hover the orb to reveal sections. Click it for the assistant."],
        "home.groups.video": ["Видео", "Video"], "home.groups.text": ["Текст", "Text"], "home.groups.style": ["Стиль", "Style"], "home.groups.place": ["Позиция", "Position"],
        "home.groups.time": ["Время", "Timing"], "home.groups.anim": ["Анимация", "Animation"], "home.groups.layers": ["Слои", "Layers"], "home.groups.more": ["Настройки", "Settings"],
        "ok.saved": ["Готово", "Done"], "err.noCep": ["Откройте панель в After Effects: Window → Extensions → NOIR Captions.", "Open the panel in After Effects: Window → Extensions → NOIR Captions."],
        "confirm.previews": ["Удалить композиции NOIR-превью, которые нигде не используются? Можно отменить Ctrl+Z.", "Remove NOIR preview comps that are not used anywhere? Undo with Ctrl+Z."]
    };
    var lang = "ru";
    function t(key, vars) {
        var row = D[key], s = row ? row[lang === "en" ? 1 : 0] : key;
        if (vars) for (var k in vars) s = s.split("{" + k + "}").join(vars[k]);
        return s;
    }
    window.NoirI18n = { t: t, set: function (l) { lang = l === "en" ? "en" : "ru"; document.documentElement.lang = lang; }, lang: function () { return lang; }, has: function (key) { return !!D[key]; } };
})();
