/*
 * NOIR CAPTIONS — панель ScriptUI (встраивается в интерфейс AE как обычная панель).
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    var SECTION = "NOIR Captions";
    var VERSION = "0.2.0";

    var DEFAULTS = {
        language: "ru", model: "large-v3", device: "auto", prompt: "",
        font: "TimesNewRomanPSMT", fontSize: 200, color: [0.8, 0, 0],
        strokeWidth: 0, strokeColor: [0, 0, 0], tracking: 0,
        caps: true, stripPunct: true, posX: 50, posY: 18, safeWidth: 0.9,
        maxWords: 1, maxChars: 18, pauseBreak: 0.35, punctBreak: true, holdGap: 0.3,
        animIn: "none", inDur: 0.2, animOut: "none", outDur: 0.15, distance: 80,
        easeInfluence: 80, replace: true, python: ""
    };

    function loadSettings() {
        var s = {};
        for (var k in DEFAULTS) s[k] = DEFAULTS[k];
        try {
            if (app.settings.haveSetting(SECTION, "settings")) {
                var saved = N.parseJSON(app.settings.getSetting(SECTION, "settings"));
                for (var k2 in saved) if (DEFAULTS.hasOwnProperty(k2)) s[k2] = saved[k2];
            }
        } catch (e) {}
        return s;
    }
    function saveSettings(s) {
        try { app.settings.saveSetting(SECTION, "settings", N.stringify(s)); } catch (e) {}
    }

    function num(txt, def, min, max) {
        var v = parseFloat(String(txt).replace(",", "."));
        if (isNaN(v)) return def;
        if (min !== undefined && v < min) v = min;
        if (max !== undefined && v > max) v = max;
        return v;
    }

    function hexToRgb(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
    function rgbToHex(c) {
        return (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
    }

    // Список шрифтов: Font API есть с AE 24.0. В старых — только ручной ввод/взять со слоя.
    function getFontFamilies() {
        var fams = [];
        try {
            var all = app.fonts.allFonts;
            for (var i = 0; i < all.length; i++) {
                var group = all[i];
                if (!group || !group.length) continue;
                var styles = [];
                for (var j = 0; j < group.length; j++)
                    styles.push({ style: group[j].styleName, ps: group[j].postScriptName });
                fams.push({ name: group[0].familyName, styles: styles });
            }
        } catch (e) { return null; }
        return fams.length ? fams : null;
    }

    N.buildPanel = function (thisObj, root) {
        var S = loadSettings();
        var state = { data: null, link: null, resultFile: null };

        var win = (thisObj instanceof Panel) ? thisObj
            : new Window("palette", "NOIR CAPTIONS", undefined, { resizeable: true });
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 6;
        win.margins = 8;

        var tabs = win.add("tabbedpanel");
        tabs.alignChildren = ["fill", "top"];
        var tSpeech = tabs.add("tab", undefined, "Речь");
        var tText = tabs.add("tab", undefined, "Текст");
        var tStyle = tabs.add("tab", undefined, "Стиль");
        var tAnim = tabs.add("tab", undefined, "Анимация");
        var all = [tSpeech, tText, tStyle, tAnim];
        for (var ti = 0; ti < all.length; ti++) {
            all[ti].orientation = "column";
            all[ti].alignChildren = ["fill", "top"];
            all[ti].spacing = 5;
            all[ti].margins = 8;
        }

        function row(parent, label, labelWidth) {
            var g = parent.add("group");
            g.orientation = "row";
            g.alignChildren = ["left", "center"];
            if (label) {
                var st = g.add("statictext", undefined, label);
                st.preferredSize.width = labelWidth || 90;
            }
            return g;
        }
        function dropdown(parent, items, selectedId) {
            var labels = [];
            for (var i = 0; i < items.length; i++) labels.push(items[i].label);
            var dd = parent.add("dropdownlist", undefined, labels);
            dd.selection = 0;
            for (var j = 0; j < items.length; j++) if (items[j].id === selectedId) dd.selection = j;
            dd.alignment = ["fill", "center"];
            return dd;
        }
        function idOf(dd, items) { return items[dd.selection ? dd.selection.index : 0].id; }

        // ---------------- Речь ----------------
        var LANGS = [{ id: "ru", label: "Русский" }, { id: "auto", label: "Авто (определить)" },
            { id: "en", label: "English" }];
        var DEVICES = [{ id: "auto", label: "Авто (GPU, если есть)" }, { id: "cuda", label: "GPU (CUDA)" },
            { id: "cpu", label: "CPU" }];

        var rLang = row(tSpeech, "Язык");
        var ddLang = dropdown(rLang, LANGS, S.language);
        var rModel = row(tSpeech, "Модель");
        var ddModel = dropdown(rModel, N.MODELS, S.model);
        var rDev = row(tSpeech, "Устройство");
        var ddDev = dropdown(rDev, DEVICES, S.device);
        var rPrompt = row(tSpeech, "Имена/термины");
        var etPrompt = rPrompt.add("edittext", undefined, S.prompt);
        etPrompt.alignment = ["fill", "center"];
        etPrompt.helpTip = "Подсказка модели: имена, бренды, термины через запятую";

        var hint = tSpeech.add("statictext", undefined,
            "Выделите в таймлайне слой со звуком и нажмите «Распознать».", { multiline: true });
        var rBtns = tSpeech.add("group");
        var btnRecognize = rBtns.add("button", undefined, "Распознать речь");
        var btnCancel = rBtns.add("button", undefined, "Отмена");
        var btnLoad = rBtns.add("button", undefined, "Открыть JSON…");
        btnCancel.enabled = false;
        var progress = tSpeech.add("progressbar", undefined, 0, 100);
        progress.preferredSize.height = 6;
        var stStatus = tSpeech.add("statictext", undefined, "Готов", { multiline: true });
        stStatus.preferredSize.height = 44;

        // ---------------- Текст ----------------
        tText.add("statictext", undefined,
            "Одна строка = одна фраза. Правьте слова; не добавляйте/не удаляйте строки.", { multiline: true });
        var etText = tText.add("edittext", undefined, "", { multiline: true, scrolling: true, wantReturn: true });
        etText.preferredSize = [260, 220];
        etText.alignment = ["fill", "fill"];
        var rTextBtns = tText.add("group");
        var btnSave = rTextBtns.add("button", undefined, "Сохранить JSON…");
        var btnReset = rTextBtns.add("button", undefined, "Сбросить правки");

        // ---------------- Стиль ----------------
        var families = getFontFamilies();
        var rFont = row(tStyle, "Шрифт");
        var stFont = rFont.add("statictext", undefined, S.font);
        stFont.alignment = ["fill", "center"];
        var ddFamily = null, ddStyle = null, etFilter = null;
        if (families) {
            var rFilter = row(tStyle, "Поиск");
            etFilter = rFilter.add("edittext", undefined, "");
            etFilter.alignment = ["fill", "center"];
            var rFam = row(tStyle, "Семейство");
            ddFamily = rFam.add("dropdownlist", undefined, []);
            ddFamily.alignment = ["fill", "center"];
            var rSty = row(tStyle, "Начертание");
            ddStyle = rSty.add("dropdownlist", undefined, []);
            ddStyle.alignment = ["fill", "center"];
        } else {
            var rPs = row(tStyle, "PostScript");
            var etPs = rPs.add("edittext", undefined, S.font);
            etPs.alignment = ["fill", "center"];
            etPs.onChange = function () { S.font = etPs.text; stFont.text = S.font; saveSettings(S); };
        }
        var btnFromLayer = tStyle.add("button", undefined, "Взять стиль с выделенного текстового слоя");

        var rSize = row(tStyle, "Размер");
        var etSize = rSize.add("edittext", undefined, String(S.fontSize));
        etSize.characters = 5;
        rSize.add("statictext", undefined, "Трекинг");
        var etTrack = rSize.add("edittext", undefined, String(S.tracking));
        etTrack.characters = 5;

        var rColor = row(tStyle, "Цвет");
        var swatch = rColor.add("panel");
        swatch.preferredSize = [40, 18];
        var btnColor = rColor.add("button", undefined, "Выбрать…");
        var rStroke = row(tStyle, "Обводка, px");
        var etStroke = rStroke.add("edittext", undefined, String(S.strokeWidth));
        etStroke.characters = 4;
        var swatchStroke = rStroke.add("panel");
        swatchStroke.preferredSize = [40, 18];
        var btnStrokeColor = rStroke.add("button", undefined, "Цвет…");

        var rCase = row(tStyle, "");
        var cbCaps = rCase.add("checkbox", undefined, "КАПС");
        cbCaps.value = S.caps;
        var cbStrip = rCase.add("checkbox", undefined, "Убрать пунктуацию");
        cbStrip.value = S.stripPunct;

        var rPos = row(tStyle, "Позиция X/Y, %");
        var etPosX = rPos.add("edittext", undefined, String(S.posX));
        etPosX.characters = 4;
        var etPosY = rPos.add("edittext", undefined, String(S.posY));
        etPosY.characters = 4;

        var pnlGroup = tStyle.add("panel", undefined, "Группировка");
        pnlGroup.alignChildren = ["fill", "top"];
        var rWords = row(pnlGroup, "Слов на экране");
        var etMaxWords = rWords.add("edittext", undefined, String(S.maxWords));
        etMaxWords.characters = 3;
        rWords.add("statictext", undefined, "Макс. символов");
        var etMaxChars = rWords.add("edittext", undefined, String(S.maxChars));
        etMaxChars.characters = 3;
        var rBreak = row(pnlGroup, "Разрыв на паузе, с");
        var etPause = rBreak.add("edittext", undefined, String(S.pauseBreak));
        etPause.characters = 4;
        var cbPunctBreak = rBreak.add("checkbox", undefined, "и на . , ! ?");
        cbPunctBreak.value = S.punctBreak;

        // ---------------- Анимация ----------------
        var rIn = row(tAnim, "Появление");
        var ddIn = dropdown(rIn, N.ANIM_IN, S.animIn);
        var rInDur = row(tAnim, "  длит., с");
        var etInDur = rInDur.add("edittext", undefined, String(S.inDur));
        etInDur.characters = 5;
        var rOut = row(tAnim, "Исчезновение");
        var ddOut = dropdown(rOut, N.ANIM_OUT, S.animOut);
        var rOutDur = row(tAnim, "  длит., с");
        var etOutDur = rOutDur.add("edittext", undefined, String(S.outDur));
        etOutDur.characters = 5;
        var rDist = row(tAnim, "Сдвиг, px");
        var etDist = rDist.add("edittext", undefined, String(S.distance));
        etDist.characters = 5;
        rDist.add("statictext", undefined, "Плавность, %");
        var etEase = rDist.add("edittext", undefined, String(S.easeInfluence));
        etEase.characters = 4;
        tAnim.add("statictext", undefined,
            "Для коротких слов вход и выход автоматически укорачиваются.", { multiline: true });

        // ---------------- Низ панели ----------------
        var cbReplace = win.add("checkbox", undefined, "Заменить ранее созданные субтитры в этой композиции");
        cbReplace.value = S.replace;
        var btnGenerate = win.add("button", undefined, "Создать субтитры");
        btnGenerate.preferredSize.height = 30;
        var stFooter = win.add("statictext", undefined, "NOIR CAPTIONS " + VERSION);

        // ---------------- логика UI ----------------
        function paintSwatch(p, c) {
            try {
                p.graphics.backgroundColor = p.graphics.newBrush(p.graphics.BrushType.SOLID_COLOR, [c[0], c[1], c[2], 1]);
            } catch (e) {}
        }
        paintSwatch(swatch, S.color);
        paintSwatch(swatchStroke, S.strokeColor);

        function setStatus(text, pct) {
            stStatus.text = text;
            if (pct !== undefined && pct !== null) progress.value = Math.round(pct * 100);
        }

        function fillFamilies() {
            if (!families) return;
            var q = etFilter.text.toLowerCase(), sel = 0, count = 0;
            ddFamily.removeAll();
            ddFamily._fams = [];
            for (var i = 0; i < families.length && count < 400; i++) {
                if (q && families[i].name.toLowerCase().indexOf(q) === -1) continue;
                ddFamily.add("item", families[i].name);
                ddFamily._fams.push(families[i]);
                for (var j = 0; j < families[i].styles.length; j++)
                    if (families[i].styles[j].ps === S.font) sel = count;
                count++;
            }
            if (count) ddFamily.selection = sel;
        }
        function fillStyles() {
            if (!ddFamily || !ddFamily.selection) return;
            var fam = ddFamily._fams[ddFamily.selection.index], sel = 0;
            ddStyle.removeAll();
            for (var j = 0; j < fam.styles.length; j++) {
                ddStyle.add("item", fam.styles[j].style);
                if (fam.styles[j].ps === S.font) sel = j;
            }
            ddStyle._fam = fam;
            ddStyle.selection = sel;
        }
        if (families) {
            etFilter.onChanging = function () { fillFamilies(); };
            ddFamily.onChange = function () { fillStyles(); };
            ddStyle.onChange = function () {
                if (!ddStyle.selection) return;
                S.font = ddStyle._fam.styles[ddStyle.selection.index].ps;
                stFont.text = S.font;
                saveSettings(S);
            };
            fillFamilies();
        }

        function readUI() {
            S.language = idOf(ddLang, LANGS);
            S.model = idOf(ddModel, N.MODELS);
            S.device = idOf(ddDev, DEVICES);
            S.prompt = etPrompt.text;
            S.fontSize = num(etSize.text, DEFAULTS.fontSize, 4, 2000);
            S.tracking = num(etTrack.text, 0, -1000, 3000);
            S.strokeWidth = num(etStroke.text, 0, 0, 200);
            S.caps = cbCaps.value;
            S.stripPunct = cbStrip.value;
            S.posX = num(etPosX.text, 50, -50, 150);
            S.posY = num(etPosY.text, 18, -50, 150);
            S.maxWords = Math.round(num(etMaxWords.text, 1, 1, 20));
            S.maxChars = Math.round(num(etMaxChars.text, 18, 1, 200));
            S.pauseBreak = num(etPause.text, 0.35, 0.05, 10);
            S.punctBreak = cbPunctBreak.value;
            S.animIn = idOf(ddIn, N.ANIM_IN);
            S.animOut = idOf(ddOut, N.ANIM_OUT);
            S.inDur = num(etInDur.text, 0.2, 0, 5);
            S.outDur = num(etOutDur.text, 0.15, 0, 5);
            S.distance = num(etDist.text, 80, 0, 5000);
            S.easeInfluence = num(etEase.text, 80, 0.1, 100);
            S.replace = cbReplace.value;
            saveSettings(S);
        }

        btnColor.onClick = function () {
            var c = $.colorPicker(rgbToHex(S.color));
            if (c < 0) return;
            S.color = hexToRgb(c);
            paintSwatch(swatch, S.color);
            saveSettings(S);
        };
        btnStrokeColor.onClick = function () {
            var c = $.colorPicker(rgbToHex(S.strokeColor));
            if (c < 0) return;
            S.strokeColor = hexToRgb(c);
            paintSwatch(swatchStroke, S.strokeColor);
            saveSettings(S);
        };

        btnFromLayer.onClick = function () {
            var comp = app.project.activeItem;
            var l = (comp instanceof CompItem && comp.selectedLayers.length) ? comp.selectedLayers[0] : null;
            if (!(l instanceof TextLayer)) { alert("Выделите текстовый слой.", "NOIR Captions"); return; }
            var d = l.property("Source Text").value;
            S.font = d.font;
            S.fontSize = Math.round(d.fontSize);
            S.tracking = d.tracking;
            if (d.applyFill) S.color = d.fillColor;
            S.strokeWidth = d.applyStroke ? d.strokeWidth : 0;
            if (d.applyStroke) S.strokeColor = d.strokeColor;
            stFont.text = S.font;
            etSize.text = String(S.fontSize);
            etTrack.text = String(S.tracking);
            etStroke.text = String(S.strokeWidth);
            paintSwatch(swatch, S.color);
            paintSwatch(swatchStroke, S.strokeColor);
            if (families) fillFamilies();
            saveSettings(S);
        };

        function setData(data, link, file) {
            state.data = data;
            state.link = link;
            state.resultFile = file;
            etText.text = N.toEditorText(data);
            var n = 0;
            for (var i = 0; i < data.segments.length; i++) n += data.segments[i].words.length;
            var warn = "";
            for (var w = 0; w < data.warnings.length; w++)
                if (data.warnings[w].code === "gpu_failed") warn = "\nGPU не сработала — распознано на CPU.";
            setStatus("Готово: слов — " + n + ", язык " + data.language + ", " +
                data.engine.model + " / " + data.engine.device + "." + warn +
                (n ? "\nПроверьте текст на вкладке «Текст»." : "\nРечь не найдена."), 1);
        }

        btnRecognize.onClick = function () {
            readUI();
            var src;
            try { src = N.getAudioSource(); } catch (e) { alert(e.message, "NOIR Captions"); return; }
            if (!N.modelCached(S.model)) {
                var m = N.MODELS[ddModel.selection.index].label;
                if (!confirm("Модель " + m + " ещё не скачана.\nОна будет загружена один раз с Hugging Face " +
                    "(только модель — ваше аудио никуда не отправляется).\nПродолжить?", false, "NOIR Captions")) return;
            }
            try {
                N.startRecognition(src, {
                    root: root, python: S.python, model: S.model, language: S.language,
                    device: S.device, prompt: S.prompt
                }, {
                    onStatus: function (st) {
                        var msg = st.message || st.state;
                        if (st.device) msg += " · " + (st.device === "cuda" ? "GPU" : "CPU");
                        setStatus(msg, st.progress);
                    },
                    onDone: function (data, s, file) {
                        btnRecognize.enabled = true;
                        btnCancel.enabled = false;
                        setData(data, s.link, file);
                    },
                    onError: function (msg) {
                        btnRecognize.enabled = true;
                        btnCancel.enabled = false;
                        setStatus("Ошибка", 0);
                        alert(msg, "NOIR Captions — ошибка распознавания");
                    }
                });
                btnRecognize.enabled = false;
                btnCancel.enabled = true;
                progress.value = 0;
            } catch (e2) {
                alert(e2.message, "NOIR Captions");
            }
        };

        btnCancel.onClick = function () {
            N.cancelRecognition();
            btnRecognize.enabled = true;
            btnCancel.enabled = false;
            setStatus("Отменено", 0);
        };

        btnLoad.onClick = function () {
            var f = File.openDialog("Открыть результат NOIR (JSON)", "*.json");
            if (!f) return;
            try {
                var data = N.parseJSON(N.readText(f));
                if (data.schema !== "noir-captions/1") throw new Error("Это не файл NOIR CAPTIONS.");
                // Привязка к аудиослою: если он выделен — к нему, иначе время = время композиции.
                var link = null;
                try { link = N.getAudioSource().link; } catch (e) {}
                if (data.link && !link) link = data.link;
                setData(data, link, f);
                if (!link) setStatus(stStatus.text + "\nАудиослой не выделен: время JSON = время композиции.");
            } catch (e2) { alert("Не удалось открыть: " + e2.message, "NOIR Captions"); }
        };

        btnSave.onClick = function () {
            if (!state.data) { alert("Нет результата распознавания.", "NOIR Captions"); return; }
            var f = File.saveDialog("Сохранить результат NOIR", "*.json");
            if (!f) return;
            try {
                var warnings = [];
                var words = N.applyEdits(state.data, etText.text, warnings);
                var out = N.parseJSON(N.stringify(state.data));
                // Сохраняем правки: пересобираем сегменты из отредактированных слов.
                for (var s = 0; s < out.segments.length; s++) out.segments[s].words = [];
                for (var i = 0; i < words.length; i++) out.segments[words[i].seg].words.push({
                    text: words[i].text, start: words[i].start, end: words[i].end
                });
                out.link = state.link;
                N.writeText(f, N.stringify(out));
                setStatus("Сохранено: " + f.fsName);
            } catch (e) { alert(e.message, "NOIR Captions"); }
        };

        btnReset.onClick = function () {
            if (state.data) etText.text = N.toEditorText(state.data);
        };

        // Время старта аудиослоя берём текущее: если слой сдвинули после
        // распознавания, субтитры всё равно встанут синхронно.
        function resolveLink(comp) {
            var L = state.link;
            if (!L) return { startTime: 0, stretch: 100, note: "" };
            if (comp.id !== L.compId) {
                return { startTime: L.startTime, stretch: L.stretch,
                    note: "Генерация в другую композицию: использовано время аудиослоя из исходной." };
            }
            var layer = null;
            if (L.layerIndex <= comp.numLayers && comp.layer(L.layerIndex).name === L.layerName)
                layer = comp.layer(L.layerIndex);
            for (var i = 1; !layer && i <= comp.numLayers; i++)
                if (comp.layer(i).name === L.layerName) layer = comp.layer(i);
            if (!layer) return { startTime: L.startTime, stretch: L.stretch,
                note: "Аудиослой «" + L.layerName + "» не найден — использовано сохранённое время." };
            return { startTime: layer.startTime, stretch: layer.stretch, note: "" };
        }

        btnGenerate.onClick = function () {
            readUI();
            if (!state.data) { alert("Сначала распознайте речь или откройте JSON.", "NOIR Captions"); return; }
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) { alert("Откройте композицию.", "NOIR Captions"); return; }
            var warnings = [];
            var words;
            try { words = N.applyEdits(state.data, etText.text, warnings); }
            catch (e) { alert(e.message, "NOIR Captions"); return; }

            var groups = N.groupWords(words, {
                maxWords: S.maxWords, maxChars: S.maxChars, pauseBreak: S.pauseBreak,
                punctBreak: S.punctBreak, stripPunct: S.stripPunct, caps: S.caps
            });
            N.timeGroups(groups, S.holdGap, 0.08);
            var map = resolveLink(comp);
            if (map.note) warnings.push(map.note);
            for (var i = 0; i < groups.length; i++) {
                groups[i].compStart = N.sourceToComp(groups[i].start, map.startTime, map.stretch);
                groups[i].compOut = N.sourceToComp(groups[i].outTime, map.startTime, map.stretch);
            }

            var style = {
                font: S.font, fontSize: S.fontSize, color: S.color, tracking: S.tracking,
                strokeWidth: S.strokeWidth, strokeColor: S.strokeColor,
                posX: S.posX, posY: S.posY, safeWidth: S.safeWidth
            };
            var anim = {
                animIn: S.animIn, animOut: S.animOut, inDur: S.inDur, outDur: S.outDur,
                distance: S.distance, easeInfluence: S.easeInfluence
            };

            app.beginUndoGroup("NOIR Captions: создать субтитры");
            try {
                var res = N.generate(comp, groups, style, anim, S.replace);
                warnings = warnings.concat(res.warnings);
                var msg = "Создано слоёв: " + res.created + (res.removed ? ", заменено старых: " + res.removed : "");
                setStatus(msg);
                if (warnings.length) alert(msg + "\n\n- " + warnings.join("\n- "), "NOIR Captions");
            } catch (e2) {
                alert("Ошибка генерации: " + e2.toString() + (e2.line ? " (строка " + e2.line + ")" : ""),
                    "NOIR Captions");
            } finally {
                app.endUndoGroup();
            }
        };

        win.onResizing = win.onResize = function () { this.layout.resize(); };
        if (win instanceof Window) { win.center(); win.show(); }
        else { win.layout.layout(true); win.layout.resize(); }
        return win;
    };
})(NOIR);
