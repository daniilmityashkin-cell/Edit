/*
 * NOIR CAPTIONS — этап 1: проверочный скрипт для After Effects.
 *
 * Что делает:
 *   - берёт активную композицию (или создаёт тестовую 1080x1920);
 *   - создаёт по одному редактируемому текстовому слою на слово;
 *   - выставляет каждому слою in/out по таймингам слов;
 *   - применяет выбранный пресет анимации ключевыми кадрами;
 *   - при повторном запуске удаляет ТОЛЬКО свои слои из прошлого запуска.
 *
 * Запуск: File > Scripts > Run Script File... > этот файл.
 * Всё выполняется одной операцией Undo (Edit > Undo "NOIR Captions").
 *
 * ExtendScript = ES3: без let/const, стрелочных функций, Array.map и т.п.
 */
(function noirStage1(thisObj) {
    var SCRIPT_NAME = "NOIR Captions";
    var LAYER_TAG = "noir-captions:generated";

    // Тестовые слова. Время в секундах от начала композиции.
    // На этапе 3 сюда придут данные из JSON распознавания.
    var TEST_WORDS = [
        { text: "Это", start: 0.20, end: 0.45 },
        { text: "доктор", start: 0.45, end: 0.90 },
        { text: "Арад", start: 0.95, end: 1.40 },
        { text: "и", start: 1.40, end: 1.52 },
        { text: "это", start: 1.52, end: 1.80 },
        { text: "искусство", start: 1.85, end: 2.60 },
        { text: "пропорций", start: 3.40, end: 4.20 }
    ];

    var STYLE = {
        // PostScript-имя шрифта. Если не найден — fallback + предупреждение.
        font: "TimesNewRomanPSMT",
        fallbackFont: "ArialMT",
        fontSize: 220,
        color: [0.80, 0.0, 0.0],   // красный как в референсе, 0..1
        allCaps: true,
        tracking: 0,
        posY: 0.18,                // доля высоты кадра: центр строки
        safeWidth: 0.90,           // текст не шире 90% кадра
        // Пауза между словами короче этого — слово держится до следующего,
        // чтобы не было мигания пустого кадра.
        holdGap: 0.30
    };

    var PRESETS = {
        cut: {
            label: "Cut — жёсткая смена (как в референсе)",
            inDur: 0
        },
        pop: {
            label: "Pop — scale + overshoot + fade",
            inDur: 0.22,
            fromScale: 70,
            overshootScale: 108,
            fromOpacity: 0,
            fromOffsetY: 40
        },
        rise: {
            label: "Rise — снизу вверх + fade",
            inDur: 0.25,
            fromScale: 100,
            overshootScale: 0,
            fromOpacity: 0,
            fromOffsetY: 90
        }
    };

    // ---------- helpers ----------

    function fontExists(psName) {
        // Font API появился в AE 24.0. В старых версиях проверить нельзя.
        try {
            if (app.fonts && app.fonts.getFontsByPostScriptName) {
                return app.fonts.getFontsByPostScriptName(psName).length > 0;
            }
        } catch (e) {}
        return null; // неизвестно
    }

    function easeCount(prop) {
        var t = prop.propertyValueType;
        if (t === PropertyValueType.ThreeD_SPATIAL || t === PropertyValueType.TwoD_SPATIAL) return 1;
        if (t === PropertyValueType.ThreeD) return 3; // Scale — всегда 3 даже у 2D-слоя
        if (t === PropertyValueType.TwoD) return 2;
        return 1;
    }

    function setEase(prop, keyIndex, influence) {
        var n = easeCount(prop), easeIn = [], easeOut = [];
        for (var i = 0; i < n; i++) {
            easeIn.push(new KeyframeEase(0, influence));
            easeOut.push(new KeyframeEase(0, influence));
        }
        prop.setTemporalEaseAtKey(keyIndex, easeIn, easeOut);
    }

    function removePreviousRun(comp) {
        var removed = 0;
        for (var i = comp.numLayers; i >= 1; i--) {
            var l = comp.layer(i);
            if (l.comment === LAYER_TAG) {
                if (l.locked) l.locked = false;
                l.remove();
                removed++;
            }
        }
        return removed;
    }

    function getOrCreateComp() {
        var item = app.project.activeItem;
        if (item && item instanceof CompItem) return { comp: item, created: false };
        var comp = app.project.items.addComp("NOIR Test 1080x1920", 1080, 1920, 1, 10, 30);
        comp.openInViewer();
        return { comp: comp, created: true };
    }

    // Подгоняет размер шрифта, чтобы слово влезло в безопасную ширину.
    function fitAndCenter(layer, comp, t) {
        var textProp = layer.property("Source Text");
        var maxW = comp.width * STYLE.safeWidth;
        var rect = layer.sourceRectAtTime(t, false);
        if (rect.width > maxW && rect.width > 0) {
            var doc = textProp.value;
            doc.fontSize = Math.floor(doc.fontSize * maxW / rect.width);
            textProp.setValue(doc);
            rect = layer.sourceRectAtTime(t, false);
        }
        // Якорь в центр текста, чтобы scale шёл из центра слова.
        layer.property("Transform").property("Anchor Point")
            .setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
    }

    function createWordLayer(comp, word, inPoint, outPoint, warnings) {
        var text = STYLE.allCaps ? word.text.toUpperCase() : word.text;
        var layer = comp.layers.addText(text);
        layer.name = "NOIR · " + text;
        layer.comment = LAYER_TAG;

        var textProp = layer.property("Source Text");
        var doc = textProp.value;
        doc.resetCharStyle();
        doc.resetParagraphStyle();
        doc.fontSize = STYLE.fontSize;
        doc.fillColor = STYLE.color;
        doc.applyFill = true;
        doc.applyStroke = false;
        doc.tracking = STYLE.tracking;
        doc.justification = ParagraphJustification.CENTER_JUSTIFY;
        doc.font = STYLE.font;
        textProp.setValue(doc);

        if (textProp.value.font !== STYLE.font) {
            warnings.push("Шрифт " + STYLE.font + " не применился, использован " + textProp.value.font);
        }

        layer.startTime = 0;
        layer.inPoint = inPoint;
        layer.outPoint = outPoint;
        fitAndCenter(layer, comp, inPoint);
        return layer;
    }

    function applyPreset(layer, comp, preset, inPoint, outPoint) {
        var tr = layer.property("Transform");
        var pos = tr.property("Position");
        var base = [comp.width / 2, comp.height * STYLE.posY];
        pos.setValue(base);

        if (!preset.inDur) return; // cut: без ключей

        // Анимация не длиннее 60% жизни слоя — иначе короткие слова
        // не успеют «встать» до смены.
        var dur = Math.min(preset.inDur, (outPoint - inPoint) * 0.6);
        var t0 = inPoint;
        var t1 = inPoint + dur;

        var op = tr.property("Opacity");
        op.setValueAtTime(t0, preset.fromOpacity);
        op.setValueAtTime(t1, 100);
        setEase(op, 2, 75);

        pos.setValueAtTime(t0, [base[0], base[1] + preset.fromOffsetY]);
        pos.setValueAtTime(t1, base);
        setEase(pos, 2, 85);

        var sc = tr.property("Scale");
        if (preset.overshootScale) {
            var tMid = t0 + dur * 0.65;
            sc.setValueAtTime(t0, [preset.fromScale, preset.fromScale, 100]);
            sc.setValueAtTime(tMid, [preset.overshootScale, preset.overshootScale, 100]);
            sc.setValueAtTime(t1, [100, 100, 100]);
            setEase(sc, 2, 50);
            setEase(sc, 3, 80);
        } else if (preset.fromScale !== 100) {
            sc.setValueAtTime(t0, [preset.fromScale, preset.fromScale, 100]);
            sc.setValueAtTime(t1, [100, 100, 100]);
            setEase(sc, 2, 80);
        }
    }

    function generate(presetKey) {
        var preset = PRESETS[presetKey];
        var warnings = [];

        var exists = fontExists(STYLE.font);
        if (exists === false) {
            warnings.push("Шрифт " + STYLE.font + " не установлен, используется " + STYLE.fallbackFont);
            STYLE.font = STYLE.fallbackFont;
        }

        app.beginUndoGroup(SCRIPT_NAME);
        try {
            var res = getOrCreateComp();
            var comp = res.comp;
            var removed = removePreviousRun(comp);

            var created = 0;
            for (var i = 0; i < TEST_WORDS.length; i++) {
                var w = TEST_WORDS[i];
                var next = TEST_WORDS[i + 1];
                if (!(w.end > w.start)) {
                    warnings.push("Пропущено слово с некорректным таймингом: " + w.text);
                    continue;
                }
                var outPoint = w.end;
                if (next && next.start - w.end < STYLE.holdGap) outPoint = next.start;
                if (outPoint > comp.duration) outPoint = comp.duration;
                if (w.start >= comp.duration) {
                    warnings.push("Слово за пределами композиции: " + w.text);
                    continue;
                }

                var layer = createWordLayer(comp, w, w.start, outPoint, warnings);
                applyPreset(layer, comp, preset, w.start, outPoint);
                created++;
            }

            var msg = "Готово: создано слоёв — " + created +
                (removed ? "\nУдалено слоёв прошлого запуска — " + removed : "") +
                "\nКомпозиция: " + comp.name + " (" + comp.frameRate + " fps)" +
                (res.created ? " — создана новая" : "");
            if (warnings.length) msg += "\n\nПредупреждения:\n- " + warnings.join("\n- ");
            alert(msg, SCRIPT_NAME);
        } catch (e) {
            alert("Ошибка: " + e.toString() + (e.line ? " (строка " + e.line + ")" : ""), SCRIPT_NAME);
        } finally {
            app.endUndoGroup();
        }
    }

    // ---------- UI ----------

    var keys = [];
    for (var k in PRESETS) if (PRESETS.hasOwnProperty(k)) keys.push(k);

    var win = new Window("dialog", SCRIPT_NAME + " — тест этапа 1");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.add("statictext", undefined, "Слоёв будет создано: " + TEST_WORDS.length + " (тестовые слова)");
    var dd = win.add("dropdownlist", undefined, (function () {
        var labels = [];
        for (var i = 0; i < keys.length; i++) labels.push(PRESETS[keys[i]].label);
        return labels;
    })());
    dd.selection = 0;
    var target = (app.project.activeItem instanceof CompItem)
        ? "Цель: активная композиция «" + app.project.activeItem.name + "»"
        : "Цель: новая тестовая композиция 1080x1920";
    win.add("statictext", undefined, target);
    var btns = win.add("group");
    btns.alignment = "right";
    var cancelBtn = btns.add("button", undefined, "Отмена", { name: "cancel" });
    var okBtn = btns.add("button", undefined, "Создать", { name: "ok" });

    if (win.show() === 1) generate(keys[dd.selection.index]);
})(this);
