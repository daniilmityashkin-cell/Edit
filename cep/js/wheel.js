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
                { t: "Пульт в AE", run: act("control.add", {}) }, { t: "Текст ▸", run: go("text") }, { t: "Правка ▸", run: go("edit") },
                { t: "Удалить", danger: true, run: function () { if (window.confirm("Удалить субтитры? Отмена — Ctrl+Z в AE.")) return run({ op: "delete", confirmed: true })(); } }] }
        ];
    }

    // ---------- geometry ----------
    var R1 = 86, TILE = 50, ORB = 86, GAP = 6, ROW = 36;
    function pos(r, deg) { var a = deg * Math.PI / 180; return [r * Math.sin(a), -r * Math.cos(a)]; }
    function overlaps(a, b, pad) { return Math.abs(a.x - b.x) * 2 < a.w + b.w + pad && Math.abs(a.y - b.y) * 2 < a.h + b.h + pad; }
    // Places pills (sizes known) on arcs around angle A, outside ring 1. Grows the radius (and the number of arcs) until no pill
    // overlaps another pill, a sector tile or the centre.
    // Ring 2 is one glass card next to the chosen sector: a tidy list (two columns for long lists), uniform rows, key hints.
    // The card sits on the outer side of its tile and is pushed outwards until it touches no other tile and not the centre.
    var ROW = 30, PAD = 6, COLGAP = 4;
    function cardLayout(sizes, A, tiles, own, bounds) {
        var n = sizes.length, colW = 0, i, ext = R1 + TILE / 2 + 6;
        for (i = 0; i < n; i++) colW = Math.max(colW, sizes[i].w);
        colW = Math.max(110, Math.min(colW, bounds.R - bounds.L - 2 * PAD));
        function dims(cols) { var rows = Math.ceil(n / cols); return { cols: cols, w: cols * colW + (cols - 1) * COLGAP + 2 * PAD, h: rows * ROW + (rows - 1) * 2 + 2 * PAD }; }
        function inside(c) { return c.x >= bounds.L - 0.5 && c.x + c.w <= bounds.R + 0.5 && c.y >= bounds.T - 0.5 && c.y + c.h <= bounds.B + 0.5; }
        function clash(c) {
            var m = { x: c.x + c.w / 2, y: c.y + c.h / 2, w: c.w, h: c.h };
            for (var t = 0; t < tiles.length; t++) if (tiles[t] !== own && overlaps(m, tiles[t], 8)) return true;
            return overlaps(m, { x: 0, y: 0, w: ORB, h: ORB }, 8);
        }
        var th = A * Math.PI / 180, dx = Math.sin(th), dy = -Math.cos(th), tries = [], d, card = null;
        [n > 6 ? 2 : 1, n > 6 ? 1 : 2].forEach(function (cols) {
            d = dims(cols); if (d.w > bounds.R - bounds.L) return;
            // 1) beside its tile, pushed outwards until it touches nothing
            var c = { cols: cols, w: d.w, h: d.h }, gap = 10;
            if (Math.abs(dx) > 0.42) { c.x = dx > 0 ? own.x + TILE / 2 + gap : own.x - TILE / 2 - gap - d.w; c.y = own.y - d.h / 2 + dy * d.h * 0.3; }
            else { c.y = dy > 0 ? own.y + TILE / 2 + gap : own.y - TILE / 2 - gap - d.h; c.x = own.x - d.w / 2; }
            for (var k = 0; k < 80 && clash(c); k++) { c.x += dx * 6; c.y += dy * 6; }
            tries.push(c);
            // 2) under or above the ring (narrow panels), centred under the tile's side
            var cxu = Math.max(bounds.L, Math.min(bounds.R - d.w, own.x - d.w / 2));
            tries.push({ cols: cols, w: d.w, h: d.h, x: cxu, y: ext + 10 }, { cols: cols, w: d.w, h: d.h, x: cxu, y: -ext - 10 - d.h });
        });
        for (i = 0; i < tries.length && !card; i++) if (inside(tries[i]) && !clash(tries[i])) card = tries[i];
        if (!card) {          // a tiny panel: the card lies over the ring like a sheet
            d = dims(2).w <= bounds.R - bounds.L ? dims(2) : dims(1);
            card = { cols: d.cols, w: d.w, h: d.h, x: Math.max(bounds.L, Math.min(bounds.R - d.w, -d.w / 2)), y: Math.max(bounds.T, Math.min(bounds.B - d.h, -d.h / 2)), over: true };
        }
        var items = [];
        for (i = 0; i < n; i++) {
            var r = Math.floor(i / card.cols), cc = i % card.cols;
            items.push({ x: card.x + PAD + cc * (colW + COLGAP) + colW / 2, y: card.y + PAD + r * (ROW + 2) + ROW / 2, w: colW, h: ROW });
        }
        card.origin = Math.round((own.x - card.x) / card.w * 100) + "% " + Math.round((own.y - card.y) / card.h * 100) + "%";
        items.card = card;
        return items;
    }

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
    function build(x, y, keyboard) {
        if (st.ov && st.ov.parentNode) st.ov.parentNode.removeChild(st.ov);
        st.cx0 = x; st.cy0 = y; st.sector = -1; st.item = -1;
        var L = window.NoirI18n && NoirI18n.ui ? NoirI18n.ui : function (x) { return x; };
        var list = sectors(st.kind).slice(0, 8), n = list.length; st.list = list;
        list.forEach(function (sec) { sec.label = L(sec.label); (sec.items || []).forEach(function (it) { it.t = L(it.t); }); });
        var ov = el("div", "noir-wheel" + (st.mode === "sticky" ? " sticky" : ""), document.body); ov.setAttribute("role", "menu"); ov.setAttribute("aria-label", "Радиальное меню NOIR"); st.ov = ov;
        var rw = el("div", "rw", ov); st.rw = rw;
        var ring = el("div", "rw-ring", rw); ring.style.cssText = "width:" + 2 * R1 + "px;height:" + 2 * R1 + "px;left:" + -R1 + "px;top:" + -R1 + "px";
        st.tiles = [];
        list.forEach(function (sec, i) {
            var p = pos(R1, i * 360 / n), b = el("button", "rw-tile" + (sec.items ? "" : " direct"), rw); b.type = "button"; b.setAttribute("role", "menuitem"); b.setAttribute("aria-label", (i + 1) + ". " + sec.label);
            b.style.left = (p[0] - TILE / 2) + "px"; b.style.top = (p[1] - TILE / 2) + "px"; b.style.setProperty("--i", i);
            b.appendChild(svgIcon(sec.icon || ICONS.more)); el("span", "rw-num", b, String(i + 1));
            st.tiles.push({ x: p[0], y: p[1], w: TILE + 8, h: TILE + 8, el: b });
        });
        var orb = el("button", "rw-orb", rw); orb.type = "button"; orb.setAttribute("aria-label", "Помощник");
        orb.style.cssText = "width:" + ORB + "px;height:" + ORB + "px;left:" + -ORB / 2 + "px;top:" + -ORB / 2 + "px";
        st.label = el("span", "rw-label", orb, ""); st.status = el("span", "rw-status", orb, ""); st.orb = orb;
        st.items = el("div", "rw-items", rw);
        // The ring alone decides the size (about 60% of the smaller side, never below 1× unless the panel is tinier than the ring);
        // each sector's card is then placed where it fits: beside its tile, under or above the ring, or over it in a tiny panel.
        var vw = window.innerWidth, vh = window.innerHeight, pad = 8, ext = R1 + TILE / 2 + 6;
        var k = Math.max(1, Math.min(2.2, Math.min(vw, vh) * 0.6 / (2 * ext)));
        k = Math.min(k, (vw - 2 * pad) / (2 * ext), (vh - 2 * pad) / (2 * ext)); st.k = k;
        var cx = vw >= 2 * (pad + ext * k) ? Math.min(vw - pad - ext * k, Math.max(pad + ext * k, x)) : vw / 2;
        var cy = vh >= 2 * (pad + ext * k) ? Math.min(vh - pad - ext * k, Math.max(pad + ext * k, y)) : vh / 2;
        var bounds = { L: (pad - cx) / k, R: (vw - pad - cx) / k, T: (pad - cy) / k, B: (vh - pad - cy) / k };
        var probe = el("div", "rw-items probe", rw);
        list.forEach(function (sec, i) {
            if (!sec.items) return;
            var sizes = sec.items.map(function (it) { var e = el("span", "rw-item", probe, it.t); return { w: Math.ceil(e.offsetWidth) + 42, h: ROW }; });
            sec.layout = cardLayout(sizes, i * 360 / n, st.tiles, st.tiles[i], bounds);
        });
        rw.removeChild(probe);
        rw.style.transform = "scale(" + k + ")";
        st.cx = cx; st.cy = cy; rw.style.left = cx + "px"; rw.style.top = cy + "px"; rw.style.transform = "scale(" + k + ")";
        if (!st.bound) {
            st.bound = true;
            document.addEventListener("pointermove", onMove, true); document.addEventListener("pointerup", onUp, true); document.addEventListener("keydown", onKey, true); window.addEventListener("blur", close);
        }
        ov.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        if (keyboard) { st.mode = "sticky"; ov.classList.add("sticky"); setSector(0); } else paint();
    }
    function setSector(i) {
        if (!st || i === st.sector) return;
        st.sector = i; st.item = -1; st.keyLevel = 0;
        var box = st.items; box.textContent = "";
        if (i >= 0 && st.list[i].items) {
            var sec = st.list[i], cd = sec.layout.card;
            var card = el("div", "rw-card" + (cd.over ? " over" : ""), box);
            card.style.cssText = "left:" + cd.x + "px;top:" + cd.y + "px;width:" + cd.w + "px;height:" + cd.h + "px;transform-origin:" + cd.origin;
            sec.items.forEach(function (it, j) {
                var q = sec.layout[j], b = el("button", "rw-item" + (it.on ? " on" : "") + (it.danger ? " danger" : ""), box); b.type = "button"; b.setAttribute("role", "menuitem");
                el("span", "rw-item-text", b, it.t); if (j < 9) el("span", "rw-key", b, String(j + 1));
                b.style.left = (q.x - q.w / 2) + "px"; b.style.top = (q.y - q.h / 2) + "px"; b.style.width = q.w + "px"; b.style.setProperty("--j", j);
            });
        }
        paint();
    }
    function paint() {
        if (!st) return;
        st.tiles.forEach(function (t, i) { t.el.classList.toggle("active", i === st.sector); });
        Array.prototype.forEach.call(st.items.querySelectorAll(".rw-item"), function (b, j) { b.classList.toggle("hover", j === st.item); });
        var sec = st.sector >= 0 ? st.list[st.sector] : null, it = sec && sec.items && st.item >= 0 ? sec.items[st.item] : null;
        st.label.textContent = it ? it.t : sec ? sec.label : st.hoverOrb ? (window.NoirI18n ? NoirI18n.ui("Помощник") : "Помощник") : "NOIR";
        var ps = api.status ? api.status() : ["", ""], sel = st.sel && st.sel.noir ? (window.NoirI18n ? NoirI18n.ui("Выделено слоёв: ") : "Выделено слоёв: ") + st.sel.noir : "";
        st.status.textContent = sel || ps[1] || ""; st.orb.setAttribute("data-state", ps[0] || "");
    }

    // ---------- input ----------
    function local(e) { return { x: (e.clientX - st.cx) / st.k, y: (e.clientY - st.cy) / st.k }; }
    function hit(e) {
        var p = local(e), sec = st.sector >= 0 ? st.list[st.sector] : null;
        if (sec && sec.items) for (var j = 0; j < sec.layout.length; j++) { var q = sec.layout[j]; if (Math.abs(p.x - q.x) <= q.w / 2 + 3 && Math.abs(p.y - q.y) <= q.h / 2 + 3) return { type: "item", index: j }; }
        var d = Math.sqrt(p.x * p.x + p.y * p.y);
        if (d < ORB / 2) return { type: "orb" };
        if (d < R1 + TILE / 2 + 12) { var deg = Math.atan2(p.x, -p.y) * 180 / Math.PI; if (deg < 0) deg += 360; return { type: "sector", index: Math.round(deg / (360 / st.list.length)) % st.list.length }; }
        return null;
    }
    function track(e) {
        var h = hit(e);
        st.hoverOrb = !!h && h.type === "orb";
        if (h && h.type === "sector") setSector(h.index);
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
    function onMove(e) { if (st) { if (Math.abs(e.clientX - st.x0) + Math.abs(e.clientY - st.y0) > 10) st.moved = true; track(e); } }
    function onUp(e) {
        if (!st) return;
        var h = track(e);
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
        _layout: cardLayout
    };
})();
