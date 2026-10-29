/*
 * NOIR CAPTIONS — отдельные функции: счётчик цифр, зачёркивание, маска по тексту.
 * Работают независимо от субтитров: счётчик создаёт свой слой, остальные — над выделенными текстовыми слоями.
 *
 * Счётчик — обычный текстовый слой с выражением в Source Text (параметры видно и можно править прямо в выражении).
 * Зачёркивание — слой-фигура (полоса) с «вытиранием». Маска — видео внутри текста / вырез через Track Matte.
 *
 * ExtendScript = ES3: нельзя использовать `in`, `short`, `default`… как имена полей.
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    N.COUNTER_TAG = "noir-captions:counter";
    N.STRIKE_TAG = "noir-captions:strike";
    N.MASK_TAG = "noir-captions:matte";

    N.COUNTER_EASES = [
        { id: "out", label: "Замедление к концу" }, { id: "linear", label: "Линейно" },
        { id: "in", label: "Ускорение" }, { id: "inout", label: "Плавно (в начале и в конце)" }
    ];
    N.COUNTER_SEPS = [
        { id: "none", label: "Без разделителя" }, { id: "space", label: "Пробел (1 000)" },
        { id: "comma", label: "Запятая (1,000)" }, { id: "dot", label: "Точка (1.000)" }
    ];

    function sepChar(id) { return id === "space" ? " " : (id === "comma" ? "," : (id === "dot" ? "." : "")); }
    function fnum(v) { var x = Number(v); return isFinite(x) ? String(x) : "0"; }

    // ---------- счётчик ----------

    // Форматирование значения (та же логика, что в выражении) — для размера слоя и тестов.
    N.formatCounter = function (v, o) {
        var dec = Math.max(0, Math.round(o.decimals || 0)), sep = sepChar(o.thousands);
        var neg = v < 0, s = Math.abs(v).toFixed(dec), parts = s.split(".");
        var pad = Math.max(0, Math.round(o.pad || 0));
        while (parts[0].length < pad) parts[0] = "0" + parts[0];
        if (sep !== "") parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep);
        s = parts.join(sep === "." ? "," : ".");
        return String(o.prefix || "") + (neg ? "-" : "") + s + String(o.suffix || "");
    };

    // Выражение для Source Text. Время считается от inPoint слоя — счётчик можно двигать по таймлайну.
    N.counterExpression = function (o) {
        var easeLine = { linear: "", "in": "p = p * p;", out: "p = 1 - (1 - p) * (1 - p);",
            inout: "p = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;" }[o.ease];
        if (easeLine === undefined) easeLine = "p = 1 - (1 - p) * (1 - p);";
        var dec = Math.max(0, Math.round(o.decimals || 0)), sep = sepChar(o.thousands), pad = Math.max(0, Math.round(o.pad || 0));
        var L = [];
        L.push("var from = " + fnum(o.from) + ", to = " + fnum(o.to) + ", dur = " + fnum(Math.max(0.001, o.duration)) +
            ", step = " + fnum(o.step || 0) + ", ivl = " + fnum(o.interval || 0) + ";");
        L.push("var raw = Math.max(0, time - inPoint);");
        L.push("var t = ivl > 0 ? Math.floor(raw / ivl) * ivl : raw;");
        L.push("var p = raw >= dur ? 1 : Math.min(1, t / dur);");
        if (easeLine) L.push(easeLine);
        L.push("var v = from + (to - from) * p;");
        L.push("if (step > 0 && p < 1) v = Math.round(v / step) * step;");
        L.push("if (p >= 1) v = to;");
        L.push("var neg = v < 0;");
        L.push("var s = Math.abs(v).toFixed(" + dec + ");");
        L.push("var parts = s.split('.');");
        if (pad) L.push("while (parts[0].length < " + pad + ") parts[0] = '0' + parts[0];");
        if (sep !== "") L.push("parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, " + N.stringify(sep) + ");");
        L.push("s = parts.join(" + N.stringify(sep === "." ? "," : ".") + ");");
        L.push(N.stringify(String(o.prefix || "")) + " + (neg ? '-' : '') + s + " + N.stringify(String(o.suffix || "")) + ";");
        return L.join("\n");
    };

    // o: from, to, duration, step, interval, decimals, thousands, pad, prefix, suffix, ease, side, size, posX, posY, hold, start
    N.createCounter = function (comp, o, style, anim) {
        var ctx = N.newCtx(comp), G = N.gen, scale = ctx.scale;
        var st = {}, src = o.side === "base" ? style.base : style.accent, k;
        for (k in src) st[k] = src[k];
        if (st.colors && st.colors.length) st.color = st.colors[0];
        st.size = o.size || st.size;

        var a = N.formatCounter(o.from, o), b = N.formatCounter(o.to, o);
        var widest = a.length > b.length ? a : b;                       // по самой длинной записи считаем размер и центр
        var layer = comp.layers.addText(widest);
        layer.name = "NOIR Counter · " + fnum(o.from) + "→" + fnum(o.to);
        var base = [comp.width * o.posX / 100, comp.height * o.posY / 100];
        layer.comment = N.COUNTER_TAG + "|" + base[0] + "|" + base[1];
        layer.label = 6;
        G.applyTextStyle(layer, widest, st, st.size * scale, ctx);
        G.applyBlend(layer, st);
        G.fitAndAnchor(layer, comp, style.layout ? style.layout.safeWidth : 0.9);
        G.applyEffects(layer, st, ctx);

        var tIn = Math.max(0, o.start), tOut = Math.min(comp.duration, tIn + o.duration + (o.hold || 0));
        if (tIn >= comp.duration || tOut - tIn < ctx.minDur) throw new Error("Счётчик начинается за пределами композиции. Передвиньте индикатор времени внутрь.");
        layer.startTime = 0;
        layer.inPoint = tIn;
        layer.outPoint = tOut;

        var textProp = layer.property("Source Text");
        textProp.expression = N.counterExpression(o);
        try { if (textProp.expressionError) ctx.warnings.push("Ошибка выражения счётчика: " + textProp.expressionError); } catch (e) {}

        var an = {};
        for (k in anim) an[k] = anim[k];
        an.distance = anim.distance * scale;
        an.blur = anim.blur * scale;
        an.opacity = G.styleOpacity(st);
        var blurProp = N.animUsesBlur(an) ? G.addBlur(layer) : null;
        N.applyAnimation(layer, base, tIn, tOut, an, blurProp);
        return { layer: layer, warnings: ctx.warnings, start: tIn, end: tOut };
    };

    // ---------- зачёркивание ----------

    // o: color, thickness (px при ширине кадра 1080), offsetY (% высоты текста, 0 — по центру), tilt (°), padding (% ширины),
    //    duration, delay (с от появления слова), dir: "ltr" | "rtl" | "center"
    N.strikeLayers = function (comp, layers, o, anim) {
        var ctx = N.newCtx(comp), scale = ctx.scale, made = [], i, skipped = 0;
        for (i = 0; i < layers.length; i++) {
            var text = layers[i];
            var r = text.sourceRectAtTime(Math.max(0, text.inPoint), false);
            if (!(r.width > 0)) { skipped++; continue; }
            var base = N.baseOf(text);
            var width = r.width * (1 + o.padding / 100), thick = Math.max(1, o.thickness * scale);
            var cy = base[1] + (o.offsetY / 100) * r.height;
            var label = String(text.property("Source Text").value.text);

            var shape = comp.layers.addShape();
            shape.name = "NOIR Strike · " + label;
            shape.comment = N.STRIKE_TAG;
            shape.label = 1;
            var grp = shape.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            var inner = grp.property("ADBE Vectors Group");
            var rect = inner.addProperty("ADBE Vector Shape - Rect");
            rect.property("ADBE Vector Rect Size").setValue([width, thick]);
            try { rect.property("ADBE Vector Rect Roundness").setValue(thick / 2); } catch (e1) {}
            var fill = inner.addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").setValue(o.color);
            // полоса занимает 0…width в пространстве слоя — «вытирание» масштабом идёт от точки привязки
            grp.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([width / 2, 0]);

            var ax = o.dir === "rtl" ? width : (o.dir === "center" ? width / 2 : 0);
            var rad = o.tilt * Math.PI / 180, vx = width / 2 - ax;      // вектор от точки привязки к центру полосы
            var tr = shape.property("Transform");
            tr.property("Anchor Point").setValue([ax, 0]);
            tr.property("Position").setValue([base[0] - vx * Math.cos(rad), cy - vx * Math.sin(rad)]);
            tr.property("Rotation").setValue(o.tilt);

            var tS = text.inPoint + o.delay, tE = text.outPoint;
            if (tS >= tE) tS = Math.max(text.inPoint, tE - 0.1);
            shape.startTime = 0;
            shape.inPoint = tS;
            shape.outPoint = tE;
            var dur = Math.min(o.duration, (tE - tS) * 0.8), sc = tr.property("Scale");
            if (dur > 0) {
                sc.setValueAtTime(tS, [0, 100, 100]);
                sc.setValueAtTime(tS + dur, [100, 100, 100]);
                setEaseOut(sc, 85);
            }
            if (anim && anim.animOut && anim.animOut !== "none" && anim.outDur > 0) {   // уходит вместе со словом
                var od = Math.min(anim.outDur, (tE - tS) * 0.8), op = tr.property("Opacity");
                op.setValueAtTime(tE - od, 100);
                op.setValueAtTime(tE, 0);
            }
            try { shape.moveBefore(text); } catch (e2) {}
            made.push(shape);
        }
        return { made: made, skipped: skipped, warnings: ctx.warnings };
    };

    function setEaseOut(prop, influence) {
        var n = prop.propertyValueType === PropertyValueType.ThreeD ? 3 : 1, a = [], b = [], i;
        for (i = 0; i < n; i++) { a.push(new KeyframeEase(0, influence)); b.push(new KeyframeEase(0, influence)); }
        for (var k = 1; k <= prop.numKeys; k++) prop.setTemporalEaseAtKey(k, a, b);
    }

    // ---------- маска по тексту ----------

    function setMatte(layer, matte, type) {
        try { layer.setTrackMatte(matte, type); }
        catch (e) {
            try { layer.trackMatteType = type; }
            catch (e2) { throw new Error("Эта версия After Effects не даёт задать Track Matte скриптом: " + e.toString()); }
        }
    }

    // o: mode "video" (видео внутри букв) | "cut" (вырез: буквы прозрачны), invert, restart (клип с начала слова),
    //    hideSource, color, opacity (для выреза)
    N.maskTextLayers = function (comp, texts, source, o) {
        var made = [], i, warnings = [];
        if (o.mode !== "cut" && !source) throw new Error("Выделите кроме текстовых слоёв ещё один видео/фото слой — он будет виден внутри букв.");
        for (i = 0; i < texts.length; i++) {
            var T = texts[i], label = String(T.property("Source Text").value.text), M;
            if (o.mode === "cut") {
                M = comp.layers.addSolid(o.color, "NOIR Mask · " + label, comp.width, comp.height, 1, comp.duration);
                M.property("Transform").property("Opacity").setValue(o.opacity);
                M.comment = N.MASK_TAG + "|cut";
            } else {
                M = source.duplicate();
                M.name = "NOIR Mask · " + label;
                M.comment = N.MASK_TAG + "|video";
                if (o.restart) M.startTime = T.inPoint;
            }
            M.inPoint = T.inPoint;
            M.outPoint = T.outPoint;
            M.moveAfter(T);                                              // подложка прямо под текстом
            setMatte(M, T, (o.mode === "cut" || o.invert) ? TrackMatteType.ALPHA_INVERTED : TrackMatteType.ALPHA);
            T.enabled = false;                                           // сам текст не виден — только его форма как маска
            made.push(M);
        }
        if (o.mode !== "cut" && o.hideSource && source) source.enabled = false;
        return { made: made, warnings: warnings };
    };

    // Снять маски: удалить подложки NOIR и вернуть видимость текстовым слоям.
    N.removeMasks = function (comp) {
        var targets = [], i, n = 0;
        for (i = 1; i <= comp.numLayers; i++) if (String(comp.layer(i).comment || "").indexOf(N.MASK_TAG) === 0) targets.push(comp.layer(i));
        for (i = 0; i < targets.length; i++) {
            var m = null;
            try { m = targets[i].trackMatteLayer; } catch (e) {}
            if (targets[i].locked) targets[i].locked = false;
            targets[i].remove();
            if (m) { try { m.enabled = true; } catch (e2) {} }
            n++;
        }
        return n;
    };

    N.removeByTag = function (comp, tag) {
        var n = 0;
        for (var i = comp.numLayers; i >= 1; i--) {
            var l = comp.layer(i);
            if (String(l.comment || "").indexOf(tag) === 0) {
                if (l.locked) l.locked = false;
                l.remove();
                n++;
            }
        }
        return n;
    };
})(NOIR);
