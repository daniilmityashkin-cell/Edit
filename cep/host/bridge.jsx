/* HTML view of the existing panel: all editing, Python jobs and AE actions stay in panel.jsx. */
var NOIR_CEP = (function () {
    var hostFile = File($.fileName), win = null, nodes = [], last = {}, root = "";
    function fileText(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) throw new Error("Не удалось прочитать " + file.fsName);
        var text = file.read(); file.close(); return text.replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "");
    }
    function load(projectRoot) {
        root = projectRoot;
        var modules = ["core.jsx", "generator.jsx", "recognizer.jsx", "panel.jsx"];
        for (var i = 0; i < modules.length; i++) $.evalFile(File(root + "/ae/noir/" + modules[i]));
        win = NOIR.buildPanel(null, root, {headless:true}); nodes = []; last = {};
        return snapshot(true);
    }
    function ensure() {
        if (win) return;
        var config = File(hostFile.parent.parent.fsName + "/project-root.txt");
        var projectRoot = config.exists ? fileText(config) : app.settings.getSetting("NOIR Captions", "rootFolder");
        if (!File(projectRoot + "/ae/noir/panel.jsx").exists) throw new Error("Папка проекта не найдена. Запустите scripts/install_cep_dev.ps1 из папки Edit.");
        load(projectRoot);
    }
    function walk(el, parentId, result) {
        if (!el._cepId) { el._cepId = String(nodes.length + 1); nodes.push(el); }
        var id = el._cepId;
        var type = el._scrub ? "number" : el.type;
        var node = {id:id,parent:parentId,type:type,text:String(el.text || ""),visible:el._cepVisible !== false,
            enabled:el.enabled !== false,orientation:el.orientation || "column",tip:el.helpTip || "",role:el._cepRole || "",preview:el._cepPreview || null,scroll:!!el._noirScrollBody,tabs:!!el._noirTabBar,tabSelected:!!el._noirTabSelected};
        if (type === "checkbox" || type === "radiobutton") node.value = !!el.value;
        if (type === "progressbar") node.value = el.value || 0;
        if (type === "edittext") node.multiline = !!(el.properties && el.properties.multiline);
        if (type === "number") { node.min = el._scrub.min; node.max = el._scrub.max; node.step = el._scrub.step; }
        if (type === "dropdownlist") {
            node.items = [];
            for (var i = 0; i < el.items.length; i++) node.items.push(String(el.items[i].text));
            node.selected = el.selection ? el.selection.index : -1;
        }
        var encoded = NOIR.stringify(node);
        if (result.full || last[id] !== encoded) result.nodes.push(node);
        last[id] = encoded;
        if (el.children) for (var j = 0; j < el.children.length; j++) walk(el.children[j], id, result);
    }
    function snapshot(full) {
        // No wrapping below the main tabs. HTML supplies horizontal overflow if necessary.
        // HTML owns layout; polling must never rebuild native dropdowns or repaint tabs.
        var result = {full:!!full,nodes:[],version:"0.11.0",workflow:win._cep.workflow()};
        walk(win, null, result);
        return NOIR.stringify(result);
    }
    function open() {
        try { ensure(); last = {}; return snapshot(true); }
        catch (e) { return '{"error":' + quoteError(e) + '}'; }
    }
    function quoteError(e) {
        var text = String(e.message || e);
        return '"' + text.replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\r/g,"\\r").replace(/\n/g,"\\n") + '"';
    }
    function request(raw) {
        try {
            ensure();
            var command = NOIR.parseJSON(raw);
            if (command.action === "poll") return snapshot(false);
            if (command.action === "wordEdit") { win._cep.wordEdit(command); return snapshot(false); }
            if (command.action === "selectTextPhrase") { win._cep.selectTextPhrase(Number(command.index)); return snapshot(false); }
            if (command.action === "continueGeneration") { win._cep.continueGeneration(); return snapshot(false); }
            if (command.action === "removePreviews") {
                var count = 0;
                app.beginUndoGroup("NOIR: удалить старые примеры");
                try {
                    for (var pi = app.project.numItems; pi >= 1; pi--) {
                        var item = app.project.item(pi), name = String(item.name || "");
                        if (item instanceof CompItem && (!item.usedIn || !item.usedIn.length) && (name.indexOf("NOIR Preview · ") === 0 || name === "NOIR · Галерея стилей")) {
                            item.remove(); count++;
                        }
                    }
                } finally { app.endUndoGroup(); }
                var reply = NOIR.parseJSON(snapshot(false)); reply.notice = "Удалено NOIR-превью: " + count + ". Можно отменить через Ctrl+Z.";
                return NOIR.stringify(reply);
            }
            var el = nodes[Number(command.id) - 1];
            if (!el || el.enabled === false) throw new Error("Элемент панели недоступен.");
            if (command.action === "set" || (command.action === "click" && el.type !== "button" && el._cepRole !== "fontTargetBase" && el._cepRole !== "fontTargetAccent") || el._cepPreview) win._cep.clearIssues();
            if (command.action === "click") {
                if (el.type === "checkbox" || el.type === "radiobutton") el.value = !!command.value;
                if (el.onClick) el.onClick.call(el);
            } else if (command.action === "set") {
                if (el.type === "dropdownlist") {
                    var index = Number(command.value);
                    if (index < 0 || index >= el.items.length) throw new Error("Нет такого пункта списка.");
                    var handler = el.onChange; el.onChange = null;
                    try { el.selection = index; } finally { el.onChange = handler; }
                } else el.text = String(command.value);
                if (el.onChange) el.onChange.call(el);
                else if (el.onChanging) el.onChanging.call(el);
            } else throw new Error("Неизвестная команда панели.");
            return snapshot(false);
        } catch (e) { return '{"error":' + quoteError(e) + '}'; }
    }
    return {open:open,request:request,load:load};
})();
