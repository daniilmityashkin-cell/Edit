/* NOIR assistant. Free-form requests go to a language model running on this computer (Ollama, http://127.0.0.1:11434 by default:
   free, offline, nothing leaves the machine). Simple requests are also understood without any model.
   Both paths end in the same small set of command objects, which the panel executes with the same code as its buttons. */
(function () {
    "use strict";
    var api = null, box = null, STORE = "noir.assistant.v1";
    var ANIM_IN = ["none", "fade", "blur", "blurRise", "rise", "drop", "left", "right", "pop", "punch", "zoom", "slam", "whipL", "whipR", "rotate", "grow", "blurPop", "letFade", "letRise", "letPop", "letBlur", "type"];
    var ANIM_OUT = ["none", "fade", "blur", "blurUp", "shrink", "up", "down", "left", "right", "zoom", "whipL", "whipR", "rotate", "slamOut", "letFade", "letRise", "letType"];

    function loadSettings() {
        var d = { endpoint: "http://127.0.0.1:11434", model: "", mode: "auto" };
        try { var s = JSON.parse(localStorage.getItem(STORE) || "{}"); for (var k in s) if (d.hasOwnProperty(k)) d[k] = s[k]; } catch (e) {}
        return d;
    }
    function saveSettings(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }
    var settings = loadSettings(), models = [], online = false;

    // ---------- command validation: nothing from a model is executed unless it is one of these shapes ----------
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
            case "resetPos": case "applyStyle": case "behind": case "avoidFace": case "faceScan": case "recognize": case "create": case "update": case "updateAll": return out;
            case "delete": return out;   // always confirmed by the user before it runs
        }
        return null;
    }
    function extractJson(text) {
        var t = String(text || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
        try { return JSON.parse(t); } catch (e) {}
        var a = t.indexOf("{"), b = t.lastIndexOf("}");
        if (a >= 0 && b > a) { try { return JSON.parse(t.substring(a, b + 1)); } catch (e2) {} }
        return null;
    }
    function parseReply(text) {
        var j = extractJson(text);
        if (!j || typeof j !== "object") return null;
        var list = Array.isArray(j.commands) ? j.commands : (j.op ? [j] : []), cmds = [];
        for (var i = 0; i < list.length && cmds.length < 12; i++) { var c = sanitize(list[i]); if (c) cmds.push(c); }
        return { say: typeof j.say === "string" ? j.say.slice(0, 400) : "", commands: cmds, dropped: list.length - cmds.length };
    }

    // ---------- prompt ----------
    var SYSTEM = [
        "Ты — помощник внутри панели субтитров NOIR для Adobe After Effects. Пользователь пишет по-русски. Превращай просьбу в короткий список команд.",
        "Отвечай ТОЛЬКО одним JSON-объектом без пояснений вокруг: {\"say\": \"что ты сделал, 1-2 коротких предложения по-русски\", \"commands\": [ ... ]}.",
        "Если просьба не про субтитры или непонятна — верни commands: [] и в say задай один уточняющий вопрос.",
        "Команды (поле op), проценты — доли высоты/ширины кадра 0-100, y=0 верх кадра, y=100 низ:",
        "{\"op\":\"avoidFace\"} — найти лицо в кадре и переставить субтитры так, чтобы они не закрывали лицо (мелкий текст ниже лица, крупные акценты выше). Самая подходящая команда для просьб «не закрывай лицо», «расположи красиво».",
        "{\"op\":\"place\",\"y\":75} — поставить фразы целиком на высоту y (25 вверху, 50 по центру, 75 внизу).",
        "{\"op\":\"placeZones\",\"baseY\":62,\"accentY\":25} — обычные слова на высоту baseY, акцентные (крупные) на accentY.",
        "{\"op\":\"nudge\",\"kx\":0,\"ky\":-1,\"px\":40} — сдвинуть на px пикселей: kx=-1 влево, 1 вправо, ky=-1 вверх, 1 вниз.",
        "{\"op\":\"scale\",\"factor\":1.2} — размер текста в разы (1.2 = на 20% крупнее, 0.8 = мельче). Или {\"op\":\"size\",\"sign\":1,\"pct\":15} — на pct процентов.",
        "{\"op\":\"time\",\"shift\":-1,\"amount\":0.3} — сдвинуть по времени (shift -1 раньше, 1 позже; amount секунд; \"frames\":true — в кадрах). dIn: -1/1 — начало раньше/позже, dOut: -1/1 — конец раньше/позже (удлинить = dOut 1).",
        "{\"op\":\"animIn\",\"id\":\"pop\"} — появление. id: " + ANIM_IN.join(", ") + ". {\"op\":\"animOut\",\"id\":\"fade\"} — исчезание. id: " + ANIM_OUT.join(", ") + ".",
        "{\"op\":\"preset\",\"id\":\"old-money\"} — выбрать стиль из списка presets в состоянии (id оттуда), затем {\"op\":\"applyStyle\"} применит его к готовым субтитрам.",
        "{\"op\":\"resetPos\"} — вернуть на исходные места. {\"op\":\"behind\"} — поместить субтитры под выделенный слой (текст «за человеком»).",
        "{\"op\":\"create\"} — создать субтитры из текущего текста. {\"op\":\"update\"} — обновить текущую фразу. {\"op\":\"updateAll\"} — обновить все. {\"op\":\"recognize\"} — распознать речь выбранного слоя.",
        "{\"op\":\"scope\",\"id\":\"source|selected|all\"} — что менять: субтитры этого видео / выделенные слои / все NOIR. {\"op\":\"delete\"} — удалить субтитры (только если просят удалить явно).",
        "Правила: не придумывай команд, которых нет в списке. Не больше 6 команд. Если уместно, сначала расположение, затем размер, затем анимация.",
        "В состоянии (context) есть размеры кадра, текущий стиль, число субтитров, где они стоят и найденное лицо (face), если оно уже искалось.",
        "Примеры:",
        "«настрой красиво, чтобы лицо не закрывали» → {\"say\":\"Нашёл лицо и убрал субтитры с него.\",\"commands\":[{\"op\":\"avoidFace\"}]}",
        "«сделай крупнее и поставь выше» → {\"say\":\"Увеличил на 20% и поднял.\",\"commands\":[{\"op\":\"scale\",\"factor\":1.2},{\"op\":\"nudge\",\"kx\":0,\"ky\":-1,\"px\":80}]}",
        "«пусть появляются резко, а уходят плавно» → {\"say\":\"Появление без анимации, исчезание плавное.\",\"commands\":[{\"op\":\"animIn\",\"id\":\"none\"},{\"op\":\"animOut\",\"id\":\"fade\"}]}"
    ].join("\n");

    function fetchJson(url, options, timeoutMs) {
        var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : 0;
        var o = options || {}; if (ctl) o.signal = ctl.signal;
        return fetch(url, o).then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }, function (e) { clearTimeout(timer); throw e; });
    }
    function detect() {
        return fetchJson(settings.endpoint.replace(/\/+$/, "") + "/api/tags", {}, 2500).then(function (j) {
            models = (j.models || []).map(function (m) { return m.name; }).filter(function (n) { return !/embed|bge|nomic/i.test(n); });
            online = models.length > 0;
            if (online && (!settings.model || models.indexOf(settings.model) < 0)) {
                var pick = models.filter(function (n) { return /qwen|llama|mistral|gemma|phi|deepseek/i.test(n); })[0] || models[0];
                settings.model = pick; saveSettings(settings);
            }
            return online;
        }, function () { online = false; models = []; return false; });
    }
    function askModel(text, context) {
        var body = { model: settings.model, stream: false, format: "json", options: { temperature: 0.2 },
            messages: [{ role: "system", content: SYSTEM }, { role: "user", content: "Состояние (context):\n" + JSON.stringify(context) + "\n\nПросьба: " + text }] };
        return fetchJson(settings.endpoint.replace(/\/+$/, "") + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 120000)
            .then(function (j) { return parseReply(j && j.message && j.message.content); });
    }

    // ---------- offline understanding of simple phrases ----------
    var ANIM_WORDS = [[/по букв/, "letRise"], [/печат/, "type"], [/pop|поп/, "pop"], [/fade|плавн|проявл/, "fade"], [/blur|размыт/, "blur"], [/punch|удар/, "punch"], [/zoom|зум/, "zoom"],
        [/slam|слэм/, "slam"], [/grow|рост/, "grow"], [/поворот|rotate/, "rotate"], [/снизу|вверх/, "rise"], [/сверху|вниз/, "drop"], [/слева/, "left"], [/справа/, "right"], [/нет|без|убер/, "none"]];
    function number(text, fallback) { var m = /(\d+(?:[.,]\d+)?)/.exec(text); return m ? Number(m[1].replace(",", ".")) : fallback; }
    function animId(text, outgoing) {
        if (/whip|вип/.test(text)) return /справа|вправо/.test(text) || outgoing ? "whipR" : "whipL";
        if (outgoing) { if (/вверх|вверху/.test(text)) return "up"; if (/вниз/.test(text)) return "down"; if (/влево|слева/.test(text)) return "left"; if (/вправо|справа/.test(text)) return "right"; if (/уменьш|shrink/.test(text)) return "shrink"; }
        for (var i = 0; i < ANIM_WORDS.length; i++) if (ANIM_WORDS[i][1] && ANIM_WORDS[i][0].test(text)) return ANIM_WORDS[i][1];
        return null;
    }
    // One simple clause -> {say, commands} or null.
    function clause(t) {
        var m, cmd;
        if (/лиц|не закрыв|не загораж|не перекрыв/.test(t)) return { say: "Ищу лицо и убираю с него субтитры", commands: [{ op: "avoidFace" }] };
        if (/распозн/.test(t)) return { say: "Распознаю речь выбранного слоя", commands: [{ op: "recognize" }] };
        if (/обнов/.test(t)) return /все/.test(t) ? { say: "Обновляю все фразы", commands: [{ op: "updateAll" }] } : { say: "Обновляю текущую фразу", commands: [{ op: "update" }] };
        if (/созда|сдела.*субтитр/.test(t)) return { say: "Создаю субтитры", commands: [{ op: "create" }] };
        if (/за человек|под слой|за спин|позади/.test(t)) return { say: "Ставлю субтитры под выделенный слой", commands: [{ op: "behind" }] };
        if (/удал/.test(t)) return { say: "Удаляю выбранные субтитры (можно отменить Ctrl+Z)", commands: [{ op: "delete" }] };
        if (/исходн|сброс|верни/.test(t)) return { say: "Возвращаю субтитры на исходные места", commands: [{ op: "resetPos" }] };
        if (/(раньше|позже|удлин|продли|укорот|укороч|короче|дольше)/.test(t)) {
            var frames = /кадр/.test(t), amount = number(t, 0), edge = /начал/.test(t) ? "dIn" : "dOut"; cmd = { op: "time" };
            if (amount) cmd.amount = amount; if (frames) cmd.frames = true;
            if (/удлин|продли|дольше/.test(t)) cmd.dOut = 1;
            else if (/укорот|укороч|короче/.test(t)) cmd.dOut = -1;
            else { var dir = /раньше/.test(t) ? -1 : 1; if (/начал|конец|конц/.test(t)) cmd[edge] = dir; else cmd.shift = dir; }
            return { say: "Меняю время субтитров", commands: [cmd] };
        }
        if ((m = /(выше|ниже|левее|правее)/.exec(t))) {
            var px = number(t, 0), v = { "выше": [0, -1], "ниже": [0, 1], "левее": [-1, 0], "правее": [1, 0] }[m[1]];
            return { say: "Сдвигаю " + m[1] + (px ? " на " + px + " px" : ""), commands: [{ op: "nudge", kx: v[0], ky: v[1], px: px || undefined }] };
        }
        if (/крупн|больше|увелич/.test(t)) return { say: "Увеличиваю размер", commands: [{ op: "size", sign: 1, pct: number(t, 0) || undefined }] };
        if (/мельч|меньше|уменьш/.test(t) && !/появ|выход|исчез/.test(t)) return { say: "Уменьшаю размер", commands: [{ op: "size", sign: -1, pct: number(t, 0) || undefined }] };
        if (/исчез|выход|уход/.test(t)) { var o = animId(t, true); return o ? { say: "Исчезание: " + o, commands: [{ op: "animOut", id: o }] } : { say: "Не понял, какое исчезание. Например: «исчезание fade».", commands: [] }; }
        if (/появ|вход|анимац/.test(t)) { var i = animId(t, false); return i ? { say: "Появление: " + i, commands: [{ op: "animIn", id: i }] } : { say: "Не понял, какое появление. Например: «появление pop».", commands: [] }; }
        if (/стиль/.test(t) && /примен/.test(t)) return { say: "Применяю текущий стиль", commands: [{ op: "applyStyle" }] };
        if (/(вверху|наверху|вверх)/.test(t)) return { say: "Ставлю фразы вверху", commands: [{ op: "place", y: 25 }] };
        if (/(центр|середин|посередин)/.test(t)) return { say: "Ставлю фразы по центру", commands: [{ op: "place", y: 50 }] };
        if (/(внизу|низ)/.test(t)) return { say: "Ставлю фразы внизу", commands: [{ op: "place", y: 75 }] };
        if (/выделенн/.test(t)) return { say: "Область: выделенные слои", commands: [{ op: "scope", id: "selected" }] };
        if (/все субтитр|все noir/.test(t)) return { say: "Область: все субтитры NOIR", commands: [{ op: "scope", id: "all" }] };
        return null;
    }
    function understand(raw) {
        var t = String(raw).toLowerCase().replace(/ё/g, "е").trim();
        if (!t) return { say: "Напишите, что сделать, например «поставь внизу».", commands: [], known: false };
        var parts = t.split(/\s*(?:,|;|\.\s|\sи\s|\sпотом\s|\sзатем\s)\s*/), commands = [], says = [], any = false;
        for (var i = 0; i < parts.length; i++) {
            if (!parts[i]) continue;
            var r = clause(parts[i]);
            if (r && r.commands.length) { any = true; commands = commands.concat(r.commands); says.push(r.say); }
        }
        if (!any) return { say: "", commands: [], known: false };
        return { say: says.join("; "), commands: commands, known: true };
    }

    // ---------- executing commands ----------
    function execOne(cmd) {
        switch (cmd.op) {
            case "recognize": api.page(0); return api.sendAsync({ action: "click", id: api.roleId("recognize") });
            case "create": api.page(1); return api.sendAsync({ action: "click", id: api.roleId("generate") });
            case "update": return api.sendAsync({ action: "click", id: api.roleId("updatePhrase") });
            case "updateAll": return api.sendAsync({ action: "click", id: api.roleId("generate") });
            case "delete": if (!window.confirm("Удалить выбранные субтитры? Отмена — Ctrl+Z в AE.")) return Promise.resolve({ skipped: true });
                return api.sendAsync({ action: "run", command: { op: "delete", confirmed: true } });
            default: return api.sendAsync({ action: "run", command: cmd });
        }
    }
    function waitScan(say) {
        var started = Date.now();
        function step() {
            var w = api.workflow();
            if (!w.scanning || Date.now() - started > 40000) return Promise.resolve();
            return new Promise(function (r) { setTimeout(r, 600); }).then(function () { return api.sendAsync({ action: "poll" }); }).then(step);
        }
        return step();
    }
    function execAll(cmds, say) {
        var chain = Promise.resolve(), notes = [];
        cmds.forEach(function (c) {
            chain = chain.then(function () { return execOne(c); }).then(function (resp) {
                if (resp && resp.error) { notes.push("⚠ " + resp.error); return null; }
                if (c.op === "avoidFace" || c.op === "faceScan") return waitScan().then(function () { return api.sendAsync({ action: "poll" }); }).then(function () { return api.sendAsync({ action: "status" }); }).then(function (r) { if (r && r.notice) notes.push(r.notice); });
                if (resp && resp.notice) notes.push(resp.notice);
                return new Promise(function (r) { setTimeout(r, 140); });
            });
        });
        return chain.then(function () { return notes; });
    }

    // ---------- UI ----------
    function close() { if (box && box.parentNode) box.parentNode.removeChild(box); box = null; }
    function open() {
        close();
        box = document.createElement("section"); box.className = "noir-assistant"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Помощник NOIR");
        box.innerHTML = '<div class="as-head"><b>Помощник</b><span class="as-mode" aria-live="polite"></span><button type="button" class="as-close" aria-label="Закрыть">×</button></div>' +
            '<div class="as-log" aria-live="polite"></div><form class="as-form"><input type="text" autocomplete="off" placeholder="Что сделать? Например: расположи красиво, чтобы лицо не закрывали" aria-label="Просьба помощнику"><button type="submit">Выполнить</button></form>' +
            '<div class="as-chips"></div>' +
            '<details class="as-settings"><summary>ИИ-модель на этом компьютере</summary><div class="as-set-body"><label>Адрес Ollama <input type="text" class="as-endpoint"></label><label>Модель <select class="as-model"></select></label><button type="button" class="as-refresh">Проверить подключение</button><p class="as-note"></p></div></details>';
        document.body.appendChild(box);
        var log = box.querySelector(".as-log"), input = box.querySelector(".as-form input"), chips = box.querySelector(".as-chips"), modeEl = box.querySelector(".as-mode");
        var endpoint = box.querySelector(".as-endpoint"), modelSel = box.querySelector(".as-model"), note = box.querySelector(".as-note"), busy = false;
        function say(text, who) { if (!text) return; var p = document.createElement("div"); p.className = "as-msg " + who; p.textContent = text; log.appendChild(p); log.scrollTop = log.scrollHeight; }
        function paintMode() {
            modeEl.textContent = online ? "ИИ: " + settings.model : "без ИИ";
            modeEl.className = "as-mode " + (online ? "on" : "off");
            modelSel.textContent = ""; models.forEach(function (m) { var o = document.createElement("option"); o.value = o.textContent = m; if (m === settings.model) o.selected = true; modelSel.appendChild(o); });
            endpoint.value = settings.endpoint;
            note.textContent = online ? "Подключено. Просьбы своими словами обрабатывает модель " + settings.model + "." :
                "ИИ не найден. Установите Ollama (ollama.com), выполните в терминале: ollama pull qwen2.5:7b — и нажмите «Проверить подключение». Без модели работают простые команды.";
        }
        function refresh() { note.textContent = "Проверяю…"; return detect().then(paintMode); }
        function submit(text) {
            text = String(text || "").trim(); if (!text || busy) return;
            busy = true; say(text, "me"); input.value = "";
            var local = understand(text), wantAi = online && settings.mode !== "local" && !(local.known && local.commands.length && !/лиц|красив|правильн|настро|подбер|сам/.test(text.toLowerCase()));
            var job;
            if (wantAi) {
                say("Думаю…", "ai"); var thinking = log.lastChild;
                job = api.sendAsync({ action: "context" }).then(function (r) { return askModel(text, (r && r.context) || {}); }).then(function (reply) {
                    if (thinking.parentNode) thinking.parentNode.removeChild(thinking);
                    if (!reply) throw new Error("Модель ответила не в том формате.");
                    return reply;
                }).catch(function (e) {
                    if (thinking.parentNode) thinking.parentNode.removeChild(thinking);
                    say("ИИ не ответил (" + (e && e.message || e) + ").", "ai");
                    if (local.known) return { say: local.say, commands: local.commands };
                    return null;
                });
            } else job = Promise.resolve(local.known ? { say: local.say, commands: local.commands } : null);
            job.then(function (reply) {
                if (!reply) { say(online ? "Не понял. Переформулируйте." : "Без ИИ я знаю простые команды: положение, сдвиг, размер, появление/исчезание, время, создать, обновить, «не закрывай лицо». Для свободных просьб подключите ИИ-модель (раздел ниже).", "ai"); return; }
                say(reply.say || (reply.commands.length ? "Выполняю." : "Нечего выполнять."), "ai");
                if (reply.dropped) say("Пропущено команд, которых я не знаю: " + reply.dropped + ".", "ai");
                if (!reply.commands.length) return;
                return execAll(reply.commands).then(function (notes) { if (notes.length) say(notes.join("\n"), "note"); });
            }).catch(function (e) { say("Ошибка: " + (e && e.message || e), "ai"); }).then(function () { busy = false; input.focus(); });
        }
        say("Привет! Скажите, что сделать с субтитрами — простыми словами.", "ai");
        ["расположи так, чтобы не закрывать лицо", "поставь внизу и сделай крупнее", "появление pop, исчезание fade", "сдвинь раньше на 0.3"].forEach(function (text) {
            var b = document.createElement("button"); b.type = "button"; b.textContent = text; b.onclick = function () { submit(text); }; chips.appendChild(b);
        });
        box.querySelector("form").onsubmit = function (ev) { ev.preventDefault(); submit(input.value); };
        box.querySelector(".as-close").onclick = close;
        box.querySelector(".as-refresh").onclick = refresh;
        modelSel.onchange = function () { settings.model = modelSel.value; saveSettings(settings); paintMode(); };
        endpoint.onchange = function () { settings.endpoint = endpoint.value.trim() || "http://127.0.0.1:11434"; saveSettings(settings); refresh(); };
        box.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.preventDefault(); close(); } });
        paintMode(); detect().then(paintMode);
        input.focus();
    }

    window.NoirAssistant = { init: function (options) { api = options; }, open: open, close: close, understand: understand, parseReply: parseReply, sanitize: sanitize, system: SYSTEM,
        setSettings: function (o) { for (var k in o) settings[k] = o[k]; saveSettings(settings); } };
})();
