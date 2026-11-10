// Real AE: frames of the caption animations (in / accent / out) + centering frames, in a temporary comp "NOIR selftest". Project is never saved; everything created is removed.
// Output: tests/ae_real/frames_tmp/*.png + frames_tmp/manifest.json (read by anim_sheet.py)
(function () {
    var here = File($.fileName).parent, root = here.parent.parent, outDir = Folder(here.fsName + "/frames_tmp");
    if (!outDir.exists) outDir.create();
    function w(name, text) { var f = File(here.fsName + "/" + name); f.encoding = "UTF-8"; f.open("w"); f.write(text); f.close(); }
    function r3(x) { return Math.round(x * 1000) / 1000; }
    function snapshot() { var o = [], i, it; for (i = 1; i <= app.project.numItems; i++) { it = app.project.item(i); o.push(it.name + ":" + (it instanceof CompItem ? it.numLayers : "-")); } return o.join("|"); }
    function dropMine(names) { for (var i = app.project.numItems; i >= 1; i--) { var it; try { it = app.project.item(i); } catch (e) { continue; } for (var n = 0; n < names.length; n++) if (it.name === names[n]) { try { it.remove(); } catch (e2) {} break; } } }
    var mods = ["core.jsx", "generator.jsx", "recognizer.jsx", "sfx.jsx", "tools.jsx", "app.jsx"], mi;
    for (mi = 0; mi < mods.length; mi++) $.evalFile(File(root.fsName + "/ae/noir/" + mods[mi]));
    var rep = { errors: [], sets: {} }, before = snapshot();
    try {
        dropMine(["NOIR selftest"]);
        var comp = app.project.items.addComp("NOIR selftest", 1080, 1920, 1, 20, 30);
        var v = comp.layers.addSolid([0.08, 0.08, 0.12], "stub-video", 1080, 1920, 1, 20); v.selected = true; comp.openInViewer();
        if (app.project.activeItem !== comp) throw new Error("активна не тестовая композиция — стоп");
        var inWords = [["Привет,", 1.0, 1.3], ["эээ", 1.35, 1.9], ["это", 3.0, 3.2], ["NOIR.", 3.2, 3.8], ["Ну", 4.0, 4.3], ["субтитры", 6.5, 7.1], ["сами", 7.1, 7.4], ["получаются", 7.4, 8.2]];
        var wo = function (a) { var o = [], k; for (k = 0; k < a.length; k++) o.push({ text: a[k][0], start: a[k][1], end: a[k][2] }); return o; };
        w("words.json", NOIR.stringify({ schema: "noir-captions/1", language: "ru", engine: { model: "small", device: "cpu" }, warnings: [], source: { file: root.fsName + "/stub.wav" }, segments: [{ words: wo(inWords.slice(0, 4)) }, { words: wo(inWords.slice(4)) }] }));
        var api = NOIR.createApp(root.fsName);
        api.call("json.load", { path: File(here.fsName + "/words.json").fsName });
        api.call("montage.apply", {});
        var caps = {}, q, L;
        for (q = 1; q <= comp.numLayers; q++) { L = comp.layer(q); if (NOIR.isGenerated(L)) caps[L.name] = L; }
        function only(target) { for (var i = 1; i <= comp.numLayers; i++) { var X = comp.layer(i); if (NOIR.isGenerated(X)) X.enabled = (X === target); } }
        function shoot(setName, target, times) {
            only(target); var list = [], i, t, f;
            for (i = 0; i < times.length; i++) {
                t = Math.max(0, times[i]); f = File(outDir.fsName + "/" + setName + "_" + (i < 10 ? "0" : "") + i + ".png"); f.remove();
                comp.time = t; comp.saveFrameToPng(t, f); for (var wt = 0; wt < 60 && !f.exists; wt++) $.sleep(200);
                list.push({ file: f.name, t: r3(t), saved: f.exists });
            }
            rep.sets[setName] = { layer: target.name, inPoint: r3(target.inPoint), outPoint: r3(target.outPoint), frames: list };
        }
        function range(a, b, step) { var o = [], x; for (x = a; x <= b + 1e-6; x += step) o.push(x); return o; }
        var first = caps["NOIR · ПРИВЕТ"], acc = caps["NOIR · NOIR"], long1 = caps["NOIR · СУБТИТРЫ САМИ"];
        rep.layerNames = []; for (var nm in caps) rep.layerNames.push(nm);
        if (!first || !acc || !long1) throw new Error("нет ожидаемых слоёв субтитров: " + rep.layerNames.join(", "));
        shoot("in", first, range(first.inPoint - 0.04, first.inPoint + 0.6, 0.04));
        shoot("accent", acc, range(acc.inPoint - 0.04, acc.inPoint + 0.6, 0.04));
        shoot("out", long1, range(long1.outPoint - 0.4, long1.outPoint, 0.04));
        shoot("center", long1, [long1.inPoint + 0.8]);
        shoot("center_first", first, [first.outPoint - 0.05]);
    } catch (e) { rep.errors.push(String(e && e.message || e) + (e && e.line ? " @" + e.line : "")); }
    dropMine(["NOIR selftest", "stub-video"]);
    rep.restored = snapshot() === before;
    w("frames_tmp/manifest.json", NOIR.stringify(rep));
})();
