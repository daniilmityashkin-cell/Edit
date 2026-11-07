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

    // Модель считается скачанной, только если есть model.bin: в кеше Hugging Face
    // папка snapshots появляется ещё до окончания загрузки.
    N.modelCached = function (modelId) {
        var repo = null;
        for (var i = 0; i < N.MODELS.length; i++) if (N.MODELS[i].id === modelId) repo = N.MODELS[i].repo;
        if (!repo) return false;
        var hfHome = $.getenv("HF_HOME");
        var hub = hfHome ? hfHome + "/hub"
            : (isWin ? $.getenv("USERPROFILE") : $.getenv("HOME")) + "/.cache/huggingface/hub";
        var snaps = Folder(hub + "/models--" + repo + "/snapshots");
        if (!snaps.exists) return false;
        var dirs = snaps.getFiles();
        for (var d = 0; d < dirs.length; d++) {
            if (File(dirs[d].fsName + "/model.bin").exists) return true;
        }
        return false;
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

    N.previewAudio = function (root, override, source, start, end) {
        if (!isWin) throw new Error("Прослушивание из панели поддерживается на Windows.");
        if (N.audioPreview) throw new Error("Дождитесь подготовки предыдущей фразы.");
        var py = File(N.pythonPath(root, override));
        if (!py.exists || !File(source).exists) throw new Error("Не найден Python или исходный аудиофайл.");
        var dir = Folder(Folder.temp.fsName + "/NOIR_Captions"); if (!dir.exists) dir.create();
        var base = dir.fsName + "/audio_" + new Date().getTime();
        var job = File(base + ".json"), status = File(base + "_status.json"), vbs = File(base + ".vbs");
        N.writeText(job, N.stringify({input: source, output: base + ".wav", start: start, end: end, status: status.fsName}));
        var command = '"' + py.fsName + '" "' + root + '/recognition/preview_audio.py" "' + job.fsName + '"';
        N.writeText(vbs, 'CreateObject("WScript.Shell").Run "' + command.replace(/"/g, '""') + '", 0, False\r\n');
        if (!vbs.execute()) throw new Error("Не удалось запустить прослушивание.");
        N.audioPreview = {status: status, started: new Date().getTime()};
        N.audioPreview.task = app.scheduleTask("NOIR.pollAudioPreview()", 500, true);
    };
    // Поиск лица на одном кадре исходного видео (OpenCV, только на этом компьютере). cb: {onDone(result), onError(text)}.
    N.faceScan = function (root, override, source, timeSec, cb) {
        if (!isWin) { cb.onError("Поиск лица из панели поддерживается на Windows."); return; }
        if (N.faceJob) { cb.onError("Поиск лица уже идёт."); return; }
        var py = File(N.pythonPath(root, override)), script = File(root + "/recognition/face_box.py");
        if (!py.exists || !File(source).exists || !script.exists) { cb.onError("Не найден Python, видеофайл или recognition/face_box.py."); return; }
        var dir = Folder(Folder.temp.fsName + "/NOIR_Captions"); if (!dir.exists) dir.create();
        var base = dir.fsName + "/face_" + new Date().getTime();
        var job = File(base + ".json"), status = File(base + "_status.json"), vbs = File(base + ".vbs");
        N.writeText(job, N.stringify({ input: source, time: timeSec, status: status.fsName }));
        var command = '"' + py.fsName + '" "' + script.fsName + '" "' + job.fsName + '"';
        N.writeText(vbs, 'CreateObject("WScript.Shell").Run "' + command.replace(/"/g, '""') + '", 0, False\r\n');
        if (!vbs.execute()) { cb.onError("Не удалось запустить поиск лица."); return; }
        N.faceJob = { status: status, started: new Date().getTime(), cb: cb };
        N.faceJob.task = app.scheduleTask("NOIR.pollFaceScan()", 500, true);
    };
    N.pollFaceScan = function () {
        var j = N.faceJob; if (!j) return;
        try {
            var text = readText(j.status);
            if (text === null) {
                if (new Date().getTime() - j.started < 90000) return;
                app.cancelTask(j.task); N.faceJob = null; j.cb.onError("Поиск лица занял больше 90 секунд."); return;
            }
            var result; try { result = N.parseJSON(text); } catch (e0) { return; }     // файл ещё пишется
            app.cancelTask(j.task); N.faceJob = null;
            if (result.state === "error") j.cb.onError(result.message); else j.cb.onDone(result);
        } catch (e) { try { app.cancelTask(j.task); } catch (e2) {} N.faceJob = null; j.cb.onError(String(e)); }
    };
    N.pollAudioPreview = function () {
        var job = N.audioPreview; if (!job) return;
        try {
            var text = readText(job.status);
            if (text === null && new Date().getTime() - job.started < 60000) return;
            var result = text === null ? {state: "error", message: "Подготовка аудио заняла больше минуты."} : N.parseJSON(text);
            app.cancelTask(job.task); N.audioPreview = null;
            if (result.state === "error") alert(result.message, "NOIR: прослушивание");
        } catch (e) {
            app.cancelTask(job.task); N.audioPreview = null;
            alert(e.message, "NOIR: прослушивание");
        }
    };

    // Выделенный слой -> что распознавать. Бросает понятную ошибку.
    N.getAudioSource = function () {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) throw new Error("Откройте композицию и выделите слой со звуком.");
        var sel = comp.selectedLayers;
        if (sel.length !== 1) throw new Error("Выделите ровно один слой со звуком (аудио или видео).");
        return N.audioSourceOf(comp, sel[0]);
    };
    // Для пакетной обработки: слой со звуком из файла, который виден дольше всех (при равенстве — нижний).
    N.autoAudioLayer = function (comp) {
        var best = null, bestLen = -1;
        for (var i = comp.numLayers; i >= 1; i--) {
            var l = comp.layer(i);
            if (!(l instanceof AVLayer) || !l.hasAudio || l.audioEnabled === false || N.isGenerated(l)) continue;
            var s = l.source;
            if (!(s instanceof FootageItem) || !s.mainSource || !s.mainSource.file) continue;
            var len = Math.min(l.outPoint, comp.duration) - Math.max(l.inPoint, 0);
            if (len > bestLen + 1e-6) { best = l; bestLen = len; }
        }
        return best;
    };
    N.audioSourceOf = function (comp, layer) {
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
        var layerId = 0;
        try { layerId = layer.id || 0; } catch (eId) {}   // Layer.id есть с AE 2022
        return {
            comp: comp, layer: layer, file: src.mainSource.file,
            srcStart: Math.max(0, N.compToSource(tIn, layer.startTime, layer.stretch)),
            srcEnd: N.compToSource(tOut, layer.startTime, layer.stretch),
            link: { compId: comp.id, layerName: layer.name, layerIndex: layer.index, layerId: layerId,
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
            // НЕ system.callSystem: он ждёт закрытия канала вывода, который наследует Python,
            // и AE зависает на всё время распознавания. File.execute() запускает и сразу возвращается;
            // .vbs запускает .cmd в скрытом окне.
            N.writeText(f.cmd, "@echo off\r\n" + line + "\r\n");
            var vbs = File(dir.fsName + "/run_" + id + ".vbs");
            N.writeText(vbs, 'CreateObject("WScript.Shell").Run "cmd /c ""' + f.cmd.fsName + '""", 0, False\r\n');
            if (!vbs.execute() && !f.cmd.execute()) throw new Error("Не удалось запустить Python (File.execute).");
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
