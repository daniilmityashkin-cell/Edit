/*
 * NOIR CAPTIONS — генератор: группы слов -> текстовые слои AE с анимацией.
 *
 * Каждое слово (или вся фраза, если акцентов нет и режим «фраза целиком»)
 * — отдельный редактируемый текстовый слой. Слова раскладываются по строкам
 * с общей базовой линией; акцентные слова получают свой стиль и строку.
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    N.LAYER_TAG = "noir-captions:generated";
    N.REF_WIDTH = 1080; // размеры в стилях заданы для кадра шириной 1080

    // Анимации описаны состоянием «вне кадра»: op — прозрачность,
    // sc — масштаб %, dx/dy — смещение в долях параметра distance,
    // blur — размытие в долях параметра blur, over — перелёт масштаба.
    N.ANIM_IN = [
        { id: "none", label: "Нет — жёсткая смена" },
        { id: "fade", label: "Fade", op: 0 },
        { id: "blur", label: "Blur + fade", op: 0, blur: 1 },
        { id: "blurRise", label: "Снизу + blur", op: 0, dy: 1, blur: 1 },
        { id: "pop", label: "Pop (scale + overshoot)", op: 0, sc: 70, over: 108 },
        { id: "punch", label: "Punch (удар 125 → 100)", sc: 125 },
        { id: "rise", label: "Снизу вверх", op: 0, dy: 1 },
        { id: "drop", label: "Сверху вниз", op: 0, dy: -1 },
        { id: "left", label: "Слева", op: 0, dx: -1 },
        { id: "right", label: "Справа", op: 0, dx: 1 },
        { id: "zoom", label: "Zoom из крупного", op: 0, sc: 150 }
    ];
    N.ANIM_OUT = [
        { id: "none", label: "Нет — жёсткая смена" },
        { id: "fade", label: "Fade", op: 0 },
        { id: "blur", label: "Blur + fade", op: 0, blur: 1 },
        { id: "blurUp", label: "Вверх + blur", op: 0, dy: -1, blur: 1 },
        { id: "shrink", label: "Уменьшение", op: 0, sc: 70 },
        { id: "up", label: "Уход вверх", op: 0, dy: -1 },
        { id: "down", label: "Уход вниз", op: 0, dy: 1 },
        { id: "left", label: "Уход влево", op: 0, dx: -1 },
        { id: "right", label: "Уход вправо", op: 0, dx: 1 },
        { id: "zoom", label: "Zoom в камеру", op: 0, sc: 150 }
    ];

    N.findAnim = function (list, id) {
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return list[0];
    };

    // ---------- ключевые кадры ----------

    function easeCount(prop) {
        var t = prop.propertyValueType;
        if (t === PropertyValueType.ThreeD_SPATIAL || t === PropertyValueType.TwoD_SPATIAL) return 1;
        if (t === PropertyValueType.ThreeD) return 3; // Scale — 3 даже у 2D-слоя
        if (t === PropertyValueType.TwoD) return 2;
        return 1;
    }

    function easeAll(prop, influence) {
        var n = easeCount(prop);
        for (var k = 1; k <= prop.numKeys; k++) {
            var a = [], b = [];
            for (var i = 0; i < n; i++) {
                a.push(new KeyframeEase(0, influence));
                b.push(new KeyframeEase(0, influence));
            }
            prop.setTemporalEaseAtKey(k, a, b);
        }
    }

    function stateValues(anim, base, opts) {
        return {
            op: anim.op === undefined ? 100 : anim.op,
            sc: anim.sc === undefined ? 100 : anim.sc,
            pos: [base[0] + (anim.dx || 0) * opts.distance, base[1] + (anim.dy || 0) * opts.distance],
            blur: (anim.blur || 0) * (opts.blur || 0)
        };
    }

    N.animUsesBlur = function (opts) {
        return !!(opts.blur && (N.findAnim(N.ANIM_IN, opts.animIn).blur || N.findAnim(N.ANIM_OUT, opts.animOut).blur));
    };

    // Ключи входа/выхода. Длительности ужимаются, если слово короткое:
    // вход+выход не больше 80% жизни слоя, чтобы ключи не наезжали друг на друга.
    N.applyAnimation = function (layer, base, t0, t3, opts, blurProp) {
        var animIn = N.findAnim(N.ANIM_IN, opts.animIn);
        var animOut = N.findAnim(N.ANIM_OUT, opts.animOut);
        var tr = layer.property("Transform");
        var pos = tr.property("Position"), sc = tr.property("Scale"), op = tr.property("Opacity");
        pos.setValue(base);

        var inDur = animIn.id === "none" ? 0 : opts.inDur;
        var outDur = animOut.id === "none" ? 0 : opts.outDur;
        var budget = (t3 - t0) * 0.8;
        if (inDur + outDur > budget && inDur + outDur > 0) {
            var k = budget / (inDur + outDur);
            inDur *= k; outDur *= k;
        }
        if (!inDur && !outDur) return;

        var from = stateValues(animIn, base, opts);
        var to = stateValues(animOut, base, opts);
        var t1 = t0 + inDur, t2 = t3 - outDur;

        function keys(prop, vFrom, vNorm, vTo, overshoot) {
            if (!prop) return;
            var changesIn = inDur && String(vFrom) !== String(vNorm);
            var changesOut = outDur && String(vTo) !== String(vNorm);
            if (!changesIn && !changesOut && !(inDur && overshoot)) return;
            if (inDur && (changesIn || overshoot)) {
                prop.setValueAtTime(t0, vFrom);
                if (overshoot) prop.setValueAtTime(t0 + inDur * 0.6, overshoot);
                prop.setValueAtTime(t1, vNorm);
            }
            if (changesOut) {
                prop.setValueAtTime(t2, vNorm);
                prop.setValueAtTime(t3, vTo);
            }
            easeAll(prop, opts.easeInfluence);
        }

        keys(op, from.op, 100, to.op, null);
        keys(sc, [from.sc, from.sc, 100], [100, 100, 100], [to.sc, to.sc, 100],
            animIn.over ? [animIn.over, animIn.over, 100] : null);
        keys(pos, from.pos, base, to.pos, null);
        keys(blurProp, from.blur, 0, to.blur, null);
    };

    // ---------- эффекты (по matchName — не зависят от языка AE) ----------

    function setEffectValue(effect, matchName, value) {
        var p = effect.property(matchName);
        if (!p) return;
        // Opacity у Drop Shadow в некоторых версиях хранится в 0..255.
        if (typeof value === "number" && p.hasMax && p.maxValue > 100 && /0002$/.test(matchName)) value = value * 2.55;
        p.setValue(value);
    }

    // Тень и свечение — оба через Drop Shadow (свечение = тень цвета с нулевым сдвигом):
    // работает в любой версии AE и редактируется как обычный эффект.
    function addShadow(layer, sh, name, scale) {
        var fx = layer.property("ADBE Effect Parade");
        if (!fx || !fx.canAddProperty("ADBE Drop Shadow")) return;
        var e = fx.addProperty("ADBE Drop Shadow");
        e.name = name;
        setEffectValue(e, "ADBE Drop Shadow-0001", sh.color);
        setEffectValue(e, "ADBE Drop Shadow-0002", sh.opacity);
        setEffectValue(e, "ADBE Drop Shadow-0003", 135);
        setEffectValue(e, "ADBE Drop Shadow-0004", (sh.distance || 0) * scale);
        setEffectValue(e, "ADBE Drop Shadow-0005", (sh.softness || 0) * scale);
    }

    function addBlur(layer) {
        var fx = layer.property("ADBE Effect Parade");
        if (!fx || !fx.canAddProperty("ADBE Gaussian Blur 2")) return null;
        var e = fx.addProperty("ADBE Gaussian Blur 2");
        e.name = "NOIR Blur";
        var p = e.property("ADBE Gaussian Blur 2-0001");
        try { e.property("ADBE Gaussian Blur 2-0003").setValue(1); } catch (err) {} // Repeat Edge Pixels
        return p;
    }

    // ---------- текст ----------

    // Применяет стиль; шрифт берётся первый доступный из списка fonts
    // (проверка чтением назад — работает во всех версиях AE).
    function applyTextStyle(layer, text, st, size, ctx) {
        var prop = layer.property("Source Text");
        var doc = prop.value;
        doc.resetCharStyle();
        doc.resetParagraphStyle();
        doc.text = text;
        doc.fontSize = size;
        doc.fillColor = st.color;
        doc.applyFill = true;
        if (st.strokeWidth > 0) {
            doc.applyStroke = true;
            doc.strokeColor = st.strokeColor || [0, 0, 0];
            doc.strokeWidth = st.strokeWidth * ctx.scale;
            doc.strokeOverFill = false;
        } else {
            doc.applyStroke = false;
        }
        doc.tracking = st.tracking || 0;
        doc.justification = ParagraphJustification.CENTER_JUSTIFY;

        var fonts = st.fonts || [];
        var key = fonts.join("|");
        var chosen = ctx.fontCache[key];
        if (chosen === undefined) {
            chosen = null;
            for (var i = 0; i < fonts.length && chosen === null; i++) {
                doc.font = fonts[i];
                prop.setValue(doc);
                if (prop.value.font === fonts[i]) chosen = fonts[i];
            }
            ctx.fontCache[key] = chosen;
            if (fonts.length && chosen !== fonts[0]) ctx.warnings.push("Шрифт " + fonts[0] + " не найден — " +
                (chosen ? "использован " + chosen : "оставлен шрифт по умолчанию " + prop.value.font));
        }
        if (chosen) doc.font = chosen;
        prop.setValue(doc);
    }

    function displayText(text, st) { return st.caps ? text.toUpperCase() : text; }

    N.removeGenerated = function (comp) {
        var n = 0;
        for (var i = comp.numLayers; i >= 1; i--) {
            var l = comp.layer(i);
            if (l.comment === N.LAYER_TAG) {
                if (l.locked) l.locked = false;
                l.remove();
                n++;
            }
        }
        return n;
    };

    // Разбивка элементов группы на строки.
    N.splitLines = function (items, layout) {
        var lines = [], cur = null, chars = 0;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var newLine = !cur ||
                (layout.accentOwnLine && it.accent !== cur[cur.length - 1].accent) ||
                (layout.lineChars && chars + 1 + it.text.length > layout.lineChars);
            if (newLine) { cur = []; lines.push(cur); chars = it.text.length; }
            else chars += 1 + it.text.length;
            cur.push(it);
        }
        return lines;
    };

    function buildGroup(comp, g, style, anim, ctx) {
        var layout = style.layout;
        var hasAccent = false, i, j;
        for (i = 0; i < g.words.length; i++) if (g.words[i].accent) hasAccent = true;

        var items = [];
        if (layout.reveal === "group" && !hasAccent) {
            items.push({ text: g.text, accent: false, start: g.compStart });
        } else {
            for (i = 0; i < g.words.length; i++) items.push({
                text: g.words[i].text, accent: !!g.words[i].accent,
                start: layout.reveal === "group" ? g.compStart : g.words[i].compStart
            });
        }

        var tOut = g.compOut;
        var safeW = comp.width * layout.safeWidth;
        var lines = N.splitLines(items, layout);
        var useBlur = N.animUsesBlur(anim);

        // 1. создать слои и измерить
        for (i = 0; i < lines.length; i++) {
            for (j = 0; j < lines[i].length; j++) {
                var it = lines[i][j];
                var st = it.accent ? style.accent : style.base;
                it.st = st;
                it.size = st.size * ctx.scale;
                it.display = displayText(it.text, st);
                var layer = comp.layers.addText(it.display);
                layer.name = "NOIR · " + it.display;
                layer.comment = N.LAYER_TAG;
                layer.label = it.accent ? 11 : 9;
                applyTextStyle(layer, it.display, st, it.size, ctx);
                it.layer = layer;
                it.rect = layer.sourceRectAtTime(Math.max(0, it.start), false);
            }
        }

        // 2. ужать строки, которые шире безопасной зоны
        for (i = 0; i < lines.length; i++) {
            var line = lines[i], maxSize = 0, total = 0;
            for (j = 0; j < line.length; j++) maxSize = Math.max(maxSize, line[j].size);
            line.space = maxSize * layout.wordSpace;
            for (j = 0; j < line.length; j++) total += line[j].rect.width;
            total += line.space * (line.length - 1);
            if (total > safeW && total > 0) {
                var f = safeW / total;
                total = 0;
                for (j = 0; j < line.length; j++) {
                    line[j].size = Math.max(6, line[j].size * f);
                    var p = line[j].layer.property("Source Text"), d = p.value;
                    d.fontSize = line[j].size;
                    p.setValue(d);
                    line[j].rect = line[j].layer.sourceRectAtTime(Math.max(0, line[j].start), false);
                    total += line[j].rect.width;
                }
                line.space *= f;
                total += line.space * (line.length - 1);
            }
            line.width = total;
            line.ascent = 0; line.descent = 0;
            for (j = 0; j < line.length; j++) {
                line.ascent = Math.max(line.ascent, -line[j].rect.top);
                line.descent = Math.max(line.descent, line[j].rect.top + line[j].rect.height);
            }
        }

        // 3. разложить блок строк вокруг (posX, posY)
        var gap = layout.lineGap * style.base.size * ctx.scale, blockH = 0;
        for (i = 0; i < lines.length; i++) blockH += lines[i].ascent + lines[i].descent;
        blockH += gap * (lines.length - 1);
        var cx = comp.width * layout.posX / 100;
        var y = comp.height * layout.posY / 100 - blockH / 2;

        for (i = 0; i < lines.length; i++) {
            var ln = lines[i];
            var baseline = y + ln.ascent;
            var x = cx - ln.width / 2;
            for (j = 0; j < ln.length; j++) {
                var w = ln[j], r = w.rect, L = w.layer;
                L.property("Transform").property("Anchor Point")
                    .setValue([r.left + r.width / 2, r.top + r.height / 2]);
                var pos = [x + r.width / 2, baseline + r.top + r.height / 2];
                x += r.width + ln.space;

                var tIn = Math.max(0, Math.min(w.start, tOut - ctx.minDur));
                L.startTime = 0;
                L.inPoint = tIn;
                L.outPoint = tOut;

                if (w.st.shadow) addShadow(L, w.st.shadow, "NOIR Shadow", ctx.scale);
                if (w.st.glow) addShadow(L, { color: w.st.glow.color || w.st.color, opacity: w.st.glow.opacity,
                    distance: 0, softness: w.st.glow.softness }, "NOIR Glow", ctx.scale);
                var blurProp = useBlur ? addBlur(L) : null;
                var a = {};
                for (var k in anim) a[k] = anim[k];
                a.distance = anim.distance * ctx.scale;
                a.blur = anim.blur * ctx.scale;
                N.applyAnimation(L, pos, tIn, tOut, a, blurProp);
                ctx.created++;
            }
            y += ln.ascent + ln.descent + gap;
        }
    }

    // groups: из N.groupWords + N.timeGroups; у групп и слов есть compStart/compOut.
    // style: { layout, base, accent }, anim: { animIn, animOut, inDur, outDur, distance, blur, easeInfluence }
    N.generate = function (comp, groups, style, anim, replace) {
        var ctx = { warnings: [], fontCache: {}, created: 0, scale: comp.width / N.REF_WIDTH,
            minDur: Math.max(comp.frameDuration, 0.04) };
        var removed = replace ? N.removeGenerated(comp) : 0;
        var skipped = 0;
        for (var i = groups.length - 1; i >= 0; i--) { // с конца: ранние слова окажутся сверху
            var g = groups[i];
            if (g.compOut <= 0 || g.compStart >= comp.duration) { skipped++; continue; }
            g.compStart = Math.max(0, g.compStart);
            g.compOut = Math.min(comp.duration, g.compOut);
            if (g.compOut - g.compStart < comp.frameDuration) { skipped++; continue; }
            buildGroup(comp, g, style, anim, ctx);
        }
        if (skipped) ctx.warnings.push("Пропущено групп вне композиции или короче кадра: " + skipped);
        return { created: ctx.created, removed: removed, warnings: ctx.warnings };
    };
})(NOIR);
