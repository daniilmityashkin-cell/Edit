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
    var R1 = 76, TILE = 44, ORB = 76, GAP = 6, ROW = 36;
    function pos(r, deg) { var a = deg * Math.PI / 180; return [r * Math.sin(a), -r * Math.cos(a)]; }
    function overlaps(a, b, pad) { return Math.abs(a.x - b.x) * 2 < a.w + b.w + pad && Math.abs(a.y - b.y) * 2 < a.h + b.h + pad; }
    // Places pills (sizes known) on arcs around angle A, outside ring 1. Grows the radius (and the number of arcs) until no pill
    // overlaps another pill, a sector tile or the centre.
    function arcLayout(sizes, A, tiles) {
        var n = sizes.length, th = A * Math.PI / 180, out = [];
        // extent of a pill along the radius and along the arc at this angle
        function radial(z) { return z.w * Math.abs(Math.sin(th)) + z.h * Math.abs(Math.cos(th)); }
        function along(z) { return z.w * Math.abs(Math.cos(th)) + z.h * Math.abs(Math.sin(th)); }
        var depth = 0; sizes.forEach(function (z) { depth = Math.max(depth, radial(z)); });
        for (var rows = n > 5 ? 2 : 1; rows <= 4; rows++) {
            var perRow = Math.ceil(n / rows);
            for (var R = R1 + TILE / 2 + 10 + depth / 2; R < 700; R += 8) {
                var ok = true; out = [];
                for (var row = 0; row < rows && ok; row++) {
                    var idx = []; for (var k = row * perRow; k < Math.min(n, (row + 1) * perRow); k++) idx.push(k);
                    var r = R + row * (depth + GAP);
                    var spans = idx.map(function (k2) { return (along(sizes[k2]) + GAP) / r; });
                    var total = spans.reduce(function (sum, v) { return sum + v; }, 0) * 180 / Math.PI, deg = A - total / 2;
                    if (total > 140) { ok = false; break; }
                    idx.forEach(function (k2, j) { var d = spans[j] * 180 / Math.PI, p = pos(r, deg + d / 2); out[k2] = { x: p[0], y: p[1], w: sizes[k2].w, h: sizes[k2].h }; deg += d; });
                }
                if (!ok) continue;
                for (var i = 0; i < n && ok; i++) {
                    for (var j = i + 1; j < n && ok; j++) if (overlaps(out[i], out[j], GAP)) ok = false;
                    for (var t = 0; t < tiles.length && ok; t++) if (overlaps(out[i], tiles[t], GAP)) ok = false;
                }
                if (ok) return out;
                if (R > R1 + 260) break;      // a wider fan will not help: try more rows
            }
        }
        return out;
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
        // Measure every sector's pills once, lay them out, then fit the whole menu into the panel (scale + shift) for the largest one,
        // so the centre never jumps while the pointer travels.
        var probe = el("div", "rw-items probe", rw), ext = R1 + TILE / 2 + 4, minX = -ext, maxX = ext, minY = -ext, maxY = ext;
        list.forEach(function (sec, i) {
            if (!sec.items) return;
            var sizes = sec.items.map(function (it) { var e = el("span", "rw-item", probe, it.t); return { w: Math.ceil(e.offsetWidth), h: Math.ceil(e.offsetHeight) }; });
            sec.layout = arcLayout(sizes, i * 360 / n, st.tiles);
            sec.layout.forEach(function (q) { minX = Math.min(minX, q.x - q.w / 2); maxX = Math.max(maxX, q.x + q.w / 2); minY = Math.min(minY, q.y - q.h / 2); maxY = Math.max(maxY, q.y + q.h / 2); });
        });
        rw.removeChild(probe);
        var vw = window.innerWidth, vh = window.innerHeight, pad = 8;
        var k = Math.min(1, (vw - 2 * pad) / (maxX - minX), (vh - 2 * pad) / (maxY - minY)); st.k = k;
        var cx = Math.min(vw - pad - maxX * k, Math.max(pad - minX * k, x)), cy = Math.min(vh - pad - maxY * k, Math.max(pad - minY * k, y));
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
            var sec = st.list[i];
            sec.items.forEach(function (it, j) {
                var q = sec.layout[j], b = el("button", "rw-item" + (it.on ? " on" : "") + (it.danger ? " danger" : ""), box, it.t); b.type = "button"; b.setAttribute("role", "menuitem");
                b.style.left = (q.x - q.w / 2) + "px"; b.style.top = (q.y - q.h / 2) + "px"; b.style.setProperty("--j", j);
            });
        }
        paint();
    }
    function paint() {
        if (!st) return;
        st.tiles.forEach(function (t, i) { t.el.classList.toggle("active", i === st.sector); });
        Array.prototype.forEach.call(st.items.children, function (b, j) { b.classList.toggle("hover", j === st.item); });
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
        _layout: arcLayout
    };
})();
