/*
 * NOIR CAPTIONS — тема панели: чёрный фон, один тёплый акцент, тонкие линии.
 *
 * ScriptUI не умеет градиенты, размытие и скруглённые рамки, поэтому здесь:
 *  - своя полоса вкладок и свои кнопки (рисуются через onDraw);
 *  - скругление = заливка прямоугольника + 4 эллипса, «рамка» = заливка на 1px больше;
 *  - нативные поля ввода и списки не трогаем (AE красит их сам).
 * Любая ошибка в теме не должна ломать панель: всё обёрнуто в try/catch,
 * а panel.jsx при отсутствии N.theme использует обычные вкладки.
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    var C = {
        bg: [0.043, 0.043, 0.051],
        card: [0.082, 0.082, 0.094],
        cardHi: [0.118, 0.118, 0.133],
        line: [0.176, 0.176, 0.196],
        lineHi: [0.29, 0.29, 0.32],
        text: [0.93, 0.93, 0.94],
        muted: [0.53, 0.53, 0.58],
        accent: [1.0, 0.36, 0.13],
        accentHi: [1.0, 0.47, 0.25]
    };
    var T = N.theme = { colors: C };

    function brush(g, c) { return g.newBrush(g.BrushType.SOLID_COLOR, [c[0], c[1], c[2], 1]); }
    function pen(g, c) { return g.newPen(g.PenType.SOLID_COLOR, [c[0], c[1], c[2], 1], 1); }

    T.background = function (el, c) {
        try { el.graphics.backgroundColor = brush(el.graphics, c || C.bg); } catch (e) {}
    };

    // c — цвет текста; size/bold — необязательно (шрифт берём текущий, меняем кегль)
    T.text = function (el, c, size, bold) {
        try {
            var g = el.graphics;
            g.foregroundColor = pen(g, c || C.text);
            if (size || bold) g.font = ScriptUI.newFont(g.font.name, bold ? "BOLD" : "REGULAR", size || g.font.size);
        } catch (e) {}
    };

    // Скруглённый прямоугольник заливкой (в ScriptUI нет дуг/кривых).
    function fillRound(g, x, y, w, h, r, b) {
        if (r * 2 > h) r = h / 2;
        if (r * 2 > w) r = w / 2;
        g.newPath(); g.rectPath(x + r, y, w - 2 * r, h); g.fillPath(b);
        g.newPath(); g.rectPath(x, y + r, w, h - 2 * r); g.fillPath(b);
        g.newPath(); g.ellipsePath(x, y, 2 * r, 2 * r); g.fillPath(b);
        g.newPath(); g.ellipsePath(x + w - 2 * r, y, 2 * r, 2 * r); g.fillPath(b);
        g.newPath(); g.ellipsePath(x, y + h - 2 * r, 2 * r, 2 * r); g.fillPath(b);
        g.newPath(); g.ellipsePath(x + w - 2 * r, y + h - 2 * r, 2 * r, 2 * r); g.fillPath(b);
    }

    function redraw(el) { try { el.notify("onDraw"); } catch (e) {} }

    function drawLabel(el, g, w, h, c, bold) {
        var f = null;
        try { f = ScriptUI.newFont(g.font.name, bold ? "BOLD" : "REGULAR", g.font.size); } catch (e) {}
        var txt = el.text, sz;
        try { sz = f ? g.measureString(txt, f) : g.measureString(txt); } catch (e2) { sz = { width: 0, height: 0 }; }
        var p = pen(g, c);
        if (f) g.drawString(txt, p, Math.max(4, (w - sz.width) / 2), Math.max(0, (h - sz.height) / 2), f);
        else g.drawString(txt, p, Math.max(4, (w - sz.width) / 2), Math.max(0, (h - sz.height) / 2));
    }

    // kind: "primary" — залитая акцентом; "ghost" — тонкая рамка.
    T.button = function (btn, kind) {
        try {
            btn.onDraw = function () {
                var g = this.graphics, w = this.size.width, h = this.size.height;
                var on = this.enabled, hot = !!this._hot;
                if (kind === "primary") {
                    fillRound(g, 0, 0, w, h, 6, brush(g, !on ? C.line : (hot ? C.accentHi : C.accent)));
                    drawLabel(this, g, w, h, on ? [1, 1, 1] : C.muted, true);
                } else {
                    fillRound(g, 0, 0, w, h, 6, brush(g, hot && on ? C.lineHi : C.line));
                    fillRound(g, 1, 1, w - 2, h - 2, 5, brush(g, hot && on ? C.cardHi : C.card));
                    drawLabel(this, g, w, h, on ? C.text : C.muted, false);
                }
            };
            btn.addEventListener("mouseover", function () { this._hot = true; redraw(this); });
            btn.addEventListener("mouseout", function () { this._hot = false; redraw(this); });
        } catch (e) {}
    };

    // Замена tabbedpanel: полоса текстовых вкладок + стопка групп.
    // Возвращает объект с add("tab", undefined, label), как у tabbedpanel.
    T.makeTabs = function (parent) {
        var bar = parent.add("group");
        bar.orientation = "row";
        bar.alignChildren = ["left", "center"];
        bar.spacing = 2;
        bar.margins = [0, 0, 0, 0];
        var stack = parent.add("group");
        stack.orientation = "stack";
        stack.alignChildren = ["fill", "top"];
        stack.alignment = ["fill", "fill"];

        var api = { buttons: [], pages: [], current: 0 };
        api.select = function (i) {
            for (var k = 0; k < api.pages.length; k++) {
                api.pages[k].visible = (k === i);
                redraw(api.buttons[k]);
            }
            api.current = i;
        };
        api.add = function (type, bounds, label) {
            var idx = api.pages.length;
            var page = stack.add("group");
            page.orientation = "column";
            page.visible = (idx === 0);
            var b = bar.add("button", undefined, label);
            b.preferredSize = [Math.max(48, label.length * 7 + 16), 24];
            try {
                b.onDraw = function () {
                    var g = this.graphics, w = this.size.width, h = this.size.height;
                    var sel = api.current === idx, hot = !!this._hot;
                    T.background(this, C.bg);
                    drawLabel(this, g, w, h, sel ? C.text : (hot ? C.text : C.muted), sel);
                    if (sel) { g.newPath(); g.rectPath(6, h - 2, w - 12, 2); g.fillPath(brush(g, C.accent)); }
                };
                b.addEventListener("mouseover", function () { this._hot = true; redraw(this); });
                b.addEventListener("mouseout", function () { this._hot = false; redraw(this); });
            } catch (e) {}
            b.onClick = function () { api.select(idx); };
            api.buttons.push(b);
            api.pages.push(page);
            return page;
        };
        return api;
    };

    // Приглушённые подписи, светлые чекбоксы — рекурсивно по дереву.
    T.styleTree = function (el) {
        var kids = el.children, i;
        if (!kids) return;
        for (i = 0; i < kids.length; i++) {
            var k = kids[i];
            if (k.type === "statictext" && !k._keep) T.text(k, C.muted);
            else if (k.type === "checkbox" || k.type === "radiobutton") T.text(k, C.text);
            else if (k.type === "panel") { T.text(k, C.muted); }
            if (k.children && k.children.length) T.styleTree(k);
        }
    };
})(NOIR);
