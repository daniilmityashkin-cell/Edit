// Real After Effects check of the «Смонтировать» chain. Run: AfterFX.exe -r tests\ae_real\montage_real.jsx
// Adds one temporary comp with a dark solid stub to the open project, checks, removes it. Outputs in tests/ae_real/: report.json, layers.txt, result.png
(function () {
    var here = File($.fileName).parent, root = here.parent.parent, rep = { checks: [], errors: [] }, table = [];
    function ok(name, cond, extra) { rep.checks.push({ name: name, ok: !!cond, info: extra === undefined ? "" : String(extra) }); }
    function w(name, text) { var f = File(here.fsName + "/" + name); f.encoding = "UTF-8"; f.open("w"); f.write(text); f.close(); }
    function r2(x) { return Math.round(x * 1000) / 1000; }
    var comp = null, solid = null;
    try {
        var mods = ["core.jsx", "generator.jsx", "recognizer.jsx", "sfx.jsx", "tools.jsx", "app.jsx"];
        for (var i = 0; i < mods.length; i++) $.evalFile(File(root.fsName + "/ae/noir/" + mods[i]));
        rep.ae = app.version;
        for (var ci = app.project.numItems; ci >= 1; ci--) if (app.project.item(ci).name === "NOIR_REAL_TEST") app.project.item(ci).remove();
        File(here.fsName + "/result.png").remove();
        comp = app.project.items.addComp("NOIR_REAL_TEST", 1080, 1920, 1, 20, 30);
        var v = comp.layers.addSolid([0.08, 0.08, 0.12], "stub-video", 1080, 1920, 1, 20); v.selected = true;
        solid = v.source; comp.openInViewer();
        var inWords = [["Привет,", 1.0, 1.3], ["эээ", 1.35, 1.9], ["это", 3.0, 3.2], ["NOIR.", 3.2, 3.8], ["Ну", 4.0, 4.3], ["субтитры", 6.5, 7.1], ["сами", 7.1, 7.4], ["получаются", 7.4, 8.2]];
        var wordsOf = function (arr) { var o = []; for (var k = 0; k < arr.length; k++) o.push({ text: arr[k][0], start: arr[k][1], end: arr[k][2] }); return o; };
        var data = { schema: "noir-captions/1", language: "ru", engine: { model: "small", device: "cpu" }, warnings: [], source: { file: root.fsName + "/stub.wav" }, segments: [
            { words: wordsOf(inWords.slice(0, 4)) }, { words: wordsOf(inWords.slice(4)) } ] };
        w("words.json", NOIR.stringify(data));
        var layersBefore = comp.numLayers, api = NOIR.createApp(root.fsName);
        api.call("json.load", { path: File(here.fsName + "/words.json").fsName });
        var res = api.call("montage.apply", {}), st = api.state(), cuts = [], subs = [], scaleKeys = 0, li, L;
        for (li = 1; li <= comp.numLayers; li++) {
            L = comp.layer(li);
            var isCut = L.comment === NOIR.CUT_TAG, isSub = NOIR.isGenerated(L), txt = "", sk = 0;
            if (L instanceof TextLayer) { try { txt = L.property("Source Text").value.text; } catch (eT) { txt = "?"; } }
            try { sk = L.property("Transform").property("Scale").numKeys; } catch (eS) {}
            if (isCut) { cuts.push(L); scaleKeys += sk; }
            if (isSub) subs.push(L);
            table.push({ index: li, name: L.name, type: L instanceof TextLayer ? "TextLayer" : (L instanceof AVLayer ? "AVLayer" : "other"), role: isCut ? "cut piece" : (isSub ? "caption" : "other"),
                inPoint: r2(L.inPoint), outPoint: r2(L.outPoint), startTime: r2(L.startTime), scaleKeys: sk, text: txt });
        }
        rep.layerTable = table; rep.inputWords = inWords; rep.status = st.status; rep.report = res; rep.textAfter = st.text;
        // which input words survive: source time of a piece = comp time - startTime
        var kept = [], dropped = [], k2, q;
        for (k2 = 0; k2 < inWords.length; k2++) {
            var mid = (inWords[k2][1] + inWords[k2][2]) / 2, inside = false;
            for (q = 0; q < cuts.length; q++) if (mid >= cuts[q].inPoint - cuts[q].startTime && mid <= cuts[q].outPoint - cuts[q].startTime) inside = true;
            (inside ? kept : dropped).push(inWords[k2][0]);
        }
        rep.wordsKept = kept; rep.wordsCut = dropped;
        var origLeft = false; for (li = 1; li <= comp.numLayers; li++) if (comp.layer(li).name === "stub-video" && comp.layer(li).comment !== NOIR.CUT_TAG) origLeft = true;
        ok("слой-заглушка заменён кусками (noir-captions:cut)", cuts.length >= 2 && !origLeft, "кусков: " + cuts.length + ", слой stub-video остался: " + origLeft);
        ok("субтитры созданы", subs.length > 0, "слоёв субтитров: " + subs.length);
        ok("у кусков есть ключи Scale", scaleKeys > 0, "ключей Scale: " + scaleKeys);
        ok("статус начинается с «Смонтировано»", String(st.status).indexOf("Смонтировано") === 0, st.status);
        // frame inside the first caption
        var first = null; for (q = 0; q < subs.length; q++) if (!first || subs[q].inPoint < first.inPoint) first = subs[q];
        try {
            var png = File(here.fsName + "/result.png"), t = first.inPoint + 0.2; comp.time = t; rep.frameTime = r2(t); rep.firstCaption = { name: first.name, inPoint: r2(first.inPoint), outPoint: r2(first.outPoint) };
            comp.saveFrameToPng(t, png); for (var wt = 0; wt < 40 && !png.exists; wt++) $.sleep(250);
            ok("кадр сохранён в PNG", png.exists, png.fsName + " на t=" + r2(t));
        } catch (e2) { ok("кадр сохранён в PNG", false, String(e2)); }
        var steps = 0, restored = false, l1;
        while (steps < 6 && !restored) {
            app.executeCommand(16); steps++;
            l1 = comp.numLayers ? comp.layer(1) : null; restored = comp.numLayers === layersBefore && !!l1 && l1.name === "stub-video" && l1.comment !== NOIR.CUT_TAG;
        }
        rep.undo = { layersBefore: layersBefore, layersAfterMontage: table.length, stepsToRestore: restored ? steps : null, layersNow: comp.numLayers };
        ok("отмена: композиция как была за 1 шаг", restored && steps === 1, "шагов: " + (restored ? steps : "не вернулось за 6") + ", слоёв сейчас " + comp.numLayers + ", было " + layersBefore);
    } catch (e) { rep.errors.push(String(e && e.message || e) + (e && e.line ? " @" + e.line : "")); }
    var lines = ["idx | name | type | role | inPoint | outPoint | scaleKeys | text"];
    for (var z = 0; z < table.length; z++) { var T = table[z]; lines.push(T.index + " | " + T.name + " | " + T.type + " | " + T.role + " | " + T.inPoint + " | " + T.outPoint + " | " + T.scaleKeys + " | " + T.text.replace(/\r|\n/g, "\n")); }
    w("layers.txt", lines.join("\n"));
    try { if (comp) comp.remove(); } catch (e4) {}
    try { if (solid) solid.remove(); } catch (e5) {}
    w("report.json", NOIR.stringify(rep));
})();
