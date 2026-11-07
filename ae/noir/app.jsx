/*
 * NOIR CAPTIONS — host API: all panel logic without any UI.
 * The HTML panel (CEP) calls  app.call(op, args)  through cep/host/bridge.jsx and gets JSON back.
 * Every AE change is wrapped in one undo group (one action = one Ctrl+Z). Errors are thrown as Error(message for the user).
 * ExtendScript = ES3.
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    var SECTION = "NOIR Captions";
    var SETTINGS_KEY = "settings.v2";
    N.VERSION = "0.35.0";

    function clone(o) { return N.parseJSON(N.stringify(o)); }

    var FALLBACK_STYLE = {
        layout: { reveal: "word", maxWords: 4, maxChars: 28, lineChars: 18, pauseBreak: 0.35, punctBreak: true,
            stripPunct: true, autoAccent: false, posX: 50, posY: 70, lineGap: 0.12, wordSpace: 0.28, accentOwnLine: false,
            safeWidth: 0.9, holdGap: 0.3, layerMode: "phrase" },
        base: { fonts: ["Inter-SemiBold", "Montserrat-SemiBold", "ArialMT"], size: 72, color: [1, 1, 1], tracking: 0, caps: false,
            strokeWidth: 0, strokeColor: [0, 0, 0], shadow: { color: [0, 0, 0], opacity: 45, distance: 3, softness: 14 }, glow: null },
        accent: { fonts: ["Inter-Bold", "Montserrat-Bold", "Arial-BoldMT"], size: 84, color: [0.33, 0.6, 1], tracking: 0, caps: false,
            strokeWidth: 0, strokeColor: [0, 0, 0], shadow: { color: [0, 0, 0], opacity: 45, distance: 3, softness: 14 }, glow: null },
        anim: { animIn: "blurRise", inDur: 0.28, animOut: "fade", outDur: 0.18, distance: 24, blur: 12, easeInfluence: 80 }
    };
    var DEFAULT_SHADOW = { color: [0, 0, 0], opacity: 45, distance: 3, softness: 14 };

    var DEFAULTS = {
        language: "ru", model: "large-v3", device: "auto", prompt: "", lang: "ru",
        recentFonts: [], favoriteStyles: [], onboarded: false,
        quick: { size: 100, position: "preset", intensity: "1" },
        replace: true, python: "", presetId: "", style: FALLBACK_STYLE, reflow: true, scope: "source", nudgeStep: 20, sizeStep: 10, timeStep: 0.1,
        format: "auto",
        tools: {
            counter: { from: 0, to: 100, duration: 2, hold: 1, step: 0, interval: 0, decimals: 0, pad: 0, thousands: "none", ease: "out",
                prefix: "", suffix: "", side: "accent", size: 0, posX: 50, posY: 50, sound: false },
            strike: { color: [1, 0.2, 0.15], thickness: 8, offsetY: 0, tilt: 0, padding: 8, duration: 0.3, delay: 0.1, dir: "ltr" },
            mask: { mode: "video", invert: false, restart: false, hideSource: true, opacity: 100 }
        },
        sfx: { appear: "auto", accent: "same", exit: "off", db: -6, dbRand: 2, minGap: 0.12, file: "", mixBase: false }
    };

    N.LANGS = [{ id: "ru", label: "Русский" }, { id: "auto", label: "Авто" }, { id: "en", label: "English" }];
    N.DEVICES = [{ id: "auto", label: "Авто (GPU, если есть)" }, { id: "cuda", label: "GPU (CUDA)" }, { id: "cpu", label: "CPU" }];
    N.REVEALS = [{ id: "word", label: "Слова по очереди" }, { id: "group", label: "Фраза целиком" }, { id: "karaoke", label: "Караоке (подсветка слова)" }];
    N.LAYER_MODES = [{ id: "phrase", label: "Слой на фразу" }, { id: "word", label: "Слой на слово" }];
    N.SCOPES = [{ id: "source", label: "Субтитры этого видео" }, { id: "selected", label: "Выделенные слои" }, { id: "all", label: "Все субтитры NOIR" }];

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
        var groups = ["quick", "sfx"], gi, k2;
        for (gi = 0; gi < groups.length; gi++) {
            var merged = clone(DEFAULTS[groups[gi]]);
            for (k2 in (s[groups[gi]] || {})) merged[k2] = s[groups[gi]][k2];
            s[groups[gi]] = merged;
        }
        var tl = clone(DEFAULTS.tools);
        for (var tk in tl) for (var tf in (s.tools && s.tools[tk] ? s.tools[tk] : {})) tl[tk][tf] = s.tools[tk][tf];
        s.tools = tl;
        if (!s.style || !s.style.layout || !s.style.base || !s.style.accent || !s.style.anim) s.style = clone(FALLBACK_STYLE);
        if (!s.style.layout.layerMode) s.style.layout.layerMode = "word";      // styles saved before 1.0 keep their look
        return s;
    }
    function saveSettings(s) { try { app.settings.saveSetting(SECTION, SETTINGS_KEY, N.stringify(s)); } catch (e) {} }

    // Presets: built-in (project folder) + the user's own (user folder, not in git).
    N.userPresetFolder = function () { return Folder(Folder.userData.fsName + "/NOIR Captions/styles"); };
    N.isPreset = function (p) { return !!(p && p.schema === "noir-style/1" && p.layout && p.base && p.accent && p.anim); };
    N.loadPresets = function (root) {
        var out = [], dirs = [Folder(root + "/presets/styles"), N.userPresetFolder()];
        for (var d = 0; d < dirs.length; d++) {
            if (!dirs[d].exists) continue;
            var files = dirs[d].getFiles("*.json");
            for (var i = 0; i < files.length; i++) {
                try {
                    var p = N.parseJSON(N.readText(files[i]));
                    if (N.isPreset(p)) { p.user = d === 1; out.push(p); }
                } catch (e) {}
            }
        }
        return out;
    };

    // Fonts (Font API: AE 24.0+). Returns families matching a query, at most `limit`.
    N.fontFamilies = function (query, limit) {
        var out = [], q = String(query || "").toLowerCase(), all;
        try { all = app.fonts.allFonts; } catch (e) { return { available: false, families: [] }; }
        for (var i = 0; i < all.length && out.length < (limit || 200); i++) {
            var group = all[i];
            if (!group || !group.length) continue;
            var name = String(group[0].familyName);
            if (q && name.toLowerCase().indexOf(q) < 0) continue;
            var styles = [];
            for (var j = 0; j < group.length; j++) styles.push({ style: String(group[j].styleName), ps: String(group[j].postScriptName) });
            out.push({ name: name, styles: styles });
        }
        return { available: true, families: out };
    };

    // Settings paths the panel may change, with type and range. Anything else is refused.
    var SIDE = { fonts: "fonts", size: [4, 2000], tracking: [-1000, 3000], caps: "bool", strokeWidth: [0, 200], color: "color", strokeColor: "color",
        shadow: "bool-shadow", glow: [0, 500], blend: "blend", opacity: [0, 100] };
    var PATHS = {
        "language": "lang", "model": "model", "device": "device", "prompt": "text", "lang": "uilang", "replace": "bool", "reflow": "bool", "scope": "scope",
        "nudgeStep": [1, 2000], "sizeStep": [1, 100], "timeStep": [0.01, 30], "format": "format", "python": "text", "onboarded": "bool",
        "quick.size": [25, 200], "quick.position": "qpos", "quick.intensity": "qint",
        "style.layout.reveal": "reveal", "style.layout.layerMode": "layerMode", "style.layout.maxWords": [1, 30], "style.layout.maxChars": [1, 300],
        "style.layout.lineChars": [0, 300], "style.layout.accentOwnLine": "bool", "style.layout.autoAccent": "bool", "style.layout.posX": [-50, 150],
        "style.layout.posY": [-50, 150], "style.layout.accentPosY": "accentY", "style.layout.lineGap": [-1, 5], "style.layout.wordSpace": [0, 3],
        "style.layout.pauseBreak": [0.05, 10], "style.layout.punctBreak": "bool", "style.layout.stripPunct": "bool", "style.layout.safeWidth": [0.3, 1],
        "style.layout.holdGap": [0, 5], "style.layout.keepShortWords": "bool",
        "style.anim.animIn": "animIn", "style.anim.animOut": "animOut", "style.anim.inDur": [0, 5], "style.anim.outDur": [0, 5],
        "style.anim.distance": [0, 5000], "style.anim.blur": [0, 500], "style.anim.easeInfluence": [0.1, 100], "style.anim.intensity": [0, 3],
        "style.anim.highlightColor": "color",
        "sfx.appear": "text", "sfx.accent": "text", "sfx.exit": "text", "sfx.file": "text", "sfx.mixBase": "bool", "sfx.db": [-60, 12], "sfx.dbRand": [0, 12], "sfx.minGap": [0, 5]
    };
    (function () {
        var sides = ["base", "accent"], k, i;
        for (i = 0; i < sides.length; i++) for (k in SIDE) PATHS["style." + sides[i] + "." + k] = SIDE[k];
        var tools = { counter: { from: [-1e9, 1e9], to: [-1e9, 1e9], duration: [0.1, 600], hold: [0, 600], step: [0, 1e6], interval: [0, 5], decimals: [0, 6], pad: [0, 12],
            thousands: "text", ease: "text", prefix: "text", suffix: "text", side: "side", size: [0, 2000], posX: [-50, 150], posY: [-50, 150], sound: "bool" },
            strike: { color: "color", thickness: [0.5, 200], offsetY: [-100, 100], tilt: [-45, 45], padding: [-50, 200], duration: [0, 5], delay: [0, 10], dir: "text" },
            mask: { mode: "text", invert: "bool", restart: "bool", hideSource: "bool", opacity: [0, 100] } };
        for (var t in tools) for (k in tools[t]) PATHS["tools." + t + "." + k] = tools[t][k];
    })();
    function oneOf(list, v) { for (var i = 0; i < list.length; i++) if (list[i] === v) return true; return false; }
    function inList(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return true; return false; }
    function coerce(kind, v) {
        if (kind instanceof Array) { var x = Number(v); if (!isFinite(x)) throw new Error("Нужно число."); return Math.max(kind[0], Math.min(kind[1], x)); }
        switch (kind) {
            case "bool": return !!v;
            case "text": return String(v === null || v === undefined ? "" : v).substr(0, 2000);
            case "color": if (!(v instanceof Array) || v.length < 3) throw new Error("Цвет — три числа 0…1."); return [Math.max(0, Math.min(1, Number(v[0]))), Math.max(0, Math.min(1, Number(v[1]))), Math.max(0, Math.min(1, Number(v[2])))];
            case "lang": if (!inList(N.LANGS, v)) throw new Error("Нет такого языка."); return v;
            case "uilang": if (v !== "ru" && v !== "en") throw new Error("Язык интерфейса: ru или en."); return v;
            case "model": if (!inList(N.MODELS, v)) throw new Error("Нет такой модели."); return v;
            case "device": if (!inList(N.DEVICES, v)) throw new Error("Нет такого устройства."); return v;
            case "scope": if (!inList(N.SCOPES, v)) throw new Error("Нет такой области."); return v;
            case "reveal": if (!inList(N.REVEALS, v)) throw new Error("Нет такого режима."); return v;
            case "layerMode": if (!inList(N.LAYER_MODES, v)) throw new Error("Нет такого режима слоёв."); return v;
            case "animIn": if (!inList(N.ANIM_IN, v)) throw new Error("Нет такой анимации."); return v;
            case "animOut": if (!inList(N.ANIM_OUT, v)) throw new Error("Нет такой анимации."); return v;
            case "blend": if (!inList(N.BLEND_MODES, v)) throw new Error("Нет такого режима наложения."); return v;
            case "qpos": if (!oneOf(["preset", "25", "50", "75"], String(v))) throw new Error("Положение: preset, 25, 50, 75."); return String(v);
            case "qint": if (!oneOf(["1", "0.5", "1.5"], String(v))) throw new Error("Интенсивность: 0.5, 1, 1.5."); return String(v);
            case "side": if (v !== "base" && v !== "accent") throw new Error("base или accent."); return v;
            case "format": if (!inList(N.FORMATS, v)) throw new Error("Нет такого формата."); return v;
            case "accentY": if (v === null || v === "" || v === false) return null; return Math.max(-50, Math.min(150, Number(v)));
            case "fonts": if (!(v instanceof Array) || !v.length) throw new Error("Нужен список шрифтов."); return v.slice(0, 12);
            case "bool-shadow": return v ? (v === true ? clone(DEFAULT_SHADOW) : v) : null;
        }
        throw new Error("Неизвестный тип настройки.");
    }

    N.isWindows = function () { return String($.os || "").indexOf("Windows") !== -1; };

    N.createApp = function (root) {
        var S = loadSettings(), presets = N.loadPresets(root), listeners = [];
        var st = { data: null, link: null, text: "", cleanLines: [], history: [], timing: {}, phrase: 0, recognizing: false, scanning: false, progress: 0,
            status: "Готов к работе.", face: null, issues: [], pending: null, completed: 0, dataRevision: 0, log: [] };
        if (!S.presetId && !S.style.base.fonts.length) S.style = clone(FALLBACK_STYLE);

        function status(text, pct) { st.status = String(text); if (pct !== undefined && pct !== null) st.progress = pct; }
        function log(level, text) {
            st.log.push({ t: new Date().getTime(), level: level, text: String(text).substr(0, 600) });
            if (st.log.length > 200) st.log.shift();
            try {
                var dir = Folder(Folder.userData.fsName + "/NOIR Captions"); if (!dir.exists) dir.create();
                var f = File(dir.fsName + "/noir.log"); f.encoding = "UTF-8";
                if (f.open("a")) { f.writeln(new Date().toUTCString() + " [" + level + "] " + text); f.close(); }
            } catch (e) {}
        }
        function lines() { return String(st.text).replace(/\r\n?/g, "\n").split("\n"); }
        function timingDirty() { for (var k in st.timing) if (st.timing.hasOwnProperty(k)) return true; return false; }
        function dirty() { return !!st.data && (lines().join("\n") !== st.cleanLines.join("\n") || timingDirty()); }
        function presetById(id) { for (var i = 0; i < presets.length; i++) if (presets[i].id === id) return presets[i]; return null; }
        function activeComp() {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) throw new Error("Откройте композицию.");
            return comp;
        }
        function undo(name, fn) {
            app.beginUndoGroup("NOIR Captions: " + name);
            try { return fn(); } finally { app.endUndoGroup(); }
        }
        function sourceKey() { return st.data ? N.sourceKey(st.data, st.link) : null; }

        // ---------- style ----------
        function renderStyle() {
            var s = clone(S.style), q = S.quick, factor = (Number(q.size) || 100) / 100;
            s.base.size *= factor; s.accent.size *= factor;
            if (q.position !== "preset") s.layout.posY = Number(q.position);
            s.anim.intensity = (s.anim.intensity === undefined ? 1 : s.anim.intensity) * Number(q.intensity || 1);
            if (S.format && S.format !== "auto" && N.FORMATS) s.layout.format = S.format;
            return s;
        }
        function choosePreset(p) {
            S.style = { layout: clone(p.layout), base: clone(p.base), accent: clone(p.accent), anim: clone(p.anim) };
            if (!S.style.layout.layerMode) S.style.layout.layerMode = "phrase";       // since 0.31 the default; a style may ask for "word"
            S.presetId = p.id; S.quick = clone(DEFAULTS.quick); saveSettings(S);
        }
        function setFont(side, ps) {
            var t = S.style[side], rest = [];
            for (var i = 0; i < t.fonts.length; i++) if (t.fonts[i] !== ps) rest.push(t.fonts[i]);
            t.fonts = [ps].concat(rest);
            S.recentFonts = N.recentItem(S.recentFonts, ps, 8);
        }

        // ---------- text ----------
        function setData(data, link) {
            st.dataRevision++; st.history = []; st.timing = {}; st.data = data; st.link = link; st.phrase = 0; st.issues = []; st.pending = null;
            st.text = N.toEditorText(data); st.cleanLines = st.text.split("\n");
            var n = 0;
            for (var i = 0; i < data.segments.length; i++) n += data.segments[i].words.length;
            var gpu = "";
            for (var w = 0; w < (data.warnings || []).length; w++) if (data.warnings[w].code === "gpu_failed") gpu = " GPU не сработала — распознано на CPU.";
            status(n ? "Слов: " + n + ", язык " + data.language + "." + gpu + " Проверьте текст." : "Речь не найдена.", 1);
        }
        function phraseWords(index) {
            if (!st.data) return [];
            var words = N.applyEdits(st.data, st.text, []), out = [], si = index === undefined ? st.phrase : index;
            for (var i = 0; i < words.length; i++) if (words[i].seg === si) out.push(words[i]);
            return out;
        }
        function remember() { st.history.push(st.text); if (st.history.length > 30) st.history.shift(); }
        // Timing edits need the phrase's data words to match its editor line one to one: if the number of words changed in the text,
        // the edited line becomes the phrase's words (with the timings the editor already shows).
        function commitPhrase(si) {
            var ws = phraseWords(si), seg = st.data.segments[si];
            if (!ws.length) throw new Error("Фраза пуста.");
            if (ws.length === seg.words.length) return seg.words;
            var out = [];
            for (var i = 0; i < ws.length; i++) out.push({ text: ws[i].text.replace(/[*~|]/g, ""), start: ws[i].start, end: ws[i].end, conf: ws[i].conf });
            seg.words = out;
            return out;
        }
        function resolveLink(comp) {
            var L = st.link;
            if (!L) return { startTime: 0, stretch: 100, note: "" };
            if (comp.id !== L.compId) return { startTime: L.startTime, stretch: L.stretch, note: "Генерация в другую композицию: использовано время аудиослоя из исходной." };
            var layer = null;
            if (L.layerId) try { layer = comp.layerByID ? comp.layerByID(L.layerId) : null; } catch (eId) { layer = null; }
            if (!layer && L.layerIndex <= comp.numLayers && comp.layer(L.layerIndex).name === L.layerName) layer = comp.layer(L.layerIndex);
            for (var i = 1; !layer && i <= comp.numLayers; i++) if (comp.layer(i).name === L.layerName) layer = comp.layer(i);
            if (!layer) return { startTime: L.startTime, stretch: L.stretch, note: "Аудиослой «" + L.layerName + "» не найден — использовано сохранённое время." };
            return { startTime: layer.startTime, stretch: layer.stretch, note: "" };
        }
        function seek(index, wordIndex) {
            var comp = activeComp(), words = phraseWords(index), w = words[wordIndex || 0];
            if (!words.length) throw new Error("Выбранная фраза пуста.");
            if (!w) throw new Error("Нет такого слова.");
            if (st.link && st.link.compId !== comp.id) throw new Error("Откройте исходную композицию для перехода к фразе.");
            var map = resolveLink(comp), time = N.sourceToComp(w.start, map.startTime, map.stretch);
            comp.time = Math.max(0, Math.min(comp.duration - comp.frameDuration, time));
            status((wordIndex ? "«" + w.text.replace(/[*~|]/g, "") + "» · " : "Фраза " + (index + 1) + " · ") + time.toFixed(2) + " с" + (map.note ? " · " + map.note : ""));
        }

        // ---------- layers ----------
        function selectedText() {
            var comp = activeComp(), sel = comp.selectedLayers, out = [];
            for (var i = 0; i < sel.length; i++) if (sel[i] instanceof TextLayer) out.push(sel[i]);
            if (!out.length) throw new Error("Выделите в таймлайне один или несколько текстовых слоёв.");
            return { comp: comp, layers: out };
        }
        function scopeLayers(scope) {
            var comp = activeComp(), id = scope || S.scope, out = [], i;
            if (id === "selected") return selectedText();
            var key = null;
            if (id === "source") {
                if (!st.data) throw new Error("Панель не знает, какое это видео: распознайте речь или загрузите текст. Либо выберите «Выделенные слои».");
                key = sourceKey();
            }
            for (i = 1; i <= comp.numLayers; i++) {
                var l = comp.layer(i);
                if (l instanceof TextLayer && N.isGenerated(l) && (!key || N.layerSource(l) === key)) out.push(l);
            }
            if (!out.length) throw new Error(key ? "В этой композиции нет субтитров этого видео." : "В композиции нет субтитров NOIR.");
            return { comp: comp, layers: out };
        }
        function restyle(which, look, anim, name, layersSel) {
            var sel = layersSel || selectedText();
            return undo(name, function () {
                var res = N.restyleLayers(sel.comp, sel.layers, { style: look ? S.style[which] : null, parts: (look && look !== true) ? look : null,
                    accent: which === "accent", safeWidth: S.style.layout.safeWidth, anim: anim ? S.style.anim : null });
                var rf = "";
                if (S.reflow && look && (look === true || !look.font || look.size)) { var rr = N.reflowGroups(sel.comp, sel.layers, S.style.layout); if (rr.groups) rf = ", фраз переложено: " + rr.groups; }
                status("Изменено слоёв: " + res.changed + rf + (res.warnings.length ? "\n" + res.warnings.join("\n") : ""));
                return res.changed;
            });
        }
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

        // ---------- generation ----------
        function buildGroups(words, outputStyle, comp) {
            var L = outputStyle.layout;
            var groups = N.groupWords(words, { maxWords: L.maxWords, maxChars: L.maxChars, pauseBreak: L.pauseBreak, punctBreak: L.punctBreak, stripPunct: L.stripPunct });
            if (L.autoAccent) N.autoAccent(groups);
            N.timeGroups(groups, L.holdGap, 0.08);
            var map = resolveLink(comp), key = sourceKey();
            for (var i = 0; i < groups.length; i++) {
                var g = groups[i];
                g.sourceKey = key;
                g.compStart = N.sourceToComp(g.start, map.startTime, map.stretch);
                g.compOut = N.sourceToComp(g.outTime, map.startTime, map.stretch);
                for (var j = 0; j < g.words.length; j++) {
                    g.words[j].compStart = N.sourceToComp(g.words[j].start, map.startTime, map.stretch);
                    g.words[j].compEnd = N.sourceToComp(g.words[j].end, map.startTime, map.stretch);
                }
            }
            return { groups: groups, note: map.note };
        }
        // mode: all | phrase | preview | check. accept: create despite the pre-flight remarks shown before.
        function generate(mode, accept) {
            if (!st.data) throw new Error("Сначала распознайте речь или откройте JSON.");
            var comp = activeComp(), warnings = [], words = N.applyEdits(st.data, st.text, warnings), outputStyle = renderStyle();
            var key = sourceKey();
            if (mode === "phrase") {
                var any = false;
                for (var pi = 1; pi <= comp.numLayers && !any; pi++) { var ex = N.groupInfo(comp.layer(pi)); if (ex && ex.sourceKey === key) any = true; }
                if (!any) throw new Error("Сначала создайте все субтитры — затем можно обновлять одну фразу.");
            }
            if (mode === "preview" || mode === "phrase") {
                var subset = [];
                for (var pw = 0; pw < words.length; pw++) if (words[pw].seg === st.phrase) subset.push(words[pw]);
                words = subset;
                if (!words.length) throw new Error("Выберите непустую фразу.");
            }
            var built = buildGroups(words, outputStyle, comp), groups = built.groups;
            if (built.note) warnings.push(built.note);
            var issues = N.checkCaptions(groups, outputStyle, comp);
            if (mode === "check") { st.issues = issues; status(issues.length ? "Замечаний: " + issues.length : "Проблем не найдено. Геометрию и анимацию проверьте в превью."); return { issues: issues }; }
            if (mode !== "preview") {
                var signature = N.stringify({ w: words, s: outputStyle, c: comp.id, cw: comp.width, ch: comp.height, d: comp.duration, m: mode, i: issues, r: S.replace });
                if (issues.length && !(accept && st.pending && st.pending.signature === signature)) {
                    st.issues = issues; st.pending = { signature: signature, mode: mode };
                    status("Проверьте замечания перед созданием."); return { issues: issues, pending: true };
                }
                st.issues = []; st.pending = null;
            }
            if (mode === "preview" && (!groups.length || groups[0].compStart >= comp.duration || groups[groups.length - 1].compOut <= 0)) throw new Error("Выбранная фраза находится вне композиции.");
            var previewComp = null;
            app.beginUndoGroup("NOIR Captions: создать субтитры");
            try {
                if (mode === "preview") {
                    var original = comp;
                    comp = original.duplicate(); previewComp = comp; comp.name = "NOIR Preview · " + original.name;
                    if (N.removeSfx) N.removeSfx(comp);
                    var begin = Math.max(0, groups[0].compStart), finish = Math.min(comp.duration, begin + 5, groups[groups.length - 1].compOut), clipped = [];
                    for (var cg = 0; cg < groups.length; cg++) if (groups[cg].compStart < finish) { groups[cg].compOut = Math.min(groups[cg].compOut, finish); clipped.push(groups[cg]); }
                    groups = clipped; comp.workAreaStart = begin; comp.workAreaDuration = Math.max(0.01, finish - begin); comp.time = begin;
                }
                var oldPhrase = [];
                if (mode === "phrase") for (var oi = 1; oi <= comp.numLayers; oi++) {
                    var layer = comp.layer(oi), inf = N.groupInfo(layer);
                    if (inf && inf.sourceKey === key && inf.segment === st.phrase) oldPhrase.push(layer);
                }
                var keepOffsets = mode !== "preview" && (mode === "phrase" || S.replace) ? N.phraseOffsets(comp, key) : {};
                var res = N.generate(comp, groups, outputStyle, outputStyle.anim, mode === "preview" ? true : (mode === "phrase" ? false : (S.replace ? key : false)));
                N.applyPhraseOffsets(res.made, keepOffsets);
                for (var ri = 0; ri < oldPhrase.length; ri++) oldPhrase[ri].remove();
                if (mode !== "preview" && N.findControl(comp) && res.made.length) {        // new captions follow the control sliders too
                    var madeLayers = []; for (var mi = 0; mi < res.made.length; mi++) madeLayers.push(res.made[mi].layer);
                    N.linkControl(comp, madeLayers);
                }
                if (mode === "preview") { comp.openInViewer(); status("Превью создано отдельной композицией. Пробел — воспроизведение, Ctrl+Z — убрать."); return { preview: true }; }
                var ls = lines();
                if (mode === "phrase") { st.cleanLines[st.phrase] = ls[st.phrase]; delete st.timing[st.phrase]; } else { st.cleanLines = ls; st.timing = {}; }
                st.completed++;
                warnings = warnings.concat(res.warnings);
                status("Создано слоёв: " + res.created + (res.removed ? ", заменено старых: " + res.removed : "") + (warnings.length ? "\n" + warnings.join("\n") : ""));
                return { created: res.created, removed: res.removed, warnings: warnings };
            } catch (e) {
                if (previewComp) try { previewComp.remove(); } catch (cleanup) {}
                throw e;
            } finally { app.endUndoGroup(); }
        }

        // ---------- face ----------
        function faceScan(avoid) {
            if (st.scanning) throw new Error("Поиск лица уже идёт.");
            var comp = activeComp();
            if (!st.data || !st.data.source || !st.data.source.file) throw new Error("Нужен распознанный или загруженный текст с путём к видео. Распознайте слой ещё раз.");
            var map = resolveLink(comp), srcTime = Math.max(0, N.compToSource(comp.time, map.startTime, map.stretch));
            st.scanning = true; status("Ищу лицо на кадре…");
            N.faceScan(root, S.python, st.data.source.file, srcTime, {
                onDone: function (res) {
                    st.scanning = false;
                    if (!res.found) { status("Лицо на этом кадре не найдено (" + (Math.round(srcTime * 10) / 10) + " с). Поставьте индикатор времени на кадр, где лицо видно."); return; }
                    st.face = res.box;
                    var note = "Лицо найдено: " + Math.round((res.box.x + res.box.w / 2) * 100) + "% по ширине, " + Math.round((res.box.y + res.box.h / 2) * 100) + "% по высоте.";
                    if (!avoid) { status(note); return; }
                    var sel;
                    try { sel = scopeLayers(); } catch (e) { status(note + " " + e.message); return; }
                    try {
                        undo("субтитры мимо лица", function () {
                            var r = N.avoidFace(sel.comp, sel.layers, res.box, S.style.layout);
                            status(note + " Фраз переставлено: " + r.moved + (r.shrunk ? ", уменьшено: " + r.shrunk : "") + ". Лицо оценено по одному кадру.");
                        });
                    } catch (e2) { status("Ошибка расстановки: " + e2.message); log("error", e2.toString()); }
                },
                onError: function (text) { st.scanning = false; status(text); log("error", text); }
            });
            return "Ищу лицо…";
        }

        // ---------- commands on ready subtitles (radial panel, assistant, Edit page) ----------
        function onScope(name, fn, scope) { var sel = scopeLayers(scope); return undo(name, function () { var m = fn(sel); status(m); return m; }); }
        function run(cmd) {
            cmd = cmd || {};
            switch (cmd.op) {
                case "place": return onScope("положение", function (sel) { return "Фраз перемещено: " + N.moveBlocksTo(sel.comp, sel.layers, cmd.x === undefined ? null : Number(cmd.x), Number(cmd.y)).phrases; }, cmd.scope);
                case "placeZones": return onScope("положение слов и акцентов", function (sel) { return "Фраз переставлено: " + N.placeZones(sel.comp, sel.layers, Number(cmd.baseY), Number(cmd.accentY)).phrases; }, cmd.scope);
                case "nudge": var px = Number(cmd.px) || S.nudgeStep;
                    return onScope("сдвиг", function (sel) { return "Сдвинуто фраз: " + N.nudgeBlocks(sel.comp, sel.layers, (Number(cmd.kx) || 0) * px, (Number(cmd.ky) || 0) * px).phrases + " на " + px + " px"; }, cmd.scope);
                case "size": var pct = Number(cmd.pct) || S.sizeStep, f = cmd.sign > 0 ? 1 + pct / 100 : 1 / (1 + pct / 100);
                    return onScope("размер текста", function (sel) { return "Размер " + (cmd.sign > 0 ? "увеличен" : "уменьшен") + " на " + pct + "%: слоёв " + N.scaleFont(sel.comp, sel.layers, f, S.style.layout).changed; }, cmd.scope);
                case "scale": var factor = Number(cmd.factor);
                    if (!isFinite(factor) || factor < 0.3 || factor > 3) throw new Error("Недопустимый множитель размера.");
                    return onScope("размер текста", function (sel) { return "Размер ×" + (Math.round(factor * 100) / 100) + ": слоёв " + N.scaleFont(sel.comp, sel.layers, factor, S.style.layout).changed; }, cmd.scope);
                case "time": return onScope("время", function (sel) {
                    var amount = Number(cmd.amount), unit = cmd.frames ? sel.comp.frameDuration : 1;
                    var step = (isFinite(amount) && amount > 0 ? amount : (cmd.frames ? Math.max(1, Math.round(S.timeStep / sel.comp.frameDuration)) : S.timeStep)) * unit;
                    N.retimeLayers(sel.comp, sel.layers, { shift: (Number(cmd.shift) || 0) * step, dIn: (Number(cmd.dIn) || 0) * step, dOut: (Number(cmd.dOut) || 0) * step });
                    return "Время изменено у слоёв: " + sel.layers.length + " (шаг " + (Math.round(step * 100) / 100) + " с)";
                }, cmd.scope);
                case "animIn": case "animOut":
                    var list = cmd.op === "animIn" ? N.ANIM_IN : N.ANIM_OUT;
                    if (!inList(list, cmd.id)) throw new Error("Нет такой анимации: " + cmd.id);
                    if (cmd.op === "animIn") { S.style.anim.animIn = cmd.id; delete S.style.anim.accentIn; } else { S.style.anim.animOut = cmd.id; delete S.style.anim.accentOut; }
                    S.presetId = ""; saveSettings(S);
                    return onScope("анимация", function (sel) {
                        var r = N.restyleLayers(sel.comp, sel.layers, { style: null, safeWidth: S.style.layout.safeWidth, anim: S.style.anim });
                        return "Анимация применена к слоям: " + r.changed;
                    }, cmd.scope);
                case "applyStyle": return onScope("стиль", function (sel) {
                    var acc = [], base = [], w = [], i;
                    for (i = 0; i < sel.layers.length; i++) (sel.layers[i].label === 11 ? acc : base).push(sel.layers[i]);
                    if (base.length) w = w.concat(N.restyleLayers(sel.comp, base, { style: S.style.base, accent: false, safeWidth: S.style.layout.safeWidth, anim: null }).warnings);
                    if (acc.length) w = w.concat(N.restyleLayers(sel.comp, acc, { style: S.style.accent, accent: true, safeWidth: S.style.layout.safeWidth, anim: null }).warnings);
                    var rf = S.reflow ? N.reflowGroups(sel.comp, sel.layers, S.style.layout) : { groups: 0 };
                    return "Стиль применён к слоям: " + sel.layers.length + (rf.groups ? ", фраз переложено: " + rf.groups : "") + (w.length ? "\n" + w.join("\n") : "");
                }, cmd.scope);
                case "resetPos": return onScope("исходные места", function (sel) { return "Возвращено слоёв: " + N.resetPositions(sel.layers); }, cmd.scope);
                case "delete": if (!cmd.confirmed) throw new Error("Удаление нужно подтвердить.");
                    return onScope("удалить субтитры", function (sel) { for (var i = 0; i < sel.layers.length; i++) { if (sel.layers[i].locked) sel.layers[i].locked = false; sel.layers[i].remove(); } return "Удалено слоёв: " + sel.layers.length; }, cmd.scope);
                case "behind": return behind();
                case "scope": if (!inList(N.SCOPES, cmd.id)) throw new Error("Нет такой области: " + cmd.id); S.scope = cmd.id; saveSettings(S); status("Область: " + cmd.id); return st.status;
                case "preset": var p = presetById(String(cmd.id)); if (!p) throw new Error("Нет стиля «" + cmd.id + "»."); choosePreset(p); status("Стиль выбран: " + p.name); return st.status;
                case "faceScan": return faceScan(false);
                case "avoidFace": return faceScan(true);
                case "makeAccent": return restyle("accent", true, false, "сделать акцентом");
                case "makeBase": return restyle("base", true, false, "сделать обычным");
                case "keywords": return keywords(cmd);
            }
            throw new Error("Неизвестная команда: " + cmd.op);
        }
        function behind() {
            var comp = activeComp(), sel = comp.selectedLayers, over = null, list = [], i, key = sourceKey();
            for (i = 0; i < sel.length; i++) if (!N.isGenerated(sel[i])) { over = sel[i]; break; }
            for (i = 1; !over && i <= comp.numLayers; i++) if (String(comp.layer(i).comment || "") === N.PERSON_TAG) over = comp.layer(i);   // the Roto Brush copy, if prepared
            if (!over) throw new Error("Выделите слой, под которым должны оказаться субтитры (например, копию видео с вырезанным человеком), или попросите помощника «вырежи человека» — он подготовит такую копию.");
            for (i = 1; i <= comp.numLayers; i++) { var l = comp.layer(i); if (l instanceof TextLayer && N.isGenerated(l) && (!key || N.layerSource(l) === key)) list.push(l); }
            if (!list.length) throw new Error("В композиции нет субтитров NOIR.");
            return undo("субтитры под слой", function () { status("Субтитры под слоем «" + over.name + "»: " + N.placeBehind(comp, list, over).moved); return st.status; });
        }
        // Keyword highlight: words (matched case-insensitively) get the accent style in the text; with layers already made, also restyled.
        function keywords(cmd) {
            if (!st.data) throw new Error("Нет текста.");
            var want = cmd.words || [], ls = lines(), changed = 0, i, j;
            if (!(want instanceof Array) || !want.length) throw new Error("Назовите слова для выделения.");
            var set = {};
            for (i = 0; i < want.length; i++) set[String(want[i]).toLowerCase().replace(/[^a-zа-яё0-9%$€]/gi, "")] = true;
            remember();
            for (i = 0; i < ls.length; i++) {
                var ws = N.parseLine(ls[i]);
                for (j = 0; j < ws.length; j++) { var bare = ws[j].text.toLowerCase().replace(/[^a-zа-яё0-9%$€]/gi, ""); if (set[bare] && !ws[j].accent) { ws[j].accent = true; changed++; } }
                ls[i] = N.editorWords(ws);
            }
            st.text = ls.join("\n"); status("Выделено слов: " + changed + ". Обновите субтитры, чтобы применить."); return st.status;
        }

        // ---------- selection, masks, Roto Brush preparation (for the assistant and the radial menu) ----------
        N.PERSON_TAG = "noir-captions:person";
        function sourceLayer(comp) {
            var L = st.link, i;
            if (L && comp.id === L.compId) {
                if (L.layerId) try { var byId = comp.layerByID ? comp.layerByID(L.layerId) : null; if (byId) return byId; } catch (e) {}
                for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === L.layerName) return comp.layer(i);
            }
            return null;
        }
        // The footage the user means: a selected non-NOIR AV layer, else the recognized audio/video layer, else the lowest video layer.
        function videoLayer(comp) {
            var sel = comp.selectedLayers, i, l;
            for (i = 0; i < sel.length; i++) if (!(sel[i] instanceof TextLayer) && !N.isGenerated(sel[i]) && String(sel[i].comment || "") !== N.CONTROL_TAG && !sel[i].nullLayer) return sel[i];
            var src = sourceLayer(comp); if (src) return src;
            for (i = comp.numLayers; i >= 1; i--) { l = comp.layer(i); if (l instanceof AVLayer && !(l instanceof TextLayer) && !l.nullLayer && String(l.comment || "").indexOf("noir-captions") !== 0 && l.source && l.source.hasVideo !== false && l.width) return l; }
            return null;
        }
        function selectOnly(comp, list) {
            for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            for (var j = 0; j < list.length; j++) list[j].selected = true;
            return list.length;
        }
        function selectTarget(target) {
            var comp = activeComp(), list = [], i, key = sourceKey();
            if (target === "none") { selectOnly(comp, []); return { n: 0, what: "ничего" }; }
            if (target === "video") { var v = videoLayer(comp); if (!v) throw new Error("Не нашёл слой видео в композиции."); selectOnly(comp, [v]); return { n: 1, what: "видео «" + v.name + "»" }; }
            if (target === "control") { var c = N.findControl(comp); if (!c) throw new Error("В композиции нет пульта NOIR Control."); selectOnly(comp, [c]); return { n: 1, what: "пульт" }; }
            for (i = 1; i <= comp.numLayers; i++) {
                var l = comp.layer(i);
                if (!(l instanceof TextLayer) || !N.isGenerated(l) || (key && N.layerSource(l) !== key && target !== "all")) continue;
                var gi = N.groupInfo(l);
                if (target === "accents" && l.label !== 11) continue;
                if (target === "base" && l.label === 11) continue;
                if (target === "phrase" && (!gi || gi.segment !== st.phrase)) continue;
                list.push(l);
            }
            if (!list.length) throw new Error(target === "phrase" ? "У выбранной фразы ещё нет слоёв — создайте или обновите субтитры." : "В композиции нет таких субтитров.");
            selectOnly(comp, list);
            return { n: list.length, what: { captions: "субтитры этого видео", all: "все субтитры NOIR", accents: "акценты", base: "обычные слова", phrase: "фраза " + (st.phrase + 1) }[target] || target };
        }
        // Mask in % of the layer: rect or ellipse; feather in % of the smaller side; invert keeps the outside.
        function addMask(layer, a) {
            var w = layer.width || (layer.source && layer.source.width) || 1920, h = layer.height || (layer.source && layer.source.height) || 1080;
            var x = w * Math.max(-50, Math.min(150, Number(a.x === undefined ? 10 : a.x))) / 100, y = h * Math.max(-50, Math.min(150, Number(a.y === undefined ? 10 : a.y))) / 100;
            var mw = w * Math.max(1, Math.min(200, Number(a.w === undefined ? 80 : a.w))) / 100, mh = h * Math.max(1, Math.min(200, Number(a.h === undefined ? 80 : a.h))) / 100;
            var sh = new Shape();
            if (a.shape === "ellipse") {
                var k = 0.5523, rx = mw / 2, ry = mh / 2, cx = x + rx, cy = y + ry;
                sh.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
                sh.inTangents = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
                sh.outTangents = [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]];
            } else sh.vertices = [[x, y], [x + mw, y], [x + mw, y + mh], [x, y + mh]];
            sh.closed = true;
            var m = layer.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            m.name = "NOIR Mask";
            m.property("ADBE Mask Shape").setValue(sh);
            var f = Math.min(w, h) * Math.max(0, Math.min(100, Number(a.feather) || 0)) / 100;
            m.property("ADBE Mask Feather").setValue([f, f]);
            try { m.inverted = !!a.invert; } catch (e) {}
            return m;
        }

        // ---------- filler words ----------
        var FILLERS = ["э", "ээ", "эээ", "эм", "эмм", "мм", "ммм", "хм", "ну", "типа", "короче", "как бы", "это самое", "так сказать", "в общем-то",
            "uh", "um", "uhm", "umm", "erm", "er", "hmm", "you know", "i mean"];
        function bare(w) { return String(w).toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\- ]/g, ""); }
        function fillers(list, dry) {
            var set = {}, i, si, removed = 0, changes = [], ls = lines(), snapshot = { text: st.text, data: clone(st.data), timingAll: clone(st.timing) };
            list = list && list.length ? list : FILLERS;
            for (i = 0; i < list.length; i++) set[bare(list[i])] = true;
            for (si = 0; si < st.data.segments.length && si < ls.length; si++) {
                var pw = N.parseLine(ls[si]);
                if (!pw.length) continue;
                var drop = [], k;
                for (k = 0; k < pw.length; k++) {
                    if (drop[k]) continue;
                    if (k + 1 < pw.length && set[bare(pw[k].text) + " " + bare(pw[k + 1].text)]) { drop[k] = drop[k + 1] = true; continue; }
                    if (set[bare(pw[k].text)]) drop[k] = true;
                }
                var keep = [], n = 0;
                for (k = 0; k < pw.length; k++) if (!drop[k]) keep.push(k); else n++;
                if (!n || !keep.length) continue;                                 // nothing to drop, or the phrase is only fillers: leave it
                var before = ls[si], kept = [], carry = { lineBefore: false, breakBefore: false };
                for (k = 0; k < pw.length; k++) {
                    if (drop[k]) { carry.lineBefore = carry.lineBefore || pw[k].lineBefore; carry.breakBefore = carry.breakBefore || pw[k].breakBefore; continue; }
                    var w = pw[k]; if (carry.lineBefore) w.lineBefore = true; if (carry.breakBefore && kept.length) w.breakBefore = true;
                    carry = { lineBefore: false, breakBefore: false }; kept.push(w);
                }
                ls[si] = N.editorWords(kept); removed += n;
                changes.push({ phrase: si, before: before, after: ls[si] });
                if (!dry) {
                    var ws = commitPhrase(si), nw = [];
                    for (k = 0; k < keep.length; k++) nw.push(ws[keep[k]]);
                    st.data.segments[si].words = nw;
                }
            }
            if (!dry && removed) { st.history.push(snapshot); if (st.history.length > 30) st.history.shift(); st.text = ls.join("\n"); st.issues = []; st.pending = null; }
            return { removed: removed, changes: changes };
        }

        // ---------- readiness: what recognition needs on this computer ----------
        function sitePackages() {
            if (S.python) return null;                       // a custom Python: its packages are not inspected
            var win = Folder(root + "/.venv/Lib/site-packages");
            if (win.exists) return win;
            var lib = Folder(root + "/.venv/lib");
            if (lib.exists) { var subs = lib.getFiles("python*"); for (var i = 0; i < subs.length; i++) { var sp = Folder(subs[i].fsName + "/site-packages"); if (sp.exists) return sp; } }
            return null;
        }
        // "Allow Scripts to Write Files and Access Network": read the preference when AE exposes it; otherwise (or when it reads 0,
        // which an unknown key also returns) test by writing and deleting a small file.
        function scriptingPref() {
            var sections = ["Main Pref Section v2", "Main Pref Section"], i;
            for (i = 0; i < sections.length; i++) {
                try {
                    var v = typeof PREFType !== "undefined" ? app.preferences.getPrefAsLong(sections[i], "Pref_SCRIPTING_FILE_NETWORK_SECURITY", PREFType.PREF_Type_MACHINE_INDEPENDENT)
                        : app.preferences.getPrefAsLong(sections[i], "Pref_SCRIPTING_FILE_NETWORK_SECURITY");
                    if (v === 1) return true;
                } catch (e) {}
            }
            return null;
        }
        function canWriteFiles() {
            if (scriptingPref() === true) return true;
            try {
                var dir = Folder(Folder.temp.fsName + "/NOIR_Captions"); if (!dir.exists) dir.create();
                var f = File(dir.fsName + "/write_check.txt"); f.encoding = "UTF-8";
                if (!f.open("w")) return false;
                f.write("ok"); f.close(); try { f.remove(); } catch (e0) {}
                return true;
            } catch (e) { return false; }
        }
        function readiness() {
            var items = [], py = File(N.pythonPath(root, S.python)), sp = sitePackages(), i;
            var files = canWriteFiles();
            items.push({ id: "files", ok: files, title: "Доступ к файлам",
                hint: files ? "" : "After Effects → Edit → Preferences → Scripting & Expressions → включите «Allow Scripts to Write Files and Access Network», затем закройте и откройте панель." });
            var engine = py.exists && (S.python ? true : !!(sp && Folder(sp.fsName + "/faster_whisper").exists));
            items.push({ id: "engine", ok: engine, python: py.exists, title: "Движок распознавания", fix: engine ? null : "setup.engine", fixLabel: "Установить",
                hint: engine ? "" : py.exists ? "Python есть, faster-whisper не установлен." : "Ставится один раз (~1 ГБ). Нужен Python 3.11 или 3.12 — если его нет, установщик скажет." });
            var model = N.modelCached(S.model), info = null;
            for (i = 0; i < N.MODELS.length; i++) if (N.MODELS[i].id === S.model) info = N.MODELS[i];
            var size = info && /\(([^)]*)\)/.exec(info.label);
            items.push({ id: "model", ok: model, title: "Модель " + S.model, fix: model || !engine ? null : "setup.model", fixLabel: "Скачать",
                hint: model ? "" : engine ? "Скачивается один раз" + (size ? " (" + size[1] + ")" : "") + ". Аудио никуда не отправляется." : "Сначала установите движок." });
            var missing = [], sides = ["base", "accent"];
            for (i = 0; i < sides.length; i++) { var f0 = S.style[sides[i]].fonts[0]; if (N.fontInstalled(f0) === false && !N.hasItem(missing, f0)) missing.push(f0); }
            items.push({ id: "fonts", ok: !missing.length, optional: true, title: "Шрифты стиля",
                hint: missing.length ? "Не установлены: " + missing.join(", ") + ". Будет взят запасной шрифт. Свои шрифты: fonts/user + scripts/install_fonts.ps1." : "" });
            var cv = sp ? Folder(sp.fsName + "/cv2").exists : null;
            items.push({ id: "face", ok: cv !== false, optional: true, title: "Поиск лица (OpenCV)", hint: cv === false ? "Необязательно: нужен только для «убрать с лица». Ставится установщиком движка." : "" });
            return { ready: files && engine && model, windows: N.isWindows(), items: items };
        }
        // A visible console window runs the step (pip / download progress is shown there); the panel re-checks afterwards.
        function runConsole(name, title, command) {
            if (!N.isWindows()) throw new Error("Из панели это запускается только на Windows. Запустите вручную: " + command);
            var dir = Folder(Folder.temp.fsName + "/NOIR_Captions"); if (!dir.exists) dir.create();
            var f = File(dir.fsName + "/" + name + "_" + new Date().getTime() + ".cmd");
            f.encoding = "UTF-8"; f.lineFeed = "Unix";            // the \r\n below are written as they are
            if (!f.open("w")) throw new Error("Не удалось записать файл: включите доступ к файлам (Scripting & Expressions).");
            f.write("\r\n@echo off\r\nchcp 65001 >nul\r\ntitle NOIR Captions\r\ncd /d \"" + Folder(root).fsName + "\"\r\necho " + title + "\r\necho.\r\n" + command +
                "\r\necho.\r\necho Окно можно закрыть: панель NOIR сама проверит результат.\r\npause\r\n");
            f.close();
            if (!f.execute()) throw new Error("Не удалось открыть окно установки.");
            status(title + " — идёт в отдельном окне.");
            return f.fsName;
        }

        // ---------- SFX & tools ----------
        function sfxLib() { return N.sfxLibrary ? N.sfxLibrary(root, { mixBase: !!S.sfx.mixBase }) : { names: [], files: {}, cats: [] }; }
        function sfxChoice(id) { if (id === "auto" || id === "off" || id === "same") return { mode: id }; if (String(id).indexOf("cat:") === 0) return { mode: "cat", value: String(id).substring(4) }; return { mode: "off" }; }

        // ---------- the one entry point ----------
        var OPS = {
            meta: function () {
                function ids(list) { var o = []; for (var i = 0; i < list.length; i++) o.push({ id: list[i].id, label: list[i].label, abbr: list[i].abbr }); return o; }
                return { version: N.VERSION, models: ids(N.MODELS), languages: ids(N.LANGS), devices: ids(N.DEVICES), reveals: ids(N.REVEALS), layerModes: ids(N.LAYER_MODES),
                    animIn: ids(N.ANIM_IN), animOut: ids(N.ANIM_OUT), blends: ids(N.BLEND_MODES), scopes: ids(N.SCOPES), formats: N.FORMATS ? ids(N.FORMATS) : [],
                    counterSeps: N.COUNTER_SEPS ? ids(N.COUNTER_SEPS) : [], counterEases: N.COUNTER_EASES ? ids(N.COUNTER_EASES) : [] };
            },
            presets: function () {
                var out = [];
                for (var i = 0; i < presets.length; i++) {
                    var p = presets[i], missing = [], fs2 = [p.base.fonts[0], p.accent.fonts[0]];
                    for (var k = 0; k < fs2.length; k++) if (fs2[k] && N.fontInstalled(fs2[k]) === false && !N.hasItem(missing, fs2[k])) missing.push(fs2[k]);
                    out.push({ id: p.id, name: p.name, description: p.description || "", user: !!p.user, missing: missing, base: p.base, accent: p.accent, anim: p.anim, layout: p.layout });
                }
                return out;
            },
            "settings.set": function (a) {
                var kind = PATHS[a.path];
                if (kind === undefined) throw new Error("Эту настройку менять нельзя: " + a.path);
                var parts = String(a.path).split("."), obj = S;
                for (var i = 0; i < parts.length - 1; i++) { if (!obj[parts[i]] || typeof obj[parts[i]] !== "object") obj[parts[i]] = {}; obj = obj[parts[i]]; }
                var v = coerce(kind, a.value), last = parts[parts.length - 1];
                if (v === null && last === "accentPosY") delete obj[last]; else obj[last] = v;
                if (last === "color" && obj.glow) obj.glow.color = v;
                if (parts[0] === "style") S.presetId = "";
                saveSettings(S); return v;
            },
            "font.set": function (a) { coerce("side", a.side); if (!a.ps) throw new Error("Нет шрифта."); setFont(a.side, String(a.ps)); S.presetId = ""; saveSettings(S); return S.style[a.side].fonts; },
            "font.glow": function (a) { coerce("side", a.side); var t = S.style[a.side]; t.glow = a.on ? { color: t.color, opacity: 85, softness: Number(a.softness) || 30 } : null; S.presetId = ""; saveSettings(S); return t.glow; },
            "font.fromLayer": function (a) {
                coerce("side", a.side);
                var comp = activeComp(), l = comp.selectedLayers.length ? comp.selectedLayers[0] : null;
                if (!(l instanceof TextLayer)) throw new Error("Выделите текстовый слой.");
                var d = l.property("Source Text").value, t = S.style[a.side];
                setFont(a.side, d.font); t.size = Math.round(d.fontSize * N.REF_WIDTH / comp.width); t.tracking = d.tracking;
                if (d.applyFill) t.color = d.fillColor;
                t.strokeWidth = d.applyStroke ? Math.round(d.strokeWidth * N.REF_WIDTH / comp.width) : 0;
                if (d.applyStroke) t.strokeColor = d.strokeColor;
                S.presetId = ""; saveSettings(S); status("Взято со слоя: " + d.font); return t;
            },
            fonts: function (a) { return N.fontFamilies(a.query, a.limit); },
            "preset.choose": function (a) { var p = presetById(a.id); if (!p) throw new Error("Нет такого стиля."); choosePreset(p); status("Стиль: " + p.name); return S.presetId; },
            "preset.favorite": function (a) {
                if (N.hasItem(S.favoriteStyles, a.id)) { var kept = []; for (var i = 0; i < S.favoriteStyles.length; i++) if (S.favoriteStyles[i] !== a.id) kept.push(S.favoriteStyles[i]); S.favoriteStyles = kept; }
                else S.favoriteStyles.push(a.id);
                saveSettings(S); return S.favoriteStyles;
            },
            "preset.save": function (a) {
                var name = String(a.name || "").replace(/^\s+|\s+$/g, "");
                if (!name) throw new Error("Введите название стиля.");
                var id = "user-" + (name.toLowerCase().replace(/[^a-z0-9а-яё]+/g, "-").replace(/^-+|-+$/g, "") || new Date().getTime());
                var p = { schema: "noir-style/1", id: id, name: name, description: "Свой стиль", layout: S.style.layout, base: S.style.base, accent: S.style.accent, anim: S.style.anim };
                var dir = N.userPresetFolder(); if (!dir.exists) dir.create();
                N.writeText(File(dir.fsName + "/" + id + ".json"), N.stringify(p));
                presets = N.loadPresets(root); S.presetId = id; saveSettings(S); status("Стиль сохранён: " + name); return id;
            },
            "preset.export": function (a) {
                var p = a.id ? presetById(a.id) : null, data = p || { schema: "noir-style/1", id: "custom", name: "Свой стиль", layout: S.style.layout, base: S.style.base, accent: S.style.accent, anim: S.style.anim };
                var f = a.path ? File(a.path) : File.saveDialog("Экспорт стиля NOIR", "*.json");
                if (!f) return null;
                var copy = clone(data); delete copy.user;
                N.writeText(f, N.stringify(copy)); status("Стиль сохранён в файл: " + f.fsName); return f.fsName;
            },
            "preset.import": function (a) {
                var f = a.path ? File(a.path) : File.openDialog("Импорт стиля NOIR (JSON)", "*.json");
                if (!f) return null;
                var p = N.parseJSON(N.readText(f));
                if (!N.isPreset(p)) throw new Error("Это не стиль NOIR (нужны schema, layout, base, accent, anim).");
                p.id = "user-" + String(p.id || "import").replace(/[^a-z0-9\-]/gi, "-").replace(/^user-/, "");
                var dir = N.userPresetFolder(); if (!dir.exists) dir.create();
                N.writeText(File(dir.fsName + "/" + p.id + ".json"), N.stringify(p));
                presets = N.loadPresets(root); status("Стиль добавлен: " + p.name); return p.id;
            },
            recognize: function () {
                var src = N.getAudioSource();
                if (!N.modelCached(S.model)) throw new Error("Модель " + S.model + " ещё не скачана. Нажмите «Скачать модель» на вкладке «Текст» (один раз; аудио никуда не отправляется).");
                if (st.recognizing) throw new Error("Распознавание уже идёт.");
                st.recognizing = true; st.progress = 0; status("Запуск распознавания…", 0);
                try {
                N.startRecognition(src, { root: root, python: S.python, model: S.model, language: S.language, device: S.device, prompt: S.prompt }, {
                    onStatus: function (s) { var m = s.message || s.state; if (s.device) m += " · " + (s.device === "cuda" ? "GPU" : "CPU"); st.recognizing = true; status(m, s.progress); },
                    onDone: function (data, s) { st.recognizing = false; setData(data, s.link); },
                    onError: function (msg) { st.recognizing = false; status("Ошибка распознавания: " + msg, 0); log("error", msg); }
                });
                } catch (e) { st.recognizing = false; status("Ошибка распознавания: " + (e.message || e), 0); throw e; }
                return true;
            },
            "setup.check": function () { return readiness(); },
            "setup.engine": function () {
                var ps = File(root + "/recognition/setup_windows.ps1");
                if (!ps.exists) throw new Error("Нет файла recognition/setup_windows.ps1 — обновите папку проекта.");
                return runConsole("setup", "Установка движка распознавания NOIR (один раз, ~1 ГБ)", 'powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps.fsName + '"');
            },
            "setup.model": function (a) {
                var id = a.model || S.model; if (!inList(N.MODELS, id)) throw new Error("Нет такой модели.");
                var py = File(N.pythonPath(root, S.python)), script = File(root + "/recognition/download_model.py");
                if (!py.exists) throw new Error("Сначала установите движок распознавания.");
                return runConsole("model", "Скачивание модели " + id + " (один раз)", '"' + py.fsName + '" "' + script.fsName + '" ' + id);
            },
            cancel: function () { N.cancelRecognition(); st.recognizing = false; status("Распознавание отменено.", 0); return true; },
            "json.load": function (a) {
                var f = a.path ? File(a.path) : File.openDialog("Открыть результат NOIR (JSON)", "*.json");
                if (!f) return null;
                var data = N.parseJSON(N.readText(f));
                if (data.schema !== "noir-captions/1") throw new Error("Это не файл NOIR CAPTIONS.");
                var link = null; try { link = N.getAudioSource().link; } catch (e) {}
                if (!link && data.link) link = data.link;
                setData(data, link);
                if (!link) status(st.status + " Аудиослой не выделен: время JSON = время композиции.");
                return true;
            },
            "json.save": function (a) {
                if (!st.data) throw new Error("Нет результата распознавания.");
                var f = a.path ? File(a.path) : File.saveDialog("Сохранить результат NOIR", "*.json");
                if (!f) return null;
                var words = N.applyEdits(st.data, st.text, []), out = clone(st.data), i, s2;
                for (s2 = 0; s2 < out.segments.length; s2++) out.segments[s2].words = [];
                for (i = 0; i < words.length; i++) out.segments[words[i].seg].words.push({ text: words[i].text, start: words[i].start, end: words[i].end, conf: words[i].conf,
                    accent: words[i].accent || undefined, invert: words[i].invert || undefined, lineBefore: words[i].lineBefore || undefined, breakBefore: words[i].breakBefore || undefined });
                out.noirSourceKey = sourceKey(); out.link = st.link;
                N.writeText(f, N.stringify(out)); status("Сохранено: " + f.fsName); return f.fsName;
            },
            "subs.export": function (a) {
                if (!st.data) throw new Error("Нет текста.");
                var fmt = a.format === "vtt" ? "vtt" : "srt", comp = null;
                try { comp = activeComp(); } catch (e) {}
                var words = N.applyEdits(st.data, st.text, []), L = S.style.layout;
                var groups = N.groupWords(words, { maxWords: L.maxWords, maxChars: L.maxChars, pauseBreak: L.pauseBreak, punctBreak: L.punctBreak, stripPunct: false });
                N.timeGroups(groups, L.holdGap, 0.08);
                var map = comp ? resolveLink(comp) : { startTime: 0, stretch: 100 }, cues = [];
                for (var i = 0; i < groups.length; i++) cues.push({ start: N.sourceToComp(groups[i].start, map.startTime, map.stretch), end: N.sourceToComp(groups[i].outTime, map.startTime, map.stretch), text: groups[i].text });
                var text = fmt === "vtt" ? N.toVtt(cues) : N.toSrt(cues);
                var f = a.path ? File(a.path) : File.saveDialog("Экспорт субтитров", fmt === "vtt" ? "*.vtt" : "*.srt");
                if (!f) return null;
                N.writeText(f, text); status("Экспортировано фраз: " + cues.length + " → " + f.fsName); return f.fsName;
            },
            "subs.import": function (a) {
                var f = a.path ? File(a.path) : File.openDialog("Импорт субтитров (SRT / VTT)", "*.srt;*.vtt");
                if (!f) return null;
                var data = N.fromSubtitles(N.readText(f));
                if (!data.segments.length) throw new Error("В файле нет субтитров.");
                setData(data, null); status("Импортировано фраз: " + data.segments.length + ". Время файла = время композиции; тайминг слов разложен по длине слов."); return data.segments.length;
            },
            "text.set": function (a) { if (!st.data) throw new Error("Нет текста."); var t = String(a.text); if (t !== st.text) { st.text = t; st.issues = []; st.pending = null; } return true; },
            "text.reset": function () { if (st.data) { remember(); st.text = N.toEditorText(st.data); } return true; },
            "text.undo": function () {
                if (!st.history.length) throw new Error("Нет правок кнопками для отмены. В поле текста используйте Ctrl+Z.");
                var h = st.history.pop();
                if (typeof h === "string") st.text = h;
                else if (h.data) { st.text = h.text; st.data = h.data; st.timing = h.timingAll; }
                else { st.text = h.text; st.data.segments[h.si].words = h.words; if (h.timing) st.timing[h.si] = true; else delete st.timing[h.si]; }
                status("Правка отменена."); return true;
            },
            "phrase.select": function (a) {
                var i = Number(a.index);
                if (!st.data || i < 0 || i >= st.data.segments.length || i !== Math.floor(i)) throw new Error("Нет такой фразы.");
                st.phrase = i; if (a.seek) seek(i); return i;
            },
            "phrase.seek": function () { seek(st.phrase); return true; },
            // Whole text from the assistant (translation, corrections, emoji): one undo step. Lines must stay one per phrase.
            "text.replace": function (a) {
                if (!st.data) throw new Error("Нет текста.");
                var t = String(a.text || "").replace(/\r\n?/g, "\n"), warnings = [];
                N.applyEdits(st.data, t, warnings);                 // throws if the number of lines changed
                if (t === st.text) { status("Текст не изменился."); return { changed: 0, warnings: [] }; }
                remember(); st.text = t; st.issues = []; st.pending = null;
                status("Текст изменён" + (a.why ? ": " + String(a.why).substr(0, 80) : "") + ". Отмена — «Отменить правку»." + (warnings.length ? " Число слов изменилось в " + warnings.length + " " + (warnings.length === 1 ? "фразе" : "фразах") + ": тайминги там распределены по длине слов." : ""));
                return { changed: 1, warnings: warnings };
            },
            // Filler words out, every other word keeps its exact timing. dry: only report what would change.
            "text.fillers": function (a) {
                if (!st.data) throw new Error("Нет текста.");
                var r = fillers(a.words, !!a.dry);
                if (!a.dry) status(r.removed ? "Убрано слов-паразитов: " + r.removed + ". Тайминги остальных слов не изменились." : "Слов-паразитов не найдено.");
                return r;
            },
            "word.seek": function (a) { seek(st.phrase, Number(a.index) || 0); return true; },
            // Word timing of the selected phrase, in seconds of the source (as state().words show it). Neighbours give way so that
            // words stay in order and at least 40 ms long. One undo step per edit (text.undo).
            "word.time": function (a) {
                if (!st.data) throw new Error("Нет текста.");
                var si = st.phrase, before = clone(st.data.segments[si].words), ws = commitPhrase(si), i = Number(a.index), w = ws[i], MIN = 0.04;
                if (!w) throw new Error("Нет такого слова.");
                var s = a.start === undefined ? w.start : Number(a.start), e = a.end === undefined ? w.end : Number(a.end);
                if (!isFinite(s) || !isFinite(e)) throw new Error("Время — число секунд.");
                var lo = i > 0 ? ws[i - 1].start + MIN : 0, hi = i + 1 < ws.length ? ws[i + 1].end - MIN : Math.max(e, w.end) + 30;
                s = Math.max(lo, Math.min(s, hi - MIN)); e = Math.max(s + MIN, Math.min(e, hi));
                st.history.push({ text: st.text, si: si, words: before, timing: !!st.timing[si] }); if (st.history.length > 30) st.history.shift();
                w.start = Math.round(s * 1000) / 1000; w.end = Math.round(e * 1000) / 1000;
                if (i > 0 && ws[i - 1].end > w.start) ws[i - 1].end = w.start;
                if (i + 1 < ws.length && ws[i + 1].start < w.end) ws[i + 1].start = w.end;
                st.timing[si] = true; st.issues = []; st.pending = null;
                status("«" + w.text + "»: " + w.start.toFixed(2) + "–" + w.end.toFixed(2) + " с. Обновите фразу, чтобы применить.");
                return { start: w.start, end: w.end };
            },
            // Word edit by selection in the editor text: kind accent | line | phrase; start/end — character offsets.
            "word.edit": function (a) {
                if (!st.data || a.text !== st.text) throw new Error("Текст изменился. Выделите слово ещё раз.");
                if (a.kind !== "accent" && a.kind !== "line" && a.kind !== "phrase") throw new Error("Неизвестная правка слова.");
                var start = Number(a.start), end = Number(a.end), text = st.text;
                if (!isFinite(start) || !isFinite(end) || start < 0 || end > text.length || end < start) throw new Error("Выделите слово в тексте.");
                var si = text.substring(0, start).split("\n").length - 1, ls = text.split("\n");
                var offset = text.substring(0, start).lastIndexOf("\n") + 1, line = ls[si];
                if (end > offset + line.length) throw new Error("Выделите слова внутри одной фразы.");
                var ws = N.parseLine(line), re = /\S+/g, match, index = 0, chosen = [];
                while ((match = re.exec(line)) !== null) {
                    if (!N.parseLine(match[0]).length) continue;
                    if (match.index + match[0].length > start - offset && match.index < Math.max(end - offset, start - offset + 1)) chosen.push(index);
                    index++;
                }
                if (!chosen.length) throw new Error("Выделите слово в тексте.");
                remember();
                var flag = !ws[chosen[0]].accent;
                if (a.kind === "accent") for (var wi = 0; wi < chosen.length; wi++) ws[chosen[wi]].accent = flag;
                else if (a.kind === "line") ws[chosen[0]].lineBefore = !ws[chosen[0]].lineBefore;
                else ws[chosen[0]].breakBefore = !ws[chosen[0]].breakBefore;
                ls[si] = N.editorWords(ws); st.text = ls.join("\n"); st.phrase = si; st.issues = []; st.pending = null;
                status("Правка сохранена. Тайминги слов сохранены."); return true;
            },
            // Replace one word of the selected phrase (its timing is kept).
            "word.replace": function (a) {
                var ws = phraseWords(), w = ws[Number(a.index)], t = String(a.text || "").replace(/^\s+|\s+$/g, "");
                if (!w) throw new Error("Нет такого слова.");
                if (!t || /[\s*~|↵]/.test(t)) throw new Error("Одно слово без разметки.");
                remember(); w.text = t; var ls = lines(); ls[st.phrase] = N.editorWords(ws); st.text = ls.join("\n");
                status("Слово исправлено; тайминг сохранён."); return true;
            },
            listen: function () {
                var ws = phraseWords();
                if (!ws.length) throw new Error("Нет слов для прослушивания.");
                if (!st.data.source || !st.data.source.file) throw new Error("В JSON нет пути к аудио. Распознайте исходный слой ещё раз.");
                N.previewAudio(root, S.python, st.data.source.file, ws[0].start, ws[ws.length - 1].end);
                status("Фраза готовится к воспроизведению во внешнем проигрывателе."); return true;
            },
            generate: function (a) { return generate(a.mode || "all", !!a.accept); },
            run: function (a) { return run(a.command || a); },
            "layers.apply": function (a) {
                coerce("side", a.side);
                var parts = a.parts || {}, any = parts.font || parts.size || parts.color || parts.stroke || parts.fx || parts.blend;
                if (!any && !a.anim) throw new Error("Отметьте, что применять: шрифт, размер, цвет, обводку, эффекты и/или анимацию.");
                return restyle(a.side, any ? parts : false, !!a.anim, "применить к слоям", a.all ? scopeLayers("all") : null);
            },
            "layers.invert": function () {
                var comp = activeComp(), il = [];
                for (var i = 0; i < comp.selectedLayers.length; i++) if (isGraphicLayer(comp.selectedLayers[i])) il.push(comp.selectedLayers[i]);
                if (!il.length) throw new Error("Выделите текстовые слои, SVG, картинки или фигуры.");
                return undo("инверсия", function () { var on = N.toggleInvert(il); status((on ? "Инверсия включена" : "Инверсия выключена") + ": слоёв " + il.length); return on; });
            },
            "layers.reflow": function () {
                var sel = selectedText();
                return undo("перекласть фразу", function () { var rr = N.reflowGroups(sel.comp, sel.layers, S.style.layout); status(rr.groups ? "Переложено фраз: " + rr.groups : "Нет слоёв NOIR с известной фразой."); return rr.groups; });
            },
            "sfx.list": function () { var lib = sfxLib(), out = []; for (var i = 0; i < lib.names.length; i++) out.push(lib.names[i]); return { names: out, cats: lib.cats || [], files: lib.files || {} }; },
            "sfx.selected": function () {
                var sel = selectedText();
                return undo("озвучить выделенные", function () {
                    var lib = sfxLib(), plan = N.planSfx(N.sfxEventsFromLayers(sel.layers, S.style.anim), lib, { appear: sfxChoice(S.sfx.appear), accent: sfxChoice(S.sfx.accent), exit: sfxChoice(S.sfx.exit), db: S.sfx.db, dbRand: S.sfx.dbRand, minGap: S.sfx.minGap });
                    var r = N.placeSfx(sel.comp, plan); status("Звуков добавлено: " + r.placed + (lib.names.length ? "" : ". Библиотека звуков пуста.")); return r.placed;
                });
            },
            "sfx.here": function () {
                var comp = activeComp();
                if (!S.sfx.file) throw new Error("Выберите звук в списке.");
                return undo("звук в текущее время", function () { var r = N.placeSfx(comp, [{ t: comp.time, file: S.sfx.file, cat: "manual", db: S.sfx.db }]); status(r.placed ? "Звук добавлен в " + comp.time.toFixed(2) + " с" : r.warnings.join("\n")); return r.placed; });
            },
            "sfx.remove": function () { var comp = activeComp(); return undo("убрать звуки", function () { var n = N.removeSfx(comp); status("Убрано звуков: " + n); return n; }); },
            "sfx.folder": function () { var f = Folder(Folder.userData.fsName + "/NOIR Captions/sfx"); if (!f.exists) f.create(); f.execute(); return f.fsName; },
            "tool.counter": function () {
                var comp = activeComp();
                return undo("счётчик", function () {
                    var o = clone(S.tools.counter); o.start = comp.time;
                    var r = N.createCounter(comp, o, S.style, S.style.anim), msg = "Счётчик: " + r.start.toFixed(2) + "…" + r.end.toFixed(2) + " с";
                    if (S.tools.counter.sound && N.pickSfx) {
                        var pick = N.pickSfx(sfxLib(), { mode: "cat", value: "counter" }, "", "in", {});
                        if (pick && pick.cat === "counter") msg += N.placeSfx(comp, [{ t: r.start, file: pick.file, cat: "counter", db: S.sfx.db }]).placed ? ", звук добавлен" : "";
                    }
                    status(msg); return msg;
                });
            },
            "tool.strike": function () { var sel = selectedText(); return undo("зачёркивание", function () { var r = N.strikeLayers(sel.comp, sel.layers, S.tools.strike, S.style.anim); status("Зачёркнуто слоёв: " + r.made.length); return r.made.length; }); },
            "tool.strikeRemove": function () { var comp = activeComp(); return undo("убрать зачёркивания", function () { var n = N.removeByTag(comp, N.STRIKE_TAG); status("Убрано зачёркиваний: " + n); return n; }); },
            "tool.mask": function () {
                var comp = activeComp(), sel = comp.selectedLayers, texts = [], source = null, i;
                for (i = 0; i < sel.length; i++) { if (sel[i] instanceof TextLayer) texts.push(sel[i]); else if (!source) source = sel[i]; }
                if (!texts.length) throw new Error("Выделите текстовые слои (и для «видео внутри букв» ещё видео/фото слой).");
                return undo("маска по тексту", function () { var o = clone(S.tools.mask); o.color = S.style.base.color; var r = N.maskTextLayers(comp, texts, source, o); status("Масок создано: " + r.made.length); return r.made.length; });
            },
            "tool.maskRemove": function () { var comp = activeComp(); return undo("убрать маски", function () { var n = N.removeMasks(comp); status("Убрано масок: " + n); return n; }); },
            // Fixes what can be fixed safely (position / width / size inside the safe area, a missing font → the first installed
            // one of the style's list) and re-checks. Reading speed and very long words need a person.
            "issues.fix": function () {
                if (!st.data) throw new Error("Нет текста.");
                var comp = activeComp(), words = N.applyEdits(st.data, st.text, []), out = renderStyle(), groups = buildGroups(words, out, comp).groups;
                var before = N.checkCaptions(groups, out, comp), done = [], i, codes = {};
                for (i = 0; i < before.length; i++) codes[before[i].code + (before[i].target ? ":" + before[i].target : "")] = true;
                if (codes.safe_area) {
                    var plan = N.safeAreaPlan(groups, out, comp);
                    S.quick.position = "preset"; S.style.layout.posY = plan.posY; S.style.layout.posX = plan.posX; S.style.layout.safeWidth = plan.safeWidth;
                    if (plan.scale < 1) S.quick.size = Math.max(25, Math.floor(Number(S.quick.size || 100) * plan.scale));
                    done.push("положение " + Math.round(plan.posY) + "% высоты" + (plan.scale < 1 ? ", размер " + S.quick.size + "%" : ""));
                }
                var sides = ["base", "accent"];
                for (i = 0; i < sides.length; i++) {
                    if (!codes["font:" + sides[i]]) continue;
                    var list = S.style[sides[i]].fonts, ok = null;
                    for (var f = 1; f < list.length && !ok; f++) if (N.fontInstalled(list[f]) === true) ok = list[f];
                    if (ok) { setFont(sides[i], ok); done.push((sides[i] === "base" ? "шрифт слов" : "шрифт акцентов") + " → " + ok); }
                }
                if (done.length) { S.presetId = ""; saveSettings(S); }
                var out2 = renderStyle(), after = N.checkCaptions(buildGroups(words, out2, comp).groups, out2, comp);
                st.issues = after; st.pending = null;
                status((done.length ? "Исправлено: " + done.join("; ") + "." : "Автоматически исправить нечего.") + (after.length ? " Осталось замечаний: " + after.length + " — их нужно поправить вручную." : " Замечаний больше нет."));
                return { fixed: done, left: after };
            },
            "layers.select": function (a) {
                var r = selectTarget(String(a.target || "captions"));
                status(r.n ? "Выделено: " + r.what + (r.n > 1 ? " (" + r.n + ")" : "") : "Выделение снято."); return r.n;
            },
            "mask.add": function (a) {
                var comp = activeComp(), targets = [], sel = comp.selectedLayers, i;
                for (i = 0; i < sel.length; i++) if (!(sel[i] instanceof TextLayer) && !sel[i].nullLayer) targets.push(sel[i]);
                if (!targets.length) { var v = videoLayer(comp); if (v) targets.push(v); }
                if (!targets.length) throw new Error("Выделите слой для маски (видео, фото, фигуру).");
                return undo("маска", function () {
                    for (var k = 0; k < targets.length; k++) addMask(targets[k], a);
                    status("Маска " + (a.shape === "ellipse" ? "овалом" : "прямоугольником") + (a.invert ? ", инвертирована" : "") + ": слоёв " + targets.length + " («" + targets[0].name + "»). Двигать — в AE, инструментом выделения.");
                    return targets.length;
                });
            },
            // Roto Brush cannot be driven by scripts: the panel prepares everything around it.
            "roto.prepare": function () {
                var comp = activeComp(), i, person = null, top = null;
                for (i = 1; i <= comp.numLayers; i++) { var l = comp.layer(i); if (String(l.comment || "") === N.PERSON_TAG) person = l; if (!top && l instanceof TextLayer && N.isGenerated(l)) top = l; }
                return undo("копия видео для Roto Brush", function () {
                    if (!person) {
                        var v = videoLayer(comp);
                        if (!v) throw new Error("Не нашёл слой видео: выделите его в таймлайне.");
                        person = v.duplicate(); person.name = "NOIR · Человек (Roto Brush)"; person.comment = N.PERSON_TAG; person.label = 11;
                    }
                    if (top && person.index > top.index) person.moveBefore(top);
                    selectOnly(comp, [person]);
                    try { person.openInViewer(); } catch (e) {}
                    status("Копия видео «" + person.name + "» над субтитрами открыта в окне слоя. Возьмите Roto Brush (Alt+W), обведите человека, нажмите Freeze — текст окажется за человеком. Обводить кистью скрипты в AE не умеют, это один ручной шаг.");
                    return person.name;
                });
            },
            "control.add": function (a) {
                var sel = scopeLayers(a.scope);
                return undo("пульт NOIR Control", function () {
                    var c = N.addControl(sel.comp, S.style.anim.highlightColor || S.style.accent.color), r = N.linkControl(sel.comp, sel.layers);
                    status((c.made ? "Пульт «NOIR Control» добавлен" : "Пульт «NOIR Control» обновлён") + ": субтитров подключено " + r.linked + ". Меняйте слайдеры слоя NOIR Control в Effect Controls.");
                    return r.linked;
                });
            },
            "control.remove": function () {
                var comp = activeComp();
                if (!N.findControl(comp)) throw new Error("В этой композиции нет пульта NOIR Control.");
                return undo("убрать пульт", function () { var r = N.unlinkControl(comp); status("Пульт убран, субтитры отвязаны: " + r.unlinked + "."); return r.unlinked; });
            },
            "safe.guides": function (a) { var comp = activeComp(); return undo("безопасные зоны", function () { var r = N.safeGuides(comp, a.format || S.format, !!a.remove); status(r.removed ? "Направляющие убраны." : "Направляющие безопасной зоны: " + r.name); return r; }); },
            "previews.remove": function () {
                var count = 0;
                return undo("удалить старые превью", function () {
                    for (var i = app.project.numItems; i >= 1; i--) {
                        var item = app.project.item(i), name = String(item.name || "");
                        if (item instanceof CompItem && (!item.usedIn || !item.usedIn.length) && (name.indexOf("NOIR Preview · ") === 0 || name === "NOIR · Галерея стилей")) { item.remove(); count++; }
                    }
                    status("Удалено превью: " + count); return count;
                });
            },
            // What the radial panel needs to choose its sectors: cheap, no layer walking beyond the selection.
            selection: function () {
                var comp = null; try { comp = app.project.activeItem; } catch (e) {}
                if (!(comp instanceof CompItem)) return { comp: false, text: 0, noir: 0, other: 0 };
                var sel = comp.selectedLayers, t = 0, n = 0, o = 0;
                for (var i = 0; i < sel.length; i++) { if (sel[i] instanceof TextLayer) { t++; if (N.isGenerated(sel[i])) n++; } else o++; }
                return { comp: true, text: t, noir: n, other: o, name: comp.name };
            },
            context: function () {
                var comp = null, out = { hasData: !!st.data };
                try { comp = app.project.activeItem; } catch (e0) {}
                if (comp instanceof CompItem) {
                    out.comp = { name: comp.name, width: comp.width, height: comp.height, duration: Math.round(comp.duration * 100) / 100, time: Math.round(comp.time * 100) / 100 };
                    var key = sourceKey(), base = [], acc = [], n = 0, i, sel = 0;
                    for (i = 1; i <= comp.numLayers; i++) {
                        var l = comp.layer(i);
                        if (l.selected) sel++;
                        if (l instanceof TextLayer && N.isGenerated(l) && (!key || N.layerSource(l) === key)) { n++; (l.label === 11 ? acc : base).push(Math.round(N.baseOf(l)[1] / comp.height * 100)); }
                    }
                    var avg = function (a) { var t = 0; for (var k = 0; k < a.length; k++) t += a[k]; return a.length ? Math.round(t / a.length) : null; };
                    out.subtitles = { count: n, accentCount: acc.length, wordsCenterYPercent: avg(base), accentsCenterYPercent: avg(acc) };
                    out.selectedLayers = sel;
                }
                var s = S.style;
                out.style = { preset: S.presetId, baseFont: s.base.fonts[0], baseSize: s.base.size, accentFont: s.accent.fonts[0], accentSize: s.accent.size, posYPercent: s.layout.posY,
                    accentYPercent: s.layout.accentPosY, reveal: s.layout.reveal, layerMode: s.layout.layerMode, animIn: s.anim.animIn, animOut: s.anim.animOut };
                out.presets = [];
                for (var pi = 0; pi < presets.length && pi < 60; pi++) out.presets.push({ id: presets[pi].id, name: presets[pi].name });
                out.face = st.face ? { x: Math.round(st.face.x * 100) / 100, y: Math.round(st.face.y * 100) / 100, w: Math.round(st.face.w * 100) / 100, h: Math.round(st.face.h * 100) / 100 } : null;
                if (st.data) { var ws = N.applyEdits(st.data, st.text, []), sample = []; for (var wi = 0; wi < ws.length && wi < 80; wi++) sample.push(ws[wi].text); out.textSample = sample.join(" "); }
                return out;
            },
            status: function () { return st.status; },
            log: function () { return st.log.slice(-50); },
            poll: function () { return true; },
            state: function () { return true; }
        };

        function canUpdate() {
            if (!st.data) return false;
            var comp = null; try { comp = app.project.activeItem; } catch (e) {}
            if (!(comp instanceof CompItem)) return false;
            var key = sourceKey();
            for (var i = 1; i <= comp.numLayers; i++) { var info = N.groupInfo(comp.layer(i)); if (info && info.sourceKey === key) return true; }
            return false;
        }
        function sourceName() {
            if (!st.data) return "";
            if (st.link && st.link.layerName) return String(st.link.layerName);
            var f = st.data.source && st.data.source.file ? String(st.data.source.file) : "";
            return f ? f.replace(/^.*[\\\/]/, "") : "";
        }
        function hasControl() { try { var c = app.project.activeItem; return c instanceof CompItem && !!N.findControl(c); } catch (e) { return false; } }
        function state() {
            var ls = lines(), phrases = [], words = [], i;
            if (st.data) for (i = 0; i < st.data.segments.length; i++) phrases.push(String(i + 1) + " · " + (ls[i] || "").substr(0, 48));
            try { var pw = phraseWords(); for (i = 0; i < pw.length; i++) words.push({ text: pw[i].text, accent: !!pw[i].accent, low: pw[i].conf !== undefined && pw[i].conf < 0.65,
                start: Math.round(pw[i].start * 1000) / 1000, end: Math.round(pw[i].end * 1000) / 1000 }); } catch (e) {}
            return { version: N.VERSION, status: st.status, progress: st.progress, recognizing: st.recognizing, scanning: st.scanning,
                hasData: !!st.data, dataRevision: st.dataRevision, text: st.text, dirty: dirty(), phraseDirty: !!st.data && (ls[st.phrase] !== st.cleanLines[st.phrase] || !!st.timing[st.phrase]),
                phrase: st.phrase, phrases: phrases, words: words, canUpdate: canUpdate(), completed: st.completed, issues: st.issues, pending: !!st.pending,
                settings: S, face: st.face, historyLength: st.history.length, control: hasControl(), source: sourceName() };
        }

        return {
            call: function (op, args) {
                var fn = OPS[op];
                if (!fn) throw new Error("Неизвестная операция: " + op);
                try { return fn(args || {}); }
                catch (e) { log("warn", op + ": " + (e.message || e)); throw e; }
            },
            state: state,
            settings: function () { return S; },
            log: log
        };
    };
})(NOIR);
