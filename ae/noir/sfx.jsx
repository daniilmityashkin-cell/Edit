/*
 * NOIR CAPTIONS — SFX: озвучивание появления/исчезновения текста.
 *
 * Библиотека: <проект>/sfx/<категория>/*.wav  и  %APPDATA%\NOIR Captions\sfx\<категория>\*.wav
 * (категория = имя папки). План расстановки (planSfx) — чистая логика, тестируется в Node;
 * расстановка (placeSfx) создаёт звуковые слои «NOIR SFX · …» в композиции.
 *
 * Внимание (ExtendScript = ES3): не использовать `in`, `short`, `int`… как имена полей.
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    N.SFX_TAG = "noir-captions:sfx";

    N.SFX_LABELS = {
        whoosh: "Вжух", pop: "Поп", hit: "Удар", click: "Щелчок", rise: "Нарастание", shimmer: "Блеск",
        morph: "Смена слова", counter: "Счётчик", blur_out: "Уход в блюр", scale_down: "Масштаб вниз",
        glitch: "Глитч", other: "Другое"
    };

    // Какой звук подходит к вылету (id анимации -> категория).
    N.AUTO_SFX_IN = {
        none: "click", fade: "shimmer", blur: "morph", blurRise: "whoosh", rise: "whoosh", drop: "whoosh",
        left: "whoosh", right: "whoosh", pop: "pop", punch: "hit", zoom: "whoosh", slam: "hit",
        whipL: "whoosh", whipR: "whoosh", rotate: "whoosh", grow: "pop", blurPop: "pop"
    };
    N.AUTO_SFX_OUT = {
        none: "", fade: "blur_out", blur: "blur_out", blurUp: "blur_out", shrink: "scale_down",
        up: "whoosh", down: "whoosh", left: "whoosh", right: "whoosh", zoom: "scale_down",
        whipL: "whoosh", whipR: "whoosh", rotate: "whoosh", slamOut: "scale_down"
    };
    var FALLBACK_IN = ["whoosh", "pop", "click"];
    var FALLBACK_OUT = ["blur_out", "whoosh"];

    N.sfxCategoryLabel = function (cat) { return N.SFX_LABELS[cat] || cat; };

    // ---------- библиотека ----------

    function extOf(name) {
        var m = /\.([A-Za-z0-9]+)$/.exec(String(name));
        return m ? m[1].toLowerCase() : "";
    }
    function isAudio(f) { return !(f instanceof Folder) && /^(wav|mp3|aif|aiff|m4a)$/.test(extOf(f.name)); }

    N.sfxFolders = function (root) {
        return [Folder(root + "/sfx"), Folder(Folder.userData.fsName + "/NOIR Captions/sfx")];
    };

    N.sfxName = function (path) {
        return decodeURI(String(path).replace(/^.*[\/\\]/, "")).replace(/\.[^.]*$/, "");
    };

    // { names: [категории], files: { категория: [полные пути] } }
    N.sfxLibrary = function (root) {
        var lib = { names: [], files: {} }, dirs = N.sfxFolders(root), d, i, j;
        function add(cat, path) {
            if (!lib.files[cat]) { lib.files[cat] = []; lib.names.push(cat); }
            lib.files[cat].push(path);
        }
        for (d = 0; d < dirs.length; d++) {
            if (!dirs[d].exists) continue;
            var items = dirs[d].getFiles();
            for (i = 0; i < items.length; i++) {
                var it = items[i];
                if (it instanceof Folder) {
                    var cat = decodeURI(it.name), fl = it.getFiles();
                    for (j = 0; j < fl.length; j++) if (isAudio(fl[j])) add(cat, fl[j].fsName);
                } else if (isAudio(it)) {
                    add("other", it.fsName);
                }
            }
        }
        lib.names.sort();
        for (i = 0; i < lib.names.length; i++) lib.files[lib.names[i]].sort();
        return lib;
    };

    // ---------- план ----------

    // choice: { mode: "off" | "auto" | "cat", value }. rr — счётчики для чередования файлов в категории.
    N.pickSfx = function (lib, choice, anim, kind, rr) {
        if (!choice || choice.mode === "off") return null;
        var cat = null, list, i;
        if (choice.mode === "cat") cat = choice.value;
        else cat = (kind === "out" ? N.AUTO_SFX_OUT : N.AUTO_SFX_IN)[anim];
        if (!cat) return null;
        list = lib.files[cat];
        if (!list || !list.length) {
            var fb = kind === "out" ? FALLBACK_OUT : FALLBACK_IN;
            for (i = 0; i < fb.length && !(lib.files[fb[i]] && lib.files[fb[i]].length); i++) {}
            if (i === fb.length) return null;
            cat = fb[i];
            list = lib.files[cat];
        }
        var n = rr[cat] || 0;
        rr[cat] = n + 1;
        return { cat: cat, file: list[n % list.length] };
    };

    // events: [{ t, kind: "in"|"out", accent, anim }]
    // cfg: { appear, accent, exit: {mode,value} (accent.mode "same" = как appear), db, dbRand, minGap }
    N.planSfx = function (events, lib, cfg) {
        var evs = [], i;
        for (i = 0; i < events.length; i++) evs.push({ e: events[i], i: i });
        evs.sort(function (a, b) { return a.e.t - b.e.t || a.i - b.i; });
        var plan = [], rr = {}, last = null;
        for (i = 0; i < evs.length; i++) {
            var e = evs[i].e, choice;
            if (e.kind === "out") choice = cfg.exit;
            else if (e.accent && cfg.accent.mode !== "same") choice = cfg.accent;
            else choice = cfg.appear;
            var pick = N.pickSfx(lib, choice, e.anim, e.kind, rr);
            if (!pick) continue;
            // детерминированный «разброс» громкости — одинаковый результат при повторной расстановке
            var db = cfg.db + (cfg.dbRand ? (((i * 37) % 100) / 50 - 1) * cfg.dbRand : 0);
            var item = { t: e.t, file: pick.file, cat: pick.cat, db: db, accent: !!e.accent, kind: e.kind };
            if (last && e.t - last.t < cfg.minGap) {
                // слишком близко: акцентный звук вытесняет обычный, остальные пропускаем
                if (item.accent && !last.accent) { plan[plan.length - 1] = item; last = item; }
                continue;
            }
            plan.push(item);
            last = item;
        }
        return plan;
    };

    // События по выделенным текстовым слоям: появление — inPoint, выход — за outDur до outPoint.
    N.sfxEventsFromLayers = function (layers, anim) {
        var ev = [];
        for (var i = 0; i < layers.length; i++) {
            var l = layers[i], accent = (l.label === 11);
            ev.push({ t: l.inPoint, kind: "in", accent: accent, anim: anim.animIn });
            if (anim.animOut && anim.animOut !== "none") {
                ev.push({ t: Math.max(l.inPoint, l.outPoint - anim.outDur), kind: "out", accent: false, anim: anim.animOut });
            }
        }
        return ev;
    };

    // ---------- расстановка в AE ----------

    function projectFolder() {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof FolderItem && it.name === "NOIR SFX") return it;
        }
        return app.project.items.addFolder("NOIR SFX");
    }

    function importOnce(path, folder) {
        var want = File(path).fsName;
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof FootageItem && it.mainSource && it.mainSource.file && it.mainSource.file.fsName === want) return it;
        }
        var item = app.project.importFile(new ImportOptions(File(path)));
        item.parentFolder = folder;
        return item;
    }

    N.removeSfx = function (comp) {
        var n = 0;
        for (var i = comp.numLayers; i >= 1; i--) {
            var l = comp.layer(i);
            if (String(l.comment || "").indexOf(N.SFX_TAG) === 0) {
                if (l.locked) l.locked = false;
                l.remove();
                n++;
            }
        }
        return n;
    };

    // plan: [{ t, file, cat, db }]. Время t — в секундах композиции.
    N.placeSfx = function (comp, plan) {
        var folder = projectFolder(), placed = 0, warnings = [];
        for (var i = 0; i < plan.length; i++) {
            var p = plan[i];
            if (p.t < 0 || p.t >= comp.duration) continue;
            try {
                var item = importOnce(p.file, folder);
                var layer = comp.layers.add(item);
                layer.name = "NOIR SFX · " + N.sfxName(p.file);
                layer.comment = N.SFX_TAG + "|" + p.cat;
                layer.label = 13;
                layer.startTime = p.t;
                try { layer.property("ADBE Audio Group").property("ADBE Audio Levels").setValue([p.db, p.db]); } catch (e1) {}
                try { layer.moveToEnd(); } catch (e2) {}
                placed++;
            } catch (e) {
                warnings.push("Не удалось добавить звук " + N.sfxName(p.file) + ": " + e.toString());
            }
        }
        return { placed: placed, warnings: warnings };
    };
})(NOIR);
