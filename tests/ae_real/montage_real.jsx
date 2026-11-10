// Real After Effects check of the «Смонтировать» chain. Run: AfterFX.exe -r tests\ae_real\montage_real.jsx
// Adds one temporary comp + footage to the open project, checks, and removes them again. Report: tests/ae_real/report.json
(function () {
    var here = File($.fileName).parent, root = here.parent.parent, rep = { checks: [], errors: [] };
    function ok(name, cond, extra) { rep.checks.push({ name: name, ok: !!cond, info: extra === undefined ? "" : String(extra) }); }
    function save() { var f = File(here.fsName + "/report.json"); f.encoding = "UTF-8"; f.open("w"); f.write(NOIR.stringify(rep)); f.close(); }
    var comp = null, footage = null;
    try {
        var mods = ["core.jsx", "generator.jsx", "recognizer.jsx", "sfx.jsx", "tools.jsx", "app.jsx"];
        for (var i = 0; i < mods.length; i++) $.evalFile(File(root.fsName + "/ae/noir/" + mods[i]));
        rep.ae = app.version;
        for (var ci = app.project.numItems; ci >= 1; ci--) { var it = app.project.item(ci); if (it.name === "NOIR_REAL_TEST" || (it instanceof FootageItem && it.file && it.file.name === "1774639922519426331.mp4")) it.remove(); }
        File(here.fsName + "/result.png").remove();
        var mp4 = File(root.fsName + "/1774639922519426331.mp4");
        footage = app.project.importFile(new ImportOptions(mp4));
        comp = app.project.items.addComp("NOIR_REAL_TEST", 1080, 1920, 1, 20, 30);
        var v = comp.layers.add(footage); v.selected = true;
        rep.footage = { hasVideo: footage.hasVideo, hasAudio: footage.hasAudio, duration: footage.duration, w: footage.width, h: footage.height };
        comp.openInViewer();
        var wordsOf = function (arr) { var o = []; for (var k = 0; k < arr.length; k++) o.push({ text: arr[k][0], start: arr[k][1], end: arr[k][2] }); return o; };
        var data = { schema: "noir-captions/1", language: "ru", engine: { model: "small", device: "cpu" }, warnings: [], source: { file: mp4.fsName }, segments: [
            { words: wordsOf([["Привет,", 1.0, 1.3], ["эээ", 1.35, 1.9], ["это", 3.0, 3.2], ["NOIR.", 3.2, 3.8]]) },
            { words: wordsOf([["Ну", 4.0, 4.3], ["субтитры", 6.5, 7.1], ["сами", 7.1, 7.4], ["получаются", 7.4, 8.2]]) } ] };
        var jf = File(here.fsName + "/words.json"); jf.encoding = "UTF-8"; jf.open("w"); jf.write(NOIR.stringify(data)); jf.close();
        var layersBefore = comp.numLayers, api = NOIR.createApp(root.fsName);
        api.call("json.load", { path: jf.fsName });
        var res = api.call("montage.apply", {});
        var st = api.state(), cuts = [], subs = 0, scaleKeys = 0, zoomKeyed = false;
        for (var li = 1; li <= comp.numLayers; li++) {
            var L = comp.layer(li);
            if (L.comment === NOIR.CUT_TAG) { cuts.push(L); try { var sk = L.property("Transform").property("Scale").numKeys; scaleKeys += sk; if (sk > 0) zoomKeyed = true; } catch (e1) {} }
            else if (NOIR.isGenerated(L)) subs++;
        }
        rep.status = st.status; rep.report = res; rep.text = st.text; rep.layers = comp.numLayers;
        var orig = false; for (li = 1; li <= comp.numLayers; li++) { var Lo = comp.layer(li); if (Lo.comment !== NOIR.CUT_TAG && !NOIR.isGenerated(Lo) && Lo.source === footage) orig = true; }
        ok("исходный слой заменён кусками (noir-captions:cut)", cuts.length >= 2 && !orig, "кусков: " + cuts.length);
        ok("субтитры созданы", subs > 0, "слоёв субтитров: " + subs);
        ok("у кусков есть ключи Scale", zoomKeyed, "ключей: " + scaleKeys);
        ok("статус начинается с «Смонтировано»", String(st.status).indexOf("Смонтировано") === 0, st.status);
        try { var png = File(here.fsName + "/result.png"); comp.time = 3.3; comp.saveFrameToPng(comp.time, png); for (var w = 0; w < 40 && !png.exists; w++) $.sleep(250); ok("кадр сохранён в PNG", png.exists, png.fsName); } catch (e2) { ok("кадр сохранён в PNG", false, String(e2)); }
        // undo
        var after = comp.numLayers, steps = 0, restored = false;
        while (steps < 6 && !restored) {
            app.executeCommand(16); steps++;
            var l1 = comp.numLayers ? comp.layer(1) : null; restored = comp.numLayers === layersBefore && !!l1 && l1.comment !== NOIR.CUT_TAG && l1.source === footage;
        }
        rep.undo = { layersBefore: layersBefore, layersAfter: after, stepsToRestore: restored ? steps : null, layersNow: comp.numLayers };
        ok("отмена: композиция как была за 1 шаг Ctrl+Z", restored && steps === 1, "шагов: " + (restored ? steps : "не вернулось за 6") + ", слоёв сейчас " + comp.numLayers + ", было " + layersBefore);
    } catch (e) { rep.errors.push(String(e && e.message || e) + (e && e.line ? " @" + e.line : "")); }
    try { if (comp) comp.remove(); } catch (e4) {}
    try { if (footage) footage.remove(); } catch (e5) {}
    save();
})();
