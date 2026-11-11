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
    N.VERSION = "0.49.0";

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
        format: "auto", memoryLearn: true, assistantScripts: false, speakers: false,
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

    // Fonts (Font API: AE 24.0+). Returns families matching a query, at most limit.
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
        "nudgeStep": [1, 2000], "sizeStep": [1, 100], "timeStep": [0.01, 30], "format": "format", "python": "text", "onboarded": "bool", "memoryLearn": "bool", "assistantScripts": "bool", "speakers": "bool", "style.layout.speaker2Color": "color",
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
        var st = { data: null, link: null, cutMap: null, text: "", cleanLines: [], history: [], timing: {}, phrase: 0, recognizing: false, scanning: false, progress: 0,
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
            if (st.forceComp) return st.forceComp;          // batch: the comp being processed
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) throw new Error("Откройте композицию.");
            return comp;
        }
        // AE has no nested undo groups (a nested begin/end gives «Undo group mismatch» and breaks Ctrl+Z): only the outermost call opens one.
        var undoDepth = 0;
        function undoBegin(name) { if (undoDepth === 0) app.beginUndoGroup("NOIR Captions: " + name); undoDepth += 1; }
        function undoEnd() { if (undoDepth <= 0) return; undoDepth -= 1; if (undoDepth === 0) app.endUndoGroup(); }
        function undo(name, fn) {
            undoBegin(name);
            try { return fn(); } finally { undoEnd(); }
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
            st.dataRevision++; st.history = []; st.timing = {}; st.cutMap = null; st.data = data; st.link = link; st.phrase = 0; st.issues = []; st.pending = null;
            st.text = N.toEditorText(data); st.cleanLines = st.text.split("\n"); st.rawLines = st.text.split("\n");
            var n = 0;
            for (var i = 0; i < data.segments.length; i++) n += data.segments[i].words.length;
            var gpu = "";
            for (var w = 0; w < (data.warnings || []).length; w++) if (data.warnings[w].code === "gpu_failed") gpu = " GPU не сработала — распознано на CPU.";
            for (w = 0; w < (data.warnings || []).length; w++) if (data.warnings[w].code === "one_speaker") gpu += " Второй голос не найден — все фразы одного цвета.";
            if (data.speakers && data.speakers.speakers === 2) gpu += " Голосов: 2 — фразы второго своим цветом.";
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
                    if (j === 0 && st.data && st.data.segments[g.seg] && st.data.segments[g.seg].speaker !== undefined) g.speaker = st.data.segments[g.seg].speaker;
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
            if (mode === "all" || mode === "phrase") { try { learnFromText(); } catch (eL) { log("error", "memory: " + (eL.message || eL)); } }
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
            undoBegin("создать субтитры");
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
            } finally { undoEnd(); }
        }

        // ---------- face ----------
        function faceScan(avoid) {
            if (st.scanning) throw new Error("Поиск лица уже идёт.");
            var comp = activeComp();
            if (!st.data || !st.data.source || !st.data.source.file) throw new Error("Нужен распознанный или загруженный текст с путём к видео. Распознайте слой ещё раз.");
            var srcTime = Math.max(0, compToSrc(comp, comp.time));
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

        // ---------- cutting by speech ----------
        // After a cut the words live on the new comp timeline (link = null) and st.cutMap maps every piece back to the source file
        // (for listening and the face search): [{c0, c1, s0, f}] — source = s0 + (t − c0)·f.
        N.CUT_TAG = "noir-captions:cut";
        function compToSrc(comp, t) {
            if (st.cutMap) {
                for (var i = 0; i < st.cutMap.length; i++) { var p = st.cutMap[i]; if (t >= p.c0 - 1e-6 && t <= p.c1 + 1e-6) return p.s0 + (t - p.c0) * p.f; }
                var last = st.cutMap[st.cutMap.length - 1]; return last ? last.s0 + (t - last.c0) * last.f : t;
            }
            var m = resolveLink(comp); return N.compToSource(t, m.startTime, m.stretch);
        }
        function srcRate(comp, t) {
            if (st.cutMap) { for (var i = 0; i < st.cutMap.length; i++) if (t >= st.cutMap[i].c0 - 1e-6 && t <= st.cutMap[i].c1 + 1e-6) return st.cutMap[i].f; return 1; }
            return 100 / resolveLink(comp).stretch;
        }
        // Layers to cut: selected footage layers; else the recognized layer; else the pieces of a previous cut.
        function cutTargets(comp) {
            var out = [], sel = comp.selectedLayers, i, l;
            for (i = 0; i < sel.length; i++) if (!(sel[i] instanceof TextLayer) && !N.isGenerated(sel[i]) && !sel[i].nullLayer && String(sel[i].comment || "").indexOf("noir-captions:control") !== 0) out.push(sel[i]);
            if (out.length) return out;
            var src = sourceLayer(comp); if (src) return [src];
            for (i = 1; i <= comp.numLayers; i++) { l = comp.layer(i); if (String(l.comment || "") === N.CUT_TAG) out.push(l); }
            if (!out.length) throw new Error("Выделите слой видео (или звука), который нужно нарезать.");
            return out;
        }
        function num(v, d, lo, hi) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
        // Words on the comp timeline + the intervals to keep. mode: pauses | fillers | both | range | phrases.
        function cutPlan(comp, a, targets) {
            var words = N.applyEdits(st.data, st.text, []), map = resolveLink(comp), W = [], i, fd = comp.frameDuration;
            for (i = 0; i < words.length; i++) W.push({ s: N.sourceToComp(words[i].start, map.startTime, map.stretch), e: N.sourceToComp(words[i].end, map.startTime, map.stretch), w: words[i] });
            var L0 = 1e9, L1 = -1e9;
            for (i = 0; i < targets.length; i++) { L0 = Math.min(L0, targets[i].inPoint); L1 = Math.max(L1, targets[i].outPoint); }
            var mode = String(a.mode || "pauses"), pad = num(a.pad, 0.08, 0, 1), minPause = num(a.minPause, 0.5, 0.1, 10), removes = [], keeps = [];
            var fillerSet = {}, list = a.words && a.words.length ? a.words : FILLERS, kept = W;
            for (i = 0; i < list.length; i++) fillerSet[bare(list[i])] = true;
            if (mode === "fillers" || mode === "both") {
                kept = [];
                for (i = 0; i < W.length; i++) {
                    var pair = i + 1 < W.length && fillerSet[bare(W[i].w.text) + " " + bare(W[i + 1].w.text)];
                    if (pair) { removes.push([W[i].s, W[i + 1].e]); i++; continue; }
                    if (fillerSet[bare(W[i].w.text)]) removes.push([W[i].s, W[i].e]); else kept.push(W[i]);
                }
            }
            if (mode === "pauses" || mode === "both") {
                if (!kept.length) throw new Error("Нет слов — нечего оставлять.");
                if (kept[0].s - pad - L0 > minPause) removes.push([L0, kept[0].s - pad]);
                for (i = 0; i + 1 < kept.length; i++) if (kept[i + 1].s - kept[i].e > minPause) removes.push([kept[i].e + pad, kept[i + 1].s - pad]);
                if (L1 - (kept[kept.length - 1].e + pad) > minPause) removes.push([kept[kept.length - 1].e + pad, L1]);
            }
            if (mode === "range") {
                var f = Number(a.from), t = Number(a.to);
                if (!isFinite(f) || !isFinite(t) || t - f < fd) throw new Error("Укажите отрезок: с какой по какую секунду оставить.");
                removes.push([L0, f], [t, L1]);
            }
            function snap(x) { return Math.round(x / fd) * fd; }
            if (mode === "phrases") {             // split at the middle of the gap between phrases, nothing removed
                var cuts = [];
                for (i = 0; i + 1 < W.length; i++) if (W[i + 1].w.seg !== W[i].w.seg) cuts.push(snap((W[i].e + W[i + 1].s) / 2));
                var prev = L0;
                for (i = 0; i < cuts.length; i++) if (cuts[i] > prev + fd && cuts[i] < L1 - fd) { keeps.push([prev, cuts[i]]); prev = cuts[i]; }
                keeps.push([prev, L1]);
            } else {
                var r = [];
                for (i = 0; i < removes.length; i++) { var x0 = snap(Math.max(L0, removes[i][0])), x1 = snap(Math.min(L1, removes[i][1])); if (x1 - x0 >= fd) r.push([x0, x1]); }
                r.sort(function (p, q) { return p[0] - q[0]; });
                var cur = L0;
                for (i = 0; i < r.length; i++) { if (r[i][0] > cur + fd / 2) keeps.push([cur, r[i][0]]); cur = Math.max(cur, r[i][1]); }
                if (L1 > cur + fd / 2) keeps.push([cur, L1]);
            }
            var total = 0; for (i = 0; i < keeps.length; i++) total += keeps[i][1] - keeps[i][0];
            return { keeps: keeps, before: L1 - L0, after: total, removed: (L1 - L0) - total, cuts: mode === "phrases" ? keeps.length - 1 : Math.max(0, keeps.length - 1 + (keeps.length && keeps[0][0] > L0 + 1e-6 ? 1 : 0)), L0: L0, words: W, mode: mode };
        }
        function round2(x) { return Math.round(x * 100) / 100; }
        function cutApply(a) {
            if (!st.data) throw new Error("Сначала распознайте речь — нарезка идёт по словам.");
            var comp = activeComp(), targets = cutTargets(comp), plan = cutPlan(comp, a, targets), i, k, fd = comp.frameDuration;
            if (!plan.keeps.length) throw new Error("После нарезки ничего не останется.");
            if (plan.mode !== "phrases" && plan.removed < fd) { status("Резать нечего: пауз длиннее порога нет."); return { removed: 0 }; }
            for (i = 0; i < targets.length; i++) if (targets[i].timeRemapEnabled) throw new Error("У слоя «" + targets[i].name + "» включён Time Remap — нарезка его не поддерживает.");
            var shift = plan.mode !== "phrases", starts = [], pos = plan.L0;
            for (k = 0; k < plan.keeps.length; k++) { starts.push(shift ? pos : plan.keeps[k][0]); pos += plan.keeps[k][1] - plan.keeps[k][0]; }
            var oldKey = sourceKey(), had = canUpdate(), pieces = 0, moved = 0, locked = 0;
            // other layers (music, sounds, graphics) follow the cut: each moves left by what was cut out before its start;
            // nothing of them is cut (a music bed just keeps playing). Off with ripple: false.
            var others = [], li;
            if (a.ripple !== false && plan.mode !== "phrases") for (li = 1; li <= comp.numLayers; li++) {
                var ol = comp.layer(li), isT = false;
                for (var ti = 0; ti < targets.length; ti++) if (targets[ti] === ol) isT = true;
                if (isT || N.isGenerated(ol)) continue;
                if (ol.locked) { locked++; continue; }
                others.push(ol);
            }
            function cutBefore(t) {
                var r = 0, prev = plan.L0;
                for (var q = 0; q < plan.keeps.length; q++) { var k0 = plan.keeps[q][0]; if (t > prev) r += Math.min(t, k0) - prev; prev = plan.keeps[q][1]; if (t <= k0) return r; }
                var L1 = plan.L0 + plan.before; if (t > prev) r += Math.min(t, L1) - prev;
                return r;
            }
            var newMap = [];
            for (k = 0; k < plan.keeps.length; k++) newMap.push({ c0: starts[k], c1: starts[k] + plan.keeps[k][1] - plan.keeps[k][0], s0: compToSrc(comp, plan.keeps[k][0]), f: srcRate(comp, plan.keeps[k][0]) });
            undo("нарезка по речи", function () {
                for (i = 0; i < targets.length; i++) {
                    var L = targets[i];
                    for (k = 0; k < plan.keeps.length; k++) {
                        var a0 = Math.max(plan.keeps[k][0], L.inPoint), a1 = Math.min(plan.keeps[k][1], L.outPoint);
                        if (a1 - a0 < fd / 2) continue;
                        var d = L.duplicate(), at = starts[k] + (a0 - plan.keeps[k][0]);
                        d.startTime = d.startTime + (at - a0);
                        if (at >= d.outPoint) { d.outPoint = at + (a1 - a0); d.inPoint = at; } else { d.inPoint = at; d.outPoint = at + (a1 - a0); }
                        if (!d.comment || String(d.comment) === N.CUT_TAG) d.comment = N.CUT_TAG;
                        pieces++;
                    }
                    L.remove();
                }
                if (had && shift) N.removeGenerated(comp, oldKey);
                for (var oi = 0; oi < others.length; oi++) { var d0 = cutBefore(others[oi].inPoint); if (d0 > 1e-6) { others[oi].startTime -= d0; moved++; } }
            });
            if (!shift) { status("Видео нарезано по фразам: кусков " + plan.keeps.length + ". Время не менялось."); return { pieces: pieces }; }
            // words move to the new timeline; words inside removed parts go away
            function keepOf(t) { for (var j = 0; j < plan.keeps.length; j++) if (t >= plan.keeps[j][0] - 1e-6 && t <= plan.keeps[j][1] + 1e-6) return j; return -1; }
            var segs = [], bySeg = {}, w;
            for (i = 0; i < plan.words.length; i++) {
                w = plan.words[i]; var j = keepOf((w.s + w.e) / 2); if (j < 0) continue;          // the word's middle decides: inside a removed part → gone
                var kp = plan.keeps[j], t0 = starts[j] + Math.max(0, w.s - kp[0]), t1 = starts[j] + Math.min(kp[1], w.e) - kp[0];
                if (t1 <= t0) t1 = t0 + Math.max(0.04, Math.min(w.e - w.s, 0.4));
                if (!bySeg[w.w.seg]) { bySeg[w.w.seg] = { words: [], flags: [], speaker: st.data.segments[w.w.seg] ? st.data.segments[w.w.seg].speaker : undefined }; segs.push(bySeg[w.w.seg]); }
                bySeg[w.w.seg].words.push({ text: w.w.text, start: Math.round(t0 * 1000) / 1000, end: Math.round(t1 * 1000) / 1000, conf: w.w.conf });
                bySeg[w.w.seg].flags.push(w.w);
            }
            var data = { schema: "noir-captions/1", language: st.data.language, engine: st.data.engine, warnings: [], source: { file: st.data.source ? st.data.source.file : "", cut: true }, segments: [] }, lines = [];
            for (i = 0; i < segs.length; i++) { var sg = { words: segs[i].words }; if (segs[i].speaker !== undefined) sg.speaker = segs[i].speaker; data.segments.push(sg); lines.push(N.editorWords(segs[i].flags)); }
            setData(data, null); st.cutMap = newMap;
            st.text = lines.join("\n"); st.cleanLines = st.text.split("\n"); st.rawLines = st.text.split("\n");
            var msg = "Нарезано: убрано " + (Math.round(plan.removed * 10) / 10) + " с (" + (Math.round(plan.before * 10) / 10) + " → " + (Math.round(plan.after * 10) / 10) + " с), кусков " + plan.keeps.length + ". Отмена в AE — Ctrl+Z.";
            if (had) { var r = generate("all", false); if (r && r.pending) r = generate("all", true); msg += " Субтитры пересозданы под новое время."; }
            status(msg + (a.ripple === false ? " Другие слои не сдвигались." : (moved ? " Другие слои сдвинуты за вырезанным: " + moved + "." : "")) + (locked ? " Заблокированные слои не тронуты: " + locked + "." : ""));
            return { removed: plan.removed, pieces: pieces, keeps: plan.keeps.length, moved: moved };
        }

        // ---------- style from a reference video ----------
        // The analyser measures the captions of a video (height, size, colours, caps, words per screen, entrance); the closest
        // built-in style is taken and these measurements are put into it; the result is saved as a user style and chosen.
        function colorDist(a, b) { if (!a || !b) return 1; return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2])); }
        N.styleFromMeasure = function (m, list, fileName) {
            var best = null, bestD = 1e9, i;
            for (i = 0; i < list.length; i++) {
                var p = list[i]; if (!p.base || !p.layout || p.user) continue;
                var d = Math.abs((p.layout.posY || 75) - m.posY) / 25 + Math.abs(p.base.size - m.size) / Math.max(60, m.size) + colorDist(p.base.color, m.color) * 1.5 +
                    ((!!p.base.caps) !== (!!m.caps) ? 0.8 : 0) + ((p.layout.maxWords || 3) !== m.maxWords ? 0.15 * Math.min(4, Math.abs((p.layout.maxWords || 3) - m.maxWords)) : 0) +
                    (m.accent ? colorDist(p.accent.color, m.accent.color) * 0.8 : 0);
                if (d < bestD) { bestD = d; best = p; }
            }
            if (!best) throw new Error("Нет встроенных стилей для основы.");
            var st = { layout: clone(best.layout), base: clone(best.base), accent: clone(best.accent), anim: clone(best.anim) };
            st.layout.posY = m.posY; st.layout.maxWords = m.maxWords; st.layout.layerMode = st.layout.layerMode || "phrase";
            if (m.lines === 1 && m.maxWords <= 3) st.layout.lineChars = 0;
            st.base.size = m.size; st.base.color = m.color; st.base.caps = !!m.caps; st.accent.caps = !!m.caps;
            if (m.shadow && !st.base.shadow) st.base.shadow = { color: [0, 0, 0], opacity: 55, distance: 3, softness: 12 };
            if (m.accent) { st.accent.color = m.accent.color; st.accent.size = Math.round(m.size * Math.max(0.6, Math.min(3, m.accent.scale || 1))); }
            else { st.accent.color = m.color; st.accent.size = Math.round(m.size * 1.12); }
            var A = { none: ["none", "none"], fade: ["fade", "fade"], zoomBlur: ["zoomBlur", "none"], pop: ["pop", "fade"] }[m.animIn] || ["none", "none"];
            st.anim.animIn = A[0]; st.anim.animOut = A[1]; st.anim.inDur = m.animIn === "none" ? 0 : m.animIn === "zoomBlur" ? 0.13 : 0.2; st.anim.outDur = A[1] === "none" ? 0 : 0.15;
            if (m.animIn === "zoomBlur") { st.anim.accentIn = "zoomBlur"; st.anim.accentInDur = 0.13; }
            st.layout.reveal = m.maxWords <= 1 ? "word" : (st.layout.reveal || "word");
            var name = "Из референса · " + String(fileName || "видео").replace(/\.[^.]+$/, "").substr(0, 28);
            return { schema: "noir-style/1", id: "ref-" + new Date().getTime(), name: name, description: "По референсу на основе «" + best.name + "»: высота, размер, цвета, капс, слов на экране и появление измерены по видео. Шрифт — от основы.",
                layout: st.layout, base: st.base, accent: st.accent, anim: st.anim, basedOn: best.id };
        };
        function styleFromVideo(a) {
            if (st.scanning) throw new Error("Уже идёт анализ — дождитесь конца.");
            var f = null;
            if (a && a.path) f = File(a.path);
            if (!f) { try { var comp = app.project.activeItem; if (comp instanceof CompItem) { var v = videoLayer(comp); if (v && v.source && v.source.mainSource && v.source.mainSource.file && comp.selectedLayers.length) f = v.source.mainSource.file; } } catch (e0) {} }
            if (!f) f = File.openDialog("Видео-референс с субтитрами, стиль которых нужен");
            if (!f) return null;
            if (!f.exists) throw new Error("Файл не найден: " + f.fsName);
            st.scanning = true; status("Изучаю субтитры в «" + decodeURI(f.name) + "»… (до минуты)");
            N.styleScan(root, S.python, f.fsName, {
                onDone: function (res) {
                    st.scanning = false;
                    if (!res.found) { status("В референсе не нашёл субтитров. " + (res.report || []).slice(1).join(" ")); return; }
                    try {
                        var p = N.styleFromMeasure(res.style, presets, decodeURI(f.name));
                        var dir = N.userPresetFolder(); if (!dir.exists) dir.create();
                        N.writeText(File(dir.fsName + "/" + p.id + ".json"), N.stringify(p));
                        presets = N.loadPresets(root); st.presetsRev = (st.presetsRev || 0) + 1;
                        var made = presetById(p.id); if (made) choosePreset(made);
                        status("Стиль «" + p.name + "» создан и выбран. " + (res.report || []).slice(1).join(" · ") + ". Основа: " + (presetById(p.basedOn) || {}).name + ".");
                    } catch (e) { status("Не удалось собрать стиль: " + (e.message || e)); log("error", e.toString()); }
                },
                onError: function (text) { st.scanning = false; status(text); log("error", text); }
            });
            return "Изучаю референс…";
        }

        // ---------- batch: recognize and caption several comps one after another ----------
        // Comps selected in the Project panel (or given by id). In each: the longest audio layer from a file is recognized, word fixes
        // from memory are applied and captions are created in the current style (remarks accepted). One comp failing does not stop the rest.
        function projectComps(ids) {
            var out = [], i, it;
            if (ids && ids.length) { for (i = 1; i <= app.project.numItems; i++) { it = app.project.item(i); if (it instanceof CompItem) for (var k = 0; k < ids.length; k++) if (it.id === ids[k]) out.push(it); } return out; }
            var sel = []; try { sel = app.project.selection || []; } catch (e) {}
            for (i = 0; i < sel.length; i++) if (sel[i] instanceof CompItem) out.push(sel[i]);
            return out;
        }
        function batchNext() {
            var b = st.batch; if (!b) return;
            if (!b.queue.length) {
                st.batch = null; st.recognizing = false;
                status("Пакет готов: субтитры в " + b.ok + " из " + b.total + " композиций." + (b.errors.length ? " Не вышло: " + b.errors.join("; ") : ""), 1);
                log("info", "batch: " + b.ok + "/" + b.total + (b.errors.length ? " · " + b.errors.join("; ") : ""));
                return;
            }
            var comp = b.queue.shift(), n = b.total - b.queue.length, tag = "Пакет " + n + "/" + b.total + " · " + comp.name + ": ";
            b.current = comp.name;
            function fail(msg) { b.errors.push(comp.name + " — " + msg); batchNext(); }
            var layer = N.autoAudioLayer(comp);
            if (!layer) { fail("нет слоя со звуком из файла"); return; }
            var src;
            try { src = N.audioSourceOf(comp, layer); } catch (eS) { fail(eS.message || String(eS)); return; }
            status(tag + "запуск…", 0);
            try {
                N.startRecognition(src, { root: root, python: S.python, model: S.model, language: S.language, device: S.device, prompt: memPrompt(), speakers: S.speakers }, {
                    onStatus: function (s) { status(tag + (s.message || s.state), s.progress); },
                    onDone: function (data, s) {
                        if (!st.batch) return;
                        setData(data, s.link); st.recognizing = true;
                        try { applyFixes(); } catch (eF) {}
                        st.forceComp = comp;
                        try { var r = generate("all", false); if (r && r.pending) generate("all", true); b.ok++; }
                        catch (eG) { b.errors.push(comp.name + " — " + (eG.message || eG)); }
                        st.forceComp = null;
                        batchNext();
                    },
                    onError: function (msg) { if (st.batch) fail(String(msg).split("\n")[0]); }
                });
            } catch (eR) { fail(eR.message || String(eR)); }
        }

        // ---------- auto zoom (punch-in) ----------
        // on: accents — the video pushes in on every accent word and comes back after it; phrases — every phrase alternates 100% / zoom
        // (classic jump-cut look); cuts — the pieces of a speech cut alternate. snap: a cut in one frame; smooth: a short ease.
        // The zoom goes toward the face when one was found (anchor point on the face, position compensated, no visible jump).
        function zoomTargets(comp) {
            var out = [], i, l;
            for (i = 1; i <= comp.numLayers; i++) { l = comp.layer(i); if (String(l.comment || "") === N.CUT_TAG) out.push(l); }
            if (out.length) return out.sort(function (p, q) { return p.inPoint - q.inPoint; });
            var v = videoLayer(comp); if (!v) throw new Error("Не нашёл слой видео: выделите его.");
            return [v];
        }
        function scaleOf(l) { return l.property("Transform").property("Scale"); }
        function layerAt(list, t) { for (var i = 0; i < list.length; i++) if (t >= list[i].inPoint - 1e-6 && t < list[i].outPoint - 1e-6) return list[i]; return null; }
        function aimAtFace(l) {
            if (!st.face || !l.width) return false;
            var tr = l.property("Transform"), ap = tr.property("Anchor Point"), ps = tr.property("Position");
            if (ap.numKeys || ps.numKeys) return false;
            var a0 = ap.value, p0 = ps.value, sc = scaleOf(l).value, nx = (st.face.x + st.face.w / 2) * l.width, ny = (st.face.y + st.face.h / 2) * l.height;
            ap.setValue([nx, ny, a0[2] || 0]);
            ps.setValue([p0[0] + (nx - a0[0]) * sc[0] / 100, p0[1] + (ny - a0[1]) * sc[1] / 100, p0[2] || 0]);
            return true;
        }
        function zoomApply(a) {
            var comp = activeComp(), list = zoomTargets(comp), on = a.on === "phrases" || a.on === "cuts" ? a.on : "accents";
            var z = num(a.scale, 110, 101, 150), fd = comp.frameDuration, smooth = a.mode === "smooth", hold = num(a.hold, 0.5, 0, 5), i, k, keys = 0;
            for (i = 0; i < list.length; i++) if (scaleOf(list[i]).numKeys && !a.replace) throw new Error("У слоя «" + list[i].name + "» уже есть ключи масштаба. Заменить их? (replace)");
            var words = [];
            if (st.data && on !== "cuts") { var map = resolveLink(comp), ws = N.applyEdits(st.data, st.text, []); for (i = 0; i < ws.length; i++) words.push({ s: N.sourceToComp(ws[i].start, map.startTime, map.stretch), e: N.sourceToComp(ws[i].end, map.startTime, map.stretch), accent: ws[i].accent, seg: ws[i].seg }); }
            if (on !== "cuts" && !words.length) throw new Error("Сначала распознайте речь — зум идёт по словам.");
            var hits = [];
            if (on === "accents") {
                for (i = 0; i < words.length; i++) if (words[i].accent) hits.push([words[i].s, words[i].e + hold]);
                if (!hits.length) throw new Error("В тексте нет акцентов: отметьте слова *звёздочками* или выберите «на фразах».");
            }
            var faced = 0;
            undo("автозум", function () {
                for (i = 0; i < list.length; i++) { var sp = scaleOf(list[i]); while (sp.numKeys) sp.removeKey(1); var v0 = sp.value; sp.setValue([100, 100, v0[2] || 100]); if (aimAtFace(list[i])) faced++; }
                if (on === "cuts") {
                    if (list.length < 2) throw new Error("Нарезанных кусков нет — сначала «убери паузы» или выберите «на фразах».");
                    for (i = 0; i < list.length; i++) { var vv = i % 2 ? z : 100; scaleOf(list[i]).setValue([vv, vv, 100]); if (i % 2) keys++; }
                    return;
                }
                if (on === "phrases") {           // every other phrase pushed in, cut exactly at the phrase start
                    var starts = [], seen = {};
                    for (i = 0; i < words.length; i++) if (!seen[words[i].seg]) { seen[words[i].seg] = true; starts.push(words[i].s); }
                    for (i = 0; i < starts.length; i++) hits.push(i % 2 ? [starts[i], i + 1 < starts.length ? starts[i + 1] : comp.duration] : null);
                    var h2 = []; for (i = 0; i < hits.length; i++) if (hits[i]) h2.push(hits[i]); hits = h2;
                }
                var ramp = smooth ? Math.max(fd, 4 * fd) : fd;
                for (i = 0; i < hits.length; i++) {
                    var t0 = Math.round(hits[i][0] / fd) * fd, t1 = Math.round(hits[i][1] / fd) * fd;
                    if (i + 1 < hits.length && t1 > hits[i + 1][0] - ramp - fd) t1 = Math.round((hits[i + 1][0] - ramp - fd) / fd) * fd;   // never overlap the next push
                    var L = layerAt(list, t0) || list[0], P = scaleOf(L), out = Math.min(t1, L.outPoint - fd);
                    if (out <= t0) continue;
                    P.setValueAtTime(Math.max(0, t0 - ramp), [100, 100, 100]); P.setValueAtTime(t0, [z, z, 100]);
                    P.setValueAtTime(out, [z, z, 100]); P.setValueAtTime(out + ramp, [100, 100, 100]);
                    if (smooth && typeof KeyframeEase !== "undefined") { try { var e = [new KeyframeEase(0, 70), new KeyframeEase(0, 70), new KeyframeEase(0, 70)]; for (k = 1; k <= P.numKeys; k++) P.setTemporalEaseAtKey(k, e, e); } catch (eE) {} }
                    keys++;
                }
            });
            status("Автозум " + z + "%: " + (on === "accents" ? "акцентов " : on === "phrases" ? "фраз " : "кусков ") + keys + (faced ? ", приближение к лицу" : "") + ". Отмена — Ctrl+Z.");
            return { pushes: keys, layers: list.length, face: faced > 0 };
        }
        function zoomClear() {
            var comp = activeComp(), list = zoomTargets(comp);
            undo("убрать автозум", function () { for (var i = 0; i < list.length; i++) { var sp = scaleOf(list[i]); while (sp.numKeys) sp.removeKey(1); sp.setValue([100, 100, 100]); } });
            status("Автозум убран: масштаб 100%."); return true;
        }

        // ---------- montage: raw talking video → finished clip in one step ----------
        // After recognition: pauses and filler words are cut out of the video, one main word per phrase is accented (written into
        // the text as *word*, so it can be edited), captions are created in the current style and the video pushes in on the accents.
        // Each part can be switched off; a part that fails is reported and does not stop the rest. One undo step in AE.
        function accentText() {
            var words = N.applyEdits(st.data, st.text, []), L = renderStyle().layout, byKey = {}, i, j, n = 0;
            var groups = N.groupWords(words, { maxWords: L.maxWords, maxChars: L.maxChars, pauseBreak: L.pauseBreak, punctBreak: L.punctBreak, stripPunct: L.stripPunct });
            for (i = 0; i < words.length; i++) byKey[words[i].seg + ":" + words[i].start] = words[i];
            var was = []; for (i = 0; i < groups.length; i++) for (j = 0; j < groups[i].words.length; j++) was.push(groups[i].words[j].accent);
            N.autoAccent(groups);
            var q = 0;
            for (i = 0; i < groups.length; i++) for (j = 0; j < groups[i].words.length; j++, q++) {
                var it = groups[i].words[j]; if (!it.accent || was[q]) continue;
                var w = byKey[groups[i].seg + ":" + it.start]; if (w && !w.accent) { w.accent = true; n++; }
            }
            if (!n) return 0;
            var ls = lines(), out = [], per = {};
            for (i = 0; i < words.length; i++) { if (!per[words[i].seg]) per[words[i].seg] = []; per[words[i].seg].push(words[i]); }
            for (i = 0; i < ls.length; i++) out.push(per[i] ? N.editorWords(per[i]) : ls[i]);
            remember(); st.text = out.join("\n");
            return n;
        }
        function montageFinish(a) {
            var rep = [], accents = 0, i;
            function why(e) { return String(e && e.message || e).split("\n")[0]; }
            function sec1(x) { return Math.round(x * 10) / 10; }
            undoBegin("монтаж");
            try {
                if (a.cut !== false) {
                    try { var c = cutApply({ mode: "both" }); rep.push(c && c.removed ? "вырезано " + sec1(c.removed) + " с пауз и слов-паразитов" : "лишних пауз нет"); }
                    catch (eC) { rep.push("нарезка не вышла (" + why(eC) + ")"); }
                }
                if (a.accents !== false) { try { accentText(); } catch (eA) { log("error", "montage accents: " + why(eA)); } }
                var ws = N.applyEdits(st.data, st.text, []); for (i = 0; i < ws.length; i++) if (ws[i].accent) accents++;
                var r = generate("all", false); if (r && r.pending) r = generate("all", true);
                rep.push("субтитры: " + (r && r.created !== undefined ? r.created + " сл." : "созданы") + (accents ? ", акцентов " + accents : ""));
                if (a.zoom !== false) {
                    try { var z = zoomApply({ on: accents ? "accents" : "phrases", scale: a.scale, mode: a.smooth ? "smooth" : "snap", replace: true }); rep.push("зум " + num(a.scale, 110, 101, 150) + "% × " + z.pushes); }
                    catch (eZ) { rep.push("зум не вышел (" + why(eZ) + ")"); }
                }
            } finally { undoEnd(); }
            status("Смонтировано: " + rep.join("; ") + ". Всё можно править; отмена в AE — Ctrl+Z.", 1);
            return rep;
        }

        // ---------- memory: word fixes, preferences, accepted assistant answers ----------
        // Stored only on this computer: <userData>/NOIR Captions/memory.json. Word fixes are learned when captions are created (recognized
        // text vs. the text the user corrected, lines with the same word count) and when one word is replaced; after the next recognition
        // they are put into the text right away (one «Отменить правку» returns the raw text) and their spellings are given to Whisper as a hint.
        var MEM_LIMITS = { fixes: 300, prefs: 50, examples: 100 };
        function memFile() { var dir = Folder(Folder.userData.fsName + "/NOIR Captions"); if (!dir.exists) dir.create(); return File(dir.fsName + "/memory.json"); }
        function memLoad() {
            var m = null;
            try { var f = memFile(); if (f.exists) m = N.parseJSON(N.readText(f)); } catch (e) { m = null; }
            if (!m || typeof m !== "object") m = {};
            if (!(m.fixes instanceof Array)) m.fixes = [];
            if (!(m.prefs instanceof Array)) m.prefs = [];
            if (!(m.examples instanceof Array)) m.examples = [];
            m.schema = "noir-memory/1";
            return m;
        }
        function memSave(m) {
            for (var k in MEM_LIMITS) if (m[k].length > MEM_LIMITS[k]) m[k] = m[k].slice(m[k].length - MEM_LIMITS[k]);
            N.writeText(memFile(), N.stringify(m));
        }
        function wordParts(t) { var m = /^([^A-Za-zА-Яа-яЁё0-9]*)([\s\S]*?)([^A-Za-zА-Яа-яЁё0-9]*)$/.exec(String(t)); return m ? { lead: m[1], core: m[2], trail: m[3] } : { lead: "", core: String(t), trail: "" }; }
        function learnFix(m, from, to) {
            var f = bare(wordParts(from).core), core = wordParts(to).core;
            if (!f || !core || f === bare(core) || f.length > 40 || core.length > 40 || /\s/.test(f)) return false;
            for (var i = 0; i < m.fixes.length; i++) if (m.fixes[i].from === f) {
                if (m.fixes[i].to === core) m.fixes[i].n++; else { m.fixes[i].to = core; m.fixes[i].n = 1; }
                var x = m.fixes.splice(i, 1)[0]; m.fixes.push(x); return true;
            }
            m.fixes.push({ from: f, to: core, n: 1 }); return true;
        }
        // A fix learned from the text must look like a mishearing (spelling or transliteration close to the recognized word), not a rewrite:
        // «нуар → NOIR», «тикток → TikTok», «превет → привет» — yes; «сами → деньги» — no.
        var TR = { "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s",
            "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "u", "я": "ya" };
        function latin(w) { var o = "", i, c; w = String(w).toLowerCase().replace(/ё/g, "е"); for (i = 0; i < w.length; i++) { c = w.charAt(i); o += TR.hasOwnProperty(c) ? TR[c] : c; } return o.replace(/ph/g, "f").replace(/[^a-z0-9]/g, "").replace(/(.)\1+/g, "$1").replace(/[aeiouy]/g, function (v, k) { return k ? "" : v; }); }
        function lev(a, b) {
            var prev = [], cur, i, j;
            for (j = 0; j <= b.length; j++) prev.push(j);
            for (i = 1; i <= a.length; i++) { cur = [i]; for (j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1))); prev = cur; }
            return prev[b.length];
        }
        function looksLikeFix(from, to) {
            var a = bare(from), b = bare(to), la = latin(a), lb = latin(b);
            if (lev(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.4))) return true;
            return la.length > 0 && lev(la, lb) <= Math.max(1, Math.floor(Math.max(la.length, lb.length) * 0.34));
        }
        // recognized (or last learned) lines vs. the current ones; a line where more than half the words changed is a rewrite, not a fix
        function learnFromText() {
            if (!S.memoryLearn || !st.rawLines) return 0;
            var cur = lines(), m = null, n = 0;
            for (var i = 0; i < cur.length && i < st.rawLines.length; i++) {
                if (cur[i] === st.rawLines[i]) continue;
                var a = N.parseLine(st.rawLines[i]), b = N.parseLine(cur[i]), diff = [];
                if (a.length !== b.length || !a.length) continue;
                for (var k = 0; k < a.length; k++) if (bare(wordParts(a[k].text).core) !== bare(wordParts(b[k].text).core)) diff.push(k);
                if (!diff.length || diff.length > Math.max(1, Math.floor(a.length / 2))) continue;
                if (!m) m = memLoad();
                for (k = 0; k < diff.length; k++) if (looksLikeFix(wordParts(a[diff[k]].text).core, wordParts(b[diff[k]].text).core) && learnFix(m, a[diff[k]].text, b[diff[k]].text)) n++;
            }
            st.rawLines = cur;
            if (n) { try { memSave(m); } catch (e) { log("error", "memory: " + (e.message || e)); } }
            return n;
        }
        // after recognition: known fixes go into the text (case of the first letter and punctuation of the recognized word are kept)
        function applyFixes() {
            if (!S.memoryLearn || !st.data) return 0;
            var m = memLoad(), map = {}, i, k, n = 0;
            if (!m.fixes.length) return 0;
            for (i = 0; i < m.fixes.length; i++) map[m.fixes[i].from] = m.fixes[i].to;
            var ls = lines(), out = [];
            for (i = 0; i < ls.length; i++) {
                var ws = N.parseLine(ls[i]), changed = false;
                for (k = 0; k < ws.length; k++) {
                    var p = wordParts(ws[k].text), to = map[bare(p.core)];
                    if (!to || to === p.core) continue;
                    var first = p.core.charAt(0);
                    if (first !== first.toLowerCase() && to.charAt(0) === to.charAt(0).toLowerCase()) to = to.charAt(0).toUpperCase() + to.substring(1);
                    ws[k].text = p.lead + to + p.trail; changed = true; n++;
                }
                out.push(changed ? N.editorWords(ws) : ls[i]);
            }
            if (!n) return 0;
            remember(); st.text = out.join("\n"); st.cleanLines = st.text.split("\n"); st.rawLines = st.text.split("\n");
            return n;
        }
        // spellings the user taught, as a hint for Whisper (names, brands, slang)
        function memPrompt() {
            if (!S.memoryLearn) return S.prompt;
            var m = memLoad(), seen = {}, words = [];
            for (var i = m.fixes.length - 1; i >= 0 && words.length < 40; i--) { var w = m.fixes[i].to; if (!seen[w.toLowerCase()]) { seen[w.toLowerCase()] = true; words.push(w); } }
            return String(S.prompt || "") + (words.length ? (S.prompt ? " " : "") + words.join(", ") + "." : "");
        }
        function memKind(k) { if (k !== "fixes" && k !== "prefs" && k !== "examples") throw new Error("Нет такого раздела памяти."); return k; }
        function memNorm(q) { return String(q || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9 ]+/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }

        // ---------- experimental: scripts written by the assistant ----------
        // A guard, not a sandbox: the user sees the code before it runs; files, the system, other projects, saving, rendering, dialogs,
        // eval and endless loops are refused; the code runs in one undo group with comp / selected / captions / log.
        var SCRIPT_BLOCK = [
            [/\b(File|Folder|Socket|ExternalObject|BridgeTalk)\b/, "файлы и сеть"], [/\bsystem\b|callSystem/, "системные команды"],
            [/\beval\b|\bFunction\b|evalFile|\$\.global|\bthis\b|__proto__|\bconstructor\b|\bprototype\b|\bNOIR\w*\s*[.\[]|\bN\s*[.\[]/, "выполнение чужого кода и служебные объекты панели"],
            [/\$\.(?!writeln\b)/, "служебные функции $"], [/\b(execute|executeCommand|scheduleTask|cancelTask|setTimeout)\b/, "запуск команд и задач"],
            [/\bapp\s*\.\s*(open|quit|newProject|exitAfterLaunchAndEval|preferences|settings|purge|beginSuppressDialogs|watchFolder)\b/, "управление программой и проектом"],
            [/\.\s*(save\w*|close)\s*\(|renderQueue|importFile|\bImportOptions\b/, "сохранение, рендер, импорт"],
            [/\b(Window|ScriptUI|alert|confirm|prompt)\b/, "окна и диалоги"], [/\b(import|require)\b/, "подключение модулей"],
            [/\bwhile\s*\(\s*(true|1)\s*\)|\bfor\s*\(\s*;\s*;\s*\)|\bdo\s*\{/, "бесконечный цикл"],
            [new RegExp("\\x3D>|\\x60|\\b(let|const|class|async|await)\\b"), "синтаксис новее ES3 (AE его не поймёт)"]
        ];
        function scriptProblems(code) {
            var out = [], c = String(code || "");
            if (!/\S/.test(c)) out.push("пустой код");
            if (c.length > 8000) out.push("слишком длинный код");
            for (var i = 0; i < SCRIPT_BLOCK.length; i++) if (SCRIPT_BLOCK[i][0].test(c)) out.push(SCRIPT_BLOCK[i][1]);
            return out;
        }
        function layerKind(l) {
            if (l instanceof TextLayer) return N.isGenerated(l) ? "noir-caption" : "text";
            try { if (l instanceof ShapeLayer) return "shape"; } catch (e) {}
            if (l.nullLayer) return "null";
            try { if (l instanceof CameraLayer) return "camera"; if (l instanceof LightLayer) return "light"; } catch (e2) {}
            return l.source && l.source.hasVideo === false ? "audio" : "av";
        }
        function captionLayers(comp) {
            var out = [], key = sourceKey();
            for (var i = 1; i <= comp.numLayers; i++) { var l = comp.layer(i); if (l instanceof TextLayer && N.isGenerated(l) && (!key || N.layerSource(l) === key)) out.push(l); }
            return out;
        }
        function runScript(code) {
            if (!S.assistantScripts) throw new Error("Режим скриптов выключен (Помощник → ИИ-модель → «Любые просьбы — скриптом»).");
            var bad = scriptProblems(code);
            if (bad.length) throw new Error("Скрипт не запущен: " + bad.join(", ") + ".");
            var comp = null; try { comp = app.project.activeItem; } catch (e0) {}
            if (!(comp instanceof CompItem)) comp = null;
            var selected = [], i, logs = [], ret;
            if (comp) for (i = 0; i < comp.selectedLayers.length; i++) selected.push(comp.selectedLayers[i]);
            var caps = comp ? captionLayers(comp) : [];
            function say() { var a = []; for (var k = 0; k < arguments.length; k++) a.push(String(arguments[k])); if (logs.length < 50) logs.push(a.join(" ").substr(0, 300)); }
            var fn;
            try { fn = new Function("comp", "selected", "captions", "log", code); }          // global scope: the panel's own variables are not reachable
            catch (eS) { throw new Error("В коде ошибка синтаксиса: " + (eS.message || eS) + ". Ничего не изменено."); }
            log("info", "script: " + String(code).substr(0, 500));
            try { ret = undo("скрипт помощника", function () { return fn.call({}, comp, selected, caps, say); }); }
            catch (eR) {
                var line = eR.line ? " (строка " + eR.line + ")" : "";
                status("Ошибка в скрипте: " + (eR.message || eR) + line + ". Часть изменений могла примениться — Ctrl+Z в AE отменит.");
                log("error", "script: " + (eR.message || eR));
                return { ok: false, error: String(eR.message || eR) + line, logs: logs };
            }
            status("Скрипт выполнен. Отменить — Ctrl+Z в AE." + (logs.length ? " " + logs[logs.length - 1] : ""));
            return { ok: true, logs: logs, result: ret === undefined || ret === null ? "" : String(ret).substr(0, 500) };
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
            recognize: function (a) {
                a = a || {};
                var src;
                if (a.file || a.path) {
                    var pick = a.path ? File(a.path) : File.openDialog("Аудио или видео для распознавания");
                    if (!pick) { st.montage = null; return null; }
                    src = N.fileSource(pick);
                } else src = N.getAudioSource();
                if (!N.modelCached(S.model)) throw new Error("Модель " + S.model + " ещё не скачана. Нажмите «Скачать модель» на вкладке «Текст» (один раз; аудио никуда не отправляется).");
                if (st.recognizing) throw new Error("Распознавание уже идёт.");
                st.recognizing = true; st.progress = 0; status("Запуск распознавания…", 0);
                try {
                N.startRecognition(src, { root: root, python: S.python, model: S.model, language: S.language, device: S.device, prompt: memPrompt(), speakers: S.speakers }, {
                    onStatus: function (s) { var m = s.message || s.state; if (s.device) m += " · " + (s.device === "cuda" ? "GPU" : "CPU"); st.recognizing = true; status(m, s.progress); },
                    onDone: function (data, s) {
                        st.recognizing = false; setData(data, s.link);
                        var fixed = 0; try { fixed = applyFixes(); } catch (eF) { log("error", "memory: " + (eF.message || eF)); }
                        if (fixed) status(st.status + " Исправлено по памяти слов: " + fixed + " («Отменить правку» вернёт как было).");
                        var mo = st.montage; st.montage = null;
                        if (mo) { try { montageFinish(mo); } catch (eM) { status("Монтаж остановился: " + String(eM.message || eM).split("\n")[0] + " Распознанный текст на месте — можно продолжить вручную."); log("error", "montage: " + eM.toString()); } }
                    },
                    onError: function (msg) { st.montage = null; st.recognizing = false; status("Ошибка распознавания: " + msg, 0); log("error", msg); }
                });
                } catch (e) { st.montage = null; st.recognizing = false; status("Ошибка распознавания: " + (e.message || e), 0); throw e; }
                return true;
            },
            // one click: recognition, then cut + accents + captions + zoom (each part optional: cut / accents / zoom = false)
            "montage.start": function (a) {
                if (st.recognizing) throw new Error("Распознавание уже идёт.");
                st.montage = { cut: a.cut !== false, accents: a.accents !== false, zoom: a.zoom !== false, scale: a.scale, smooth: !!a.smooth };
                try { var r = OPS.recognize({ file: a.file, path: a.path }); if (r === null) st.montage = null; return r; } catch (e) { st.montage = null; throw e; }
            },
            "montage.apply": function (a) { if (!st.data) throw new Error("Сначала распознайте речь."); return montageFinish(a || {}); },
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
            cancel: function () { var wasBatch = !!st.batch; st.montage = null; st.batch = null; st.forceComp = null; N.cancelRecognition(); st.recognizing = false; status(wasBatch ? "Пакет остановлен." : "Распознавание отменено.", 0); return true; },
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
            // Delete a word of the selected phrase: the other words keep their exact timing; one undo step.
            "word.delete": function (a) {
                if (!st.data) throw new Error("Нет текста.");
                var si = st.phrase, ls = lines(), pw = N.parseLine(ls[si] || ""), i = Number(a.index);
                if (!pw[i]) throw new Error("Нет такого слова.");
                var snapshot = { text: st.text, data: clone(st.data), timingAll: clone(st.timing) }, gone = pw[i].text.replace(/[*~|]/g, "");
                if (pw.length > 1) {
                    var ws = commitPhrase(si);
                    var removed = pw.splice(i, 1)[0]; ws.splice(i, 1);
                    if (pw[i] && removed.lineBefore) pw[i].lineBefore = true;
                    if (pw[i] && removed.breakBefore && i > 0) pw[i].breakBefore = true;
                    ls[si] = N.editorWords(pw);
                } else ls[si] = "";                    // the last word: the phrase goes away
                st.history.push(snapshot); if (st.history.length > 30) st.history.shift();
                st.text = ls.join("\n"); st.timing[si] = true; st.issues = []; st.pending = null;
                status("Слово «" + gone + "» удалено; тайминги остальных слов сохранены. Обновите фразу, чтобы применить.");
                return pw.length;
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
                var old = w.text; remember(); w.text = t; var ls = lines(); ls[st.phrase] = N.editorWords(ws); st.text = ls.join("\n");
                if (S.memoryLearn) { try { var mm = memLoad(); if (learnFix(mm, old, t)) memSave(mm); if (st.rawLines && st.rawLines.length > st.phrase) st.rawLines[st.phrase] = ls[st.phrase]; } catch (eM) {} }
                status("Слово исправлено; тайминг сохранён."); return true;
            },
            listen: function () {
                var ws = phraseWords();
                if (!ws.length) throw new Error("Нет слов для прослушивания.");
                if (!st.data.source || !st.data.source.file) throw new Error("В JSON нет пути к аудио. Распознайте исходный слой ещё раз.");
                var comp0 = null; try { comp0 = activeComp(); } catch (eC) {}
                var a0 = st.cutMap && comp0 ? compToSrc(comp0, ws[0].start) : ws[0].start, a1 = st.cutMap && comp0 ? compToSrc(comp0, ws[ws.length - 1].end) : ws[ws.length - 1].end;
                N.previewAudio(root, S.python, st.data.source.file, a0, a1);
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
            "cut.plan": function (a) {
                if (!st.data) throw new Error("Сначала распознайте речь — нарезка идёт по словам.");
                var comp = activeComp(), targets = cutTargets(comp), p = cutPlan(comp, a, targets);
                return { keeps: p.keeps.length, before: round2(p.before), after: round2(p.after), removed: round2(p.removed), layers: targets.length, names: targets.length === 1 ? targets[0].name : targets.length + " слоёв" };
            },
            "cut.apply": function (a) { return cutApply(a); },
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
            "style.fromVideo": function (a) { return styleFromVideo(a || {}); },
            "batch.list": function (a) {
                var list = projectComps(a && a.ids), out = [];
                for (var i = 0; i < list.length; i++) { var l = N.autoAudioLayer(list[i]); out.push({ id: list[i].id, name: list[i].name, layer: l ? l.name : null }); }
                return out;
            },
            "batch.start": function (a) {
                if (st.recognizing) throw new Error("Распознавание уже идёт.");
                if (!N.modelCached(S.model)) throw new Error("Модель " + S.model + " ещё не скачана. Нажмите «Скачать модель» на вкладке «Текст».");
                var list = projectComps(a && a.ids);
                if (!list.length) throw new Error("Выделите композиции в панели Project (Ctrl+клик), затем запустите пакет.");
                st.batch = { queue: list.slice(), total: list.length, ok: 0, errors: [], current: "" }; st.recognizing = true;
                log("info", "batch start: " + list.length);
                batchNext();
                return { total: list.length };
            },
            // which voice a phrase belongs to (the colour of its words); index — the current phrase by default; speaker 0 / 1 or toggle
            "phrase.speaker": function (a) {
                if (!st.data) throw new Error("Нет текста.");
                var si = a && a.index !== undefined ? Number(a.index) : st.phrase, seg = st.data.segments[si];
                if (!seg) throw new Error("Нет такой фразы.");
                st.history.push({ text: st.text, data: clone(st.data), timingAll: clone(st.timing) });
                seg.speaker = a && (a.speaker === 0 || a.speaker === 1) ? a.speaker : (seg.speaker === 1 ? 0 : 1);
                st.timing[si] = true; st.issues = []; st.pending = null;
                status("Фраза " + (si + 1) + ": голос " + (seg.speaker + 1) + ". Обновите фразу, чтобы применить."); return seg.speaker;
            },
            "zoom.apply": function (a) { return zoomApply(a || {}); },
            "zoom.clear": function () { return zoomClear(); },
            "memory.get": function () { var m = memLoad(); return { fixes: m.fixes, prefs: m.prefs, examples: m.examples, learn: !!S.memoryLearn }; },
            "memory.add": function (a) {
                var m = memLoad(), kind = memKind(a.kind), i;
                if (kind === "fixes") { if (!learnFix(m, a.from, a.to)) throw new Error("Нужно: какое слово на какое менять (одно слово)."); }
                else if (kind === "prefs") {
                    var t = String(a.text || "").replace(/^\s+|\s+$/g, "").substr(0, 300); if (!t) throw new Error("Что запомнить?");
                    for (i = 0; i < m.prefs.length; i++) if (memNorm(m.prefs[i].text) === memNorm(t)) m.prefs.splice(i--, 1);
                    m.prefs.push({ text: t, t: new Date().getTime() });
                } else {
                    var q = memNorm(a.q); if (!q || !(a.commands instanceof Array) || !a.commands.length) throw new Error("Пустой пример.");
                    for (i = 0; i < m.examples.length; i++) if (m.examples[i].q === q) m.examples.splice(i--, 1);
                    m.examples.push({ q: q, say: String(a.say || "").substr(0, 400), commands: a.commands.slice(0, 12) });
                }
                memSave(m); return true;
            },
            "memory.find": function (a) { var m = memLoad(), q = memNorm(a.q); for (var i = m.examples.length - 1; i >= 0; i--) if (m.examples[i].q === q) return m.examples[i]; return null; },
            "memory.remove": function (a) {
                var m = memLoad(), kind = memKind(a.kind), i = Number(a.index);
                if (!(i >= 0 && i < m[kind].length)) throw new Error("Нет такой записи.");
                m[kind].splice(i, 1); memSave(m); return true;
            },
            // «забудь …»: everything whose text, word or request contains the phrase
            "memory.forget": function (a) {
                var m = memLoad(), q = memNorm(a.text), n = 0, i;
                if (!q) throw new Error("Что забыть?");
                for (i = 0; i < m.prefs.length; i++) if (memNorm(m.prefs[i].text).indexOf(q) >= 0) { m.prefs.splice(i--, 1); n++; }
                for (i = 0; i < m.fixes.length; i++) if (m.fixes[i].from.indexOf(q) >= 0 || memNorm(m.fixes[i].to).indexOf(q) >= 0) { m.fixes.splice(i--, 1); n++; }
                for (i = 0; i < m.examples.length; i++) if (m.examples[i].q.indexOf(q) >= 0) { m.examples.splice(i--, 1); n++; }
                if (n) memSave(m); return n;
            },
            "memory.clear": function (a) {
                var m = memLoad(), kinds = a && a.kind ? [memKind(a.kind)] : ["fixes", "prefs", "examples"];
                for (var i = 0; i < kinds.length; i++) m[kinds[i]] = [];
                memSave(m); status("Память помощника очищена."); return true;
            },
            "script.check": function (a) {
                var pr = scriptProblems(a.code);
                if (!pr.length) { try { new Function("comp", "selected", "captions", "log", String(a.code)); } catch (eC) { pr.push("ошибка синтаксиса: " + (eC.message || eC)); } }   // compiled, not run
                return { problems: pr, enabled: !!S.assistantScripts };
            },
            "script.run": function (a) { return runScript(String(a.code || "")); },
            // what a script needs to know: the comp and its layers (names, kinds, times), the selection
            "script.context": function () {
                var comp = null; try { comp = app.project.activeItem; } catch (e0) {}
                if (!(comp instanceof CompItem)) return { comp: null };
                var out = { comp: { name: comp.name, width: comp.width, height: comp.height, duration: Math.round(comp.duration * 100) / 100, fps: Math.round(1 / comp.frameDuration * 100) / 100, time: Math.round(comp.time * 100) / 100, numLayers: comp.numLayers }, layers: [] };
                for (var i = 1; i <= comp.numLayers && out.layers.length < 40; i++) {
                    var l = comp.layer(i);
                    out.layers.push({ index: i, name: l.name, kind: layerKind(l), selected: !!l.selected, inPoint: Math.round(l.inPoint * 100) / 100, outPoint: Math.round(l.outPoint * 100) / 100 });
                }
                return out;
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
                try { var mem = memLoad(); if (mem.prefs.length) { out.userPreferences = []; for (var mi = 0; mi < mem.prefs.length; mi++) out.userPreferences.push(mem.prefs[mi].text); } } catch (eMem) {}
                if (st.data) { var ws = N.applyEdits(st.data, st.text, []), sample = []; for (var wi = 0; wi < ws.length && wi < 80; wi++) sample.push(ws[wi].text); out.textSample = sample.join(" "); }
                return out;
            },
            status: function () { return st.status; },
            "source.peek": function () { return N.sourceInfo(); },          // the panel asks when the pointer comes back: the selection may have changed
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
            var ls = lines(), phrases = [], words = [], i, spk = false;
            if (st.data) for (i = 0; i < st.data.segments.length; i++) if (st.data.segments[i].speaker !== undefined) spk = true;
            if (st.data) for (i = 0; i < st.data.segments.length; i++) phrases.push(String(i + 1) + " · " + (ls[i] || "").substr(0, 48));
            try { var pw = phraseWords(); for (i = 0; i < pw.length; i++) words.push({ text: pw[i].text, accent: !!pw[i].accent, low: pw[i].conf !== undefined && pw[i].conf < 0.65,
                start: Math.round(pw[i].start * 1000) / 1000, end: Math.round(pw[i].end * 1000) / 1000 }); } catch (e) {}
            return { version: N.VERSION, status: st.status, progress: st.progress, recognizing: st.recognizing, scanning: st.scanning, presetsRev: st.presetsRev || 0, batch: st.batch ? { total: st.batch.total, left: st.batch.queue.length, current: st.batch.current } : null,
                hasData: !!st.data, dataRevision: st.dataRevision, text: st.text, dirty: dirty(), phraseDirty: !!st.data && (ls[st.phrase] !== st.cleanLines[st.phrase] || !!st.timing[st.phrase]),
                phrase: st.phrase, phrases: phrases, words: words, speakers: spk, speaker: spk && st.data.segments[st.phrase] ? (st.data.segments[st.phrase].speaker || 0) : null, canUpdate: canUpdate(), completed: st.completed, issues: st.issues, pending: !!st.pending,
                settings: S, face: st.face, audio: (function () { try { return N.sourceInfo(); } catch (eS) { return { kind: "none", comp: "" }; } })(), historyLength: st.history.length, control: hasControl(), source: sourceName() };
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
