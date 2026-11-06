/*
 * NOIR CAPTIONS — панель ScriptUI (встраивается в интерфейс AE как обычная панель).
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    var SECTION = "NOIR Captions";
    var SETTINGS_KEY = "settings.v2";
    var VERSION = "0.20.0";

    function clone(o) { return N.parseJSON(N.stringify(o)); }

    // Стиль по умолчанию, если пресеты не найдены.
    var FALLBACK_STYLE = {
        schema: "noir-style/1", id: "custom", name: "Свой",
        layout: { reveal: "word", maxWords: 1, maxChars: 28, lineChars: 16, pauseBreak: 0.35, punctBreak: true,
            stripPunct: true, autoAccent: false, posX: 50, posY: 18, lineGap: 0.12, wordSpace: 0.28, accentOwnLine: true,
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
        recentFonts: [], favoriteStyles: [],
        quick: {size: 100, position: "preset", intensity: "1"},
        replace: true, python: "", presetId: "", style: FALLBACK_STYLE, reflow: true,
        tools: {
            counter: { from: 0, to: 100, duration: 2, hold: 1, step: 0, interval: 0, decimals: 0, pad: 0, thousands: "none", ease: "out",
                prefix: "", suffix: "", side: "accent", size: 0, posX: 50, posY: 50, sound: false },
            strike: { color: [1, 0.2, 0.15], thickness: 8, offsetY: 0, tilt: 0, padding: 8, duration: 0.3, delay: 0.1, dir: "ltr" },
            mask: { mode: "video", invert: false, restart: false, hideSource: true, opacity: 100 }
        },
        // sfx: appear/accent/exit — "auto" | "off" | "same" (только accent) | "cat:<категория>"
        sfx: { enabled: false, appear: "auto", accent: "same", exit: "off", db: -6, dbRand: 2, minGap: 0.12, file: "", mixBase: false }
    };

    function loadSettings() {
        var s = clone(DEFAULTS);
        try {
            if (app.settings.haveSetting(SECTION, SETTINGS_KEY)) {
                var saved = N.parseJSON(app.settings.getSetting(SECTION, SETTINGS_KEY));
                for (var k in saved) if (DEFAULTS.hasOwnProperty(k)) s[k] = saved[k];
            }
        } catch (e) {}
        if (!(s.recentFonts instanceof Array)) s.recentFonts = [];
        if (!(s.favoriteStyles instanceof Array)) s.favoriteStyles = [];
        var quick = clone(DEFAULTS.quick);
        for (var qk in (s.quick || {})) quick[qk] = s.quick[qk];
        s.quick = quick;
        var sf = clone(DEFAULTS.sfx);                       // старые сохранения без новых полей
        for (var k2 in (s.sfx || {})) sf[k2] = s.sfx[k2];
        sf.enabled = false; // Старый флаг автозвука больше не используется.
        s.sfx = sf;
        var tl = clone(DEFAULTS.tools);                     // то же для вкладки «Функции»
        for (var tk in tl) for (var tf in (s.tools && s.tools[tk] ? s.tools[tk] : {})) tl[tk][tf] = s.tools[tk][tf];
        s.tools = tl;
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

    // ---------- «бегунки»: числа меняются перетаскиванием, как в After Effects ----------
    // spec: { min, max, step (единиц на пиксель), dec (знаков после запятой), name }
    N.scrubFormat = function (v, dec) {
        var p = Math.pow(10, dec || 0), r = Math.round(v * p) / p;
        return String(r);
    };
    // Прибавка при сдвиге мыши на dx пикселей: Shift — точнее (÷10), Ctrl/Alt — быстрее (×10). Результат — без округления.
    N.scrubAdvance = function (val, dx, spec, mods) {
        var mult = mods && mods.shift ? 0.1 : (mods && (mods.ctrl || mods.alt) ? 10 : 1);
        var v = val + dx * spec.step * mult;
        if (spec.min !== undefined && v < spec.min) v = spec.min;
        if (spec.max !== undefined && v > spec.max) v = spec.max;
        return v;
    };
    N.scrubParse = function (txt, spec) {
        var v = parseFloat(String(txt).replace(",", "."));
        if (isNaN(v)) return null;
        if (spec.min !== undefined && v < spec.min) v = spec.min;
        if (spec.max !== undefined && v > spec.max) v = spec.max;
        return v;
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

    // Native ScriptUI groups do not scroll. Keep their viewport independent of content height.
    N.scrollRange = function (contentHeight, viewportHeight, value) {
        var max = Math.max(0, contentHeight - Math.max(0, viewportHeight));
        return {max: max, value: Math.max(0, Math.min(max, value || 0))};
    };
    N.makeScrollArea = function (parent) {
        var body = parent.add("group");
        body._noirScrollBody = true;
        body.orientation = "row"; body.alignment = ["fill", "fill"];
        body.minimumSize = [0, 0]; body.preferredSize = [300, 240]; body.margins = 0; body.spacing = 2;
        var viewport = body.add("group");
        viewport.minimumSize = [0, 0]; viewport.margins = 0;
        var content = viewport.add("group");
        content.orientation = "column"; content.alignChildren = ["fill", "top"];
        content.spacing = 4; content.margins = 0;
        content.minimumSize = [0, 0]; content.maximumSize = [100000, 100000];
        var scroll = body.add("scrollbar", undefined, 0, 0, 0);
        scroll.stepdelta = 28; scroll.jumpdelta = 140;
        // Only content uses auto-layout; the clipping viewport and scrollbar use explicit bounds.
        viewport.layout = {layout: function () {}, resize: function () {}};
        body.layout = {layout: function () {}, resize: function () {}};
        function position() {
            if (!content.location) return;
            content.location = [0, -Math.round(scroll.value || 0)];
        }
        var api = {body: body, viewport: viewport, content: content, scrollbar: scroll, initialized: false};
        function naturalHeight() {
            var height = 0;
            for (var i = 0; i < content.children.length; i++) {
                var bounds = content.children[i].bounds;
                if (bounds) height = Math.max(height, bounds.bottom === undefined ? bounds[3] : bounds.bottom);
            }
            if (!height && content.size) height = content.size.height === undefined ? content.size[1] : content.size.height;
            return Math.max(1, height || 1);
        }
        api.initialize = function () {
            // Wait until ALL tabs and controls exist; early layout freezes an empty group at one pixel.
            api.bindWheel();
            content.layout.layout(true);
            api.initialized = true;
            api.refresh(true);
        };
        api.refresh = function (reset) {
            if (!api.initialized) return;
            if (parent.size && parent.size.width && parent.size.height) {
                var top = 4;
                for (var i = 0; i < parent.children.length; i++) {
                    if (parent.children[i] === body) break;
                    var bounds = parent.children[i].bounds;
                    if (bounds) top = Math.max(top, (bounds.bottom === undefined ? bounds[3] : bounds.bottom) + 4);
                }
                body.bounds = [6, top, Math.max(7, parent.size.width - 6), Math.max(top + 1, parent.size.height - 4)];
            }
            if (!body.size || !body.size.width || !body.size.height) return;
            var width = Math.max(1, body.size.width - 18), height = Math.max(1, body.size.height);
            viewport.bounds = [0, 0, width, height];
            scroll.bounds = [width + 2, 0, width + 18, height];
            content.minimumSize = [width, 0]; content.maximumSize = [width, 100000];
            content.preferredSize = [width, -1];
            if (api.beforeLayout) api.beforeLayout(width);
            content.layout.layout(true);
            var measuredHeight = naturalHeight();
            // Explicit bounds are essential for children of a manual ScriptUI viewport.
            var range = N.scrollRange(measuredHeight, height, reset ? 0 : scroll.value);
            content.bounds = [0, -range.value, width, measuredHeight - range.value];
            scroll.maxvalue = range.max; scroll.value = range.value;
            scroll.enabled = range.max > 0; scroll.jumpdelta = Math.max(28, height * 0.8);
            position();
        };
        scroll.onChanging = scroll.onChange = position;
        var lastWheel = null;
        function wheel(event) {
            if (event === lastWheel || event._noirWheelHandled || event.target === scroll) return;
            // Only a focused MULTILINE editor retains its own wheel scrolling.
            var target = event.target;
            if (target && target.type === "edittext" && target.active && target.properties && target.properties.multiline) return;
            var delta = 0;
            if (event.wheelDelta) delta = Math.abs(event.wheelDelta) >= 120 ? -event.wheelDelta / 120 : -event.wheelDelta;
            else if (event.deltaY) delta = event.deltaMode === 1 ? event.deltaY : event.deltaY / 40;
            else if (event.detail) delta = event.detail;
            if (!delta || !scroll.maxvalue) return;
            lastWheel = event;
            try { event._noirWheelHandled = true; } catch (nativeEvent) {}
            delta = Math.max(-3, Math.min(3, delta));
            scroll.value = N.scrollRange(scroll.maxvalue, 0, (scroll.value || 0) + delta * 36).value;
            position();
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
        }
        api.bindWheel = function () {
            function bind(control) {
                if (!control._noirWheelBound) {
                    // Some native ScriptUI controls do not bubble; bind both ancestors and targets.
                    try { control.addEventListener("mousewheel", wheel, true); } catch (unsupportedMousewheel) {}
                    try { control.addEventListener("wheel", wheel, true); } catch (unsupportedWheel) {}
                    control._noirWheelBound = true;
                }
                if (control.children) for (var i = 0; i < control.children.length; i++) bind(control.children[i]);
            }
            bind(parent);
        };
        return api;
    };

    N.buildPanel = function (thisObj, root, options) {
        options = options || {};
        var firstRun = !app.settings.haveSetting(SECTION, SETTINGS_KEY);
        var S = loadSettings();
        var presets = N.loadPresets(root);
        // syncing: идёт программное заполнение контролов — их onChange не считаются правкой
        var state = { data: null, link: null, target: "base", syncing: false, recognizing: false, cleanLines: [], dataRevision: 0, scanning: false, face: null };

        // Тема необязательна: если файла нет или он сломан — обычные вкладки и кнопки.
        try { $.evalFile(File(root + "/ae/noir/theme.jsx")); } catch (eTheme) {}
        var TH = N.theme && N.theme.makeTabs ? N.theme : null;
        try { $.evalFile(File(root + "/ae/noir/sfx.jsx")); } catch (eSfx) {}
        var SFX = !!(N.planSfx && N.sfxLibrary);
        try { $.evalFile(File(root + "/ae/noir/tools.jsx")); } catch (eTools) {}
        var TOOLS = !!(N.createCounter && N.strikeLayers && N.maskTextLayers);

        var win = (thisObj instanceof Panel) ? thisObj
            : new Window("palette", "NOIR CAPTIONS", undefined, { resizeable: true });
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 4;
        win.margins = [6, 4, 6, 4];
        if (TH) {
            TH.background(win);
            var head = win.add("group");
            head.orientation = "row";
            head.alignChildren = ["left", "center"];
            var stBrand = head.add("statictext", undefined, "NOIR CAPTIONS");
            stBrand._keep = true;
            TH.text(stBrand, TH.colors.text, 12, true);
            var stVer = head.add("statictext", undefined, "v" + VERSION + (options.headless ? " · HTML" : " · ScriptUI"));
            stVer._keep = true;
            TH.text(stVer, TH.colors.muted);
        }

        // Главное действие и статус — над вкладками, чтобы они были видны при любой высоте панели.
        var rMain = win.add("group");
        rMain.orientation = "row";
        rMain.alignChildren = ["fill", "center"];
        var btnGenerate = rMain.add("button", undefined, "Создать субтитры");
        btnGenerate.alignment = ["fill", "center"];
        btnGenerate.preferredSize = [120, 30];
        var cbReplace = rMain.add("checkbox", undefined, "Заменить старые");
        cbReplace.value = S.replace;
        cbReplace.alignment = ["right", "center"];
        var stLine = win.add("statictext", undefined, "Готов");
        stLine.alignment = ["fill", "top"];
        stLine.minimumSize = [0, 18]; stLine.preferredSize = [260, 18];
        stLine._keep = true;

        var cbAdvanced = win.add("checkbox", undefined, "Дополнительные настройки");
        cbAdvanced.helpTip = "Показать вид, раскладку, анимацию, слои, функции и SFX";
        var scroller = N.makeScrollArea(win);
        var tabs = TH ? TH.makeTabs(scroller.content, {headless:!!options.headless}) : scroller.content.add("tabbedpanel");
        win._noirTabs = tabs;
        tabs.alignChildren = ["fill", "top"];
        var tSpeech = tabs.add("tab", undefined, "1 · Видео");
        var tText = tabs.add("tab", undefined, "2 · Текст");
        var tStyle = tabs.add("tab", undefined, "3 · Стиль");
        var tFinish = tabs.add("tab", undefined, "4 · Правка");
        var tView = tabs.add("tab", undefined, "Вид");
        var tLayout = tabs.add("tab", undefined, "Раскладка");
        var tAnim = tabs.add("tab", undefined, "Анимация");
        var tLayers = tabs.add("tab", undefined, "Слои");
        var tTools = tabs.add("tab", undefined, "Функции");
        var tSfx = tabs.add("tab", undefined, "SFX");
        var MAIN_TABS = 4;   // основные шаги видны всегда, остальные — в «Дополнительных настройках»
        tabs.mainCount = MAIN_TABS;
        var all = [tSpeech, tText, tStyle, tFinish, tView, tLayout, tAnim, tLayers, tTools, tSfx];
        for (var ti = 0; ti < all.length; ti++) {
            all[ti].orientation = "column";
            all[ti].alignChildren = ["fill", "top"];
            all[ti].spacing = 3;
            all[ti].margins = [2, 4, 2, 2];
        }

        function showAdvanced() {
            if (tabs.buttons) {
                if (tabs.setAdvanced) tabs.setAdvanced(cbAdvanced.value);
                for (var ai = MAIN_TABS; ai < tabs.buttons.length; ai++) tabs.buttons[ai].visible = !!cbAdvanced.value;
                if (!cbAdvanced.value && tabs.current >= MAIN_TABS) tabs.select(0);
            } else {
                for (var ai = MAIN_TABS; ai < all.length; ai++) all[ai].enabled = !!cbAdvanced.value;
            }
            if (!options.headless) win.layout.layout(true);
            scroller.refresh(true);
        }
        cbAdvanced.onClick = showAdvanced;
        showAdvanced();

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
        // Числовое поле-бегунок: зажать левую кнопку на числе и двигать мышью (Shift — точнее, Ctrl/Alt — быстрее);
        // простой клик — ввод значения. Ведёт себя как edittext: .text (строка), .onChange, .helpTip.
        var scrubs = [];
        function redrawScrubs() { if (options.headless) return; for (var i = 0; i < scrubs.length; i++) { try { scrubs[i].notify("onDraw"); } catch (e) {} } }
        function field(parent, value, chars, spec) {
            if (!spec) {
                var e = parent.add("edittext", undefined, String(value));
                e.characters = chars || 4;
                return e;
            }
            var b = parent.add("button", undefined, N.scrubFormat(value, spec.dec));
            b._scrub = spec;
            b.preferredSize = [Math.max(54, (chars || 4) * 8 + 14), 22];
            if (options.headless) {
                b.helpTip = spec.name || "Значение";
                scrubs.push(b); return b;
            }
            var st = { down: false, moved: false, lastX: 0, val: 0 };
            function redraw() { try { b.notify("onDraw"); } catch (e1) {} }
            b.addEventListener("mousedown", function (ev) {
                st.down = true; st.moved = false; st.lastX = ev.clientX;
                st.val = N.scrubParse(b.text, spec);
                if (st.val === null) st.val = spec.min !== undefined ? spec.min : 0;
                b._dragging = true; redraw();
            });
            b.addEventListener("mousemove", function (ev) {
                if (!st.down) return;
                var dx = ev.clientX - st.lastX;
                if (!st.moved && Math.abs(dx) < 2) return;     // дрожание руки при клике — не считаем перетаскиванием
                st.moved = true;
                st.lastX = ev.clientX;
                st.val = N.scrubAdvance(st.val, dx, spec, { shift: ev.shiftKey, ctrl: ev.ctrlKey, alt: ev.altKey });
                b.text = N.scrubFormat(st.val, spec.dec);
                redraw();
            });
            b.addEventListener("mouseup", function () {
                if (!st.down) return;
                st.down = false; b._dragging = false;
                if (st.moved) {
                    st.moved = false; redraw();
                    if (b.onChange) b.onChange();
                    return;
                }
                redraw();
                var ans = prompt((spec.name || "Значение") + " (" +
                    (spec.min !== undefined ? spec.min : "…") + " … " + (spec.max !== undefined ? spec.max : "…") + "):",
                    b.text, "NOIR Captions");
                if (ans === null || ans === undefined) return;
                var v = N.scrubParse(ans, spec);
                if (v === null) return;
                b.text = N.scrubFormat(v, spec.dec);
                redraw();
                if (b.onChange) b.onChange();
            });
            b.addEventListener("mouseout", function () { b._hot = false; redraw(); });
            b.addEventListener("mouseover", function () { b._hot = true; redraw(); });
            b.helpTip = (spec.name ? spec.name + ". " : "") + "Зажмите левую кнопку и двигайте мышь влево/вправо. Shift — точнее, Ctrl — быстрее. Клик — ввести число.";
            scrubs.push(b);
            return b;
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
        var rBtns = tSpeech.add("group");
        var btnRecognize = rBtns.add("button", undefined, "Распознать речь");
        var btnCancel = rBtns.add("button", undefined, "Отмена");
        var btnLoad = rBtns.add("button", undefined, "Загрузить результат…");
        btnCancel.enabled = false;
        var progress = tSpeech.add("progressbar", undefined, 0, 100);
        progress.preferredSize.height = 6;
        var stStatus = tSpeech.add("statictext", undefined, "Готов", { multiline: true });
        stStatus.preferredSize.height = 32;

        // ================= Текст =================
        tText.add("statictext", undefined, "Правьте текст или нажимайте слова ниже. ↵ — перенос, | — новая фраза");
        var etText = tText.add("edittext", undefined, "", { multiline: true, scrolling: true, wantReturn: true });
        etText.preferredSize = [260, 90];
        etText.alignment = ["fill", "top"];
        var rTextBtns = tText.add("group");
        var btnSave = rTextBtns.add("button", undefined, "Сохранить результат…");
        var btnReset = rTextBtns.add("button", undefined, "Сбросить правки");

        var ddPhrase = dropdown(row(tText, "Фраза"), [{id: "0", label: "Сначала распознайте речь"}], "0");
        var rPhraseNav = tText.add("group");
        var btnPrevPhrase = rPhraseNav.add("button", undefined, "← Предыдущая фраза");
        var btnNextPhrase = rPhraseNav.add("button", undefined, "Следующая фраза →");
        var btnSeekPhrase = tText.add("button", undefined, "К началу фразы в композиции");
        var btnUpdatePhrase = tText.add("button", undefined, "Обновить выбранную фразу");
        var wordButtons = [], rWord;
        for (var wi = 0; wi < 12; wi++) {
            if (wi % 4 === 0) rWord = tText.add("group");
            var wb = rWord.add("button", undefined, "—");
            wb.preferredSize = [70, 24]; wb._slot = wi; wb.enabled = false;
            wordButtons.push(wb);
        }
        var rWordNav = tText.add("group");
        var btnWordsBack = rWordNav.add("button", undefined, "← Слова");
        var btnWordsNext = rWordNav.add("button", undefined, "Слова →");
        var rEditActions = tText.add("group");
        var btnLineBreak = rEditActions.add("button", undefined, "Перенос строки");
        var btnPhraseBreak = rEditActions.add("button", undefined, "Разделить фразу");
        var btnEditWord = tText.add("button", undefined, "Исправить выбранное слово…");
        var btnUndoEdit = tText.add("button", undefined, "Отменить правку текста");
        var editHistory = [];
        var btnListen = tText.add("button", undefined, "Прослушать фразу");
        tText.add("statictext", undefined, "Клик по слову: акцент. Перенос — перед выбранным словом.");
        var wordPage = 0, selectedWord = 0, editingWords = false;

        // ================= Стиль =================
        var rPreset = row(tStyle, "Пресет", 60);
        var ddPreset = rPreset.add("dropdownlist", undefined, []);
        ddPreset.alignment = ["fill", "center"];
        var btnSavePreset = rPreset.add("button", undefined, "Сохранить как пресет…");
        var stPresetDesc = tStyle.add("statictext", undefined, "");
        stPresetDesc.alignment = ["fill", "top"];

        var galleryBox = tStyle.add("panel", undefined, "Галерея стилей");
        galleryBox.orientation = "column"; galleryBox.alignChildren = ["fill", "top"];
        var cbFavorites = galleryBox.add("checkbox", undefined, "Только избранные");
        var galleryCards = [], galleryPage = 0;
        for (var cardIndex = 0; cardIndex < 4; cardIndex++) {
            var card = galleryBox.add("group"); card.orientation = "column"; card.alignChildren = ["fill", "top"];
            var cardRow = card.add("group");
            var choose = cardRow.add("button", undefined, "—"); choose._gallerySlot = cardIndex;
            choose.alignment = ["fill", "center"];
            choose.minimumSize = [0,24]; choose.preferredSize = [210,26];
            var star = cardRow.add("button", undefined, "☆"); star._gallerySlot = cardIndex; star.preferredSize = [32,24];
            var sampleLabel = card.add("statictext", undefined, "Ваши слова оживают");
            sampleLabel.preferredSize.height = 30;
            galleryCards.push({button: choose, star: star, sample: sampleLabel});
        }
        var galleryNav = galleryBox.add("group");
        var btnGalleryPrev = galleryNav.add("button", undefined, "← Стили");
        var btnGalleryNext = galleryNav.add("button", undefined, "Стили →");
        var stGalleryPage = galleryBox.add("statictext", undefined, "", {multiline:true});
        stGalleryPage.preferredSize = [240,32];
        var btnGalleryPlay = galleryBox.add("button", undefined, "Видеопримеры — в HTML-панели");
        btnGalleryPlay.helpTip = "Откройте Window → Extensions (Legacy) → NOIR Captions · HTML: примеры проигрываются внутри карточек.";
        var rTarget = row(tStyle, "Настраиваю", 95);
        var rbBase = rTarget.add("radiobutton", undefined, "Обычные слова");
        var rbAccent = rTarget.add("radiobutton", undefined, "*Акцент*");
        rbBase.value = true;

        var pnlText = tStyle.add("panel", undefined, "");
        pnlText.alignChildren = ["fill", "top"];
        pnlText.margins = [6, 10, 6, 6];
        pnlText.spacing = 3;
        var families = getFontFamilies();
        var rFont = row(pnlText, "Шрифт");
        var stFont = rFont.add("statictext", undefined, "");
        stFont.alignment = ["fill", "center"];
        var ddFamily = null, ddStyle = null, etFilter = null, etPs = null;
        if (families) {
            // поиск, семейство и начертание — в одну строку
            var rFind = row(pnlText, "Поиск", 42);
            etFilter = rFind.add("edittext", undefined, "");
            etFilter.characters = 8;
            ddFamily = rFind.add("dropdownlist", undefined, []);
            ddFamily.alignment = ["fill", "center"];
            ddStyle = rFind.add("dropdownlist", undefined, []);
            ddStyle.alignment = ["fill", "center"];
        } else {
            etPs = row(pnlText, "PostScript").add("edittext", undefined, "");
            etPs.alignment = ["fill", "center"];
        }
        var ddRecentFonts = pnlText.add("dropdownlist", undefined, []);
        ddRecentFonts.helpTip = "Последние восемь выбранных шрифтов. Выбор меняет шрифт в настройках; применение к слоям — отдельными кнопками.";
        var rFromTo = pnlText.add("group");
        rFromTo.orientation = "row";
        var btnFromLayer = rFromTo.add("button", undefined, "Взять со слоя");
        var btnFontToLayers = rFromTo.add("button", undefined, "Шрифт → выделенным слоям");
        var btnFontAll = tStyle.add("button", undefined, "Шрифт → всем субтитрам NOIR");
        btnFontAll.helpTip = "Меняет только шрифт у всех субтитров NOIR в текущей композиции. Свои текстовые слои не затрагивает.";
        var rQuick = row(tStyle, "Размер, %");
        var etQuickSize = rQuick.add("edittext", undefined, String(S.quick.size)); etQuickSize.characters = 4;
        var ddQuickPosition = dropdown(row(tStyle, "Положение"), [
            {id: "preset", label: "Из пресета"}, {id: "25", label: "Сверху"},
            {id: "50", label: "По центру"}, {id: "75", label: "Снизу"}], S.quick.position);
        var ddIntensity = dropdown(row(tStyle, "Анимация"), [
            {id: "1", label: "Из пресета"}, {id: "0.5", label: "Спокойная"},
            {id: "1.5", label: "Выразительная"}], S.quick.intensity);
        var btnCheck = tStyle.add("button", undefined, "Проверить перед созданием");
        var btnPreview = tStyle.add("button", undefined, "Превью фразы на видео");
        btnPreview.helpTip = "Создаёт отдельную композицию с текущим видео и выбранной фразой (до 5 секунд). Исходная композиция сохраняется. Воспроизведение: пробел / Num 0.";
        // ---- вкладка «Вид»: размер, цвет, обводка, эффекты ----
        var rTarget2 = row(tView, "Настраиваю", 95);
        var rbBase2 = rTarget2.add("radiobutton", undefined, "Обычные слова");
        var rbAccent2 = rTarget2.add("radiobutton", undefined, "*Акцент*");
        rbBase2.value = true;
        var pnlView = tView.add("panel", undefined, "");
        pnlView.alignChildren = ["fill", "top"];
        pnlView.margins = [6, 10, 6, 6];
        pnlView.spacing = 3;
        var rSize = row(pnlView, "Размер");
        var etSize = field(rSize, 0, 5, { min: 4, max: 2000, step: 1, dec: 0, name: "Размер" });
        rSize.add("statictext", undefined, "Трекинг");
        var etTrack = field(rSize, 0, 5, { min: -1000, max: 3000, step: 2, dec: 0, name: "Трекинг" });
        var cbCaps = rSize.add("checkbox", undefined, "КАПС");
        var rColor = row(pnlView, "Цвет");
        var swatch = rColor.add("panel");
        swatch.preferredSize = [40, 18];
        var btnColor = rColor.add("button", undefined, "Выбрать…");
        var rStroke = row(pnlView, "Обводка, px");
        var etStroke = field(rStroke, 0, 4, { min: 0, max: 200, step: 0.25, dec: 1, name: "Обводка, px" });
        var swatchStroke = rStroke.add("panel");
        swatchStroke.preferredSize = [40, 18];
        var btnStrokeColor = rStroke.add("button", undefined, "Цвет…");
        var rFx = row(pnlView, "Эффекты");
        var cbShadow = rFx.add("checkbox", undefined, "Тень");
        var cbGlow = rFx.add("checkbox", undefined, "Свечение");
        rFx.add("statictext", undefined, "размер");
        var etGlow = field(rFx, 30, 4, { min: 1, max: 500, step: 1, dec: 0, name: "Размер свечения" });
        var rBlend = row(pnlView, "Режим");
        var ddBlend = dropdown(rBlend, N.BLEND_MODES, "normal");
        ddBlend.helpTip = "Инверсия: белый текст + режим Difference инвертирует кадр под буквами";
        rBlend.add("statictext", undefined, "прозр. %");
        var etOpacity = field(rBlend, 100, 4, { min: 0, max: 100, step: 0.5, dec: 0, name: "Прозрачность, %" });
        etOpacity.helpTip = "Прозрачность текста в покое, % (анимация входа и выхода идёт от 0 до этого значения)";

        // ================= Раскладка =================
        var REVEALS = [{ id: "word", label: "Слова появляются по очереди" },
            { id: "group", label: "Фраза появляется целиком" }];
        var ddReveal = dropdown(row(tLayout, "Появление"), REVEALS, "word");
        var rWords = row(tLayout, "Слов");
        var etMaxWords = field(rWords, 1, 3, { min: 1, max: 30, step: 0.08, dec: 0, name: "Слов на экране" });
        rWords.add("statictext", undefined, "макс. симв.");
        var etMaxChars = field(rWords, 28, 3, { min: 1, max: 300, step: 0.5, dec: 0, name: "Макс. символов" });
        rWords.add("statictext", undefined, "в строке");
        var etLineChars = field(rWords, 16, 3, { min: 0, max: 300, step: 0.3, dec: 0, name: "Символов в строке" });
        etLineChars.helpTip = "Символов в строке (0 — без переноса)";
        var rPos = row(tLayout, "Позиция X/Y, %");
        var etPosX = field(rPos, 50, 3, { min: -50, max: 150, step: 0.25, dec: 1, name: "Позиция X, %" });
        var etPosY = field(rPos, 50, 3, { min: -50, max: 150, step: 0.25, dec: 1, name: "Позиция Y, %" });
        rPos.add("statictext", undefined, "интервал");
        var etLineGap = field(rPos, 0.12, 4, { min: -1, max: 5, step: 0.005, dec: 2, name: "Межстрочный интервал" });
        etLineGap.helpTip = "Межстрочный интервал (доля размера шрифта)";
        var etWordSpace = field(rPos, 0.28, 4, { min: 0, max: 3, step: 0.005, dec: 2, name: "Пробел между словами" });
        etWordSpace.helpTip = "Пробел между словами в строке (доля размера шрифта)";
        var rZone = row(tLayout, "Акценты", 60);
        var cbAccentZone = rZone.add("checkbox", undefined, "отдельно по высоте");
        cbAccentZone.helpTip = "Акцентные слова ставятся на свою высоту кадра (например, над головой), остальные слова — на «Позицию Y». Так сделан стиль OLD MONEY";
        var etAccentY = field(rZone, 20, 3, { min: -50, max: 150, step: 0.25, dec: 1, name: "Высота акцентов, %" });
        var rBreak = row(tLayout, "Разрыв на паузе, с");
        var etPause = field(rBreak, 0.35, 4, { min: 0.05, max: 10, step: 0.01, dec: 2, name: "Разрыв на паузе, с" });
        var cbPunctBreak = rBreak.add("checkbox", undefined, "и на . , ! ?");
        var cbStrip = rBreak.add("checkbox", undefined, "без пунктуации");
        var rAcc = row(tLayout, "");
        var cbAccentLine = rAcc.add("checkbox", undefined, "Акцент отдельной строкой");
        var cbAutoAccent = rAcc.add("checkbox", undefined, "Авто-акценты");
        var cbReflow = row(tLayout, "").add("checkbox", undefined, "Автоперекладка фразы при смене акцента");
        cbReflow.value = !!S.reflow;
        cbReflow.helpTip = "Когда вы делаете слово акцентным/обычным (вкладка «Слои»), слова этой фразы снова раскладываются по правилам раскладки";

        // ================= Анимация =================
        // Сетка вылетов: клик по кнопке — выбрать анимацию; если выделены текстовые слои — она сразу применится к ним.
        var rMode = row(tAnim, "", 0);
        var rbAnimIn = rMode.add("radiobutton", undefined, "Вход");
        rbAnimIn.value = true;
        var rbAnimOut = rMode.add("radiobutton", undefined, "Выход");
        rMode.add("statictext", undefined, "длит., с:");
        var etInDur = field(rMode, 0.2, 4, { min: 0, max: 5, step: 0.005, dec: 2, name: "Длительность входа, с" });
        etInDur.helpTip = "Длительность входа, с";
        var etOutDur = field(rMode, 0.15, 4, { min: 0, max: 5, step: 0.005, dec: 2, name: "Длительность выхода, с" });
        etOutDur.helpTip = "Длительность выхода, с";
        var galStack = tAnim.add("group");
        galStack.orientation = "stack";
        galStack.alignChildren = ["left", "top"];
        var galIn = galStack.add("group");
        galIn.orientation = "column";
        galIn.alignChildren = ["left", "top"];
        galIn.spacing = 3;
        var galOut = galStack.add("group");
        galOut.orientation = "column";
        galOut.alignChildren = ["left", "top"];
        galOut.spacing = 3;
        galOut._cepVisible = galOut.visible = false;
        var chipsIn = [], chipsOut = [];
        function buildGallery(parent, list, chips, which) {
            var rowG = null;
            for (var i = 0; i < list.length; i++) {
                if (i % 5 === 0) {
                    rowG = parent.add("group");
                    rowG.orientation = "row";
                    rowG.spacing = 3;
                }
                var b = rowG.add("button", undefined, list[i].abbr);
                b.preferredSize = [72, 24];
                b._id = list[i].id;
                b._which = which;
                b.helpTip = list[i].label;
                b.onClick = function () { pickAnim(this._which, this._id); };
                chips.push(b);
            }
        }
        buildGallery(galIn, N.ANIM_IN, chipsIn, "in");
        buildGallery(galOut, N.ANIM_OUT, chipsOut, "out");
        var stAnimCur = tAnim.add("statictext", undefined, "");
        stAnimCur.alignment = ["fill", "top"];
        var rDist = row(tAnim, "Сдвиг, px");
        var etDist = field(rDist, 40, 4, { min: 0, max: 5000, step: 1, dec: 0, name: "Сдвиг, px" });
        rDist.add("statictext", undefined, "Blur, px");
        var etBlur = field(rDist, 0, 4, { min: 0, max: 500, step: 0.5, dec: 1, name: "Blur, px" });
        rDist.add("statictext", undefined, "Плавность, %");
        var etEase = field(rDist, 80, 4, { min: 0.1, max: 100, step: 0.5, dec: 0, name: "Плавность, %" });
        rDist.helpTip = "Размеры заданы для кадра шириной 1080 и масштабируются под композицию. У коротких слов вход и выход автоматически укорачиваются";
        var btnAnimApply = tAnim.add("button", undefined, "Применить анимацию к выделенным слоям");

        // ================= Слои: правка выделенных слоёв =================
        tLayers.add("statictext", undefined, "Выделите слои в таймлайне. Выделено несколько — изменятся все.");
        var rQuick = tLayers.add("group");
        var btnMakeAccent = rQuick.add("button", undefined, "★ Сделать акцентом");
        var btnMakeBase = rQuick.add("button", undefined, "Сделать обычным");
        // отдельной строкой — в узком окне третья кнопка в ряду обрезается
        var btnReflow = tLayers.add("button", undefined, "↻ Перекласть фразу выделенных слов");
        btnReflow.helpTip = "Раскладывает слова фразы заново по настройкам вкладки «Раскладка» (строки, акцент отдельной строкой) вокруг её центра. Анимация сохраняется";
        var btnInvert = tLayers.add("button", undefined, "◐ Инверсия вкл/выкл для выделенных слоёв");
        btnInvert.helpTip = "Белый слой в режиме Difference инвертирует кадр под собой. Работает для текста, SVG, картинок и фигур. Повторный клик — выключить";
        var pnlApply = tLayers.add("panel", undefined, "Применить настройки панели к выделенным");
        pnlApply.alignChildren = ["fill", "top"];
        pnlApply.margins = [6, 12, 6, 6];
        pnlApply.spacing = 3;
        var rWhich = row(pnlApply, "Стиль", 60);
        var rbApplyBase = rWhich.add("radiobutton", undefined, "Обычный");
        var rbApplyAccent = rWhich.add("radiobutton", undefined, "Акцент");
        rbApplyBase.value = true;
        // Применяются только отмеченные свойства — остальные у слоя не меняются.
        var rWhat = row(pnlApply, "Что", 60);
        var cbApplyFont = rWhat.add("checkbox", undefined, "Шрифт");
        cbApplyFont.value = true;
        var cbApplySize = rWhat.add("checkbox", undefined, "Размер");
        var cbApplyColor = rWhat.add("checkbox", undefined, "Цвет");
        var rWhat2 = row(pnlApply, "", 60);
        var cbApplyStroke = rWhat2.add("checkbox", undefined, "Обводка");
        var cbApplyFx = rWhat2.add("checkbox", undefined, "Эффекты");
        var cbApplyBlend = rWhat2.add("checkbox", undefined, "Режим");
        cbApplyBlend.helpTip = "Режим наложения и прозрачность — с вкладки «Вид»";
        var cbApplyAnim = rWhat2.add("checkbox", undefined, "Анимация");
        cbApplyFont.helpTip = "Шрифт и начертание — с вкладки «Стиль»";
        cbApplySize.helpTip = "Размер и трекинг — с вкладки «Вид»";
        cbApplyColor.helpTip = "Цвет заливки — с вкладки «Вид»";
        cbApplyStroke.helpTip = "Обводка — с вкладки «Вид»";
        cbApplyFx.helpTip = "Тень и свечение — с вкладки «Вид»";
        cbApplyAnim.helpTip = "Появление и исчезновение — с вкладки «Анимация»";
        var btnApply = pnlApply.add("button", undefined, "Применить к выделенным");
        btnApply.helpTip = "Позиция и тайминг слоя не меняются. Регистр букв (КАПС) вернуть назад нельзя";

        // ================= 4 · Правка: готовые субтитры =================
        var FIN_SCOPES = [{ id: "source", label: "Субтитры этого видео" }, { id: "selected", label: "Выделенные слои" },
            { id: "all", label: "Все субтитры NOIR в композиции" }];
        var stFinHint = tFinish.add("statictext", undefined, "Правка уже созданных субтитров. Текст можно двигать и мышью — анимация не мешает.", { multiline: true });
        stFinHint.preferredSize = [260, 30];
        if (options.headless) stFinHint._cepVisible = false;   // в HTML свой подзаголовок
        var ddFinScope = dropdown(row(tFinish, "Что менять", 70), FIN_SCOPES, "source");
        ddFinScope.helpTip = "«Этого видео» — субтитры аудиослоя, текст которого сейчас открыт в панели. Субтитры других слоёв не меняются";
        var pnlFinPos = tFinish.add("panel", undefined, "Положение и размер");
        pnlFinPos.alignChildren = ["fill", "top"]; pnlFinPos.margins = [6, 12, 6, 6]; pnlFinPos.spacing = 3;
        var rFinPlace = pnlFinPos.add("group");
        var btnFinTop = rFinPlace.add("button", undefined, "Вверху");
        var btnFinMid = rFinPlace.add("button", undefined, "По центру");
        var btnFinBottom = rFinPlace.add("button", undefined, "Внизу");
        var rFinNudge = row(pnlFinPos, "Сдвиг, px", 60);
        var etFinStep = field(rFinNudge, 20, 3, { min: 1, max: 2000, step: 1, dec: 0, name: "Шаг сдвига, px" });
        var btnFinUp = rFinNudge.add("button", undefined, "↑");
        var btnFinDown = rFinNudge.add("button", undefined, "↓");
        var btnFinLeft = rFinNudge.add("button", undefined, "←");
        var btnFinRight = rFinNudge.add("button", undefined, "→");
        var finArrows = [btnFinUp, btnFinDown, btnFinLeft, btnFinRight];
        for (var fa = 0; fa < finArrows.length; fa++) finArrows[fa].preferredSize = [30, 22];
        var btnFinReset = pnlFinPos.add("button", undefined, "Вернуть на исходные места");
        var rFinSize = row(pnlFinPos, "Размер, %", 60);
        var etFinSizeStep = field(rFinSize, 10, 3, { min: 1, max: 100, step: 1, dec: 0, name: "Шаг размера, %" });
        var btnFinSmaller = rFinSize.add("button", undefined, "A−");
        var btnFinBigger = rFinSize.add("button", undefined, "A+");
        btnFinSmaller.preferredSize = btnFinBigger.preferredSize = [36, 22];
        btnFinSmaller.helpTip = btnFinBigger.helpTip = "Меняет размер шрифта (не Scale слоя), поэтому ключевые кадры не создаются. Фразы перекладываются вокруг прежнего центра";
        var pnlFinTime = tFinish.add("panel", undefined, "Время");
        pnlFinTime.alignChildren = ["fill", "top"]; pnlFinTime.margins = [6, 12, 6, 6]; pnlFinTime.spacing = 3;
        var rFinTimeStep = row(pnlFinTime, "Шаг, с", 60);
        var etFinTimeStep = field(rFinTimeStep, 0.1, 4, { min: 0.01, max: 30, step: 0.01, dec: 2, name: "Шаг времени, с" });
        var rFinShift = row(pnlFinTime, "Сдвиг", 60);
        var btnFinEarlier = rFinShift.add("button", undefined, "◀ раньше");
        var btnFinLater = rFinShift.add("button", undefined, "позже ▶");
        var rFinStart = row(pnlFinTime, "Начало", 60);
        var btnFinStartEarlier = rFinStart.add("button", undefined, "−");
        var btnFinStartLater = rFinStart.add("button", undefined, "+");
        var rFinEnd = row(pnlFinTime, "Конец", 60);
        var btnFinEndEarlier = rFinEnd.add("button", undefined, "−");
        var btnFinEndLater = rFinEnd.add("button", undefined, "+");
        var finTimeButtons = [btnFinStartEarlier, btnFinStartLater, btnFinEndEarlier, btnFinEndLater];
        for (var ft = 0; ft < finTimeButtons.length; ft++) finTimeButtons[ft].preferredSize = [40, 22];
        btnFinEarlier.helpTip = btnFinLater.helpTip = "Двигает выбранные субтитры по времени целиком вместе с анимацией";
        btnFinStartEarlier.helpTip = "Субтитр появляется раньше. Анимация входа едет за началом";
        btnFinStartLater.helpTip = "Субтитр появляется позже";
        btnFinEndEarlier.helpTip = "Субтитр исчезает раньше. Анимация выхода едет за концом";
        btnFinEndLater.helpTip = "Субтитр держится дольше";
        var pnlFinAnim = tFinish.add("panel", undefined, "Анимация");
        pnlFinAnim.alignChildren = ["fill", "top"]; pnlFinAnim.margins = [6, 12, 6, 6]; pnlFinAnim.spacing = 3;
        var ddFinIn = dropdown(row(pnlFinAnim, "Появление", 70), N.ANIM_IN, S.style.anim.animIn);
        var ddFinOut = dropdown(row(pnlFinAnim, "Исчезание", 70), N.ANIM_OUT, S.style.anim.animOut);
        var btnFinAnim = pnlFinAnim.add("button", undefined, "Применить анимацию");
        var pnlFinLook = tFinish.add("panel", undefined, "Вид и слои");
        pnlFinLook.alignChildren = ["fill", "top"]; pnlFinLook.margins = [6, 12, 6, 6]; pnlFinLook.spacing = 3;
        var btnFinStyle = pnlFinLook.add("button", undefined, "Применить текущий стиль");
        var btnFinBehind = pnlFinLook.add("button", undefined, "Поместить под выделенный слой");
        btnFinBehind.helpTip = "Выделите слой (например, копию видео с вырезанным человеком) — субтитры окажутся под ним, и текст зайдёт «за человека»";
        var btnFinDelete = pnlFinLook.add("button", undefined, "Удалить субтитры");
        btnFinTop.helpTip = btnFinMid.helpTip = btnFinBottom.helpTip = "Ставит каждую фразу целиком на эту высоту кадра. Анимация сохраняется";
        btnFinReset.helpTip = "Снимает ручные сдвиги: фразы встают туда, куда их поставило создание субтитров";
        btnFinAnim.helpTip = "Заменяет появление и исчезание у выбранных субтитров. Положение и тайминг не меняются";
        btnFinStyle.helpTip = "Шрифт, размер, цвет, обводка и эффекты текущего стиля: обычным словам — «Обычные», акцентам — «Акцент»";
        btnFinDelete.helpTip = "Удаляет выбранные субтитры NOIR. Отмена — Ctrl+Z";

        // ================= Функции: счётчик, зачёркивание, маска =================
        var TL = S.tools;
        var STRIKE_DIRS = [{ id: "ltr", label: "Слева направо" }, { id: "rtl", label: "Справа налево" }, { id: "center", label: "От центра" }];
        var MASK_MODES = [{ id: "video", label: "Видео внутри букв" }, { id: "cut", label: "Вырез (буквы прозрачны)" }];
        var rTool = row(tTools, "", 0);
        var rbToolCounter = rTool.add("radiobutton", undefined, "Счётчик");
        rbToolCounter.value = true;
        var rbToolStrike = rTool.add("radiobutton", undefined, "Зачёркивание");
        var rbToolMask = rTool.add("radiobutton", undefined, "Маска");
        var toolStack = tTools.add("group");
        toolStack.orientation = "stack";
        toolStack.alignChildren = ["fill", "top"];
        function toolPage(visible) {
            var g = toolStack.add("group");
            g.orientation = "column";
            g.alignChildren = ["fill", "top"];
            g.spacing = 3;
            g._cepVisible = g.visible = visible;
            return g;
        }
        var pgCounter = toolPage(true), pgStrike = toolPage(false), pgMask = toolPage(false);
        if (!TOOLS) tTools.add("statictext", undefined, "Модуль функций не загружен (нет файла ae/noir/tools.jsx).");

        // --- счётчик ---
        var rcRange = row(pgCounter, "От / до", 50);
        var etCoFrom = field(rcRange, TL.counter.from, 6, { min: -1000000000, max: 1000000000, step: 1, dec: 2, name: "Счётчик: от" });
        var etCoTo = field(rcRange, TL.counter.to, 6, { min: -1000000000, max: 1000000000, step: 1, dec: 2, name: "Счётчик: до" });
        rcRange.add("statictext", undefined, "длит., с");
        var etCoDur = field(rcRange, TL.counter.duration, 4, { min: 0.1, max: 600, step: 0.05, dec: 2, name: "Длительность счёта, с" });
        var rcStep = row(pgCounter, "Шаг", 50);
        var etCoStep = field(rcStep, TL.counter.step, 4, { min: 0, max: 1000000, step: 0.1, dec: 2, name: "Шаг (0 — плавно по 1)" });
        rcStep.add("statictext", undefined, "интервал, с");
        var etCoIvl = field(rcStep, TL.counter.interval, 4, { min: 0, max: 5, step: 0.005, dec: 3, name: "Интервал обновления, с (0 — каждый кадр)" });
        rcStep.add("statictext", undefined, "держать, с");
        var etCoHold = field(rcStep, TL.counter.hold, 4, { min: 0, max: 600, step: 0.05, dec: 2, name: "Держать после конца, с" });
        var rcFmt = row(pgCounter, "Формат", 50);
        var etCoDec = field(rcFmt, TL.counter.decimals, 3, { min: 0, max: 6, step: 0.05, dec: 0, name: "Знаков после запятой" });
        rcFmt.add("statictext", undefined, "нули");
        var etCoPad = field(rcFmt, TL.counter.pad, 3, { min: 0, max: 12, step: 0.05, dec: 0, name: "Дополнить нулями до цифр" });
        var ddCoSep = dropdown(rcFmt, N.COUNTER_SEPS || [{ id: "none", label: "—" }], TL.counter.thousands);
        var rcEase = row(pgCounter, "Ход", 50);
        var ddCoEase = dropdown(rcEase, N.COUNTER_EASES || [{ id: "out", label: "—" }], TL.counter.ease);
        var rcText = row(pgCounter, "Текст", 50);
        rcText.add("statictext", undefined, "перед");
        var etCoPre = rcText.add("edittext", undefined, TL.counter.prefix);
        etCoPre.characters = 6;
        rcText.add("statictext", undefined, "после");
        var etCoSuf = rcText.add("edittext", undefined, TL.counter.suffix);
        etCoSuf.characters = 6;
        var rcLook = row(pgCounter, "Вид", 50);
        var rbCoAccent = rcLook.add("radiobutton", undefined, "Акцент");
        var rbCoBase = rcLook.add("radiobutton", undefined, "Обычный");
        rbCoAccent.value = TL.counter.side !== "base";
        rbCoBase.value = TL.counter.side === "base";
        rcLook.add("statictext", undefined, "размер");
        var etCoSize = field(rcLook, TL.counter.size, 4, { min: 0, max: 2000, step: 1, dec: 0, name: "Размер, px (0 — из стиля)" });
        var rcPos = row(pgCounter, "Позиция %", 70);
        var etCoX = field(rcPos, TL.counter.posX, 4, { min: -50, max: 150, step: 0.2, dec: 1, name: "Позиция X, %" });
        var etCoY = field(rcPos, TL.counter.posY, 4, { min: -50, max: 150, step: 0.2, dec: 1, name: "Позиция Y, %" });
        var cbCoSound = pgCounter.add("checkbox", undefined, "Звук счётчика (SFX «counter»)");
        cbCoSound.value = !!TL.counter.sound;
        var btnCounter = pgCounter.add("button", undefined, "Создать счётчик с текущего времени");

        // --- зачёркивание ---
        pgStrike.add("statictext", undefined, "Выделите текстовые слои (слова) — на каждом появится полоса.");
        var rsA = row(pgStrike, "Цвет", 60);
        var swatchStrike = rsA.add("panel");
        swatchStrike.preferredSize = [40, 18];
        var btnStrikeColor = rsA.add("button", undefined, "Выбрать…");
        rsA.add("statictext", undefined, "толщина");
        var etStrThick = field(rsA, TL.strike.thickness, 3, { min: 0.5, max: 200, step: 0.1, dec: 1, name: "Толщина, px" });
        var rsB = row(pgStrike, "Положение", 60);
        rsB.add("statictext", undefined, "смещ. %");
        var etStrOff = field(rsB, TL.strike.offsetY, 4, { min: -100, max: 100, step: 0.2, dec: 1, name: "Смещение по высоте, %" });
        rsB.add("statictext", undefined, "наклон °");
        var etStrTilt = field(rsB, TL.strike.tilt, 4, { min: -45, max: 45, step: 0.1, dec: 1, name: "Наклон, °" });
        rsB.add("statictext", undefined, "шире %");
        var etStrPad = field(rsB, TL.strike.padding, 3, { min: -50, max: 200, step: 0.2, dec: 0, name: "Шире текста, %" });
        var rsC = row(pgStrike, "Анимация", 60);
        var ddStrDir = dropdown(rsC, STRIKE_DIRS, TL.strike.dir);
        rsC.add("statictext", undefined, "длит.");
        var etStrDur = field(rsC, TL.strike.duration, 4, { min: 0, max: 5, step: 0.005, dec: 2, name: "Длительность вытирания, с" });
        rsC.add("statictext", undefined, "задержка");
        var etStrDelay = field(rsC, TL.strike.delay, 4, { min: 0, max: 10, step: 0.005, dec: 2, name: "Задержка после появления слова, с" });
        var btnStrike = pgStrike.add("button", undefined, "Зачеркнуть выделенные слои");
        var btnStrikeRemove = pgStrike.add("button", undefined, "Убрать зачёркивания");

        // --- маска ---
        pgMask.add("statictext", undefined, "Видео внутри букв: выделите текстовые слои и один видео/фото слой.");
        var rmA = row(pgMask, "Режим", 50);
        var ddMaskMode = dropdown(rmA, MASK_MODES, TL.mask.mode);
        var cbMaskInvert = pgMask.add("checkbox", undefined, "Инвертировать (видео везде, кроме букв)");
        cbMaskInvert.value = !!TL.mask.invert;
        var cbMaskRestart = pgMask.add("checkbox", undefined, "Клип с начала каждого слова");
        cbMaskRestart.value = !!TL.mask.restart;
        var cbMaskHide = pgMask.add("checkbox", undefined, "Скрыть исходное видео");
        cbMaskHide.value = !!TL.mask.hideSource;
        var rmB = row(pgMask, "Вырез", 50);
        rmB.add("statictext", undefined, "цвет — как у «Обычного», прозр. %");
        var etMaskOp = field(rmB, TL.mask.opacity, 4, { min: 0, max: 100, step: 0.5, dec: 0, name: "Непрозрачность выреза, %" });
        var btnMask = pgMask.add("button", undefined, "Создать маску по выделенным");
        var btnMaskRemove = pgMask.add("button", undefined, "Убрать маски");

        // ================= SFX: озвучивание текста =================
        function loadLib() { return SFX ? N.sfxLibrary(root, { mixBase: !!S.sfx.mixBase }) : { names: [], files: {}, source: {} }; }
        var sfxLib = loadLib();
        tSfx.add("statictext", undefined, "Звуки добавляются только вручную кнопками ниже.");
        function ddChoice(label, kind) {
            var r = row(tSfx, label, 70), dd = r.add("dropdownlist", undefined, []);
            dd.alignment = ["fill", "center"];
            dd._kind = kind;
            return dd;
        }
        var ddSfxAppear = ddChoice("Появление", "appear");
        var ddSfxAccent = ddChoice("Акцент", "accent");
        var ddSfxExit = ddChoice("Выход", "exit");
        var rSfxVol = row(tSfx, "Громкость, дБ", 85);
        var etSfxDb = field(rSfxVol, S.sfx.db, 4, { min: -60, max: 12, step: 0.1, dec: 1, name: "Громкость, дБ" });
        rSfxVol.add("statictext", undefined, "разброс");
        var etSfxRand = field(rSfxVol, S.sfx.dbRand, 3, { min: 0, max: 12, step: 0.05, dec: 1, name: "Разброс, дБ" });
        rSfxVol.add("statictext", undefined, "мин. интервал, с");
        var etSfxGap = field(rSfxVol, S.sfx.minGap, 4, { min: 0, max: 5, step: 0.005, dec: 2, name: "Мин. интервал, с" });
        var cbSfxMix = tSfx.add("checkbox", undefined, "Подмешивать базовые звуки к своим");
        cbSfxMix.value = !!S.sfx.mixBase;
        cbSfxMix.helpTip = "Выкл: если в вашей папке SFX есть звуки категории, используются только они. Вкл: базовые и свои вместе";
        var rSfxBtn = tSfx.add("group");
        var btnSfxSelected = rSfxBtn.add("button", undefined, "Озвучить выделенные слои");
        var btnSfxRemove = rSfxBtn.add("button", undefined, "Убрать SFX");
        var rSfxFile = row(tSfx, "Звук", 40);
        var ddSfxFile = rSfxFile.add("dropdownlist", undefined, []);
        ddSfxFile.alignment = ["fill", "center"];
        var btnSfxHere = rSfxFile.add("button", undefined, "В текущее время");
        var rSfxLib = tSfx.add("group");
        var btnSfxRescan = rSfxLib.add("button", undefined, "Обновить список");
        var btnSfxFolder = rSfxLib.add("button", undefined, "Папка SFX");
        var stSfxInfo = tSfx.add("statictext", undefined, "");
        stSfxInfo.alignment = ["fill", "top"];

        function choiceItems(kind) {
            var items = [];
            if (kind === "accent") items.push({ id: "same", label: "Как появление" });
            items.push({ id: "auto", label: "Авто (по анимации)" });
            items.push({ id: "off", label: "Выкл" });
            for (var i = 0; i < sfxLib.names.length; i++)
                items.push({ id: "cat:" + sfxLib.names[i], label: N.sfxCategoryLabel ? N.sfxCategoryLabel(sfxLib.names[i]) : sfxLib.names[i] });
            return items;
        }
        function fillDD(dd, items, id) {
            dd.removeAll();
            dd._items = items;
            var sel = 0;
            for (var i = 0; i < items.length; i++) {
                dd.add("item", items[i].label);
                if (items[i].id === id) sel = i;
            }
            dd.selection = sel;
        }
        function ddValue(dd) { return dd._items && dd.selection ? dd._items[dd.selection.index].id : ""; }
        function fileItems() {
            var items = [];
            for (var c = 0; c < sfxLib.names.length; c++) {
                var list = sfxLib.files[sfxLib.names[c]];
                for (var f = 0; f < list.length; f++)
                    items.push({ id: list[f], label: (sfxLib.source && sfxLib.source[list[f]] === "user" ? "★ " : "") +
                        N.sfxCategoryLabel(sfxLib.names[c]) + " · " + N.sfxName(list[f]) });
            }
            return items;
        }
        function refillSfx() {
            state.syncing = true;
            fillDD(ddSfxAppear, choiceItems("appear"), S.sfx.appear);
            fillDD(ddSfxAccent, choiceItems("accent"), S.sfx.accent);
            fillDD(ddSfxExit, choiceItems("exit"), S.sfx.exit);
            fillDD(ddSfxFile, fileItems(), S.sfx.file);
            state.syncing = false;
            var nBase = 0, nUser = 0, c, f;
            for (c = 0; c < sfxLib.names.length; c++) {
                var lst = sfxLib.files[sfxLib.names[c]];
                for (f = 0; f < lst.length; f++) { if (sfxLib.source && sfxLib.source[lst[f]] === "user") nUser++; else nBase++; }
            }
            stSfxInfo.text = SFX ? ("Базовых: " + nBase + ", своих ★: " + nUser + ", категорий: " + sfxLib.names.length +
                ". Свои звуки кладите через «Папка SFX» (имя файла text_shimmer, blur_out… определяет категорию).")
                : "Модуль SFX не загружен (нет файла ae/noir/sfx.jsx).";
        }
        refillSfx();

        // ================= низ =================
        if (!TH) scroller.content.add("statictext", undefined, "NOIR CAPTIONS " + VERSION);

        // ================= тема =================
        if (TH && !options.headless) {
            var primary = [btnRecognize, btnGenerate, btnMakeAccent, btnCounter, btnStrike, btnMask];
            var ghost = [btnCancel, btnLoad, btnSave, btnReset, btnSavePreset, btnFromLayer, btnFontToLayers,
                btnColor, btnStrokeColor, btnMakeBase, btnApply, btnInvert, btnReflow, btnAnimApply, btnStrikeColor, btnStrikeRemove, btnMaskRemove, btnSfxSelected, btnSfxRemove, btnSfxHere, btnSfxRescan, btnSfxFolder,
                btnFinTop, btnFinMid, btnFinBottom, btnFinUp, btnFinDown, btnFinLeft, btnFinRight, btnFinSmaller, btnFinBigger, btnFinEarlier, btnFinLater, btnFinStartEarlier, btnFinStartLater, btnFinEndEarlier, btnFinEndLater, btnFinReset, btnFinAnim, btnFinStyle, btnFinBehind, btnFinDelete];
            for (var bi = 0; bi < primary.length; bi++) TH.button(primary[bi], "primary");
            for (var gi = 0; gi < ghost.length; gi++) TH.button(ghost[gi], "ghost");
            btnGenerate.preferredSize.height = 32;
            btnRecognize.preferredSize.height = 28;
            TH.text(stLine, TH.colors.muted);
            for (var si = 0; si < scrubs.length; si++) TH.scrub(scrubs[si]);
            for (var ci2 = 0; ci2 < chipsIn.length; ci2++) TH.chip(chipsIn[ci2]);
            for (var co2 = 0; co2 < chipsOut.length; co2++) TH.chip(chipsOut[co2]);
            TH.styleTree(win);
            for (var pi = 0; pi < tabs.pages.length; pi++) TH.background(tabs.pages[pi]);
        }

        // ================= подсказки (наведите курсор) =================
        btnRecognize.helpTip = "Выделите в таймлайне слой со звуком. Распознаёт речь локально, без интернета. Для английских и смешанных роликов выберите язык «Авто»";
        btnCancel.helpTip = "Остановить распознавание";
        btnLoad.helpTip = "Открыть ранее сохранённый результат распознавания, чтобы не распознавать заново";
        btnSave.helpTip = "Сохранить распознанный текст с таймингами и вашими правками в файл";
        btnReset.helpTip = "Вернуть текст как после распознавания (отменить ваши правки)";
        btnSavePreset.helpTip = "Сохранить все текущие настройки (шрифты, вид, раскладка, анимация) как свой пресет";
        btnFromLayer.helpTip = "Выделите текстовый слой в AE — шрифт, размер и цвет возьмутся с него";
        btnFontToLayers.helpTip = "Выберите шрифт выше и нажмите — только шрифт применится к выделенным слоям (размер, цвет и остальное не меняются)";
        cbAutoAccent.helpTip = "В каждой фразе из нескольких слов автоматически выделяется главное слово (число или самое длинное) — оно получит акцентный стиль";
        btnMakeAccent.helpTip = "Выделенные текстовые слои получат акцентный стиль (шрифт, размер, цвет, эффекты из настроек «Акцент»)";
        btnMakeBase.helpTip = "Выделенные текстовые слои получат обычный стиль";
        btnApply.helpTip = "Применить вид и/или анимацию из панели к выделенным слоям. Выделите все слои — применится ко всем";
        btnSfxSelected.helpTip = "Добавить звуки к выделенным текстовым слоям: на появление (и выход, если включён) по настройкам выше";
        btnSfxRemove.helpTip = "Удалить из композиции все слои «NOIR SFX»";
        btnSfxHere.helpTip = "Вставить выбранный звук в позицию текущего времени (индикатор на таймлайне)";
        btnSfxFolder.helpTip = "Открыть папку, куда можно класть свои звуки (подпапка = категория)";
        etSfxRand.helpTip = "Случайный разброс громкости ± дБ (повторяемый), чтобы звуки не звучали одинаково";
        etSfxGap.helpTip = "Если звуки ближе друг к другу — лишние пропускаются (акцент главнее)";
        btnGenerate.helpTip = "Создать текстовые слои с субтитрами в открытой композиции";
        btnCounter.helpTip = "Создаёт текстовый слой-счётчик с текущего положения индикатора времени. Число считает выражение в Source Text";
        etCoStep.helpTip = "Шаг значения (0 — любые значения). Например 10: 0, 10, 20…";
        etCoIvl.helpTip = "Как часто меняется число, с (0 — каждый кадр). Например 0.1 — десять смен в секунду";
        btnStrike.helpTip = "На каждый выделенный текстовый слой — полоса, которая «вытирается» поверх слова";
        btnMask.helpTip = "Выделите текстовые слои и (для режима «видео внутри букв») ещё один видео/фото слой. Текст станет маской";
        cbReplace.helpTip = "Перед созданием удалить прежние субтитры NOIR этого же аудиослоя. Субтитры других слоёв и ваши слои не трогаются";
        rbBase.helpTip = rbBase2.helpTip = "Настройки ниже относятся к обычным словам";
        rbAccent.helpTip = rbAccent2.helpTip = "Настройки ниже относятся к словам, которые вы выделили *звёздочками* на вкладке «Текст»";

        // ================= логика =================
        function paintSwatch(p, c) {
            try {
                p.graphics.backgroundColor = p.graphics.newBrush(p.graphics.BrushType.SOLID_COLOR, [c[0], c[1], c[2], 1]);
            } catch (e) {}
        }
        var lastStatus = "";
        function setStatus(text, pct) {
            lastStatus = String(text);
            stStatus.text = text;
            stLine.helpTip = text;
            var phase = state.recognizing ? "Распознавание" : (state.data ? (textDirty() ? "Текст изменён — обновите фразу" : "Можно редактировать") : "Выберите видео или загрузите результат");
            stLine.text = phase + " · " + String(text).split("\n")[0];
            if (pct !== undefined && pct !== null) progress.value = Math.round(pct * 100);
        }
        function tgt() { return S.style[state.target]; }

        function textDirty() {
            if (!state.data) return false;
            return etText.text.replace(/\r\n?/g, "\n").split("\n").join("\n") !== state.cleanLines.join("\n");
        }
        function galleryItems() {
            var out = [];
            for (var i = 0; i < presets.length; i++) if (!cbFavorites.value || N.hasItem(S.favoriteStyles, presets[i].id)) out.push(presets[i]);
            return out;
        }
        function galleryStyle(slot) { return galleryItems()[galleryPage * 4 + slot]; }
        function refreshGallery() {
            var items = galleryItems();
            galleryPage = Math.max(0, Math.min(galleryPage, Math.max(0, Math.ceil(items.length / 4) - 1)));
            for (var i = 0; i < galleryCards.length; i++) {
                var p = items[galleryPage * 4 + i], c = galleryCards[i];
                c.button.enabled = c.star.enabled = !!p;
                c.button._cepPreview = p ? {id:p.id,name:p.name,base:p.base,accent:p.accent,anim:p.anim,layout:p.layout} : null;
                c.button.text = p ? (p.id === S.presetId ? "✓ " : "") + p.name : "Нет стиля";
                c.star.text = p && N.hasItem(S.favoriteStyles, p.id) ? "★" : "☆";
                c.sample.text = p ? "Ваши слова оживают" : "";
                if (p && !options.headless) try {
                    c.sample.graphics.font = ScriptUI.newFont(p.base.fonts[0], "REGULAR", 18);
                    c.sample.graphics.foregroundColor = c.sample.graphics.newPen(c.sample.graphics.PenType.SOLID_COLOR, p.base.color, 1);
                } catch (fontPreview) {}
            }
            btnGalleryPrev.enabled = galleryPage > 0;
            btnGalleryNext.enabled = (galleryPage + 1) * 4 < items.length;
            btnGalleryPlay.enabled = false;
            stGalleryPage.text = items.length ? "Страница " + (galleryPage + 1) + " / " + Math.ceil(items.length / 4) : "Избранных пока нет. Отключите фильтр и нажмите ☆ у стиля.";
        }
        function choosePreset(p) {
            if (!p) return;
            S.style = {layout: clone(p.layout), base: clone(p.base), accent: clone(p.accent), anim: clone(p.anim)};
            S.presetId = p.id;
            etQuickSize.text = "100"; ddQuickPosition.selection = 0; ddIntensity.selection = 0;
            saveQuick(); fillPresets(); syncUI(); saveSettings(S); refreshGallery();
        }
        for (var gc = 0; gc < galleryCards.length; gc++) {
            galleryCards[gc].button.onClick = function () { choosePreset(galleryStyle(this._gallerySlot)); };
            galleryCards[gc].star.onClick = function () {
                var p = galleryStyle(this._gallerySlot); if (!p) return;
                if (N.hasItem(S.favoriteStyles, p.id)) {
                    var kept = []; for (var i = 0; i < S.favoriteStyles.length; i++) if (S.favoriteStyles[i] !== p.id) kept.push(S.favoriteStyles[i]);
                    S.favoriteStyles = kept;
                } else S.favoriteStyles.push(p.id);
                saveSettings(S); refreshGallery();
            };
        }
        cbFavorites.onClick = function () { galleryPage = 0; refreshGallery(); };
        btnGalleryPrev.onClick = function () { galleryPage--; refreshGallery(); };
        btnGalleryNext.onClick = function () { galleryPage++; refreshGallery(); };
        btnGalleryPlay.onClick = function () {
            alert("Видеопримеры теперь показываются по наведению в NOIR Captions · HTML. Создание композиций с примерами отключено.", "NOIR Captions");
        };
        function refreshRecentFonts() {
            ddRecentFonts._lock = true; ddRecentFonts.removeAll();
            ddRecentFonts.add("item", "Недавние шрифты…");
            for (var i = 0; i < S.recentFonts.length; i++) ddRecentFonts.add("item", S.recentFonts[i]);
            ddRecentFonts.selection = 0; ddRecentFonts._lock = false;
        }
        ddRecentFonts.onChange = function () {
            if (ddRecentFonts._lock || !ddRecentFonts.selection || !ddRecentFonts.selection.index) return;
            var font = S.recentFonts[ddRecentFonts.selection.index - 1];
            setFont(font); syncTextUI(); saveSettings(S);
        };

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
            refreshGallery();
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
            S.recentFonts = N.recentItem(S.recentFonts, ps, 8); refreshRecentFonts();
            markCustom();
        }

        // Показать стиль в контролах
        function syncTextUI() {
            var t = tgt();
            pnlText.text = pnlView.text = state.target === "base" ? "Обычные слова" : "Акцентные слова (*в звёздочках*)";
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
            selectId(ddBlend, N.BLEND_MODES, t.blend || "normal");
            etOpacity.text = String(t.opacity === undefined ? 100 : t.opacity);
            redrawScrubs();
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
            cbAutoAccent.value = !!L.autoAccent;
            etPosX.text = String(L.posX);
            etPosY.text = String(L.posY);
            cbAccentZone.value = L.accentPosY !== undefined && L.accentPosY !== null;
            etAccentY.text = String(cbAccentZone.value ? L.accentPosY : 20);
            etLineGap.text = String(L.lineGap);
            etWordSpace.text = String(L.wordSpace);
            etPause.text = String(L.pauseBreak);
            cbPunctBreak.value = !!L.punctBreak;
            cbStrip.value = !!L.stripPunct;
            paintSwatch(swatchStrike, S.tools.strike.color);
            refreshChips();
            etInDur.text = String(A.inDur);
            etOutDur.text = String(A.outDur);
            etDist.text = String(A.distance);
            etBlur.text = String(A.blur);
            etEase.text = String(A.easeInfluence);
            var p = presetById(S.presetId);
            stPresetDesc.text = p ? (p.description || "") : "Свои настройки.";
            state.syncing = false;
            redrawScrubs();
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
            t.blend = idOf(ddBlend, N.BLEND_MODES);
            t.opacity = num(etOpacity.text, 100, 0, 100);
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
            S.sfx.enabled = false;
            S.sfx.mixBase = cbSfxMix.value;
            S.sfx.appear = ddValue(ddSfxAppear) || "auto";
            S.sfx.accent = ddValue(ddSfxAccent) || "same";
            S.sfx.exit = ddValue(ddSfxExit) || "off";
            S.sfx.file = ddValue(ddSfxFile);
            S.sfx.db = num(etSfxDb.text, -6, -60, 12);
            S.sfx.dbRand = num(etSfxRand.text, 2, 0, 12);
            S.sfx.minGap = num(etSfxGap.text, 0.12, 0, 5);
            S.reflow = cbReflow.value;
            var tc = S.tools.counter, ts = S.tools.strike, tm = S.tools.mask;
            tc.from = num(etCoFrom.text, 0, -1000000000, 1000000000);
            tc.to = num(etCoTo.text, 100, -1000000000, 1000000000);
            tc.duration = num(etCoDur.text, 2, 0.1, 600);
            tc.step = num(etCoStep.text, 0, 0, 1000000);
            tc.interval = num(etCoIvl.text, 0, 0, 5);
            tc.hold = num(etCoHold.text, 1, 0, 600);
            tc.decimals = Math.round(num(etCoDec.text, 0, 0, 6));
            tc.pad = Math.round(num(etCoPad.text, 0, 0, 12));
            tc.thousands = idOf(ddCoSep, N.COUNTER_SEPS || [{ id: "none" }]);
            tc.ease = idOf(ddCoEase, N.COUNTER_EASES || [{ id: "out" }]);
            tc.prefix = etCoPre.text;
            tc.suffix = etCoSuf.text;
            tc.side = rbCoBase.value ? "base" : "accent";
            tc.size = num(etCoSize.text, 0, 0, 2000);
            tc.posX = num(etCoX.text, 50, -50, 150);
            tc.posY = num(etCoY.text, 50, -50, 150);
            tc.sound = cbCoSound.value;
            ts.thickness = num(etStrThick.text, 8, 0.5, 200);
            ts.offsetY = num(etStrOff.text, 0, -100, 100);
            ts.tilt = num(etStrTilt.text, 0, -45, 45);
            ts.padding = num(etStrPad.text, 8, -50, 200);
            ts.dir = idOf(ddStrDir, STRIKE_DIRS);
            ts.duration = num(etStrDur.text, 0.3, 0, 5);
            ts.delay = num(etStrDelay.text, 0.1, 0, 10);
            tm.mode = idOf(ddMaskMode, MASK_MODES);
            tm.invert = cbMaskInvert.value;
            tm.restart = cbMaskRestart.value;
            tm.hideSource = cbMaskHide.value;
            tm.opacity = num(etMaskOp.text, 100, 0, 100);
            readTextUI();
            var L = S.style.layout, A = S.style.anim;
            L.reveal = idOf(ddReveal, REVEALS);
            L.maxWords = Math.round(num(etMaxWords.text, 1, 1, 30));
            L.maxChars = Math.round(num(etMaxChars.text, 28, 1, 300));
            L.lineChars = Math.round(num(etLineChars.text, 0, 0, 300));
            L.accentOwnLine = cbAccentLine.value;
            L.autoAccent = cbAutoAccent.value;
            L.posX = num(etPosX.text, 50, -50, 150);
            L.posY = num(etPosY.text, 50, -50, 150);
            if (cbAccentZone.value) L.accentPosY = num(etAccentY.text, 20, -50, 150); else delete L.accentPosY;
            L.lineGap = num(etLineGap.text, 0.12, -1, 5);
            L.wordSpace = num(etWordSpace.text, 0.28, 0, 3);
            L.pauseBreak = num(etPause.text, 0.35, 0.05, 10);
            L.punctBreak = cbPunctBreak.value;
            L.stripPunct = cbStrip.value;
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
            choosePreset(presets[i - 1]);
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
        function pickTarget(t) {
            rbBase.value = rbBase2.value = (t === "base");
            rbAccent.value = rbAccent2.value = (t === "accent");
            switchTarget(t);
        }
        rbBase.onClick = rbBase2.onClick = function () { pickTarget("base"); };
        rbAccent.onClick = rbAccent2.onClick = function () { pickTarget("accent"); };

        if (families) {
            etFilter.onChanging = function () { fillFamilies(); };
            ddFamily.onChange = function () { if (!ddFamily._lock) fillStyles(false); };
            ddStyle.onChange = function () {
                if (ddStyle._lock || !ddStyle.selection) return;
                setFont(ddStyle._fam.styles[ddStyle.selection.index].ps);
                saveSettings(S);
            };
        }
        var editable = [etSize, etTrack, etStroke, etGlow, etMaxWords, etMaxChars, etLineChars, etPosX, etPosY, etAccentY,
            etLineGap, etWordSpace, etPause, etInDur, etOutDur, etDist, etBlur, etEase, etOpacity];
        for (var ei = 0; ei < editable.length; ei++) editable[ei].onChange = function () { markCustom(); };
        var toggles = [cbCaps, cbShadow, cbGlow, cbAccentZone, cbAccentLine, cbAutoAccent, cbPunctBreak, cbStrip];
        for (var ci = 0; ci < toggles.length; ci++) toggles[ci].onClick = function () { markCustom(); };
        ddReveal.onChange = ddBlend.onChange = function () { markCustom(); };

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

        function phraseIndex() { return ddPhrase.selection ? ddPhrase.selection.index : 0; }
        function phraseWords() {
            if (!state.data) return [];
            var words = N.applyEdits(state.data, etText.text, []), out = [], si = phraseIndex();
            for (var i = 0; i < words.length; i++) if (words[i].seg === si) out.push(words[i]);
            return out;
        }
        function seekPhrase() {
            try {
                var comp = activeComp(), words = phraseWords();
                if (!words.length) throw new Error("Выбранная фраза пуста.");
                if (state.link && state.link.compId !== comp.id) throw new Error("Откройте исходную композицию для перехода к фразе.");
                var map = resolveLink(comp), time = N.sourceToComp(words[0].start, map.startTime, map.stretch);
                comp.time = Math.max(0, Math.min(comp.duration - comp.frameDuration, time));
                if (comp.openInViewer) comp.openInViewer();
                setStatus("Фраза " + (phraseIndex() + 1) + " · " + time.toFixed(2) + " с" + (map.note ? " · " + map.note : ""));
            } catch (e) { alert(e.message, "NOIR: переход к фразе"); }
        }
        function navigatePhrase(index) {
            editingWords = true; ddPhrase.selection = index; editingWords = false;
            wordPage = 0; selectedWord = 0; refreshWords(); seekPhrase();
        }
        btnPrevPhrase.onClick = function () { if (state.data && phraseIndex() > 0) navigatePhrase(phraseIndex() - 1); };
        btnNextPhrase.onClick = function () { if (state.data && phraseIndex() + 1 < state.data.segments.length) navigatePhrase(phraseIndex() + 1); };
        btnSeekPhrase.onClick = seekPhrase;
        function refreshWords() {
            var words;
            try { words = phraseWords(); } catch (e) { setStatus(e.message); return; }
            if (wordPage >= words.length) wordPage = 0;
            for (var i = 0; i < wordButtons.length; i++) {
                var w = words[wordPage + i], b = wordButtons[i];
                b.enabled = !!w; b.text = w ? (w.accent ? "★ " : "") + (w.conf !== undefined && w.conf < 0.65 ? "? " : "") + w.text : "—";
                b.helpTip = w ? (w.conf !== undefined && w.conf < 0.65 ? "Низкая уверенность распознавания — проверьте слово. " : "") + "Клик — включить/выключить акцент; затем можно поставить перенос перед этим словом." : "";
            }
            btnPrevPhrase.enabled = !!state.data && phraseIndex() > 0;
            btnNextPhrase.enabled = !!state.data && phraseIndex() + 1 < state.data.segments.length;
            btnSeekPhrase.enabled = btnUpdatePhrase.enabled = !!state.data && words.length > 0;
            btnWordsBack.enabled = wordPage > 0;
            btnWordsNext.enabled = wordPage + 12 < words.length;
        }
        function refreshPhrases() {
            editingWords = true; ddPhrase.removeAll();
            if (state.data) for (var i = 0; i < state.data.segments.length; i++)
                ddPhrase.add("item", String(i + 1) + " · " + N.toEditorText({segments: [state.data.segments[i]]}).substr(0, 42));
            ddPhrase.selection = 0; editingWords = false;
            wordPage = 0; selectedWord = 0; refreshWords();
        }
        function editWord(action, index) {
            try {
                var si = phraseIndex(), lines = etText.text.replace(/\r\n?/g, "\n").split("\n");
                var words = phraseWords();
                if (!words[index]) throw new Error("Сначала выберите слово кнопкой.");
                editHistory.push(etText.text); if (editHistory.length > 30) editHistory.shift();
                selectedWord = index;
                if (action === "accent") words[index].accent = !words[index].accent;
                else if (action === "line") words[index].lineBefore = !words[index].lineBefore;
                else words[index].breakBefore = !words[index].breakBefore;
                lines[si] = N.editorWords(words);
                etText.text = lines.join("\n"); refreshWords();
                setStatus("Изменено слово: " + words[index].text + ". Тайминги сохранены.");
            } catch (e) { alert(e.message, "NOIR Captions"); }
        }
        ddPhrase.onChange = function () { if (!editingWords) { wordPage = 0; selectedWord = 0; refreshWords(); if (options.headless) seekPhrase(); } };
        etText.onChange = etText.onChanging = function () { refreshWords(); setStatus("Проверьте текст и обновите нужные фразы."); };
        for (var bi = 0; bi < wordButtons.length; bi++) wordButtons[bi].onClick = function () { editWord("accent", wordPage + this._slot); };
        btnWordsBack.onClick = function () { wordPage = Math.max(0, wordPage - 12); refreshWords(); };
        btnWordsNext.onClick = function () { wordPage += 12; refreshWords(); };
        btnLineBreak.onClick = function () { editWord("line", selectedWord); };
        btnPhraseBreak.onClick = function () { editWord("phrase", selectedWord); };
        btnEditWord.onClick = function () {
            try {
                var ws = phraseWords(), w = ws[selectedWord];
                if (!w) throw new Error("Выберите слово.");
                var answer = prompt("Исправить слово (тайминг сохранится):", w.text);
                if (answer === null) return;
                answer = String(answer).replace(/^\s+|\s+$/g, "");
                if (!answer || /[\s*~|↵]/.test(answer)) throw new Error("Введите одно слово без разметки. Фразу можно исправить в большом поле текста.");
                editHistory.push(etText.text); if (editHistory.length > 30) editHistory.shift();
                w.text = answer;
                var lines = etText.text.replace(/\r\n?/g, "\n").split("\n");
                lines[phraseIndex()] = N.editorWords(ws); etText.text = lines.join("\n"); refreshWords(); setStatus("Слово исправлено; тайминг сохранён.");
            } catch (e) { alert(e.message, "NOIR Captions"); }
        };
        btnUndoEdit.onClick = function () {
            if (editHistory.length) { etText.text = editHistory.pop(); refreshWords(); setStatus("Правка отменена."); }
            else setStatus("Нет правок кнопками для отмены. В поле текста используйте Ctrl+Z.");
        };
        btnListen.onClick = function () {
            try {
                var ws = phraseWords();
                if (!ws.length) throw new Error("Нет слов для прослушивания.");
                if (!state.data.source || !state.data.source.file) throw new Error("В JSON нет пути к аудио. Распознайте исходный слой ещё раз.");
                N.previewAudio(root, S.python, state.data.source.file, ws[0].start, ws[ws.length - 1].end);
                setStatus("Фраза готовится к воспроизведению во внешнем проигрывателе.");
            } catch (e) { alert(e.message, "NOIR Captions"); }
        };
        function saveQuick() {
            S.quick = {size: num(etQuickSize.text, 100, 25, 200),
                position: ["preset", "25", "50", "75"][ddQuickPosition.selection ? ddQuickPosition.selection.index : 0],
                intensity: ["1", "0.5", "1.5"][ddIntensity.selection ? ddIntensity.selection.index : 0]};
            saveSettings(S);
        }
        etQuickSize.onChange = ddQuickPosition.onChange = ddIntensity.onChange = saveQuick;
        function renderStyle() {
            saveQuick();
            var st = clone(S.style), factor = num(etQuickSize.text, 100, 25, 200) / 100;
            st.base.size *= factor; st.accent.size *= factor;
            var position = idOf(ddQuickPosition, [{id:"preset"},{id:"25"},{id:"50"},{id:"75"}]);
            if (position !== "preset") st.layout.posY = Number(position);
            var strength = ddIntensity.selection ? [1, 0.5, 1.5][ddIntensity.selection.index] : 1;
            st.anim.intensity = (st.anim.intensity === undefined ? 1 : st.anim.intensity) * strength;
            return st;
        }

        function setData(data, link) {
            state.dataRevision++;
            editHistory = [];
            state.cleanLines = N.toEditorText(data).split("\n");
            state.data = data;
            state.link = link;
            etText.text = N.toEditorText(data);
            refreshPhrases();
            if (tabs.select) tabs.select(1);
            var n = 0;
            for (var i = 0; i < data.segments.length; i++) n += data.segments[i].words.length;
            var warn = "";
            for (var w = 0; w < (data.warnings || []).length; w++)
                if (data.warnings[w].code === "gpu_failed") warn = "\nGPU не сработала — распознано на CPU.";
            var eng = data.engine ? data.engine.model + " / " + data.engine.device : "";
            setStatus("Слов — " + n + ", язык " + data.language + (eng ? ", " + eng : "") + "." + warn +
                (n ? "\nПроверьте текст на вкладке «Текст»." : "\nРечь не найдена."), 1);
        }

        btnRecognize.onClick = function () {
            readUI();
            var src;
            try { src = N.getAudioSource(); } catch (e) { alert(e.message, "NOIR Captions"); return; }
            if (!N.modelCached(S.model)) {
                var m = N.MODELS[ddModel.selection.index];
                alert("Модель " + m.id + " не скачана (или скачана не до конца).\n\n" +
                    "Скачайте её один раз в PowerShell — там виден прогресс, а After Effects не зависает:\n\n" +
                    "cd \"" + root + "\"\n" +
                    ".venv\\Scripts\\python.exe recognition\\download_model.py " + m.id + "\n\n" +
                    "Потом нажмите «Распознать речь» ещё раз. Скачивается только модель с Hugging Face, " +
                    "ваше аудио никуда не отправляется.", "NOIR Captions");
                return;
            }
            try {
                N.startRecognition(src, {
                    root: root, python: S.python, model: S.model, language: S.language,
                    device: S.device, prompt: S.prompt
                }, {
                    onStatus: function (st) {
                        var msg = st.message || st.state;
                        if (st.device) msg += " · " + (st.device === "cuda" ? "GPU" : "CPU");
                        state.recognizing = true; setStatus(msg, st.progress);
                    },
                    onDone: function (data, s) {
                        state.recognizing = false;
                        btnRecognize.enabled = true;
                        btnCancel.enabled = false;
                        setData(data, s.link);
                    },
                    onError: function (msg) {
                        state.recognizing = false;
                        btnRecognize.enabled = true;
                        btnCancel.enabled = false;
                        setStatus("Ошибка", 0);
                        alert(msg, "NOIR Captions — ошибка распознавания");
                    }
                });
                state.recognizing = true;
                btnRecognize.enabled = false;
                btnCancel.enabled = true;
                progress.value = 0;
            } catch (e2) {
                alert(e2.message, "NOIR Captions");
            }
        };

        btnCancel.onClick = function () {
            N.cancelRecognition(); state.recognizing = false;
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
                    text: words[i].text, start: words[i].start, end: words[i].end, conf: words[i].conf,
                    accent: words[i].accent || undefined, invert: words[i].invert || undefined,
                    lineBefore: words[i].lineBefore || undefined, breakBefore: words[i].breakBefore || undefined
                });
                out.noirSourceKey = N.sourceKey(state.data, state.link);
                out.link = state.link;
                N.writeText(f, N.stringify(out));
                setStatus("Сохранено: " + f.fsName);
            } catch (e) { alert(e.message, "NOIR Captions"); }
        };

        btnReset.onClick = function () { if (state.data) { etText.text = N.toEditorText(state.data); refreshWords(); } };

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
            if (L.layerId) try { layer = comp.layerByID ? comp.layerByID(L.layerId) : null; } catch (eId) { layer = null; }
            if (!layer && L.layerIndex <= comp.numLayers && comp.layer(L.layerIndex).name === L.layerName)
                layer = comp.layer(L.layerIndex);
            for (var i = 1; !layer && i <= comp.numLayers; i++)
                if (comp.layer(i).name === L.layerName) layer = comp.layer(i);
            if (!layer) return { startTime: L.startTime, stretch: L.stretch,
                note: "Аудиослой «" + L.layerName + "» не найден — использовано сохранённое время." };
            return { startTime: layer.startTime, stretch: layer.stretch, note: "" };
        }

        // Выделенные текстовые слои активной композиции (или понятная ошибка).
        function selectedTextLayers() {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) throw new Error("Откройте композицию.");
            var sel = comp.selectedLayers, out = [];
            for (var i = 0; i < sel.length; i++) if (sel[i] instanceof TextLayer) out.push(sel[i]);
            if (!out.length) throw new Error("Выделите в таймлайне один или несколько текстовых слоёв.");
            return { comp: comp, layers: out };
        }
        // which: "base" | "accent" (чьи настройки брать).
        // look: true — весь вид + КАПС; объект {font,size,color,stroke,fx} — только отмеченное; false — не менять вид.
        // anim: применять анимацию.
        function applyToLayers(which, look, anim, undoName, allNoir) {
            readUI();
            var sel;
            try {
                if (allNoir) {
                    var fc = activeComp(), fl = [];
                    for (var fi = 1; fi <= fc.numLayers; fi++) if (fc.layer(fi) instanceof TextLayer && N.isGenerated(fc.layer(fi))) fl.push(fc.layer(fi));
                    if (!fl.length) throw new Error("В композиции нет субтитров NOIR.");
                    sel = {comp: fc, layers: fl};
                } else sel = selectedTextLayers();
            } catch (e) { alert(e.message, "NOIR Captions"); return; }
            app.beginUndoGroup(undoName);
            try {
                var res = N.restyleLayers(sel.comp, sel.layers, {
                    style: look ? S.style[which] : null, parts: (look && look !== true) ? look : null,
                    accent: which === "accent",
                    safeWidth: S.style.layout.safeWidth, anim: anim ? S.style.anim : null
                });
                var rf = "";
                if (S.reflow && look && (look === true || !look.font || look.size) && N.reflowGroups) {
                    var rr = N.reflowGroups(sel.comp, sel.layers, S.style.layout);
                    if (rr.groups) rf = ", фраз переложено: " + rr.groups;
                }
                setStatus("Изменено слоёв: " + res.changed + rf + (res.warnings.length ? "\n" + res.warnings.join("\n") : ""));
            } catch (e2) {
                alert("Ошибка: " + e2.toString() + (e2.line ? " (строка " + e2.line + ")" : ""), "NOIR Captions");
            } finally {
                app.endUndoGroup();
            }
        }
        function refreshChips() {
            var A = S.style.anim, i;
            for (i = 0; i < chipsIn.length; i++) { if (TH && !options.headless) TH.setChip(chipsIn[i], chipsIn[i]._id === A.animIn); }
            for (i = 0; i < chipsOut.length; i++) { if (TH && !options.headless) TH.setChip(chipsOut[i], chipsOut[i]._id === A.animOut); }
            syncFinishAnim();
            stAnimCur.text = "Вход: " + N.findAnim(N.ANIM_IN, A.animIn).abbr + "   ·   Выход: " +
                N.findAnim(N.ANIM_OUT, A.animOut).abbr;
        }
        function hasSelectedText() { try { selectedTextLayers(); return true; } catch (e) { return false; } }
        // Выбор вылета: запоминаем для новых субтитров и, если выделены текстовые слои, сразу применяем к ним.
        function pickAnim(which, id) {
            if (which === "in") { S.style.anim.animIn = id; delete S.style.anim.accentIn; } else { S.style.anim.animOut = id; delete S.style.anim.accentOut; }   // выбранная вручную анимация — для всех слов
            markCustom();
            refreshChips();
            saveSettings(S);
            if (hasSelectedText()) applyToLayers("base", false, true, "NOIR Captions: вылет выделенным слоям");
            else setStatus((which === "in" ? "Вход" : "Выход") + " выбран для новых субтитров. Выделите слои — применится к ним.");
        }
        rbAnimIn.onClick = function () { galIn._cepVisible = galIn.visible = true; galOut._cepVisible = galOut.visible = false; };
        rbAnimOut.onClick = function () { galIn._cepVisible = galIn.visible = false; galOut._cepVisible = galOut.visible = true; };
        btnAnimApply.onClick = function () { applyToLayers("base", false, true, "NOIR Captions: анимация выделенным слоям"); };
        // Слой, к которому применима инверсия: текст, фигура, SVG/картинка/видео, солид (не камера, свет, пустышка, аудио).
        function isGraphicLayer(l) {
            var mn = "";
            try { mn = l.matchName ? String(l.matchName) : ""; } catch (e0) {}
            if (mn === "ADBE Text Layer" || mn === "ADBE Vector Layer" || mn === "ADBE AV Layer") {
                try { if (l.source && l.source.hasVideo === false) return false; } catch (e1) {}
                return true;
            }
            if (mn) return false;
            return l instanceof AVLayer;
        }
        btnInvert.onClick = function () {
            var sel;
            try {
                var ic = app.project.activeItem;
                if (!(ic instanceof CompItem)) throw new Error("Откройте композицию.");
                var il = [];
                for (var ii = 0; ii < ic.selectedLayers.length; ii++) {
                    var cand = ic.selectedLayers[ii];
                    if (isGraphicLayer(cand)) il.push(cand);
                }
                if (!il.length) throw new Error("Выделите в таймлайне текстовые слои, SVG, картинки или фигуры.");
                sel = { comp: ic, layers: il };
            } catch (e) { alert(e.message, "NOIR Captions"); return; }
            app.beginUndoGroup("NOIR Captions: инверсия");
            try {
                var on = N.toggleInvert(sel.layers);
                setStatus((on ? "Инверсия включена" : "Инверсия выключена") + ": слоёв " + sel.layers.length);
            } catch (e2) {
                alert("Ошибка: " + e2.toString() + (e2.line ? " (строка " + e2.line + ")" : ""), "NOIR Captions");
            } finally {
                app.endUndoGroup();
            }
        };

        btnReflow.onClick = function () {
            readUI();
            var sel;
            try { sel = selectedTextLayers(); } catch (e) { alert(e.message, "NOIR Captions"); return; }
            app.beginUndoGroup("NOIR Captions: перекласть фразу");
            try {
                var rr = N.reflowGroups(sel.comp, sel.layers, S.style.layout);
                setStatus(rr.groups ? "Переложено фраз: " + rr.groups + ", слов: " + rr.moved + (rr.skipped ? "; пропущено чужих слоёв: " + rr.skipped : "")
                    : "Нет слоёв NOIR с известной фразой — перекладывать нечего (слои созданы старой версией или не панелью).");
            } catch (e2) {
                alert("Ошибка: " + e2.toString() + (e2.line ? " (строка " + e2.line + ")" : ""), "NOIR Captions");
            } finally {
                app.endUndoGroup();
            }
        };
        btnMakeAccent.onClick = function () { applyToLayers("accent", true, false, "NOIR Captions: сделать акцентом"); };
        btnMakeBase.onClick = function () { applyToLayers("base", true, false, "NOIR Captions: сделать обычным"); };
        btnApply.onClick = function () {
            var parts = { font: cbApplyFont.value, size: cbApplySize.value, color: cbApplyColor.value,
                stroke: cbApplyStroke.value, fx: cbApplyFx.value, blend: cbApplyBlend.value };
            var any = parts.font || parts.size || parts.color || parts.stroke || parts.fx || parts.blend;
            if (!any && !cbApplyAnim.value) { alert("Отметьте, что применять: шрифт, размер, цвет, обводку, эффекты и/или анимацию.", "NOIR Captions"); return; }
            applyToLayers(rbApplyAccent.value ? "accent" : "base", any ? parts : false, cbApplyAnim.value,
                "NOIR Captions: применить к выделенным");
        };
        btnFontToLayers.onClick = function () {
            applyToLayers(state.target, { font: true }, false, "NOIR Captions: шрифт выделенным слоям");
        };

        btnFontAll.onClick = function () {
            applyToLayers(state.target, {font: true}, false, "NOIR Captions: шрифт всем субтитрам", true);
        };

        // ----- 4 · Правка -----
        function finishLayers() {
            var comp = activeComp(), id = idOf(ddFinScope, FIN_SCOPES), out = [], i;
            if (id === "selected") {
                var sel = comp.selectedLayers;
                for (i = 0; i < sel.length; i++) if (sel[i] instanceof TextLayer) out.push(sel[i]);
                if (!out.length) throw new Error("Выделите в таймлайне текстовые слои или выберите «Субтитры этого видео».");
                return { comp: comp, layers: out };
            }
            var key = null;
            if (id === "source") {
                if (!state.data) throw new Error("Панель не знает, какое это видео: распознайте речь или загрузите текст. Либо выберите «Выделенные слои».");
                key = N.sourceKey(state.data, state.link);
            }
            for (i = 1; i <= comp.numLayers; i++) {
                var l = comp.layer(i);
                if (l instanceof TextLayer && N.isGenerated(l) && (!key || N.layerSource(l) === key)) out.push(l);
            }
            if (!out.length) throw new Error(key ? "В этой композиции нет субтитров этого видео." : "В композиции нет субтитров NOIR.");
            return { comp: comp, layers: out };
        }
        function finishAction(undoName, fn) {
            readUI();
            var sel;
            try { sel = finishLayers(); } catch (e) { alert(e.message, "NOIR Captions"); return; }
            app.beginUndoGroup(undoName);
            try { setStatus(fn(sel)); }
            catch (e2) { alert("Ошибка: " + e2.toString() + (e2.line ? " (строка " + e2.line + ")" : ""), "NOIR Captions"); }
            finally { app.endUndoGroup(); }
        }
        function finishPlace(yPct) {
            finishAction("NOIR Captions: положение субтитров", function (sel) {
                var r = N.moveBlocksTo(sel.comp, sel.layers, null, yPct);
                return "Фраз перемещено: " + r.phrases;
            });
        }
        btnFinTop.onClick = function () { finishPlace(25); };
        btnFinMid.onClick = function () { finishPlace(50); };
        btnFinBottom.onClick = function () { finishPlace(75); };
        function finishNudge(kx, ky) {
            var step = num(etFinStep.text, 20, 1, 2000);
            finishAction("NOIR Captions: сдвиг субтитров", function (sel) {
                var r = N.nudgeBlocks(sel.comp, sel.layers, kx * step, ky * step);
                return "Сдвинуто фраз: " + r.phrases + " на " + step + " px";
            });
        }
        btnFinUp.onClick = function () { finishNudge(0, -1); };
        btnFinDown.onClick = function () { finishNudge(0, 1); };
        btnFinLeft.onClick = function () { finishNudge(-1, 0); };
        btnFinRight.onClick = function () { finishNudge(1, 0); };
        function finishSize(sign) {
            var pct = num(etFinSizeStep.text, 10, 1, 100);
            var factor = sign > 0 ? 1 + pct / 100 : 1 / (1 + pct / 100);
            finishAction("NOIR Captions: размер текста", function (sel) {
                var r = N.scaleFont(sel.comp, sel.layers, factor, S.style.layout);
                return "Размер " + (sign > 0 ? "увеличен" : "уменьшен") + ": слоёв " + r.changed + (r.phrases ? ", фраз переложено: " + r.phrases : "");
            });
        }
        // Единая точка входа для радиального меню и ассистента: одна команда = одно действие над субтитрами.
        function runCommand(cmd) {
            var id;
            if (cmd.op === "place") finishPlace(Number(cmd.y));
            else if (cmd.op === "nudge") {
                var px = Number(cmd.px) || num(etFinStep.text, 20, 1, 2000);
                finishAction("NOIR Captions: сдвиг субтитров", function (sel) {
                    var r = N.nudgeBlocks(sel.comp, sel.layers, (Number(cmd.kx) || 0) * px, (Number(cmd.ky) || 0) * px);
                    return "Сдвинуто фраз: " + r.phrases + " на " + px + " px";
                });
            }
            else if (cmd.op === "size") {
                var pct = Number(cmd.pct) || num(etFinSizeStep.text, 10, 1, 100);
                var factor = cmd.sign > 0 ? 1 + pct / 100 : 1 / (1 + pct / 100);
                finishAction("NOIR Captions: размер текста", function (sel) {
                    var r = N.scaleFont(sel.comp, sel.layers, factor, S.style.layout);
                    return "Размер " + (cmd.sign > 0 ? "увеличен" : "уменьшен") + " на " + pct + "%: слоёв " + r.changed;
                });
            }
            else if (cmd.op === "animIn" || cmd.op === "animOut") {
                id = String(cmd.id);
                var list = cmd.op === "animIn" ? N.ANIM_IN : N.ANIM_OUT, found = false, k;
                for (k = 0; k < list.length; k++) if (list[k].id === id) found = true;
                if (!found) throw new Error("Нет такой анимации: " + id);
                if (cmd.op === "animIn") S.style.anim.animIn = id; else S.style.anim.animOut = id;
                markCustom(); refreshChips(); saveSettings(S);
                btnFinAnim.onClick();
            }
            else if (cmd.op === "time") {
                // frames: значения в кадрах композиции; иначе секунды. Без числа берётся шаг из панели.
                finishAction("NOIR Captions: время субтитров", function (sel) {
                    var unit = cmd.frames ? sel.comp.frameDuration : 1, amount = Number(cmd.amount), step = (isFinite(amount) && amount > 0 ? amount : (cmd.frames ? Math.max(1, Math.round(num(etFinTimeStep.text, 0.1, 0.01, 30) / sel.comp.frameDuration)) : num(etFinTimeStep.text, 0.1, 0.01, 30))) * unit;
                    var spec = { shift: (Number(cmd.shift) || 0) * step, dIn: (Number(cmd.dIn) || 0) * step, dOut: (Number(cmd.dOut) || 0) * step };
                    var r = N.retimeLayers(sel.comp, sel.layers, spec);
                    return "Время изменено у слоёв: " + r.changed + " (шаг " + (Math.round(step * 100) / 100) + " с)";
                });
            }
            else if (cmd.op === "scale") {
                var factor = Number(cmd.factor);
                if (!isFinite(factor) || factor < 0.3 || factor > 3) throw new Error("Недопустимый множитель размера.");
                finishAction("NOIR Captions: размер текста", function (sel) {
                    var r = N.scaleFont(sel.comp, sel.layers, factor, S.style.layout);
                    return "Размер ×" + (Math.round(factor * 100) / 100) + ": слоёв " + r.changed;
                });
            }
            else if (cmd.op === "placeZones") {
                finishAction("NOIR Captions: положение слов и акцентов", function (sel) {
                    var r = N.placeZones(sel.comp, sel.layers, Number(cmd.baseY), Number(cmd.accentY));
                    return "Фраз переставлено: " + r.phrases + " (слова на " + cmd.baseY + "%, акценты на " + cmd.accentY + "%)";
                });
            }
            else if (cmd.op === "preset") {
                var chosen = presetById(String(cmd.id));
                if (!chosen) throw new Error("Нет стиля «" + cmd.id + "».");
                choosePreset(chosen); setStatus("Стиль выбран: " + chosen.name + ". «Применить текущий стиль» применит его к готовым субтитрам.");
            }
            else if (cmd.op === "faceScan" || cmd.op === "avoidFace") startFaceScan(cmd.op === "avoidFace");
            else if (cmd.op === "resetPos") btnFinReset.onClick();
            else if (cmd.op === "applyStyle") btnFinStyle.onClick();
            else if (cmd.op === "behind") finishBehind();
            else if (cmd.op === "delete") finishDelete(!!cmd.confirmed);
            else if (cmd.op === "scope") {
                var sc = String(cmd.id), sidx = -1, q;
                for (q = 0; q < FIN_SCOPES.length; q++) if (FIN_SCOPES[q].id === sc) sidx = q;
                if (sidx < 0) throw new Error("Нет такой области: " + sc);
                ddFinScope.selection = sidx; setStatus("Область: " + FIN_SCOPES[sidx].label);
            }
            else throw new Error("Неизвестная команда: " + cmd.op);
            return lastStatus;
        }
        // Лицо: один кадр исходного видео уходит в Python (OpenCV) — рамка лица в долях кадра. avoid=true: сразу расставить субтитры.
        function startFaceScan(avoid) {
            readUI();
            if (state.scanning) throw new Error("Поиск лица уже идёт.");
            var comp = activeComp();
            if (!state.data || !state.data.source || !state.data.source.file) throw new Error("Нужен распознанный или загруженный текст с путём к видео. Распознайте слой ещё раз.");
            var map = resolveLink(comp), srcTime = Math.max(0, N.compToSource(comp.time, map.startTime, map.stretch));
            state.scanning = true; setStatus("Ищу лицо на кадре…");
            N.faceScan(root, S.python, state.data.source.file, srcTime, {
                onDone: function (res) {
                    state.scanning = false;
                    if (!res.found) { setStatus("Лицо на этом кадре не найдено (время " + (Math.round(srcTime * 10) / 10) + " с). Передвиньте индикатор времени на кадр, где лицо видно, и повторите."); return; }
                    state.face = res.box; state.faceTime = srcTime;
                    var note = "Лицо найдено: центр " + Math.round((res.box.x + res.box.w / 2) * 100) + "% по ширине, " + Math.round((res.box.y + res.box.h / 2) * 100) + "% по высоте.";
                    if (!avoid) { setStatus(note); return; }
                    var sel;
                    try { sel = finishLayers(); } catch (e) { setStatus(note + " " + e.message); return; }
                    app.beginUndoGroup("NOIR Captions: субтитры мимо лица");
                    try {
                        var r = N.avoidFace(sel.comp, sel.layers, res.box, S.style.layout);
                        setStatus(note + " Фраз переставлено: " + r.moved + (r.top ? ", выше лица: " + r.top : "") + (r.bottom ? ", ниже лица: " + r.bottom : "") + (r.shrunk ? ", уменьшено: " + r.shrunk : "") + ". Положение лица оценено по одному кадру.");
                    } catch (e2) { setStatus("Ошибка расстановки: " + e2.toString()); }
                    finally { app.endUndoGroup(); }
                },
                onError: function (text) { state.scanning = false; setStatus(text); }
            });
            return "Ищу лицо…";
        }
        btnFinEarlier.onClick = function () { runCommand({ op: "time", shift: -1 }); };
        btnFinLater.onClick = function () { runCommand({ op: "time", shift: 1 }); };
        btnFinStartEarlier.onClick = function () { runCommand({ op: "time", dIn: -1 }); };
        btnFinStartLater.onClick = function () { runCommand({ op: "time", dIn: 1 }); };
        btnFinEndEarlier.onClick = function () { runCommand({ op: "time", dOut: -1 }); };
        btnFinEndLater.onClick = function () { runCommand({ op: "time", dOut: 1 }); };
        btnFinSmaller.onClick = function () { finishSize(-1); };
        btnFinBigger.onClick = function () { finishSize(1); };
        btnFinReset.onClick = function () {
            finishAction("NOIR Captions: исходные места", function (sel) {
                return "Возвращено на исходные места слоёв: " + N.resetPositions(sel.layers);
            });
        };
        var finSyncing = false;
        function syncFinishAnim() {
            finSyncing = true;
            try {
                selectId(ddFinIn, N.ANIM_IN, S.style.anim.animIn);
                selectId(ddFinOut, N.ANIM_OUT, S.style.anim.animOut);
            } finally { finSyncing = false; }
        }
        ddFinIn.onChange = ddFinOut.onChange = function () {
            if (finSyncing) return;
            S.style.anim.animIn = idOf(ddFinIn, N.ANIM_IN);
            S.style.anim.animOut = idOf(ddFinOut, N.ANIM_OUT);
            markCustom(); refreshChips(); saveSettings(S);
        };
        btnFinAnim.onClick = function () {
            finishAction("NOIR Captions: анимация субтитров", function (sel) {
                var r = N.restyleLayers(sel.comp, sel.layers, { style: null, safeWidth: S.style.layout.safeWidth, anim: S.style.anim });
                return "Анимация применена к слоям: " + r.changed + " (" + N.findAnim(N.ANIM_IN, S.style.anim.animIn).abbr +
                    " / " + N.findAnim(N.ANIM_OUT, S.style.anim.animOut).abbr + ")";
            });
        };
        btnFinStyle.onClick = function () {
            finishAction("NOIR Captions: стиль субтитров", function (sel) {
                var acc = [], base = [], warnings = [], i;
                for (i = 0; i < sel.layers.length; i++) (sel.layers[i].label === 11 ? acc : base).push(sel.layers[i]);
                if (base.length) warnings = warnings.concat(N.restyleLayers(sel.comp, base, { style: S.style.base, accent: false, safeWidth: S.style.layout.safeWidth, anim: null }).warnings);
                if (acc.length) warnings = warnings.concat(N.restyleLayers(sel.comp, acc, { style: S.style.accent, accent: true, safeWidth: S.style.layout.safeWidth, anim: null }).warnings);
                var rf = S.reflow ? N.reflowGroups(sel.comp, sel.layers, S.style.layout) : { groups: 0 };
                return "Стиль применён к слоям: " + sel.layers.length + (rf.groups ? ", фраз переложено: " + rf.groups : "") +
                    (warnings.length ? "\n" + warnings.join("\n") : "");
            });
        };
        function finishDelete(confirmed) {
            var sel;
            readUI();
            try { sel = finishLayers(); } catch (e) { alert(e.message, "NOIR Captions"); return; }
            if (!confirmed && !confirm("Удалить субтитры: " + sel.layers.length + " слоёв? Отмена — Ctrl+Z.", true, "NOIR Captions")) return;
            app.beginUndoGroup("NOIR Captions: удалить субтитры");
            try {
                for (var i = 0; i < sel.layers.length; i++) { if (sel.layers[i].locked) sel.layers[i].locked = false; sel.layers[i].remove(); }
                setStatus("Удалено слоёв: " + sel.layers.length);
            } finally { app.endUndoGroup(); }
        }
        // «За человеком»: слои NOIR (этого видео) ставятся сразу под выделенный слой — копию видео с вырезанным человеком.
        function finishBehind() {
            readUI();
            var comp, over = null, list = [], i;
            try {
                comp = activeComp();
                var sel = comp.selectedLayers;
                for (i = 0; i < sel.length; i++) if (!N.isGenerated(sel[i])) { over = sel[i]; break; }
                if (!over) throw new Error("Выделите слой, под которым должны оказаться субтитры (например, копию видео с вырезанным человеком).");
                var key = state.data ? N.sourceKey(state.data, state.link) : null;
                for (i = 1; i <= comp.numLayers; i++) {
                    var l = comp.layer(i);
                    if (l instanceof TextLayer && N.isGenerated(l) && (!key || N.layerSource(l) === key)) list.push(l);
                }
                if (!list.length) throw new Error("В композиции нет субтитров NOIR" + (key ? " этого видео." : "."));
            } catch (e) { alert(e.message, "NOIR Captions"); return; }
            app.beginUndoGroup("NOIR Captions: субтитры под слой");
            try {
                var r = N.placeBehind(comp, list, over);
                setStatus("Субтитры под слоем «" + over.name + "»: " + r.moved);
            } catch (e2) { alert("Ошибка: " + e2.toString(), "NOIR Captions"); }
            finally { app.endUndoGroup(); }
        }
        btnFinBehind.onClick = finishBehind;
        btnFinDelete.onClick = function () { finishDelete(false); };

        // ----- SFX -----
        function sfxChoice(id) {
            if (id === "auto" || id === "off" || id === "same") return { mode: id };
            if (id.indexOf("cat:") === 0) return { mode: "cat", value: id.substring(4) };
            return { mode: "off" };
        }
        function sfxConfig() {
            return { appear: sfxChoice(S.sfx.appear), accent: sfxChoice(S.sfx.accent), exit: sfxChoice(S.sfx.exit),
                db: S.sfx.db, dbRand: S.sfx.dbRand, minGap: S.sfx.minGap };
        }
        function sfxAction(undoName, fn) {
            app.beginUndoGroup(undoName);
            try { fn(); }
            catch (e) { alert(e.message || e.toString(), "NOIR Captions"); }
            finally { app.endUndoGroup(); }
        }
        btnSfxSelected.onClick = function () {
            if (!SFX) return;
            var sel;
            readUI();
            try { sel = selectedTextLayers(); } catch (e) { alert(e.message, "NOIR Captions"); return; }
            sfxAction("NOIR Captions: озвучить выделенные", function () {
                sfxLib = loadLib();
                var plan = N.planSfx(N.sfxEventsFromLayers(sel.layers, S.style.anim), sfxLib, sfxConfig());
                var r = N.placeSfx(sel.comp, plan);
                setStatus("Звуков добавлено: " + r.placed + (r.warnings.length ? "\n" + r.warnings.join("\n") : "") +
                    (sfxLib.names.length ? "" : "\nБиблиотека SFX пуста."));
            });
        };
        btnSfxRemove.onClick = function () {
            if (!SFX) return;
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) { alert("Откройте композицию.", "NOIR Captions"); return; }
            sfxAction("NOIR Captions: убрать SFX", function () { setStatus("Убрано звуков: " + N.removeSfx(comp)); });
        };
        btnSfxHere.onClick = function () {
            if (!SFX) return;
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) { alert("Откройте композицию.", "NOIR Captions"); return; }
            readUI();
            if (!S.sfx.file) { alert("В списке «Звук» нет звуков. Положите файлы в папку SFX и нажмите «Обновить список».", "NOIR Captions"); return; }
            sfxAction("NOIR Captions: звук в текущее время", function () {
                var r = N.placeSfx(comp, [{ t: comp.time, file: S.sfx.file, cat: "manual", db: S.sfx.db }]);
                setStatus(r.placed ? "Звук добавлен в " + comp.time.toFixed(2) + " с" : r.warnings.join("\n"));
            });
        };
        btnSfxRescan.onClick = function () {
            readUI();
            sfxLib = loadLib();
            refillSfx();
        };
        btnSfxFolder.onClick = function () {
            var f = Folder(Folder.userData.fsName + "/NOIR Captions/sfx");
            if (!f.exists) f.create();
            f.execute();
            setStatus("Положите звуки в подпапки (например whoosh, pop, hit) и нажмите «Обновить список».");
        };

        // ----- Функции -----
        rbToolCounter.onClick = function () { pgCounter._cepVisible = pgCounter.visible = true; pgStrike._cepVisible = pgStrike.visible = false; pgMask._cepVisible = pgMask.visible = false; };
        rbToolStrike.onClick = function () { pgCounter._cepVisible = pgCounter.visible = false; pgStrike._cepVisible = pgStrike.visible = true; pgMask._cepVisible = pgMask.visible = false; };
        rbToolMask.onClick = function () { pgCounter._cepVisible = pgCounter.visible = false; pgStrike._cepVisible = pgStrike.visible = false; pgMask._cepVisible = pgMask.visible = true; };
        btnStrikeColor.onClick = function () {
            var c = $.colorPicker(rgbToHex(S.tools.strike.color));
            if (c < 0) return;
            S.tools.strike.color = hexToRgb(c);
            paintSwatch(swatchStrike, S.tools.strike.color);
            saveSettings(S);
        };
        function activeComp() {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) throw new Error("Откройте композицию.");
            return comp;
        }
        function toolAction(undoName, fn) {
            readUI();
            if (!TOOLS) { alert("Модуль функций не загружен (нет файла ae/noir/tools.jsx).", "NOIR Captions"); return; }
            app.beginUndoGroup(undoName);
            try { fn(); }
            catch (e) { alert(e.message || e.toString(), "NOIR Captions"); }
            finally { app.endUndoGroup(); }
        }
        btnCounter.onClick = function () {
            toolAction("NOIR Captions: счётчик", function () {
                var comp = activeComp(), o = {}, k;
                for (k in S.tools.counter) o[k] = S.tools.counter[k];
                o.start = comp.time;
                var r = N.createCounter(comp, o, S.style, S.style.anim), msg = "Счётчик создан: " + r.start.toFixed(2) + "…" + r.end.toFixed(2) + " с";
                if (S.tools.counter.sound) {
                    if (!SFX) msg += "\nЗвук не добавлен: нет модуля SFX.";
                    else {
                        var pick = N.pickSfx(loadLib(), { mode: "cat", value: "counter" }, "", "in", {});
                        if (pick && pick.cat === "counter") {
                            var sr = N.placeSfx(comp, [{ t: r.start, file: pick.file, cat: "counter", db: S.sfx.db }]);
                            msg += sr.placed ? "\nЗвук счётчика добавлен." : "\n" + sr.warnings.join("\n");
                        } else msg += "\nЗвук не добавлен: в библиотеке SFX нет категории «counter».";
                    }
                }
                setStatus(msg + (r.warnings.length ? "\n" + r.warnings.join("\n") : ""));
            });
        };
        btnStrike.onClick = function () {
            toolAction("NOIR Captions: зачёркивание", function () {
                var sel = selectedTextLayers();
                var r = N.strikeLayers(sel.comp, sel.layers, S.tools.strike, S.style.anim);
                setStatus("Зачёркнуто слоёв: " + r.made.length + (r.skipped ? ", пропущено пустых: " + r.skipped : ""));
            });
        };
        btnStrikeRemove.onClick = function () {
            toolAction("NOIR Captions: убрать зачёркивания", function () { setStatus("Убрано зачёркиваний: " + N.removeByTag(activeComp(), N.STRIKE_TAG)); });
        };
        btnMask.onClick = function () {
            toolAction("NOIR Captions: маска по тексту", function () {
                var comp = activeComp(), sel = comp.selectedLayers, texts = [], source = null, i;
                for (i = 0; i < sel.length; i++) {
                    if (sel[i] instanceof TextLayer) texts.push(sel[i]);
                    else if (!source) source = sel[i];
                }
                if (!texts.length) throw new Error("Выделите в таймлайне текстовые слои (и для режима «видео внутри букв» ещё один видео/фото слой).");
                var o = {};
                for (var k in S.tools.mask) o[k] = S.tools.mask[k];
                o.color = S.style.base.color;
                var r = N.maskTextLayers(comp, texts, source, o);
                setStatus("Масок создано: " + r.made.length + (r.warnings.length ? "\n" + r.warnings.join("\n") : ""));
            });
        };
        btnMaskRemove.onClick = function () {
            toolAction("NOIR Captions: убрать маски", function () { setStatus("Убрано масок: " + N.removeMasks(activeComp())); });
        };

        var cepIssues = [], pendingCheck = null, generationSerial = 0;
        function generateCaptions(preview, phraseOnly, checkOnly, acceptIssues) {
            readUI();
            if (!state.data) { alert("Сначала распознайте речь или откройте JSON.", "NOIR Captions"); return; }
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) { alert("Откройте композицию.", "NOIR Captions"); return; }
            var warnings = [], words;
            try { words = N.applyEdits(state.data, etText.text, warnings); }
            catch (e) { alert(e.message, "NOIR Captions"); return; }

            var outputStyle = renderStyle();
            if (preview || phraseOnly) {
                var subset = [], si = phraseIndex();
                for (var pw = 0; pw < words.length; pw++) if (words[pw].seg === si) subset.push(words[pw]);
                words = subset;
                if (!words.length) { alert("Выберите непустую фразу.", "NOIR Captions"); return; }
            }
            var L = outputStyle.layout;
            var groups = N.groupWords(words, {
                maxWords: L.maxWords, maxChars: L.maxChars, pauseBreak: L.pauseBreak,
                punctBreak: L.punctBreak, stripPunct: L.stripPunct
            });
            if (L.autoAccent) N.autoAccent(groups);
            N.timeGroups(groups, L.holdGap, 0.08);
            var map = resolveLink(comp);
            if (map.note) warnings.push(map.note);
            for (var i = 0; i < groups.length; i++) {
                var g = groups[i];
                g.sourceKey = N.sourceKey(state.data, state.link);
                g.compStart = N.sourceToComp(g.start, map.startTime, map.stretch);
                g.compOut = N.sourceToComp(g.outTime, map.startTime, map.stretch);
                for (var j = 0; j < g.words.length; j++)
                    g.words[j].compStart = N.sourceToComp(g.words[j].start, map.startTime, map.stretch);
            }

            var issues = N.checkCaptions(groups, outputStyle, comp), messages = [], codes = {};
            for (var ci = 0; ci < issues.length; ci++) {
                var issue = issues[ci], key = issue.code + ":" + (issue.segment === undefined ? issue.message : issue.segment);
                if (!codes[key]) { codes[key] = true; messages.push(issue.message); }
            }
            if (options.headless && !preview && !checkOnly) {
                var signature = N.stringify({words:words,style:outputStyle,comp:comp.id,width:comp.width,height:comp.height,duration:comp.duration,phrase:!!phraseOnly,issues:issues,replace:S.replace});
                if (issues.length && !(acceptIssues && pendingCheck && pendingCheck.signature === signature)) {
                    cepIssues = issues;
                    pendingCheck = {signature:signature,phrase:!!phraseOnly};
                    setStatus("Проверьте замечания перед созданием.");
                    return;
                }
                cepIssues = []; pendingCheck = null;
            }
            if (checkOnly) { alert(messages.length ? "Проверка перед созданием:\n\n" + messages.join("\n") : "Проблем по предварительной проверке не найдено. Геометрию и анимацию проверьте в превью.", "NOIR: проверка"); return; }
            if (!options.headless && !preview && messages.length && !confirm("Перед созданием:\n\n" + messages.slice(0, 10).join("\n") +
                (messages.length > 10 ? "\nЕщё замечаний: " + (messages.length - 10) : "") + "\n\nПродолжить?", true, "NOIR: проверка")) return;
            if (phraseOnly) {
                var canUpdate = false, sourceKey = N.sourceKey(state.data, state.link);
                for (var pi = 1; pi <= comp.numLayers; pi++) {
                    var existing = N.groupInfo(comp.layer(pi));
                    if (existing && existing.sourceKey === sourceKey) canUpdate = true;
                }
                if (!canUpdate) { alert("Сначала создайте все субтитры новой версией панели — она добавит метки фраз. Затем можно обновлять одну фразу.", "NOIR Captions"); return; }
            }
            var previewComp = null;
            if (preview && (!groups.length || groups[0].compStart >= comp.duration || groups[groups.length - 1].compOut <= 0)) {
                alert("Выбранная фраза находится вне композиции.", "NOIR Captions"); return;
            }
            app.beginUndoGroup("NOIR Captions: создать субтитры");
            try {
                if (preview) {
                    var original = comp;
                    comp = original.duplicate(); previewComp = comp;
                    comp.name = "NOIR Preview · " + original.name;
                    if (N.removeSfx) N.removeSfx(comp);
                    var begin = Math.max(0, groups[0].compStart);
                    var finish = Math.min(comp.duration, begin + 5, groups[groups.length - 1].compOut);
                    var clipped = [];
                    for (var cg = 0; cg < groups.length; cg++) if (groups[cg].compStart < finish) {
                        groups[cg].compOut = Math.min(groups[cg].compOut, finish); clipped.push(groups[cg]);
                    }
                    groups = clipped;
                    comp.workAreaStart = begin; comp.workAreaDuration = Math.max(0.01, finish - begin); comp.time = begin;
                }
                // Generate a phrase successfully before removing its old layers.
                var oldPhrase = [];
                if (phraseOnly) for (var oi = 1; oi <= comp.numLayers; oi++) {
                    var layer = comp.layer(oi), inf = N.groupInfo(layer);
                    if (inf && inf.sourceKey === N.sourceKey(state.data, state.link) && inf.segment === phraseIndex()) oldPhrase.push(layer);
                }
                // Ручные сдвиги фраз (мышью или вкладкой «Правка») переносятся на пересозданные слои.
                var keepOffsets = !preview && (phraseOnly || S.replace) ? N.phraseOffsets(comp, N.sourceKey(state.data, state.link)) : {};
                var res = N.generate(comp, groups, outputStyle, outputStyle.anim,
                    preview ? true : (phraseOnly ? false : (S.replace ? N.sourceKey(state.data, state.link) : false)));
                N.applyPhraseOffsets(res.made, keepOffsets);
                if (phraseOnly) for (var ri = 0; ri < oldPhrase.length; ri++) oldPhrase[ri].remove();
                if (preview) { comp.openInViewer(); setStatus("Превью создано отдельно. Пробел / Num 0 — воспроизведение. Ctrl+Z — убрать превью."); return; }
                if (phraseOnly) state.cleanLines[phraseIndex()] = etText.text.replace(/\r\n?/g, "\n").split("\n")[phraseIndex()];
                else state.cleanLines = etText.text.replace(/\r\n?/g, "\n").split("\n");
                generationSerial++;
                warnings = warnings.concat(res.warnings);
                var msg = "Создано слоёв: " + res.created + (res.removed ? ", заменено старых: " + res.removed : "");
                setStatus(msg);
                if (warnings.length) alert(msg + "\n\n- " + warnings.join("\n- "), "NOIR Captions");
            } catch (e2) {
                if (previewComp) { try { previewComp.remove(); } catch (cleanup) {} }
                alert("Ошибка генерации: " + e2.toString() + (e2.line ? " (строка " + e2.line + ")" : ""),
                    "NOIR Captions");
            } finally {
                app.endUndoGroup();
            }
        };

        btnGenerate.onClick = function () { generateCaptions(false); };
        btnPreview.onClick = function () { generateCaptions(true); };
        btnUpdatePhrase.onClick = function () { generateCaptions(false, true); };
        btnCheck.onClick = function () { generateCaptions(false, false, true); };

        // Первый запуск: стиль из первого встроенного пресета.
        if (firstRun && presets.length) {
            for (var pi = 0; pi < presets.length; pi++) if (presets[pi].id === "noir-red") {
                var p0 = presets[pi];
                S.style = { layout: clone(p0.layout), base: clone(p0.base), accent: clone(p0.accent), anim: clone(p0.anim) };
                S.presetId = p0.id;
            }
        }
        // Start on the saved style instead of making users page through the gallery.
        var initialGallery = galleryItems();
        for (var gi = 0; gi < initialGallery.length; gi++) if (initialGallery[gi].id === S.presetId) {
            galleryPage = Math.floor(gi / 4); break;
        }
        fillPresets();
        syncUI();
        refreshRecentFonts();
        refreshWords();
        setStatus("Готов к работе.");

        // подсказка про перетаскивание — у всех бегунков, даже если у поля уже есть своя подсказка
        for (var hi = 0; hi < scrubs.length; hi++) {
            var ht = scrubs[hi].helpTip || "";
            if (ht.indexOf("Shift") < 0) scrubs[hi].helpTip = ht + (ht ? ". " : "") + "Зажмите левую кнопку и двигайте мышь. Shift — точнее, Ctrl — быстрее. Клик — ввести число.";
        }

        if (tabs.select) {
            var selectTab = tabs.select;
            tabs.select = function (index) { selectTab(index); scroller.refresh(true); };
        } else tabs.onChange = function () { scroller.refresh(true); };
        scroller.beforeLayout = function (width) { if (tabs.fit) tabs.fit(width); };
        win.minimumSize = [300, 200];
        win.onResizing = win.onResize = function () { this.layout.resize(); scroller.refresh(false); };
        var cepControls = {generate:btnGenerate,replace:cbReplace,status:stLine,advanced:cbAdvanced,
            speechPage:tSpeech,textPage:tText,stylePage:tStyle,finishPage:tFinish,viewPage:tView,layoutPage:tLayout,animationPage:tAnim,layersPage:tLayers,toolsPage:tTools,sfxPage:tSfx,
            language:ddLang,model:ddModel,device:ddDev,prompt:etPrompt,recognize:btnRecognize,cancel:btnCancel,load:btnLoad,progress:progress,
            editor:etText,save:btnSave,reset:btnReset,phrase:ddPhrase,prevPhrase:btnPrevPhrase,nextPhrase:btnNextPhrase,seek:btnSeekPhrase,updatePhrase:btnUpdatePhrase,
            wordsPrev:btnWordsBack,wordsNext:btnWordsNext,lineBreak:btnLineBreak,phraseBreak:btnPhraseBreak,editWord:btnEditWord,undoEdit:btnUndoEdit,listen:btnListen,
            preset:ddPreset,savePreset:btnSavePreset,favorites:cbFavorites,galleryPrev:btnGalleryPrev,galleryNext:btnGalleryNext,galleryPage:stGalleryPage,
            fontFamily:ddFamily,fontStyle:ddStyle,fontSearch:etFilter,fontPS:etPs,recentFonts:ddRecentFonts,fontTargetBase:rbBase,fontTargetAccent:rbAccent,
            fontSelected:btnFontToLayers,fontAll:btnFontAll,quickSize:etQuickSize,quickPosition:ddQuickPosition,intensity:ddIntensity,check:btnCheck};
        for (var cepRole in cepControls) if (cepControls[cepRole]) cepControls[cepRole]._cepRole = cepRole;
        for (var galleryRole = 0; galleryRole < galleryCards.length; galleryRole++) {
            galleryCards[galleryRole].button._cepRole = "galleryCard" + galleryRole;
            galleryCards[galleryRole].star._cepRole = "galleryStar" + galleryRole;
        }
        if (tabs.buttons) for (var tabRole = 0; tabRole < tabs.buttons.length; tabRole++) tabs.buttons[tabRole]._cepRole = "tab" + tabRole;
        for (var wordRole = 0; wordRole < wordButtons.length; wordRole++) wordButtons[wordRole]._cepRole = "word" + wordRole;
        win._cep = {
            run: runCommand,
            status: function () { return lastStatus; },
            context: function () {
                var comp = null, out = { hasData: !!state.data };
                try { comp = app.project.activeItem; } catch (e0) {}
                if (comp instanceof CompItem) {
                    out.comp = { name: comp.name, width: comp.width, height: comp.height, duration: Math.round(comp.duration * 100) / 100, time: Math.round(comp.time * 100) / 100 };
                    var key = state.data ? N.sourceKey(state.data, state.link) : null, base = [], acc = [], n = 0, i;
                    for (i = 1; i <= comp.numLayers; i++) {
                        var l = comp.layer(i);
                        if (l instanceof TextLayer && N.isGenerated(l) && (!key || N.layerSource(l) === key)) {
                            n++; var y = Math.round(N.baseOf(l)[1] / comp.height * 100); (l.label === 11 ? acc : base).push(y);
                        }
                    }
                    function avg(a) { var t = 0; for (var k = 0; k < a.length; k++) t += a[k]; return a.length ? Math.round(t / a.length) : null; }
                    out.subtitles = { count: n, accentCount: acc.length, wordsCenterYPercent: avg(base), accentsCenterYPercent: avg(acc) };
                }
                var st = S.style;
                out.style = { preset: S.presetId, baseFont: st.base.fonts[0], baseSize: st.base.size, accentFont: st.accent.fonts[0], accentSize: st.accent.size,
                    posYPercent: st.layout.posY, accentYPercent: st.layout.accentPosY, reveal: st.layout.reveal, animIn: st.anim.animIn, animOut: st.anim.animOut, accentIn: st.anim.accentIn };
                out.presets = [];
                for (var pi = 0; pi < presets.length && pi < 60; pi++) out.presets.push({ id: presets[pi].id, name: presets[pi].name });
                out.face = state.face ? { x: Math.round(state.face.x * 100) / 100, y: Math.round(state.face.y * 100) / 100, w: Math.round(state.face.w * 100) / 100, h: Math.round(state.face.h * 100) / 100 } : null;
                return out;
            },
            clearIssues: function () { cepIssues = []; pendingCheck = null; },
            selectTextPhrase: function (index) {
                if (!state.data || index < 0 || index >= state.data.segments.length || index !== Math.floor(index)) throw new Error("Нет такой фразы.");
                editingWords = true; ddPhrase.selection = index; editingWords = false;
                wordPage = 0; selectedWord = 0; refreshWords();
            },
            continueGeneration: function () {
                if (!pendingCheck) throw new Error("Запустите проверку кнопкой создания ещё раз.");
                generateCaptions(false, pendingCheck.phrase, false, true);
            },
            workflow: function () {
                var comp = app.project.activeItem, canUpdate = false, lines = etText.text.replace(/\r\n?/g, "\n").split("\n");
                if (state.data && comp instanceof CompItem) {
                    var key = N.sourceKey(state.data, state.link);
                    for (var i = 1; i <= comp.numLayers; i++) {
                        var info = N.groupInfo(comp.layer(i));
                        if (info && info.sourceKey === key) { canUpdate = true; break; }
                    }
                }
                return {hasData:!!state.data,recognizing:state.recognizing,canUpdate:canUpdate,
                    dirty:textDirty(),phraseDirty:!!state.data && lines[phraseIndex()] !== state.cleanLines[phraseIndex()],
                    phrase:phraseIndex(),count:state.data ? state.data.segments.length : 0,
                    dataRevision:state.dataRevision,scanning:!!state.scanning,page:tabs.current || 0,issues:cepIssues,pending:!!pendingCheck,preset:S.presetId,completed:generationSerial};
            },
            wordEdit: function (command) {
                if (!state.data || command.text !== etText.text) throw new Error("Текст изменился. Выделите слово ещё раз.");
                if (command.kind !== "accent" && command.kind !== "line" && command.kind !== "phrase") throw new Error("Неизвестная правка слова.");
                var start = Number(command.start), end = Number(command.end), text = etText.text;
                if (!isFinite(start) || !isFinite(end) || start < 0 || end > text.length || end < start) throw new Error("Выделите слово в тексте.");
                var si = text.substring(0, start).split("\n").length - 1, lines = text.split("\n");
                var offset = text.substring(0, start).lastIndexOf("\n") + 1, line = lines[si];
                if (end > offset + line.length) throw new Error("Выделите слова внутри одной фразы.");
                var ws = N.parseLine(line), re = /\S+/g, match, index = 0, chosen = [];
                while ((match = re.exec(line)) !== null) {
                    if (!N.parseLine(match[0]).length) continue;
                    if (match.index + match[0].length > start - offset && match.index < Math.max(end - offset, start - offset + 1)) chosen.push(index);
                    index++;
                }
                if (!chosen.length) throw new Error("Выделите слово в тексте.");
                editHistory.push(text); if (editHistory.length > 30) editHistory.shift();
                var flag = !ws[chosen[0]].accent;
                if (command.kind === "accent") for (var wi = 0; wi < chosen.length; wi++) ws[chosen[wi]].accent = flag;
                else if (command.kind === "line") ws[chosen[0]].lineBefore = !ws[chosen[0]].lineBefore;
                else ws[chosen[0]].breakBefore = !ws[chosen[0]].breakBefore;
                lines[si] = N.editorWords(ws); etText.text = lines.join("\n");
                editingWords = true; ddPhrase.selection = si; editingWords = false;
                selectedWord = chosen[0]; refreshWords(); cepIssues = []; pendingCheck = null;
                setStatus("Правка сохранена. Тайминги слов сохранены.");
            }
        };
        if (options.headless) return win;
        if (win instanceof Window) { win.center(); win.show(); }
        else { win.layout.layout(true); win.layout.resize(); }
        scroller.initialize();
        return win;
    };
})(NOIR);
