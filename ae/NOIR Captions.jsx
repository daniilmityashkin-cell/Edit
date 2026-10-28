/*
 * NOIR CAPTIONS — загрузчик панели.
 *
 * Скопируйте ЭТОТ файл в папку
 *   C:\Program Files\Adobe\Adobe After Effects <версия>\Support Files\Scripts\ScriptUI Panels\
 * (или запустите scripts\install_panel.ps1), перезапустите AE и откройте
 *   Window > NOIR Captions.jsx
 * Панель можно пристыковать к любому месту интерфейса, как обычную.
 *
 * Сам код панели загружается из папки проекта (её спросят один раз),
 * поэтому после обновления (git pull) копировать файл заново не нужно.
 */
(function (thisObj) {
    var SECTION = "NOIR Captions", KEY = "rootFolder";
    var MODULES = ["core.jsx", "generator.jsx", "recognizer.jsx", "panel.jsx"];

    function valid(root) { return root && File(root + "/ae/noir/panel.jsx").exists; }

    var root = app.settings.haveSetting(SECTION, KEY) ? app.settings.getSetting(SECTION, KEY) : "";
    if (!valid(root)) {
        // Запуск прямо из репозитория (File > Scripts > Run Script File)
        var here = File($.fileName).parent.parent;
        if (valid(here.fsName)) root = here.fsName;
    }
    if (!valid(root)) {
        var f = Folder.selectDialog("NOIR Captions: укажите папку проекта (где лежат ae, recognition)");
        if (!f || !valid(f.fsName)) {
            alert("Папка проекта NOIR Captions не найдена (нужен файл ae/noir/panel.jsx).", SECTION);
            return;
        }
        root = f.fsName;
    }
    app.settings.saveSetting(SECTION, KEY, root);

    try {
        for (var i = 0; i < MODULES.length; i++) $.evalFile(File(root + "/ae/noir/" + MODULES[i]));
        $.global.NOIR.buildPanel(thisObj, root);
    } catch (e) {
        alert("Ошибка загрузки NOIR Captions: " + e.toString() +
            (e.line ? "\nстрока " + e.line : "") + (e.fileName ? "\n" + e.fileName : ""), SECTION);
    }
})(this);
