// Тесты NOIR CAPTIONS в Node.
//   node tests/run_tests.js            — логика + панель на моке AE
//   NOIR_PYTHON=.venv/bin/python NOIR_MEDIA=clip.mp4 node tests/run_tests.js
//                                      — плюс сквозной тест: панель -> Python -> слои
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");
const mock = require("./ae_mock");

const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "noir-test-"));
const env = mock.install({ temp: TMP, fonts: ["TimesNewRomanPSMT", "Inter-Bold"] });
for (const m of ["core.jsx", "generator.jsx", "recognizer.jsx", "panel.jsx"])
  (0, eval)(fs.readFileSync(path.join(ROOT, "ae/noir", m), "utf8"));
const N = global.NOIR;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e.stack || e).toString().split("\n").slice(0, 3).join("\n       ")); }
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + " != " + b);

function sample() {
  return {
    schema: "noir-captions/1", language: "ru", engine: { model: "small", device: "cpu" }, warnings: [],
    segments: [
      { words: [{ text: "Привет,", start: 1.0, end: 1.3 }, { text: "это", start: 1.35, end: 1.5 }, { text: "NOIR.", start: 1.5, end: 2.0 }] },
      { words: [{ text: "Субтитры", start: 3.0, end: 3.6 }, { text: "сами", start: 3.6, end: 3.9 }] },
    ],
  };
}

(async () => {
  console.log("core");
  await test("JSON round-trip с кириллицей и спецсимволами", () => {
    const o = { a: "Привет \"мир\"\n\\", b: [1, 2.5, -3e-4, true, null], c: { d: "ё" } };
    assert.deepStrictEqual(N.parseJSON(N.stringify(o)), o);
    assert.deepStrictEqual(N.parseJSON(JSON.stringify(o)), o);
  });
  await test("parseJSON отвергает код", () => {
    assert.throws(() => N.parseJSON('{"a": alert(1)}'));
    assert.throws(() => N.parseJSON("(function(){})()"));
  });
  await test("toEditorText / applyEdits без изменений сохраняет тайминги", () => {
    const d = sample(), w = [];
    const words = N.applyEdits(d, N.toEditorText(d), w);
    assert.strictEqual(words.length, 5); assert.strictEqual(w.length, 0);
    near(words[2].start, 1.5); assert.strictEqual(words[2].text, "NOIR.");
  });
  await test("исправление слова сохраняет тайминг", () => {
    const d = sample(), w = [];
    const words = N.applyEdits(d, "Привет, это НУАР.\nСубтитры сами", w);
    assert.strictEqual(words[2].text, "НУАР."); near(words[2].start, 1.5); assert.strictEqual(w.length, 0);
  });
  await test("изменение числа слов -> пропорционально + предупреждение", () => {
    const d = sample(), w = [];
    const words = N.applyEdits(d, "Привет, это NOIR.\nСубтитры делаются сами", w);
    assert.strictEqual(words.length, 6); assert.strictEqual(w.length, 1);
    near(words[3].start, 3.0); near(words[5].end, 3.9);
    for (let i = 4; i < 6; i++) assert.ok(words[i].start >= words[i - 1].end - 1e-9);
  });
  await test("удаление строки целиком (очистка) и защита от удаления строк", () => {
    const d = sample(), w = [];
    assert.strictEqual(N.applyEdits(d, "Привет, это NOIR.\n", w).length, 3);
    assert.throws(() => N.applyEdits(d, "одна строка", w));
  });
  await test("groupWords: 1 слово, капс, без пунктуации", () => {
    const g = N.groupWords(N.flattenWords(sample()), { maxWords: 1, maxChars: 99, pauseBreak: 0.35, punctBreak: true, stripPunct: true, caps: true });
    assert.deepStrictEqual(g.map(x => x.text), ["ПРИВЕТ", "ЭТО", "NOIR", "СУБТИТРЫ", "САМИ"]);
  });
  await test("groupWords: до 3 слов, разрыв на запятой и паузе", () => {
    const g = N.groupWords(N.flattenWords(sample()), { maxWords: 3, maxChars: 99, pauseBreak: 0.35, punctBreak: true, stripPunct: false, caps: false });
    assert.deepStrictEqual(g.map(x => x.text), ["Привет,", "это NOIR.", "Субтитры сами"]);
  });
  await test("groupWords: лимит символов", () => {
    const g = N.groupWords(N.flattenWords(sample()), { maxWords: 9, maxChars: 10, pauseBreak: 9, punctBreak: false, stripPunct: false, caps: false });
    assert.ok(g.every(x => x.text.length <= 10 || x.words.length === 1));
  });
  await test("timeGroups: короткая пауза заполняется, длинная нет, end > start", () => {
    const g = N.timeGroups(N.groupWords(N.flattenWords(sample()), { maxWords: 1, maxChars: 99, pauseBreak: 9, punctBreak: false, stripPunct: false, caps: false }), 0.3, 0.08);
    near(g[0].outTime, 1.35); near(g[2].outTime, 2.0);
    g.forEach(x => assert.ok(x.outTime > x.start));
  });
  await test("sourceToComp / compToSource с растяжением", () => {
    near(N.sourceToComp(2, 5, 50), 6); near(N.compToSource(6, 5, 50), 2);
  });

  console.log("generator (мок AE)");
  const mkComp = (o) => { const c = new mock.CompItem(Object.assign({ _fonts: ["TimesNewRomanPSMT"] }, o)); global.app.project.activeItem = c; return c; };
  const style = { font: "TimesNewRomanPSMT", fontSize: 200, color: [1, 0, 0], tracking: 0, strokeWidth: 0, strokeColor: [0, 0, 0], posX: 50, posY: 18, safeWidth: 0.9 };
  const groupsFrom = (d, opts) => N.timeGroups(N.groupWords(N.flattenWords(d), Object.assign({ maxWords: 1, maxChars: 99, pauseBreak: 0.35, punctBreak: true, stripPunct: true, caps: true }, opts)), 0.3, 0.08)
    .map(g => Object.assign(g, { compStart: g.start, compOut: g.outTime }));
  for (const a of N.ANIM_IN) for (const b of N.ANIM_OUT) {
    await test(`анимация ${a.id} -> ${b.id}: ключи внутри слоя, по возрастанию`, () => {
      const c = mkComp(); const r = N.generate(c, groupsFrom(sample()), style, { animIn: a.id, animOut: b.id, inDur: 0.25, outDur: 0.2, distance: 80, easeInfluence: 80 }, true);
      assert.strictEqual(r.created, 5);
      for (const l of c._l) for (const p of Object.values(l.transform)) {
        for (let i = 0; i < p.keys.length; i++) {
          assert.ok(p.keys[i].t >= l.inPoint - 1e-9 && p.keys[i].t <= l.outPoint + 1e-9, "key outside layer");
          if (i) assert.ok(p.keys[i].t > p.keys[i - 1].t);
        }
        if (a.id === "none" && b.id === "none") assert.strictEqual(p.keys.length, 0);
      }
    });
  }
  await test("очень короткое слово: вход+выход ужаты", () => {
    const c = mkComp(); const d = { segments: [{ words: [{ text: "и", start: 1, end: 1.05 }] }] };
    N.generate(c, groupsFrom(d), style, { animIn: "pop", animOut: "fade", inDur: 0.3, outDur: 0.3, distance: 80, easeInfluence: 80 }, true);
    const l = c._l[0]; const op = l.transform.Opacity.keys;
    assert.ok(op[op.length - 1].t <= l.outPoint + 1e-9); assert.ok(l.outPoint - l.inPoint >= 0.08 - 1e-9);
  });
  await test("повторная генерация заменяет только свои слои", () => {
    const c = mkComp(); const user = new mock.AVLayer(c, "Мой слой"); c._l.push(user);
    N.generate(c, groupsFrom(sample()), style, { animIn: "fade", animOut: "none", inDur: 0.2, outDur: 0, distance: 0, easeInfluence: 80 }, true);
    const r = N.generate(c, groupsFrom(sample()), style, { animIn: "fade", animOut: "none", inDur: 0.2, outDur: 0, distance: 0, easeInfluence: 80 }, true);
    assert.strictEqual(r.removed, 5); assert.strictEqual(c.numLayers, 6); assert.ok(c._l.includes(user));
  });
  await test("нет шрифта -> предупреждение, слой создан", () => {
    const c = mkComp(); const r = N.generate(c, groupsFrom(sample()), Object.assign({}, style, { font: "NoSuchFont" }), { animIn: "none", animOut: "none" }, true);
    assert.strictEqual(r.created, 5); assert.ok(r.warnings.some(w => /NoSuchFont/.test(w)));
  });
  await test("длинное слово ужимается в безопасную ширину", () => {
    const c = mkComp(); const d = { segments: [{ words: [{ text: "Достопримечательность", start: 0, end: 1 }] }] };
    N.generate(c, groupsFrom(d), style, { animIn: "none", animOut: "none" }, true);
    assert.ok(c._l[0].sourceRectAtTime().width <= 1080 * 0.9 + 1);
  });
  await test("слова за пределами композиции пропускаются", () => {
    const c = mkComp({ duration: 2.5 }); const r = N.generate(c, groupsFrom(sample()), style, { animIn: "none", animOut: "none" }, true);
    assert.strictEqual(r.created, 3); assert.ok(c._l.every(l => l.outPoint <= 2.5));
  });

  console.log("panel (мок ScriptUI)");
  let panel;
  await test("панель строится, шрифты из Font API", () => {
    panel = N.buildPanel(new mock.Panel(), ROOT);
    assert.ok(panel.button("Распознать речь") && panel.button("Создать субтитры"));
    const fam = panel.find(e => e.type === "dropdownlist" && e.items.some(i => i.text === "Inter"));
    assert.ok(fam, "семейства шрифтов не загрузились");
  });
  await test("Распознать без выделенного слоя -> понятная ошибка", () => {
    mkComp(); env.log.alerts.length = 0;
    panel.button("Распознать речь").onClick();
    assert.ok(/Выделите/.test(env.log.alerts[0]));
  });
  await test("Создать без данных -> понятная ошибка", () => {
    env.log.alerts.length = 0; panel.button("Создать субтитры").onClick();
    assert.ok(/распознайте/.test(env.log.alerts[0]));
  });

  const PY = process.env.NOIR_PYTHON, MEDIA = process.env.NOIR_MEDIA;
  if (PY && MEDIA) {
    console.log("сквозной: панель -> Python -> слои");
    await test("распознать слой, сдвинутый на 2 с и обрезанный, затем создать субтитры", async () => {
      const c = mkComp({ id: 7, duration: 12 });
      const a = new mock.AVLayer(c, "voice.mp4"); a.hasAudio = true; a.source = new mock.FootageItem(mock.File(MEDIA));
      a.startTime = 2; a.inPoint = 3; a.outPoint = 9; a.selected = true; c._l.push(a);
      env.settings["NOIR Captions/settings"] = N.stringify({ python: path.resolve(PY), model: "small", device: "cpu", language: "auto", maxWords: 1, animIn: "pop", animOut: "fade" });
      panel = N.buildPanel(new mock.Panel(), ROOT);
      env.log.alerts.length = 0;
      panel.button("Распознать речь").onClick();
      assert.strictEqual(env.log.alerts.length, 0, env.log.alerts.join("\n"));
      const t0 = Date.now();
      while (global.NOIR.job && Date.now() - t0 < 180000) await new Promise(r => setTimeout(r, 300));
      assert.ok(!global.NOIR.job, "распознавание не завершилось");
      assert.strictEqual(env.log.alerts.length, 0, env.log.alerts.join("\n"));
      const text = panel.find(e => e.type === "edittext" && e.text.length > 20).text;
      console.log("       текст: " + text.replace(/\n/g, " / ").slice(0, 120));
      a.selected = false; a.startTime = 2.5; // сдвинули аудио после распознавания
      panel.button("Создать субтитры").onClick();
      const subs = c._l.filter(l => l.comment === N.LAYER_TAG); // [0] — верхний слой = первое слово
      assert.ok(subs.length > 5, "слоёв: " + subs.length);
      // источник 1..7 с, слой сдвинут до 2.5 -> все субтитры в 3.5..9.5 с композиции
      subs.forEach(l => assert.ok(l.inPoint >= 3.5 - 0.05 && l.outPoint <= 9.5 + 0.3, l.name + " " + l.inPoint));
      console.log("       слоёв: " + subs.length + ", первый: " + subs[0].name + " @ " + subs[0].inPoint.toFixed(2) + " с");
    });
  } else console.log("(сквозной тест пропущен: задайте NOIR_PYTHON и NOIR_MEDIA)");

  for (const id of Object.keys(env.tasks)) global.app.cancelTask(id);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
