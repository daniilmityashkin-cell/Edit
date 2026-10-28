/*
 * NOIR CAPTIONS — генератор: группы слов -> текстовые слои AE с анимацией.
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    N.LAYER_TAG = "noir-captions:generated";

    // Анимации описаны состоянием «вне кадра»: op — прозрачность,
    // sc — масштаб %, dx/dy — смещение в долях параметра distance,
    // over — масштаб-перелёт (overshoot) перед 100%.
    N.ANIM_IN = [
        { id: "none", label: "Нет — жёсткая смена" },
        { id: "fade", label: "Fade", op: 0 },
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

    function stateValues(anim, base, distance) {
        return {
            op: anim.op === undefined ? 100 : anim.op,
            sc: anim.sc === undefined ? 100 : anim.sc,
            pos: [base[0] + (anim.dx || 0) * distance, base[1] + (anim.dy || 0) * distance]
        };
    }

    // Ключи входа/выхода. Длительности ужимаются, если слово короткое:
    // вход+выход не больше 80% жизни слоя, чтобы ключи не наезжали друг на друга.
    N.applyAnimation = function (layer, base, t0, t3, opts) {
        var animIn = N.findAnim(N.ANIM_IN, opts.animIn);
        var animOut = N.findAnim(N.ANIM_OUT, opts.animOut);
        var tr = layer.property("Transform");
        var pos = tr.property("Position"), sc = tr.property("Scale"), op = tr.property("Opacity");
        pos.setValue(base);

        var inDur = animIn.id === "none" ? 0 : opts.inDur;
        var outDur = animOut.id === "none" ? 0 : opts.outDur;
        var life = t3 - t0, budget = life * 0.8;
        if (inDur + outDur > budget && inDur + outDur > 0) {
            var k = budget / (inDur + outDur);
            inDur *= k; outDur *= k;
        }
        if (!inDur && !outDur) return;

        var from = stateValues(animIn, base, opts.distance);
        var to = stateValues(animOut, base, opts.distance);
        var t1 = t0 + inDur, t2 = t3 - outDur;

        function keys(prop, vFrom, vNorm, vTo, overshoot) {
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
    };

    function applyTextStyle(layer, text, style, warnings) {
        var prop = layer.property("Source Text");
        var doc = prop.value;
        doc.resetCharStyle();
        doc.resetParagraphStyle();
        doc.text = text;
        doc.fontSize = style.fontSize;
        doc.fillColor = style.color;
        doc.applyFill = true;
        if (style.strokeWidth > 0) {
            doc.applyStroke = true;
            doc.strokeColor = style.strokeColor;
            doc.strokeWidth = style.strokeWidth;
            doc.strokeOverFill = false;
        } else {
            doc.applyStroke = false;
        }
        doc.tracking = style.tracking;
        doc.justification = ParagraphJustification.CENTER_JUSTIFY;
        if (style.font) doc.font = style.font;
        prop.setValue(doc);
        if (style.font && prop.value.font !== style.font && !N._fontWarned) {
            N._fontWarned = true;
            warnings.push("Шрифт " + style.font + " не применился — использован " + prop.value.font);
        }
    }

    function fitAndCenter(layer, comp, t, style) {
        var prop = layer.property("Source Text");
        var maxW = comp.width * style.safeWidth;
        var rect = layer.sourceRectAtTime(t, false);
        if (rect.width > maxW && rect.width > 0) {
            var doc = prop.value;
            doc.fontSize = Math.max(8, Math.floor(doc.fontSize * maxW / rect.width));
            prop.setValue(doc);
            rect = layer.sourceRectAtTime(t, false);
        }
        layer.property("Transform").property("Anchor Point")
            .setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
    }

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

    // groups: из N.groupWords + N.timeGroups, время уже в секундах композиции.
    N.generate = function (comp, groups, style, anim, replace) {
        var warnings = [];
        N._fontWarned = false;
        var removed = replace ? N.removeGenerated(comp) : 0;
        var base = [comp.width * style.posX / 100, comp.height * style.posY / 100];
        var created = 0, skipped = 0;
        for (var i = groups.length - 1; i >= 0; i--) { // с конца: первое слово окажется сверху
            var g = groups[i];
            var tIn = g.compStart, tOut = g.compOut;
            if (tOut <= 0 || tIn >= comp.duration) { skipped++; continue; }
            if (tIn < 0) tIn = 0;
            if (tOut > comp.duration) tOut = comp.duration;
            if (tOut - tIn < comp.frameDuration) { skipped++; continue; }

            var layer = comp.layers.addText(g.text);
            layer.name = "NOIR · " + g.text;
            layer.comment = N.LAYER_TAG;
            layer.label = 9; // зелёная метка в таймлайне — видно, что слой сгенерирован
            applyTextStyle(layer, g.text, style, warnings);
            layer.startTime = 0;
            layer.inPoint = tIn;
            layer.outPoint = tOut;
            fitAndCenter(layer, comp, tIn, style);
            N.applyAnimation(layer, base, tIn, tOut, anim);
            created++;
        }
        if (skipped) warnings.push("Пропущено групп вне композиции или короче кадра: " + skipped);
        return { created: created, removed: removed, warnings: warnings };
    };
})(NOIR);
