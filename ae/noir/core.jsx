/*
 * NOIR CAPTIONS — чистая логика без обращения к AE:
 * JSON, группировка слов, применение правок текста.
 * Тестируется в Node: tests/core.test.js
 */
// Общий объект для всех модулей. В AE живёт в $.global (нужно для app.scheduleTask).
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    // ---------- JSON (в ExtendScript его нет) ----------

    // Разбор только нашего собственного JSON: проверка регуляркой из json2.js,
    // затем eval. Чужие файлы с кодом не пройдут проверку.
    N.parseJSON = function (text) {
        var t = String(text).replace(/^﻿/, "");
        var probe = t.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@")
            .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]")
            .replace(/(?:^|:|,)(?:\s*\[)+/g, "");
        if (!/^[\],:{}\s]*$/.test(probe)) throw new Error("Некорректный JSON");
        return eval("(" + t + ")");
    };

    function quote(s) {
        return '"' + String(s).replace(/[\\"\u0000-\u001f]/g, function (c) {
            var m = { '"': '\\"', "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
            return m[c] || ("\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4));
        }) + '"';
    }

    N.stringify = function (v) {
        if (v === null || v === undefined) return "null";
        var t = typeof v;
        if (t === "number") return isFinite(v) ? String(v) : "null";
        if (t === "boolean") return String(v);
        if (t === "string") return quote(v);
        var out = [], i;
        if (v instanceof Array) {
            for (i = 0; i < v.length; i++) out.push(N.stringify(v[i]));
            return "[" + out.join(",") + "]";
        }
        for (var k in v) if (v.hasOwnProperty(k) && typeof v[k] !== "function") {
            out.push(quote(k) + ":" + N.stringify(v[k]));
        }
        return "{" + out.join(",") + "}";
    };

    // ---------- текст ----------

    var PUNCT_STRIP = /[.,!?;:…«»"()\[\]]/g;

    N.flattenWords = function (data) {
        var out = [];
        for (var i = 0; i < data.segments.length; i++) {
            var ws = data.segments[i].words;
            for (var j = 0; j < ws.length; j++) out.push({
                text: ws[j].text, start: ws[j].start, end: ws[j].end, seg: i
            });
        }
        return out;
    };

    // Текст для редактора: одна строка = один сегмент распознавания.
    N.toEditorText = function (data) {
        var lines = [];
        for (var i = 0; i < data.segments.length; i++) {
            var ws = data.segments[i].words, parts = [];
            for (var j = 0; j < ws.length; j++) parts.push(ws[j].text);
            lines.push(parts.join(" "));
        }
        return lines.join("\n");
    };

    function splitWords(line) {
        var raw = String(line).replace(/^\s+|\s+$/g, "").split(/\s+/), out = [];
        for (var i = 0; i < raw.length; i++) if (raw[i] !== "") out.push(raw[i]);
        return out;
    }

    // Применяет правки из редактора к словам, сохраняя тайминги где можно.
    // Строка с тем же числом слов — тайминги 1:1. Иначе слова строки
    // раскладываются по её интервалу пропорционально длине (+ предупреждение).
    N.applyEdits = function (data, editorText, warnings) {
        var lines = String(editorText).replace(/\r\n?/g, "\n").split("\n");
        var nonEmpty = [];
        for (var i = 0; i < lines.length; i++) nonEmpty.push(lines[i]);
        // лишние пустые строки в конце не считаются (но очищенная последняя фраза — считается)
        while (nonEmpty.length > data.segments.length && /^\s*$/.test(nonEmpty[nonEmpty.length - 1])) nonEmpty.pop();
        if (nonEmpty.length !== data.segments.length) {
            throw new Error("Число строк изменилось (" + nonEmpty.length + " вместо " +
                data.segments.length + "). Правьте слова внутри строк, не добавляйте и не удаляйте строки.");
        }
        var out = [];
        for (var s = 0; s < data.segments.length; s++) {
            var seg = data.segments[s], ws = seg.words, texts = splitWords(nonEmpty[s]);
            if (!texts.length) continue; // строку очистили = фраза удалена
            if (!ws.length) {
                warnings.push("Строка " + (s + 1) + ": у фразы нет таймингов (её удаляли ранее) — пропущена.");
                continue;
            }
            if (texts.length === ws.length) {
                for (var j = 0; j < ws.length; j++) out.push({
                    text: texts[j], start: ws[j].start, end: ws[j].end, seg: s
                });
                continue;
            }
            warnings.push("Строка " + (s + 1) + ": число слов изменилось, тайминги распределены " +
                "пропорционально — проверьте синхронизацию.");
            var t0 = ws[0].start, t1 = ws[ws.length - 1].end, total = 0, k;
            for (k = 0; k < texts.length; k++) total += texts[k].length + 1;
            var acc = 0;
            for (k = 0; k < texts.length; k++) {
                var a = t0 + (t1 - t0) * acc / total;
                acc += texts[k].length + 1;
                out.push({ text: texts[k], start: a, end: t0 + (t1 - t0) * acc / total, seg: s });
            }
        }
        return out;
    };

    // ---------- группировка ----------

    // opts: maxWords, maxChars, pauseBreak (с), punctBreak, stripPunct, caps
    N.groupWords = function (words, opts) {
        var groups = [], cur = null;
        function flush() { if (cur) { groups.push(cur); cur = null; } }
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            var text = opts.stripPunct ? w.text.replace(PUNCT_STRIP, "") : w.text;
            if (opts.caps) text = text.toUpperCase();
            if (text === "" || text === "-" || text === "—") continue;
            if (cur) {
                var gap = w.start - cur.end;
                var len = cur.text.length + 1 + text.length;
                if (cur.words.length >= opts.maxWords || len > opts.maxChars ||
                    gap > opts.pauseBreak || w.seg !== cur.seg) flush();
            }
            if (!cur) cur = { text: text, start: w.start, end: w.end, seg: w.seg, words: [w] };
            else { cur.text += " " + text; cur.end = w.end; cur.words.push(w); }
            if (opts.punctBreak && /[.!?…,;:]$/.test(w.text)) flush();
        }
        flush();
        return groups;
    };

    // Время показа: короткая пауза до следующей группы заполняется,
    // чтобы не мигал пустой кадр. Гарантирует end > start.
    N.timeGroups = function (groups, holdGap, minDur) {
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i], next = groups[i + 1];
            g.outTime = g.end;
            if (next && next.start - g.end < holdGap) g.outTime = next.start;
            if (g.outTime - g.start < minDur) g.outTime = g.start + minDur;
            if (next && g.outTime > next.start) g.outTime = Math.max(next.start, g.start + 0.01);
        }
        return groups;
    };

    // Источник -> композиция. stretch в процентах (100 = норма).
    N.sourceToComp = function (t, layerStartTime, stretch) {
        return layerStartTime + t * stretch / 100;
    };
    N.compToSource = function (t, layerStartTime, stretch) {
        return (t - layerStartTime) * 100 / stretch;
    };
})(NOIR);
