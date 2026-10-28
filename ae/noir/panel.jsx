/*
 * NOIR CAPTIONS — панель ScriptUI (встраивается в интерфейс AE как обычная панель).
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    var SECTION = "NOIR Captions";
    var SETTINGS_KEY = "settings.v2";
    var VERSION = "0.3.0";

    function clone(o) { return N.parseJSON(N.stringify(o)); }

    // Стиль по умолчанию, если пресеты не найдены.
    var FALLBACK_STYLE = {
        schema: "noir-style/1", id: "custom", name: "Свой",
        layout: { reveal: "word", maxWords: 1, maxChars: 28, lineChars: 16, pauseBreak: 0.35, punctBreak: true,
            stripPunct: true, posX: 50, posY: 18, lineGap: 0.12, wordSpace: 0.28, accentOwnLine: true,
            safeWidth: 0.9, holdGap: 0.3 },
        base: { fonts: ["TimesNewRomanPSMT"], size: 200, color: [0.8, 0, 0], tracking: 0, caps: true,
            strokeWidth: 0, strokeColor: [0, 0, 0], shadow: null, glow: null },
        accent: { fonts: ["TimesNewRomanPSMT"], size: 200, color: [1, 1, 1], tracking: 0, caps: true,
            strokeWidth: 0, strokeColor: [0, 0, 0], shadow: null, glow: null },
        anim: { animIn: "none", inDur: 0.2, animOut: "none", outDur: 0.15, distance: 40, blur: 0, easeInfluence: 80 }
    };
    var DEFAULT_SHADOW = { color: [0, 0, 0], opacity: 45, distance: 3, softness: 14 };

    var DEFAULTS = {
        language: "ru", model: "large-v3", device: "auto", prompt: "",
        replace: true, python: "", presetId: "", style: FALLBACK_STYLE
    };

    function loadSettings() {
        var s = clone(DEFAULTS);
        try {
            if (app.settings.haveSetting(SECTION, SETTINGS_KEY)) {
                var saved = N.parseJSON(app.settings.getSetting(SECTION, SETTINGS_KEY));
                for (var k in saved) if (DEFAULTS.hasOwnProperty(k)) s[k] = saved[k];
            }
        } catch (e) {}
        return s;
    }
    function saveSettings(s) {
        try { app.settings.saveSetting(SECTION, SETTINGS_KEY, N.stringify(s)); } catch (e) {}
    }

    // Пресеты: встроенные (папка проекта) + свои (папка пользователя, не в git).
    N.userPresetFolder = function () { return Folder(Folder.userData.fsName + "/NOIR Captions/styles"); };
    N.loadPresets = function (root) {
        var out = [], dirs = [Folder(root + "/presets/styles"), N.userPresetFolder()];
        for (var d = 0; d < dirs.length; d++) {
            if (!dirs[d].exists) continue;
            var files = dirs[d].getFiles("*.json");
            for (var i = 0; i < files.length; i++) {
                try {
                    var p = N.parseJSON(N.readText(files[i]));
                    if (p.schema === "noir-style/1" && p.layout && p.base && p.accent && p.anim) {
                        p.user = d === 1;
                        out.push(p);
                    }
                } catch (e) {}
            }
        }
        return out;
    };

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

    // Список шрифтов: Font API есть с AE 24.0. В старых — ввод PostScript-имени / взять со слоя.
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
        var firstRun = !app.settings.haveSetting(SECTION, SETTINGS_KEY);
        var S = loadSettings();
        var presets = N.loadPresets(root);
        // syncing: идёт программное заполнение контролов — их onChange не считаются правкой
        var state = { data: null, link: null, target: "base", syncing: false };

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
        var tLayout = tabs.add("tab", undefined, "Раскладка");
        var tAnim = tabs.add("tab", undefined, "Анимация");
        var all = [tSpeech, tText, tStyle, tLayout, tAnim];
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
                st.preferredSize.width = labelWidth || 95;
            }
            return g;
        }
        function dropdown(parent, items, selectedId) {
            var labels = [];
            for (var i = 0; i < items.length; i++) labels.push(items[i].label);
            var dd = parent.add("dropdownlist", undefined, labels);
            dd.alignment = ["fill", "center"];
            selectId(dd, items, selectedId);
            return dd;
        }
        function selectId(dd, items, id) {
            var idx = 0;
            for (var j = 0; j < items.length; j++) if (items[j].id === id) idx = j;
            dd.selection = idx;
        }
        function idOf(dd, items) { return items[dd.selection ? dd.selection.index : 0].id; }
        function field(parent, value, chars) {
            var e = parent.add("edittext", undefined, String(value));
            e.characters = chars || 4;
            return e;
        }

        // ================= Речь =================
        var LANGS = [{ id: "ru", label: "Русский" }, { id: "auto", label: "Авто (определить)" },
            { id: "en", label: "English" }];
        var DEVICES = [{ id: "auto", label: "Авто (GPU, если есть)" }, { id: "cuda", label: "GPU (CUDA)" },
            { id: "cpu", label: "CPU" }];

        var ddLang = dropdown(row(tSpeech, "Язык"), LANGS, S.language);
        var ddModel = dropdown(row(tSpeech, "Модель"), N.MODELS, S.model);
        var ddDev = dropdown(row(tSpeech, "Устройство"), DEVICES, S.device);
        var rPrompt = row(tSpeech, "Имена/термины");
        var etPrompt = rPrompt.add("edittext", undefined, S.prompt);
        etPrompt.alignment = ["fill", "center"];
        etPrompt.helpTip = "Подсказка модели: имена, бренды, термины через запятую";
        tSpeech.add("statictext", undefined,
            "Выделите в таймлайне слой со звуком и нажмите «Распознать речь». " +
            "Для английских и смешанных роликов выберите язык «Авто».", { multiline: true });
        var rBtns = tSpeech.add("group");
        var btnRecognize = rBtns.add("button", undefined, "Распознать речь");
        var btnCancel = rBtns.add("button", undefined, "Отмена");
        var btnLoad = rBtns.add("button", undefined, "Открыть JSON…");
        btnCancel.enabled = false;
        var progress = tSpeech.add("progressbar", undefined, 0, 100);
        progress.preferredSize.height = 6;
        var stStatus = tSpeech.add("statictext", undefined, "Готов", { multiline: true });
        stStatus.preferredSize.height = 44;

        // ================= Текст =================
        tText.add("statictext", undefined,
            "Одна строка = одна фраза распознавания. Правьте слова внутри строк.\n" +
            "*слово* или *два слова* — акцент (свой стиль).   | — начать новую фразу здесь.",
            { multiline: true });
        var etText = tText.add("edittext", undefined, "", { multiline: true, scrolling: true, wantReturn: true });
        etText.preferredSize = [260, 220];
        etText.alignment = ["fill", "fill"];
        var rTextBtns = tText.add("group");
        var btnSave = rTextBtns.add("button", undefined, "Сохранить JSON…");
        var btnReset = rTextBtns.add("button", undefined, "Сбросить правки");

        // ================= Стиль =================
        var rPreset = row(tStyle, "Пресет", 60);
        var ddPreset = rPreset.add("dropdownlist", undefined, []);
        ddPreset.alignment = ["fill", "center"];
        var btnSavePreset = rPreset.add("button", undefined, "Сохранить…");
        var stPresetDesc = tStyle.add("statictext", undefined, "", { multiline: true });
        stPresetDesc.preferredSize.height = 30;

        var rTarget = row(tStyle, "Настраиваю", 95);
        var rbBase = rTarget.add("radiobutton", undefined, "Обычные слова");
        var rbAccent = rTarget.add("radiobutton", undefined, "*Акцент*");
        rbBase.value = true;

        var pnlText = tStyle.add("panel", undefined, "");
        pnlText.alignChildren = ["fill", "top"];
        pnlText.margins = [8, 10, 8, 8];
        var families = getFontFamilies();
        var rFont = row(pnlText, "Шрифт");
        var stFont = rFont.add("statictext", undefined, "");
        stFont.alignment = ["fill", "center"];
        var ddFamily = null, ddStyle = null, etFilter = null, etPs = null;
        if (families) {
            etFilter = row(pnlText, "Поиск").add("edittext", undefined, "");
            etFilter.alignment = ["fill", "center"];
            ddFamily = row(pnlText, "Семейство").add("dropdownlist", undefined, []);
            ddFamily.alignment = ["fill", "center"];
            ddStyle = row(pnlText, "Начертание").add("dropdownlist", undefined, []);
            ddStyle.alignment = ["fill", "center"];
        } else {
            etPs = row(pnlText, "PostScript").add("edittext", undefined, "");
            etPs.alignment = ["fill", "center"];
        }
        var btnFromLayer = pnlText.add("button", undefined, "Взять стиль с выделенного текстового слоя");
        var rSize = row(pnlText, "Размер");
        var etSize = field(rSize, 0, 5);
        rSize.add("statictext", undefined, "Трекинг");
        var etTrack = field(rSize, 0, 5);
        var cbCaps = rSize.add("checkbox", undefined, "КАПС");
        var rColor = row(pnlText, "Цвет");
        var swatch = rColor.add("panel");
        swatch.preferredSize = [40, 18];
        var btnColor = rColor.add("button", undefined, "Выбрать…");
        var rStroke = row(pnlText, "Обводка, px");
        var etStroke = field(rStroke, 0, 4);
        var swatchStroke = rStroke.add("panel");
        swatchStroke.preferredSize = [40, 18];
        var btnStrokeColor = rStroke.add("button", undefined, "Цвет…");
        var rFx = row(pnlText, "Эффекты");
        var cbShadow = rFx.add("checkbox", undefined, "Тень");
        var cbGlow = rFx.add("checkbox", undefined, "Свечение");
        rFx.add("statictext", undefined, "размер");
        var etGlow = field(rFx, 30, 4);

        // ================= Раскладка =================
        var REVEALS = [{ id: "word", label: "Слова появляются по очереди" },
            { id: "group", label: "Фраза появляется целиком" }];
        var ddReveal = dropdown(row(tLayout, "Появление"), REVEALS, "word");
        var rWords = row(tLayout, "Слов на экране");
        var etMaxWords = field(rWords, 1, 3);
        rWords.add("statictext", undefined, "макс. символов");
        var etMaxChars = field(rWords, 28, 3);
        var rLine = row(tLayout, "Символов в строке");
        var etLineChars = field(rLine, 16, 3);
        rLine.add("statictext", undefined, "(0 — без переноса)");
        var cbAccentLine = tLayout.add("checkbox", undefined, "Акцентные слова — отдельной строкой");
        var rPos = row(tLayout, "Позиция X/Y, %");
        var etPosX = field(rPos, 50, 4);
        var etPosY = field(rPos, 50, 4);
        var rGap = row(tLayout, "Межстрочный");
        var etLineGap = field(rGap, 0.12, 4);
        rGap.add("statictext", undefined, "пробел");
        var etWordSpace = field(rGap, 0.28, 4);
        var rBreak = row(tLayout, "Разрыв на паузе, с");
        var etPause = field(rBreak, 0.35, 4);
        var cbPunctBreak = rBreak.add("checkbox", undefined, "и на . , ! ?");
        var cbStrip = tLayout.add("checkbox", undefined, "Убрать пунктуацию из субтитров");

        // ================= Анимация =================
        var ddIn = dropdown(row(tAnim, "Появление"), N.ANIM_IN, "none");
        var rInDur = row(tAnim, "  длит., с");
        var etInDur = field(rInDur, 0.2, 5);
        var ddOut = dropdown(row(tAnim, "Исчезновение"), N.ANIM_OUT, "none");
        var rOutDur = row(tAnim, "  длит., с");
        var etOutDur = field(rOutDur, 0.15, 5);
        var rDist = row(tAnim, "Сдвиг, px");
        var etDist = field(rDist, 40, 5);
        rDist.add("statictext", undefined, "Blur, px");
        var etBlur = field(rDist, 0, 4);
        var rEase = row(tAnim, "Плавность, %");
        var etEase = field(rEase, 80, 4);
        tAnim.add("statictext", undefined,
            "Размеры заданы для кадра шириной 1080 и масштабируются под композицию. " +
            "У коротких слов вход и выход автоматически укорачиваются.", { multiline: true });

        // ================= низ =================
        var cbReplace = win.add("checkbox", undefined, "Заменить ранее созданные субтитры в этой композиции");
        cbReplace.value = S.replace;
        var btnGenerate = win.add("button", undefined, "Создать субтитры");
        btnGenerate.preferredSize.height = 30;
        win.add("statictext", undefined, "NOIR CAPTIONS " + VERSION);

        // ================= логика =================
        function paintSwatch(p, c) {
            try {
                p.graphics.backgroundColor = p.graphics.newBrush(p.graphics.BrushType.SOLID_COLOR, [c[0], c[1], c[2], 1]);
            } catch (e) {}
        }
        function setStatus(text, pct) {
            stStatus.text = text;
            if (pct !== undefined && pct !== null) progress.value = Math.round(pct * 100);
        }
        function tgt() { return S.style[state.target]; }

        function fillPresets() {
            ddPreset.removeAll();
            ddPreset.add("item", "— свой (текущие настройки) —");
            var sel = 0;
            for (var i = 0; i < presets.length; i++) {
                ddPreset.add("item", (presets[i].user ? "★ " : "") + presets[i].name);
                if (presets[i].id === S.presetId) sel = i + 1;
            }
            ddPreset._lock = true;
            ddPreset.selection = sel;
            ddPreset._lock = false;
        }

        function fillFamilies() {
            if (!families) return;
            var cur = tgt().fonts[0], q = etFilter.text.toLowerCase(), sel = -1, count = 0;
            ddFamily.removeAll();
            ddFamily._fams = [];
            for (var i = 0; i < families.length && count < 400; i++) {
                var hit = false;
                for (var j = 0; j < families[i].styles.length; j++) if (families[i].styles[j].ps === cur) hit = true;
                if (q && families[i].name.toLowerCase().indexOf(q) === -1 && !hit) continue;
                ddFamily.add("item", families[i].name);
                ddFamily._fams.push(families[i]);
                if (hit) sel = count;
                count++;
            }
            ddFamily._lock = true;
            if (count) ddFamily.selection = sel >= 0 ? sel : 0;
            ddFamily._lock = false;
            fillStyles(true);
        }
        function fillStyles(keepFont) {
            if (!ddFamily || !ddFamily.selection) return;
            var fam = ddFamily._fams[ddFamily.selection.index], sel = 0, cur = tgt().fonts[0];
            ddStyle.removeAll();
            for (var j = 0; j < fam.styles.length; j++) {
                ddStyle.add("item", fam.styles[j].style);
                if (fam.styles[j].ps === cur) sel = j;
            }
            ddStyle._fam = fam;
            ddStyle._lock = !!keepFont;
            ddStyle.selection = sel;
            ddStyle._lock = false;
        }
        function setFont(ps) {
            var t = tgt(), rest = [];
            for (var i = 0; i < t.fonts.length; i++) if (t.fonts[i] !== ps) rest.push(t.fonts[i]);
            t.fonts = [ps].concat(rest); // остальные — запасные, если шрифта нет на другом ПК
            stFont.text = ps;
            markCustom();
        }

        // Показать стиль в контролах
        function syncTextUI() {
            var t = tgt();
            pnlText.text = state.target === "base" ? "Обычные слова" : "Акцентные слова (*в звёздочках*)";
            stFont.text = t.fonts.join(", ");
            if (etPs) etPs.text = t.fonts[0] || "";
            if (families) fillFamilies();
            etSize.text = String(t.size);
            etTrack.text = String(t.tracking || 0);
            cbCaps.value = !!t.caps;
            etStroke.text = String(t.strokeWidth || 0);
            paintSwatch(swatch, t.color);
            paintSwatch(swatchStroke, t.strokeColor || [0, 0, 0]);
            cbShadow.value = !!t.shadow;
            cbGlow.value = !!t.glow;
            etGlow.text = String(t.glow ? t.glow.softness : 30);
        }
        function syncUI() {
            var L = S.style.layout, A = S.style.anim;
            state.syncing = true;
            syncTextUI();
            selectId(ddReveal, REVEALS, L.reveal);
            etMaxWords.text = String(L.maxWords);
            etMaxChars.text = String(L.maxChars);
            etLineChars.text = String(L.lineChars);
            cbAccentLine.value = !!L.accentOwnLine;
            etPosX.text = String(L.posX);
            etPosY.text = String(L.posY);
            etLineGap.text = String(L.lineGap);
            etWordSpace.text = String(L.wordSpace);
            etPause.text = String(L.pauseBreak);
            cbPunctBreak.value = !!L.punctBreak;
            cbStrip.value = !!L.stripPunct;
            selectId(ddIn, N.ANIM_IN, A.animIn);
            etInDur.text = String(A.inDur);
            selectId(ddOut, N.ANIM_OUT, A.animOut);
            etOutDur.text = String(A.outDur);
            etDist.text = String(A.distance);
            etBlur.text = String(A.blur);
            etEase.text = String(A.easeInfluence);
            var p = presetById(S.presetId);
            stPresetDesc.text = p ? (p.description || "") : "Свои настройки.";
            state.syncing = false;
        }

        // Прочитать контролы в S
        function readTextUI() {
            var t = tgt();
            if (etPs && etPs.text && etPs.text !== t.fonts[0]) setFont(etPs.text);
            t.size = num(etSize.text, t.size, 4, 2000);
            t.tracking = num(etTrack.text, 0, -1000, 3000);
            t.caps = cbCaps.value;
            t.strokeWidth = num(etStroke.text, 0, 0, 200);
            if (cbShadow.value && !t.shadow) t.shadow = clone(DEFAULT_SHADOW);
            if (!cbShadow.value) t.shadow = null;
            var gs = num(etGlow.text, 30, 1, 500);
            if (cbGlow.value) t.glow = { color: t.glow && t.glow.color ? t.glow.color : t.color, opacity: 85, softness: gs };
            else t.glow = null;
        }
        function readUI() {
            S.language = idOf(ddLang, LANGS);
            S.model = idOf(ddModel, N.MODELS);
            S.device = idOf(ddDev, DEVICES);
            S.prompt = etPrompt.text;
            S.replace = cbReplace.value;
            readTextUI();
            var L = S.style.layout, A = S.style.anim;
            L.reveal = idOf(ddReveal, REVEALS);
            L.maxWords = Math.round(num(etMaxWords.text, 1, 1, 30));
            L.maxChars = Math.round(num(etMaxChars.text, 28, 1, 300));
            L.lineChars = Math.round(num(etLineChars.text, 0, 0, 300));
            L.accentOwnLine = cbAccentLine.value;
            L.posX = num(etPosX.text, 50, -50, 150);
            L.posY = num(etPosY.text, 50, -50, 150);
            L.lineGap = num(etLineGap.text, 0.12, -1, 5);
            L.wordSpace = num(etWordSpace.text, 0.28, 0, 3);
            L.pauseBreak = num(etPause.text, 0.35, 0.05, 10);
            L.punctBreak = cbPunctBreak.value;
            L.stripPunct = cbStrip.value;
            A.animIn = idOf(ddIn, N.ANIM_IN);
            A.animOut = idOf(ddOut, N.ANIM_OUT);
            A.inDur = num(etInDur.text, 0.2, 0, 5);
            A.outDur = num(etOutDur.text, 0.15, 0, 5);
            A.distance = num(etDist.text, 40, 0, 5000);
            A.blur = num(etBlur.text, 0, 0, 500);
            A.easeInfluence = num(etEase.text, 80, 0.1, 100);
            saveSettings(S);
        }

        function presetById(id) {
            for (var i = 0; i < presets.length; i++) if (presets[i].id === id) return presets[i];
            return null;
        }
        // Любая ручная правка — это уже «свой» стиль (пресет на диске не меняется).
        function markCustom() {
            if (state.syncing || !S.presetId) return;
            S.presetId = "";
            fillPresets();
            stPresetDesc.text = "Свои настройки (на основе пресета).";
        }

        ddPreset.onChange = function () {
            if (ddPreset._lock || !ddPreset.selection) return;
            var i = ddPreset.selection.index;
            if (i === 0) { S.presetId = ""; syncUI(); saveSettings(S); return; }
            var p = presets[i - 1];
            S.style = { layout: clone(p.layout), base: clone(p.base), accent: clone(p.accent), anim: clone(p.anim) };
            S.presetId = p.id;
            syncUI();
            saveSettings(S);
        };

        btnSavePreset.onClick = function () {
            readUI();
            var name = prompt("Название стиля:", "Мой стиль", "NOIR Captions");
            if (!name) return;
            var id = "user-" + name.toLowerCase().replace(/[^a-z0-9а-яё]+/g, "-").replace(/^-+|-+$/g, "") ||
                "user-" + new Date().getTime();
            var p = { schema: "noir-style/1", id: id, name: name, description: "Свой стиль",
                layout: S.style.layout, base: S.style.base, accent: S.style.accent, anim: S.style.anim };
            var dir = N.userPresetFolder();
            if (!dir.exists) dir.create();
            try {
                N.writeText(File(dir.fsName + "/" + id + ".json"), N.stringify(p));
            } catch (e) { alert(e.message, "NOIR Captions"); return; }
            presets = N.loadPresets(root);
            S.presetId = id;
            fillPresets();
            syncUI();
            saveSettings(S);
            setStatus("Стиль сохранён: " + dir.fsName);
        };

        function switchTarget(t) {
            readTextUI();
            state.target = t;
            state.syncing = true;
            syncTextUI();
            state.syncing = false;
        }
        rbBase.onClick = function () { switchTarget("base"); };
        rbAccent.onClick = function () { switchTarget("accent"); };

        if (families) {
            etFilter.onChanging = function () { fillFamilies(); };
            ddFamily.onChange = function () { if (!ddFamily._lock) fillStyles(false); };
            ddStyle.onChange = function () {
                if (ddStyle._lock || !ddStyle.selection) return;
                setFont(ddStyle._fam.styles[ddStyle.selection.index].ps);
                saveSettings(S);
            };
        }
        var editable = [etSize, etTrack, etStroke, etGlow, etMaxWords, etMaxChars, etLineChars, etPosX, etPosY,
            etLineGap, etWordSpace, etPause, etInDur, etOutDur, etDist, etBlur, etEase];
        for (var ei = 0; ei < editable.length; ei++) editable[ei].onChange = function () { markCustom(); };
        var toggles = [cbCaps, cbShadow, cbGlow, cbAccentLine, cbPunctBreak, cbStrip];
        for (var ci = 0; ci < toggles.length; ci++) toggles[ci].onClick = function () { markCustom(); };
        ddReveal.onChange = ddIn.onChange = ddOut.onChange = function () { markCustom(); };

        btnColor.onClick = function () {
            var c = $.colorPicker(rgbToHex(tgt().color));
            if (c < 0) return;
            tgt().color = hexToRgb(c);
            if (tgt().glow) tgt().glow.color = tgt().color;
            paintSwatch(swatch, tgt().color);
            markCustom();
            saveSettings(S);
        };
        btnStrokeColor.onClick = function () {
            var c = $.colorPicker(rgbToHex(tgt().strokeColor || [0, 0, 0]));
            if (c < 0) return;
            tgt().strokeColor = hexToRgb(c);
            paintSwatch(swatchStroke, tgt().strokeColor);
            markCustom();
            saveSettings(S);
        };

        btnFromLayer.onClick = function () {
            var comp = app.project.activeItem;
            var l = (comp instanceof CompItem && comp.selectedLayers.length) ? comp.selectedLayers[0] : null;
            if (!(l instanceof TextLayer)) { alert("Выделите текстовый слой.", "NOIR Captions"); return; }
            var d = l.property("Source Text").value, t = tgt();
            setFont(d.font);
            // размер переводим в шкалу кадра 1080
            t.size = Math.round(d.fontSize * N.REF_WIDTH / comp.width);
            t.tracking = d.tracking;
            if (d.applyFill) t.color = d.fillColor;
            t.strokeWidth = d.applyStroke ? Math.round(d.strokeWidth * N.REF_WIDTH / comp.width) : 0;
            if (d.applyStroke) t.strokeColor = d.strokeColor;
            syncTextUI();
            saveSettings(S);
        };

        function setData(data, link) {
            state.data = data;
            state.link = link;
            etText.text = N.toEditorText(data);
            var n = 0;
            for (var i = 0; i < data.segments.length; i++) n += data.segments[i].words.length;
            var warn = "";
            for (var w = 0; w < (data.warnings || []).length; w++)
                if (data.warnings[w].code === "gpu_failed") warn = "\nGPU не сработала — распознано на CPU.";
            var eng = data.engine ? data.engine.model + " / " + data.engine.device : "";
            setStatus("Готово: слов — " + n + ", язык " + data.language + (eng ? ", " + eng : "") + "." + warn +
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
                    onDone: function (data, s) {
                        btnRecognize.enabled = true;
                        btnCancel.enabled = false;
                        setData(data, s.link);
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
                // Привязка: выделенный аудиослой, иначе сохранённая в файле, иначе время = время композиции.
                var link = null;
                try { link = N.getAudioSource().link; } catch (e) {}
                if (!link && data.link) link = data.link;
                setData(data, link);
                if (!link) setStatus(stStatus.text + "\nАудиослой не выделен: время JSON = время композиции.");
            } catch (e2) { alert("Не удалось открыть: " + e2.message, "NOIR Captions"); }
        };

        btnSave.onClick = function () {
            if (!state.data) { alert("Нет результата распознавания.", "NOIR Captions"); return; }
            var f = File.saveDialog("Сохранить результат NOIR", "*.json");
            if (!f) return;
            try {
                var words = N.applyEdits(state.data, etText.text, []);
                var out = clone(state.data);
                for (var s = 0; s < out.segments.length; s++) out.segments[s].words = [];
                for (var i = 0; i < words.length; i++) out.segments[words[i].seg].words.push({
                    text: words[i].text, start: words[i].start, end: words[i].end,
                    accent: words[i].accent || undefined, breakBefore: words[i].breakBefore || undefined
                });
                out.link = state.link;
                N.writeText(f, N.stringify(out));
                setStatus("Сохранено: " + f.fsName);
            } catch (e) { alert(e.message, "NOIR Captions"); }
        };

        btnReset.onClick = function () { if (state.data) etText.text = N.toEditorText(state.data); };

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
            var warnings = [], words;
            try { words = N.applyEdits(state.data, etText.text, warnings); }
            catch (e) { alert(e.message, "NOIR Captions"); return; }

            var L = S.style.layout;
            var groups = N.groupWords(words, {
                maxWords: L.maxWords, maxChars: L.maxChars, pauseBreak: L.pauseBreak,
                punctBreak: L.punctBreak, stripPunct: L.stripPunct
            });
            N.timeGroups(groups, L.holdGap, 0.08);
            var map = resolveLink(comp);
            if (map.note) warnings.push(map.note);
            for (var i = 0; i < groups.length; i++) {
                var g = groups[i];
                g.compStart = N.sourceToComp(g.start, map.startTime, map.stretch);
                g.compOut = N.sourceToComp(g.outTime, map.startTime, map.stretch);
                for (var j = 0; j < g.words.length; j++)
                    g.words[j].compStart = N.sourceToComp(g.words[j].start, map.startTime, map.stretch);
            }

            app.beginUndoGroup("NOIR Captions: создать субтитры");
            try {
                var res = N.generate(comp, groups, S.style, S.style.anim, S.replace);
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

        // Первый запуск: стиль из первого встроенного пресета.
        if (firstRun && presets.length) {
            for (var pi = 0; pi < presets.length; pi++) if (presets[pi].id === "noir-red") {
                var p0 = presets[pi];
                S.style = { layout: clone(p0.layout), base: clone(p0.base), accent: clone(p0.accent), anim: clone(p0.anim) };
                S.presetId = p0.id;
            }
        }
        fillPresets();
        syncUI();

        win.onResizing = win.onResize = function () { this.layout.resize(); };
        if (win instanceof Window) { win.center(); win.show(); }
        else { win.layout.layout(true); win.layout.resize(); }
        return win;
    };
})(NOIR);
