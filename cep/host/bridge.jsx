/* NOIR Captions · bridge between the HTML panel and After Effects.
   One request = one operation of the host API (ae/noir/app.jsx); the reply is JSON: { ok, result, state } or { ok:false, error, state }.
   No hidden UI, no polling of controls: the panel owns its own interface. */
var NOIR_CEP = (function () {
    var hostFile = File($.fileName), api = null, root = "";
    var MODULES = ["core.jsx", "generator.jsx", "recognizer.jsx", "sfx.jsx", "tools.jsx", "app.jsx"];
    function fileText(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) throw new Error("Не удалось прочитать " + file.fsName);
        var text = file.read(); file.close(); return text.replace(/^﻿/, "").replace(/^\s+|\s+$/g, "");
    }
    function load(projectRoot) {
        root = projectRoot;
        for (var i = 0; i < MODULES.length; i++) {
            var f = File(root + "/ae/noir/" + MODULES[i]);
            if (!f.exists) throw new Error("Нет файла ae/noir/" + MODULES[i] + ". Обновите папку проекта (git pull).");
            $.evalFile(f);
        }
        api = NOIR.createApp(root);
        return open();
    }
    function ensure() {
        if (api) return;
        var config = File(hostFile.parent.parent.fsName + "/project-root.txt");
        var projectRoot = config.exists ? fileText(config) : app.settings.getSetting("NOIR Captions", "rootFolder");
        if (!File(projectRoot + "/ae/noir/app.jsx").exists) throw new Error("Папка проекта не найдена. Запустите scripts/install_cep_dev.ps1 из папки проекта.");
        load(projectRoot);
    }
    function quote(e) {
        var text = String(e && e.message ? e.message : e);
        return '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, " ") + '"';
    }
    function open() {
        try {
            ensure();
            return NOIR.stringify({ ok: true, result: { meta: api.call("meta"), presets: api.call("presets") }, state: api.state() });
        } catch (e) { return '{"ok":false,"error":' + quote(e) + "}"; }
    }
    function call(raw) {
        var command;
        try { ensure(); command = NOIR.parseJSON(raw); }
        catch (e0) { return '{"ok":false,"error":' + quote(e0) + "}"; }
        try {
            var result = api.call(command.op, command.args || {});
            return NOIR.stringify({ ok: true, result: result === undefined ? null : result, state: api.state() });
        } catch (e) {
            var state = "null";
            try { state = NOIR.stringify(api.state()); } catch (e2) {}
            return '{"ok":false,"error":' + quote(e) + ',"state":' + state + "}";
        }
    }
    return { open: open, call: call, load: load };
})();
