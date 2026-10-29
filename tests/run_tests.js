// Тесты NOIR CAPTIONS в Node.
//   node tests/run_tests.js            — логика + генератор + панель на моке AE
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
const presets = {};
for (const f of fs.readdirSync(path.join(ROOT, "presets/styles")))
  presets[f.replace(".json", "")] = JSON.parse(fs.readFileSync(path.join(ROOT, "presets/styles", f), "utf8"));
const styleOf = (id, over) => {
  const p = JSON.parse(JSON.stringify(presets[id]));
  return Object.assign({ layout: p.layout, base: p.base, accent: p.accent, anim: p.anim }, over || {});
};
const GOPTS = { maxWords: 1, maxChars: 99, pauseBreak: 0.35, punctBreak: true, stripPunct: true };

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
  await test("пресеты: валидная схема", () => {
    for (const [id, p] of Object.entries(presets)) {
      assert.strictEqual(p.schema, "noir-style/1", id);
      for (const k of ["layout", "base", "accent", "anim"]) assert.ok(p[k], id + "." + k);
      assert.ok(N.ANIM_IN.some(a => a.id === p.anim.animIn), id + " animIn");
      assert.ok(N.ANIM_OUT.some(a => a.id === p.anim.animOut), id + " animOut");
      assert.ok(p.base.fonts.length && p.accent.fonts.length);
    }
  });
  await test("applyEdits без изменений сохраняет тайминги", () => {
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
  await test("акценты *…* и разрыв | не меняют число слов и тайминги", () => {
    const d = sample(), w = [];
    const words = N.applyEdits(d, "Привет, | *это NOIR.*\n*Субтитры* сами", w);
    assert.strictEqual(w.length, 0);
    assert.deepStrictEqual(words.map(x => x.text), ["Привет,", "это", "NOIR.", "Субтитры", "сами"]);
    assert.deepStrictEqual(words.map(x => !!x.accent), [false, true, true, true, false]);
    assert.ok(words[1].breakBefore); near(words[3].start, 3.0);
  });
  await test("акцент с пунктуацией после звёздочки: *квартира сдавалась*:", () => {
    const r = N.parseLine("если *квартира сдавалась*: 97K");
    assert.deepStrictEqual(r.map(x => [x.text, x.accent]), [["если", false], ["квартира", true], ["сдавалась:", true], ["97K", false]]);
  });
  await test("toEditorText сохраняет разметку (round-trip)", () => {
    const d = sample(); d.segments[0].words[1].accent = true; d.segments[1].words[1].breakBefore = true;
    const t = N.toEditorText(d);
    assert.strictEqual(t, "Привет, *это* NOIR.\nСубтитры | сами");
  });
  await test("изменение числа слов -> пропорционально + предупреждение", () => {
    const d = sample(), w = [];
    const words = N.applyEdits(d, "Привет, это NOIR.\nСубтитры делаются сами", w);
    assert.strictEqual(words.length, 6); assert.strictEqual(w.length, 1);
    near(words[3].start, 3.0); near(words[5].end, 3.9);
  });
  await test("очистка последней строки = удаление фразы; удаление строк запрещено", () => {
    const d = sample(), w = [];
    assert.strictEqual(N.applyEdits(d, "Привет, это NOIR.\n", w).length, 3);
    assert.throws(() => N.applyEdits(d, "одна строка", w));
  });
  await test("groupWords: 1 слово, без пунктуации", () => {
    const g = N.groupWords(N.flattenWords(sample()), GOPTS);
    assert.deepStrictEqual(g.map(x => x.text), ["Привет", "это", "NOIR", "Субтитры", "сами"]);
  });
  await test("groupWords: до 3 слов, разрыв на запятой, паузе и |", () => {
    const o = Object.assign({}, GOPTS, { maxWords: 3, stripPunct: false });
    assert.deepStrictEqual(N.groupWords(N.flattenWords(sample()), o).map(x => x.text), ["Привет,", "это NOIR.", "Субтитры сами"]);
    const w = N.applyEdits(sample(), "Привет, это NOIR.\nСубтитры | сами", []);
    assert.deepStrictEqual(N.groupWords(w, o).map(x => x.text), ["Привет,", "это NOIR.", "Субтитры", "сами"]);
  });
  await test("groupWords сохраняет акцент у слов", () => {
    const w = N.applyEdits(sample(), "Привет, *это NOIR.*\nСубтитры сами", []);
    const g = N.groupWords(w, Object.assign({}, GOPTS, { maxWords: 5, punctBreak: false }));
    assert.deepStrictEqual(g[0].words.map(x => x.accent), [false, true, true]);
  });
  await test("autoAccent: число или самое длинное слово; ручной акцент и 1-словные группы не трогает", () => {
    const o = { maxWords: 4, maxChars: 99, pauseBreak: 9, punctBreak: false, stripPunct: true };
    const mk = (txt) => N.groupWords(N.applyEdits({ segments: [{ words: txt.split(" ").map((t, i) => ({ text: t.replace(/\*/g, ""), start: i, end: i + 0.5 })) }] }, txt, []), o);
    let g = mk("если до этого квартира"); assert.strictEqual(N.autoAccent(g), 1);
    assert.deepStrictEqual(g[0].words.map(w => w.accent), [false, false, false, true]);
    g = mk("за 97 дней"); N.autoAccent(g); assert.deepStrictEqual(g[0].words.map(w => w.accent), [false, true, false]);
    g = mk("*до* этого ваша квартира"); assert.strictEqual(N.autoAccent(g), 0);
    g = N.groupWords(N.flattenWords(sample()), Object.assign({}, o, { maxWords: 1 })); assert.strictEqual(N.autoAccent(g), 0);
  });
  await test("timeGroups: короткая пауза заполняется, длинная нет", () => {
    const g = N.timeGroups(N.groupWords(N.flattenWords(sample()), Object.assign({}, GOPTS, { pauseBreak: 9, punctBreak: false })), 0.3, 0.08);
    near(g[0].outTime, 1.35); near(g[2].outTime, 2.0);
    g.forEach(x => assert.ok(x.outTime > x.start));
  });
  await test("splitLines: акцент отдельной строкой, лимит символов", () => {
    const it = (t, a) => ({ text: t, accent: a });
    const l = N.splitLines([it("если", 0), it("до", 0), it("этого", 0), it("квартира", 1), it("сдавалась", 1)], { accentOwnLine: true, lineChars: 10 });
    assert.deepStrictEqual(l.map(x => x.map(y => y.text).join(" ")), ["если до", "этого", "квартира", "сдавалась"]);
  });
  await test("sourceToComp / compToSource с растяжением", () => {
    near(N.sourceToComp(2, 5, 50), 6); near(N.compToSource(6, 5, 50), 2);
  });

  console.log("generator (мок AE)");
  const mkComp = (o) => { const c = new mock.CompItem(Object.assign({ _fonts: ["TimesNewRomanPSMT", "Inter-Bold", "ArialMT", "Arial-BoldMT"] }, o)); global.app.project.activeItem = c; return c; };
  const prep = (words, layout) => N.timeGroups(N.groupWords(words, layout), layout.holdGap, 0.08).map(g => {
    g.compStart = g.start; g.compOut = g.outTime; g.words.forEach(w => (w.compStart = w.start)); return g;
  });
  const subs = (c) => c._l.filter(l => l.comment === N.LAYER_TAG);
  const allKeysInside = (c) => { for (const l of subs(c)) for (const p of Object.values(l.transform).concat((l.effects || []).flatMap(e => Object.values(e.props)))) for (let i = 0; i < p.keys.length; i++) {
    assert.ok(p.keys[i].t >= l.inPoint - 1e-9 && p.keys[i].t <= l.outPoint + 1e-9, "key outside layer " + l.name);
    if (i) assert.ok(p.keys[i].t > p.keys[i - 1].t, "keys not increasing");
  } };

  for (const a of N.ANIM_IN) for (const b of N.ANIM_OUT) {
    await test(`анимация ${a.id} -> ${b.id}: ключи внутри слоя`, () => {
      const c = mkComp(), st = styleOf("noir-red");
      st.anim = { animIn: a.id, animOut: b.id, inDur: 0.25, outDur: 0.2, distance: 80, blur: 20, easeInfluence: 80 };
      const r = N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
      assert.strictEqual(r.created, 5);
      allKeysInside(c);
      const usesBlur = !!(a.blur || b.blur);
      assert.strictEqual(subs(c).every(l => (l.effects || []).some(e => e.matchName === "ADBE Gaussian Blur 2")), usesBlur);
    });
  }
  for (const id of Object.keys(presets)) {
    await test(`пресет ${id}: слова в кадре, базовая линия общая, ключи внутри`, () => {
      const c = mkComp({ width: 720, height: 1280 }), st = styleOf(id);
      const words = N.applyEdits(sample(), "Привет, это *NOIR.*\nСубтитры сами", []);
      const r = N.generate(c, prep(words, st.layout), st, st.anim, true);
      assert.ok(r.created >= 5, "created " + r.created);
      allKeysInside(c);
      for (const l of subs(c)) {
        const pos = l.transform.Position.value, w = l.sourceRectAtTime().width;
        assert.ok(pos[0] - w / 2 >= -1 && pos[0] + w / 2 <= 721, l.name + " за кадром по X");
      }
    });
  }
  await test("пословная сборка: слова появляются в свои моменты, уходят вместе", () => {
    const c = mkComp(), st = styleOf("reels-glow"); st.layout.punctBreak = false; st.layout.stripPunct = false;
    N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
    const s = subs(c).filter(l => /· (Привет|это|NOIR)/.test(l.name));
    assert.deepStrictEqual(s.map(l => l.inPoint.toFixed(2)).sort(), ["1.00", "1.35", "1.50"]);
    assert.ok(s.every(l => Math.abs(l.outPoint - s[0].outPoint) < 1e-9));
  });
  await test("строка: слова идут слева направо без наложения, общая базовая линия", () => {
    const c = mkComp(), st = styleOf("reels-glow");
    const d = { segments: [{ words: [{ text: "если", start: 0, end: 0.2 }, { text: "до", start: 0.2, end: 0.3 }, { text: "этого", start: 0.3, end: 0.6 }] }] };
    N.generate(c, prep(N.flattenWords(d), st.layout), st, st.anim, true);
    const s = subs(c).sort((a, b) => a.transform.Position.value[0] - b.transform.Position.value[0]);
    for (let i = 1; i < s.length; i++) {
      const prevR = s[i - 1].transform.Position.value[0] + s[i - 1].sourceRectAtTime().width / 2;
      const curL = s[i].transform.Position.value[0] - s[i].sourceRectAtTime().width / 2;
      assert.ok(curL > prevR, "наложение слов");
    }
    // базовая линия: pos.y - (rect.top + h/2) одинаковый
    const bl = s.map(l => { const r = l.sourceRectAtTime(); return l.transform.Position.value[1] - (r.top + r.height / 2); });
    bl.forEach(v => near(v, bl[0], 1e-6));
  });
  await test("акцент: свой стиль, своя строка, свечение", () => {
    const c = mkComp(), st = styleOf("reels-glow");
    const words = N.applyEdits(sample(), "Привет, это NOIR.\n*Субтитры* сами", []);
    N.generate(c, prep(words, Object.assign({}, st.layout, { maxWords: 9, punctBreak: false, pauseBreak: 9 })), st, st.anim, true);
    const acc = subs(c).find(l => l.name === "NOIR · Субтитры");
    const norm = subs(c).find(l => l.name === "NOIR · сами");
    assert.deepStrictEqual(acc.src.value.fillColor, st.accent.color);
    assert.ok(acc.effects.some(e => e.name === "NOIR Glow"));
    assert.ok(acc.transform.Position.value[1] !== norm.transform.Position.value[1], "акцент не на своей строке");
    const op = acc.effects.find(e => e.name === "NOIR Glow").props["ADBE Drop Shadow-0002"].value;
    near(op, 85 * 2.55, 1e-6);
  });
  await test("фраза целиком без акцентов = один слой на фразу", () => {
    const c = mkComp(), st = styleOf("reels-glow"); st.layout.reveal = "group";
    N.generate(c, prep(N.flattenWords(sample()), Object.assign({}, st.layout, { maxWords: 9, punctBreak: false, pauseBreak: 9 })), st, st.anim, true);
    assert.deepStrictEqual(subs(c).map(l => l.name).sort(), ["NOIR · Привет это NOIR", "NOIR · Субтитры сами"].sort());
  });
  await test("очень короткое слово: вход+выход ужаты", () => {
    const c = mkComp(), st = styleOf("noir-red"); const d = { segments: [{ words: [{ text: "и", start: 1, end: 1.05 }] }] };
    N.generate(c, prep(N.flattenWords(d), st.layout), st, { animIn: "pop", animOut: "fade", inDur: 0.3, outDur: 0.3, distance: 80, blur: 0, easeInfluence: 80 }, true);
    allKeysInside(c);
  });
  await test("повторная генерация заменяет только свои слои", () => {
    const c = mkComp(), st = styleOf("kinetic-stack"); const user = new mock.AVLayer(c, "Мой слой"); c._l.push(user);
    const g = () => prep(N.flattenWords(sample()), st.layout);
    const r1 = N.generate(c, g(), st, st.anim, true);
    const r2 = N.generate(c, g(), st, st.anim, true);
    assert.strictEqual(r2.removed, r1.created); assert.strictEqual(c.numLayers, r1.created + 1); assert.ok(c._l.includes(user));
  });
  await test("цепочка шрифтов: первый не найден -> следующий + одно предупреждение", () => {
    const c = mkComp(), st = styleOf("reels-glow"); // Montserrat нет -> Inter-Bold
    const r = N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
    assert.ok(subs(c).every(l => l.src.value.font === "Inter-Bold"));
    assert.strictEqual(r.warnings.filter(w => /Montserrat-Bold/.test(w)).length, 1);
  });
  await test("длинное слово ужимается в безопасную ширину", () => {
    const c = mkComp(), st = styleOf("noir-red"); const d = { segments: [{ words: [{ text: "Достопримечательность", start: 0, end: 1 }] }] };
    N.generate(c, prep(N.flattenWords(d), st.layout), st, st.anim, true);
    assert.ok(subs(c)[0].sourceRectAtTime().width <= 1080 * 0.9 + 1);
  });
  await test("слова за пределами композиции пропускаются", () => {
    const c = mkComp({ duration: 2.5 }), st = styleOf("noir-red");
    const r = N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
    assert.strictEqual(r.created, 3); assert.ok(subs(c).every(l => l.outPoint <= 2.5));
  });

  console.log("panel (мок ScriptUI)");
  let panel;
  const findDD = (p, txt) => p.find(e => e.type === "dropdownlist" && e.items.some(i => i.text.indexOf(txt) >= 0));
  await test("панель строится; пресеты и шрифты загружены", () => {
    panel = N.buildPanel(new mock.Panel(), ROOT);
    assert.ok(panel.button("Распознать речь") && panel.button("Создать субтитры"));
    assert.ok(findDD(panel, "Kinetic Stack"), "пресеты не загрузились");
    assert.ok(findDD(panel, "Inter"), "шрифты не загрузились");
  });
  await test("тема: вкладки-кнопки переключают страницы, кнопки получили onDraw", () => {
    assert.ok(N.theme && N.theme.makeTabs, "theme.jsx не загрузилась");
    const tabBtn = (t) => panel.find(e => e.type === "button" && e.text === t);
    tabBtn("Стиль").onClick(); tabBtn("Раскладка").onClick();
    const stack = panel.find(e => e.type === "group" && e.orientation === "stack");
    assert.deepStrictEqual(stack.children.map(c => c.visible), [false, false, false, false, true, false]);
    tabBtn("Речь").onClick();
    assert.deepStrictEqual(stack.children.map(c => c.visible), [true, false, false, false, false, false]);
    assert.strictEqual(typeof panel.button("Создать субтитры").onDraw, "function");
  });
  await test("без theme.jsx панель строится на обычных вкладках", () => {
    const saved = N.theme; N.theme = undefined;
    const orig = global.$.evalFile;
    global.$.evalFile = (f) => { if (/theme\.jsx$/.test(f.fsName)) throw new Error("missing"); return orig(f); };
    try {
      const p2 = N.buildPanel(new mock.Panel(), ROOT);
      assert.ok(p2.button("Распознать речь") && p2.find(e => e.type === "tabbedpanel"));
    } finally { global.$.evalFile = orig; N.theme = saved; }
  });
  await test("выбор пресета применяет стиль; ручная правка -> «свой»", () => {
    const dd = findDD(panel, "Kinetic Stack");
    dd.selection = dd.items.findIndex(i => i.text.indexOf("Kinetic") >= 0);
    const S = N.parseJSON(env.settings["NOIR Captions/settings.v2"]);
    assert.strictEqual(S.presetId, "kinetic-stack"); assert.strictEqual(S.style.anim.animIn, "blurRise");
    const size = panel.find(e => e.type === "edittext" && e.text === "64");
    size.text = "70"; size.onChange();
    panel.button("Создать субтитры").onClick(); // readUI + сохранение (данных нет -> алерт)
    const S2 = N.parseJSON(env.settings["NOIR Captions/settings.v2"]);
    assert.strictEqual(S2.presetId, ""); assert.strictEqual(S2.style.base.size, 70);
  });
  await test("сохранить свой пресет -> появляется в списке", () => {
    global.prompt = () => "Мой тест";
    panel.button("Сохранить как пресет…").onClick();
    assert.ok(findDD(panel, "★ Мой тест"));
  });
  await test("Распознать без выделенного слоя -> понятная ошибка", () => {
    mkComp(); env.log.alerts.length = 0;
    panel.button("Распознать речь").onClick();
    assert.ok(/Выделите/.test(env.log.alerts[0]));
  });

  const PY = process.env.NOIR_PYTHON, MEDIA = process.env.NOIR_MEDIA;
  if (PY && MEDIA) {
    console.log("сквозной: панель -> Python -> слои");
    await test("распознать слой (сдвинут, обрезан), отметить акцент, создать субтитры Reels Glow", async () => {
      const c = mkComp({ id: 7, duration: 12 });
      const a = new mock.AVLayer(c, "voice.mp4"); a.hasAudio = true; a.source = new mock.FootageItem(mock.File(MEDIA));
      a.startTime = 2; a.inPoint = 3; a.outPoint = 9; a.selected = true; c._l.push(a);
      const st = styleOf("reels-glow");
      env.settings["NOIR Captions/settings.v2"] = N.stringify({ python: path.resolve(PY), model: "small", device: "cpu", language: "auto", presetId: "reels-glow", style: st });
      panel = N.buildPanel(new mock.Panel(), ROOT);
      env.log.alerts.length = 0;
      panel.button("Распознать речь").onClick();
      assert.strictEqual(env.log.alerts.length, 0, env.log.alerts.join("\n"));
      const t0 = Date.now();
      while (global.NOIR.job && Date.now() - t0 < 180000) await new Promise(r => setTimeout(r, 300));
      assert.ok(!global.NOIR.job, "распознавание не завершилось");
      assert.strictEqual(env.log.alerts.length, 0, env.log.alerts.join("\n"));
      const ed = panel.find(e => e.type === "edittext" && e.text.length > 20);
      ed.text = ed.text.replace(/\bclear\b/i, "*clear*");
      console.log("       текст: " + ed.text.replace(/\n/g, " / ").slice(0, 120));
      a.selected = false; a.startTime = 2.5; // сдвинули аудио после распознавания
      panel.button("Создать субтитры").onClick();
      const s = subs(c);
      assert.ok(s.length > 5, "слоёв: " + s.length);
      s.forEach(l => assert.ok(l.inPoint >= 3.5 - 0.05 && l.outPoint <= 9.5 + 0.3, l.name + " " + l.inPoint));
      assert.ok(s.some(l => /clear/i.test(l.name) && (l.effects || []).some(e => e.name === "NOIR Glow")), "акцент не применён");
      console.log("       слоёв: " + s.length + "; " + s.slice(-4).map(l => l.name.replace("NOIR · ", "") + "@" + l.inPoint.toFixed(2)).join(", "));
    });
  } else console.log("(сквозной тест пропущен: задайте NOIR_PYTHON и NOIR_MEDIA)");

  for (const id of Object.keys(env.tasks)) global.app.cancelTask(id);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
