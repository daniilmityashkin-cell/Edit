/* NOIR radial menu v2 (right or middle mouse button anywhere, Space outside text fields, or NoirWheel.open()).
   Ring 1: up to 8 sectors, chosen by context — no text yet / text ready / captions made (or NOIR layers selected).
   Ring 2: the hovered sector's actions, laid out on arcs so that no two pills overlap (checked by rectangles, the radius grows until they fit).
   Centre: the hovered item's name and the panel status; click it for the assistant.
   Gestures: press-drag-release (marking menu) or click-to-open then click. Keys: 1–8 sector, then 1–9 action; arrows; Enter; Backspace back; Esc close. */
(function () {
    "use strict";
    var api = null, st = null, bound = false;
    var NS = "http://www.w3.org/2000/svg";
    // Sector icons: names from js/icons.js (Lucide subset).
    var ICONS = { video: "mic", file: "file", subs: "captions", text: "type", style: "palette", format: "format", gear: "settings", create: "create", eye: "eye",
        check: "check", reveal: "reveal", save: "save", place: "place", move: "move", time: "time", animIn: "animIn", animOut: "animOut", refresh: "refresh", more: "more" };
    function svgIcon(name) {
        var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
        s.innerHTML = (window.NoirIcons || {})[name] || ""; return s;
    }
    function el(tag, cls, parent, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e; }

    // ---------- what the menu contains ----------
    function state() { return api.state() || {}; }
    function presetItems(apply) {
        var s = state(), fav = (s.settings && s.settings.favoriteStyles) || [], all = api.presets() || [], chosen = s.settings && s.settings.presetId;
        var list = all.filter(function (p) { return fav.indexOf(p.id) >= 0; });
        all.forEach(function (p) { if (p.id === chosen && list.indexOf(p) < 0) list.unshift(p); });
        all.forEach(function (p) { if (list.length < 5 && list.indexOf(p) < 0) list.push(p); });
        return list.slice(0, 6).map(function (p) {
            return { t: p.name.split(" (")[0].slice(0, 16), on: p.id === chosen, run: function () { return api.act("preset.choose", { id: p.id }).then(function (r) { if (r && apply) return api.run({ op: "applyStyle", scope: st ? st.scope || undefined : undefined }); }); } };
        }).concat([{ t: "Все стили ▸", run: function () { api.page("style"); } }]);
    }
    function sectors(kind) {
        var s = state();
        function run(cmd) { return function () { var c = {}; for (var k in cmd) c[k] = cmd[k]; if (st && st.scope && !c.scope) c.scope = st.scope; return api.run(c); }; }
        function act(op, args) { return function () { return api.act(op, args); }; }
        function go(page, anchor) { return function () { api.page(page, false, anchor); }; }
        function gen(mode) { return function () { return api.generate(mode); }; }
        function set(path, value) { return function () { return api.act("settings.set", { path: path, value: value }); }; }
        var settings = { label: "Настройки", icon: ICONS.gear, items: [{ t: "Шрифт", run: go("settings", "set-font") }, { t: "Раскладка", run: go("settings", "set-layout") }, { t: "Распознавание", run: go("video") }, { t: "Проект", run: go("settings") }] };
        var L = s.settings ? s.settings.style.layout : {}, A = s.settings ? s.settings.style.anim : {};
        if (kind === "start") return [
            { label: s.recognizing ? "Отменить" : "Распознать речь", icon: ICONS.video, run: act(s.recognizing ? "cancel" : "recognize") },
            { label: "Открыть JSON", icon: ICONS.file, run: act("json.load") },
            { label: "Импорт SRT / VTT", icon: ICONS.subs, run: act("subs.import") },
            { label: "Стиль", icon: ICONS.style, items: presetItems(false) },
            { label: "Формат", icon: ICONS.format, items: ((api.meta && api.meta() || {}).formats || []).map(function (f) { return { t: f.label.replace(" (по кадру)", ""), on: s.settings && s.settings.format === f.id, run: set("format", f.id) }; }).concat([{ t: "Показать зону", run: act("safe.guides", {}) }]) },
            settings
        ];
        if (kind === "text") return [
            { label: "Создать субтитры", icon: ICONS.create, run: gen("all") },
            { label: "Превью фразы", icon: ICONS.eye, run: gen("preview") },
            { label: "Проверить", icon: ICONS.check, run: gen("check") },
            { label: "Текст", icon: ICONS.text, items: [{ t: "← Фраза", keep: true, run: function () { var c = state(); if (c.phrase > 0) return api.act("phrase.select", { index: c.phrase - 1 }); } },
                { t: "Фраза →", keep: true, run: function () { var c = state(); if (c.phrase < c.phrases.length - 1) return api.act("phrase.select", { index: c.phrase + 1 }); } },
                { t: "▷ Слушать", run: act("listen") }, { t: "Отменить правку", run: act("text.undo") }, { t: "Открыть ▸", run: go("text") }] },
            { label: "Стиль", icon: ICONS.style, items: presetItems(false) },
            { label: "Появление слов", icon: ICONS.reveal, items: [{ t: "По словам", on: L.reveal === "word", run: set("style.layout.reveal", "word") }, { t: "Фразой", on: L.reveal === "group", run: set("style.layout.reveal", "group") },
                { t: "Караоке", on: L.reveal === "karaoke", run: set("style.layout.reveal", "karaoke") }, { t: "Слой на фразу", on: L.layerMode === "phrase", run: set("style.layout.layerMode", "phrase") },
                { t: "Слой на слово", on: L.layerMode === "word", run: set("style.layout.layerMode", "word") }] },
            { label: "Файлы", icon: ICONS.save, items: [{ t: "Сохранить JSON", run: act("json.save") }, { t: "Экспорт SRT", run: act("subs.export", { format: "srt" }) }, { t: "Экспорт VTT", run: act("subs.export", { format: "vtt" }) }, { t: "Открыть JSON", run: act("json.load") }] },
            settings
        ];
        return [
            { label: "Позиция", icon: ICONS.place, items: [{ t: "Вверху", run: run({ op: "place", y: 25 }) }, { t: "Центр", run: run({ op: "place", y: 50 }) }, { t: "Внизу", run: run({ op: "place", y: 75 }) },
                { t: "Исходные места", run: run({ op: "resetPos" }) }, { t: "Убрать с лица", run: run({ op: "avoidFace" }) }, { t: "За выделенным", run: run({ op: "behind" }) }] },
            { label: "Сдвиг и размер", icon: ICONS.move, items: [{ t: "↑", keep: true, run: run({ op: "nudge", kx: 0, ky: -1 }) }, { t: "→", keep: true, run: run({ op: "nudge", kx: 1, ky: 0 }) },
                { t: "↓", keep: true, run: run({ op: "nudge", kx: 0, ky: 1 }) }, { t: "←", keep: true, run: run({ op: "nudge", kx: -1, ky: 0 }) }, { t: "A+", keep: true, run: run({ op: "size", sign: 1 }) }, { t: "A−", keep: true, run: run({ op: "size", sign: -1 }) }] },
            { label: "Время", icon: ICONS.time, items: [{ t: "Раньше", keep: true, run: run({ op: "time", shift: -1 }) }, { t: "Позже", keep: true, run: run({ op: "time", shift: 1 }) },
                { t: "Начало −", keep: true, run: run({ op: "time", dIn: -1 }) }, { t: "Начало +", keep: true, run: run({ op: "time", dIn: 1 }) }, { t: "Конец −", keep: true, run: run({ op: "time", dOut: -1 }) }, { t: "Конец +", keep: true, run: run({ op: "time", dOut: 1 }) }] },
            { label: "Появление", icon: ICONS.animIn, items: [["none", "Нет"], ["fade", "Fade"], ["pop", "Pop"], ["rise", "Снизу"], ["blurRise", "Blur ↑"], ["whipL", "Whip"], ["letRise", "По буквам"], ["type", "Печать"]].map(function (x) {
                return { t: x[1], on: A.animIn === x[0], run: run({ op: "animIn", id: x[0] }) }; }) },
            { label: "Исчезание", icon: ICONS.animOut, items: [["none", "Нет"], ["fade", "Fade"], ["blur", "Blur"], ["up", "Вверх"], ["shrink", "Shrink"], ["whipR", "Whip"], ["letType", "Стереть"]].map(function (x) {
                return { t: x[1], on: A.animOut === x[0], run: run({ op: "animOut", id: x[0] }) }; }) },
            { label: "Стиль", icon: ICONS.style, items: presetItems(true).concat([{ t: "Применить текущий", run: run({ op: "applyStyle" }) }]) },
            { label: "Обновить", icon: ICONS.refresh, items: [{ t: "Обновить фразу", run: gen("phrase") }, { t: "Обновить все", run: gen("all") }, { t: "Превью фразы", run: gen("preview") }, { t: "Проверить", run: gen("check") }] },
            { label: "Ещё", icon: ICONS.more, items: [{ t: "Сделать акцентом", run: run({ op: "makeAccent" }) }, { t: "Сделать обычным", run: run({ op: "makeBase" }) }, { t: "Инверсия", run: act("layers.invert") },
                { t: "Пульт в AE", run: act("control.add", {}) }, { t: "Автозум", run: function () { return api.act("zoom.apply", { on: "accents", scale: 110, replace: true }); } }, { t: "Текст ▸", run: go("text") }, { t: "Правка ▸", run: go("edit") },
                { t: "Удалить", danger: true, run: function () { if (window.confirm("Удалить субтитры? Отмена — Ctrl+Z в AE.")) return run({ op: "delete", confirmed: true })(); } }] }
        ];
    }

    // ---------- geometry ----------
    // Base sizes at scale 1; the ring is drawn at its real pixel size (no CSS scaling, so text stays sharp).
    var R1 = 86, TILE = 50, ORB = 86;
    function pos(r, deg) { var a = deg * Math.PI / 180; return [r * Math.sin(a), -r * Math.cos(a)]; }
    function overlaps(a, b, pad) { return Math.abs(a.x - b.x) * 2 < a.w + b.w + pad && Math.abs(a.y - b.y) * 2 < a.h + b.h + pad; }

    // ---------- open / render ----------
    function open(x, y, mode, keyboard) {
        close(); if (window.NoirAssistant) NoirAssistant.close();
        var s = state();
        st = { mode: mode || "sticky", x0: x, y0: y, sector: -1, item: -1, keyLevel: 0, scope: null, kind: !s.hasData ? "start" : s.canUpdate ? "captions" : "text" };
        build(x, y, keyboard);
        // Selected NOIR layers: edit commands work on the selection (and the captions sectors are shown).
        if (api.call) api.call("selection", {}, true).then(function (sel) {
            if (!st || !sel) return;
            st.sel = sel;
            if (sel.noir > 0) { st.scope = "selected"; if (st.kind !== "captions") { st.kind = "captions"; build(st.cx0, st.cy0, false); } }
            paint();
        }).catch(function () {});
    }
    // The section's actions always appear in ONE place: a glass sheet beside the ring (right or left), or under it in a narrow
    // panel. Switching sections only swaps the sheet's content.
    var SHEET_PAD = 10, HEAD = 40, ROWH = 34, RGAP = 4, CGAP = 6;
    function build(x, y, keyboard) {
        if (st.ov && st.ov.parentNode) st.ov.parentNode.removeChild(st.ov);
        st.cx0 = x; st.cy0 = y; st.sector = -1; st.item = -1;
        var L = window.NoirI18n && NoirI18n.ui ? NoirI18n.ui : function (v) { return v; };
        var list = sectors(st.kind).slice(0, 8), n = list.length; st.list = list;
        list.forEach(function (sec) { sec.label = L(sec.label); (sec.items || []).forEach(function (it) { it.t = L(it.t); }); });
        var ov = el("div", "noir-wheel" + (st.mode === "sticky" ? " sticky" : ""), document.body); ov.setAttribute("role", "menu"); ov.setAttribute("aria-label", "Радиальное меню NOIR"); st.ov = ov;

        // sheet size from the longest label of all sections
        var probe = el("span", "rw-item probe", ov), colW = 0, rowsMax = 1;
        list.forEach(function (sec) { (sec.items || []).forEach(function (it) { probe.textContent = it.t; colW = Math.max(colW, probe.offsetWidth); }); });
        ov.removeChild(probe);
        colW = Math.max(132, Math.min(230, colW + 52));
        var vw = window.innerWidth, vh = window.innerHeight, pad = 10;
        var half = (vw - 2 * pad - 2 * SHEET_PAD - CGAP) / 2, cols = half >= 118 ? 2 : 1;      // two columns whenever a column can be ≥118 px
        colW = cols === 2 ? Math.min(colW, half) : Math.min(colW, vw - 2 * pad - 2 * SHEET_PAD);
        list.forEach(function (sec) { if (sec.items) rowsMax = Math.max(rowsMax, Math.ceil(sec.items.length / cols)); });
        var sw = cols * colW + (cols - 1) * CGAP + 2 * SHEET_PAD, sh = HEAD + rowsMax * ROWH + (rowsMax - 1) * RGAP + SHEET_PAD;

        // Ring size and where the sheet goes. The ring wants ~60% of the smaller side (not below the base size); in a small panel it
        // shrinks (down to ~0.62×) so that the sheet fits beside or under it. Only a really tiny panel puts the sheet over the ring.
        // ext0: tiles' edge; vis0: with the outer circle and the section name along it (what must stay inside the panel)
        var ext0 = R1 + TILE / 2 + 6, vis0 = ext0 + 23, want = Math.max(1, Math.min(2.2, Math.min(vw, vh) * 0.6 / (2 * ext0)));
        var kSide = Math.min(want, (vw - 2 * pad - sw - 16) / (ext0 + vis0), (vh - 2 * pad) / (2 * vis0));
        var kBelow = Math.min(want, (vh - 2 * pad - sh - 16) / (ext0 + vis0), (vw - 2 * pad) / (2 * vis0));
        var side = kSide >= kBelow ? "right" : "below", k = Math.max(kSide, kBelow);
        if (k < 0.62) { side = "over"; k = Math.min(want, (vw - 2 * pad) / (2 * vis0), (vh - 2 * pad) / (2 * vis0)); }
        var g = { r1: R1 * k, tile: TILE * k, orb: ORB * k, ext: ext0 * k, k: k }; st.g = g;
        function clampC(v, lo, hi) { return hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)); }
        // keep the whole ring on screen, with the outer circle and the section name written along it (≈ ext + 9 + text)
        var vis = vis0 * k;
        var cx = clampC(x, pad + vis, vw - pad - vis), cy = clampC(y, pad + vis, vh - pad - vis);
        if (side === "right") {
            if (vw - pad - (cx + g.ext) < sw + 16) {
                if (cx - g.ext - pad >= sw + 16) side = "left";
                else cx = (vw - (2 * g.ext + 16 + sw)) / 2 + g.ext;          // ring + sheet centred together
            }
        } else if (side === "below") cy = clampC(cy, pad + vis, vh - pad - sh - 16 - g.ext);
        var sx, sy;
        if (side === "right") { sx = cx + g.ext + 16; sy = clampC(cy - sh / 2, pad, vh - pad - sh); }
        else if (side === "left") { sx = cx - g.ext - 16 - sw; sy = clampC(cy - sh / 2, pad, vh - pad - sh); }
        else if (side === "below") { sx = clampC(cx - sw / 2, pad, vw - pad - sw); sy = cy + g.ext + 16; }
        else { sx = clampC(cx - sw / 2, pad, vw - pad - sw); sy = clampC(cy - sh / 2, pad, vh - pad - sh); }
        st.cx = cx; st.cy = cy; st.k = 1;

        var rw = el("div", "rw", ov); st.rw = rw; rw.style.left = cx + "px"; rw.style.top = cy + "px";
        drawRing(rw, g, list);
        st.tiles = [];
        list.forEach(function (sec, i) {
            var p = pos(g.r1, i * 360 / n), b = el("button", "rw-tile" + (sec.items ? "" : " direct"), rw); b.type = "button"; b.setAttribute("role", "menuitem"); b.setAttribute("aria-label", (i + 1) + ". " + sec.label);
            b.style.cssText = "left:" + (p[0] - g.tile / 2) + "px;top:" + (p[1] - g.tile / 2) + "px;width:" + g.tile + "px;height:" + g.tile + "px";
            b.style.setProperty("--i", i); b.style.setProperty("--ic", Math.round(g.tile * 0.42) + "px");
            b.appendChild(svgIcon(sec.icon || ICONS.more)); el("span", "rw-num", b, String(i + 1));
            st.tiles.push({ x: p[0], y: p[1], w: g.tile + 8, h: g.tile + 8, el: b });
        });
        var orb = el("button", "rw-orb", rw); orb.type = "button"; orb.setAttribute("aria-label", "Помощник");
        orb.style.cssText = "width:" + g.orb + "px;height:" + g.orb + "px;left:" + -g.orb / 2 + "px;top:" + -g.orb / 2 + "px;--fs:" + Math.round(11 * Math.min(1.35, k) * 10) / 10 + "px";
        if (window.NoirBrand) { st.orbArt = NoirBrand.orb(); orb.appendChild(st.orbArt); }
        var ot = el("span", "rw-orb-text", orb);
        st.label = el("span", "rw-label", ot, ""); st.status = el("span", "rw-status", ot, ""); st.orb = orb;

        var sheet = el("div", "rw-card rw-sheet side-" + side + (side === "over" ? " over" : ""), ov); sheet.hidden = true;
        sheet.style.cssText = "left:" + sx + "px;top:" + sy + "px;width:" + sw + "px;--cols:" + cols + ";--colw:" + colW + "px";
        st.sheet = sheet; st.items = sheet; st.cols = cols;
        if (!st.bound) {
            st.bound = true;
            document.addEventListener("pointermove", onMove, true); document.addEventListener("pointerup", onUp, true); document.addEventListener("keydown", onKey, true); window.addEventListener("blur", close);
        }
        ov.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        if (keyboard) { st.mode = "sticky"; ov.classList.add("sticky"); setSector(0); } else paint();
    }
    // The ring: a dark track with one gold segment per section (the gold runs champagne → gold → bronze around the ring),
    // a bright cap over the chosen segment, section numbers 01–08 inside, a thin outer circle with four nodes and the chosen
    // section's name written along it; an amber glow behind turns toward the chosen section.
    function arc(r, a0, a1) {
        var p0 = pos(r, a0), p1 = pos(r, a1), large = a1 - a0 > 180 ? 1 : 0;
        return "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) + " A" + r.toFixed(2) + " " + r.toFixed(2) + " 0 " + large + " 1 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
    }
    // a text path along the circle centred on angle a, upright on both halves (clockwise on top, counter-clockwise below)
    function textArc(R, a, span) {
        if (Math.cos(a * Math.PI / 180) >= -0.01) return arc(R, a - span, a + span);
        var p0 = pos(R, a + span), p1 = pos(R, a - span);
        return "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) + " A" + R.toFixed(2) + " " + R.toFixed(2) + " 0 0 0 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
    }
    function drawRing(rw, g, list) {
        var n = list.length, step = 360 / n, bw = g.tile * 0.74, gapDeg = Math.max(2.2, 360 * 5 / (2 * Math.PI * g.r1)), R = g.ext + 9, half = R + 30;
        var glow = el("div", "rw-glow", rw), gs = g.r1 * 2.3; glow.style.cssText = "width:" + gs + "px;height:" + gs + "px;left:" + -gs / 2 + "px;top:" + -gs / 2 + "px"; st.glow = glow;
        var svg = document.createElementNS(NS, "svg"), u = "rw" + Date.now();
        svg.setAttribute("class", "rw-svg"); svg.setAttribute("width", 2 * half); svg.setAttribute("height", 2 * half);
        svg.setAttribute("viewBox", -half + " " + -half + " " + 2 * half + " " + 2 * half); svg.style.cssText = "left:" + -half + "px;top:" + -half + "px";
        var h = "<defs><linearGradient id='" + u + "' x1='" + -g.r1 + "' y1='" + -g.r1 + "' x2='" + g.r1 + "' y2='" + g.r1 + "' gradientUnits='userSpaceOnUse'>" +
            "<stop offset='0' stop-color='#fff2cf'/><stop offset='.3' stop-color='#e9bd62'/><stop offset='.58' stop-color='#b07a2a'/><stop offset='.8' stop-color='#e2b45a'/><stop offset='1' stop-color='#8d5f1d'/></linearGradient></defs>";
        h += "<circle class='rw-track' r='" + g.r1.toFixed(2) + "' stroke-width='" + bw.toFixed(2) + "'/>";
        for (var i = 0; i < n; i++) h += "<path class='rw-seg' data-i='" + i + "' d='" + arc(g.r1, i * step - step / 2 + gapDeg / 2, i * step + step / 2 - gapDeg / 2) + "' stroke='url(#" + u + ")' stroke-width='" + bw.toFixed(2) + "'/>";
        for (i = 0; i < n; i++) {
            var a0 = i * step - step / 2 + gapDeg / 2, a1 = i * step + step / 2 - gapDeg / 2;
            h += "<path class='rw-edge' d='" + arc(g.r1 + bw / 2 - 0.5, a0, a1) + "' stroke='url(#" + u + ")'/><path class='rw-edge in' d='" + arc(g.r1 - bw / 2 + 0.5, a0, a1) + "' stroke='url(#" + u + ")'/>";
        }
        for (i = 0; i < n; i++) h += "<path class='rw-cap' data-i='" + i + "' d='" + arc(g.r1 + bw / 2 + 4, i * step - step / 2 + gapDeg / 2, i * step + step / 2 - gapDeg / 2) + "' stroke-width='" + Math.max(3, 4 * g.k).toFixed(1) + "'/>";
        h += "<circle class='rw-outer' r='" + R.toFixed(2) + "'/>";
        [45, 135, 225, 315].forEach(function (d) { var p = pos(R, d); h += "<circle class='rw-node' cx='" + p[0].toFixed(2) + "' cy='" + p[1].toFixed(2) + "' r='" + Math.max(3, 4 * g.k).toFixed(1) + "'/>"; });
        var rn = g.r1 - bw / 2 - Math.max(9, 10 * g.k), fs = Math.max(8.5, Math.min(11, 9 * g.k));
        for (i = 0; i < n; i++) { var p = pos(rn, i * step); h += "<text class='rw-n' data-i='" + i + "' x='" + p[0].toFixed(2) + "' y='" + p[1].toFixed(2) + "' style='font-size:" + fs.toFixed(1) + "px'>" + (i < 9 ? "0" : "") + (i + 1) + "</text>"; }
        // every section's name along the outer circle (dim; shortened to its own arc), the chosen one bright on top
        var lfs = Math.max(8.5, Math.min(11, 9 * g.k));
        for (i = 0; i < n; i++) h += "<path id='" + u + "l" + i + "' d='" + textArc(R, i * step, Math.min(170, step * 1.5)) + "' fill='none'/><text class='rw-curve dim' data-i='" + i + "' style='font-size:" + lfs.toFixed(1) + "px'><textPath href='#" + u + "l" + i + "' startOffset='50%' text-anchor='middle'></textPath></text>";
        h += "<path id='" + u + "p' d='' fill='none'/><text class='rw-curve' style='font-size:" + Math.max(9, Math.min(12, 10 * g.k)).toFixed(1) + "px'><textPath href='#" + u + "p' startOffset='50%' text-anchor='middle'></textPath></text>";
        svg.innerHTML = h; rw.appendChild(svg);
        st.ring = { svg: svg, R: R, step: step, pathEl: svg.querySelector("[id='" + u + "p']"), tp: svg.querySelector(".rw-curve:not(.dim) textPath") };
        st.ring.tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + u + "p");
        var avail = R * (step - 7) * Math.PI / 180;
        Array.prototype.forEach.call(svg.querySelectorAll(".rw-curve.dim"), function (t, j) {
            var tp = t.querySelector("textPath"), label = list[j].label.toUpperCase();
            tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + u + "l" + j);
            tp.textContent = label;
            var w = 0; try { w = t.getComputedTextLength(); } catch (e) {}
            if (w > avail) { t.classList.add("tight"); try { w = t.getComputedTextLength(); } catch (e2) {} }
            for (var cut = label.length; w > avail && cut > 3; cut--) { tp.textContent = label.slice(0, cut - 1).replace(/\s+$/, "") + "…"; try { w = t.getComputedTextLength(); } catch (e3) { break; } }
        });
    }
    function paintRing() {
        var r = st.ring; if (!r) return;
        var i = st.sector, segs = r.svg.querySelectorAll(".rw-seg, .rw-cap, .rw-n"), k;
        for (k = 0; k < segs.length; k++) segs[k].classList.toggle("on", Number(segs[k].getAttribute("data-i")) === i);
        var dims = r.svg.querySelectorAll(".rw-curve.dim");
        for (k = 0; k < dims.length; k++) dims[k].classList.toggle("hide", k === i);
        var sec = i >= 0 ? st.list[i] : null;
        if (st.glow) { st.glow.classList.toggle("on", !!sec); var gp = sec ? pos(st.g.r1 * 0.55, i * r.step) : [0, 0]; st.glow.style.transform = "translate(" + gp[0].toFixed(1) + "px," + gp[1].toFixed(1) + "px)"; }
        if (r.shown === i) return; r.shown = i;
        if (!sec) { r.tp.textContent = ""; return; }
        // text along the outer circle, centred on the section; upright on both halves (clockwise on top, counter-clockwise below)
        r.pathEl.setAttribute("d", textArc(r.R, i * r.step, 80));
        r.tp.textContent = sec.label;
    }
    function hideSheet() {
        if (!st || st.sheet.hidden) { if (st) setSector(-1); return; }
        st.sheet.classList.add("leaving");
        setTimeout(function () { if (st && st.sheet.classList.contains("leaving")) { st.sheet.classList.remove("leaving"); setSector(-1); } }, 160);
    }
    function setSector(i) {
        if (!st || i === st.sector) return;
        clearTimeout(st.intent);
        st.sector = i; st.item = -1; st.keyLevel = 0;
        var sheet = st.sheet, sec = i >= 0 ? st.list[i] : null;
        sheet.textContent = "";
        if (!sec || !sec.items) { sheet.hidden = true; paint(); return; }
        var wasHidden = sheet.hidden; sheet.hidden = false; sheet.classList.remove("leaving");
        sheet.classList.remove("swap"); void sheet.offsetWidth; sheet.classList.add(wasHidden ? "enter" : "swap");
        var head = el("div", "rw-sheet-head", sheet), ic = el("span", "rw-sheet-icon", head); ic.appendChild(svgIcon(sec.icon || ICONS.more));
        el("span", "rw-sheet-title", head, sec.label); el("span", "rw-sheet-num", head, String(i + 1));
        var grid = el("div", "rw-grid", sheet);
        sec.items.forEach(function (it, j) {
            var b = el("button", "rw-item" + (it.on ? " on" : "") + (it.danger ? " danger" : ""), grid); b.type = "button"; b.setAttribute("role", "menuitem");
            el("span", "rw-item-text", b, it.t); if (j < 9) el("span", "rw-key", b, String(j + 1));
            b.style.setProperty("--j", j);
        });
        paint();
    }
    function paint() {
        if (!st) return;
        st.tiles.forEach(function (t, i) { t.el.classList.toggle("active", i === st.sector); });
        paintRing();
        Array.prototype.forEach.call(st.sheet.querySelectorAll(".rw-item"), function (b, j) { b.classList.toggle("hover", j === st.item); });
        var sec = st.sector >= 0 ? st.list[st.sector] : null, it = sec && sec.items && st.item >= 0 ? sec.items[st.item] : null;
        st.label.textContent = it ? it.t : sec ? sec.label : st.hoverOrb ? (window.NoirI18n ? NoirI18n.ui("Помощник") : "Помощник") : "NOIR";
        var ps = api.status ? api.status() : ["", ""], sel = st.sel && st.sel.noir ? (window.NoirI18n ? NoirI18n.ui("Выделено слоёв: ") : "Выделено слоёв: ") + st.sel.noir : "";
        st.status.textContent = sel || ps[1] || ""; st.orb.setAttribute("data-state", ps[0] || "");
        if (st.orbArt) st.orbArt.classList.toggle("busy", ps[0] === "busy");
    }

    // ---------- input ----------
    function hit(e) {
        var items = st.sheet.hidden ? [] : st.sheet.querySelectorAll(".rw-item"), j;
        for (j = 0; j < items.length; j++) { var r = items[j].getBoundingClientRect(); if (e.clientX >= r.left - 2 && e.clientX <= r.right + 2 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) return { type: "item", index: j }; }
        var sr = st.sheet.hidden ? null : st.sheet.getBoundingClientRect();
        if (sr && e.clientX >= sr.left && e.clientX <= sr.right && e.clientY >= sr.top && e.clientY <= sr.bottom) return { type: "sheet" };
        var px = e.clientX - st.cx, py = e.clientY - st.cy, d = Math.sqrt(px * px + py * py), g = st.g;
        if (d < g.orb / 2) return { type: "orb" };
        // sections switch only on the band of tiles (crossing the middle on the way to the sheet changes nothing)
        if (d > g.r1 - g.tile / 2 - 8 && d < g.r1 + g.tile / 2 + 14) { var deg = Math.atan2(px, -py) * 180 / Math.PI; if (deg < 0) deg += 360; return { type: "sector", index: Math.round(deg / (360 / st.list.length)) % st.list.length }; }
        if (d <= g.r1 - g.tile / 2 - 8) return { type: "inner" };
        return null;
    }
    function track(e, immediate) {
        var h = hit(e);
        // pointer away from the ring and the sheet: the sheet fades away shortly (keyboard choice keeps it)
        if (!h && st.sector >= 0 && st.keyLevel !== 1) { if (!st.leave) st.leave = setTimeout(function () { if (st) { st.leave = 0; hideSheet(); } }, 280); }
        else if (h) { clearTimeout(st.leave); st.leave = 0; }
        st.hoverOrb = !!h && h.type === "orb";
        if (h && h.type === "sector" && h.index !== st.sector) {
            // Right on a tile: switch at once. Between tiles on the band: a short pause (the timer is not restarted by every
            // pointer move), so brushing past a neighbour on the way to the sheet does not swap the section.
            var tile = st.tiles[h.index], tx = e.clientX - st.cx - tile.x, ty = e.clientY - st.cy - tile.y, onTile = tx * tx + ty * ty <= Math.pow(st.g.tile / 2 + 2, 2);
            if (immediate || st.sector < 0 || onTile) { clearTimeout(st.intent); st.intentIdx = -1; setSector(h.index); }
            else if (st.intentIdx !== h.index) { clearTimeout(st.intent); var idx = h.index; st.intentIdx = idx; st.intent = setTimeout(function () { if (st) { st.intentIdx = -1; setSector(idx); } }, 90); }
        } else if (!h || h.type !== "sector") { clearTimeout(st.intent); st.intentIdx = -1; }
        st.item = h && h.type === "item" ? h.index : -1;
        paint(); return h;
    }
    function execute(sector, item) {
        var sec = st.list[sector], target = item >= 0 && sec.items ? sec.items[item] : (!sec.items ? sec : null);
        if (!target) return false;
        if (!(target.keep && st.mode === "sticky")) close();
        try { var r = target.run(); if (r && r.then) r.then(function () { if (st) paint(); }, function () {}); } catch (err) { if (api.notify) api.notify(String(err && err.message || err), "error"); }
        return true;
    }
    function assistant() { close(); if (window.NoirAssistant) NoirAssistant.open(); }
    function onMove(e) { if (st) { if (Math.abs(e.clientX - st.x0) + Math.abs(e.clientY - st.y0) > 10) st.moved = true; track(e, false); } }
    function onUp(e) {
        if (!st) return;
        var h = track(e, true);
        if (st.mode === "drag") {
            if (!st.moved) { st.mode = "sticky"; st.ov.classList.add("sticky"); return; }
            e.preventDefault();
            if (h && h.type === "item") execute(st.sector, h.index);
            else if (h && h.type === "sector" && !st.list[h.index].items) execute(h.index, -1);
            else if (h && h.type === "orb") assistant();
            else if (!h) close();
            else { st.mode = "sticky"; st.ov.classList.add("sticky"); }
            return;
        }
        if (!h) { close(); return; }
        if (h.type === "item") execute(st.sector, h.index);
        else if (h.type === "sector" && !st.list[h.index].items) execute(h.index, -1);
        else if (h.type === "orb") assistant();
    }
    function onKey(e) {
        if (!st) return;
        var key = e.key, n;
        if (key === "Escape") { e.preventDefault(); e.stopPropagation(); if (st.keyLevel === 1) { st.keyLevel = 0; st.item = -1; paint(); } else close(); return; }
        if (key === "Backspace") { e.preventDefault(); e.stopPropagation(); setSector(-1); return; }
        if (/^[1-9]$/.test(key)) {
            e.preventDefault(); e.stopPropagation(); st.mode = "sticky"; st.ov.classList.add("sticky"); n = Number(key) - 1;
            var sec = st.sector >= 0 ? st.list[st.sector] : null;
            if (sec && sec.items && st.keyLevel === 1) { if (n < sec.items.length) { st.item = n; paint(); execute(st.sector, n); } return; }
            if (n < st.list.length) { setSector(n); if (!st.list[n].items) execute(n, -1); else st.keyLevel = 1; }
            return;
        }
        var fwd = key === "ArrowRight" || key === "ArrowDown", back = key === "ArrowLeft" || key === "ArrowUp";
        if (fwd || back) {
            e.preventDefault(); e.stopPropagation(); st.mode = "sticky"; st.ov.classList.add("sticky");
            var cur = st.sector >= 0 ? st.list[st.sector] : null;
            if (cur && cur.items && st.keyLevel === 1) { n = cur.items.length; st.item = ((st.item < 0 ? (fwd ? -1 : 0) : st.item) + (fwd ? 1 : -1) + n) % n; paint(); }
            else { n = st.list.length; setSector(((st.sector < 0 ? (fwd ? -1 : 0) : st.sector) + (fwd ? 1 : -1) + n) % n); }
            return;
        }
        if (key === "Enter" || key === " ") {
            e.preventDefault(); e.stopPropagation();
            if (st.sector < 0) return;
            var s2 = st.list[st.sector];
            if (!s2.items) execute(st.sector, -1);
            else if (st.keyLevel !== 1) { st.keyLevel = 1; st.item = 0; paint(); }
            else if (st.item >= 0) execute(st.sector, st.item);
        }
    }
    function close() {
        if (!st) return;
        clearTimeout(st.intent); clearTimeout(st.leave);
        document.removeEventListener("pointermove", onMove, true); document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("keydown", onKey, true); window.removeEventListener("blur", close);
        if (st.ov && st.ov.parentNode) st.ov.parentNode.removeChild(st.ov);
        st = null;
    }

    window.NoirWheel = {
        init: function (options) {
            api = options;
            if (bound) return; bound = true;
            document.addEventListener("pointerdown", function (e) {
                if ((e.button !== 2 && e.button !== 1) || st) return;
                if (e.target.closest && e.target.closest("input,textarea,select,.noir-assistant")) return;
                e.preventDefault(); open(e.clientX, e.clientY, "drag");
            });
            document.addEventListener("contextmenu", function (e) { if (!(e.target.closest && e.target.closest("input,textarea,select"))) e.preventDefault(); });
            // Space outside text fields and buttons opens the menu at the panel centre, keyboard-driven.
            document.addEventListener("keydown", function (e) {
                if (st || (e.target.closest && e.target.closest("input,textarea,select,button,.noir-assistant"))) return;
                if (e.key === " " && !e.repeat) { e.preventDefault(); open(window.innerWidth / 2, window.innerHeight / 2, "sticky", true); }
            });
        },
        open: open, close: close, isOpen: function () { return !!st; },
        openAssistant: function () { if (window.NoirAssistant) NoirAssistant.open(); },
        _geometry: function () { return st && st.g; }
    };
})();
