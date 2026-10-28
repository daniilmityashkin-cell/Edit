/*
 * NOIR CAPTIONS — запуск локального распознавания из AE.
 *
 * AE пишет job.json, запускает Python в фоне (AE не зависает),
 * раз в 0.5 с читает status.json через app.scheduleTask.
 * Требует: Edit > Preferences > Scripting & Expressions >
 *          Allow Scripts to Write Files and Access Network.
 */
var NOIR = (function (g) { g.NOIR = g.NOIR || {}; return g.NOIR; })(
    typeof $ !== "undefined" && $.global ? $.global : this);

(function (N) {
    var isWin = $.os.indexOf("Windows") !== -1;

    // Модели faster-whisper и их папки в кэше Hugging Face.
    N.MODELS = [
        { id: "large-v3", label: "large-v3 — максимум точности (~3 ГБ)", repo: "Systran--faster-whisper-large-v3" },
        { id: "large-v3-turbo", label: "large-v3-turbo — быстрее (~1.6 ГБ)", repo: "mobiuslabsgmbh--faster-whisper-large-v3-turbo" },
        { id: "medium", label: "medium (~1.5 ГБ)", repo: "Systran--faster-whisper-medium" },
        { id: "small", label: "small — быстро, для слабых ПК (~0.5 ГБ)", repo: "Systran--faster-whisper-small" }
    ];

    N.modelCached = function (modelId) {
        var repo = null;
        for (var i = 0; i < N.MODELS.length; i++) if (N.MODELS[i].id === modelId) repo = N.MODELS[i].repo;
        if (!repo) return false;
        var hfHome = $.getenv("HF_HOME");
        var hub = hfHome ? hfHome + "/hub"
            : (isWin ? $.getenv("USERPROFILE") : $.getenv("HOME")) + "/.cache/huggingface/hub";
        return Folder(hub + "/models--" + repo + "/snapshots").exists;
    };

    N.pythonPath = function (root, override) {
        if (override) return override;
        return root + (isWin ? "/.venv/Scripts/python.exe" : "/.venv/bin/python");
    };

    function readText(file) {
        if (!file.exists) return null;
        file.encoding = "UTF-8";
        if (!file.open("r")) return null;
        var s = file.read();
        file.close();
        return s;
    }
    N.readText = readText;

    N.writeText = function (file, text) {
        file.encoding = "UTF-8";
        file.lineFeed = "Unix";
        if (!file.open("w")) throw new Error("Не удалось записать файл: " + file.fsName +
            "\nВключите Preferences > Scripting & Expressions > Allow Scripts to Write Files.");
        file.write(text);
        file.close();
    };

    // Выделенный слой -> что распознавать. Бросает понятную ошибку.
    N.getAudioSource = function () {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) throw new Error("Откройте композицию и выделите слой со звуком.");
        var sel = comp.selectedLayers;
        if (sel.length !== 1) throw new Error("Выделите ровно один слой со звуком (аудио или видео).");
        var layer = sel[0];
        if (!(layer instanceof AVLayer) || !layer.hasAudio)
            throw new Error("У слоя «" + layer.name + "» нет звука.");
        var src = layer.source;
        if (!(src instanceof FootageItem) || !src.mainSource || !src.mainSource.file)
            throw new Error("Слой «" + layer.name + "» — прекомпозиция или не файл. " +
                "Пока поддерживаются слои с аудио/видеофайлом.");
        if (!src.mainSource.file.exists) throw new Error("Файл слоя не найден: " + src.mainSource.file.fsName);
        if (layer.timeRemapEnabled) throw new Error("У слоя включён Time Remap — пока не поддерживается.");
        if (layer.stretch <= 0) throw new Error("Обратная скорость слоя (stretch < 0) не поддерживается.");

        // Распознаём только видимую на таймлайне часть слоя (в секундах файла).
        var tIn = Math.max(layer.inPoint, 0), tOut = Math.min(layer.outPoint, comp.duration);
        return {
            comp: comp, layer: layer, file: src.mainSource.file,
            srcStart: Math.max(0, N.compToSource(tIn, layer.startTime, layer.stretch)),
            srcEnd: N.compToSource(tOut, layer.startTime, layer.stretch),
            link: { compId: comp.id, layerName: layer.name, layerIndex: layer.index,
                startTime: layer.startTime, stretch: layer.stretch }
        };
    };

    N.job = null;

    // opts: root, python, model, language, device, prompt; cb: {onStatus, onDone, onError}
    N.startRecognition = function (src, opts, cb) {
        if (N.job) throw new Error("Распознавание уже идёт.");
        var py = File(N.pythonPath(opts.root, opts.python));
        if (!py.exists) throw new Error("Python не найден: " + py.fsName +
            "\nЗапустите установку: recognition\\setup_windows.ps1 (см. README).");
        var script = File(opts.root + "/recognition/noir_recognize.py");
        if (!script.exists) throw new Error("Не найден " + script.fsName);

        var dir = Folder(Folder.temp.fsName + "/NOIR_Captions");
        if (!dir.exists) dir.create();
        var id = String(new Date().getTime());
        var f = {
            job: File(dir.fsName + "/job_" + id + ".json"),
            out: File(dir.fsName + "/result_" + id + ".json"),
            status: File(dir.fsName + "/status_" + id + ".json"),
            log: File(dir.fsName + "/log_" + id + ".txt"),
            cmd: File(dir.fsName + "/run_" + id + (isWin ? ".cmd" : ".sh"))
        };
        N.writeText(f.job, N.stringify({
            input: src.file.fsName, output: f.out.fsName, status: f.status.fsName,
            model: opts.model, language: opts.language, device: opts.device,
            start: src.srcStart, end: src.srcEnd, prompt: opts.prompt || ""
        }));

        var line = '"' + py.fsName + '" "' + script.fsName + '" --job "' + f.job.fsName +
            '" > "' + f.log.fsName + '" 2>&1';
        if (isWin) {
            N.writeText(f.cmd, "@echo off\r\n" + line + "\r\n");
            system.callSystem('cmd.exe /c start "NOIR Captions" /min "' + f.cmd.fsName + '"');
        } else {
            N.writeText(f.cmd, "#!/bin/sh\n" + line + "\n");
            system.callSystem('/bin/sh -c \'/bin/sh "' + f.cmd.fsName + '" >/dev/null 2>&1 &\'');
        }

        N.job = { files: f, src: src, cb: cb, started: new Date().getTime(), pid: null, lastState: "" };
        N.job.task = app.scheduleTask("NOIR.poll()", 500, true);
        cb.onStatus({ state: "starting", message: "Запуск Python…" });
    };

    function finish() {
        var j = N.job;
        if (!j) return null;
        try { app.cancelTask(j.task); } catch (e) {}
        N.job = null;
        return j;
    }

    N.poll = function () {
        var j = N.job;
        if (!j) return;
        try {
            var txt = readText(j.files.status);
            if (txt === null) {
                if (new Date().getTime() - j.started > 60000) {
                    var log = readText(j.files.log) || "";
                    finish();
                    j.cb.onError("Python не запустился за 60 с.\n" + log.slice(-800) +
                        "\nЛог: " + j.files.log.fsName);
                }
                return;
            }
            var st;
            try { st = N.parseJSON(txt); } catch (e) { return; } // файл в процессе записи
            if (st.pid) j.pid = st.pid;
            if (st.state === "done") {
                var data = N.parseJSON(readText(j.files.out));
                finish();
                j.cb.onDone(data, j.src, j.files.out);
            } else if (st.state === "error") {
                finish();
                j.cb.onError(st.message + "\nЛог: " + j.files.log.fsName);
            } else {
                j.cb.onStatus(st);
            }
        } catch (e) {
            finish();
            j.cb.onError("Ошибка опроса: " + e.toString());
        }
    };

    N.cancelRecognition = function () {
        var j = finish();
        if (j && j.pid) {
            if (isWin) system.callSystem("taskkill /PID " + j.pid + " /T /F");
            else system.callSystem("kill " + j.pid);
        }
        return !!j;
    };
})(NOIR);
