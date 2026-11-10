// Real After Effects self-test of the montage chain on the OPEN project. Never saves the project; removes everything it created.
// Run: AfterFX.exe -r tests\ae_real\selftest.jsx
// Part 1: synthetic comp "NOIR selftest" (dark solid stub + known words). Part 2: real recognition on a duplicate of the first comp with a video layer.
(function () {
    var here = File($.fileName).parent, root = here.parent.parent, G = $.global;
    function w(name, text) { var f = File(here.fsName + "/" + name); f.encoding = "UTF-8"; f.open("w"); f.write(text); f.close(); }
    function r2(x) { return Math.round(x * 1000) / 1000; }
    function scaleKeys(L) { try { return L.property("Transform").property("Scale").numKeys; } catch (e) { return 0; } }
    function snapshot() {
        var o = [], i, it, k, L;
        for (i = 1; i <= app.project.numItems; i++) {
            it = app.project.item(i);
            o.push(it.name + ":" + (it instanceof CompItem ? it.numLayers : "-"));
            if (it instanceof CompItem) for (k = 1; k <= it.numLayers; k++) { L = it.layer(k); o.push("   " + L.name + "|" + r2(L.inPoint) + "|" + r2(L.outPoint) + "|" + r2(L.startTime) + "|" + L.comment + "|" + scaleKeys(L)); }
        }
        return o.join("\n");
    }
    function layerTable(comp) {
        var rows = [], li, L, text, cut = 0, subs = 0, keys = 0, role, sk;
        for (li = 1; li <= comp.numLayers; li++) {
            L = comp.layer(li); text = "";
            if (L instanceof TextLayer) { try { text = L.property("Source Text").value.text; } catch (e) { text = "?"; } }
            sk = scaleKeys(L);
            role = L.comment === NOIR.CUT_TAG ? "cut piece" : (NOIR.isGenerated(L) ? "caption" : "other");
            if (role === "cut piece") { cut++; keys += sk; }
            if (role === "caption") subs++;
            rows.push({ i: li, name: L.name, type: L instanceof TextLayer ? "TextLayer" : "AVLayer", role: role, inP: r2(L.inPoint), outP: r2(L.outPoint), start: r2(L.startTime), keys: sk, text: text });
        }
        return { rows: rows, cut: cut, subs: subs, keys: keys };
    }
    function tableText(t) {
        var l = ["idx | name | type | role | inPoint | outPoint | startTime | scaleKeys | text"], k, x;
        for (k = 0; k < t.rows.length; k++) { x = t.rows[k]; l.push([x.i, x.name, x.type, x.role, x.inP, x.outP, x.start, x.keys, x.text.replace(/\r|\n/g, "\\n")].join(" | ")); }
        return l.join("\n");
    }
    function dropMine(names) {
        for (var i = app.project.numItems; i >= 1; i--) {
            var it; try { it = app.project.item(i); } catch (e) { continue; }
            for (var n = 0; n < names.length; n++) if (it.name === names[n]) { try { it.remove(); } catch (e2) {} break; }
        }
    }
    var mods = ["core.jsx", "generator.jsx", "recognizer.jsx", "sfx.jsx", "tools.jsx", "app.jsx"], mi;
    for (mi = 0; mi < mods.length; mi++) $.evalFile(File(root.fsName + "/ae/noir/" + mods[mi]));

    var rep = { ae: app.version, project: app.project.file ? app.project.file.fsName : null, saved: "project.save is never called", part1: { checks: [], errors: [] }, part2: { checks: [], errors: [] } };
    var before = snapshot(); rep.itemsBefore = before;
    var P1 = rep.part1, P2 = rep.part2;
    function ok1(n, c, e) { P1.checks.push({ name: n, ok: !!c, info: e === undefined ? "" : String(e) }); }
    function ok2(n, c, e) { P2.checks.push({ name: n, ok: !!c, info: e === undefined ? "" : String(e) }); }

    // ---------- part 1 ----------
    try {
        dropMine(["NOIR selftest"]);
        var comp = app.project.items.addComp("NOIR selftest", 1080, 1920, 1, 20, 30);
        var v = comp.layers.addSolid([0.08, 0.08, 0.12], "stub-video", 1080, 1920, 1, 20); v.selected = true; comp.openInViewer();
        var inWords = [["Привет,", 1.0, 1.3], ["эээ", 1.35, 1.9], ["это", 3.0, 3.2], ["NOIR.", 3.2, 3.8], ["Ну", 4.0, 4.3], ["субтитры", 6.5, 7.1], ["сами", 7.1, 7.4], ["получаются", 7.4, 8.2]];
        var wo = function (a) { var o = [], k; for (k = 0; k < a.length; k++) o.push({ text: a[k][0], start: a[k][1], end: a[k][2] }); return o; };
        w("words.json", NOIR.stringify({ schema: "noir-captions/1", language: "ru", engine: { model: "small", device: "cpu" }, warnings: [], source: { file: root.fsName + "/stub.wav" }, segments: [{ words: wo(inWords.slice(0, 4)) }, { words: wo(inWords.slice(4)) }] }));
        var api = NOIR.createApp(root.fsName), nBefore = comp.numLayers;
        api.call("json.load", { path: File(here.fsName + "/words.json").fsName });
        api.call("montage.apply", {});
        var st = api.state(), t = layerTable(comp), q, first = null, c2;
        P1.inputWords = inWords; P1.status = st.status; P1.textAfter = st.text; P1.layers = t.rows;
        var left = false;
        for (q = 1; q <= comp.numLayers; q++) if (comp.layer(q).name === "stub-video" && comp.layer(q).comment !== NOIR.CUT_TAG) left = true;
        var kept = [], cutW = [], k2, mid, inside;
        for (k2 = 0; k2 < inWords.length; k2++) {
            mid = (inWords[k2][1] + inWords[k2][2]) / 2; inside = false;
            for (q = 1; q <= comp.numLayers; q++) { c2 = comp.layer(q); if (c2.comment === NOIR.CUT_TAG && mid >= c2.inPoint - c2.startTime && mid <= c2.outPoint - c2.startTime) inside = true; }
            (inside ? kept : cutW).push(inWords[k2][0]);
        }
        P1.wordsKept = kept; P1.wordsCut = cutW;
        ok1("слой-заглушка заменён кусками noir-captions:cut", t.cut >= 2 && !left, "кусков: " + t.cut);
        ok1("субтитры созданы", t.subs > 0, "слоёв: " + t.subs);
        ok1("у кусков есть ключи Scale", t.keys > 0, "ключей: " + t.keys);
        ok1("статус начинается с «Смонтировано»", String(st.status).indexOf("Смонтировано") === 0, st.status);
        for (q = 1; q <= comp.numLayers; q++) if (NOIR.isGenerated(comp.layer(q)) && (!first || comp.layer(q).inPoint < first.inPoint)) first = comp.layer(q);
        try {
            var png = File(here.fsName + "/result.png"); png.remove();
            var tt = first.inPoint + 0.2; comp.time = tt; comp.saveFrameToPng(tt, png);
            for (var wt = 0; wt < 40 && !png.exists; wt++) $.sleep(250);
            P1.frameTime = r2(tt); ok1("кадр сохранён в PNG", png.exists, "t=" + r2(tt));
        } catch (e3) { ok1("кадр сохранён в PNG", false, e3); }
        w("layers.txt", tableText(t));
        var steps = 0, restored = false, l1;
        while (steps < 6 && !restored) {
            app.executeCommand(16); steps++;
            l1 = comp.numLayers ? comp.layer(1) : null;
            restored = comp.numLayers === nBefore && !!l1 && l1.name === "stub-video" && l1.comment !== NOIR.CUT_TAG;
        }
        P1.undo = { layersBefore: nBefore, layersAfterMontage: t.rows.length, steps: restored ? steps : null };
        ok1("отмена вернула композицию как была за 1 шаг", restored && steps === 1, "шагов: " + (restored ? steps : ">6"));
    } catch (e) { P1.errors.push(String(e && e.message || e) + (e && e.line ? " @" + e.line : "")); }
    dropMine(["NOIR selftest", "stub-video"]);
    rep.part1Clean = snapshot() === before;
    w("selftest_report.json", NOIR.stringify(rep));

    // ---------- part 2: real recognition on a duplicate ----------
    function finish() {
        try { if (G.__nt && G.__nt.task) app.cancelTask(G.__nt.task); } catch (e) {}
        try { dropMine(["NOIR selftest real"]); } catch (e1) {}
        rep.restored = snapshot() === before; w("selftest_report.json", NOIR.stringify(rep)); G.__nt = null;
    }
    try {
        var orig = null, i0, it0, z;
        for (i0 = 1; i0 <= app.project.numItems && !orig; i0++) {
            it0 = app.project.item(i0);
            if (!(it0 instanceof CompItem)) continue;
            for (z = 1; z <= it0.numLayers; z++) if (it0.layer(z) instanceof AVLayer && it0.layer(z).hasAudio && it0.layer(z).hasVideo && !(it0.layer(z).source.mainSource instanceof SolidSource)) { orig = it0; break; }
        }
        if (!orig) { P2.errors.push("в проекте нет композиции с видеослоем"); finish(); return; }
        P2.original = orig.name; P2.originalDuration = r2(orig.duration);
        var dup = orig.duplicate(); dup.name = "NOIR selftest real"; dup.openInViewer();
        for (z = 1; z <= dup.numLayers; z++) dup.layer(z).selected = false;
        dup.layer(1).selected = true;
        var api2 = NOIR.createApp(root.fsName);
        P2.setup = api2.call("setup.check"); P2.layersBeforeMontage = dup.numLayers;
        api2.call("montage.start", {});
        G.__nt = { api: api2, dup: dup, t0: new Date().getTime(), task: null, ticks: 0 };
        G.NOIR_SELFTEST_TICK = function () {
            var S = G.__nt; if (!S) return; S.ticks++;
            try {
                var s = S.api.state(), secs = (new Date().getTime() - S.t0) / 1000;
                if (S.ticks % 5 === 0) w("progress.txt", Math.round(secs) + " s; recognizing=" + s.recognizing + "; " + s.progress + "%; " + s.status);
                if (s.recognizing && secs < 1500) return;
                P2.seconds = Math.round(secs); P2.status = s.status; P2.textAfter = s.text;
                var d = S.dup, tab = layerTable(d), q;
                P2.layers = tab.rows;
                ok2("распознавание закончилось и монтаж выполнен", String(s.status).indexOf("Смонтировано") === 0, s.status);
                ok2("исходный слой заменён кусками", tab.cut >= 1, "кусков: " + tab.cut);
                ok2("субтитры созданы", tab.subs > 0, "слоёв субтитров: " + tab.subs);
                var mm = /вырезано ([\d.]+) с/.exec(String(s.status));
                P2.cutSeconds = mm ? Number(mm[1]) : 0; P2.captionLayers = tab.subs; P2.zoomKeys = tab.keys;
                w("real_layers.txt", tableText(tab));
                var caps = [];
                for (q = 1; q <= d.numLayers; q++) if (NOIR.isGenerated(d.layer(q))) caps.push(d.layer(q));
                caps.sort(function (a, b) { return a.inPoint - b.inPoint; });
                var picks = []; if (caps.length) { picks.push(caps[0]); picks.push(caps[Math.floor(caps.length / 2)]); picks.push(caps[caps.length - 1]); }
                P2.frames = [];
                for (q = 0; q < picks.length; q++) {
                    var f = File(here.fsName + "/real_frame_" + (q + 1) + ".png"); f.remove();
                    var tt2 = picks[q].inPoint + 0.2; d.time = tt2; d.saveFrameToPng(tt2, f);
                    for (var wt2 = 0; wt2 < 60 && !f.exists; wt2++) $.sleep(250);
                    P2.frames.push({ file: f.name, t: r2(tt2), caption: picks[q].name, saved: f.exists });
                }
                ok2("кадры сохранены", P2.frames.length > 0, P2.frames.length + " шт.");
                var steps2 = 0, restored2 = false, nb = P2.layersBeforeMontage;
                while (steps2 < 6 && !restored2) { app.executeCommand(16); steps2++; restored2 = d.numLayers === nb && d.layer(1).comment !== NOIR.CUT_TAG && !NOIR.isGenerated(d.layer(1)); }
                P2.undoSteps = restored2 ? steps2 : null;
                ok2("отмена на копии вернула слои как были за 1 шаг", restored2 && steps2 === 1, "шагов: " + (restored2 ? steps2 : ">6"));
            } catch (eT) { P2.errors.push(String(eT && eT.message || eT) + (eT && eT.line ? " @" + eT.line : "")); }
            finish();
        };
        G.__nt.task = app.scheduleTask("NOIR_SELFTEST_TICK()", 1500, true);
    } catch (e6) { P2.errors.push(String(e6 && e6.message || e6) + (e6 && e6.line ? " @" + e6.line : "")); finish(); }
})();
