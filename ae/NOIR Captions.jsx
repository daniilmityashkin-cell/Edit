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
        var f = Folder.selectDialog("NOIR Captions: выберите папку проекта — ту, куда делали git clone " +
            "(обычно C:\\Users\\<имя>\\edit). Путь можно вписать в поле «Папка» внизу.");
        if (!f) return;
        // выбрали папку ae или ae/noir внутри проекта — поднимемся выше
        var probe = f;
        for (var up = 0; up < 2 && probe && !valid(probe.fsName); up++) probe = probe.parent;
        if (!probe || !valid(probe.fsName)) {
            alert("В папке\n" + f.fsName + "\nнет файла ae\\noir\\panel.jsx.\n\n" +
                "1) Выберите папку, куда делали git clone (например C:\\Users\\<имя>\\edit).\n" +
                "2) Если папка верная — выполните в ней: git pull (ветка noir-captions-stage1).", SECTION);
            return;
        }
        root = probe.fsName;
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
