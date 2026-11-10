// Real AE diagnostic: why caption text is not centered. Writes tests/ae_real/diag_center.json. Temporary comp is removed, project not saved.
(function () {
    var here = File($.fileName).parent, root = here.parent.parent;
    function r2(x) { return Math.round(x * 100) / 100; }
    function dropMine(names) { for (var i = app.project.numItems; i >= 1; i--) { var it; try { it = app.project.item(i); } catch (e) { continue; } for (var n = 0; n < names.length; n++) if (it.name === names[n]) { try { it.remove(); } catch (e2) {} break; } } }
    var mods = ["core.jsx", "generator.jsx", "recognizer.jsx", "sfx.jsx", "tools.jsx", "app.jsx"], mi, out = { errors: [] };
    for (mi = 0; mi < mods.length; mi++) $.evalFile(File(root.fsName + "/ae/noir/" + mods[mi]));
    try {
        dropMine(["NOIR selftest"]);
        var comp = app.project.items.addComp("NOIR selftest", 1080, 1920, 1, 20, 30);
        var v = comp.layers.addSolid([0.08, 0.08, 0.12], "stub-video", 1080, 1920, 1, 20); v.selected = true; comp.openInViewer();
        if (app.project.activeItem !== comp) throw new Error("активна не тестовая композиция — стоп, чтобы не тронуть проект");
        var wo = function (a) { var o = [], k; for (k = 0; k < a.length; k++) o.push({ text: a[k][0], start: a[k][1], end: a[k][2] }); return o; };
        var f = File(here.fsName + "/words.json"); f.encoding = "UTF-8"; f.open("w");
        f.write(NOIR.stringify({ schema: "noir-captions/1", language: "ru", engine: { model: "small", device: "cpu" }, warnings: [], source: { file: root.fsName + "/stub.wav" }, segments: [{ words: wo([["Привет,", 1.0, 1.3], ["эээ", 1.35, 1.9], ["это", 3.0, 3.2], ["NOIR.", 3.2, 3.8]]) }, { words: wo([["Ну", 4.0, 4.3], ["субтитры", 6.5, 7.1], ["сами", 7.1, 7.4], ["получаются", 7.4, 8.2]]) }] })); f.close();
        var api = NOIR.createApp(root.fsName); api.call("json.load", { path: File(here.fsName + "/words.json").fsName }); api.call("montage.apply", {});
        out.layers = [];
        for (var q = 1; q <= comp.numLayers; q++) {
            var L = comp.layer(q); if (!NOIR.isGenerated(L)) continue;
            var tr = L.property("Transform"), doc = L.property("Source Text").value, d = { name: L.name, justification: String(doc.justification), tracking: doc.tracking, fontSize: doc.fontSize, font: doc.font, text: doc.text, textLen: doc.text.length, endsWithSpace: /\s$/.test(doc.text), samples: [] };
            var ts = [L.inPoint, L.inPoint + 0.1, L.inPoint + 0.8], k;
            for (k = 0; k < ts.length; k++) { var t = ts[k]; if (t >= L.outPoint) continue; var rc = L.sourceRectAtTime(t, false); d.samples.push({ t: r2(t), rectL: r2(rc.left), rectW: r2(rc.width), rectCenter: r2(rc.left + rc.width / 2), anchor: tr.property("Anchor Point").valueAtTime(t, false), pos: tr.property("Position").valueAtTime(t, false), scale: tr.property("Scale").valueAtTime(t, false) }); }
            d.animators = []; try { var an = L.property("Text").property("Animators"); for (var a = 1; a <= an.numProperties; a++) d.animators.push(an.property(a).name); } catch (eA) {}
            try { var more = L.property("Text").property("More Options"); d.anchorGrouping = more.property("ADBE Text Anchor Point Option").value; d.groupAlign = more.property("ADBE Text Anchor Point Align").value; } catch (eM) {}
            out.layers.push(d);
        }
    } catch (e) { out.errors.push(String(e && e.message || e) + (e && e.line ? " @" + e.line : "")); }
    dropMine(["NOIR selftest", "stub-video"]);
    var o = File(here.fsName + "/diag_center.json"); o.encoding = "UTF-8"; o.open("w"); o.write(NOIR.stringify(out)); o.close();
})();
