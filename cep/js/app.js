/* NOIR Captions · HTML panel. The panel owns its interface; After Effects work goes through NoirHost.call(op, args)
   (ae/noir/app.jsx). Four pages: Текст (recognition → text → word timing → create), Стиль, Правка, Настройки.
   The orb button (or right mouse button / Space) opens the radial menu; its centre opens the assistant. */
(function () {
    "use strict";
    var U = NoirUI, H = NoirHost, el = U.el, t = function (k, v) { return NoirI18n.t(k, v); };
    var root = document.getElementById("app");
    var meta = null, presets = [], S = null, page = "text", view = {}, lastMode = "all", seenRevision = -1, lastStatus = null, ready = null;
    var prefs = (function () { try { return JSON.parse(localStorage.getItem("noir.ui.v1")) || {}; } catch (e) { return {}; } })();
    function savePrefs() { try { localStorage.setItem("noir.ui.v1", JSON.stringify(prefs)); } catch (e) {} }
    // Panel view: compact (no explanations, tighter), normal, detailed (every parameter, tools and sounds). Old "advanced" = detailed.
    if (!prefs.mode) prefs.mode = prefs.advanced ? "detailed" : "normal";
    function detailed() { return prefs.mode === "detailed"; }
    function applyMode() {
        document.body.classList.toggle("adv-on", detailed());
        document.body.classList.toggle("mode-compact", prefs.mode === "compact");
    }
    function noop() {}
    function label(btn, text) { var s = btn.querySelector(".btn-label") || el("span", "btn-label", btn); if (s.textContent !== text) s.textContent = text; }
    function openUrl(url) { try { if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) { window.cep.util.openURLInDefaultBrowser(url); return; } } catch (e) {} window.open(url, "_blank"); }
    var PAGES = ["text", "style", "edit", "settings"], NAV_ICON = { text: "captions", style: "palette", edit: "edit", settings: "settings" };

    // ---------- host helpers ----------
    function set(path, value) { return H.call("settings.set", { path: path, value: value }).catch(noop); }
    U.bind(set, function () { return S; });
    function act(op, args) { flushText(); return H.call(op, args).catch(function () { return null; }); }
    function run(cmd) { return act("run", { command: cmd }); }
    function generate(mode, accept) {
        lastMode = mode;
        return act("generate", { mode: mode, accept: !!accept }).then(function (r) {
            if (!r) return r;
            if (r.pending) { showIssues(true); return r; }
            if (r.issues && mode === "check") { showIssues(true); return r; }
            if (r.created !== undefined) U.toast(L(mode === "phrase" ? "Фраза обновлена" : "Готово") + ": " + r.created + " " + L(plural(r.created, "слой", "слоя", "слоёв")) + (r.warnings && r.warnings.length ? "\n" + r.warnings.join("\n") : ""), "ok", r.warnings && r.warnings.length ? 7000 : 3200);
            return r;
        });
    }
    function L(s) { return NoirI18n.ui(s); }
    function plural(n, one, few, many) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many; }

    // ---------- shell ----------
    function build() {
        root.textContent = ""; view = { text: {}, style: {}, edit: {}, settings: {}, readiness: [] }; seenText = null; textDirty = false;
        NoirI18n.set(S && S.settings.lang);
        applyMode();
        var shell = el("div", "shell", root);
        var top = el("header", "topbar", shell);
        var orb = el("button", "orb-btn", top); orb.type = "button"; orb.setAttribute("aria-label", t("menu.open")); orb.title = t("menu.open");
        if (window.NoirBrand) orb.appendChild(NoirBrand.logo()); else { el("span", "orb-core", orb); U.icon("sparkles", orb); }
        orb.onclick = function () { if (window.NoirWheel) NoirWheel.open(window.innerWidth / 2, window.innerHeight / 2, "sticky"); };
        view.title = el("h1", "title", top, "NOIR Captions");
        view.pill = el("span", "pill", top); view.pill.setAttribute("role", "status"); view.pill.setAttribute("aria-live", "polite");
        view.primary = U.button("", "primary", top, function () { primary(); });
        view.progress = el("div", "topline", shell); el("i", "", view.progress);
        var nav = el("nav", "tabs", shell); nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", "NOIR");
        view.tabs = {};
        PAGES.forEach(function (id) {
            var b = U.button(t("nav." + id), "tab", nav, function () { go(id); }, NAV_ICON[id]);
            b.setAttribute("role", "tab"); b.dataset.page = id; b.title = t("nav." + id); view.tabs[id] = b;
        });
        view.issues = el("section", "issues", shell); view.issues.hidden = true;
        view.pages = {};
        var main = el("main", "pages", shell);
        PAGES.forEach(function (id) { var p = el("section", "page page-" + id, main); p.id = "page-" + id; p.hidden = true; view.pages[id] = p; });
        buildText(view.pages.text); buildStyle(view.pages.style); buildEdit(view.pages.edit); buildSettings(view.pages.settings);
        if (window.NoirWheel) NoirWheel.init({ run: run, act: act, call: H.call, generate: generate, page: go, state: function () { return S; }, presets: function () { return presets; }, meta: function () { return meta; }, status: pillState, notify: U.toast });
        if (window.NoirAssistant) NoirAssistant.init({ call: H.call, idle: H.idle, state: function () { return S; }, page: go, generate: generate, notify: U.toast });
        go(page, true);
        if (S) render();
        renderReadiness();
    }
    function go(id, quiet, anchor) {
        if (PAGES.indexOf(id) < 0) id = "text";      // old names (home, video) land on the first step
        if (id !== "text") flushText();
        page = id;
        PAGES.forEach(function (p) { view.pages[p].hidden = p !== id; var tab = view.tabs[p]; tab.classList.toggle("on", p === id); tab.setAttribute("aria-selected", String(p === id)); });
        view.title.textContent = t("nav." + id);
        if (anchor) { var target = document.getElementById(anchor); if (target) { target.scrollIntoView({ block: "start" }); target.classList.add("flash"); setTimeout(function () { target.classList.remove("flash"); }, 900); } }
        else if (!quiet) view.pages[id].scrollTop = 0;
        if (id === "edit" && view.edit.loadSfx) view.edit.loadSfx();
        if (S) render();
    }
    function primaryAction() {
        if (!S) return null;
        if (S.recognizing) return { label: t("act.cancel"), run: function () { act("cancel"); } };
        if (!S.hasData) return { label: t("act.recognize"), run: function () { go("text"); recognize(); } };
        if (S.canUpdate && S.phraseDirty) return { label: t("act.updatePhrase"), run: function () { generate("phrase"); } };
        if (S.canUpdate) return { label: t("act.updateAll"), run: function () { generate("all"); } };
        return { label: t("act.create"), run: function () { generate("all"); } };
    }
    function primary() { var a = primaryAction(); if (a) a.run(); }
    // Batch: comps selected in the Project panel → recognition and captions in each, one after another.
    function batch() {
        if (ready && !ready.ready) { U.toast(t("ready.notYet"), "error"); checkReadiness(); return; }
        H.call("batch.list").then(function (list) {
            if (!list.length) { U.toast(t("batch.none"), "error", 6000); return; }
            var ok = list.filter(function (c) { return c.layer; });
            var msg = t("batch.ask", { n: list.length }) + "\n\n" + list.map(function (c) { return (c.layer ? "• " : "✕ ") + c.name + (c.layer ? " — " + c.layer : " — " + t("batch.noAudio")); }).join("\n");
            if (!ok.length) { U.toast(t("batch.noneAudio"), "error", 6000); return; }
            if (window.confirm(msg)) act("batch.start");
        }).catch(function (e) { U.toast(NoirI18n.host(e && e.message || String(e)), "error"); });
    }
    function recognize() {
        if (ready && !ready.ready) { U.toast(t("ready.notYet"), "error"); checkReadiness(); return; }
        act("recognize");
    }
    function pillState() {
        if (!H.online()) return ["error", t("state.offline")];
        if (!S) return ["idle", "…"];
        if (S.recognizing) return ["busy", t("state.busy") + (S.progress ? " · " + Math.round(S.progress * 100) + "%" : "")];
        if (S.scanning) return ["busy", t("state.scan")];
        if (S.pending) return ["warn", t("state.pending")];
        if (!S.hasData) return ready && !ready.ready ? ["warn", t("ready.short")] : ["idle", t("state.idle")];
        if (S.dirty && S.canUpdate) return ["warn", t("state.dirty")];
        if (S.canUpdate) return ["ok", t("state.done")];
        return ["ok", t("state.ready")];
    }

    // ---------- readiness: engine, model, file access, fonts ----------
    var watchUntil = 0, watchTimer = 0;
    function checkReadiness() {
        return H.call("setup.check", {}, true).then(function (r) {
            var was = ready && ready.ready; ready = r; renderReadiness(); if (S) render();
            if (r.ready && !was && watchUntil) U.toast(t("ready.ok"), "ok");
            if (r.ready) watchUntil = 0;
            return r;
        }).catch(noop);
    }
    function watchSetup() {
        watchUntil = Date.now() + 20 * 60 * 1000; clearTimeout(watchTimer);
        (function tick() { watchTimer = setTimeout(function () { if (!watchUntil || Date.now() > watchUntil) return; checkReadiness().then(function () { if (watchUntil) tick(); }); }, 5000); })();
    }
    function readinessBox(parent) { var box = el("div", "ready", parent); view.readiness.push(box); return box; }
    function renderReadiness() {
        view.readiness.forEach(function (box) {
            box.textContent = "";
            if (!ready) { el("p", "hint", box, "…"); return; }
            var problems = ready.items.filter(function (i) { return !i.ok; });
            if (!problems.length) { var ok = el("div", "ready-row ok", box); U.icon("ok", ok); el("span", "ready-title", ok, t("ready.ok")); return; }
            ready.items.forEach(function (it) {
                if (it.ok) return;
                var row = el("div", "ready-row" + (it.optional ? " optional" : " bad"), box);
                U.icon(it.optional ? "info" : "warn", row);
                var txt = el("div", "ready-text", row); el("span", "ready-title", txt, NoirI18n.host(it.title)); if (it.hint) el("span", "ready-hint", txt, NoirI18n.host(it.hint));
                if (it.fix && ready.windows) U.button(NoirI18n.host(it.fixLabel), "small" + (it.optional ? " ghost" : ""), row, function () { act(it.fix).then(function (f) { if (f) { U.toast(t("ready.running"), "", 6000); watchSetup(); } }); });
                if (it.id === "engine" && it.python === false) U.button(t("ready.python"), "small ghost", row, function () { openUrl("https://www.python.org/downloads/"); });
            });
            var again = U.row(box, "ready-actions"); U.button(t("ready.recheck"), "small ghost", again, function () { checkReadiness(); }, "refresh");
        });
    }
    window.addEventListener("focus", function () { if (ready && !ready.ready) checkReadiness(); });

    // ---------- text: recognition when empty, then editor + word timing ----------
    var textTimer = 0, textDirty = false, seenText = null, caretTimer = 0;
    function flushText() {
        clearTimeout(textTimer); textTimer = 0;
        var ed = view.text && view.text.editor;
        if (!textDirty || !ed || !S || !S.hasData) return;
        textDirty = false;      // only text the user typed is sent: a freshly built, empty editor never overwrites AE
        if (ed.value !== S.text) H.call("text.set", { text: ed.value }).catch(noop);
    }
    function recognitionFields(c) {
        var grid = el("div", "grid2", c);
        U.field(grid, { path: "language", label: t("video.language"), kind: "select", options: meta.languages });
        U.field(grid, { path: "model", label: t("video.model"), kind: "select", options: meta.models, commit: function (v) { set("model", v).then(checkReadiness); } });
        U.field(c, { path: "device", label: t("video.device"), kind: "segmented", options: meta.devices.map(function (d) { return { id: d.id, label: d.id === "auto" ? L("Авто") : d.id === "cuda" ? "GPU" : "CPU" }; }) });
        U.field(c, { path: "speakers", label: t("spk.recognize"), kind: "toggle", hint: t("spk.hint") });
        U.field(c, { path: "prompt", label: t("video.prompt"), kind: "text", hint: t("video.promptHint"), placeholder: "NOIR, After Effects, …" });
    }
    function buildText(p) {
        var v = view.text;
        // empty: recognition
        v.empty = el("div", "text-empty", p);
        var rc = U.card(v.empty, t("video.title"), t("video.lead"));
        readinessBox(rc);
        recognitionFields(rc);
        v.recognize = U.button(t("act.recognize"), "primary wide", U.row(rc, "actions"), function () { if (S && S.recognizing) act("cancel"); else recognize(); }, "mic");
        var other = U.row(rc, "actions wrap");
        el("span", "muted small", other, t("video.other"));
        U.button(t("act.openJson"), "ghost small", other, function () { act("json.load"); }, "file");
        U.button(t("act.importSubs"), "ghost small", other, function () { act("subs.import"); }, "fileIn");
        U.button(t("batch.btn"), "ghost small", other, batch, "layers");
        // with text
        v.body = el("div", "text-body", p);
        var src = U.card(v.body, null, null, "source-card");
        var sr = U.row(src, "source-row"); U.icon("mic", sr);
        v.source = el("span", "source-name", sr); el("span", "spacer", sr);
        v.reRec = U.button(t("act.recNew"), "small", sr, function () { if (S && S.recognizing) act("cancel"); else recognize(); }, "mic");
        el("p", "hint", src, t("text.recNewHint"));
        var c = U.card(v.body, null, t("text.lead"));
        var nav = U.row(c, "phrase-nav");
        U.iconButton("prev", "←", nav, function () { if (S && S.phrase > 0) act("phrase.select", { index: S.phrase - 1 }); });
        v.phrase = el("select", "input grow", nav); v.phrase.setAttribute("aria-label", t("text.phrase"));
        v.phrase.onchange = function () { act("phrase.select", { index: Number(v.phrase.value) }); };
        U.iconButton("next", "→", nav, function () { if (S && S.phrase < S.phrases.length - 1) act("phrase.select", { index: S.phrase + 1 }); });
        U.iconButton("listen", t("act.listen"), nav, function () { act("listen"); });
        v.speaker = U.button("", "ghost small speaker-btn", nav, function () { act("phrase.speaker", {}); }, "user"); v.speaker.title = t("spk.toggle");
        v.editor = el("textarea", "editor", c); v.editor.spellcheck = false; v.editor.setAttribute("aria-label", t("text.editor"));
        v.editor.addEventListener("input", function () { textDirty = true; clearTimeout(textTimer); textTimer = setTimeout(flushText, 350); });
        v.editor.addEventListener("blur", flushText);
        ["keyup", "mouseup", "select"].forEach(function (ev) { v.editor.addEventListener(ev, caretMoved); });
        v.editor.addEventListener("keydown", function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); primary(); }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "A" || e.key === "a" || e.code === "KeyA")) { e.preventDefault(); wordEdit("accent"); }
        });
        var tools = U.row(c, "word-tools"); tools.setAttribute("role", "toolbar");
        U.button(t("act.accent"), "chip", tools, function () { wordEdit("accent"); }, "accent").onmousedown = prevent;
        U.button(t("act.line"), "chip", tools, function () { wordEdit("line"); }, "wrap").onmousedown = prevent;
        U.button(t("act.split"), "chip", tools, function () { wordEdit("phrase"); }, "split").onmousedown = prevent;
        el("span", "spacer", tools);
        v.undo = U.iconButton("undo", t("act.undo"), tools, function () { act("text.undo"); });
        // word timing of the selected phrase
        var tl = el("div", "timeline", c);
        var th = U.row(tl, "tl-head"); el("span", "field-label", th, t("tl.title")); el("span", "spacer", th); v.tlRange = el("span", "muted small", th);
        U.iconButton("minus", t("tl.zoomOut"), th, function () { zoomTimeline(1 / 1.5); }, "small");
        U.iconButton("plus", t("tl.zoomIn"), th, function () { zoomTimeline(1.5); }, "small");
        v.tlScroll = el("div", "tl-scroll", tl);
        v.ruler = el("div", "tl-ruler", v.tlScroll);
        v.track = el("div", "tl-track", v.tlScroll); v.track.setAttribute("role", "group"); v.track.setAttribute("aria-label", t("tl.title"));
        el("p", "hint", tl, t("tl.hint"));
        var gen = U.row(v.body, "actions wrap sticky-actions");
        v.create = U.button(t("act.create"), "primary", gen, function () { generate("all"); });
        v.update = U.button(t("act.updatePhrase"), "", gen, function () { generate("phrase"); });
        U.button(t("act.preview"), "", gen, function () { generate("preview"); }, "eye");
        U.button(t("act.check"), "ghost", gen, function () { generate("check"); });
        var files = U.card(v.body, t("text.files"));
        var fr = U.row(files, "actions wrap");
        U.button(t("act.saveJson"), "", fr, function () { act("json.save"); }, "save");
        U.button(t("act.exportSrt"), "", fr, function () { act("subs.export", { format: "srt" }); }, "download");
        U.button(t("act.exportVtt"), "", fr, function () { act("subs.export", { format: "vtt" }); }, "download");
        var fr2 = U.row(files, "actions wrap");
        U.button(t("act.rerecognize"), "ghost", fr2, function () { recognize(); }, "mic");
        U.button(t("act.openJson"), "ghost", fr2, function () { act("json.load"); }, "file");
        U.button(t("act.importSubs"), "ghost", fr2, function () { act("subs.import"); }, "fileIn");
        U.button(t("batch.btn"), "ghost", fr2, batch, "layers");
        U.button(t("act.reset"), "ghost", fr2, function () { if (window.confirm(t("confirm.reset"))) act("text.reset"); }, "undo");
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
        label(v.recognize, S.recognizing ? t("act.cancel") + (S.progress ? " · " + Math.round(S.progress * 100) + "%" : "") : t("act.recognize"));
        v.recognize.classList.toggle("busy", !!S.recognizing);
        if (!has) return;
        v.speaker.hidden = !S.speakers; if (S.speakers) { label(v.speaker, t("spk.voice", { n: (S.speaker || 0) + 1 })); v.speaker.classList.toggle("two", S.speaker === 1); }
        if ((S.text !== seenText || v.editor.value === "" && S.text) && !textDirty) {
            var ed = v.editor, a = ed.selectionStart, b = ed.selectionEnd;
            if (ed.value !== S.text) { ed.value = S.text; if (document.activeElement === ed) ed.setSelectionRange(Math.min(a, S.text.length), Math.min(b, S.text.length)); }
            seenText = S.text;
        }
        var sig = S.phrases.join("\n");
        if (v.phraseSig !== sig) { v.phraseSig = sig; v.phrase.textContent = ""; S.phrases.forEach(function (lbl, i) { var o = el("option", "", v.phrase, lbl); o.value = i; }); }
        v.phrase.value = String(S.phrase);
        if (v.lastPhrase !== S.phrase && document.activeElement !== v.editor) selectLine(S.phrase);
        v.lastPhrase = S.phrase;
        renderTimeline();
        v.source.textContent = t("text.source", { name: S.source || "—" });
        label(v.reRec, S.recognizing ? t("act.cancel") + (S.progress ? " · " + Math.round(S.progress * 100) + "%" : "") : t("act.recNew"));
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

    // Word timeline: blocks on a time axis. Drag the edges to trim, the body to move; click — playhead to the word in AE;
    // double click — fix the word's text. Keys on a focused word: ←/→ move, Alt+←/→ start, Shift+←/→ end (20 ms).
    var MIN_WORD = 0.04;
    // Pixels per second: the phrase fits the width, but never so tight that a word cannot show its text;
    // then the user's zoom. A wider track scrolls sideways.
    var measureCtx = null;
    function textWidth(s) {
        if (!measureCtx) { var cv = document.createElement("canvas"); measureCtx = cv.getContext("2d"); }
        measureCtx.font = "500 12px " + getComputedStyle(document.body).fontFamily; return measureCtx.measureText(s).width;
    }
    function zoomTimeline(f) { prefs.tlZoom = Math.max(0.5, Math.min(8, (prefs.tlZoom || 1) * f)); savePrefs(); view.text.tlSig = null; renderTimeline(); }
    window.addEventListener("resize", function () { if (view.text && view.text.tlScroll) { view.text.tlSig = null; if (S) renderTimeline(); } });
    function renderTimeline() {
        var v = view.text, words = S.words || [], width = v.tlScroll.clientWidth || 300, sig = JSON.stringify(words) + "|" + S.phrase + "|" + width + "|" + (prefs.tlZoom || 1);
        if (v.tlSig === sig || v.dragging) return;
        v.tlSig = sig; v.track.textContent = ""; v.ruler.textContent = "";
        if (!words.length) { v.tlRange.textContent = ""; return; }
        var t0 = words[0].start - 0.2, t1 = words[words.length - 1].end + 0.2;
        if (t1 - t0 < 0.8) { var mid = (t0 + t1) / 2; t0 = mid - 0.4; t1 = mid + 0.4; }
        // two lanes (like an editing timeline): a word's label may run past its block up to the next word in the same lane
        var pps = (width - 2) / (t1 - t0);
        words.forEach(function (w, i) {
            var room = (i + 2 < words.length ? words[i + 2].start : t1) - w.start;
            var need = (Math.min(textWidth(w.text.replace(/[*~|]/g, "")), 140) + 18) / Math.max(0.04, room); if (need > pps) pps = need;
        });
        pps = Math.min(pps, 900) * (prefs.tlZoom || 1);
        var full = Math.max(width - 2, Math.ceil((t1 - t0) * pps));
        v.track.style.width = full + "px"; v.ruler.style.width = full + "px";
        v.tl = { t0: t0, t1: t1, pps: pps, words: words.map(function (w) { return { start: w.start, end: w.end }; }) };
        var step = pps > 400 ? 0.1 : pps > 160 ? 0.25 : pps > 70 ? 0.5 : 1;
        for (var tt = Math.ceil(t0 / step) * step; tt <= t1; tt += step) {
            var major = Math.abs(tt / (step * 2) - Math.round(tt / (step * 2))) < 1e-6 || step >= 1, tick = el("span", "tl-tick" + (major ? " major" : ""), v.ruler);
            tick.style.left = Math.round((tt - t0) * pps) + "px"; if (major) tick.textContent = (Math.round(tt * 100) / 100).toFixed(step < 0.25 ? 1 : step < 1 ? 1 : 0);
        }
        v.tlRange.textContent = words[0].start.toFixed(2) + " – " + words[words.length - 1].end.toFixed(2) + " с";
        words.forEach(function (w, i) {
            var b = el("button", "tl-word" + (w.accent ? " accent" : "") + (w.low ? " low" : ""), v.track); b.type = "button";
            b.dataset.index = i; b.title = w.text + " · " + w.start.toFixed(2) + "–" + w.end.toFixed(2) + " с" + (w.low ? " · " + t("text.low") : "");
            b.setAttribute("aria-label", w.text + ", " + w.start.toFixed(2) + "–" + w.end.toFixed(2));
            b.classList.add(i % 2 ? "lane1" : "lane0");
            var label = el("span", "tl-text", b, w.text.replace(/[*~|]/g, ""));
            label.style.maxWidth = Math.max(10, Math.round(((i + 2 < words.length ? words[i + 2].start : t1) - w.start) * pps) - 14) + "px";
            el("span", "tl-h l", b); el("span", "tl-h r", b);
            placeWord(b, i);
            b.addEventListener("pointerdown", function (e) { startDrag(e, b, i); });
            b.addEventListener("dblclick", function () { editWordText(b, i, w.text.replace(/[*~|]/g, "")); });
            b.addEventListener("keydown", function (e) { nudgeWord(e, i); });
            b.addEventListener("contextmenu", function (e) { e.preventDefault(); e.stopPropagation(); b.focus(); });
        });
    }
    function placeWord(b, i) {
        var tl = view.text.tl, w = tl.words[i];
        b.style.left = Math.round((w.start - tl.t0) * tl.pps) + "px"; b.style.width = Math.max(4, Math.round((w.end - w.start) * tl.pps) - 2) + "px";
    }
    function clampWord(i, s, e) {
        var ws = view.text.tl.words, lo = i > 0 ? ws[i - 1].start + MIN_WORD : 0, hi = i + 1 < ws.length ? ws[i + 1].end - MIN_WORD : e + 30;
        s = Math.max(lo, Math.min(s, hi - MIN_WORD)); e = Math.max(s + MIN_WORD, Math.min(e, hi));
        return [s, e];
    }
    function startDrag(e, b, i) {
        if (e.button !== 0) return;
        var v = view.text, tl = v.tl, w = tl.words[i], perPx = 1 / tl.pps;
        var mode = e.target.classList.contains("l") ? "start" : e.target.classList.contains("r") ? "end" : "move", x0 = e.clientX, s0 = w.start, e0 = w.end, moved = false;
        b.setPointerCapture && b.setPointerCapture(e.pointerId);
        v.dragging = true; b.classList.add("drag");
        function move(ev) {
            var dt = (ev.clientX - x0) * perPx; if (Math.abs(ev.clientX - x0) > 3) moved = true;
            if (!moved) return;
            var r = mode === "start" ? clampWord(i, s0 + dt, e0) : mode === "end" ? clampWord(i, s0, e0 + dt) : clampWord(i, s0 + dt, e0 + dt);
            if (mode === "move") { var len = e0 - s0; if (r[1] - r[0] < len - 1e-6) r = r[0] > s0 ? [r[1] - len, r[1]] : [r[0], r[0] + len]; }
            w.start = r[0]; w.end = r[1]; placeWord(b, i);
            b.title = (w.start).toFixed(2) + "–" + (w.end).toFixed(2) + " с";
        }
        function up() {
            b.removeEventListener("pointermove", move); b.removeEventListener("pointerup", up); b.removeEventListener("pointercancel", up);
            b.classList.remove("drag"); v.dragging = false;
            if (!moved) { act("word.seek", { index: i }); return; }
            v.tlSig = null;
            act("word.time", { index: i, start: Math.round(w.start * 1000) / 1000, end: Math.round(w.end * 1000) / 1000 }).then(function () { if (S) render(); });
        }
        b.addEventListener("pointermove", move); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
    }
    function nudgeWord(e, i) {
        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault(); e.stopPropagation(); view.text.tlSig = null;
            act("word.delete", { index: i }).then(function (left) {
                if (left === null) return;
                var next = view.text.track.querySelector('[data-index="' + Math.min(i, Math.max(0, (left || 1) - 1)) + '"]'); if (next) next.focus();
            });
            return;
        }
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        var w = view.text.tl.words[i], d = (e.key === "ArrowLeft" ? -1 : 1) * 0.02;
        var args = e.altKey ? { start: w.start + d } : e.shiftKey ? { end: w.end + d } : { start: w.start + d, end: w.end + d };
        args.index = i; view.text.tlSig = null;
        act("word.time", args).then(function () { var b = view.text.track.querySelector('[data-index="' + i + '"]'); if (b) b.focus(); });
    }
    function editWordText(b, index, text) {
        var input = el("input", "input tl-input"); input.value = text; input.setAttribute("aria-label", text);
        input.style.left = b.style.left; input.style.minWidth = "80px";
        view.text.track.appendChild(input); input.focus(); input.select();
        var done = false;
        function finish(save) {
            if (done) return; done = true;
            var val = input.value.trim(); input.remove();
            if (save && val && val !== text) act("word.replace", { index: index, text: val }); else { view.text.tlSig = null; render(); }
        }
        input.onkeydown = function (e) { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };
        input.onblur = function () { finish(true); };
    }

    // ---------- issues ----------
    function showIssues(open) { view.issuesOpen = open; renderIssues(); }
    function renderIssues() {
        var box = view.issues, list = (S && S.issues) || [];
        box.hidden = !view.issuesOpen || !list.length;
        if (view.issuesOpen && !list.length && lastMode === "check" && S && !S.pending) { view.issuesOpen = false; }
        var sig = JSON.stringify(list) + (S && S.pending);
        if (box.hidden || box.dataset.sig === sig) return;
        box.dataset.sig = sig; box.textContent = "";
        // header: title and the actions, always visible; below it a scrolling list where one remark for many phrases is one line
        var fixable = list.some(function (it) { return it.code === "safe_area" || it.code === "font"; }), wasPending = !!S.pending;
        var head = U.row(box, "issues-head"); U.icon("warn", head); el("b", "", head, t("issues.title")); el("span", "spacer", head);
        if (fixable) U.button(t("act.autoFix"), "primary small", head, function () {
            act("issues.fix").then(function (r) {
                if (!r) return;
                if (!r.left.length) { showIssues(false); if (wasPending) generate(lastMode); }
            });
        }, "wand");
        if (S.pending) U.button(t("act.createAnyway"), "small" + (fixable ? " ghost" : " primary"), head, function () { generate(lastMode, true).then(function (r) { if (r && !r.pending) showIssues(false); }); });
        U.iconButton("close", "×", head, function () { showIssues(false); });
        var groups = [], byKey = {};
        list.forEach(function (it) {
            var msg = NoirI18n.host(String(it.message).replace(/^(Фраза|Phrase) \d+: /, "")), key = it.code + "|" + msg;
            if (!byKey[key]) { byKey[key] = { code: it.code, msg: msg, segs: [], target: it.target }; groups.push(byKey[key]); }
            if (it.segment !== undefined) byKey[key].segs.push(it.segment);
        });
        var body = el("div", "issue-list", box);
        groups.forEach(function (g) {
            var r = el("div", "issue", body), txt = el("div", "issue-text", r);
            el("span", "", txt, (g.segs.length ? (g.segs.length > 1 ? t("issues.phrases") : t("text.phrase")) + " " : "") + "");
            txt.firstChild.textContent = g.segs.length ? (g.segs.length > 1 ? t("issues.phrases", { n: g.segs.length }) : t("text.phrase") + " " + (g.segs[0] + 1)) + ": " : "";
            el("span", "", txt, g.msg);
            var chips = el("div", "chips", r);
            g.segs.slice(0, 8).forEach(function (sg) { U.button(String(sg + 1), "chip small", chips, function () { go("text"); act("phrase.select", { index: sg }); }).title = t("text.phrase") + " " + (sg + 1); });
            if (g.segs.length > 8) el("span", "muted small", chips, "+" + (g.segs.length - 8));
            if (!g.segs.length && (g.code === "font" || g.code === "font_unknown")) U.button(t("set.font"), "ghost small", chips, function () { go("settings", false, "set-font"); });
        });
        el("p", "hint", body, t("issues.note"));
    }

    // ---------- style: gallery with live previews ----------
    var FONT_WEIGHTS = [["Thin", 100], ["ExtraLight", 200], ["Light", 300], ["Regular", 400], ["Medium", 500], ["SemiBold", 600], ["DemiBold", 600], ["ExtraBold", 800], ["Bold", 700], ["Black", 900], ["Heavy", 900]];
    function cssFont(ps) {
        var name = String(ps || "Inter"), fam = name.split("-")[0].replace(/(MT|PSMT|PS)$/, "").replace(/([a-z])([A-Z])/g, "$1 $2"), style = name.split("-")[1] || "", w = 400;
        FONT_WEIGHTS.forEach(function (x) { if (style.indexOf(x[0]) >= 0 && w === 400) w = x[1]; });
        return { family: '"' + fam + '", "' + name + '", Inter, sans-serif', weight: w, italic: /Italic|Oblique/.test(style) };
    }
    function rgb(c) { return "rgb(" + (c || [1, 1, 1]).map(function (v) { return Math.round(v * 255); }).join(",") + ")"; }
    function sample(box, side, text, accent) {
        var f = cssFont(side.fonts[0]), s = el("span", "pv-word" + (accent ? " acc" : ""), box, side.caps ? text.toUpperCase() : text);
        s.style.fontFamily = f.family; s.style.fontWeight = f.weight; s.style.fontStyle = f.italic ? "italic" : "normal"; s.style.color = rgb(side.color);
        s.dataset.color = rgb(side.color);
        if (side.strokeWidth) s.style.webkitTextStroke = Math.min(2, side.strokeWidth / 4) + "px " + rgb(side.strokeColor);
        return s;
    }
    // Animation previews: the "off-frame" state of each in/out animation, played with the Web Animations API.
    var IN = { fade: { opacity: 0 }, blur: { opacity: 0, filter: "blur(6px)" }, blurRise: { opacity: 0, filter: "blur(5px)", transform: "translateY(10px)" },
        rise: { opacity: 0, transform: "translateY(12px)" }, drop: { opacity: 0, transform: "translateY(-12px)" }, left: { opacity: 0, transform: "translateX(-16px)" }, right: { opacity: 0, transform: "translateX(16px)" },
        pop: { opacity: 0, transform: "scale(.7)", over: "scale(1.08)" }, punch: { transform: "scale(1.25)" }, zoom: { opacity: 0, transform: "scale(1.5)" }, slam: { opacity: 0, transform: "scale(2.2)", filter: "blur(4px)" },
        whipL: { opacity: 0, transform: "translateX(-40px)", filter: "blur(3px)" }, whipR: { opacity: 0, transform: "translateX(40px)", filter: "blur(3px)" },
        rotate: { opacity: 0, transform: "rotate(-14deg) scale(.85)" }, grow: { opacity: 0, transform: "scale(.3)", over: "scale(1.08)" }, blurPop: { opacity: 0, transform: "scale(.75)", filter: "blur(5px)", over: "scale(1.04)" }, zoomBlur: { opacity: 0, transform: "scale(1.5)", filter: "blur(6px)" },
        letFade: { letters: true, opacity: 0 }, letRise: { letters: true, opacity: 0, transform: "translateY(8px)" }, letPop: { letters: true, opacity: 0, transform: "scale(.4)" }, letBlur: { letters: true, opacity: 0, filter: "blur(4px)" }, type: { letters: true, opacity: 0, hard: true } };
    var OUT = { fade: { opacity: 0 }, blur: { opacity: 0, filter: "blur(6px)" }, blurUp: { opacity: 0, filter: "blur(5px)", transform: "translateY(-10px)" }, shrink: { opacity: 0, transform: "scale(.7)" },
        up: { opacity: 0, transform: "translateY(-12px)" }, down: { opacity: 0, transform: "translateY(12px)" }, left: { opacity: 0, transform: "translateX(-16px)" }, right: { opacity: 0, transform: "translateX(16px)" },
        zoom: { opacity: 0, transform: "scale(1.5)" }, whipL: { opacity: 0, transform: "translateX(-40px)", filter: "blur(3px)" }, whipR: { opacity: 0, transform: "translateX(40px)", filter: "blur(3px)" },
        rotate: { opacity: 0, transform: "rotate(14deg) scale(.85)" }, slamOut: { opacity: 0, transform: "scale(.4)", filter: "blur(4px)" },
        letFade: { letters: true, opacity: 0 }, letRise: { letters: true, opacity: 0, transform: "translateY(-8px)" }, letType: { letters: true, opacity: 0, hard: true } };
    var REST = { opacity: 1, transform: "none", filter: "blur(0px)" };
    function frames(k, isIn) {
        var off = { opacity: k.opacity === undefined ? 1 : k.opacity, transform: k.transform || "none", filter: k.filter || "blur(0px)" };
        if (!isIn) return [REST, off];
        return k.over ? [off, { opacity: 1, transform: k.over, filter: "blur(0px)", offset: 0.7 }, REST] : [off, REST];
    }
    function lettersOf(w) {
        if (!w._letters) { var txt = w.textContent; w.textContent = ""; w._letters = txt.split("").map(function (ch) { return el("span", "pv-l", w, ch === " " ? " " : ch); }); }
        return w._letters;
    }
    function stopPreview(card) {
        (card._timers || []).forEach(clearTimeout); (card._anims || []).forEach(function (a) { try { a.cancel(); } catch (e) {} });
        card._timers = []; card._anims = []; card._playing = false;
        Array.prototype.forEach.call(card.querySelectorAll(".pv-word"), function (w) { w.style.visibility = ""; w.style.color = w.dataset.color; });
    }
    function playPreview(card, p, loop) {
        stopPreview(card);
        if (!card.animate || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
        card._playing = true;
        var words = Array.prototype.slice.call(card.querySelectorAll(".pv-word")), A = p.anim || {}, L = p.layout || {}, timers = card._timers, anims = card._anims;
        var inDur = Math.max(140, Math.min(650, (A.inDur || 0.3) * 1000)), outDur = Math.max(120, Math.min(500, (A.outDur || 0.25) * 1000));
        var single = L.maxWords === 1, karaoke = L.reveal === "karaoke", group = L.reveal === "group" || karaoke, step = single ? 560 : 260, t0 = 120;
        var hl = rgb((A.highlightColor) || (p.accent && p.accent.color));
        function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
        function animate(w, id, isIn) {
            var k = (isIn ? IN : OUT)[id];
            if (isIn) w.style.visibility = "visible";
            if (!k) { if (!isIn) w.style.visibility = "hidden"; return; }
            var dur = isIn ? inDur : outDur;
            if (k.letters) {
                var ls = lettersOf(w), per = Math.max(18, dur / Math.max(1, ls.length));
                ls.forEach(function (l, j) { anims.push(l.animate(frames(k, isIn), { duration: k.hard ? 1 : dur * 0.8, delay: j * per, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" })); });
            } else anims.push(w.animate(frames(k, isIn), { duration: dur, easing: isIn ? "cubic-bezier(.2,.8,.2,1)" : "cubic-bezier(.4,0,1,1)", fill: isIn ? "both" : "forwards" }));
        }
        words.forEach(function (w) { w.style.visibility = "hidden"; });
        words.forEach(function (w, i) {
            var id = w.classList.contains("acc") && A.accentIn ? A.accentIn : A.animIn, at = group ? t0 : t0 + i * step;
            later(at, function () { animate(w, id, true); });
            if (single && i < words.length - 1) later(at + step - 40, function () { w.style.visibility = "hidden"; });
        });
        var end = group ? t0 + inDur + 900 : t0 + (words.length - 1) * step + inDur + 800;
        if (karaoke) {
            words.forEach(function (w, i) { later(t0 + inDur + i * 320, function () { words.forEach(function (x) { x.style.color = x.dataset.color; }); w.style.color = hl; }); });
            end = t0 + inDur + words.length * 320 + 300;
            later(end - 10, function () { words.forEach(function (x) { x.style.color = x.dataset.color; }); });
        }
        later(end, function () { words.forEach(function (w) { if (w.style.visibility !== "hidden") animate(w, w.classList.contains("acc") && A.accentOut ? A.accentOut : A.animOut, false); }); });
        later(end + outDur + 450, function () { if (loop && card._hover) playPreview(card, p, true); else stopPreview(card); });
    }
    function buildStyle(p) {
        var v = view.style;
        var head = U.row(p, "filters");
        v.filter = el("div", "segmented", head); v.filter.setAttribute("role", "radiogroup");
        [["all", "style.all"], ["fav", "style.fav"], ["mine", "style.mine"]].forEach(function (x) {
            var b = el("button", "seg", v.filter, t(x[1])); b.type = "button"; b.dataset.value = x[0]; b.setAttribute("role", "radio");
            b.onclick = function () { prefs.styleFilter = x[0]; savePrefs(); v.gridSig = null; renderStyle(); };
        });
        el("span", "spacer", head); v.current = el("span", "muted small current-style", head);
        v.grid = el("div", "style-grid", p);
        var q = U.card(p, null); q.id = "style-quick";
        U.field(q, { path: "quick.size", label: t("style.size"), kind: "range", min: 25, max: 200, step: 5, unit: "%" });
        U.field(q, { path: "quick.position", label: t("style.position"), kind: "segmented", options: [{ id: "preset", label: t("pos.preset") }, { id: "25", label: t("pos.top") }, { id: "50", label: t("pos.center") }, { id: "75", label: t("pos.bottom") }] });
        U.field(q, { path: "style.layout.reveal", label: t("style.reveal"), kind: "segmented", options: meta.reveals.map(function (r) { return { id: r.id, label: r.id === "word" ? "По словам" : r.id === "group" ? "Фразой" : "Караоке" }; }) });
        U.field(q, { path: "style.anim.highlightColor", label: t("style.karaoke"), kind: "color", show: function (st) { return st.settings.style.layout.reveal === "karaoke"; }, value: function (st) { return st.settings.style.anim.highlightColor || st.settings.style.accent.color; } });
        U.field(q, { path: "quick.intensity", label: t("style.intensity"), kind: "segmented", options: [{ id: "0.5", label: t("int.soft") }, { id: "1", label: t("int.normal") }, { id: "1.5", label: t("int.strong") }] });
        U.field(q, { path: "format", label: t("style.format"), kind: "select", options: meta.formats });
        var gr = U.row(q, "actions wrap");
        U.button(t("style.guides"), "ghost small", gr, function () { act("safe.guides", {}); }, "zone");
        U.button(t("style.guidesOff"), "ghost small", gr, function () { act("safe.guides", { remove: true }); });
        U.field(q, { path: "style.layout.layerMode", label: t("style.layers"), kind: "segmented", options: meta.layerModes, adv: true });
        var mine = U.card(p, t("style.save")); mine.classList.add("adv");
        var sr = U.row(mine, "actions");
        var name = el("input", "input grow", sr); name.placeholder = t("style.name"); name.setAttribute("aria-label", t("style.name"));
        U.button(t("style.save"), "", sr, function () { act("preset.save", { name: name.value }).then(function (id) { if (id) { name.value = ""; reloadPresets(); } }); }, "save");
        var er = U.row(mine, "actions wrap");
        U.button(t("style.export"), "ghost", er, function () { act("preset.export", { id: S.settings.presetId || "" }); }, "download");
        U.button(t("style.import"), "ghost", er, function () { act("preset.import").then(function (id) { if (id) reloadPresets(); }); }, "upload");
    }
    function reloadPresets() { return H.call("presets").then(function (list) { presets = list; view.style.gridSig = null; render(); }).catch(noop); }
    function renderStyle() {
        var v = view.style, filter = prefs.styleFilter || "all", fav = S.settings.favoriteStyles || [];
        Array.prototype.forEach.call(v.filter.children, function (b) { var on = b.dataset.value === filter; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
        var chosen = S.settings.presetId, cur = null;
        presets.forEach(function (p) { if (p.id === chosen) cur = p; });
        v.current.textContent = cur ? cur.name : t("style.custom");
        var list = presets.filter(function (p) { return filter === "all" || (filter === "fav" ? fav.indexOf(p.id) >= 0 : p.user); });
        list.sort(function (a, b) { return (a.missing && a.missing.length ? 1 : 0) - (b.missing && b.missing.length ? 1 : 0); });   // styles whose fonts are installed first
        var sig = JSON.stringify([list.map(function (p) { return p.id; }), fav, chosen, filter]);
        if (v.gridSig === sig) return;
        var replay = v.gridSig && v.chosen !== chosen ? chosen : null;
        v.gridSig = sig; v.chosen = chosen; v.grid.textContent = "";
        list.forEach(function (p) {
            var missing = p.missing && p.missing.length, card = el("div", "style-card" + (p.id === chosen ? " on" : "") + (missing ? " missing" : ""), v.grid);
            var pick = el("button", "style-pick", card); pick.type = "button"; pick.setAttribute("aria-pressed", String(p.id === chosen)); pick.setAttribute("aria-label", p.name);
            pick.title = p.description + (missing ? "\n" + t("style.noFontLong", { fonts: p.missing.join(", ") }) : "");
            var pv = el("span", "style-preview", pick);
            sample(pv, p.base, L("Ваш"), false); sample(pv, p.base, L("новый"), false); sample(pv, p.accent, L("текст"), true);
            var nm = el("span", "style-name", pick);
            if (missing) { var warn = U.icon("warn", nm); warn.setAttribute("class", "icon nofont"); pick.setAttribute("aria-label", p.name + " — " + t("style.noFont")); }
            el("span", "", nm, p.name);
            pick.onclick = function () { act("preset.choose", { id: p.id }).then(function (r) { if (r) U.toast(p.name + (missing ? " · " + t("style.noFontLong", { fonts: p.missing.join(", ") }) : ""), missing ? "" : "ok", missing ? 6000 : 2000); }); };
            card.addEventListener("pointerenter", function () { card._hover = true; playPreview(card, p, true); });
            card.addEventListener("pointerleave", function () { card._hover = false; stopPreview(card); });
            pick.addEventListener("focus", function () { card._hover = true; playPreview(card, p, true); });
            pick.addEventListener("blur", function () { card._hover = false; stopPreview(card); });
            var star = U.iconButton("star", t("style.favorite"), card, function () { act("preset.favorite", { id: p.id }); }, "star" + (fav.indexOf(p.id) >= 0 ? " on" : ""));
            star.setAttribute("aria-pressed", String(fav.indexOf(p.id) >= 0));
            if (p.id === replay) setTimeout(function () { playPreview(card, p, false); }, 30);
        });
        if (!list.length) el("p", "muted", v.grid, L(filter === "fav" ? "Отметьте стили звёздочкой." : "Здесь появятся ваши стили."));
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
        U.button(t("edit.reset"), "ghost", pr, function () { run({ op: "resetPos" }); }, "undo");
        var mv = U.row(place, "pad-row");
        var pad = el("div", "pad", mv);
        U.iconButton("up", "↑", pad, function () { run({ op: "nudge", kx: 0, ky: -1 }); }, "pad-up");
        U.iconButton("left", "←", pad, function () { run({ op: "nudge", kx: -1, ky: 0 }); }, "pad-left");
        U.iconButton("right", "→", pad, function () { run({ op: "nudge", kx: 1, ky: 0 }); }, "pad-right");
        U.iconButton("down", "↓", pad, function () { run({ op: "nudge", kx: 0, ky: 1 }); }, "pad-down");
        var sz = el("div", "stack", mv);
        U.iconButton("sizeUp", t("edit.bigger"), sz, function () { run({ op: "size", sign: 1 }); });
        U.iconButton("sizeDown", t("edit.smaller"), sz, function () { run({ op: "size", sign: -1 }); });
        var steps = el("div", "grid2 adv", place);
        U.field(steps, { path: "nudgeStep", label: t("edit.step"), kind: "number", min: 1, max: 2000, step: 1 });
        U.field(steps, { path: "sizeStep", label: t("edit.sizeStep"), kind: "number", min: 1, max: 100, step: 1 });
        var fr = U.row(place, "actions wrap");
        U.button(t("edit.faceAvoid"), "", fr, function () { run({ op: "avoidFace" }); }, "face");
        U.button(t("edit.behind"), "ghost", fr, function () { run({ op: "behind" }); }, "user");
        v.face = el("span", "muted small", fr);
        var ctl = section(p, "edit-control", t("ctl.title"));
        el("p", "lead", ctl, t("ctl.lead"));
        var cr = U.row(ctl, "actions wrap");
        v.ctlAdd = U.button(t("ctl.add"), "", cr, function () { act("control.add", {}); }, "edit");
        v.ctlRemove = U.button(t("ctl.remove"), "ghost", cr, function () { if (window.confirm(t("ctl.removeAsk"))) act("control.remove"); }, "trash");
        var zm = section(p, "edit-zoom", t("zoom.title"));
        el("p", "lead", zm, t("zoom.lead"));
        v.zoomScale = U.field(zm, { path: "zoomScale", label: t("zoom.scale"), kind: "segmented", options: [{ id: "105", label: "105%" }, { id: "110", label: "110%" }, { id: "115", label: "115%" }],
            value: function () { return prefs.zoomScale || "110"; }, commit: function (x) { prefs.zoomScale = x; savePrefs(); if (S) U.refresh(S); } });
        var zr = U.row(zm, "actions wrap");
        function zoom(on) { act("zoom.apply", { on: on, scale: Number(prefs.zoomScale || 110), replace: true, mode: prefs.zoomSmooth ? "smooth" : "snap" }).then(function (r) { if (r) U.toast(NoirI18n.host((S && S.status) || ""), "ok"); }); }
        U.button(t("zoom.accents"), "", zr, function () { zoom("accents"); }, "zoomIn");
        U.button(t("zoom.phrases"), "ghost", zr, function () { zoom("phrases"); });
        U.button(t("zoom.cuts"), "ghost", zr, function () { zoom("cuts"); });
        U.button(t("zoom.clear"), "ghost", zr, function () { act("zoom.clear"); }, "trash");
        U.field(zm, { path: "zoomSmooth", label: t("zoom.smooth"), kind: "toggle", value: function () { return !!prefs.zoomSmooth; }, commit: function (on) { prefs.zoomSmooth = on; savePrefs(); } });
        var time = section(p, "edit-time", t("edit.time"));
        var tg = el("div", "grid3", time);
        [["edit.earlier", { shift: -1 }], ["edit.inMinus", { dIn: -1 }], ["edit.outMinus", { dOut: -1 }], ["edit.later", { shift: 1 }], ["edit.inPlus", { dIn: 1 }], ["edit.outPlus", { dOut: 1 }]].forEach(function (x) {
            U.button(t(x[0]), "", tg, function () { var c = { op: "time" }; for (var k in x[1]) c[k] = x[1][k]; run(c); });
        });
        U.field(time, { path: "timeStep", label: t("edit.timeStep"), kind: "number", min: 0.01, max: 30, step: 0.01, adv: true });
        var anim = section(p, "edit-anim", t("edit.anim"));
        var ag = el("div", "grid2", anim);
        U.field(ag, { path: "style.anim.animIn", label: t("edit.in"), kind: "select", options: meta.animIn, commit: function (id) { run({ op: "animIn", id: id }); } });
        U.field(ag, { path: "style.anim.animOut", label: t("edit.out"), kind: "select", options: meta.animOut, commit: function (id) { run({ op: "animOut", id: id }); } });
        var dg = el("div", "grid2 adv", anim);
        U.field(dg, { path: "style.anim.inDur", label: "Длительность появления, с", kind: "number", min: 0, max: 5, step: 0.02 });
        U.field(dg, { path: "style.anim.outDur", label: "Длительность исчезания, с", kind: "number", min: 0, max: 5, step: 0.02 });
        var layers = section(p, "edit-layers", t("edit.layers"));
        var lr = U.row(layers, "actions wrap");
        U.button(t("edit.applyStyle"), "", lr, function () { run({ op: "applyStyle" }); }, "palette");
        U.button(t("edit.makeAccent"), "", lr, function () { run({ op: "makeAccent" }); }, "accent");
        U.button(t("edit.makeBase"), "", lr, function () { run({ op: "makeBase" }); });
        U.button(t("edit.invert"), "", lr, function () { act("layers.invert"); }, "invert");
        U.button(t("edit.reflow"), "ghost adv", lr, function () { act("layers.reflow"); });
        var del = U.row(layers, "actions");
        U.button(t("edit.delete"), "danger", del, function () { if (window.confirm(t("edit.deleteAsk"))) run({ op: "delete", confirmed: true }); }, "trash");
        // tools and sounds: advanced mode
        var tools = section(p, "edit-tools", t("edit.tools")); tools.classList.add("adv");
        el("p", "field-label", tools, t("edit.counter"));
        var cg = el("div", "grid3", tools);
        U.field(cg, { path: "tools.counter.from", label: "От", kind: "number", min: -1e9, max: 1e9 });
        U.field(cg, { path: "tools.counter.to", label: "До", kind: "number", min: -1e9, max: 1e9 });
        U.field(cg, { path: "tools.counter.duration", label: "Секунд", kind: "number", min: 0.1, max: 600, step: 0.1 });
        U.field(cg, { path: "tools.counter.decimals", label: "Знаков", kind: "number", min: 0, max: 6, step: 1 });
        U.field(cg, { path: "tools.counter.prefix", label: "Перед", kind: "text" });
        U.field(cg, { path: "tools.counter.suffix", label: "После", kind: "text" });
        U.button(t("edit.counter"), "", U.row(tools, "actions"), function () { act("tool.counter"); });
        var sr = U.row(tools, "actions wrap");
        U.button(t("edit.strike"), "", sr, function () { act("tool.strike"); });
        U.button(t("edit.strikeRemove"), "ghost", sr, function () { act("tool.strikeRemove"); });
        var mr = U.row(tools, "actions wrap");
        U.button(t("edit.mask"), "", mr, function () { act("tool.mask"); });
        U.button(t("edit.maskRemove"), "ghost", mr, function () { act("tool.maskRemove"); });
        var sfx = section(p, "edit-sfx", t("edit.sfx")); sfx.classList.add("adv");
        v.sfxNames = [];
        U.field(sfx, { path: "sfx.file", label: t("edit.sfxFile"), kind: "select", options: function () { return [{ id: "", label: "—" }].concat(v.sfxNames); } });
        U.field(sfx, { path: "sfx.db", label: "Громкость, дБ", kind: "range", min: -60, max: 12, step: 1, unit: " дБ" });
        var xr = U.row(sfx, "actions wrap");
        U.button(t("edit.sfxSelected"), "", xr, function () { act("sfx.selected"); });
        U.button(t("edit.sfxHere"), "", xr, function () { act("sfx.here"); });
        U.button(t("edit.sfxRemove"), "ghost", xr, function () { act("sfx.remove"); });
        U.button(t("edit.sfxFolder"), "ghost", xr, function () { act("sfx.folder"); }, "folder");
        v.loadSfx = function () {
            if (v.sfxLoaded || !detailed()) return; v.sfxLoaded = true;
            H.call("sfx.list", {}, true).then(function (r) { v.sfxNames = (r.names || []).map(function (n) { return { id: r.files && r.files[n] ? r.files[n] : n, label: n }; }); if (S) U.refresh(S); }).catch(noop);
        };
    }
    function renderEdit() {
        var f = S.face;
        label(view.edit.ctlAdd, S.control ? t("ctl.relink") : t("ctl.add")); view.edit.ctlRemove.hidden = !S.control;
        view.edit.face.textContent = f ? L("Лицо: ") + Math.round((f.x + f.w / 2) * 100) + "% × " + Math.round((f.y + f.h / 2) * 100) + "%" : "";
    }

    // ---------- settings ----------
    function buildSettings(p) {
        var v = view.settings, side = prefs.side === "accent" ? "accent" : "base";
        var rec = U.card(p, t("set.recognition")); rec.id = "set-recognition";
        readinessBox(rec);
        recognitionFields(rec);
        U.field(rec, { path: "python", label: "Python (пусто — из папки проекта)", kind: "text", adv: true });

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
        U.button(t("set.applyLayers"), "", ar, function () { act("layers.apply", { side: side, parts: { font: true, size: true, color: true, stroke: true, fx: true } }); });
        U.button(t("set.applyAll"), "ghost", ar, function () { act("layers.apply", { side: side, all: true, parts: { font: true, size: true, color: true, stroke: true, fx: true } }); });

        var look = U.card(p, t("set.look") + " · " + t(side === "base" ? "set.base" : "set.accentSide"));
        var lg = el("div", "grid2", look), pre = "style." + side + ".";
        U.field(lg, { path: pre + "size", label: "Размер, px (1080)", kind: "number", min: 4, max: 2000, step: 1 });
        U.field(lg, { path: pre + "color", label: "Цвет", kind: "color" });
        U.field(lg, { path: pre + "strokeWidth", label: "Обводка, px", kind: "number", min: 0, max: 200, step: 1 });
        U.field(lg, { path: pre + "strokeColor", label: "Цвет обводки", kind: "color" });
        U.field(lg, { path: pre + "tracking", label: "Трекинг", kind: "number", min: -1000, max: 3000, step: 5, adv: true });
        U.field(lg, { path: pre + "opacity", label: "Непрозрачность, %", kind: "number", min: 0, max: 100, step: 1, adv: true, value: function (st) { var o = st.settings.style[side].opacity; return o === undefined ? 100 : o; } });
        U.field(look, { path: pre + "caps", label: "Заглавными", kind: "toggle" });
        U.field(look, { path: pre + "shadow", label: "Тень", kind: "toggle", value: function (st) { return !!st.settings.style[side].shadow; } });
        U.field(look, { path: pre + "blend", label: "Наложение", kind: "select", options: meta.blends, adv: true, value: function (st) { return st.settings.style[side].blend || "normal"; } });

        var lay = U.card(p, t("set.layout")); lay.id = "set-layout";
        U.field(lay, { path: "style.layout.speaker2Color", label: t("spk.color"), kind: "color", show: function (st) { return !!st.speakers || !!st.settings.speakers; }, value: function (st) { return st.settings.style.layout.speaker2Color || [1, 0.8, 0.26]; } });
        var L = "style.layout.", g1 = el("div", "grid2", lay);
        U.field(g1, { path: L + "maxWords", label: "Слов во фразе, макс.", kind: "number", min: 1, max: 30, step: 1 });
        U.field(g1, { path: L + "lineChars", label: "Символов в строке", kind: "number", min: 0, max: 300, step: 1 });
        U.field(g1, { path: L + "maxChars", label: "Символов во фразе", kind: "number", min: 1, max: 300, step: 1, adv: true });
        U.field(g1, { path: L + "posY", label: "Высота, % кадра", kind: "number", min: -50, max: 150, step: 1, adv: true });
        U.field(g1, { path: L + "posX", label: "По ширине, %", kind: "number", min: -50, max: 150, step: 1, adv: true });
        U.field(g1, { path: L + "accentPosY", label: "Акценты на высоте, %", kind: "text", adv: true, map: { out: function (x) { return x === "" ? null : Number(x); } } });
        U.field(g1, { path: L + "lineGap", label: "Межстрочный", kind: "number", min: -1, max: 5, step: 0.01, adv: true });
        U.field(g1, { path: L + "wordSpace", label: "Между словами", kind: "number", min: 0, max: 3, step: 0.01, adv: true });
        U.field(g1, { path: L + "pauseBreak", label: "Пауза = новая фраза, с", kind: "number", min: 0.05, max: 10, step: 0.05, adv: true });
        U.field(g1, { path: L + "holdGap", label: "Держать до следующей, с", kind: "number", min: 0, max: 5, step: 0.05, adv: true });
        U.field(g1, { path: L + "safeWidth", label: "Ширина строки, доля", kind: "number", min: 0.3, max: 1, step: 0.01, adv: true });
        U.field(lay, { path: L + "punctBreak", label: "Новая фраза после точки", kind: "toggle" });
        U.field(lay, { path: L + "stripPunct", label: "Убирать знаки препинания", kind: "toggle" });
        U.field(lay, { path: L + "autoAccent", label: "Акценты автоматически", kind: "toggle" });
        U.field(lay, { path: L + "keepShortWords", label: "Не оставлять предлоги в конце строки", kind: "toggle", adv: true });
        U.field(lay, { path: L + "accentOwnLine", label: "Акцент на отдельной строке", kind: "toggle", adv: true });

        var mo = U.card(p, t("set.motion")); mo.classList.add("adv");
        var A = "style.anim.", g2 = el("div", "grid2", mo);
        U.field(g2, { path: A + "inDur", label: "Появление, с", kind: "number", min: 0, max: 5, step: 0.02 });
        U.field(g2, { path: A + "outDur", label: "Исчезание, с", kind: "number", min: 0, max: 5, step: 0.02 });
        U.field(g2, { path: A + "distance", label: "Расстояние, px", kind: "number", min: 0, max: 5000, step: 1 });
        U.field(g2, { path: A + "blur", label: "Размытие", kind: "number", min: 0, max: 500, step: 1 });
        U.field(g2, { path: A + "easeInfluence", label: "Плавность, %", kind: "number", min: 0.1, max: 100, step: 1 });

        var mem = U.card(p, t("mem.title"), t("mem.lead")); mem.id = "set-memory";
        U.field(mem, { path: "memoryLearn", label: t("mem.learn"), kind: "toggle", hint: t("mem.learnHint") });
        var memDet = el("details", "mem-details", mem); el("summary", "", memDet, t("mem.show"));
        memDet.addEventListener("toggle", function () { if (memDet.open) loadMemory(); });
        v.mem = el("div", "mem-list", memDet);
        var mr = U.row(memDet, "actions wrap");
        U.button(t("mem.clear"), "ghost", mr, function () { if (window.confirm(t("mem.confirmClear"))) act("memory.clear").then(loadMemory); }, "trash");

        var proj = U.card(p, t("set.project"));
        U.field(proj, { path: "lang", label: t("set.uiLang"), kind: "segmented", options: [{ id: "ru", label: "Русский" }, { id: "en", label: "English" }], commit: function (l) { set("lang", l); } });
        U.field(proj, { path: "mode", label: t("set.mode"), kind: "segmented", hint: t("set.modeHint"), options: [{ id: "compact", label: t("mode.compact") }, { id: "normal", label: t("mode.normal") }, { id: "detailed", label: t("mode.detailed") }],
            value: function () { return prefs.mode; }, commit: function (m) { prefs.mode = m; savePrefs(); applyMode(); if (detailed() && view.edit.loadSfx) view.edit.loadSfx(); if (S) U.refresh(S); } });
        U.field(proj, { path: "replace", label: "Новое создание заменяет субтитры того же видео", kind: "toggle" });
        U.field(proj, { path: "reflow", label: "Перекладывать фразы после смены стиля", kind: "toggle", adv: true });
        var pr = U.row(proj, "actions wrap");
        U.button(t("set.previews"), "ghost adv", pr, function () { if (window.confirm(t("confirm.previews"))) act("previews.remove"); }, "trash");
        U.button(t("set.log"), "ghost", pr, function () { H.call("log").then(showLog).catch(noop); });
        v.log = el("pre", "log", proj); v.log.hidden = true;
        el("p", "muted small about", p, "NOIR Captions " + meta.version + " · " + t("set.aboutText"));
    }
    // Assistant memory: what it learned (word fixes), what it was told to remember, which answers it reuses. Each line can be deleted.
    function loadMemory() {
        var box = view.settings && view.settings.mem; if (!box || !box.parentNode.open) return;
        H.call("memory.get", {}, true).then(function (m) {
            box.textContent = "";
            if (!m) return;
            function group(kind, title, items, text) {
                if (!items.length) return;
                el("h3", "mem-head", box, title + " · " + items.length);
                var ul = el("ul", "mem-items", box);
                items.map(function (it, i) { return { it: it, i: i }; }).reverse().slice(0, 40).forEach(function (x) {
                    var li = el("li", "mem-item", ul); el("span", "mem-text", li, text(x.it));
                    U.iconButton("close", t("mem.remove"), li, function () { act("memory.remove", { kind: kind, index: x.i }).then(loadMemory); }, "small");
                });
            }
            group("prefs", t("mem.prefs"), m.prefs, function (x) { return x.text; });
            group("fixes", t("mem.fixes"), m.fixes, function (x) { return x.from + " → " + x.to + (x.n > 1 ? "  ×" + x.n : ""); });
            group("examples", t("mem.examples"), m.examples, function (x) { return "«" + x.q + "»" + (x.say ? " — " + x.say : ""); });
            if (!m.prefs.length && !m.fixes.length && !m.examples.length) el("p", "muted small", box, t("mem.empty"));
        }).catch(noop);
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
                f.styles.forEach(function (s) { U.button(s.style, "chip small", chips, function () { act("font.set", { side: side, ps: s.ps }).then(function (r2) { if (r2) U.toast(f.name + " " + s.style, "ok", 1800); }); }); });
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
        view.primary.hidden = page === "text" && !S.hasData && !S.recognizing;      // the recognition card has its own button
        view.progress.hidden = !S.recognizing; view.progress.firstChild.style.width = Math.max(4, Math.round((S.progress || 0) * 100)) + "%";
        view.tabs.text.classList.toggle("dot", !!(S.dirty && S.canUpdate));
        renderText(); renderStyle(); renderEdit(); renderSettings(); renderIssues();
        U.refresh(S);
    }
    H.on("state", function (st) {
        var langChanged = S && st.settings.lang !== S.settings.lang, modelChanged = S && st.settings.model !== S.settings.model;
        var newData = st.hasData && st.dataRevision !== seenRevision && seenRevision >= 0;
        S = st; seenRevision = st.dataRevision;
        if (!view.pill) { lastStatus = st.status; return; }
        if (langChanged) { build(); return; }
        // Results of actions appear once as a toast (no separate status line); progress lives in the pill and the top line.
        if (st.status !== lastStatus && !st.recognizing && lastStatus !== null) U.toast(NoirI18n.host(st.status));
        lastStatus = st.status;
        if (newData && page !== "text") go("text");
        if (modelChanged) checkReadiness();
        render();
    });
    H.on("error", function (msg) { U.toast(NoirI18n.host(msg), "error"); if (view.pill) render(); });

    // ---------- start ----------
    if (!H.available) { var m = el("div", "boot", root); el("p", "", m, t("err.noCep")); return; }
    var boot = el("div", "boot", root); el("div", "spinner", boot);
    H.open().then(function (r) {
        meta = r.meta; presets = r.presets; S = H.state(); seenRevision = S ? S.dataRevision : 0; lastStatus = S ? S.status : null;
        root.removeAttribute("aria-busy");
        build();
        checkReadiness();
    }).catch(function (e) { boot.textContent = ""; el("p", "", boot, String(e && e.message || e)); U.button(L("Повторить"), "", boot, function () { location.reload(); }); });
    window.NoirApp = { go: go, state: function () { return S; }, page: function () { return page; }, presets: function () { return presets; }, readiness: function () { return ready; } };
})();
