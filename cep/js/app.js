/* NOIR Captions · HTML panel. The panel owns its interface; After Effects work goes through NoirHost.call(op, args)
   (ae/noir/app.jsx). Pages: home (radial), video, text, style, edit, settings. */
(function () {
    "use strict";
    var U = NoirUI, H = NoirHost, el = U.el, t = function (k, v) { return NoirI18n.t(k, v); };
    var root = document.getElementById("app");
    var meta = null, presets = [], S = null, page = "home", view = {}, lastMode = "all", seenCompleted = -1, seenRevision = -1;
    var prefs = (function () { try { return JSON.parse(localStorage.getItem("noir.ui.v1")) || {}; } catch (e) { return {}; } })();
    function savePrefs() { try { localStorage.setItem("noir.ui.v1", JSON.stringify(prefs)); } catch (e) {} }
    function noop() {}
    function label(btn, text) { var s = btn.querySelector(".btn-label") || el("span", "btn-label", btn); if (s.textContent !== text) s.textContent = text; }
    var PAGES = ["home", "video", "text", "style", "edit", "settings"];

    // ---------- host helpers ----------
    function set(path, value) { return H.call("settings.set", { path: path, value: value }).catch(noop); }
    U.bind(set, function () { return S; });
    function act(op, args) { flushText(); return H.call(op, args).catch(function () { return null; }); }
    function say(r) { if (typeof r === "string" && r) U.toast(r); return r; }
    function run(cmd) { return act("run", { command: cmd }).then(say); }
    function generate(mode, accept) {
        lastMode = mode;
        return act("generate", { mode: mode, accept: !!accept }).then(function (r) {
            if (!r) return r;
            if (r.pending) { showIssues(true); return r; }
            if (r.issues && mode === "check") { showIssues(true); if (!r.issues.length) U.toast(S.status); return r; }
            if (r.created !== undefined) U.toast((mode === "phrase" ? "Фраза обновлена" : "Создано") + ": " + r.created + " " + plural(r.created, "слой", "слоя", "слоёв"), "ok");
            if (r.warnings && r.warnings.length) U.toast(r.warnings.join("\n"), "", 6000);
            return r;
        });
    }
    function plural(n, one, few, many) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many; }

    // ---------- shell ----------
    function build() {
        root.textContent = ""; view = { text: {}, style: {}, edit: {}, settings: {} }; seenText = null; textDirty = false;
        NoirI18n.set(S && S.settings.lang);
        document.body.classList.toggle("adv-on", !!prefs.advanced);
        var shell = el("div", "shell", root);
        var top = el("header", "topbar", shell);
        var brand = el("button", "brand", top); brand.type = "button"; brand.setAttribute("aria-label", t("nav.home")); brand.title = "NOIR Captions " + (meta ? meta.version : "");
        var logo = el("img", "", brand); logo.src = "media/noir-mark.svg"; logo.alt = "";
        brand.onclick = function () { go("home"); };
        view.title = el("h1", "title", top, "NOIR Captions");
        view.pill = el("span", "pill", top); view.pill.setAttribute("role", "status"); view.pill.setAttribute("aria-live", "polite");
        view.primary = U.button("", "primary", top, function () { primary(); });
        var nav = el("nav", "tabs", shell); nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", "NOIR");
        view.tabs = {};
        PAGES.forEach(function (id) {
            var b = U.button(t("nav." + id), "tab", nav, function () { go(id); }, id);
            b.setAttribute("role", "tab"); b.dataset.page = id; b.title = t("nav." + id); view.tabs[id] = b;
        });
        var statusRow = el("div", "status-line", shell);
        view.status = el("span", "status-text", statusRow);
        view.progress = el("div", "progress", statusRow); el("i", "", view.progress);
        view.issues = el("section", "issues", shell); view.issues.hidden = true;
        view.pages = {};
        var main = el("main", "pages", shell);
        PAGES.forEach(function (id) { var p = el("section", "page page-" + id, main); p.id = "page-" + id; p.hidden = true; view.pages[id] = p; });
        buildHome(view.pages.home); buildVideo(view.pages.video); buildText(view.pages.text); buildStyle(view.pages.style); buildEdit(view.pages.edit); buildSettings(view.pages.settings);
        if (window.NoirWheel) NoirWheel.init({ run: run, act: act, generate: generate, page: go, state: function () { return S; }, presets: function () { return presets; }, notify: U.toast });
        if (window.NoirAssistant) NoirAssistant.init({ call: H.call, idle: H.idle, state: function () { return S; }, page: go, generate: generate, notify: U.toast });
        go(page, true);
        if (S) render();
    }
    function go(id, quiet, anchor) {
        if (PAGES.indexOf(id) < 0) id = "home";
        if (id !== "text") flushText();
        page = id;
        PAGES.forEach(function (p) { view.pages[p].hidden = p !== id; var tab = view.tabs[p]; tab.classList.toggle("on", p === id); tab.setAttribute("aria-selected", String(p === id)); });
        view.title.textContent = id === "home" ? "NOIR Captions" : t("nav." + id);
        if (window.NoirHome) NoirHome.setOpen(false);
        if (anchor) { var target = document.getElementById(anchor); if (target) { target.scrollIntoView({ block: "start" }); target.classList.add("flash"); setTimeout(function () { target.classList.remove("flash"); }, 900); } }
        else if (!quiet) view.pages[id].scrollTop = 0;
        if (id === "edit" && view.edit.loadSfx) view.edit.loadSfx();
        if (S) render();
    }
    function primaryAction() {
        if (!S) return null;
        if (S.recognizing) return { label: t("act.cancel"), run: function () { act("cancel"); } };
        if (!S.hasData || page === "video") return { label: t("act.recognize"), run: function () { act("recognize"); } };
        if (S.canUpdate && S.phraseDirty) return { label: t("act.updatePhrase"), run: function () { generate("phrase"); } };
        if (S.canUpdate) return { label: t("act.updateAll"), run: function () { generate("all"); } };
        return { label: t("act.create"), run: function () { generate("all"); } };
    }
    function primary() { var a = primaryAction(); if (a) a.run(); }
    function pillState() {
        if (!H.online()) return ["error", t("state.offline")];
        if (!S) return ["idle", "…"];
        if (S.recognizing) return ["busy", t("state.busy") + (S.progress ? " · " + Math.round(S.progress * 100) + "%" : "")];
        if (S.scanning) return ["busy", t("state.scan")];
        if (S.pending) return ["warn", t("state.pending")];
        if (!S.hasData) return ["idle", t("state.idle")];
        if (S.dirty && S.canUpdate) return ["warn", t("state.dirty")];
        if (S.canUpdate) return ["ok", t("state.done")];
        return ["ok", t("state.ready")];
    }

    // ---------- home ----------
    function buildHome(p) {
        var host = el("div", "home-host", p);
        var groups = ["video", "text", "style", "place", "time", "anim", "layers", "more"].map(function (id) { return { id: id, label: t("home.groups." + id) }; });
        var target = { video: ["video"], text: ["text"], style: ["style"], place: ["edit", "edit-place"], time: ["edit", "edit-time"], anim: ["edit", "edit-anim"], layers: ["edit", "edit-layers"], more: ["settings"] };
        if (window.NoirHome) NoirHome.mount(host, { groups: groups, hint: t("home.hint"), open: function (id) { go(target[id][0], false, target[id][1]); }, assistant: function () { if (window.NoirAssistant) NoirAssistant.open(); } });
    }

    // ---------- video ----------
    function buildVideo(p) {
        var c = U.card(p, t("video.title"), t("video.lead"));
        var grid = el("div", "grid2", c);
        U.field(grid, { path: "language", label: t("video.language"), kind: "select", options: meta.languages });
        U.field(grid, { path: "model", label: t("video.model"), kind: "select", options: meta.models });
        U.field(c, { path: "device", label: t("video.device"), kind: "segmented", options: meta.devices.map(function (d) { return { id: d.id, label: d.id === "auto" ? "Авто" : d.id === "cuda" ? "GPU" : "CPU" }; }) });
        U.field(c, { path: "prompt", label: t("video.prompt"), kind: "text", hint: t("video.promptHint"), placeholder: "NOIR, After Effects, …" });
        var r = U.row(c, "actions");
        view.recognize = U.button(t("act.recognize"), "primary wide", r, function () { if (S && S.recognizing) act("cancel"); else act("recognize"); }, "spark");
        var other = U.card(p, t("video.other"));
        var r2 = U.row(other, "actions wrap");
        U.button(t("act.openJson"), "", r2, function () { act("json.load"); }, "file");
        U.button(t("act.importSubs"), "", r2, function () { act("subs.import"); }, "file");
    }

    // ---------- text ----------
    var textTimer = 0, textDirty = false, seenText = null, caretTimer = 0;
    function flushText() {
        clearTimeout(textTimer); textTimer = 0;
        var ed = view.text && view.text.editor;
        if (!textDirty || !ed || !S || !S.hasData) return;
        textDirty = false;      // only text the user typed is sent: a freshly built, empty editor never overwrites AE
        if (ed.value !== S.text) H.call("text.set", { text: ed.value }).catch(noop);
    }
    function buildText(p) {
        var v = view.text;
        v.empty = el("div", "empty", p); el("p", "", v.empty, t("text.empty"));
        U.button(t("nav.video"), "", v.empty, function () { go("video"); }, "video");
        v.body = el("div", "text-body", p);
        var c = U.card(v.body, null, t("text.lead"));
        var nav = U.row(c, "phrase-nav");
        U.iconButton("left", "←", nav, function () { if (S && S.phrase > 0) act("phrase.select", { index: S.phrase - 1 }); });
        v.phrase = el("select", "input grow", nav); v.phrase.setAttribute("aria-label", t("text.phrase"));
        v.phrase.onchange = function () { act("phrase.select", { index: Number(v.phrase.value) }); };
        U.iconButton("right", "→", nav, function () { if (S && S.phrase < S.phrases.length - 1) act("phrase.select", { index: S.phrase + 1 }); });
        U.iconButton("play", t("act.seek"), nav, function () { act("phrase.seek"); });
        v.editor = el("textarea", "editor", c); v.editor.spellcheck = false; v.editor.setAttribute("aria-label", t("text.editor"));
        v.editor.addEventListener("input", function () { textDirty = true; clearTimeout(textTimer); textTimer = setTimeout(flushText, 350); });
        v.editor.addEventListener("blur", flushText);
        ["keyup", "mouseup", "select"].forEach(function (ev) { v.editor.addEventListener(ev, caretMoved); });
        v.editor.addEventListener("keydown", function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); primary(); }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "A" || e.key === "a" || e.code === "KeyA")) { e.preventDefault(); wordEdit("accent"); }
        });
        var tools = U.row(c, "word-tools"); tools.setAttribute("role", "toolbar");
        U.button(t("act.accent"), "chip", tools, function () { wordEdit("accent"); }).onmousedown = prevent;
        U.button(t("act.line"), "chip", tools, function () { wordEdit("line"); }).onmousedown = prevent;
        U.button(t("act.split"), "chip", tools, function () { wordEdit("phrase"); }).onmousedown = prevent;
        el("span", "spacer", tools);
        U.iconButton("play", t("act.listen"), tools, function () { act("listen").then(say); });
        v.undo = U.iconButton("undo", t("act.undo"), tools, function () { act("text.undo"); });
        el("p", "field-label", c, t("text.words"));
        v.words = el("div", "words", c);
        var gen = U.row(v.body, "actions wrap sticky-actions");
        v.create = U.button(t("act.create"), "primary", gen, function () { generate(S && S.canUpdate ? "all" : "all"); });
        v.update = U.button(t("act.updatePhrase"), "", gen, function () { generate("phrase"); });
        U.button(t("act.preview"), "", gen, function () { generate("preview"); });
        U.button(t("act.check"), "ghost", gen, function () { generate("check"); });
        var files = U.card(v.body, t("text.files"));
        var fr = U.row(files, "actions wrap");
        U.button(t("act.saveJson"), "", fr, function () { act("json.save"); }, "file");
        U.button(t("act.exportSrt"), "", fr, function () { act("subs.export", { format: "srt" }); });
        U.button(t("act.exportVtt"), "", fr, function () { act("subs.export", { format: "vtt" }); });
        U.button(t("act.reset"), "ghost", fr, function () { act("text.reset"); });
    }
    function prevent(e) { e.preventDefault(); }
    function caretMoved() {
        clearTimeout(caretTimer);
        caretTimer = setTimeout(function () {
            var ed = view.text.editor; if (!S || !S.hasData) return;
            var line = ed.value.substring(0, ed.selectionStart).split("\n").length - 1;
            if (line !== S.phrase && line < S.phrases.length) act("phrase.select", { index: line });
        }, 160);
    }
    function wordEdit(kind) {
        var ed = view.text.editor; if (!S || !S.hasData) return;
        flushText();
        var start = ed.selectionStart, end = ed.selectionEnd;
        act("word.edit", { kind: kind, text: ed.value, start: start, end: end }).then(function (ok) { if (ok) { ed.focus(); ed.setSelectionRange(start, end); } });
    }
    function renderText() {
        var v = view.text, has = !!(S && S.hasData);
        v.empty.hidden = has; v.body.hidden = !has;
        if (!has) return;
        if ((S.text !== seenText || v.editor.value === "" && S.text) && !textDirty) {
            var ed = v.editor, a = ed.selectionStart, b = ed.selectionEnd;
            if (ed.value !== S.text) { ed.value = S.text; if (document.activeElement === ed) ed.setSelectionRange(Math.min(a, S.text.length), Math.min(b, S.text.length)); }
            seenText = S.text;
        }
        var sig = S.phrases.join("\n");
        if (v.phraseSig !== sig) { v.phraseSig = sig; v.phrase.textContent = ""; S.phrases.forEach(function (label, i) { var o = el("option", "", v.phrase, label); o.value = i; }); }
        v.phrase.value = String(S.phrase);
        if (v.lastPhrase !== S.phrase && document.activeElement !== v.editor) selectLine(S.phrase);
        v.lastPhrase = S.phrase;
        var wsig = JSON.stringify(S.words) + S.phrase;
        if (v.wordSig !== wsig) {
            v.wordSig = wsig; v.words.textContent = "";
            S.words.forEach(function (w, i) {
                var b = U.button(w.text, "word" + (w.accent ? " accent" : "") + (w.low ? " low" : ""), v.words, function () { editWord(b, i, w.text); });
                if (w.low) b.title = t("text.low");
            });
        }
        v.undo.disabled = !S.historyLength;
        v.update.hidden = !S.canUpdate;
        label(v.create, S.canUpdate ? t("act.updateAll") : t("act.create"));
    }
    function selectLine(i) {
        var ed = view.text.editor, lines = ed.value.split("\n"), start = 0;
        for (var k = 0; k < i && k < lines.length; k++) start += lines[k].length + 1;
        try { ed.setSelectionRange(start, start + (lines[i] || "").length); } catch (e) {}
        ed.scrollTop = Math.max(0, i * 22 - 22);
    }
    function editWord(chip, index, text) {
        var input = el("input", "input word-input"); input.value = text; input.setAttribute("aria-label", text);
        chip.replaceWith(input); input.focus(); input.select();
        var done = false;
        function finish(save) {
            if (done) return; done = true;
            var v = input.value.trim();
            if (save && v && v !== text) act("word.replace", { index: index, text: v }).then(say); else { view.text.wordSig = null; render(); }
        }
        input.onkeydown = function (e) { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };
        input.onblur = function () { finish(true); };
    }

    // ---------- issues ----------
    function showIssues(open) { view.issuesOpen = open; renderIssues(); }
    function renderIssues() {
        var box = view.issues, list = (S && S.issues) || [];
        box.hidden = !view.issuesOpen || !list.length;
        var sig = JSON.stringify(list) + (S && S.pending);
        if (box.hidden || box.dataset.sig === sig) return;
        box.dataset.sig = sig; box.textContent = "";
        var head = U.row(box, "issues-head"); el("b", "", head, t("issues.title")); el("span", "spacer", head);
        U.iconButton("close", "×", head, function () { showIssues(false); });
        list.forEach(function (it) {
            var r = U.row(box, "issue"); el("span", "", r, it.message);
            if (it.segment !== undefined) U.button(t("text.phrase") + " " + (it.segment + 1), "ghost small", r, function () { go("text"); act("phrase.select", { index: it.segment }); });
            else if (it.code === "font" || it.code === "font_unknown") U.button(t("set.font"), "ghost small", r, function () { go("settings", false, "set-font"); });
            else if (it.code === "safe_area") U.button(t("style.position"), "ghost small", r, function () { go("style", false, "style-quick"); });
        });
        el("p", "hint", box, t("issues.note"));
        if (S.pending) U.button(t("act.createAnyway"), "primary small", box, function () { generate(lastMode, true).then(function (r) { if (r && !r.pending) showIssues(false); }); });
    }

    // ---------- style ----------
    var FONT_WEIGHTS = [["Thin", 100], ["ExtraLight", 200], ["Light", 300], ["Regular", 400], ["Medium", 500], ["SemiBold", 600], ["DemiBold", 600], ["ExtraBold", 800], ["Bold", 700], ["Black", 900], ["Heavy", 900]];
    function cssFont(ps) {
        var name = String(ps || "Inter"), fam = name.split("-")[0].replace(/(MT|PSMT|PS)$/, "").replace(/([a-z])([A-Z])/g, "$1 $2"), style = name.split("-")[1] || "", w = 400;
        FONT_WEIGHTS.forEach(function (x) { if (style.indexOf(x[0]) >= 0 && w === 400) w = x[1]; });
        return { family: '"' + fam + '", "' + name + '", Inter, sans-serif', weight: w, italic: /Italic|Oblique/.test(style) };
    }
    function rgb(c) { return "rgb(" + (c || [1, 1, 1]).map(function (v) { return Math.round(v * 255); }).join(",") + ")"; }
    function sample(box, side, text) {
        var f = cssFont(side.fonts[0]), s = el("span", "", box, side.caps ? text.toUpperCase() : text);
        s.style.fontFamily = f.family; s.style.fontWeight = f.weight; s.style.fontStyle = f.italic ? "italic" : "normal"; s.style.color = rgb(side.color);
        if (side.strokeWidth) s.style.webkitTextStroke = Math.min(2, side.strokeWidth / 4) + "px " + rgb(side.strokeColor);
        return s;
    }
    function buildStyle(p) {
        var v = view.style;
        var head = U.card(p, null, t("style.lead"));
        var fr = U.row(head, "filters");
        v.filter = el("div", "segmented", fr); v.filter.setAttribute("role", "radiogroup");
        [["all", "style.all"], ["fav", "style.fav"], ["mine", "style.mine"]].forEach(function (x) {
            var b = el("button", "seg", v.filter, t(x[1])); b.type = "button"; b.dataset.value = x[0]; b.setAttribute("role", "radio");
            b.onclick = function () { prefs.styleFilter = x[0]; savePrefs(); v.gridSig = null; renderStyle(); };
        });
        el("span", "spacer", fr); v.current = el("span", "muted small", fr);
        v.grid = el("div", "style-grid", p);
        var q = U.card(p, null); q.id = "style-quick";
        U.field(q, { path: "quick.size", label: t("style.size"), kind: "range", min: 25, max: 200, step: 5, unit: "%" });
        U.field(q, { path: "quick.position", label: t("style.position"), kind: "segmented", options: [{ id: "preset", label: t("pos.preset") }, { id: "25", label: t("pos.top") }, { id: "50", label: t("pos.center") }, { id: "75", label: t("pos.bottom") }] });
        U.field(q, { path: "quick.intensity", label: t("style.intensity"), kind: "segmented", options: [{ id: "0.5", label: t("int.soft") }, { id: "1", label: t("int.normal") }, { id: "1.5", label: t("int.strong") }] });
        U.field(q, { path: "style.layout.reveal", label: t("style.reveal"), kind: "segmented", options: meta.reveals.map(function (r) { return { id: r.id, label: r.id === "word" ? "По словам" : r.id === "group" ? "Фразой" : "Караоке" }; }) });
        U.field(q, { path: "style.layout.layerMode", label: t("style.layers"), kind: "segmented", options: meta.layerModes });
        var fmt = U.card(p, t("style.format"));
        U.field(fmt, { path: "format", label: t("style.format"), kind: "select", options: meta.formats });
        var gr = U.row(fmt, "actions wrap");
        U.button(t("style.guides"), "", gr, function () { act("safe.guides", {}).then(function (r) { if (r) U.toast(S.status); }); });
        U.button(t("style.guidesOff"), "ghost", gr, function () { act("safe.guides", { remove: true }); });
        var mine = U.card(p, t("style.save"));
        var sr = U.row(mine, "actions");
        var name = el("input", "input grow", sr); name.placeholder = t("style.name"); name.setAttribute("aria-label", t("style.name"));
        U.button(t("style.save"), "", sr, function () { act("preset.save", { name: name.value }).then(function (id) { if (id) { name.value = ""; reloadPresets(); } }); });
        var er = U.row(mine, "actions wrap");
        U.button(t("style.export"), "ghost", er, function () { act("preset.export", { id: S.settings.presetId || "" }); });
        U.button(t("style.import"), "ghost", er, function () { act("preset.import").then(function (id) { if (id) reloadPresets(); }); });
    }
    function reloadPresets() { return H.call("presets").then(function (list) { presets = list; view.style.gridSig = null; render(); }).catch(noop); }
    function renderStyle() {
        var v = view.style, filter = prefs.styleFilter || "all", fav = S.settings.favoriteStyles || [];
        Array.prototype.forEach.call(v.filter.children, function (b) { var on = b.dataset.value === filter; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
        var chosen = S.settings.presetId, cur = null;
        presets.forEach(function (p) { if (p.id === chosen) cur = p; });
        v.current.textContent = cur ? cur.name : t("style.custom");
        var list = presets.filter(function (p) { return filter === "all" || (filter === "fav" ? fav.indexOf(p.id) >= 0 : p.user); });
        var sig = JSON.stringify([list.map(function (p) { return p.id; }), fav, chosen, filter]);
        if (v.gridSig === sig) return;
        v.gridSig = sig; v.grid.textContent = "";
        list.forEach(function (p) {
            var card = el("div", "style-card" + (p.id === chosen ? " on" : ""), v.grid);
            var pick = el("button", "style-pick", card); pick.type = "button"; pick.setAttribute("aria-pressed", String(p.id === chosen)); pick.setAttribute("aria-label", p.name);
            var pv = el("span", "style-preview", pick); sample(pv, p.base, "Ваш "); sample(pv, p.accent, "текст");
            el("span", "style-name", pick, p.name);
            pick.onclick = function () { act("preset.choose", { id: p.id }).then(function (r) { if (r) U.toast("Стиль: " + p.name); }); };
            var star = U.iconButton("star", t("style.favorite"), card, function () { act("preset.favorite", { id: p.id }); }, "star" + (fav.indexOf(p.id) >= 0 ? " on" : ""));
            star.setAttribute("aria-pressed", String(fav.indexOf(p.id) >= 0));
        });
        if (!list.length) el("p", "muted", v.grid, filter === "fav" ? "Отметьте стили звёздочкой." : "Здесь появятся ваши стили.");
    }

    // ---------- edit ----------
    function section(p, id, title) { var c = U.card(p, title); c.id = id; return c; }
    function buildEdit(p) {
        var v = view.edit;
        var head = U.card(p, null, t("edit.lead"));
        U.field(head, { path: "scope", label: t("edit.scope"), kind: "segmented", options: meta.scopes.map(function (s) { return { id: s.id, label: s.id === "source" ? "Это видео" : s.id === "selected" ? "Выделенные" : "Все NOIR" }; }) });
        var place = section(p, "edit-place", t("edit.place"));
        var pr = U.row(place, "actions wrap");
        U.button(t("pos.top"), "", pr, function () { run({ op: "place", y: 25 }); });
        U.button(t("pos.center"), "", pr, function () { run({ op: "place", y: 50 }); });
        U.button(t("pos.bottom"), "", pr, function () { run({ op: "place", y: 75 }); });
        U.button(t("edit.reset"), "ghost", pr, function () { run({ op: "resetPos" }); });
        el("p", "field-label", place, t("edit.move"));
        var mv = U.row(place, "pad-row");
        var pad = el("div", "pad", mv);
        U.iconButton("up", "↑", pad, function () { run({ op: "nudge", kx: 0, ky: -1 }); }, "pad-up");
        U.iconButton("left", "←", pad, function () { run({ op: "nudge", kx: -1, ky: 0 }); }, "pad-left");
        U.iconButton("right", "→", pad, function () { run({ op: "nudge", kx: 1, ky: 0 }); }, "pad-right");
        U.iconButton("down", "↓", pad, function () { run({ op: "nudge", kx: 0, ky: 1 }); }, "pad-down");
        var sz = el("div", "stack", mv);
        U.button("A−", "", sz, function () { run({ op: "size", sign: -1 }); });
        U.button("A+", "", sz, function () { run({ op: "size", sign: 1 }); });
        var steps = el("div", "grid2", place);
        U.field(steps, { path: "nudgeStep", label: t("edit.step"), kind: "number", min: 1, max: 2000, step: 1 });
        U.field(steps, { path: "sizeStep", label: t("edit.sizeStep"), kind: "number", min: 1, max: 100, step: 1 });
        var time = section(p, "edit-time", t("edit.time"));
        var tg = el("div", "grid3", time);
        [["edit.earlier", { shift: -1 }], ["edit.inMinus", { dIn: -1 }], ["edit.outMinus", { dOut: -1 }], ["edit.later", { shift: 1 }], ["edit.inPlus", { dIn: 1 }], ["edit.outPlus", { dOut: 1 }]].forEach(function (x) {
            U.button(t(x[0]), "", tg, function () { var c = { op: "time" }; for (var k in x[1]) c[k] = x[1][k]; run(c); });
        });
        U.field(time, { path: "timeStep", label: t("edit.timeStep"), kind: "number", min: 0.01, max: 30, step: 0.01 });
        var anim = section(p, "edit-anim", t("edit.anim"));
        var ag = el("div", "grid2", anim);
        U.field(ag, { path: "style.anim.animIn", label: t("edit.in"), kind: "select", options: meta.animIn, commit: function (id) { run({ op: "animIn", id: id }); } });
        U.field(ag, { path: "style.anim.animOut", label: t("edit.out"), kind: "select", options: meta.animOut, commit: function (id) { run({ op: "animOut", id: id }); } });
        var dg = el("div", "grid2 adv", anim);
        U.field(dg, { path: "style.anim.inDur", label: "Длительность появления, с", kind: "number", min: 0, max: 5, step: 0.02 });
        U.field(dg, { path: "style.anim.outDur", label: "Длительность исчезания, с", kind: "number", min: 0, max: 5, step: 0.02 });
        var layers = section(p, "edit-layers", t("edit.layers"));
        var lr = U.row(layers, "actions wrap");
        U.button(t("edit.applyStyle"), "", lr, function () { run({ op: "applyStyle" }); });
        U.button(t("edit.makeAccent"), "", lr, function () { run({ op: "makeAccent" }); });
        U.button(t("edit.makeBase"), "", lr, function () { run({ op: "makeBase" }); });
        U.button(t("edit.invert"), "", lr, function () { act("layers.invert"); });
        U.button(t("edit.reflow"), "", lr, function () { act("layers.reflow"); });
        U.button(t("edit.behind"), "", lr, function () { run({ op: "behind" }); });
        el("p", "field-label", layers, t("edit.face"));
        var fr = U.row(layers, "actions wrap");
        U.button(t("edit.faceFind"), "", fr, function () { run({ op: "faceScan" }); });
        U.button(t("edit.faceAvoid"), "", fr, function () { run({ op: "avoidFace" }); });
        v.face = el("span", "muted small", fr);
        var del = U.row(layers, "actions");
        U.button(t("edit.delete"), "danger", del, function () { if (window.confirm(t("edit.deleteAsk"))) run({ op: "delete", confirmed: true }); }, "trash");
        // tools: advanced mode
        var tools = section(p, "edit-tools", t("edit.tools")); tools.classList.add("adv");
        el("p", "field-label", tools, t("edit.counter"));
        var cg = el("div", "grid3", tools);
        U.field(cg, { path: "tools.counter.from", label: "От", kind: "number", min: -1e9, max: 1e9 });
        U.field(cg, { path: "tools.counter.to", label: "До", kind: "number", min: -1e9, max: 1e9 });
        U.field(cg, { path: "tools.counter.duration", label: "Секунд", kind: "number", min: 0.1, max: 600, step: 0.1 });
        U.field(cg, { path: "tools.counter.decimals", label: "Знаков", kind: "number", min: 0, max: 6, step: 1 });
        U.field(cg, { path: "tools.counter.prefix", label: "Перед", kind: "text" });
        U.field(cg, { path: "tools.counter.suffix", label: "После", kind: "text" });
        U.button(t("edit.counter"), "", U.row(tools, "actions"), function () { act("tool.counter").then(say); });
        var sr = U.row(tools, "actions wrap");
        U.button(t("edit.strike"), "", sr, function () { act("tool.strike"); });
        U.button(t("edit.strikeRemove"), "ghost", sr, function () { act("tool.strikeRemove"); });
        var mr = U.row(tools, "actions wrap");
        U.button(t("edit.mask"), "", mr, function () { act("tool.mask"); });
        U.button(t("edit.maskRemove"), "ghost", mr, function () { act("tool.maskRemove"); });
        // sounds: advanced mode
        var sfx = section(p, "edit-sfx", t("edit.sfx")); sfx.classList.add("adv");
        v.sfxNames = [];
        U.field(sfx, { path: "sfx.file", label: t("edit.sfxFile"), kind: "select", options: function () { return [{ id: "", label: "—" }].concat(v.sfxNames); } });
        U.field(sfx, { path: "sfx.db", label: "Громкость, дБ", kind: "range", min: -60, max: 12, step: 1, unit: " дБ" });
        var xr = U.row(sfx, "actions wrap");
        U.button(t("edit.sfxSelected"), "", xr, function () { act("sfx.selected"); });
        U.button(t("edit.sfxHere"), "", xr, function () { act("sfx.here"); });
        U.button(t("edit.sfxRemove"), "ghost", xr, function () { act("sfx.remove"); });
        U.button(t("edit.sfxFolder"), "ghost", xr, function () { act("sfx.folder"); });
        v.loadSfx = function () {
            if (v.sfxLoaded || !prefs.advanced) return; v.sfxLoaded = true;
            H.call("sfx.list", {}, true).then(function (r) { v.sfxNames = (r.names || []).map(function (n) { return { id: r.files && r.files[n] ? r.files[n] : n, label: n }; }); if (S) U.refresh(S); }).catch(noop);
        };
    }
    function renderEdit() {
        var f = S.face;
        view.edit.face.textContent = f ? "Лицо: " + Math.round((f.x + f.w / 2) * 100) + "% × " + Math.round((f.y + f.h / 2) * 100) + "%" : "";
    }

    // ---------- settings ----------
    function buildSettings(p) {
        var v = view.settings, side = prefs.side === "accent" ? "accent" : "base";
        var font = U.card(p, t("set.font")); font.id = "set-font";
        var sideSel = el("div", "segmented", font); sideSel.setAttribute("role", "radiogroup");
        [["base", "set.base"], ["accent", "set.accentSide"]].forEach(function (x) {
            var b = el("button", "seg" + (x[0] === side ? " on" : ""), sideSel, t(x[1])); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(x[0] === side));
            b.onclick = function () { prefs.side = x[0]; savePrefs(); build(); go("settings", true, "set-font"); };
        });
        var curRow = U.row(font, "current-font"); el("span", "muted small", curRow, t("set.current")); v.curFont = el("b", "", curRow);
        var search = el("input", "input", font); search.type = "search"; search.placeholder = t("set.search"); search.setAttribute("aria-label", t("set.search"));
        v.results = el("div", "font-results", font);
        var timer = 0;
        search.oninput = function () { clearTimeout(timer); timer = setTimeout(function () { findFonts(search.value, side); }, 250); };
        v.recent = el("div", "chips", font);
        var fr = U.row(font, "actions wrap");
        U.button(t("set.fromLayer"), "ghost", fr, function () { act("font.fromLayer", { side: side }); });
        U.field(font, { path: "style." + side + ".glow", label: t("set.glow"), kind: "toggle", value: function (st) { return !!st.settings.style[side].glow; }, commit: function (on) { act("font.glow", { side: side, on: on }); } });
        var ps = U.row(font, "actions adv"); var psIn = el("input", "input grow", ps); psIn.placeholder = t("set.ps"); psIn.setAttribute("aria-label", t("set.ps"));
        U.button("OK", "", ps, function () { if (psIn.value.trim()) act("font.set", { side: side, ps: psIn.value.trim() }).then(function () { psIn.value = ""; }); });
        var ar = U.row(font, "actions wrap");
        U.button(t("set.applyLayers"), "", ar, function () { act("layers.apply", { side: side, parts: { font: true, size: true, color: true, stroke: true, fx: true } }).then(say); });
        U.button(t("set.applyAll"), "ghost", ar, function () { act("layers.apply", { side: side, all: true, parts: { font: true, size: true, color: true, stroke: true, fx: true } }).then(say); });

        var look = U.card(p, t("set.look") + " · " + t(side === "base" ? "set.base" : "set.accentSide"));
        var lg = el("div", "grid2", look), pre = "style." + side + ".";
        U.field(lg, { path: pre + "size", label: "Размер, px (1080)", kind: "number", min: 4, max: 2000, step: 1 });
        U.field(lg, { path: pre + "color", label: "Цвет", kind: "color" });
        U.field(lg, { path: pre + "tracking", label: "Трекинг", kind: "number", min: -1000, max: 3000, step: 5, adv: true });
        U.field(lg, { path: pre + "opacity", label: "Непрозрачность, %", kind: "number", min: 0, max: 100, step: 1, adv: true, value: function (st) { var o = st.settings.style[side].opacity; return o === undefined ? 100 : o; } });
        U.field(lg, { path: pre + "strokeWidth", label: "Обводка, px", kind: "number", min: 0, max: 200, step: 1 });
        U.field(lg, { path: pre + "strokeColor", label: "Цвет обводки", kind: "color" });
        U.field(look, { path: pre + "caps", label: "Заглавными", kind: "toggle" });
        U.field(look, { path: pre + "shadow", label: "Тень", kind: "toggle", value: function (st) { return !!st.settings.style[side].shadow; } });
        U.field(look, { path: pre + "blend", label: "Наложение", kind: "select", options: meta.blends, adv: true, value: function (st) { return st.settings.style[side].blend || "normal"; } });

        var lay = U.card(p, t("set.layout")); lay.id = "set-layout";
        var L = "style.layout.", g1 = el("div", "grid2", lay);
        U.field(g1, { path: L + "maxWords", label: "Слов во фразе, макс.", kind: "number", min: 1, max: 30, step: 1 });
        U.field(g1, { path: L + "maxChars", label: "Символов во фразе", kind: "number", min: 1, max: 300, step: 1 });
        U.field(g1, { path: L + "lineChars", label: "Символов в строке", kind: "number", min: 0, max: 300, step: 1 });
        U.field(g1, { path: L + "posY", label: "Высота, % кадра", kind: "number", min: -50, max: 150, step: 1 });
        U.field(g1, { path: L + "posX", label: "По ширине, %", kind: "number", min: -50, max: 150, step: 1, adv: true });
        U.field(g1, { path: L + "accentPosY", label: "Акценты на высоте, %", kind: "text", adv: true, map: { out: function (v) { return v === "" ? null : Number(v); } } });
        U.field(g1, { path: L + "lineGap", label: "Межстрочный", kind: "number", min: -1, max: 5, step: 0.01, adv: true });
        U.field(g1, { path: L + "wordSpace", label: "Между словами", kind: "number", min: 0, max: 3, step: 0.01, adv: true });
        U.field(g1, { path: L + "pauseBreak", label: "Пауза = новая фраза, с", kind: "number", min: 0.05, max: 10, step: 0.05, adv: true });
        U.field(g1, { path: L + "holdGap", label: "Держать до следующей, с", kind: "number", min: 0, max: 5, step: 0.05, adv: true });
        U.field(g1, { path: L + "safeWidth", label: "Ширина строки, доля", kind: "number", min: 0.3, max: 1, step: 0.01, adv: true });
        U.field(lay, { path: L + "punctBreak", label: "Новая фраза после точки", kind: "toggle" });
        U.field(lay, { path: L + "stripPunct", label: "Убирать знаки препинания", kind: "toggle" });
        U.field(lay, { path: L + "autoAccent", label: "Акценты автоматически", kind: "toggle", adv: true });
        U.field(lay, { path: L + "accentOwnLine", label: "Акцент на отдельной строке", kind: "toggle", adv: true });

        var mo = U.card(p, t("set.motion")); mo.classList.add("adv");
        var A = "style.anim.", g2 = el("div", "grid2", mo);
        U.field(g2, { path: A + "inDur", label: "Появление, с", kind: "number", min: 0, max: 5, step: 0.02 });
        U.field(g2, { path: A + "outDur", label: "Исчезание, с", kind: "number", min: 0, max: 5, step: 0.02 });
        U.field(g2, { path: A + "distance", label: "Расстояние, px", kind: "number", min: 0, max: 5000, step: 1 });
        U.field(g2, { path: A + "blur", label: "Размытие", kind: "number", min: 0, max: 500, step: 1 });
        U.field(g2, { path: A + "easeInfluence", label: "Плавность, %", kind: "number", min: 0.1, max: 100, step: 1 });
        U.field(g2, { path: A + "highlightColor", label: "Цвет караоке", kind: "color", show: function (st) { return st.settings.style.layout.reveal === "karaoke"; }, value: function (st) { return st.settings.style.anim.highlightColor || st.settings.style.accent.color; } });

        var proj = U.card(p, t("set.project"));
        U.field(proj, { path: "lang", label: t("set.uiLang"), kind: "segmented", options: [{ id: "ru", label: "Русский" }, { id: "en", label: "English" }], commit: function (l) { set("lang", l); } });
        U.field(proj, { path: "advanced", label: t("set.advanced"), kind: "toggle", hint: t("set.advancedHint"), value: function () { return !!prefs.advanced; }, commit: function (on) { prefs.advanced = !!on; savePrefs(); document.body.classList.toggle("adv-on", !!on); if (on && view.edit.loadSfx) view.edit.loadSfx(); } });
        U.field(proj, { path: "replace", label: "Новое создание заменяет субтитры того же видео", kind: "toggle" });
        U.field(proj, { path: "reflow", label: "Перекладывать фразы после смены стиля", kind: "toggle", adv: true });
        U.field(proj, { path: "python", label: "Python (пусто — из папки проекта)", kind: "text", adv: true });
        var pr = U.row(proj, "actions wrap");
        U.button(t("set.previews"), "ghost", pr, function () { if (window.confirm(t("confirm.previews"))) act("previews.remove").then(function () { U.toast(S.status); }); });
        U.button(t("set.log"), "ghost", pr, function () { H.call("log").then(showLog).catch(noop); });
        v.log = el("pre", "log", proj); v.log.hidden = true;
        var about = U.card(p, t("set.about"));
        el("p", "muted small", about, "NOIR Captions " + meta.version + " · распознавание речи на этом компьютере (faster-whisper) · помощник — локальная модель Ollama.");
    }
    function showLog(list) {
        var box = view.settings.log; box.hidden = false;
        box.textContent = list && list.length ? list.map(function (e) { return new Date(e.t).toLocaleTimeString() + "  " + e.level + "  " + e.text; }).join("\n") : t("set.logEmpty");
        box.textContent += "\n\n" + t("set.logFile");
    }
    function findFonts(query, side) {
        var box = view.settings.results;
        if (!query.trim()) { box.textContent = ""; return; }
        H.call("fonts", { query: query, limit: 40 }, true).then(function (r) {
            box.textContent = "";
            if (!r.available) { el("p", "hint", box, t("set.noFonts")); return; }
            r.families.forEach(function (f) {
                var item = el("div", "font-item", box); el("span", "font-family", item, f.name);
                var chips = el("div", "chips", item);
                f.styles.forEach(function (s) { U.button(s.style, "chip small", chips, function () { act("font.set", { side: side, ps: s.ps }).then(function (r2) { if (r2) U.toast(f.name + " " + s.style); }); }); });
            });
            if (!r.families.length) el("p", "hint", box, "—");
        }).catch(noop);
    }
    function renderSettings() {
        var v = view.settings, side = prefs.side === "accent" ? "accent" : "base", fonts = S.settings.style[side].fonts;
        v.curFont.textContent = fonts[0];
        var sig = JSON.stringify(S.settings.recentFonts) + side;
        if (v.recentSig !== sig) {
            v.recentSig = sig; v.recent.textContent = "";
            if (S.settings.recentFonts.length) el("span", "muted small", v.recent, t("set.recent"));
            S.settings.recentFonts.forEach(function (ps) { U.button(ps, "chip small", v.recent, function () { act("font.set", { side: side, ps: ps }); }); });
        }
    }

    // ---------- render ----------
    function render() {
        if (!S || !view.pill) return;
        var ps = pillState(); view.pill.textContent = ps[1]; view.pill.dataset.state = ps[0];
        var a = primaryAction(); label(view.primary, a.label); view.primary.classList.toggle("busy", !!S.recognizing);
        view.status.textContent = S.status || "";
        view.progress.hidden = !S.recognizing; view.progress.firstChild.style.width = Math.round((S.progress || 0) * 100) + "%";
        if (view.recognize) label(view.recognize, S.recognizing ? t("act.cancel") : t("act.recognize"));
        view.tabs.text.classList.toggle("dot", !!(S.dirty && S.canUpdate));
        renderText(); renderStyle(); renderEdit(); renderSettings(); renderIssues();
        U.refresh(S);
        if (seenCompleted >= 0 && S.completed > seenCompleted) { /* a successful creation already toasted */ }
        seenCompleted = S.completed;
    }
    H.on("state", function (st) {
        var langChanged = S && st.settings.lang !== S.settings.lang;
        var newData = st.hasData && st.dataRevision !== seenRevision && seenRevision >= 0;
        S = st; seenRevision = st.dataRevision;
        if (!view.pill) return;
        if (langChanged) { build(); return; }
        if (newData && page !== "text") go("text");
        render();
    });
    H.on("error", function (msg) { U.toast(msg, "error"); if (view.pill) render(); });

    // ---------- keyboard ----------
    document.addEventListener("keydown", function (e) {
        var typing = e.target && e.target.closest && e.target.closest("input,textarea,select");
        if (e.key === "Escape" && !typing && page !== "home" && !document.querySelector(".noir-wheel,.noir-assistant")) { go("home"); }
    });

    // ---------- start ----------
    if (!H.available) { var m = el("div", "boot", root); el("p", "", m, t("err.noCep")); return; }
    var boot = el("div", "boot", root); el("div", "spinner", boot);
    H.open().then(function (r) {
        meta = r.meta; presets = r.presets; S = H.state(); seenRevision = S ? S.dataRevision : 0;
        root.removeAttribute("aria-busy");
        build();
    }).catch(function (e) { boot.textContent = ""; el("p", "", boot, String(e && e.message || e)); U.button("Повторить", "", boot, function () { location.reload(); }); });
    window.NoirApp = { go: go, state: function () { return S; }, page: function () { return page; }, presets: function () { return presets; } };
})();
