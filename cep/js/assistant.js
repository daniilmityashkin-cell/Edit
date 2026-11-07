/* NOIR assistant. Free-form requests go to a language model running on this computer (Ollama, http://127.0.0.1:11434 by default:
   free, offline, nothing leaves the machine). Simple requests are also understood without any model.
   Every request becomes a plan (commands, or a text change shown as "before → after"); After Effects changes only after «Применить».
   Text changes keep timings: the same number of words in a line keeps every word's timing; filler removal keeps the other words' timings;
   a translation keeps each phrase's start and end and spreads the words by length. */
(function () {
    "use strict";
    var api = null, box = null, STORE = "noir.assistant.v1";
    var t = function (k, v) { return window.NoirI18n ? NoirI18n.t(k, v) : k; };
    var ANIM_IN = ["none", "fade", "blur", "blurRise", "rise", "drop", "left", "right", "pop", "punch", "zoom", "slam", "whipL", "whipR", "rotate", "grow", "blurPop", "letFade", "letRise", "letPop", "letBlur", "type"];
    var ANIM_OUT = ["none", "fade", "blur", "blurUp", "shrink", "up", "down", "left", "right", "zoom", "whipL", "whipR", "rotate", "slamOut", "letFade", "letRise", "letType"];
    var TEXT_OPS = { translate: 1, fixText: 1, fillers: 1, emoji: 1 };
    var LANGS = { en: "English", ru: "Russian", es: "Spanish", de: "German", fr: "French", it: "Italian", pt: "Portuguese", uk: "Ukrainian", kk: "Kazakh", tr: "Turkish", zh: "Chinese", ja: "Japanese", ko: "Korean", ar: "Arabic" };
    var LANG_NAMES = { en: "английский", ru: "русский", es: "испанский", de: "немецкий", fr: "французский", it: "итальянский", pt: "португальский", uk: "украинский", kk: "казахский", tr: "турецкий", zh: "китайский", ja: "японский", ko: "корейский", ar: "арабский" };

    function loadSettings() {
        var d = { endpoint: "http://127.0.0.1:11434", model: "", mode: "auto" };
        try { var s = JSON.parse(localStorage.getItem(STORE) || "{}"); for (var k in s) if (d.hasOwnProperty(k)) d[k] = s[k]; } catch (e) {}
        return d;
    }
    function saveSettings(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }
    var settings = loadSettings(), models = [], online = false;

    // ---------- command validation: nothing from a model is executed unless it is one of these shapes ----------
    var SET_PATHS = { "quick.intensity": ["0.5", "1", "1.5"], "quick.position": ["preset", "25", "50", "75"], "style.layout.reveal": ["word", "group", "karaoke"],
        "style.anim.animIn": ANIM_IN, "style.anim.animOut": ANIM_OUT, "style.layout.maxWords": [1, 12], "style.anim.inDur": [0.05, 1.5], "style.anim.outDur": [0.05, 1.5], "quick.size": [25, 200] };
    function clamp(v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
    function sanitize(c) {
        if (!c || typeof c !== "object") return null;
        var op = String(c.op || ""), out = { op: op };
        switch (op) {
            case "place": out.y = clamp(c.y, 0, 100, 75); if (c.x !== undefined) out.x = clamp(c.x, 0, 100, 50); return out;
            case "placeZones": out.baseY = clamp(c.baseY, 0, 100, 62); out.accentY = clamp(c.accentY, 0, 100, 25); return out;
            case "nudge": out.kx = clamp(c.kx, -1, 1, 0); out.ky = clamp(c.ky, -1, 1, 0); if (c.px !== undefined) out.px = clamp(c.px, 1, 1500, 20); return out;
            case "size": out.sign = Number(c.sign) < 0 ? -1 : 1; if (c.pct !== undefined) out.pct = clamp(c.pct, 1, 100, 10); return out;
            case "scale": out.factor = clamp(c.factor, 0.3, 3, 1); return out;
            case "time": ["shift", "dIn", "dOut"].forEach(function (k) { if (c[k] !== undefined) out[k] = clamp(c[k], -1, 1, 0); });
                if (c.amount !== undefined) out.amount = clamp(c.amount, 0.01, 600, 0.1); if (c.frames) out.frames = true; return out;
            case "animIn": if (ANIM_IN.indexOf(c.id) < 0) return null; out.id = c.id; return out;
            case "animOut": if (ANIM_OUT.indexOf(c.id) < 0) return null; out.id = c.id; return out;
            case "scope": if (["source", "selected", "all"].indexOf(c.id) < 0) return null; out.id = c.id; return out;
            case "preset": if (!c.id || !/^[a-z0-9\-_]{1,40}$/i.test(String(c.id))) return null; out.id = String(c.id); return out;
            case "set":
                var allowed = SET_PATHS[c.path]; if (!allowed) return null; out.path = c.path;
                if (typeof allowed[0] === "number") out.value = clamp(c.value, allowed[0], allowed[1], allowed[0]);
                else { if (allowed.indexOf(String(c.value)) < 0) return null; out.value = String(c.value); }
                return out;
            case "translate": var to = String(c.to || "").toLowerCase(); if (!LANGS[to]) return null; out.to = to; return out;
            case "select": if (["captions", "all", "accents", "base", "phrase", "video", "control", "none"].indexOf(c.target) < 0) return null; out.target = c.target; return out;
            case "mask": out.shape = c.shape === "ellipse" ? "ellipse" : "rect"; ["x", "y", "w", "h"].forEach(function (k, i) { out[k] = clamp(c[k], i < 2 ? -50 : 1, i < 2 ? 150 : 200, i < 2 ? 10 : 80); });
                out.feather = clamp(c.feather, 0, 100, 0); out.invert = !!c.invert; return out;
            case "roto": return out;
            case "resetPos": case "applyStyle": case "behind": case "avoidFace": case "faceScan": case "recognize": case "create": case "update": case "updateAll":
            case "fixText": case "fillers": case "emoji": case "dynamic": case "calm": case "control": return out;
            case "delete": return out;   // always shown in the plan first; runs only after «Применить»
        }
        return null;
    }
    function extractJson(text) {
        var s = String(text || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
        try { return JSON.parse(s); } catch (e) {}
        var a = s.indexOf("{"), b = s.lastIndexOf("}");
        if (a >= 0 && b > a) { try { return JSON.parse(s.substring(a, b + 1)); } catch (e2) {} }
        return null;
    }
    function parseReply(text) {
        var j = extractJson(text);
        if (!j || typeof j !== "object") return null;
        var list = Array.isArray(j.commands) ? j.commands : (j.op ? [j] : []), cmds = [];
        for (var i = 0; i < list.length && cmds.length < 12; i++) { var c = sanitize(list[i]); if (c) cmds.push(c); }
        return { say: typeof j.say === "string" ? j.say.slice(0, 400) : "", commands: cmds, dropped: list.length - cmds.length };
    }
    // "dynamic" / "calm" are shortcuts for a few style settings (+ updating the captions if they exist).
    function expand(cmds) {
        var out = [], s = api.state() || {};
        cmds.forEach(function (c) {
            if (c.op === "dynamic") out.push({ op: "set", path: "quick.intensity", value: "1.5" }, { op: "set", path: "style.layout.reveal", value: "word" },
                { op: "set", path: "style.anim.animIn", value: "pop" }, { op: "set", path: "style.anim.animOut", value: "fade" }, { op: "set", path: "style.anim.inDur", value: 0.18 });
            else if (c.op === "calm") out.push({ op: "set", path: "quick.intensity", value: "0.5" }, { op: "set", path: "style.layout.reveal", value: "group" },
                { op: "set", path: "style.anim.animIn", value: "blurRise" }, { op: "set", path: "style.anim.animOut", value: "fade" }, { op: "set", path: "style.anim.inDur", value: 0.35 });
            else { out.push(c); return; }
            if (s.canUpdate) out.push({ op: "updateAll" });
        });
        return out;
    }

    // ---------- prompts ----------
    var SYSTEM = [
        "Ты — помощник внутри панели субтитров NOIR для Adobe After Effects. Пользователь пишет по-русски или по-английски. Превращай просьбу в короткий список команд.",
        "Отвечай ТОЛЬКО одним JSON-объектом без пояснений вокруг: {\"say\": \"что ты сделаешь, 1-2 коротких предложения на языке пользователя\", \"commands\": [ ... ]}.",
        "Если просьба не про субтитры или непонятна — верни commands: [] и в say задай один уточняющий вопрос.",
        "Команды (поле op), проценты — доли высоты/ширины кадра 0-100, y=0 верх кадра, y=100 низ:",
        "{\"op\":\"avoidFace\"} — найти лицо в кадре и переставить субтитры так, чтобы они не закрывали лицо. Для просьб «не закрывай лицо», «расположи красиво».",
        "{\"op\":\"place\",\"y\":75} — поставить фразы на высоту y (25 вверху, 50 по центру, 75 внизу). {\"op\":\"placeZones\",\"baseY\":62,\"accentY\":25} — обычные слова на baseY, акценты на accentY.",
        "{\"op\":\"nudge\",\"kx\":0,\"ky\":-1,\"px\":40} — сдвинуть на px пикселей: kx=-1 влево, 1 вправо, ky=-1 вверх, 1 вниз.",
        "{\"op\":\"scale\",\"factor\":1.2} — размер текста в разы. {\"op\":\"size\",\"sign\":1,\"pct\":15} — на pct процентов.",
        "{\"op\":\"time\",\"shift\":-1,\"amount\":0.3} — сдвиг по времени (shift -1 раньше, 1 позже; amount секунд; \"frames\":true — в кадрах). dIn/dOut: -1/1 — начало/конец раньше/позже.",
        "{\"op\":\"animIn\",\"id\":\"pop\"} — появление. id: " + ANIM_IN.join(", ") + ". {\"op\":\"animOut\",\"id\":\"fade\"} — исчезание. id: " + ANIM_OUT.join(", ") + ".",
        "{\"op\":\"preset\",\"id\":\"old-money\"} — выбрать стиль из presets в состоянии, затем {\"op\":\"applyStyle\"} — применить к готовым субтитрам.",
        "{\"op\":\"resetPos\"} — исходные места. {\"op\":\"behind\"} — под выделенный слой. {\"op\":\"create\"}, {\"op\":\"update\"} (текущая фраза), {\"op\":\"updateAll\"}, {\"op\":\"recognize\"}.",
        "{\"op\":\"scope\",\"id\":\"source|selected|all\"} — что менять. {\"op\":\"delete\"} — удалить субтитры (только если просят явно). {\"op\":\"control\"} — добавить пульт со слайдерами в AE.",
        "Текст субтитров: {\"op\":\"translate\",\"to\":\"en\"} — перевести (to: " + Object.keys(LANGS).join(", ") + "); {\"op\":\"fixText\"} — исправить ошибки распознавания; {\"op\":\"fillers\"} — убрать слова-паразиты; {\"op\":\"emoji\"} — добавить эмодзи к ключевым словам.",
        "Настроение: {\"op\":\"dynamic\"} — динамичнее, энергичнее; {\"op\":\"calm\"} — спокойнее, мягче.",
        "Слои: {\"op\":\"select\",\"target\":\"captions|all|accents|base|phrase|video|control|none\"} — выделить в таймлайне (субтитры этого видео, все NOIR, акценты, обычные слова, текущую фразу, видео, пульт, снять выделение).",
        "{\"op\":\"mask\",\"shape\":\"ellipse|rect\",\"x\":10,\"y\":10,\"w\":80,\"h\":80,\"feather\":10,\"invert\":false} — маска на выделенном слое (или на видео), x/y/w/h в % слоя, feather в %.",
        "{\"op\":\"roto\"} — подготовить «текст за человеком»: копия видео над субтитрами, открыта для Roto Brush (обвести человека кистью пользователь делает сам — скрипты AE этого не умеют).",
        "Правила: не придумывай команд, которых нет в списке. Не больше 6 команд. Сначала текст, потом расположение, размер, анимация.",
        "Примеры:",
        "«настрой красиво, чтобы лицо не закрывали» → {\"say\":\"Найду лицо и уберу с него субтитры.\",\"commands\":[{\"op\":\"avoidFace\"}]}",
        "«переведи на английский и сделай динамичнее» → {\"say\":\"Переведу на английский и сделаю анимацию резче.\",\"commands\":[{\"op\":\"translate\",\"to\":\"en\"},{\"op\":\"dynamic\"}]}",
        "«убери эээ и ну» → {\"say\":\"Уберу слова-паразиты.\",\"commands\":[{\"op\":\"fillers\"}]}"
    ].join("\n");
    var TEXT_SYSTEM = {
        translate: "You translate video subtitles. Input: JSON {\"lines\":[{\"i\":0,\"text\":\"...\"}], \"to\":\"<language>\"}. Translate every line into the target language, natural and short, as spoken subtitles. " +
            "Keep markup: words wrapped in *asterisks* are accents — wrap their translation in *asterisks* too; keep ~tildes~ the same way; keep | and ↵ where they belong. Never merge or split lines. " +
            "Answer ONLY JSON {\"lines\":[{\"i\":0,\"text\":\"...\"}]} with the same i values.",
        fixText: "You fix speech-recognition errors in subtitles. Input: JSON {\"lines\":[{\"i\":0,\"text\":\"...\"}]}. Fix misheard words, names, spelling and obvious grammar slips. " +
            "Do NOT rephrase, do NOT translate, do NOT add or remove words: every line must keep exactly the same number of words. Keep *, ~, | and ↵ markup. " +
            "Answer ONLY JSON {\"lines\":[{\"i\":0,\"text\":\"...\"}]} with the same i values; return a line unchanged if it is correct.",
        emoji: "You add emoji to video subtitles. Input: JSON {\"lines\":[{\"i\":0,\"text\":\"...\"}]}. For lines where it fits, pick ONE emoji for one key word (index of the word in the line, from 0). Skip most lines; at most one emoji per line. " +
            "Answer ONLY JSON {\"items\":[{\"i\":0,\"word\":2,\"emoji\":\"🔥\"}]}."
    };

    function fetchJson(url, options, timeoutMs) {
        var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : 0;
        var o = options || {}; if (ctl) o.signal = ctl.signal;
        return fetch(url, o).then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }, function (e) { clearTimeout(timer); throw e; });
    }
    function base() { return settings.endpoint.replace(/\/+$/, ""); }
    function detect() {
        return fetchJson(base() + "/api/tags", {}, 2500).then(function (j) {
            models = (j.models || []).map(function (m) { return m.name; }).filter(function (n) { return !/embed|bge|nomic/i.test(n); });
            online = models.length > 0;
            if (online && (!settings.model || models.indexOf(settings.model) < 0)) {
                var pick = models.filter(function (n) { return /qwen|llama|mistral|gemma|phi|deepseek/i.test(n); })[0] || models[0];
                settings.model = pick; saveSettings(settings);
            }
            return online;
        }, function () { online = false; models = []; return false; });
    }
    function chat(system, user, timeout) {
        var body = { model: settings.model, stream: false, format: "json", options: { temperature: 0.2 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
        return fetchJson(base() + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, timeout || 120000)
            .then(function (j) { return j && j.message && j.message.content; });
    }
    function askModel(text, context) {
        return chat(SYSTEM, "Состояние (context):\n" + JSON.stringify(context) + "\n\nПросьба: " + text).then(parseReply);
    }
    // Text tasks go in chunks of 30 lines; the answer is matched back by line index.
    function askLines(kind, lines, extra) {
        var chunks = [], i, out = {};
        for (i = 0; i < lines.length; i += 30) chunks.push(lines.slice(i, i + 30).map(function (s, k) { return { i: i + k, text: s }; }).filter(function (x) { return x.text.trim(); }));
        var chain = Promise.resolve();
        chunks.forEach(function (chunk) {
            if (!chunk.length) return;
            chain = chain.then(function () {
                var payload = { lines: chunk }; for (var k in extra) payload[k] = extra[k];
                return chat(TEXT_SYSTEM[kind], JSON.stringify(payload), 240000).then(function (content) {
                    var j = extractJson(content);
                    if (!j) throw new Error("модель ответила не в том формате");
                    (j.lines || []).forEach(function (x) { if (x && typeof x.text === "string" && isFinite(x.i)) out[Number(x.i)] = x.text.replace(/\s*\n\s*/g, " ").trim(); });
                    (j.items || []).forEach(function (x) { if (x && isFinite(x.i)) out[Number(x.i)] = x; });
                });
            });
        });
        return chain.then(function () { return out; });
    }

    // ---------- text changes: computed first, shown as "before → after", applied on «Применить» ----------
    function words(line) { return String(line).trim() ? String(line).trim().split(/\s+/) : []; }
    var EMOJI = [["деньг", "💰"], ["денег", "💰"], ["доллар", "💵"], ["рубл", "💸"], ["бизнес", "💼"], ["работ", "💼"], ["любов", "❤️"], ["люблю", "❤️"], ["сердц", "❤️"], ["огон", "🔥"], ["огонь", "🔥"],
        ["горяч", "🔥"], ["врем", "⏰"], ["дом", "🏠"], ["квартир", "🏠"], ["машин", "🚗"], ["иде", "💡"], ["успех", "🏆"], ["побед", "🏆"], ["рост", "📈"], ["цел", "🎯"], ["ракет", "🚀"], ["быстр", "🚀"],
        ["мозг", "🧠"], ["смешн", "😂"], ["подар", "🎁"], ["вкусн", "😋"], ["сил", "💪"], ["спорт", "💪"], ["музык", "🎵"], ["телефон", "📱"], ["фото", "📸"], ["мир", "🌍"], ["солнц", "☀️"], ["звезд", "⭐"],
        ["money", "💰"], ["dollar", "💵"], ["business", "💼"], ["work", "💼"], ["love", "❤️"], ["heart", "❤️"], ["fire", "🔥"], ["hot", "🔥"], ["time", "⏰"], ["home", "🏠"], ["house", "🏠"], ["car", "🚗"],
        ["idea", "💡"], ["win", "🏆"], ["success", "🏆"], ["grow", "📈"], ["goal", "🎯"], ["fast", "🚀"], ["brain", "🧠"], ["funny", "😂"], ["gift", "🎁"], ["tasty", "😋"], ["strong", "💪"], ["music", "🎵"],
        ["phone", "📱"], ["photo", "📸"], ["world", "🌍"], ["sun", "☀️"], ["star", "⭐"]];
    var HAS_EMOJI = /[☀-➿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
    function core(token) { return token.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, ""); }
    // Glues the emoji to the word (no space): the number of words stays the same, so timings stay exact.
    function glue(token, emoji) { var m = /^(.*[A-Za-zА-Яа-яЁё0-9])([^A-Za-zА-Яа-яЁё0-9]*)$/.exec(token); return m ? m[1] + emoji + m[2] : token + emoji; }
    function localEmoji(lines) {
        return lines.map(function (line) {
            if (!line.trim() || HAS_EMOJI.test(line)) return line;
            var ws = words(line);
            for (var i = 0; i < ws.length; i++) {
                var c = core(ws[i]);
                if (c.length < 3) continue;
                for (var k = 0; k < EMOJI.length; k++) if (c.indexOf(EMOJI[k][0]) === 0) { ws[i] = glue(ws[i], EMOJI[k][1]); return ws.join(" "); }
            }
            return line;
        });
    }
    // → Promise of { title, changes:[{i,before,after}], note, apply() }
    function prepareText(cmd) {
        var s = api.state() || {};
        if (!s.hasData) return Promise.reject(new Error(t("as.noText")));
        var lines = String(s.text).split("\n");
        if (cmd.op === "fillers") return api.call("text.fillers", { dry: true }).then(function (r) {
            return { title: t("as.fillers", { n: r.removed }), changes: r.changes.map(function (c) { return { i: c.phrase, before: c.before, after: c.after }; }), note: t("as.fillersNote"),
                apply: function () { return api.call("text.fillers", {}); } };
        });
        function result(title, next, note) {
            var changes = [];
            next.forEach(function (line, i) { if (line !== lines[i]) changes.push({ i: i, before: lines[i], after: line }); });
            return { title: title, changes: changes, note: note, apply: function () { return api.call("text.replace", { text: next.join("\n"), why: title }); } };
        }
        if (cmd.op === "emoji") {
            if (!online) return Promise.resolve(result(t("as.emoji"), localEmoji(lines), t("as.emojiNote")));
            return askLines("emoji", lines, {}).then(function (got) {
                var next = lines.slice();
                Object.keys(got).forEach(function (k) {
                    var it = got[k], ws = words(next[k] || ""), w = Number(it.word);
                    if (!ws.length || !(w >= 0 && w < ws.length) || !HAS_EMOJI.test(String(it.emoji || "")) || HAS_EMOJI.test(next[k])) return;
                    ws[w] = glue(ws[w], String(it.emoji).slice(0, 8)); next[k] = ws.join(" ");
                });
                return result(t("as.emoji"), next, t("as.emojiNote"));
            });
        }
        if (!online) return Promise.reject(new Error(t("as.needAi")));
        if (cmd.op === "fixText") return askLines("fixText", lines, {}).then(function (got) {
            var next = lines.slice(), skipped = 0;
            Object.keys(got).forEach(function (k) {
                if (typeof got[k] !== "string") return;
                if (words(got[k]).length !== words(lines[k]).length) { skipped++; return; }       // a rephrased line would move timings: keep the original
                next[k] = got[k];
            });
            return result(t("as.fix"), next, t("as.fixNote") + (skipped ? " " + t("as.fixSkipped", { n: skipped }) : ""));
        });
        if (cmd.op === "translate") return askLines("translate", lines, { to: LANGS[cmd.to] }).then(function (got) {
            var next = lines.slice(), missing = 0;
            lines.forEach(function (line, i) { if (!line.trim()) return; if (typeof got[i] === "string" && got[i].trim()) next[i] = got[i]; else missing++; });
            return result(t("as.translate", { lang: LANG_NAMES[cmd.to] || cmd.to }), next, t("as.translateNote") + (missing ? " " + t("as.translateMissing", { n: missing }) : ""));
        });
        return Promise.reject(new Error(cmd.op));
    }

    // ---------- offline understanding of simple phrases ----------
    var ANIM_WORDS = [[/по букв/, "letRise"], [/печат/, "type"], [/pop|поп/, "pop"], [/fade|плавн|проявл/, "fade"], [/blur|размыт/, "blur"], [/punch|удар/, "punch"], [/zoom|зум/, "zoom"],
        [/slam|слэм/, "slam"], [/grow|рост/, "grow"], [/поворот|rotate/, "rotate"], [/снизу|вверх/, "rise"], [/сверху|вниз/, "drop"], [/слева/, "left"], [/справа/, "right"], [/нет|без|убер/, "none"]];
    var LANG_WORDS = [[/англ|english/, "en"], [/русск|russian/, "ru"], [/испан|spanish/, "es"], [/немец|german/, "de"], [/франц|french/, "fr"], [/итальян|italian/, "it"], [/португ|portug/, "pt"],
        [/украин|ukrain/, "uk"], [/казах|kazakh/, "kk"], [/турец|turkish/, "tr"], [/китай|chinese/, "zh"], [/япон|japanese/, "ja"], [/корей|korean/, "ko"], [/араб|arabic/, "ar"]];
    function number(text, fallback) { var m = /(\d+(?:[.,]\d+)?)/.exec(text); return m ? Number(m[1].replace(",", ".")) : fallback; }
    function animId(text, outgoing) {
        if (/whip|вип/.test(text)) return /справа|вправо/.test(text) || outgoing ? "whipR" : "whipL";
        if (outgoing) { if (/вверх|вверху/.test(text)) return "up"; if (/вниз/.test(text)) return "down"; if (/влево|слева/.test(text)) return "left"; if (/вправо|справа/.test(text)) return "right"; if (/уменьш|shrink/.test(text)) return "shrink"; }
        for (var i = 0; i < ANIM_WORDS.length; i++) if (ANIM_WORDS[i][1] && ANIM_WORDS[i][0].test(text)) return ANIM_WORDS[i][1];
        return null;
    }
    // One simple clause -> {say, commands} or null.
    function clause(t0) {
        var m, cmd;
        if (/перев|translat/.test(t0)) {
            for (var li = 0; li < LANG_WORDS.length; li++) if (LANG_WORDS[li][0].test(t0)) return { say: "Переведу на " + LANG_NAMES[LANG_WORDS[li][1]], commands: [{ op: "translate", to: LANG_WORDS[li][1] }] };
            return { say: "На какой язык перевести? Например: «переведи на английский».", commands: [] };
        }
        if (/паразит|филлер|эээ|\bээ\b|\bэм\b|filler|\bum\b|\buh\b/.test(t0)) return { say: "Уберу слова-паразиты", commands: [{ op: "fillers" }] };
        if (/эмодз|эмоджи|смайл|emoji/.test(t0)) return { say: "Добавлю эмодзи к ключевым словам", commands: [{ op: "emoji" }] };
        if (/ошибк|опечат|исправ.*текст|грамот|fix.*(text|typo|error)/.test(t0)) return { say: "Исправлю ошибки распознавания", commands: [{ op: "fixText" }] };
        if (/динамичн|энергичн|живее|резче|бодрее|dynamic|energetic/.test(t0)) return { say: "Сделаю динамичнее", commands: [{ op: "dynamic" }] };
        if (/спокойн|мягче|плавнее|calm|softer/.test(t0)) return { say: "Сделаю спокойнее", commands: [{ op: "calm" }] };
        if (/roto|рото|выреж|вырез|за человек.*(сдела|настро|хочу)|текст за человеком/.test(t0)) return { say: "Подготовлю Roto Brush: копия видео над субтитрами, обвести человека нужно один раз кистью", commands: [{ op: "roto" }] };
        if (/маск|виньет/.test(t0)) {
            var mk = { op: "mask", shape: /круг|овал|эллипс|виньет|ellipse|circle/.test(t0) ? "ellipse" : "rect", x: 10, y: 10, w: 80, h: 80, feather: /мягк|растуш|виньет|feather/.test(t0) ? 20 : 0, invert: /инверт|снаружи|вокруг|invert/.test(t0) };
            if (/верх/.test(t0)) { mk.x = 0; mk.y = 0; mk.w = 100; mk.h = 50; } else if (/низ/.test(t0)) { mk.x = 0; mk.y = 50; mk.w = 100; mk.h = 50; } else if (/лев/.test(t0)) { mk.x = 0; mk.y = 0; mk.w = 50; mk.h = 100; } else if (/прав/.test(t0)) { mk.x = 50; mk.y = 0; mk.w = 50; mk.h = 100; }
            if (/виньет/.test(t0)) { mk.x = 5; mk.y = 5; mk.w = 90; mk.h = 90; mk.feather = 30; }
            return { say: "Добавлю маску", commands: [mk] };
        }
        if (/выдел|select/.test(t0) && !/выделенн/.test(t0)) {
            var tg = /акцент/.test(t0) ? "accents" : /обычн/.test(t0) ? "base" : /фраз/.test(t0) ? "phrase" : /видео|ролик|футаж|video/.test(t0) ? "video" : /пульт|control/.test(t0) ? "control" : /сним|ничего|none/.test(t0) ? "none" : /все noir|всё noir/.test(t0) ? "all" : "captions";
            return { say: "Выделю в таймлайне", commands: [{ op: "select", target: tg }] };
        }
        if (/сним.*выдел/.test(t0)) return { say: "Сниму выделение", commands: [{ op: "select", target: "none" }] };
        if (/пульт|слайдер|контрол|control/.test(t0)) return { say: "Добавлю пульт со слайдерами в AE", commands: [{ op: "control" }] };
        if (/лиц|не закрыв|не загораж|не перекрыв/.test(t0)) return { say: "Ищу лицо и убираю с него субтитры", commands: [{ op: "avoidFace" }] };
        if (/распозн/.test(t0)) return { say: "Распознаю речь выбранного слоя", commands: [{ op: "recognize" }] };
        if (/обнов/.test(t0)) return /все/.test(t0) ? { say: "Обновляю все фразы", commands: [{ op: "updateAll" }] } : { say: "Обновляю текущую фразу", commands: [{ op: "update" }] };
        if (/созда|сдела.*субтитр/.test(t0)) return { say: "Создаю субтитры", commands: [{ op: "create" }] };
        if (/за человек|под слой|за спин|позади/.test(t0)) return { say: "Ставлю субтитры под выделенный слой", commands: [{ op: "behind" }] };
        if (/удал/.test(t0)) return { say: "Удаляю выбранные субтитры (можно отменить Ctrl+Z)", commands: [{ op: "delete" }] };
        if (/исходн|сброс|верни/.test(t0)) return { say: "Возвращаю субтитры на исходные места", commands: [{ op: "resetPos" }] };
        if (/(раньше|позже|удлин|продли|укорот|укороч|короче|дольше)/.test(t0)) {
            var frames = /кадр/.test(t0), amount = number(t0, 0), edge = /начал/.test(t0) ? "dIn" : "dOut"; cmd = { op: "time" };
            if (amount) cmd.amount = amount; if (frames) cmd.frames = true;
            if (/удлин|продли|дольше/.test(t0)) cmd.dOut = 1;
            else if (/укорот|укороч|короче/.test(t0)) cmd.dOut = -1;
            else { var dir = /раньше/.test(t0) ? -1 : 1; if (/начал|конец|конц/.test(t0)) cmd[edge] = dir; else cmd.shift = dir; }
            return { say: "Меняю время субтитров", commands: [cmd] };
        }
        if ((m = /(выше|ниже|левее|правее)/.exec(t0))) {
            var px = number(t0, 0), v = { "выше": [0, -1], "ниже": [0, 1], "левее": [-1, 0], "правее": [1, 0] }[m[1]];
            return { say: "Сдвигаю " + m[1] + (px ? " на " + px + " px" : ""), commands: [{ op: "nudge", kx: v[0], ky: v[1], px: px || undefined }] };
        }
        if (/крупн|больше|увелич/.test(t0)) return { say: "Увеличиваю размер", commands: [{ op: "size", sign: 1, pct: number(t0, 0) || undefined }] };
        if (/мельч|меньше|уменьш/.test(t0) && !/появ|выход|исчез/.test(t0)) return { say: "Уменьшаю размер", commands: [{ op: "size", sign: -1, pct: number(t0, 0) || undefined }] };
        if (/исчез|выход|уход/.test(t0)) { var o = animId(t0, true); return o ? { say: "Исчезание: " + o, commands: [{ op: "animOut", id: o }] } : { say: "Не понял, какое исчезание. Например: «исчезание fade».", commands: [] }; }
        if (/появ|вход|анимац/.test(t0)) { var i = animId(t0, false); return i ? { say: "Появление: " + i, commands: [{ op: "animIn", id: i }] } : { say: "Не понял, какое появление. Например: «появление pop».", commands: [] }; }
        if (/стиль/.test(t0) && /примен/.test(t0)) return { say: "Применяю текущий стиль", commands: [{ op: "applyStyle" }] };
        if (/(вверху|наверху|вверх)/.test(t0)) return { say: "Ставлю фразы вверху", commands: [{ op: "place", y: 25 }] };
        if (/(центр|середин|посередин)/.test(t0)) return { say: "Ставлю фразы по центру", commands: [{ op: "place", y: 50 }] };
        if (/(внизу|низ)/.test(t0)) return { say: "Ставлю фразы внизу", commands: [{ op: "place", y: 75 }] };
        if (/выделенн/.test(t0)) return { say: "Область: выделенные слои", commands: [{ op: "scope", id: "selected" }] };
        if (/все субтитр|все noir/.test(t0)) return { say: "Область: все субтитры NOIR", commands: [{ op: "scope", id: "all" }] };
        return null;
    }
    function understand(raw) {
        var s = String(raw).toLowerCase().replace(/ё/g, "е").trim();
        if (!s) return { say: "Напишите, что сделать, например «поставь внизу».", commands: [], known: false };
        var parts = s.split(/\s*(?:,|;|\.\s|\sи\s|\sпотом\s|\sзатем\s|\sand\s|\sthen\s)\s*/), commands = [], says = [], any = false;
        for (var i = 0; i < parts.length; i++) {
            if (!parts[i]) continue;
            var r = clause(parts[i]);
            if (r && r.commands.length) { any = true; commands = commands.concat(r.commands); says.push(r.say); }
            else if (r && r.say) says.push(r.say);
        }
        if (!any) return { say: says.join(" "), commands: [], known: false };
        return { say: says.join("; "), commands: commands, known: true };
    }

    // ---------- executing commands ----------
    function execOne(cmd) {
        switch (cmd.op) {
            case "recognize": api.page("text"); return api.call("recognize");
            case "create": case "updateAll": return api.generate("all");
            case "update": return api.generate("phrase");
            case "set": return api.call("settings.set", { path: cmd.path, value: cmd.value });
            case "control": return api.call("control.add", {});
            case "select": return api.call("layers.select", { target: cmd.target });
            case "mask": return api.call("mask.add", cmd);
            case "roto": return api.call("roto.prepare");
            case "delete": return api.call("run", { command: { op: "delete", confirmed: true } });
            default: return api.call("run", { command: cmd });
        }
    }
    function waitScan() {
        var started = Date.now();
        function step() {
            var w = api.state() || {};
            if (!w.scanning || Date.now() - started > 40000) return Promise.resolve();
            return new Promise(function (r) { setTimeout(r, 600); }).then(function () { return api.call("poll"); }).then(step);
        }
        return step();
    }
    function execAll(cmds) {
        var chain = Promise.resolve(), notes = [];
        cmds.forEach(function (c) {
            chain = chain.then(function () { return execOne(c); }).then(function (resp) {
                if (c.op === "avoidFace" || c.op === "faceScan") return waitScan().then(function () { return api.call("status"); }).then(function (r) { if (r) notes.push(window.NoirI18n ? NoirI18n.host(r) : r); });
                if (typeof resp === "string" && c.op !== "set") notes.push(window.NoirI18n ? NoirI18n.host(resp) : resp);
            }, function (e) { notes.push("⚠ " + (window.NoirI18n ? NoirI18n.host(e && e.message || String(e)) : (e && e.message || e))); });
        });
        return chain.then(function () { return notes; });
    }
    // Human description of a command for the plan preview.
    var IN_NAMES = { none: "без анимации", fade: "fade", pop: "pop", rise: "снизу", blurRise: "снизу с размытием", letRise: "по буквам", type: "печатная машинка" };
    var SET_NAMES = { "quick.intensity": "Сила анимации", "quick.position": "Положение", "style.layout.reveal": "Появление слов", "style.anim.animIn": "Появление", "style.anim.animOut": "Исчезание",
        "style.layout.maxWords": "Слов во фразе", "style.anim.inDur": "Длительность появления, с", "style.anim.outDur": "Длительность исчезания, с", "quick.size": "Размер, %" };
    var VALUE_NAMES = { "0.5": "мягче", "1": "обычно", "1.5": "сильнее", word: "по словам", group: "фразой", karaoke: "караоке" };
    function describe(c) {
        switch (c.op) {
            case "place": return "Поставить фразы на высоту " + c.y + "% кадра";
            case "placeZones": return "Слова на " + c.baseY + "%, акценты на " + c.accentY + "%";
            case "nudge": return "Сдвинуть " + (c.ky < 0 ? "вверх" : c.ky > 0 ? "вниз" : c.kx < 0 ? "влево" : "вправо") + (c.px ? " на " + c.px + " px" : "");
            case "size": return (c.sign > 0 ? "Увеличить" : "Уменьшить") + " текст" + (c.pct ? " на " + c.pct + "%" : "");
            case "scale": return "Размер текста ×" + c.factor;
            case "time": return "Изменить время" + (c.shift ? (c.shift < 0 ? ": раньше" : ": позже") : c.dIn ? ": начало" : c.dOut ? (c.dOut > 0 ? ": удлинить" : ": укоротить") : "") + (c.amount ? " на " + c.amount + (c.frames ? " кадр." : " с") : "");
            case "animIn": return "Появление: " + (IN_NAMES[c.id] || c.id);
            case "animOut": return "Исчезание: " + (IN_NAMES[c.id] || c.id);
            case "set": return (SET_NAMES[c.path] || c.path) + ": " + (VALUE_NAMES[c.value] || IN_NAMES[c.value] || c.value);
            case "scope": return "Менять: " + ({ source: "субтитры этого видео", selected: "выделенные слои", all: "все субтитры NOIR" })[c.id];
            case "preset": return "Выбрать стиль «" + c.id + "»";
            case "applyStyle": return "Применить стиль к готовым субтитрам";
            case "resetPos": return "Вернуть на исходные места";
            case "behind": return "Поставить субтитры под выделенный слой";
            case "avoidFace": return "Найти лицо и убрать с него субтитры";
            case "faceScan": return "Найти лицо на кадре";
            case "recognize": return "Распознать речь выбранного слоя";
            case "create": case "updateAll": return "Создать / обновить все субтитры";
            case "update": return "Обновить текущую фразу";
            case "control": return "Добавить пульт NOIR Control (слайдеры размера, сдвига и цвета подсветки в AE)";
            case "select": return "Выделить: " + ({ captions: "субтитры этого видео", all: "все субтитры NOIR", accents: "акценты", base: "обычные слова", phrase: "текущую фразу", video: "видео", control: "пульт", none: "снять выделение" })[c.target];
            case "mask": return "Маска " + (c.shape === "ellipse" ? "овалом" : "прямоугольником") + " " + c.x + "–" + (c.x + c.w) + "% × " + c.y + "–" + (c.y + c.h) + "%" + (c.feather ? ", растушёвка " + c.feather + "%" : "") + (c.invert ? ", инвертирована" : "");
            case "roto": return "Копия видео над субтитрами, открыть её для Roto Brush (обвести человека — один раз кистью)";
            case "delete": return "Удалить субтитры (Ctrl+Z вернёт)";
        }
        return c.op;
    }

    // ---------- UI ----------
    function close() { if (box && box.parentNode) box.parentNode.removeChild(box); box = null; }
    function el(tag, cls, parent, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e; }
    function button(text, cls, parent) { var b = el("button", "btn small " + cls, parent, text); b.type = "button"; return b; }
    function open() {
        close();
        box = el("section", "noir-assistant"); box.setAttribute("role", "dialog"); box.setAttribute("aria-label", t("as.title"));
        var head = el("div", "as-head", box); el("b", "", head, t("as.title")); var modeEl = el("span", "as-mode", head); modeEl.setAttribute("aria-live", "polite");
        var x = el("button", "as-close", head, "×"); x.type = "button"; x.setAttribute("aria-label", t("as.close"));
        var log = el("div", "as-log", box); log.setAttribute("aria-live", "polite");
        var form = el("form", "as-form", box), input = el("input", "", form); input.type = "text"; input.autocomplete = "off"; input.placeholder = t("as.placeholder"); input.setAttribute("aria-label", t("as.placeholder"));
        var send = el("button", "btn primary", form, t("as.ask")); send.type = "submit";
        var chips = el("div", "as-chips", box);
        var det = el("details", "as-settings", box); el("summary", "", det, t("as.model"));
        var body = el("div", "as-set-body", det);
        var l1 = el("label", "", body, t("as.endpoint")), endpoint = el("input", "as-endpoint", l1); endpoint.type = "text";
        var l2 = el("label", "", body, t("as.modelName")), modelSel = el("select", "as-model", l2);
        var refreshBtn = el("button", "as-refresh", body, t("as.check")); refreshBtn.type = "button";
        var note = el("p", "as-note", body);
        document.body.appendChild(box);
        var busy = false;
        function say(text, who) { if (!text) return; el("div", "as-msg " + who, log, text); log.scrollTop = log.scrollHeight; }
        function paintMode() {
            modeEl.textContent = online ? t("as.ai", { model: settings.model }) : t("as.noAi");
            modeEl.className = "as-mode " + (online ? "on" : "off");
            modelSel.textContent = ""; models.forEach(function (m) { var o = el("option", "", modelSel, m); o.value = m; if (m === settings.model) o.selected = true; });
            endpoint.value = settings.endpoint;
            note.textContent = online ? t("as.connected", { model: settings.model }) : t("as.howTo");
        }
        function refresh() { note.textContent = "…"; return detect().then(paintMode); }
        function card(title) { var c = el("div", "as-plan", log); if (title) el("b", "as-plan-title", c, title); return c; }
        function confirmRow(c) {
            var row = el("div", "as-plan-actions", c), yes = button(t("as.apply"), "primary", row), no = button(t("as.cancel"), "ghost", row);
            log.scrollTop = log.scrollHeight;
            return new Promise(function (resolve) {
                yes.onclick = function () { yes.disabled = no.disabled = true; c.classList.add("applied"); resolve(true); };
                no.onclick = function () { yes.disabled = no.disabled = true; c.classList.add("cancelled"); say(t("as.cancelled"), "note"); resolve(false); };
                yes.focus();
            });
        }
        // Plan preview: nothing changes in AE until «Применить».
        function plan(cmds) {
            var c = card(null), ol = el("ol", "", c);
            cmds.forEach(function (cmd) { el("li", "", ol, describe(cmd)); });
            return confirmRow(c).then(function (ok) { if (ok) return execAll(cmds).then(function (notes) { say(notes.length ? notes.join("\n") : t("as.done"), "note"); }); });
        }
        function textPlan(cmd) {
            say(t("as.preparing"), "ai"); var waiting = log.lastChild;
            return prepareText(cmd).then(function (prep) {
                if (waiting.parentNode) waiting.parentNode.removeChild(waiting);
                if (!prep.changes.length) { say(t("as.nothing"), "note"); return; }
                var c = card(prep.title + " · " + t("as.changes", { n: prep.changes.length }));
                var list = el("div", "as-diff", c);
                prep.changes.slice(0, 8).forEach(function (ch) {
                    var row = el("div", "as-diff-row", list); el("span", "as-diff-n", row, String(ch.i + 1));
                    var pair = el("div", "as-diff-pair", row); el("del", "", pair, ch.before); el("ins", "", pair, ch.after);
                });
                if (prep.changes.length > 8) el("p", "as-note", c, t("as.more", { n: prep.changes.length - 8 }));
                if (prep.note) el("p", "as-note", c, prep.note);
                var update = (api.state() || {}).canUpdate;
                if (update) el("p", "as-note", c, t("as.willUpdate"));
                return confirmRow(c).then(function (ok) {
                    if (!ok) return;
                    return prep.apply().then(function () { return update ? api.generate("all") : null; }).then(function () { say(t("as.doneUndo"), "note"); });
                });
            }, function (e) { if (waiting.parentNode) waiting.parentNode.removeChild(waiting); say("⚠ " + (e && e.message || e), "ai"); });
        }
        function run(reply) {
            var cmds = expand(reply.commands), textOps = cmds.filter(function (c) { return TEXT_OPS[c.op]; }), rest = cmds.filter(function (c) { return !TEXT_OPS[c.op]; });
            var chain = Promise.resolve();
            textOps.forEach(function (c) { chain = chain.then(function () { return textPlan(c); }); });
            if (rest.length) chain = chain.then(function () { return plan(rest); });
            return chain;
        }
        function submit(text) {
            text = String(text || "").trim(); if (!text || busy) return;
            busy = true; say(text, "me"); input.value = "";
            var local = understand(text), wantAi = online && settings.mode !== "local" && !(local.known && local.commands.length && !/лиц|красив|правильн|настро|подбер|сам/.test(text.toLowerCase()));
            var job;
            if (wantAi) {
                say(t("as.thinking"), "ai"); var thinking = log.lastChild;
                job = api.call("context").then(function (ctx) { return askModel(text, ctx || {}); }).then(function (reply) {
                    if (thinking.parentNode) thinking.parentNode.removeChild(thinking);
                    if (!reply) throw new Error(t("as.badFormat"));
                    return reply;
                }).catch(function (e) {
                    if (thinking.parentNode) thinking.parentNode.removeChild(thinking);
                    say(t("as.aiFailed", { err: e && e.message || e }), "ai");
                    if (local.known) return { say: local.say, commands: local.commands };
                    return null;
                });
            } else job = Promise.resolve(local.known ? { say: local.say, commands: local.commands } : (local.say ? { say: local.say, commands: [] } : null));
            job.then(function (reply) {
                if (!reply) { say(online ? t("as.notUnderstood") : t("as.offlineHelp"), "ai"); return; }
                say(reply.say || (reply.commands.length ? t("as.planReady") : t("as.nothing")), "ai");
                if (reply.dropped) say(t("as.dropped", { n: reply.dropped }), "ai");
                if (!reply.commands.length) return;
                return run(reply);
            }).catch(function (e) { say("⚠ " + (e && e.message || e), "ai"); }).then(function () { busy = false; input.focus(); });
        }
        say(t("as.hello"), "ai");
        [t("as.chip1"), t("as.chip2"), t("as.chip3"), t("as.chip4"), t("as.chip5")].forEach(function (text) {
            var b = el("button", "", chips, text); b.type = "button"; b.onclick = function () { submit(text); };
        });
        form.onsubmit = function (ev) { ev.preventDefault(); submit(input.value); };
        x.onclick = close;
        refreshBtn.onclick = refresh;
        modelSel.onchange = function () { settings.model = modelSel.value; saveSettings(settings); paintMode(); };
        endpoint.onchange = function () { settings.endpoint = endpoint.value.trim() || "http://127.0.0.1:11434"; saveSettings(settings); refresh(); };
        box.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.preventDefault(); close(); } });
        paintMode(); detect().then(paintMode);
        input.focus();
    }

    window.NoirAssistant = { init: function (options) { api = options; }, open: open, close: close, understand: understand, parseReply: parseReply, sanitize: sanitize, describe: describe, system: SYSTEM,
        localEmoji: localEmoji, expand: expand, setSettings: function (o) { for (var k in o) settings[k] = o[k]; saveSettings(settings); } };
})();
