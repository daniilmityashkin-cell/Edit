// Host API (ae/noir/app.jsx) on the AE mock: every operation the HTML panel can call.
//   node tests/test_app.js
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const mock = require("./ae_mock");
const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "noir-app-"));
const env = mock.install({ temp: TMP, fonts: ["TimesNewRomanPSMT", "Inter-Bold", "Inter-SemiBold", "Montserrat-SemiBold", "ArialMT", "Arial-BoldMT"] });
for (const m of ["core.jsx", "generator.jsx", "recognizer.jsx", "sfx.jsx", "tools.jsx", "app.jsx"]) (0, eval)(fs.readFileSync(path.join(ROOT, "ae/noir", m), "utf8"));
const N = global.NOIR;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e.stack || e).toString().split("\n").slice(0, 4).join("\n       ")); }
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + " != " + b);
const sample = () => ({ schema: "noir-captions/1", language: "ru", engine: { model: "small", device: "cpu" }, warnings: [], source: { file: path.join(TMP, "clip.mp4") },
  segments: [{ words: [{ text: "Привет,", start: 1.0, end: 1.3 }, { text: "это", start: 1.35, end: 1.5 }, { text: "NOIR.", start: 1.5, end: 2.0 }] },
    { words: [{ text: "Субтитры", start: 3.0, end: 3.6 }, { text: "сами", start: 3.6, end: 3.9 }] }] });
const mkComp = (o) => { const c = new mock.CompItem(Object.assign({ _fonts: ["TimesNewRomanPSMT", "Inter-Bold", "Inter-SemiBold", "ArialMT"] }, o)); global.__installedFonts = c._fonts; global.app.project.activeItem = c; return c; };
const subs = (c) => c._l.filter(l => N.isGenerated(l));
function freshApp(data) {
  for (const k of Object.keys(env.settings)) delete env.settings[k];
  const a = N.createApp(ROOT);
  if (data !== false) {
    const jf = path.join(TMP, "in-" + Math.random().toString(36).slice(2) + ".json"); fs.writeFileSync(jf, JSON.stringify(data || sample()));
    a.call("json.load", { path: jf });
  }
  return a;
}
const accept = (a, mode) => { let r = a.call("generate", { mode: mode || "all" }); if (r && r.pending) r = a.call("generate", { mode: mode || "all", accept: true }); return r; };

(async () => {
  console.log("host API");
  await test("meta и стили: списки для интерфейса; стили валидны", () => {
    const a = freshApp(false), meta = a.call("meta");
    assert.ok(meta.version && meta.models.length && meta.animIn.length > 10 && meta.animOut.length > 10 && meta.formats.length >= 5 && meta.layerModes.length === 2);
    const ps = a.call("presets"); assert.ok(ps.length >= 20 && ps.every(p => p.id && p.name && p.base && p.accent && p.anim && p.layout));
    assert.ok(ps.some(p => p.id === "old-money"));
  });
  await test("состояние: без текста — пусто; после загрузки JSON — фразы, слова, текст", () => {
    const a = freshApp(false); let s = a.state(); assert.strictEqual(s.hasData, false); assert.deepStrictEqual(s.phrases, []);
    const b = freshApp(); s = b.state();
    assert.strictEqual(s.hasData, true); assert.strictEqual(s.phrases.length, 2); assert.deepStrictEqual(s.words.map(w => w.text), ["Привет,", "это", "NOIR."]);
    assert.ok(/Привет, это NOIR\./.test(s.text)); assert.strictEqual(s.dirty, false);
  });
  await test("распознать без выделенного слоя — понятная ошибка", () => {
    const a = freshApp(false); mkComp();
    assert.throws(() => a.call("recognize"), /Выделите|слой/);
  });
  await test("настройки: только разрешённые пути, значения приводятся к допустимым; правка стиля делает его «своим»", () => {
    const a = freshApp(false);
    a.call("preset.choose", { id: "old-money" }); assert.strictEqual(a.state().settings.presetId, "old-money");
    assert.strictEqual(a.call("settings.set", { path: "style.base.size", value: 99999 }), 2000);
    assert.strictEqual(a.state().settings.presetId, "", "правка стиля — уже свой стиль");
    assert.throws(() => a.call("settings.set", { path: "python2", value: "x" }), /нельзя/);
    assert.throws(() => a.call("settings.set", { path: "style.anim.animIn", value: "нет-такой" }), /анимации/);
    assert.deepStrictEqual(a.call("settings.set", { path: "style.accent.color", value: [2, -1, 0.5] }), [1, 0, 0.5]);
    a.call("settings.set", { path: "style.layout.accentPosY", value: 22 }); assert.strictEqual(a.state().settings.style.layout.accentPosY, 22);
    a.call("settings.set", { path: "style.layout.accentPosY", value: null }); assert.strictEqual(a.state().settings.style.layout.accentPosY, undefined);
    a.call("settings.set", { path: "style.base.shadow", value: true }); assert.ok(a.state().settings.style.base.shadow.softness > 0);
    const again = N.createApp(ROOT); assert.strictEqual(again.state().settings.style.base.size, 2000, "сохранено между запусками");
  });
  await test("шрифты: список семейств, выбор ставит шрифт первым и в «недавние»", () => {
    const a = freshApp(false), f = a.call("fonts", { query: "inter" });
    assert.ok(f.available && f.families.length >= 1 && f.families[0].styles.length >= 1);
    const fonts = a.call("font.set", { side: "base", ps: "Inter-Bold" }); assert.strictEqual(fonts[0], "Inter-Bold");
    assert.strictEqual(a.state().settings.recentFonts[0], "Inter-Bold");
    assert.throws(() => a.call("font.set", { side: "middle", ps: "x" }));
  });
  await test("стили: избранное, сохранить свой, экспорт и импорт файла", () => {
    const a = freshApp(false);
    assert.deepStrictEqual(a.call("preset.favorite", { id: "old-money" }), ["old-money"]); assert.deepStrictEqual(a.call("preset.favorite", { id: "old-money" }), []);
    const id = a.call("preset.save", { name: "Мой тест" }); assert.ok(/^user-/.test(id)); assert.ok(a.call("presets").some(p => p.id === id && p.user));
    const out = path.join(TMP, "style-export.json"); a.call("preset.export", { id: "old-money", path: out });
    const exported = JSON.parse(fs.readFileSync(out, "utf8")); assert.strictEqual(exported.schema, "noir-style/1"); assert.strictEqual(exported.user, undefined);
    exported.id = "shared"; exported.name = "Из файла"; fs.writeFileSync(out, JSON.stringify(exported));
    const imported = a.call("preset.import", { path: out }); assert.ok(a.call("presets").some(p => p.id === imported && p.name === "Из файла"));
    fs.writeFileSync(out, JSON.stringify({ hello: 1 })); assert.throws(() => a.call("preset.import", { path: out }), /не стиль/);
  });
  await test("создание: все фразы, повтор того же видео заменяет, ручной сдвиг сохраняется", () => {
    const c = mkComp(), a = freshApp();
    const r = accept(a); assert.ok(r.created > 0); const n = subs(c).length;
    subs(c).forEach(l => N.shiftLayer(l, 0, -200)); const ys = subs(c).map(l => N.baseOf(l)[1]).sort();
    accept(a); assert.strictEqual(subs(c).length, n, "не дублирует"); assert.deepStrictEqual(subs(c).map(l => N.baseOf(l)[1]).sort(), ys, "сдвиг сохранён");
    assert.strictEqual(a.state().canUpdate, true); assert.strictEqual(a.state().completed, 2);
  });
  await test("проверка перед созданием: замечания задерживают создание, «продолжить» создаёт", () => {
    const c = mkComp(), a = freshApp();
    a.call("settings.set", { path: "style.layout.posY", value: 99 });
    const first = a.call("generate", { mode: "all" }); assert.ok(first.pending && first.issues.length, "замечания"); assert.strictEqual(subs(c).length, 0);
    assert.ok(a.state().pending);
    a.call("generate", { mode: "all", accept: true }); assert.ok(subs(c).length > 0); assert.strictEqual(a.state().pending, false);
    const chk = a.call("generate", { mode: "check" }); assert.ok(chk.issues.length >= 1);
  });
  await test("обновить одну фразу: только её слои, остальные на месте; до создания — понятная ошибка", () => {
    const c = mkComp(), a = freshApp();
    assert.throws(() => a.call("generate", { mode: "phrase" }), /Сначала создайте/);
    accept(a); const other = subs(c).filter(l => N.groupInfo(l).segment === 1);
    a.call("text.set", { text: a.state().text.replace("Привет,", "Здравствуйте,") });
    assert.strictEqual(a.state().phraseDirty, true);
    accept(a, "phrase");
    assert.ok(other.every(l => c._l.includes(l)), "вторая фраза не тронута");
    assert.ok(subs(c).some(l => /Здравствуйте|ЗДРАВСТВУЙТЕ/.test(l.src.value.text)));
    assert.strictEqual(a.state().phraseDirty, false);
  });
  await test("распознавание (подмена): переход к фразе учитывает сдвиг и растяжение аудиослоя; текст не меняется; повторный запуск во время работы — ошибка", () => {
    const c = mkComp({ duration: 30 }), a = freshApp(false), audio = c.layers.addText("audio"); audio.startTime = 2; audio.stretch = 200;
    const keep = [N.getAudioSource, N.modelCached, N.startRecognition]; let cb;
    N.getAudioSource = () => ({ file: "x.wav" }); N.modelCached = () => true; N.startRecognition = (s, o, callbacks) => { cb = callbacks; };
    try {
      a.call("recognize"); assert.strictEqual(a.state().recognizing, true); assert.throws(() => a.call("recognize"), /уже идёт/);
      cb.onDone(sample(), { link: { compId: c.id, layerId: audio.id, layerIndex: audio.index, layerName: "audio", startTime: 0, stretch: 100 } });
    } finally { N.getAudioSource = keep[0]; N.modelCached = keep[1]; N.startRecognition = keep[2]; }
    assert.strictEqual(a.state().recognizing, false); const text = a.state().text;
    a.call("phrase.select", { index: 1, seek: true }); near(c.time, 2 + 3.0 * 2, 1e-6);
    assert.strictEqual(a.state().text, text);
  });
  await test("время в кадрах: шаг кратен кадру; субтитры другого видео не меняются", () => {
    const c = mkComp(), a = freshApp(); accept(a);
    const foreign = c.layers.addText("Чужой"); foreign.comment = N.LAYER_TAG + "|1|1|x-0|0||0|sOther"; foreign.inPoint = 0.2;
    const mine = subs(c).filter(l => N.layerSource(l) !== "sOther"), in0 = mine.map(l => l.inPoint);
    a.call("run", { command: { op: "time", shift: 1, frames: true, amount: 3 } });
    mine.forEach((l, i) => near(l.inPoint, in0[i] + 3 * c.frameDuration, 1e-6));
    assert.strictEqual(foreign.inPoint, 0.2);
  });
  await test("превью: отдельная композиция, исходник не меняется", () => {
    const c = mkComp({ duration: 12 }), a = freshApp(); let copy;
    c.duplicate = () => { copy = new mock.CompItem({ duration: 12 }); copy.openInViewer = () => { copy.opened = true; }; return copy; };
    const n = c.numLayers; a.call("generate", { mode: "preview" });
    assert.ok(copy && copy.opened); assert.strictEqual(c.numLayers, n); assert.ok(subs(copy).length > 0 && copy.workAreaDuration <= 5);
  });
  await test("правка слова по выделению в тексте: акцент, перенос, разделение; тайминги сохраняются; отмена", () => {
    const a = freshApp(), text = a.state().text, at = text.indexOf("это");
    a.call("word.edit", { kind: "accent", text, start: at, end: at + 3 });
    let t = a.state().text; assert.ok(t.includes("*это*")); assert.strictEqual(a.state().words[1].accent, true);
    a.call("word.edit", { kind: "line", text: t, start: t.indexOf("NOIR"), end: t.indexOf("NOIR") + 2 }); t = a.state().text; assert.ok(t.includes("↵"));
    a.call("word.edit", { kind: "phrase", text: t, start: t.indexOf("NOIR"), end: t.indexOf("NOIR") + 2 }); t = a.state().text; assert.ok(t.includes("|"));
    const words = N.applyEdits(sample(), t, []); assert.deepStrictEqual(words.map(w => [w.start, w.end]), N.flattenWords(sample()).map(w => [w.start, w.end]));
    assert.throws(() => a.call("word.edit", { kind: "accent", text: "другой", start: 0, end: 2 }), /изменился/);
    a.call("text.undo"); a.call("text.undo"); a.call("text.undo"); assert.strictEqual(a.state().text, text);
    assert.throws(() => a.call("text.undo"), /Нет правок/);
  });
  await test("слово заменяется с сохранением тайминга; фраза выбирается и время ставится на неё", () => {
    const c = mkComp(), a = freshApp();
    a.call("word.replace", { index: 1, text: "вот" }); assert.strictEqual(a.state().words[1].text, "вот");
    assert.throws(() => a.call("word.replace", { index: 1, text: "два слова" }), /Одно слово/);
    a.call("phrase.select", { index: 1, seek: true }); assert.strictEqual(a.state().phrase, 1); near(c.time, 3);
    assert.throws(() => a.call("phrase.select", { index: 7 }), /Нет такой фразы/);
  });
  await test("команды над готовыми субтитрами: положение, сдвиг, размер, время, анимация, стиль, исходные места, удаление", () => {
    const c = mkComp(), a = freshApp(); accept(a); const ls = subs(c);
    a.call("run", { command: { op: "place", y: 75 } }); assert.ok(ls.every(l => N.baseOf(l)[1] > c.height * 0.6));
    const y0 = N.baseOf(ls[0])[1]; a.call("run", { command: { op: "nudge", kx: 0, ky: -1, px: 30 } }); near(N.baseOf(ls[0])[1], y0 - 30);
    const s0 = ls[0].src.value.fontSize; a.call("run", { command: { op: "scale", factor: 1.5 } }); near(ls[0].src.value.fontSize, s0 * 1.5);
    assert.throws(() => a.call("run", { command: { op: "scale", factor: 9 } }), /множитель/);
    const in0 = ls[0].inPoint; a.call("run", { command: { op: "time", shift: 1, amount: 0.5 } }); near(ls[0].inPoint, in0 + 0.5);
    a.call("run", { command: { op: "animIn", id: "pop" } }); assert.strictEqual(a.state().settings.style.anim.animIn, "pop");
    a.call("run", { command: { op: "applyStyle" } });
    a.call("run", { command: { op: "resetPos" } }); assert.ok(ls.every(l => Math.abs(N.manualOffset(l)[1]) < 1e-6));
    assert.throws(() => a.call("run", { command: { op: "delete" } }), /подтвердить/);
    a.call("run", { command: { op: "delete", confirmed: true } }); assert.strictEqual(subs(c).length, 0);
    assert.throws(() => a.call("run", { command: { op: "hack" } }), /Неизвестная команда/);
  });
  await test("область «этого видео»: субтитры другого источника не меняются; «выделенные» — без выделения ошибка", () => {
    const c = mkComp(), a = freshApp(); accept(a);
    const foreign = c.layers.addText("Чужой"); foreign.comment = N.LAYER_TAG + "|1|1|x-0|0||0|sOther"; const fy = N.baseOf(foreign)[1];
    a.call("run", { command: { op: "place", y: 80 } }); assert.strictEqual(N.baseOf(foreign)[1], fy);
    a.call("run", { command: { op: "scope", id: "selected" } }); assert.throws(() => a.call("run", { command: { op: "place", y: 20 } }), /Выделите/);
    a.call("run", { command: { op: "scope", id: "all" } }); a.call("run", { command: { op: "place", y: 20 } }); assert.notStrictEqual(N.baseOf(foreign)[1], fy);
  });
  await test("лицо: поиск через Python (подмена), субтитры уходят с лица; не найдено и нет OpenCV — понятные сообщения", () => {
    const c = mkComp(), a = freshApp(); accept(a); const orig = N.faceScan;
    try {
      N.faceScan = (root, py, file, t, cb) => cb.onDone({ found: true, box: { x: 0.35, y: 0.3, w: 0.3, h: 0.2 } });
      a.call("run", { command: { op: "avoidFace" } }); assert.strictEqual(a.state().scanning, false); assert.ok(/Лицо найдено/.test(a.call("status")));
      const base = subs(c).filter(l => l.label !== 11); assert.ok(base.every(l => (N.baseOf(l)[1] - l.sourceRectAtTime().height / 2) / c.height >= 0.3 + 0.2 * 1.15 - 1e-9));
      N.faceScan = (root, py, file, t, cb) => cb.onDone({ found: false }); a.call("run", { command: { op: "faceScan" } }); assert.ok(/не найдено/.test(a.call("status")));
      N.faceScan = (root, py, file, t, cb) => cb.onError("Для поиска лица нужен OpenCV"); a.call("run", { command: { op: "faceScan" } }); assert.ok(/OpenCV/.test(a.call("status")));
      assert.ok(a.call("context").face.w > 0);
    } finally { N.faceScan = orig; }
  });
  await test("ключевые слова: выделяются в тексте как акценты", () => {
    const a = freshApp(); a.call("run", { command: { op: "keywords", words: ["NOIR", "субтитры"] } });
    assert.ok(/\*NOIR\.\*/.test(a.state().text) && /\*Субтитры\*/.test(a.state().text));
  });
  await test("«за человеком»: субтитры под выделенным слоем", () => {
    const c = mkComp(), a = freshApp(); accept(a);
    assert.throws(() => a.call("run", { command: { op: "behind" } }), /Выделите слой/);
    const vid = c.layers.addText("видео"); vid.selected = true; a.call("run", { command: { op: "behind" } });
    assert.ok(subs(c).every(l => l.index > vid.index));
  });
  await test("SRT и VTT: экспорт и обратный импорт сохраняют фразы и время", () => {
    const c = mkComp(), a = freshApp(), srt = path.join(TMP, "out.srt"), vtt = path.join(TMP, "out.vtt");
    a.call("subs.export", { format: "srt", path: srt }); a.call("subs.export", { format: "vtt", path: vtt });
    const s = fs.readFileSync(srt, "utf8"), v = fs.readFileSync(vtt, "utf8");
    assert.ok(/^1\n00:00:01,000 --> 00:00:0/.test(s) && /Привет,/.test(s) && /NOIR\./.test(s)); assert.ok(/^WEBVTT/.test(v) && /00:00:03\.000 --> /.test(v));
    const b = freshApp(false); b.call("subs.import", { path: srt });
    const st = b.state(); assert.ok(st.phrases.length >= 2); assert.strictEqual(st.words[0].text, "Привет,");
    const w = N.applyEdits(N.fromSubtitles(s), N.toEditorText(N.fromSubtitles(s)), []); near(w[0].start, 1, 1e-3);
    fs.writeFileSync(srt, "nothing here"); assert.throws(() => b.call("subs.import", { path: srt }), /нет субтитров/);
  });
  await test("безопасная зона: направляющий слой по формату, убирается; формат 9:16 угадывается", () => {
    const c = mkComp(), a = freshApp(false);
    const r = a.call("safe.guides", {}); assert.ok(/Reels/.test(r.name)); const g = c._l.find(l => l.comment === N.SAFE_TAG); assert.ok(g && g.guideLayer);
    a.call("safe.guides", { format: "tiktok" }); assert.strictEqual(c._l.filter(l => l.comment === N.SAFE_TAG).length, 1, "не копится");
    a.call("safe.guides", { remove: true }); assert.strictEqual(c._l.filter(l => l.comment === N.SAFE_TAG).length, 0);
    assert.strictEqual(N.formatFor(mkComp({ width: 1920, height: 1080 }), "auto").id, "wide");
  });
  await test("слои: сделать акцентом, применить шрифт ко всем, инверсия, перекладка — с понятными ошибками без выделения", () => {
    const c = mkComp(), a = freshApp(); accept(a);
    assert.throws(() => a.call("run", { command: { op: "makeAccent" } }), /Выделите/);
    const l = subs(c)[0]; l.selected = true; a.call("run", { command: { op: "makeAccent" } }); assert.strictEqual(l.label, 11);
    a.call("font.set", { side: "base", ps: "Inter-Bold" }); a.call("layers.apply", { side: "base", parts: { font: true }, all: true });
    assert.ok(subs(c).filter(x => x.label !== 11).every(x => x.src.value.font === "Inter-Bold"));
    assert.throws(() => a.call("layers.apply", { side: "base", parts: {} }), /Отметьте/);
    assert.strictEqual(a.call("layers.invert"), true); assert.strictEqual(a.call("layers.invert"), false);
    a.call("layers.reflow");
  });
  await test("выделение для круговой панели и контекст для ассистента", () => {
    const c = mkComp(), a = freshApp(); accept(a);
    assert.deepStrictEqual(a.call("selection"), { comp: true, text: 0, noir: 0, other: 0, name: c.name });
    subs(c)[0].selected = true; assert.strictEqual(a.call("selection").noir, 1);
    const ctx = a.call("context"); assert.ok(ctx.comp && ctx.subtitles.count > 0 && ctx.presets.length > 10 && /Привет/.test(ctx.textSample));
    global.app.project.activeItem = null; assert.strictEqual(a.call("selection").comp, false);
  });
  await test("звуки и функции: список, звук в текущее время без выбора — ошибка; счётчик и зачёркивание", () => {
    const c = mkComp(), a = freshApp(); accept(a);
    const lib = a.call("sfx.list"); assert.ok(Array.isArray(lib.names));
    assert.throws(() => a.call("sfx.here"), /Выберите звук/);
    a.call("tool.counter"); assert.ok(c._l.some(l => String(l.comment || "").indexOf(N.COUNTER_TAG) === 0));
    subs(c)[0].selected = true; assert.strictEqual(a.call("tool.strike"), 1); a.call("tool.strikeRemove");
  });
  await test("журнал: ошибки операций записываются", () => {
    const a = freshApp(false); try { a.call("run", { command: { op: "hack" } }); } catch (e) {}
    assert.ok(a.call("log").some(r => /hack/.test(r.text)));
    assert.throws(() => a.call("нет-такой"), /Неизвестная операция/);
  });

  console.log("bridge");
  await test("мост: open отдаёт метаданные, стили и состояние; ошибка — понятный текст и состояние", () => {
    global.$.fileName = path.join(ROOT, "cep/host/bridge.jsx");
    (0, eval)(fs.readFileSync(global.$.fileName, "utf8"));
    const opened = JSON.parse(global.NOIR_CEP.load(ROOT));
    assert.ok(opened.ok && opened.result.meta.version && opened.result.presets.length > 10 && opened.state);
    const bad = JSON.parse(global.NOIR_CEP.call(JSON.stringify({ op: "run", args: { command: { op: "scale", factor: 99 } } })));
    assert.strictEqual(bad.ok, false); assert.ok(/множитель|композицию/.test(bad.error)); assert.ok(bad.state);
    const good = JSON.parse(global.NOIR_CEP.call(JSON.stringify({ op: "settings.set", args: { path: "quick.size", value: 120 } })));
    assert.ok(good.ok && good.result === 120 && good.state.settings.quick.size === 120);
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
