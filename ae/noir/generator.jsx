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
    N.PIVOT_BASELINE = true;   // true: аниматор вращает/масштабирует вокруг базовой линии текста — компенсируем (см. withPivotComp)
    N.REF_WIDTH = 1080; // размеры в стилях заданы для кадра шириной 1080

    // Анимации описаны состоянием «вне кадра»: op — прозрачность (0 = невидим),
    // sc — масштаб %, dx/dy — смещение в долях параметра distance, rot — поворот в градусах,
    // blur — размытие в долях параметра blur, over — перелёт масштаба. abbr — подпись на кнопке.
    N.ANIM_IN = [
        { id: "none", label: "Нет — жёсткая смена", abbr: "Нет" },
        { id: "fade", label: "Fade", abbr: "Fade", op: 0 },
        { id: "blur", label: "Blur + fade", abbr: "Blur", op: 0, blur: 1 },
        { id: "blurRise", label: "Снизу + blur", abbr: "Blur ↑", op: 0, dy: 1, blur: 1 },
        { id: "rise", label: "Снизу вверх", abbr: "Вверх ↑", op: 0, dy: 1 },
        { id: "drop", label: "Сверху вниз", abbr: "Вниз ↓", op: 0, dy: -1 },
        { id: "left", label: "Слева", abbr: "Слева →", op: 0, dx: -1 },
        { id: "right", label: "Справа", abbr: "Справа ←", op: 0, dx: 1 },
        { id: "pop", label: "Pop (scale + overshoot)", abbr: "Pop", op: 0, sc: 70, over: 108 },
        { id: "punch", label: "Punch (удар 125 → 100)", abbr: "Punch", sc: 125 },
        { id: "zoom", label: "Zoom из крупного", abbr: "Zoom", op: 0, sc: 150 },
        { id: "slam", label: "Slam (падает с размытием)", abbr: "Slam", op: 0, sc: 260, blur: 1 },
        { id: "whipL", label: "Whip слева (быстрый вылет)", abbr: "Whip →", op: 0, dx: -4, blur: 1.4 },
        { id: "whipR", label: "Whip справа (быстрый вылет)", abbr: "Whip ←", op: 0, dx: 4, blur: 1.4 },
        { id: "rotate", label: "Поворот + scale", abbr: "Rotate", op: 0, rot: -14, sc: 85 },
        { id: "grow", label: "Grow (вырастает с overshoot)", abbr: "Grow", op: 0, sc: 30, over: 108 },
        { id: "blurPop", label: "Blur Pop", abbr: "Blur Pop", op: 0, sc: 75, over: 104, blur: 1 },
        { id: "zoomBlur", label: "Влёт крупно + blur (уличное интервью)", abbr: "Zoom Blur", op: 0, sc: 150, blur: 0.8 },
        // letters: анимация по буквам (текстовый аниматор с диапазоном, а не ключи слоя)
        { id: "letFade", label: "По буквам: fade", abbr: "Букв Fade", letters: "fade" },
        { id: "letRise", label: "По буквам: снизу", abbr: "Букв ↑", letters: "rise" },
        { id: "letPop", label: "По буквам: pop", abbr: "Букв Pop", letters: "pop" },
        { id: "letBlur", label: "По буквам: blur", abbr: "Букв Blur", letters: "blur" },
        { id: "type", label: "Печатная машинка", abbr: "Печать", letters: "type" }
    ];
    N.ANIM_OUT = [
        { id: "none", label: "Нет — жёсткая смена", abbr: "Нет" },
        { id: "fade", label: "Fade", abbr: "Fade", op: 0 },
        { id: "blur", label: "Blur + fade", abbr: "Blur", op: 0, blur: 1 },
        { id: "blurUp", label: "Вверх + blur", abbr: "Blur ↑", op: 0, dy: -1, blur: 1 },
        { id: "shrink", label: "Уменьшение", abbr: "Shrink", op: 0, sc: 70 },
        { id: "up", label: "Уход вверх", abbr: "Вверх ↑", op: 0, dy: -1 },
        { id: "down", label: "Уход вниз", abbr: "Вниз ↓", op: 0, dy: 1 },
        { id: "left", label: "Уход влево", abbr: "← Влево", op: 0, dx: -1 },
        { id: "right", label: "Уход вправо", abbr: "Вправо →", op: 0, dx: 1 },
        { id: "zoom", label: "Zoom в камеру", abbr: "Zoom", op: 0, sc: 150 },
        { id: "whipL", label: "Whip влево", abbr: "← Whip", op: 0, dx: -4, blur: 1.4 },
        { id: "whipR", label: "Whip вправо", abbr: "Whip →", op: 0, dx: 4, blur: 1.4 },
        { id: "rotate", label: "Поворот + scale", abbr: "Rotate", op: 0, rot: 14, sc: 85 },
        { id: "slamOut", label: "Slam (схлопывается с размытием)", abbr: "Slam", op: 0, sc: 40, blur: 1 },
        { id: "letFade", label: "По буквам: fade", abbr: "Букв Fade", letters: "fade" },
        { id: "letRise", label: "По буквам: вверх", abbr: "Букв ↑", letters: "rise" },
        { id: "letType", label: "Стирание по буквам", abbr: "Стереть", letters: "type" }
    ];

    // Режимы наложения слоя. «Инверсия» = Difference: белый текст инвертирует кадр под буквами.
    N.BLEND_MODES = [
        { id: "normal", label: "Обычный", key: "NORMAL" },
        { id: "difference", label: "Инверсия (Difference)", key: "DIFFERENCE" },
        { id: "exclusion", label: "Exclusion (мягкая инверсия)", key: "EXCLUSION" },
        { id: "overlay", label: "Overlay", key: "OVERLAY" },
        { id: "softLight", label: "Soft Light", key: "SOFT_LIGHT" },
        { id: "screen", label: "Screen", key: "SCREEN" },
        { id: "add", label: "Add", key: "ADD" },
        { id: "multiply", label: "Multiply", key: "MULTIPLY" }
    ];

    function applyBlend(layer, st) {
        var id = st.blend || "normal";
        for (var i = 0; i < N.BLEND_MODES.length; i++) {
            if (N.BLEND_MODES[i].id === id) {
                try { layer.blendingMode = BlendingMode[N.BLEND_MODES[i].key]; } catch (e) {}
            }
        }
    }
    function styleOpacity(st) { return st.opacity === undefined ? 100 : st.opacity; }

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
        var intensity = opts.intensity === undefined ? 1 : opts.intensity;
        return {
            op: anim.op === undefined ? opts.opacity : anim.op * opts.opacity / 100,
            sc: anim.sc === undefined ? 100 : 100 + (anim.sc - 100) * intensity,
            rot: (anim.rot || 0) * intensity,
            pos: [base[0] + (anim.dx || 0) * opts.distance * intensity, base[1] + (anim.dy || 0) * opts.distance * intensity],
            blur: (anim.blur || 0) * (opts.blur || 0) * intensity
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
        var rot = tr.property("Rotation");
        opts = N.withDefaults(opts);
        clearLetterAnimators(layer);
        clearKeysOf(pos);
        pos.setValue(base);
        if (sc.numKeys > 0) { clearKeysOf(sc); sc.setValue([100, 100, 100]); }       // слои старых версий хранили анимацию ключами
        if (rot.numKeys > 0) { clearKeysOf(rot); rot.setValue(0); }
        clearKeysOf(op);
        op.setValue(opts.opacity);

        var inDur = animIn.id === "none" ? 0 : opts.inDur;
        var outDur = animOut.id === "none" ? 0 : opts.outDur;
        var budget = (t3 - t0) * 0.8;
        if (inDur + outDur > budget && inDur + outDur > 0) {
            var k = budget / (inDur + outDur);
            inDur *= k; outDur *= k;
        }
        // анимация по буквам идёт аниматором текста; ключи слоя для этой стороны не нужны
        if (animIn.letters && inDur > 0) { N.applyLetters(layer, animIn.letters, t0, inDur, true, opts); inDur = 0; }
        if (animOut.letters && outDur > 0) { N.applyLetters(layer, animOut.letters, t3 - outDur, outDur, false, opts); outDur = 0; }
        if (!inDur && !outDur) return;

        var from = stateValues(animIn, base, opts);
        var to = stateValues(animOut, base, opts);
        var t1 = t0 + inDur, t2 = t3 - outDur;
        var inten = opts.intensity === undefined ? 1 : opts.intensity;

        // План ключей: список [время, значение] или null, если свойство не меняется.
        function plan(vFrom, vNorm, vTo, overshoot) {
            var changesIn = inDur && String(vFrom) !== String(vNorm);
            var changesOut = outDur && String(vTo) !== String(vNorm);
            if (!changesIn && !changesOut && !(inDur && overshoot)) return null;
            var list = [];
            if (inDur && (changesIn || overshoot)) {
                list.push([t0, vFrom]);
                if (overshoot) list.push([t0 + inDur * 0.6, overshoot]);
                list.push([t1, vNorm]);
            }
            if (changesOut) { list.push([t2, vNorm]); list.push([t3, vTo]); }
            return list;
        }
        function put(prop, list) {
            if (!prop || !list) return;
            for (var i = 0; i < list.length; i++) prop.setValueAtTime(list[i][0], list[i][1]);
            easeAll(prop, opts.easeInfluence);
        }
        var over = animIn.over ? 100 + (animIn.over - 100) * inten : null;
        var dIn = [from.pos[0] - base[0], from.pos[1] - base[1], 0], dOut = [to.pos[0] - base[0], to.pos[1] - base[1], 0];

        // Масштаб, поворот, прозрачность и сдвиг входа/выхода живут в текстовом аниматоре «NOIR Move», а не в ключах слоя:
        // у Position/Scale/Rotation/Opacity слоя ключей нет, и их можно свободно менять в окне композиции.
        // Относительные значения аниматора: прозрачность 100 = как у слоя, масштаб 100 = без изменения.
        var rel = {
            op: plan(animIn.op === undefined ? 100 : animIn.op, 100, animOut.op === undefined ? 100 : animOut.op, null),
            sc: plan([from.sc, from.sc, 100], [100, 100, 100], [to.sc, to.sc, 100], over ? [over, over, 100] : null),
            pos: plan(dIn, [0, 0, 0], dOut, null),
            rot: plan(from.rot, 0, to.rot, null)
        };
        var holder = (rel.op || rel.sc || rel.pos || rel.rot) ? addMoveAnimator(layer) : null;
        if (holder) {
            if (rel.sc || rel.rot) setAnchorGrouping(layer);
            // Аниматор вращает/масштабирует вокруг базовой линии текста, а слой — вокруг центра рамки текста.
            // Разницу гасит вертикальный сдвиг в ключах позиции аниматора (N.PIVOT_BASELINE = false отключает).
            var pivotDy = 0;
            if (N.PIVOT_BASELINE && (rel.sc || rel.rot)) {
                var rect = layer.sourceRectAtTime(Math.max(0, t0), false);
                pivotDy = -(rect.top + rect.height / 2);
            }
            var posList = rel.pos;
            if (pivotDy && (rel.sc || rel.rot)) posList = withPivotComp(rel.pos, rel.sc, rel.rot, pivotDy);
            if (rel.op) put(holder.addProperty("ADBE Text Opacity"), rel.op);
            if (rel.sc) put(holder.addProperty("ADBE Text Scale 3D"), rel.sc);
            if (rel.rot) put(holder.addProperty("ADBE Text Rotation"), rel.rot);
            if (posList) put(holder.addProperty("ADBE Text Position 3D"), posList);
        } else if (rel.op || rel.sc || rel.pos || rel.rot) {
            // AE не дал создать аниматор — прежний способ: ключи самого слоя.
            put(op, plan(from.op, opts.opacity, to.op, null));
            put(sc, plan([from.sc, from.sc, 100], [100, 100, 100], [to.sc, to.sc, 100], over ? [over, over, 100] : null));
            put(pos, plan(from.pos, base, to.pos, null));
            put(rot, plan(from.rot, 0, to.rot, null));
        }
        put(blurProp, plan(from.blur, 0, to.blur, null));
    };

    // Значение списка ключей [[t, v], ...] в момент t: линейная интерполяция; v — число или массив.
    function listAt(list, t, fallback) {
        if (!list || !list.length) return fallback;
        if (t <= list[0][0]) return list[0][1];
        for (var i = 1; i < list.length; i++) {
            if (t <= list[i][0]) {
                var a = list[i - 1], b = list[i], f = b[0] === a[0] ? 1 : (t - a[0]) / (b[0] - a[0]);
                if (typeof a[1] === "number") return a[1] + (b[1] - a[1]) * f;
                var out = [];
                for (var k = 0; k < a[1].length; k++) out.push(a[1][k] + (b[1][k] - a[1][k]) * f);
                return out;
            }
        }
        return list[list.length - 1][1];
    }

    // Ключи позиции аниматора = собственный сдвиг + компенсация смещения центра при масштабе/повороте вокруг базовой линии.
    // v — вектор от точки вращения (базовая линия) к центру рамки; после масштаба k и поворота θ центр смещается на (R·S − I)·v.
    function withPivotComp(posList, scList, rotList, dy) {
        var times = [], i, j, all = [posList, scList, rotList];
        for (i = 0; i < all.length; i++) if (all[i]) for (j = 0; j < all[i].length; j++) times.push(all[i][j][0]);
        times.sort(function (x, y) { return x - y; });
        var out = [], vy = -dy, last = null;
        for (i = 0; i < times.length; i++) {
            var t = times[i];
            if (last !== null && Math.abs(t - last) < 1e-9) continue;
            last = t;
            var p = listAt(posList, t, [0, 0, 0]), k = listAt(scList, t, [100, 100, 100])[0] / 100, th = listAt(rotList, t, 0) * Math.PI / 180;
            out.push([t, [p[0] + k * vy * Math.sin(th), p[1] + vy * (1 - k * Math.cos(th)), 0]]);
        }
        return out;
    }

    // Масштаб и поворот аниматора считаются вокруг якоря группы: «All» с выравниванием 0,0 — вся надпись как одно целое.
    function setAnchorGrouping(layer) {
        try {
            var more = layer.property("ADBE Text Properties").property("ADBE Text More Options");
            more.property("ADBE Text Anchor Point Option").setValue(4);
            more.property("ADBE Text Anchor Point Align").setValue([0, 0]);
        } catch (e) {}
    }

    function clearKeysOf(prop) { while (prop.numKeys > 0) prop.removeKey(1); }

    // Убирает аниматоры NOIR (по буквам и сдвиг); свои аниматоры пользователя не трогает.
    function clearLetterAnimators(layer) {
        try {
            var an = layer.property("ADBE Text Properties").property("ADBE Text Animators");
            for (var i = an.numProperties; i >= 1; i--) {
                var nm = String(an.property(i).name);
                if (nm.indexOf("NOIR Letters") === 0 || nm === "NOIR Move") an.property(i).remove();
            }
        } catch (e) {}
    }

    // Аниматор без селектора действует на весь текст: его Position — смещение относительно позиции слоя.
    function addMoveAnimator(layer) {
        try {
            var an = layer.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
            an.name = "NOIR Move";
            try { an.property("ADBE Text Selectors").addProperty("ADBE Text Selector"); } catch (eSel) {}   // диапазон 0–100% = весь текст
            return an.property("ADBE Text Animator Properties");
        } catch (e) { return null; }
    }

    // Анимация по буквам: текстовый аниматор (прозрачность 0 + смещение/масштаб/размытие) и диапазон-селектор.
    // Вход: начало диапазона 0→100% — буквы проявляются слева направо; выход: конец диапазона 0→100% — исчезают слева направо.
    // kind: fade | rise | pop | blur | type. Возвращает false, если AE не дал создать аниматор (имена свойств проверены не во всех версиях).
    N.applyLetters = function (layer, kind, tStart, dur, isIn, opts) {
        try {
            var an = layer.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
            an.name = "NOIR Letters " + (isIn ? "In" : "Out");
            var props = an.property("ADBE Text Animator Properties");
            props.addProperty("ADBE Text Opacity").setValue(0);
            if (kind === "rise") props.addProperty("ADBE Text Position 3D").setValue([0, (isIn ? 1 : -1) * (opts.distance || 40) * (opts.intensity === undefined ? 1 : opts.intensity), 0]);
            if (kind === "pop") props.addProperty("ADBE Text Scale 3D").setValue([100 - 65 * (opts.intensity === undefined ? 1 : opts.intensity), 100 - 65 * (opts.intensity === undefined ? 1 : opts.intensity), 100]);
            if (kind === "blur") props.addProperty("ADBE Text Blur").setValue([(opts.blur || 20) * (opts.intensity === undefined ? 1 : opts.intensity), (opts.blur || 20) * (opts.intensity === undefined ? 1 : opts.intensity)]);
            var sel = an.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
            var start = sel.property("ADBE Text Percent Start"), end = sel.property("ADBE Text Percent End");
            if (kind === "type") {          // «печатная машинка»: резкие границы, без плавного перехода между буквами
                try { sel.property("ADBE Text Range Advanced").property("ADBE Text Selector Smoothness").setValue(0); } catch (e1) {}
            }
            if (isIn) {
                start.setValueAtTime(tStart, 0);
                start.setValueAtTime(tStart + dur, 100);
                easeAll(start, opts.easeInfluence || 70);
            } else {
                start.setValue(0);
                end.setValueAtTime(tStart, 0);
                end.setValueAtTime(tStart + dur, 100);
                easeAll(end, opts.easeInfluence || 70);
            }
            return true;
        } catch (e) { return false; }
    };

    // opacity — прозрачность слоя в покое (из стиля), по умолчанию 100.
    N.withDefaults = function (opts) {
        var o = {};
        for (var k in opts) o[k] = opts[k];
        if (o.opacity === undefined) o.opacity = 100;
        return o;
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
            chosen = pickFont(fonts);
            ctx.fontCache[key] = chosen;
            if (fonts.length && chosen !== fonts[0]) ctx.warnings.push(fontMissingMessage(fonts, chosen));
        }
        if (chosen) doc.font = chosen;
        prop.setValue(doc);
    }

    // Шрифт установлен? true/false; null — проверить нельзя (AE старше 24.0).
    // AE принимает и НЕсуществующие PostScript-имена (слой получает «потерянный» шрифт, а при открытии
    // проекта появляется окно Resolve Fonts), поэтому наличие проверяем ДО назначения.
    N.fontInstalled = function (ps) {
        try {
            if (app.fonts && app.fonts.getFontsByPostScriptName) {
                var r = app.fonts.getFontsByPostScriptName(ps);
                return !!(r && r.length > 0);
            }
        } catch (e) {}
        return null;
    };

    // Первый установленный шрифт из цепочки; null — ни одного (слой останется со шрифтом по умолчанию).
    function pickFont(fonts) {
        var unknown = null;
        for (var i = 0; i < fonts.length; i++) {
            var inst = N.fontInstalled(fonts[i]);
            if (inst === true) return fonts[i];
            if (inst === null && unknown === null) unknown = fonts[i];
        }
        return unknown;
    }

    function fontMissingMessage(fonts, chosen) {
        if (chosen) return "Шрифта " + fonts[0] + " нет на компьютере — использован " + chosen + ".";
        return "Ни одного шрифта стиля нет на компьютере (" + fonts.slice(0, 3).join(", ") +
            "…) — оставлен шрифт по умолчанию. Установите шрифт или выберите другой на вкладке «Стиль».";
    }

    function displayText(text, st) { return st.caps ? text.toUpperCase() : text; }

    N.isGenerated = function (layer) { return String(layer.comment || "").indexOf(N.LAYER_TAG) === 0; };

    // sourceKey — убрать только субтитры этого аудиослоя (строка); без него — все слои NOIR.
    // Слои без метки источника (старые версии) при замене по источнику не трогаются.
    N.removeGenerated = function (comp, sourceKey) {
        var n = 0;
        for (var i = comp.numLayers; i >= 1; i--) {
            var l = comp.layer(i);
            if (N.isGenerated(l) && (!sourceKey || N.layerSource(l) === sourceKey)) {
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
            var newLine = !cur || it.lineBefore ||
                (layout.accentOwnLine && it.accent !== cur[cur.length - 1].accent) ||
                (layout.lineChars && chars + 1 + it.text.length > layout.lineChars);
            if (newLine) {
                var carry = null;
                if (cur && cur.length > 1 && layout.keepShortWords && !it.lineBefore &&
                    !layout.accentOwnLine && /^(в|во|на|к|ко|с|со|у|о|об|и|а|но|не|по|из|за|от|до|to|of|a|an|in|on)$/i.test(cur[cur.length - 1].text)) carry = cur.pop();
                cur = []; lines.push(cur); chars = it.text.length;
                if (carry) { cur.push(carry); chars += carry.text.length + 1; }
            }
            else chars += 1 + it.text.length;
            cur.push(it);
        }
        return lines;
    };

    // Копия стиля с очередным цветом из палитры (st.colors) — для акцентных слов «каждое своего цвета».
    function withPaletteColor(st, ordinal) {
        var c = {};
        for (var k in st) c[k] = st[k];
        c.color = st.colors[(ordinal || 0) % st.colors.length];
        return c;
    }

    // «Слой на фразу»: слова одной строки с одинаковым видом (обычные / один и тот же акцент / инверсия) — один слой.
    // Фраза без акцентов и зон — один слой на все строки (перенос строки внутри слоя).
    // Каждый такой слой помнит свои слова (words) — их время нужно аниматорам появления и караоке.
    function sameLook(a, b) { return a.accent === b.accent && !!a.invert === !!b.invert && (!a.accent || a.ord === b.ord || a.ord === undefined); }
    function mergeRuns(items, layout, zones) {
        var lines = N.splitLines(items, layout), out = [], plain = !zones, i, j;
        for (i = 0; i < items.length; i++) if (items[i].accent || items[i].invert) plain = false;
        if (plain) {
            var text = [], wordsAll = [];
            for (i = 0; i < lines.length; i++) { var t = []; for (j = 0; j < lines[i].length; j++) { t.push(lines[i][j].text); wordsAll.push(lines[i][j]); } text.push(t.join(" ")); }
            return [{ text: text.join("\r"), accent: false, invert: false, start: items[0].start, order: 0, words: wordsAll, lines: lines.length }];
        }
        for (i = 0; i < lines.length; i++) {
            var run = null;
            for (j = 0; j < lines[i].length; j++) {
                var it = lines[i][j];
                if (run && sameLook(run.words[0], it) && !(layout.accentOwnLine && it.accent)) { run.text += " " + it.text; run.words.push(it); continue; }
                run = { text: it.text, accent: it.accent, invert: it.invert, ord: it.ord, start: it.start, order: it.order, lineBefore: j === 0 && i > 0, words: [it] };
                out.push(run);
            }
        }
        return out;
    }
    // Текстовый аниматор с селектором-выражением по словам. kind: reveal — слова проявляются в момент произнесения;
    // karaoke — текущее слово окрашивается в color. Время в выражении — от начала слоя, поэтому сдвиг слоя по времени его не ломает.
    N.wordAnimator = function (layer, kind, words, tIn, color) {
        var t = [], e = [], i;
        for (i = 0; i < words.length; i++) { t.push(Math.round((words[i].wStart - tIn) * 1000) / 1000); e.push(Math.round((words[i].wEnd - tIn) * 1000) / 1000); }
        var expr = kind === "reveal" ?
            "var t=[" + t.join(",") + "];var i=Math.min(textIndex,t.length)-1;selectorValue*linear(time-inPoint,t[i],t[i]+0.08,1,0);" :
            "var t=[" + t.join(",") + "],e=[" + e.join(",") + "];var i=Math.min(textIndex,t.length)-1;var s=time-inPoint;var n=i+1<t.length?t[i+1]:e[i];selectorValue*((s>=t[i]&&s<Math.max(e[i],n))?1:0);";
        try {
            var an = layer.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
            an.name = kind === "reveal" ? "NOIR Words" : "NOIR Karaoke";
            var props = an.property("ADBE Text Animator Properties");
            if (kind === "reveal") props.addProperty("ADBE Text Opacity").setValue(0);
            else props.addProperty("ADBE Text Fill Color").setValue(color || [1, 0.85, 0.2]);
            var sel = an.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
            try { sel.property("ADBE Text Range Type2").setValue(3); } catch (eType) {}       // по словам
            sel.property("ADBE Text Expressible Amount").expression = expr;
            return expr;
        } catch (err) { return null; }
    };

    function buildGroup(comp, g, style, anim, ctx) {
        var layout = style.layout;
        var hasAccent = false, i, j;
        for (i = 0; i < g.words.length; i++) if (g.words[i].accent || g.words[i].invert || g.words[i].lineBefore) hasAccent = true;

        if (layout.lineChars && g.text.length > layout.lineChars) hasAccent = true;
        var phraseMode = layout.layerMode === "phrase", karaoke = layout.reveal === "karaoke", wordReveal = layout.reveal === "word" || !layout.reveal;
        var items = [];
        if (layout.reveal === "group" && !hasAccent && !phraseMode) {
            items.push({ text: g.text, accent: false, start: g.compStart, order: 0 });
        } else {
            for (i = 0; i < g.words.length; i++) {
                var ws = g.words[i].compStart, we = g.words[i].compEnd !== undefined ? g.words[i].compEnd : (i + 1 < g.words.length ? g.words[i + 1].compStart : g.compOut);
                items.push({
                    text: g.words[i].text, accent: !!g.words[i].accent, invert: !!g.words[i].invert, lineBefore: !!g.words[i].lineBefore, ord: g.words[i].ord,
                    start: wordReveal ? ws : g.compStart, wStart: ws, wEnd: Math.max(ws + 0.04, we), order: i
                });
            }
        }
        if (phraseMode) items = mergeRuns(items, layout, hasZones(layout));

        var tOut = g.compOut;
        var safeW = comp.width * layout.safeWidth;
        var zones = hasZones(layout), zl = zones ? splitZones(items, layout) : null;
        var lines = zones ? zl.base.concat(zl.acc) : N.splitLines(items, layout);

        // 1. создать слои и измерить
        for (i = 0; i < lines.length; i++) {
            for (j = 0; j < lines[i].length; j++) {
                var it = lines[i][j];
                var st = it.accent ? style.accent : style.base;
                if (it.accent && st.colors && st.colors.length) st = withPaletteColor(st, it.ord);   // палитра по кругу
                if (!it.accent && g.speaker === 1) { var sc = {}; for (var sk in st) sc[sk] = st[sk]; sc.color = layout.speaker2Color || [1, 0.8, 0.26]; st = sc; }   // второй голос — своим цветом
                it.st = st;
                it.size = st.size * ctx.scale;
                it.display = displayText(it.text, st);
                var layer = comp.layers.addText(it.display);
                layer.name = "NOIR · " + it.display;
                layer.comment = N.LAYER_TAG;
                layer.label = it.accent ? 11 : 9;
                applyTextStyle(layer, it.display, st, it.size, ctx);
                applyBlend(layer, st);
                if (it.invert) setInverted(layer, true);   // слово из ~разметки~: белый + Difference
                it.layer = layer;
                it.rect = layer.sourceRectAtTime(Math.max(0, it.start), false);
            }
        }

        // 2–3. раскладка: ужать широкие строки и расставить блок вокруг (posX, posY)
        for (i = 0; i < lines.length; i++) for (j = 0; j < lines[i].length; j++) lines[i][j].t = Math.max(0, lines[i][j].start);
        if (zones) {
            layoutLines(zl.base, layout, safeW, layout.lineGap * style.base.size * ctx.scale, comp.width * layout.posX / 100, comp.height * layout.posY / 100);
            layoutLines(zl.acc, layout, safeW, layout.lineGap * style.accent.size * ctx.scale,
                comp.width * (layout.accentPosX !== undefined && layout.accentPosX !== null ? layout.accentPosX : layout.posX) / 100, comp.height * layout.accentPosY / 100);
        } else layoutLines(lines, layout, safeW, layout.lineGap * style.base.size * ctx.scale,
            comp.width * layout.posX / 100, comp.height * layout.posY / 100);

        var gid = ctx.run + "-" + (ctx.gseq++);
        for (i = 0; i < lines.length; i++) {
            var ln = lines[i];
            for (j = 0; j < ln.length; j++) {
                var w = ln[j], r = w.rect, L = w.layer, pos = w.pos;
                L.property("Transform").property("Anchor Point")
                    .setValue([r.left + r.width / 2, r.top + r.height / 2]);
                setBaseComment(L, pos, gid, w.order, w.lineBefore, g.seg, g.sourceKey);

                var tIn = Math.max(0, Math.min(w.start, tOut - ctx.minDur));
                L.startTime = 0;
                L.inPoint = tIn;
                L.outPoint = tOut;
                if (w.words && w.words.length > 1 && wordReveal) N.wordAnimator(L, "reveal", w.words, tIn, null);
                if (karaoke && w.words) N.wordAnimator(L, "karaoke", w.words, tIn, anim.highlightColor || style.accent.color);
                else if (karaoke) N.wordAnimator(L, "karaoke", [{ wStart: w.wStart, wEnd: w.wEnd }], tIn, anim.highlightColor || style.accent.color);

                if (w.st.shadow) addShadow(L, w.st.shadow, "NOIR Shadow", ctx.scale);
                if (w.st.glow) addShadow(L, { color: w.st.glow.color || w.st.color, opacity: w.st.glow.opacity,
                    distance: 0, softness: w.st.glow.softness }, "NOIR Glow", ctx.scale);
                var a = roleAnim(anim, w.accent);
                var blurProp = N.animUsesBlur(a) ? addBlur(L) : null;
                a.distance = anim.distance * ctx.scale;
                a.blur = anim.blur * ctx.scale;
                a.opacity = styleOpacity(w.st);
                N.applyAnimation(L, pos, tIn, tOut, a, blurProp);
                ctx.created++;
                ctx.made.push({ tIn: tIn, tOut: tOut, accent: !!w.accent, layer: L, seg: g.seg });
            }
        }
    }

    // Раскладка строк: ужимает строки шире безопасной зоны (меняя размер шрифта у слоёв) и считает позиции слов
    // блоком вокруг центра (cx, cy). У слов: layer, rect, size, t (время замера) → добавляется pos.
    function layoutLines(lines, layout, safeW, gapPx, cx, cy) {
        var i, j;
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
                    line[j].rect = line[j].layer.sourceRectAtTime(line[j].t, false);
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
        var blockH = 0;
        for (i = 0; i < lines.length; i++) blockH += lines[i].ascent + lines[i].descent;
        blockH += gapPx * (lines.length - 1);
        var y = cy - blockH / 2;
        for (i = 0; i < lines.length; i++) {
            var ln = lines[i], baseline = y + ln.ascent, x = cx - ln.width / 2;
            for (j = 0; j < ln.length; j++) {
                var w = ln[j], r = w.rect;
                w.pos = [x + r.width / 2, baseline + r.top + r.height / 2];
                x += r.width + ln.space;
            }
            y += ln.ascent + ln.descent + gapPx;
        }
    }

    // Метка слоя: noir-captions:generated|x|y|группа|номер — позиция «в покое» и принадлежность фразе (для автоперекладки).
    function setBaseComment(layer, pos, gid, idx, lineBefore, segment, sourceKey) {
        layer.comment = N.LAYER_TAG + "|" + pos[0] + "|" + pos[1] + "|" + gid + "|" + idx + "|" + (lineBefore ? "line" : "") + "|" + (segment === undefined ? "" : segment) + "|" + (sourceKey || "");
    }
    N.layerSource = function (layer) {
        var gi = N.groupInfo(layer);
        return gi ? gi.sourceKey : "";
    };
    // Две зоны: акценты в своей вертикальной позиции (layout.accentPosY, % высоты; accentPosX — по желанию), остальные слова — в posY.
    function hasZones(layout) { return layout.accentPosY !== undefined && layout.accentPosY !== null; }
    function splitZones(items, layout) {
        var base = [], acc = [], i;
        for (i = 0; i < items.length; i++) (items[i].accent ? acc : base).push(items[i]);
        return { base: N.splitLines(base, layout), acc: N.splitLines(acc, layout) };
    }
    // Анимация акцентов может отличаться: anim.accentIn / accentOut (+ accentInDur / accentOutDur).
    function roleAnim(anim, accent) {
        var a = {}, k;
        for (k in anim) a[k] = anim[k];
        if (accent) {
            if (anim.accentIn) a.animIn = anim.accentIn;
            if (anim.accentOut) a.animOut = anim.accentOut;
            if (anim.accentInDur !== undefined) a.inDur = anim.accentInDur;
            if (anim.accentOutDur !== undefined) a.outDur = anim.accentOutDur;
        }
        return a;
    }
    N.groupInfo = function (layer) {
        var c = String(layer.comment || "");
        if (c.indexOf(N.LAYER_TAG + "|") !== 0) return null;
        var p = c.split("|");
        if (p.length < 5) return null;
        return { gid: p[3], idx: parseInt(p[4], 10), lineBefore: p[5] === "line", segment: p[6] === "" || p[6] === undefined ? null : parseInt(p[6], 10), sourceKey: p[7] || "" };
    };

    // Автоперекладка фразы: слова одной фразы (по метке группы) снова раскладываются по правилам раскладки
    // (перенос по символам, акцент отдельной строкой, интервалы) вокруг её текущего центра. Анимация сохраняется:
    // ключи позиции сдвигаются на ту же величину. Акцент определяется по метке слоя (цвет метки 11).
    N.reflowGroups = function (comp, layers, layout) {
        var scale = comp.width / N.REF_WIDTH, gids = [], seen = {}, i, j, k, res = { groups: 0, moved: 0, skipped: 0 };
        for (i = 0; i < layers.length; i++) {
            var gi = N.groupInfo(layers[i]);
            if (!gi) { res.skipped++; continue; }
            if (!seen[gi.gid]) { seen[gi.gid] = true; gids.push(gi.gid); }
        }
        for (k = 0; k < gids.length; k++) {
            var members = [];
            for (i = 1; i <= comp.numLayers; i++) {
                var l = comp.layer(i), inf = N.groupInfo(l);
                if (inf && inf.gid === gids[k]) members.push({ layer: l, order: inf.idx, lineBefore: inf.lineBefore });
            }
            members.sort(function (a, b) { return a.order - b.order; });
            var items = [], minL = 1e9, maxR = -1e9, minT = 1e9, maxB = -1e9;
            for (j = 0; j < members.length; j++) {
                var ly = members[j].layer, doc = ly.property("Source Text").value, t = Math.max(0, ly.inPoint);
                var rect = ly.sourceRectAtTime(t, false), b0 = N.baseOf(ly);
                items.push({ layer: ly, text: doc.text, accent: ly.label === 11, size: doc.fontSize, rect: rect, t: t, order: members[j].order, lineBefore: members[j].lineBefore, base: b0 });
                minL = Math.min(minL, b0[0] - rect.width / 2); maxR = Math.max(maxR, b0[0] + rect.width / 2);
                minT = Math.min(minT, b0[1] - rect.height / 2); maxB = Math.max(maxB, b0[1] + rect.height / 2);
            }
            if (!items.length) continue;
            var firstBase = items[0].size;
            for (j = 0; j < items.length; j++) if (!items[j].accent) { firstBase = items[j].size; break; }
            var safe = comp.width * layout.safeWidth;
            if (hasZones(layout)) {       // каждая зона перекладывается вокруг собственного центра
                var zset = [[], []], zi;
                for (j = 0; j < items.length; j++) zset[items[j].accent ? 1 : 0].push(items[j]);
                for (zi = 0; zi < 2; zi++) {
                    var zs = zset[zi]; if (!zs.length) continue;
                    var zl = 1e9, zr = -1e9, zt = 1e9, zb = -1e9;
                    for (j = 0; j < zs.length; j++) {
                        zl = Math.min(zl, zs[j].base[0] - zs[j].rect.width / 2); zr = Math.max(zr, zs[j].base[0] + zs[j].rect.width / 2);
                        zt = Math.min(zt, zs[j].base[1] - zs[j].rect.height / 2); zb = Math.max(zb, zs[j].base[1] + zs[j].rect.height / 2);
                    }
                    layoutLines(N.splitLines(zs, layout), layout, safe, layout.lineGap * (zi ? zs[0].size : firstBase), (zl + zr) / 2, (zt + zb) / 2);
                }
            } else {
                var lines = N.splitLines(items, layout);
                layoutLines(lines, layout, safe, layout.lineGap * firstBase, (minL + maxR) / 2, (minT + maxB) / 2);
            }
            for (j = 0; j < items.length; j++) {
                var it = items[j], tr = it.layer.property("Transform"), posProp = tr.property("Position");
                var dx = it.pos[0] - it.base[0], dy = it.pos[1] - it.base[1];
                tr.property("Anchor Point").setValue([it.rect.left + it.rect.width / 2, it.rect.top + it.rect.height / 2]);
                if (posProp.numKeys > 0) {
                    for (var q = 1; q <= posProp.numKeys; q++) {
                        var v = posProp.keyValue(q);
                        posProp.setValueAtKey(q, [v[0] + dx, v[1] + dy, v[2]]);
                    }
                } else {
                    posProp.setValue(it.pos);
                }
                var inf2 = N.groupInfo(it.layer);
                setBaseComment(it.layer, it.pos, inf2.gid, inf2.idx, inf2.lineBefore, inf2.segment === null ? undefined : inf2.segment, inf2.sourceKey);
                res.moved++;
            }
            res.groups++;
        }
        return res;
    };

    // ---------- положение готовых субтитров ----------

    // Сдвиг слоя на (dx, dy). Старые слои с ключами позиции — сдвигаются все ключи.
    N.shiftLayer = function (layer, dx, dy) {
        if (!dx && !dy) return;
        var pos = layer.property("Transform").property("Position");
        if (pos.numKeys > 0) {
            for (var k = 1; k <= pos.numKeys; k++) {
                var v = pos.keyValue(k);
                pos.setValueAtKey(k, [v[0] + dx, v[1] + dy, v[2] || 0]);
            }
        } else {
            var p = pos.value;
            pos.setValue([p[0] + dx, p[1] + dy, p[2] || 0]);
        }
    };

    // Позиция, куда слой поставил генератор (из метки). null — метки нет.
    N.placedOf = function (layer) {
        var c = String(layer.comment || "");
        if (c.indexOf(N.LAYER_TAG + "|") !== 0) return null;
        var p = c.split("|"), x = parseFloat(p[1]), y = parseFloat(p[2]);
        return isNaN(x) || isNaN(y) ? null : [x, y];
    };

    // Ручной сдвиг слоя относительно места, куда его поставил генератор.
    N.manualOffset = function (layer) {
        var placed = N.placedOf(layer), pos = layer.property("Transform").property("Position");
        if (!placed || pos.numKeys > 0) return [0, 0];
        return [pos.value[0] - placed[0], pos.value[1] - placed[1]];
    };

    // Средний ручной сдвиг по фразам: { "<номер фразы>": [dx, dy] } для слоёв нужного источника.
    N.phraseOffsets = function (comp, sourceKey) {
        var sum = {}, out = {}, i, k;
        for (i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i), gi = N.groupInfo(l);
            if (!gi || gi.segment === null || (sourceKey && gi.sourceKey !== sourceKey)) continue;
            var o = N.manualOffset(l), s = sum[gi.segment] || (sum[gi.segment] = [0, 0, 0]);
            s[0] += o[0]; s[1] += o[1]; s[2]++;
        }
        for (k in sum) if (sum.hasOwnProperty(k)) {
            var dx = sum[k][0] / sum[k][2], dy = sum[k][1] / sum[k][2];
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) out[k] = [dx, dy];
        }
        return out;
    };

    // Переносит ручные сдвиги на новые слои (res.made из N.generate).
    N.applyPhraseOffsets = function (made, offsets) {
        var n = 0;
        for (var i = 0; i < made.length; i++) {
            var m = made[i], o = m.layer && m.seg !== undefined ? offsets[m.seg] : null;
            if (o) { N.shiftLayer(m.layer, o[0], o[1]); n++; }
        }
        return n;
    };

    // Все слои фраз, к которым относятся layers (фраза двигается целиком). Слои без метки — сами по себе.
    function phraseBlocks(comp, layers) {
        var blocks = [], byGid = {}, i;
        for (i = 0; i < layers.length; i++) {
            var gi = N.groupInfo(layers[i]);
            if (!gi) { blocks.push([layers[i]]); continue; }
            if (byGid[gi.gid]) continue;
            var members = [];
            for (var j = 1; j <= comp.numLayers; j++) {
                var inf = N.groupInfo(comp.layer(j));
                if (inf && inf.gid === gi.gid) members.push(comp.layer(j));
            }
            byGid[gi.gid] = members;
            blocks.push(members);
        }
        return blocks;
    }

    function blockCenter(block) {
        var minL = 1e9, maxR = -1e9, minT = 1e9, maxB = -1e9;
        for (var i = 0; i < block.length; i++) {
            var l = block[i], b = N.baseOf(l), r = l.sourceRectAtTime(Math.max(0, l.inPoint), false);
            minL = Math.min(minL, b[0] - r.width / 2); maxR = Math.max(maxR, b[0] + r.width / 2);
            minT = Math.min(minT, b[1] - r.height / 2); maxB = Math.max(maxB, b[1] + r.height / 2);
        }
        return [(minL + maxR) / 2, (minT + maxB) / 2];
    }

    // Ставит центр каждой фразы в точку (xPct, yPct) кадра, в процентах. null — эту ось не менять.
    N.moveBlocksTo = function (comp, layers, xPct, yPct) {
        var blocks = phraseBlocks(comp, layers), moved = 0;
        for (var i = 0; i < blocks.length; i++) {
            var c = blockCenter(blocks[i]);
            var dx = xPct === null || xPct === undefined ? 0 : comp.width * xPct / 100 - c[0];
            var dy = yPct === null || yPct === undefined ? 0 : comp.height * yPct / 100 - c[1];
            for (var j = 0; j < blocks[i].length; j++) { N.shiftLayer(blocks[i][j], dx, dy); moved++; }
        }
        return { phrases: blocks.length, layers: moved };
    };

    // Сдвиг на (dx, dy) пикселей; фразы целиком.
    N.nudgeBlocks = function (comp, layers, dx, dy) {
        var blocks = phraseBlocks(comp, layers), moved = 0;
        for (var i = 0; i < blocks.length; i++)
            for (var j = 0; j < blocks[i].length; j++) { N.shiftLayer(blocks[i][j], dx, dy); moved++; }
        return { phrases: blocks.length, layers: moved };
    };

    // Размер текста в разы (factor 1.1 = на 10% крупнее): меняется размер шрифта, а не Scale слоя — ключи не появляются.
    // Фразы затем перекладываются вокруг прежнего центра, чтобы слова не наезжали друг на друга.
    N.scaleFont = function (comp, layers, factor, layout) {
        var n = 0, i, j, blocks = phraseBlocks(comp, layers), centers = [];
        for (i = 0; i < blocks.length; i++) centers.push(blockCenter(blocks[i]));
        for (i = 0; i < layers.length; i++) {
            var prop = layers[i].property("Source Text"), d = prop.value;
            d.fontSize = Math.max(4, d.fontSize * factor);
            if (d.applyStroke && d.strokeWidth) d.strokeWidth = d.strokeWidth * factor;
            prop.setValue(d);
            var r = layers[i].sourceRectAtTime(Math.max(0, layers[i].inPoint), false);
            layers[i].property("Transform").property("Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
            n++;
        }
        var rf = N.reflowGroups(comp, layers, layout);
        for (i = 0; i < blocks.length; i++) {      // центр фразы — тот же, что был до изменения размера
            var c1 = blockCenter(blocks[i]);
            for (j = 0; j < blocks[i].length; j++) N.shiftLayer(blocks[i][j], centers[i][0] - c1[0], centers[i][1] - c1[1]);
        }
        return { changed: n, phrases: rf.groups };
    };

    // ---------- время: сдвиг и подрезка слоёв вместе с их анимацией ----------

    // Обходит все свойства группы (аниматоры, эффекты, трансформ) и вызывает fn для каждого свойства с ключами.
    function walkProps(group, fn, depth) {
        if (!group || (depth || 0) > 6) return;
        var n = typeof group.numProperties === "number" ? group.numProperties : 0, i;
        for (i = 1; i <= n; i++) {
            var p = group.property(i);
            if (!p) continue;
            if (typeof p.numProperties === "number" && p.numProperties > 0) walkProps(p, fn, (depth || 0) + 1);
            else if (p.numKeys > 0) fn(p);
        }
    }

    // Ключи в первой половине жизни слоя — вход (сдвигаются за началом), во второй — выход (за концом).
    function shiftKeys(prop, mid, dIn, dOut, influence) {
        var list = [], i;
        for (i = 1; i <= prop.numKeys; i++) list.push([prop.keyTime(i), prop.keyValue(i)]);
        while (prop.numKeys > 0) prop.removeKey(1);
        for (i = 0; i < list.length; i++) prop.setValueAtTime(list[i][0] + (list[i][0] < mid ? dIn : dOut), list[i][1]);
        easeAll(prop, influence || 80);
    }

    // Новое начало/конец слоя (в секундах композиции). Анимация входа едет за началом, выхода — за концом;
    // слой не делается короче, чем нужно для обеих анимаций. Возвращает {inPoint, outPoint}.
    N.retimeLayer = function (layer, comp, dIn, dOut) {
        var oldIn = layer.inPoint, oldOut = layer.outPoint, minDur = Math.max(comp.frameDuration * 2, 0.04);
        var tmid = (oldIn + oldOut) / 2 - layer.startTime, inSpan = 0, outSpan = 0;
        walkProps(layer, function (prop) {
            for (var i = 1; i <= prop.numKeys; i++) {
                var t = prop.keyTime(i);
                if (t < tmid) inSpan = Math.max(inSpan, t + layer.startTime - oldIn); else outSpan = Math.max(outSpan, oldOut - (t + layer.startTime));
            }
        });
        var need = inSpan + outSpan + minDur, pure = Math.abs(dIn - dOut) < 1e-12;
        var newIn = Math.max(0, oldIn + dIn), newOut = Math.min(comp.duration, oldOut + dOut);
        if (pure) {          // чистый сдвиг: длительность не меняется, величина ограничивается краями композиции
            var d = Math.max(-oldIn, Math.min(comp.duration - oldOut, dIn));
            newIn = oldIn + d; newOut = oldOut + d;
        } else if (newOut - newIn < need) {
            if (dIn && !dOut) newIn = newOut - need; else if (dOut && !dIn) newOut = newIn + need;
            else { var c = (newIn + newOut) / 2; newIn = c - need / 2; newOut = c + need / 2; }
        }
        if (!pure) { newIn = Math.max(0, newIn); newOut = Math.min(comp.duration, Math.max(newOut, newIn + minDur)); }
        var eIn = newIn - oldIn, eOut = newOut - oldOut;
        if (Math.abs(eIn) < 1e-9 && Math.abs(eOut) < 1e-9) return { inPoint: oldIn, outPoint: oldOut };
        walkProps(layer, function (prop) { shiftKeys(prop, tmid, eIn, eOut, 80); });
        if (newIn >= layer.outPoint) { layer.outPoint = newOut; layer.inPoint = newIn; }
        else { layer.inPoint = newIn; layer.outPoint = newOut; }
        return { inPoint: layer.inPoint, outPoint: layer.outPoint };
    };

    // spec: { shift, dIn, dOut } в секундах. Сдвиг = и начало, и конец на одну величину.
    N.retimeLayers = function (comp, layers, spec) {
        var n = 0;
        for (var i = 0; i < layers.length; i++) {
            if (layers[i].locked) continue;
            N.retimeLayer(layers[i], comp, (spec.shift || 0) + (spec.dIn || 0), (spec.shift || 0) + (spec.dOut || 0)); n++;
        }
        return { changed: n };
    };

    // ---------- расстановка с учётом лица ----------

    function splitByRole(block) {
        var base = [], acc = [], i;
        for (i = 0; i < block.length; i++) (block[i].label === 11 ? acc : base).push(block[i]);
        return { base: base, acc: acc };
    }
    function boxOf(set) {
        var l = 1e9, r = -1e9, t = 1e9, b = -1e9, i;
        for (i = 0; i < set.length; i++) {
            var ly = set[i], p = N.baseOf(ly), rc = ly.sourceRectAtTime(Math.max(0, ly.inPoint), false);
            l = Math.min(l, p[0] - rc.width / 2); r = Math.max(r, p[0] + rc.width / 2);
            t = Math.min(t, p[1] - rc.height / 2); b = Math.max(b, p[1] + rc.height / 2);
        }
        return { l: l, r: r, t: t, b: b, cy: (t + b) / 2, h: b - t };
    }
    function moveSetTo(set, cyPx) {
        if (!set.length) return;
        var dy = cyPx - boxOf(set).cy;
        for (var i = 0; i < set.length; i++) N.shiftLayer(set[i], 0, dy);
    }
    // Обычные слова и акценты ставятся каждый на свою высоту (в % кадра) для каждой фразы.
    N.placeZones = function (comp, layers, baseY, accentY) {
        var blocks = phraseBlocks(comp, layers), i, n = 0;
        for (i = 0; i < blocks.length; i++) {
            var sp = splitByRole(blocks[i]);
            moveSetTo(sp.base, comp.height * baseY / 100); moveSetTo(sp.acc, comp.height * accentY / 100); n++;
        }
        return { phrases: n };
    };

    // face: { x, y, w, h } — рамка лица в долях кадра. Свободные полосы — выше головы и ниже подбородка.
    // Мелкий текст уходит в нижнюю полосу, крупные акценты — в верхнюю (если помещаются); иначе фраза целиком в более просторную
    // полосу, при необходимости уменьшаясь. По горизонтали ничего не двигается.
    N.avoidFace = function (comp, layers, face, layout) {
        var H = comp.height, top = Math.max(0, face.y - 0.45 * face.h), bottom = Math.min(1, face.y + face.h + 0.15 * face.h), gap = 0.03;
        var topBand = [0.04, top - gap], botBand = [bottom + gap, 0.96];
        var topH = Math.max(0, topBand[1] - topBand[0]), botH = Math.max(0, botBand[1] - botBand[0]);
        var blocks = phraseBlocks(comp, layers), i, res = { phrases: blocks.length, shrunk: 0, moved: 0, top: 0, bottom: 0, topFree: topH, bottomFree: botH };
        function target(band, desired, hFrac) {       // центр юнита в долях кадра: ближе к desired, но целиком внутри полосы
            return Math.max(band[0] + hFrac / 2, Math.min(band[1] - hFrac / 2, desired));
        }
        for (i = 0; i < blocks.length; i++) {
            var sp = splitByRole(blocks[i]), hb = sp.base.length ? boxOf(sp.base).h / H : 0, ha = sp.acc.length ? boxOf(sp.acc).h / H : 0;
            if (sp.base.length && sp.acc.length && hb <= botH * 1.0 && ha <= topH * 1.0) {
                moveSetTo(sp.base, H * target(botBand, 0.72, hb)); moveSetTo(sp.acc, H * target(topBand, 0.2, ha)); res.top++; res.bottom++; res.moved++;
                continue;
            }
            var all = blocks[i], two = sp.base.length && sp.acc.length, gapF = 0.012;
            var whole = two ? ha + hb + gapF : boxOf(all).h / H;
            var useBottom = botH >= whole * 1.05 || (topH < whole * 1.05 && botH >= topH), band = useBottom ? botBand : topBand, free = useBottom ? botH : topH;
            if (whole > free * 0.98 && free > 0.02 && layout) {
                var f = Math.max(0.35, free * 0.95 / whole);
                N.scaleFont(comp, all, f, layout); res.shrunk++;
                if (two) { hb = boxOf(sp.base).h / H; ha = boxOf(sp.acc).h / H; whole = ha + hb + gapF; } else whole = boxOf(all).h / H;
            }
            var center = target(band, useBottom ? 0.72 : 0.2, whole);
            if (two) {          // акценты и обычные слова — один столбик: акцент сверху, под ним слова
                var unitTop = center - whole / 2;
                moveSetTo(sp.acc, H * (unitTop + ha / 2)); moveSetTo(sp.base, H * (unitTop + ha + gapF + hb / 2));
            } else moveSetTo(all, H * center);
            res[useBottom ? "bottom" : "top"]++; res.moved++;
        }
        return res;
    };

    // Субтитры «за человеком»: слои NOIR ставятся сразу под выбранный слой (например, копию видео с вырезанным человеком).
    N.placeBehind = function (comp, layers, over) {
        var moved = 0, i;
        for (i = layers.length - 1; i >= 0; i--) {
            if (layers[i] === over || layers[i].locked) continue;
            layers[i].moveAfter(over); moved++;
        }
        return { moved: moved };
    };

    // Вернуть слои туда, куда их поставил генератор (снять ручные сдвиги).
    N.resetPositions = function (layers) {
        var n = 0;
        for (var i = 0; i < layers.length; i++) {
            var o = N.manualOffset(layers[i]);
            if (o[0] || o[1]) { N.shiftLayer(layers[i], -o[0], -o[1]); n++; }
        }
        return n;
    };

    // ---------- правка готовых слоёв (выделенных пользователем) ----------

    // Базовая позиция слоя (куда он «встаёт» после анимации входа).
    // Без ключей Position — текущая позиция слоя (учитывает ручной сдвиг); со старыми ключами — из метки.
    N.baseOf = function (layer) {
        var pos0 = layer.property("Transform").property("Position");
        if (pos0.numKeys === 0) return [pos0.value[0], pos0.value[1]];
        var c = String(layer.comment || "");
        if (c.indexOf(N.LAYER_TAG + "|") === 0 || c.indexOf("noir-captions:counter|") === 0) {
            var p = c.split("|"), x = parseFloat(p[1]), y = parseFloat(p[2]);
            if (!isNaN(x) && !isNaN(y)) return [x, y];
        }
        var pos = layer.property("Transform").property("Position");
        var v = pos.numKeys > 0 ? pos.valueAtTime(layer.inPoint + (layer.outPoint - layer.inPoint) / 2, false) : pos.value;
        return [v[0], v[1]];
    };

    function clearEffect(layer, name) {
        var fx = layer.property("ADBE Effect Parade");
        if (!fx) return;
        for (var i = fx.numProperties; i >= 1; i--) if (fx.property(i).name === name) fx.property(i).remove();
    }

    function clearKeys(prop) { while (prop.numKeys > 0) prop.removeKey(1); }

    // Частичное применение: меняем только отмеченные свойства, остальное у слоя не трогаем.
    function restylePartial(layer, comp, st, parts, ctx, safeWidth) {
        var prop = layer.property("Source Text"), doc = prop.value, i;
        var geometry = parts.font || parts.size || parts.stroke;
        if (parts.font && st.fonts && st.fonts.length) {
            var ok = pickFont(st.fonts);
            if (ok) doc.font = ok;
            if (ok !== st.fonts[0]) {
                var msg = ok ? fontMissingMessage(st.fonts, ok)
                    : "Шрифта " + st.fonts[0] + " нет на компьютере — слой оставлен со своим шрифтом.";
                if (ctx._fontMsg !== msg) { ctx.warnings.push(msg); ctx._fontMsg = msg; }
            }
        }
        if (parts.size) { doc.fontSize = st.size * ctx.scale; doc.tracking = st.tracking || 0; }
        if (parts.color) { doc.fillColor = st.color; doc.applyFill = true; }
        if (parts.stroke) {
            if (st.strokeWidth > 0) {
                doc.applyStroke = true;
                doc.strokeColor = st.strokeColor || [0, 0, 0];
                doc.strokeWidth = st.strokeWidth * ctx.scale;
                doc.strokeOverFill = false;
            } else {
                doc.applyStroke = false;
            }
        }
        prop.setValue(doc);
        if (geometry) fitAndAnchor(layer, comp, safeWidth);
        if (parts.fx) applyEffects(layer, st, ctx);
        if (parts.blend) { applyBlend(layer, st); setStaticOpacity(layer, styleOpacity(st)); }
    }

    // Прозрачность слоя без анимации — просто значение; с ключами — масштабируем их.
    function setStaticOpacity(layer, value) {
        var op = layer.property("Transform").property("Opacity");
        if (op.numKeys === 0) { op.setValue(value); return; }
        var top = 0, k;
        for (k = 1; k <= op.numKeys; k++) if (op.keyValue(k) > top) top = op.keyValue(k);
        if (top <= 0) return;
        for (k = 1; k <= op.numKeys; k++) op.setValueAtKey(k, op.keyValue(k) * value / top);
    }

    // Подгоняет ширину под безопасную зону и ставит якорь в центр текста.
    function fitAndAnchor(layer, comp, safeWidth) {
        var prop = layer.property("Source Text"), t = layer.inPoint;
        var rect = layer.sourceRectAtTime(t, false), safeW = comp.width * safeWidth;
        if (rect.width > safeW && rect.width > 0) {
            var d = prop.value;
            d.fontSize = Math.max(6, Math.floor(d.fontSize * safeW / rect.width));
            prop.setValue(d);
            rect = layer.sourceRectAtTime(t, false);
        }
        layer.property("Transform").property("Anchor Point")
            .setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
    }

    function applyEffects(layer, st, ctx) {
        clearEffect(layer, "NOIR Shadow");
        clearEffect(layer, "NOIR Glow");
        if (st.shadow) addShadow(layer, st.shadow, "NOIR Shadow", ctx.scale);
        if (st.glow) addShadow(layer, { color: st.glow.color || st.color, opacity: st.glow.opacity,
            distance: 0, softness: st.glow.softness }, "NOIR Glow", ctx.scale);
    }

    // spec: { style (вид) | null, parts (какие свойства; нет = все + регистр), accent: bool,
    //         safeWidth, anim | null }
    // ctx: { warnings, fontCache, scale }
    N.restyleLayer = function (layer, comp, spec, ctx) {
        var tr = layer.property("Transform");
        var base = N.baseOf(layer);

        if (spec.style && spec.parts) {
            restylePartial(layer, comp, spec.style, spec.parts, ctx, spec.safeWidth);
        } else if (spec.style) {
            var st = spec.style, prop = layer.property("Source Text");
            var text = st.caps ? prop.value.text.toUpperCase() : prop.value.text; // регистр назад не вернуть
            applyTextStyle(layer, text, st, st.size * ctx.scale, ctx);
            fitAndAnchor(layer, comp, spec.safeWidth);
            applyEffects(layer, st, ctx);
            applyBlend(layer, st);
            setStaticOpacity(layer, styleOpacity(st));
            if (N.isGenerated(layer)) {
                layer.name = "NOIR · " + text;
                layer.label = spec.accent ? 11 : 9;
            }
        }

        if (spec.anim) {
            var pos = tr.property("Position"), sc = tr.property("Scale"), op = tr.property("Opacity");
            var rot = tr.property("Rotation");
            var restOpacity = 0, ki;                      // прозрачность слоя «в покое» = максимум по ключам
            if (op.numKeys === 0) restOpacity = op.value;
            else for (ki = 1; ki <= op.numKeys; ki++) if (op.keyValue(ki) > restOpacity) restOpacity = op.keyValue(ki);
            if (restOpacity <= 0) restOpacity = 100;
            var hadSc = sc.numKeys > 0, hadRot = rot.numKeys > 0;      // ручной Scale/Rotation без ключей не трогаем
            clearKeys(pos); clearKeys(sc); clearKeys(op); clearKeys(rot);
            pos.setValue(base);
            if (hadSc) sc.setValue([100, 100, 100]);
            op.setValue(restOpacity);
            if (hadRot) rot.setValue(0);
            clearEffect(layer, "NOIR Blur");
            var a = roleAnim(spec.anim, layer.label === 11);
            a.distance = spec.anim.distance * ctx.scale;
            a.blur = spec.anim.blur * ctx.scale;
            a.opacity = restOpacity;
            var blurProp = N.animUsesBlur(a) ? addBlur(layer) : null;
            N.applyAnimation(layer, base, layer.inPoint, layer.outPoint, a, blurProp);
        }
    };

    // Инверсия одним кликом: если у всех слоёв уже Difference — вернуть Normal; иначе белый цвет + Difference.
    // Не текст (SVG, картинка, фигура): белая заливка с сохранением альфы (эффект Fill) + Difference.
    function setInvertedGraphic(layer, on) {
        clearEffect(layer, "NOIR Invert");
        if (on) {
            var fx = layer.property("ADBE Effect Parade");
            if (fx && fx.canAddProperty("ADBE Fill")) {
                var e = fx.addProperty("ADBE Fill");
                e.name = "NOIR Invert";
                try { e.property("ADBE Fill-0002").setValue([1, 1, 1, 1]); } catch (err) {}
            }
            layer.blendingMode = BlendingMode.DIFFERENCE;
        } else {
            layer.blendingMode = BlendingMode.NORMAL;
        }
    }
    function setInverted(layer, on) {
        if (!(layer instanceof TextLayer)) { setInvertedGraphic(layer, on); return; }
        if (on) {
            var prop = layer.property("Source Text"), d = prop.value;
            d.fillColor = [1, 1, 1]; d.applyFill = true;
            prop.setValue(d);
            layer.blendingMode = BlendingMode.DIFFERENCE;
        } else {
            layer.blendingMode = BlendingMode.NORMAL;
        }
    }
    N.toggleInvert = function (layers) {
        var allOn = true, i;
        for (i = 0; i < layers.length; i++) if (layers[i].blendingMode !== BlendingMode.DIFFERENCE) allOn = false;
        for (i = 0; i < layers.length; i++) setInverted(layers[i], !allOn);
        return !allOn;
    };

    N.restyleLayers = function (comp, layers, spec) {
        var ctx = { warnings: [], fontCache: {}, scale: comp.width / N.REF_WIDTH };
        for (var i = 0; i < layers.length; i++) N.restyleLayer(layers[i], comp, spec, ctx);
        return { changed: layers.length, warnings: ctx.warnings };
    };

    // groups: из N.groupWords + N.timeGroups; у групп и слов есть compStart/compOut.
    // style: { layout, base, accent }, anim: { animIn, animOut, inDur, outDur, distance, blur, easeInfluence }
    N.generate = function (comp, groups, style, anim, replace) {
        var ctx = { warnings: [], fontCache: {}, created: 0, made: [], run: (new Date().getTime() % 1000000).toString(36), gseq: 0, scale: comp.width / N.REF_WIDTH,
            minDur: Math.max(comp.frameDuration, 0.04) };
        // replace: строка — заменить только субтитры этого источника; true — все субтитры NOIR.
        var removed = replace ? N.removeGenerated(comp, typeof replace === "string" ? replace : null) : 0;
        var skipped = 0, ordinal = 0, gi, wi;
        for (gi = 0; gi < groups.length; gi++)             // номер акцентного слова в порядке чтения — для палитры
            for (wi = 0; wi < groups[gi].words.length; wi++) if (groups[gi].words[wi].accent) groups[gi].words[wi].ord = ordinal++;
        for (var i = groups.length - 1; i >= 0; i--) { // с конца: ранние слова окажутся сверху
            var g = groups[i];
            if (g.compOut <= 0 || g.compStart >= comp.duration) { skipped++; continue; }
            g.compStart = Math.max(0, g.compStart);
            g.compOut = Math.min(comp.duration, g.compOut);
            if (g.compOut - g.compStart < comp.frameDuration) { skipped++; continue; }
            buildGroup(comp, g, style, anim, ctx);
        }
        if (skipped) ctx.warnings.push("Пропущено групп вне композиции или короче кадра: " + skipped);
        return { created: ctx.created, removed: removed, warnings: ctx.warnings, made: ctx.made };
    };
    // Для других модулей (tools.jsx): те же помощники, что у генератора слоёв.
    N.gen = {
        applyTextStyle: applyTextStyle, fitAndAnchor: fitAndAnchor, applyEffects: applyEffects, applyBlend: applyBlend,
        addBlur: addBlur, styleOpacity: styleOpacity, clearEffect: clearEffect
    };
    N.newCtx = function (comp) {
        return { warnings: [], fontCache: {}, scale: comp.width / N.REF_WIDTH, minDur: Math.max(comp.frameDuration, 0.04) };
    };
    // Non-destructive preflight. Safe-area estimate covers text at rest, not animated overshoot or effects.
    // Formats and their safe areas (fractions of the frame; platform UI covers the rest). Approximate: platforms change their UI.
    N.FORMATS = [
        { id: "auto", label: "Авто (по кадру)" },
        { id: "reels", label: "Reels 9:16", safe: { top: 0.115, bottom: 0.22, left: 0.06, right: 0.12 } },
        { id: "tiktok", label: "TikTok 9:16", safe: { top: 0.07, bottom: 0.25, left: 0.06, right: 0.14 } },
        { id: "shorts", label: "Shorts 9:16", safe: { top: 0.1, bottom: 0.25, left: 0.06, right: 0.14 } },
        { id: "square", label: "Квадрат 1:1", safe: { top: 0.06, bottom: 0.06, left: 0.06, right: 0.06 } },
        { id: "wide", label: "Горизонталь 16:9", safe: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 } }
    ];
    // ---------- NOIR Control: a null layer with sliders that drives the captions inside AE, without the panel ----------
    // Each caption gets a text animator "NOIR Control" whose Position and Scale follow the sliders by expressions:
    // size scales every phrase around its own centre, X/Y move everything; karaoke highlight colour follows the colour control.
    N.CONTROL_TAG = "noir-captions:control";
    N.CONTROL_NAME = "NOIR Control";
    N.CONTROLS = { size: "Размер", x: "Сдвиг X", y: "Сдвиг Y", color: "Цвет подсветки" };
    N.findControl = function (comp) {
        for (var i = 1; i <= comp.numLayers; i++) if (String(comp.layer(i).comment || "") === N.CONTROL_TAG) return comp.layer(i);
        return null;
    };
    function effectByName(layer, name) {
        var fx = layer.property("ADBE Effect Parade");
        for (var i = 1; i <= fx.numProperties; i++) if (fx.property(i).name === name) return fx.property(i);
        return null;
    }
    N.addControl = function (comp, highlight) {
        var c = N.findControl(comp), made = false;
        if (!c) {
            c = comp.layers.addNull(comp.duration); made = true;
            c.comment = N.CONTROL_TAG; c.label = 9;
            try { c.startTime = 0; c.inPoint = 0; c.outPoint = comp.duration; } catch (eT) {}
        }
        c.name = N.CONTROL_NAME;
        var fx = c.property("ADBE Effect Parade"), list = [[N.CONTROLS.size, 100], [N.CONTROLS.x, 0], [N.CONTROLS.y, 0]];
        for (var i = 0; i < list.length; i++) if (!effectByName(c, list[i][0])) {
            var e = fx.addProperty("ADBE Slider Control"); e.name = list[i][0]; e.property("ADBE Slider Control-0001").setValue(list[i][1]);
        }
        if (!effectByName(c, N.CONTROLS.color)) {
            var col = fx.addProperty("ADBE Color Control"); col.name = N.CONTROLS.color;
            var h = highlight || [1, 0.85, 0.2]; col.property("ADBE Color Control-0001").setValue([h[0], h[1], h[2], 1]);
        }
        return { layer: c, made: made };
    };
    function ctlRef(name) { return 'thisComp.layer("' + N.CONTROL_NAME + '").effect("' + name + '")(1)'; }
    function removeAnimator(layer, name) {
        try {
            var an = layer.property("ADBE Text Properties").property("ADBE Text Animators");
            for (var i = an.numProperties; i >= 1; i--) if (String(an.property(i).name) === name) an.property(i).remove();
        } catch (e) {}
    }
    function karaokeFill(layer) {
        try {
            var an = layer.property("ADBE Text Properties").property("ADBE Text Animators");
            for (var i = 1; i <= an.numProperties; i++) if (String(an.property(i).name) === "NOIR Karaoke") {
                var props = an.property(i).property("ADBE Text Animator Properties");
                for (var j = 1; j <= props.numProperties; j++) if (props.property(j).matchName === "ADBE Text Fill Color") return props.property(j);
            }
        } catch (e) {}
        return null;
    }
    N.linkControl = function (comp, layers) {
        if (!N.findControl(comp)) throw new Error("В композиции нет пульта NOIR Control.");
        var blocks = phraseBlocks(comp, layers), linked = 0, seen = {};
        for (var b = 0; b < blocks.length; b++) {
            var pc = blockCenter(blocks[b]);
            for (var i = 0; i < blocks[b].length; i++) {
                var l = blocks[b][i];
                if (!(l instanceof TextLayer) || !N.isGenerated(l) || seen[l.index]) continue;
                seen[l.index] = true;
                var base = N.baseOf(l), r = l.sourceRectAtTime(Math.max(0, l.inPoint), false);
                // offset = (s−1)·(base − phrase centre − own centre): scaling around the phrase centre, the animator pivots at the text origin
                var vx = Math.round((base[0] - pc[0] - (r.left + r.width / 2)) * 100) / 100, vy = Math.round((base[1] - pc[1] - (r.top + r.height / 2)) * 100) / 100;
                removeAnimator(l, "NOIR Control");
                try {
                    var an = l.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
                    an.name = "NOIR Control";
                    try { an.property("ADBE Text Selectors").addProperty("ADBE Text Selector"); } catch (eSel) {}
                    var props = an.property("ADBE Text Animator Properties");
                    props.addProperty("ADBE Text Position 3D").expression = "var s=" + ctlRef(N.CONTROLS.size) + "/100;[" + ctlRef(N.CONTROLS.x) + "+(s-1)*" + vx + "," + ctlRef(N.CONTROLS.y) + "+(s-1)*" + vy + ",0]";
                    props.addProperty("ADBE Text Scale 3D").expression = "var s=" + ctlRef(N.CONTROLS.size) + ";[s,s,100]";
                } catch (eAn) { continue; }
                var fill = karaokeFill(l); if (fill) fill.expression = ctlRef(N.CONTROLS.color);
                linked++;
            }
        }
        return { linked: linked };
    };
    // Bakes nothing: the captions return to the look without the sliders; the control layer is removed.
    N.unlinkControl = function (comp) {
        var n = 0;
        for (var i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            if (!(l instanceof TextLayer) || !N.isGenerated(l)) continue;
            removeAnimator(l, "NOIR Control");
            var fill = karaokeFill(l); if (fill) fill.expression = "";
            n++;
        }
        var c = N.findControl(comp); if (c) c.remove();
        return { unlinked: n, removed: !!c };
    };

    N.SAFE_TAG = "noir-captions:safe";
    // Format id for a comp: explicit id, or guessed from the aspect ratio.
    N.formatFor = function (comp, id) {
        if (id && id !== "auto") for (var i = 0; i < N.FORMATS.length; i++) if (N.FORMATS[i].id === id) return N.FORMATS[i];
        var r = comp.width / comp.height, guess = r < 0.8 ? "reels" : (r < 1.25 ? "square" : "wide");
        for (var j = 0; j < N.FORMATS.length; j++) if (N.FORMATS[j].id === guess) return N.FORMATS[j];
        return null;
    };
    // A guide layer (not rendered) with the safe-area rectangle. remove=true only removes it.
    N.safeGuides = function (comp, id, remove) {
        var removed = 0, i;
        for (i = comp.numLayers; i >= 1; i--) if (String(comp.layer(i).comment || "") === N.SAFE_TAG) { comp.layer(i).remove(); removed++; }
        if (remove) return { removed: removed };
        var f = N.formatFor(comp, id), s = f.safe, w = comp.width * (1 - s.left - s.right), h = comp.height * (1 - s.top - s.bottom);
        var layer = comp.layers.addShape();
        layer.name = "NOIR · Безопасная зона (" + f.label + ")"; layer.comment = N.SAFE_TAG; layer.guideLayer = true; layer.label = 2;
        var grp = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var shapes = grp.property("ADBE Vectors Group");
        var rect = shapes.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([w, h]);
        rect.property("ADBE Vector Rect Position").setValue([0, 0]);
        var stroke = shapes.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").setValue([0.3, 0.6, 1]);
        stroke.property("ADBE Vector Stroke Width").setValue(Math.max(2, comp.width / 360));
        layer.property("Transform").property("Position").setValue([comp.width * (s.left + (1 - s.left - s.right) / 2), comp.height * (s.top + (1 - s.top - s.bottom) / 2)]);
        return { name: f.label, removed: removed, safe: s };
    };

    function blockHeight(g, style, scale) {
        var L = style.layout, lines = N.splitLines(g.words, L), h = 0;
        for (var j = 0; j < lines.length; j++) {
            var maxSize = 0;
            for (var k = 0; k < lines[j].length; k++) maxSize = Math.max(maxSize, style[lines[j][k].accent ? "accent" : "base"].size * scale);
            h += maxSize * 1.2;
        }
        return h + Math.max(0, lines.length - 1) * L.lineGap * style.base.size * scale;
    }
    function safeOf(comp, L) { var fmt = N.formatFor(comp, L.format); return { fmt: fmt, sa: fmt && fmt.safe ? fmt.safe : { top: .05, bottom: .05, left: .05, right: .05 } }; }
    // What fixes the safe-area remarks: the nearest height inside the safe area, a line width that fits between the side margins,
    // and (only when the tallest phrase is taller than the safe area) a size factor below 1.
    N.safeAreaPlan = function (groups, style, comp) {
        var L = style.layout, scale = comp.width / N.REF_WIDTH, bh = 0, i, s = safeOf(comp, L).sa;
        for (i = 0; i < groups.length; i++) bh = Math.max(bh, blockHeight(groups[i], style, scale));
        var safeWidth = Math.min(L.safeWidth, Math.max(0.3, 1 - s.left - s.right - 0.02)), half = safeWidth * 50;
        var posX = Math.max(s.left * 100 + half, Math.min((1 - s.right) * 100 - half, L.posX));
        var room = comp.height * (1 - s.top - s.bottom), k = bh > room * 0.96 ? room * 0.94 / bh : 1, h = bh * k / comp.height * 100;
        var posY = Math.max(s.top * 100 + h / 2 + 0.5, Math.min((1 - s.bottom) * 100 - h / 2 - 0.5, L.posY));
        return { posX: Math.round(posX * 10) / 10, posY: Math.round(posY * 10) / 10, safeWidth: Math.round(safeWidth * 100) / 100, scale: k };
    };
    N.checkCaptions = function (groups, style, comp) {
        var issues = [], sides = ["base"], i, j, hasAccent = false, L = style.layout, seen = {};
        for (i = 0; i < groups.length; i++) for (j = 0; j < groups[i].words.length; j++) if (groups[i].words[j].accent) hasAccent = true;
        if (hasAccent) sides.push("accent");
        for (i = 0; i < sides.length; i++) {
            var fonts = style[sides[i]].fonts || [], primary = fonts[0], installed = primary ? N.fontInstalled(primary) : false;
            if (installed === false) issues.push({code: "font", target:sides[i], message: fontMissingMessage(fonts, pickFont(fonts))});
            else if (installed === null) issues.push({code: "font_unknown", target:sides[i], message: "AE не позволяет проверить шрифт: " + primary + "."});
        }
        if (!groups.length) issues.push({code: "empty", message: "Нет слов для создания субтитров."});
        var width = comp.width, height = comp.height, scale = width / N.REF_WIDTH;
        for (i = 0; i < groups.length; i++) {
            var g = groups[i], duration = g.end - g.start, label = "Фраза " + (g.seg + 1) + ": ";
            if (g.words.length > 12 || g.text.length > 80 || (duration > 0 && g.text.length / duration > 25))
                issues.push({code: "long", segment: g.seg, message: label + "много текста для чтения — разделите фразу или увеличьте время."});
            var lines = N.splitLines(g.words, L), blockHeight = 0;
            for (j = 0; j < lines.length; j++) {
                var maxSize = 0;
                for (var k = 0; k < lines[j].length; k++) {
                    var word = lines[j][k], size = style[word.accent ? "accent" : "base"].size * scale;
                    maxSize = Math.max(maxSize, size);
                    if (word.text.length > 24) issues.push({code: "word", segment: g.seg, message: label + "длинное слово «" + word.text + "» может сильно уменьшиться."});
                }
                blockHeight += maxSize * 1.2;
            }
            blockHeight += Math.max(0, lines.length - 1) * L.lineGap * style.base.size * scale;
            var fmt = N.formatFor(comp, L.format), sa = fmt && fmt.safe ? fmt.safe : { top: .05, bottom: .05, left: .05, right: .05 };
            var halfWidth = width * L.safeWidth / 2, x = width * L.posX / 100, y = height * L.posY / 100;
            if (x - halfWidth < width * sa.left - 1 || x + halfWidth > width * (1 - sa.right) + 1 ||
                y - blockHeight / 2 < height * sa.top || y + blockHeight / 2 > height * (1 - sa.bottom))
                issues.push({code: "safe_area", segment: g.seg, message: label + "текст может попасть под интерфейс площадки (" + (fmt ? fmt.label : "поля 5%") + "). Проверьте положение."});
            if (g.compOut <= 0 || g.compStart >= comp.duration)
                issues.push({code: "outside", segment: g.seg, message: label + "находится вне композиции."});
        }
        var unique = [];        // one remark per phrase and kind: a phrase split into several groups used to repeat it
        for (i = 0; i < issues.length; i++) { var key = issues[i].code + "|" + issues[i].segment + "|" + issues[i].message; if (!seen[key]) { seen[key] = true; unique.push(issues[i]); } }
        return unique;
    };
    N.styleExamples = function (presets) {
        if (!presets.length) throw new Error("Нет стилей для примера.");
        var comp = null;
        try {
            comp = app.project.items.addComp("NOIR · Галерея стилей", 1080, 1920, 1, 3, 30);
            comp.bgColor = [0.035, 0.035, 0.035];
            for (var i = 0; i < presets.length && i < 4; i++) {
                var preset = presets[i], style = N.parseJSON(N.stringify(preset));
                var factor = Math.min(1, 70 / Math.max(style.base.size, style.accent.size));
                style.base.size *= factor; style.accent.size *= factor;
                style.layout.safeWidth = .42; style.layout.posX = i % 2 ? 75 : 25;
                style.layout.posY = i < 2 ? 25 : 75;
                var words = [{text:"Ваши",start:.3,end:.85}, {text:"слова",start:.85,end:1.45,accent:true}, {text:"оживают",start:1.45,end:2.4}];
                var group = {text:"Ваши слова оживают",seg:i,start:.3,end:2.4,compStart:.3,compOut:2.7,words:words};
                for (var j = 0; j < words.length; j++) words[j].compStart = words[j].start;
                N.generate(comp, [group], style, style.anim, false);
                var title = comp.layers.addText(preset.name), prop = title.property("Source Text"), doc = prop.value;
                doc.fontSize = 26; doc.fillColor = [1,1,1]; doc.applyFill = true;
                doc.justification = ParagraphJustification.CENTER_JUSTIFY; prop.setValue(doc);
                var rect = title.sourceRectAtTime(0, false);
                if (rect.width > 440) { doc.fontSize *= 440 / rect.width; prop.setValue(doc); rect = title.sourceRectAtTime(0, false); }
                title.property("Transform").property("Anchor Point").setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
                title.property("Transform").property("Position").setValue([1080 * style.layout.posX / 100, i < 2 ? 96 : 1056]);
            }
            comp.workAreaStart = 0; comp.workAreaDuration = 3; comp.time = .8;
            comp.openInViewer(); return comp;
        } catch (e) { if (comp) comp.remove(); throw e; }
    };
})(NOIR);
