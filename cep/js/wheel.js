/* NOIR radial menu ("wheel") and local assistant. Pure view layer: every action goes through the same
   host commands as the buttons (click by role / "run" command), so nothing is duplicated in AE code.
   Gestures: press-and-drag-release (marking menu), or click to open and click an item (sticky).
   Home screen = an embedded, always-open wheel (mount). The overlay wheel opens with the right / middle mouse button anywhere in the panel. */
(function () {
    "use strict";
    var NS = "http://www.w3.org/2000/svg";
    var SECTORS = 11, STEP = 360 / SECTORS;
    // Two geometries: the pop-up wheel and the larger home screen. R0 orb, R1 tile zone, TILE tile size, TILE_R tile ring, SUB item rings, RT half-size of the drawing.
    var GEO_O = { R0: 36, R1: 106, TILE: 38, TILE_R: 90, SUB: [150, 188], RT: 214 }, GEO_H = { R0: 50, R1: 146, TILE: 52, TILE_R: 120, SUB: [178, 214], RT: 252 };
    var R0 = 36, R1 = 106, TILE = 38, TILE_R = 90, SUBR = [150, 188], RT = 214;
    function geo(g) { R0 = g.R0; R1 = g.R1; TILE = g.TILE; TILE_R = g.TILE_R; SUBR = g.SUB; RT = g.RT; }
    var api = null, st = null, overlay = null, bound = false;

    // Shades are computed here: the CEP browser in older After Effects has no color-mix().
    function rgbOf(hex) { return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)]; }
    function mixTo(hex, base, t) { var c = rgbOf(hex); return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(c[i] * t + base[i] * (1 - t)); }).join(",") + ")"; }
    function paint(node, hex) {
        var c = rgbOf(hex), dark = [13, 18, 36], style = node.style;
        style.setProperty("--c", hex); style.setProperty("--cf", mixTo(hex, dark, .22)); style.setProperty("--cf2", mixTo(hex, dark, .4));
        style.setProperty("--cs", "rgba(" + c.join(",") + ",.6)");
    }
    function svg(tag, attrs, parent) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }
    function pt(r, deg) { var a = deg * Math.PI / 180; return [r * Math.sin(a), -r * Math.cos(a)]; }
    function arc(r0, r1, a0, a1) {
        var p = [pt(r1, a0), pt(r1, a1), pt(r0, a1), pt(r0, a0)];
        return "M" + p[0] + " A" + r1 + " " + r1 + " 0 0 1 " + p[1] + " L" + p[2] + " A" + r0 + " " + r0 + " 0 0 0 " + p[3] + "Z";
    }

    var ICONS = {
        video: "M2 3h8v8H2z M10 6l4-2v8l-4-2", text: "M3 3h10 M8 3v10 M5.5 13h5", style: "M3 2h10v12H3z M5 5h6 M5 8h6 M5 11h3",
        place: "M3 3h10 M3 13h10 M8 5v6 M5.5 8.5L8 11l2.5-2.5", move: "M8 2v12 M2 8h12 M8 2l-2 2 M8 2l2 2 M8 14l-2-2 M8 14l2-2 M2 8l2-2 M2 8l2 2 M14 8l-2-2 M14 8l-2 2",
        time: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z M8 5v3l2 1.5", animIn: "M1.5 8h6 M7.5 8l-2-2 M7.5 8l-2 2 M10 3v10", animOut: "M6 3v10 M8.5 8h6 M14.5 8l-2-2 M14.5 8l-2 2",
        create: "M8 2l1.5 4 4 1.5-4 1.5L8 13l-1.5-4-4-1.5 4-1.5z", fix: "M3 13l7-7 M9 4l3 3 M11 2l1 1 M13 5l1 1", more: "M3 8h.01 M8 8h.01 M13 8h.01"
    };

    function time(cmd) { return function () { var c = { op: "time" }; for (var k in cmd) c[k] = cmd[k]; api.run(c); }; }
    function nudge(kx, ky) { return function () { api.run({ op: "nudge", kx: kx, ky: ky }); }; }
    function size(sign) { return function () { api.run({ op: "size", sign: sign }); }; }
    function place(y) { return function () { api.run({ op: "place", y: y }); }; }
    function anim(op, id) { return function () { api.run({ op: op, id: id }); }; }
    function op(name, args) { return function () { api.act(name, args); }; }
    function page(id, anchor) { return function () { api.page(id, false, anchor); }; }

    // Sectors follow the context: no text yet -> source actions first; text ready -> creating; captions made -> editing.
    function buildSectors() {
        var s = api.state() || {}, styles = (api.presets() || []).slice(0, 4).map(function (p) { return { t: p.name.slice(0, 12), run: function () { api.act("preset.choose", { id: p.id }); } }; });
        return [
            { id: "video", label: "Видео", color: "#60a5fa", icon: ICONS.video, items: [
                { t: "Открыть ▸", run: page("video") }, { t: s.recognizing ? "Отмена" : "Распознать", run: op(s.recognizing ? "cancel" : "recognize") }, { t: "Открыть JSON", run: op("json.load") }, { t: "SRT / VTT", run: op("subs.import") }] },
            { id: "text", label: "Текст", color: "#93c5fd", icon: ICONS.text, items: [
                { t: "Открыть ▸", run: page("text") }, { t: "▷ Слушать", run: op("listen") }, { t: "← Фраза", keep: true, run: function () { if (s.phrase > 0) api.act("phrase.select", { index: (api.state().phrase || 0) - 1 }); } },
                { t: "Фраза →", keep: true, run: function () { var c = api.state(); if (c.phrase < c.phrases.length - 1) api.act("phrase.select", { index: c.phrase + 1 }); } },
                { t: "Отменить правку", run: op("text.undo") }, { t: "Сохранить JSON", run: op("json.save") }] },
            { id: "style", label: "Стиль", color: "#bfdbfe", icon: ICONS.style, items: [{ t: "Открыть ▸", run: page("style") }].concat(styles) },
            { id: "place", label: "Позиция", color: "#3b82f6", icon: ICONS.place, items: [
                { t: "Вверху", run: place(25) }, { t: "По центру", run: place(50) }, { t: "Внизу", run: place(75) }, { t: "Исходное", run: function () { api.run({ op: "resetPos" }); } }] },
            { id: "move", label: "Сдвиг", color: "#2563eb", icon: ICONS.move, items: [
                { t: "↑", keep: true, run: nudge(0, -1) }, { t: "↓", keep: true, run: nudge(0, 1) }, { t: "←", keep: true, run: nudge(-1, 0) }, { t: "→", keep: true, run: nudge(1, 0) },
                { t: "A−", keep: true, run: size(-1) }, { t: "A+", keep: true, run: size(1) }] },
            { id: "time", label: "Время", color: "#60a5fa", icon: ICONS.time, items: [
                { t: "◀ раньше", keep: true, run: time({ shift: -1 }) }, { t: "позже ▶", keep: true, run: time({ shift: 1 }) },
                { t: "Начало −", keep: true, run: time({ dIn: -1 }) }, { t: "Начало +", keep: true, run: time({ dIn: 1 }) },
                { t: "Конец −", keep: true, run: time({ dOut: -1 }) }, { t: "Конец +", keep: true, run: time({ dOut: 1 }) }] },
            { id: "in", label: "Вход", color: "#93c5fd", icon: ICONS.animIn, items: [
                { t: "Нет", run: anim("animIn", "none") }, { t: "Fade", run: anim("animIn", "fade") }, { t: "Pop", run: anim("animIn", "pop") }, { t: "Снизу", run: anim("animIn", "rise") },
                { t: "Blur ↑", run: anim("animIn", "blurRise") }, { t: "Whip →", run: anim("animIn", "whipL") }, { t: "По буквам", run: anim("animIn", "letRise") }] },
            { id: "out", label: "Выход", color: "#bfdbfe", icon: ICONS.animOut, items: [
                { t: "Нет", run: anim("animOut", "none") }, { t: "Fade", run: anim("animOut", "fade") }, { t: "Blur", run: anim("animOut", "blur") }, { t: "Вверх", run: anim("animOut", "up") },
                { t: "Shrink", run: anim("animOut", "shrink") }, { t: "← Whip", run: anim("animOut", "whipR") }, { t: "Стереть", run: anim("animOut", "letType") }] },
            { id: "make", label: "Создать", color: "#3b82f6", icon: ICONS.create, items: [
                { t: s.canUpdate ? "Обновить все" : "Создать все", run: function () { api.generate("all"); } }, { t: "Обновить фразу", run: function () { api.generate("phrase"); } },
                { t: "Превью", run: function () { api.generate("preview"); } }, { t: "Проверить", run: function () { api.generate("check"); } }] },
            { id: "fix", label: "Правка", color: "#2563eb", icon: ICONS.fix, items: [
                { t: "Открыть ▸", run: page("edit") }, { t: "Этого видео", run: function () { api.run({ op: "scope", id: "source" }); } }, { t: "Выделенные", run: function () { api.run({ op: "scope", id: "selected" }); } },
                { t: "Все NOIR", run: function () { api.run({ op: "scope", id: "all" }); } }, { t: "Применить стиль", run: function () { api.run({ op: "applyStyle" }); } }, { t: "За человеком", run: function () { api.run({ op: "behind" }); } },
                { t: "Удалить", run: function () { if (window.confirm("Удалить выбранные субтитры? Отмена — Ctrl+Z в AE.")) api.run({ op: "delete", confirmed: true }); } }] },
            { id: "more", label: "Ещё", color: "#94a3b8", icon: ICONS.more, items: [
                { t: "Настройки", run: page("settings") }, { t: "Шрифт", run: page("settings", "set-font") }, { t: "Раскладка", run: page("settings", "set-layout") },
                { t: "Звук", run: page("edit", "edit-sfx") }, { t: "Помощник", run: function () { openAssistant(); } }] }
        ];
    }

    // ---- layout of the sub-items of the active sector (staggered rows keep labels apart) ----
    function layoutItems(sector, index) {
        geo(st.g);
        var items = sector.items, n = items.length, base = index * STEP, step = n <= 4 ? 26 : n <= 6 ? 17 : 14, out = [];
        for (var i = 0; i < n; i++) {
            var deg = base + (i - (n - 1) / 2) * step, r = n > 4 && i % 2 ? SUBR[1] : SUBR[0];
            var w = Math.max(30, items[i].t.length * 5.8 + 16), p = pt(r, deg); p[0] = Math.max(-(RT - w / 2 - 2), Math.min(RT - w / 2 - 2, p[0]));
            out.push({ x: p[0], y: p[1], w: w, h: 22, item: items[i] });
        }
        return out;
    }

    // Orb, glass tiles and curved light lines (after the Neuron reference). Geometry for hit-testing is unchanged.
    function defs(root) {
        var d = svg("defs", {}, root), g = svg("radialGradient", { id: "wh-orb", cx: "38%", cy: "30%", r: "75%" }, d);
        [["0", "#bfe0ff"], ["35%", "#3b82f6"], ["75%", "#1e3a8a"], ["100%", "#0b1330"]].forEach(function (x) { svg("stop", { offset: x[0], "stop-color": x[1] }, g); });
        var h = svg("radialGradient", { id: "wh-halo" }, d);
        svg("stop", { offset: "0", "stop-color": "#3b82f6", "stop-opacity": ".55" }, h); svg("stop", { offset: "1", "stop-color": "#3b82f6", "stop-opacity": "0" }, h);
        var gl = svg("linearGradient", { id: "wh-glass", x1: "0", y1: "0", x2: "1", y2: "1" }, d);
        svg("stop", { offset: "0", "stop-color": "#ffffff", "stop-opacity": ".22" }, gl); svg("stop", { offset: "1", "stop-color": "#ffffff", "stop-opacity": ".04" }, gl);
        var gp = svg("pattern", { id: "wh-grid", width: 22, height: 22, patternUnits: "userSpaceOnUse" }, d);
        svg("path", { d: "M22 0H0V22", fill: "none", stroke: "#4f8cff", "stroke-opacity": ".13", "stroke-width": ".6" }, gp);
        var clip = svg("clipPath", { id: "wh-clip" }, d); svg("circle", { r: 168 }, clip);
        var f = svg("filter", { id: "wh-glow", x: "-60%", y: "-60%", width: "220%", height: "220%" }, d);
        svg("feGaussianBlur", { stdDeviation: "3.2" }, f);
    }
    function render() {
        geo(st.g);
        var g = st.layer, k = RT / 214;
        while (g.firstChild) g.removeChild(g.firstChild);
        svg("circle", { r: 200 * k, fill: "url(#wh-halo)", opacity: ".5" }, g);
        svg("rect", { x: -168 * k, y: -168 * k, width: 336 * k, height: 336 * k, fill: "url(#wh-grid)", "clip-path": "url(#wh-clip)", opacity: ".8" }, g);
        [104, 160, 205].forEach(function (r, i) { svg("circle", { r: r * k, fill: "none", stroke: "#ffffff", "stroke-opacity": .1 - i * .02, "stroke-width": 1 }, g); });
        st.sectors.forEach(function (s, i) {
            var node = svg("g", { "class": "wh-sector" + (i === st.sector ? " active" : "") + (st.level === 0 && i === st.kb ? " kb" : "") }, g);
            paint(node, s.color);
            var a = i * STEP, p0 = pt(R0 - 1, a), p1 = pt(TILE_R - TILE / 2 - 1, a), side = pt(1, a + 90), bend = (i % 2 ? 1 : -1) * 22;
            var c1 = [p0[0] * 1.35 + side[0] * bend, p0[1] * 1.35 + side[1] * bend], c2 = [p1[0] * .8 + side[0] * bend * .4, p1[1] * .8 + side[1] * bend * .4];
            svg("path", { d: "M" + p0 + " C" + c1 + " " + c2 + " " + p1, "class": "wh-line" }, node);
            svg("circle", { cx: p1[0], cy: p1[1], r: 2.2, "class": "wh-dot" }, node);
            var tc = pt(TILE_R, a);
            svg("rect", { x: tc[0] - TILE / 2, y: tc[1] - TILE / 2, width: TILE, height: TILE, rx: 10, "class": "wh-tile-glow" }, node);
            svg("rect", { x: tc[0] - TILE / 2, y: tc[1] - TILE / 2, width: TILE, height: TILE, rx: 10, "class": "wh-tile" }, node);
            var ic = svg("g", { transform: "translate(" + (tc[0] - 8) + "," + (tc[1] - 8) + ")", "class": "wh-icon" }, node);
            svg("path", { d: s.icon, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, ic);
            var t = svg("text", { x: tc[0], y: tc[1] + TILE / 2 + 9, "text-anchor": "middle", "class": "wh-label" }, node);
            t.textContent = s.label;
        });
        var core = svg("g", { "class": "wh-core" + (st.hover === "center" ? " hover" : "") }, g);
        svg("circle", { r: R0 + 8, fill: "#3b82f6", opacity: ".35", filter: "url(#wh-glow)" }, core);
        svg("circle", { r: R0 - 2, fill: "url(#wh-orb)", "class": "wh-orb" }, core);
        svg("path", { d: "M-22 -4 C-14 -26 12 -28 22 -10 C10 -16 -10 -12 -22 -4Z", fill: "#ffffff", opacity: ".28" }, core);
        svg("path", { d: "M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6Z", "class": "wh-spark" }, core);
        if (st.sector >= 0) {
            var sector = st.sectors[st.sector];
            st.pills = layoutItems(sector, st.sector);
            st.pills.forEach(function (pill, j) {
                var node = svg("g", { "class": "wh-pill" + (j === st.item ? " hover" : "") + (st.level === 1 && j === st.kb ? " kb" : "") }, g);
                paint(node, sector.color);
                svg("rect", { x: pill.x - pill.w / 2, y: pill.y - pill.h / 2, width: pill.w, height: pill.h, rx: 11 }, node);
                var tx = svg("text", { x: pill.x, y: pill.y + 3.6, "text-anchor": "middle" }, node);
                tx.textContent = pill.item.t;
            });
        } else st.pills = [];
    }

    function pointer(e) {
        if (st.persistent) { var r = st.root.getBoundingClientRect(); st.cx = r.left + r.width / 2; st.cy = r.top + r.height / 2; st.scale = r.width / (st.g.RT * 2) || 1; }
        return { x: (e.clientX - st.cx) / st.scale, y: (e.clientY - st.cy) / st.scale };
    }
    function sectorAt(p) {
        var deg = Math.atan2(p.x, -p.y) * 180 / Math.PI; if (deg < 0) deg += 360;
        return Math.round(deg / STEP) % SECTORS;
    }
    function hit(p) {
        geo(st.g);
        for (var j = 0; j < st.pills.length; j++) {
            var q = st.pills[j];
            if (Math.abs(p.x - q.x) <= q.w / 2 + 3 && Math.abs(p.y - q.y) <= q.h / 2 + 3) return { type: "item", index: j };
        }
        var d = Math.sqrt(p.x * p.x + p.y * p.y);
        if (d < R0) return { type: "center" };
        if (st.persistent) {
            // home screen: a tile is chosen by being near the tile itself, so a path from a tile to its items does not hop to a neighbour
            if (d > TILE_R + TILE * 0.6) return null;        // out among the items: the open tile stays
            var best = -1, bestD = TILE * 0.95;
            for (var i = 0; i < st.sectors.length; i++) {
                var c = pt(TILE_R, i * STEP), dd = Math.sqrt((p.x - c[0]) * (p.x - c[0]) + (p.y - c[1]) * (p.y - c[1]));
                if (dd < bestD) { bestD = dd; best = i; }
            }
            return best >= 0 ? { type: "sector", index: best } : null;
        }
        if (d < R1 + 4) return { type: "sector", index: sectorAt(p) };
        return null;
    }
    function hover(e) {
        var h = hit(pointer(e)), changed = false;
        if (h && h.type === "sector" && h.index !== st.sector && !st.locked) { st.sector = h.index; st.item = -1; changed = true; }
        var item = h && h.type === "item" ? h.index : -1, center = h && h.type === "center" ? "center" : "";
        if (item !== st.item || center !== st.hover) { st.item = item; st.hover = center; changed = true; }
        if (changed) { st.kb = -1; render(); }
        return h;
    }

    function close() {
        if (!st || st.persistent) return;
        document.removeEventListener("pointermove", onMove, true); document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("keydown", onKey, true); window.removeEventListener("blur", close);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; st = null;
    }
    function execute(h) {
        if (!h) return false;
        if (h.type === "center") { close(); openAssistant(); return true; }
        if (h.type !== "item") return false;
        var pill = st.pills[h.index], keep = st.persistent || (pill.item.keep && st.mode === "sticky");
        if (!keep) close();
        try { pill.item.run(); } catch (err) { api.notify(String(err && err.message || err), 6000); }
        return true;
    }
    function onMove(e) {
        if (!st) return;
        if (!st.moved && Math.abs(e.clientX - st.x0) + Math.abs(e.clientY - st.y0) > 10) st.moved = true;
        hover(e);
    }
    function onUp(e) {
        if (!st) return;
        e.preventDefault();
        if (st.mode === "drag") {
            var far = Math.abs(e.clientX - st.x0) + Math.abs(e.clientY - st.y0) > 10;
            if (!far) { st.mode = "sticky"; overlay.classList.add("sticky"); return; }   // click without moving: stay open
            var h = hover(e); if (!execute(h)) close();
            return;
        }
        var target = hover(e);
        if (!execute(target)) { if (!target) close(); }
    }
    function onKey(e) {
        if (!st) return;
        var key = e.key;
        if (key === "Escape") { e.preventDefault(); e.stopPropagation(); if (st.level === 1) { st.level = 0; st.kb = st.sector; render(); } else close(); return; }
        var forward = key === "ArrowRight" || key === "ArrowDown", back = key === "ArrowLeft" || key === "ArrowUp";
        if (!forward && !back && key !== "Enter" && key !== " ") return;
        e.preventDefault(); e.stopPropagation(); st.mode = "sticky";
        if (st.kb < 0) st.kb = st.level === 0 ? Math.max(0, st.sector) : 0;
        if (forward || back) {
            var count = st.level === 0 ? SECTORS : st.pills.length, nextIndex = (st.kb + (forward ? 1 : -1) + count) % count;
            st.kb = nextIndex;
            if (st.level === 0) st.sector = nextIndex;
            render(); return;
        }
        if (st.level === 0) { st.sector = st.kb; render(); st.level = 1; st.kb = 0; render(); }
        else execute({ type: "item", index: st.kb });
    }

    function open(x, y, mode, keyboard) {
        var RT = GEO_O.RT;      // local: the module-level RT follows whichever wheel rendered last
        close(); closeAssistant();
        var vw = window.innerWidth, vh = window.innerHeight, scale = Math.max(.5, Math.min(1, (Math.min(vw, vh) / 2 - 6) / RT));
        var half = RT * scale + 3;
        var cx = vw >= half * 2 ? Math.min(vw - half, Math.max(half, x)) : vw / 2, cy = vh >= half * 2 ? Math.min(vh - half, Math.max(half, y)) : vh / 2;
        overlay = document.createElement("div"); overlay.id = "noir-wheel"; overlay.className = "noir-wheel" + (mode === "sticky" ? " sticky" : "");
        overlay.setAttribute("role", "menu"); overlay.setAttribute("aria-label", "Радиальное меню NOIR");
        var size = RT * 2 * scale, root = svg("svg", { viewBox: -RT + " " + -RT + " " + RT * 2 + " " + RT * 2, width: size, height: size }, overlay);
        root.style.left = (cx - size / 2) + "px"; root.style.top = (cy - size / 2) + "px";
        defs(root); var layer = svg("g", {}, root);
        st = { g: GEO_O, cx: cx, cy: cy, scale: scale, mode: mode, x0: x, y0: y, moved: false, sector: -1, item: -1, hover: "", kb: -1, level: 0, pills: [], sectors: buildSectors(), layer: layer };
        document.body.appendChild(overlay);
        document.addEventListener("pointermove", onMove, true); document.addEventListener("pointerup", onUp, true);
        document.addEventListener("keydown", onKey, true); window.addEventListener("blur", close);
        overlay.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
        if (keyboard) { st.mode = "sticky"; st.kb = 0; st.sector = 0; }
        render();
    }

    // ---- embedded, always-open wheel: the home screen of the panel ----
    var home = null, homeObserver = null;
    function mount(host, options) {
        if (options) api = options;
        if (homeObserver) { homeObserver.disconnect(); homeObserver = null; }
        host.textContent = ""; home = null;
        var wrap = document.createElement("div"); wrap.className = "noir-home"; host.appendChild(wrap);
        var HR = GEO_H.RT, root = svg("svg", { viewBox: -HR + " " + -HR + " " + HR * 2 + " " + HR * 2, tabindex: 0, role: "application", "aria-label": "Главное меню NOIR: плитки действий вокруг помощника" }, wrap);
        defs(root); var layer = svg("g", {}, root);
        home = { g: GEO_H, persistent: true, root: root, cx: 0, cy: 0, scale: 1, mode: "sticky", x0: 0, y0: 0, moved: true, sector: -1, item: -1, hover: "", kb: -1, level: 0, pills: [], sectors: buildSectors(), layer: layer };
        function fit() {
            var w = host.clientWidth, h = host.clientHeight, side = Math.max(160, Math.min(w, h));
            root.setAttribute("width", side); root.setAttribute("height", side);
        }
        fit();
        if (window.ResizeObserver) { homeObserver = new ResizeObserver(fit); homeObserver.observe(host); } else window.addEventListener("resize", fit);
        // Handlers temporarily make the home state current, then restore the previous one (an overlay wheel may be open above).
        function inHome(fn) { return function (e) { if (!home) return; var prev = st; st = home; try { fn(e); } finally { st = prev; } }; }
        root.addEventListener("pointermove", inHome(function (e) { hover(e); }));
        root.addEventListener("pointerdown", inHome(function (e) { if (e.button === 0) { hover(e); st.locked = st.sector >= 0; } }));   // a press-and-drag keeps its tile
        root.addEventListener("pointerup", inHome(function (e) { if (e.button !== 0) return; st.locked = false; var h = hover(e); if (h) execute(h); }));
        window.addEventListener("pointerup", function () { if (home) home.locked = false; }, true);
        root.addEventListener("keydown", inHome(function (e) { onKey(e); }));
        root.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        (function () { var prev = st; st = home; render(); st = prev; })();
    }

    // The assistant lives in assistant.js; the wheel only opens it.
    function openAssistant() { if (window.NoirAssistant) NoirAssistant.open(); }
    function closeAssistant() { if (window.NoirAssistant) NoirAssistant.close(); }

    function bindHub(hub) {
        if (!hub) return;
        hub.setAttribute("role", "button"); hub.setAttribute("tabindex", "0"); hub.setAttribute("aria-haspopup", "menu");
        hub.setAttribute("aria-label", "Радиальное меню: нажмите или зажмите и ведите мышью"); hub.title = "Радиальное меню: нажмите или зажмите и ведите мышью к действию";
        hub.addEventListener("pointerdown", function (e) { if (e.button !== 0) return; e.preventDefault(); open(window.innerWidth / 2, window.innerHeight / 2, "drag"); st.x0 = e.clientX; st.y0 = e.clientY; });
        hub.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(window.innerWidth / 2, window.innerHeight / 2, "sticky", true); } });
    }

    window.NoirWheel = {
        init: function (options) {
            api = options; bindHub(options.hub);
            if (bound) return; bound = true;
            // Right / middle button anywhere (outside text fields) opens the wheel under the pointer.
            document.addEventListener("pointerdown", function (e) {
                if ((e.button !== 2 && e.button !== 1) || st) return;
                if (e.target.closest && e.target.closest("input,textarea,select,.noir-assistant")) return;
                e.preventDefault(); open(e.clientX, e.clientY, "drag");
            });
            document.addEventListener("contextmenu", function (e) { if (!(e.target.closest && e.target.closest("input,textarea,select"))) e.preventDefault(); });
        },
        mount: mount, open: open, close: close, openAssistant: openAssistant
    };
})();
