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
for (const m of ["core.jsx", "generator.jsx", "recognizer.jsx", "sfx.jsx", "tools.jsx", "app.jsx"])
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
  await test("код совместим с ExtendScript (нет зарезервированных слов ES3, ES6-синтаксиса, висячих запятых)", () => {
    const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "check_es3.js")], { encoding: "utf8" });
    assert.strictEqual(r.status, 0, r.stdout);
  });
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
  await test("инверсия ~слово~ и сочетание *~слово~*: разбор, сохранение, не меняет тайминги", () => {
    const r = N.parseLine("если ~до этого~ *~ваша~* квартира");
    assert.deepStrictEqual(r.map(x => [x.text, !!x.accent, !!x.invert]), [["если", false, false], ["до", false, true], ["этого", false, true], ["ваша", true, true], ["квартира", false, false]]);
    assert.deepStrictEqual(N.parseLine("~слово~.").map(x => x.text), ["слово."]);
    const d = sample(), w = [];
    const words = N.applyEdits(d, "Привет, ~это~ NOIR.\nСубтитры *~сами~*", w);
    assert.strictEqual(w.length, 0); assert.deepStrictEqual(words.map(x => !!x.invert), [false, true, false, false, true]); near(words[1].start, 1.35);
    d.segments[0].words[1].invert = true; assert.strictEqual(N.toEditorText(d).split("\n")[0], "Привет, ~это~ NOIR.");
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
  const mkComp = (o) => { const c = new mock.CompItem(Object.assign({ _fonts: ["TimesNewRomanPSMT", "Inter-Bold", "ArialMT", "Arial-BoldMT"] }, o)); global.__installedFonts = c._fonts; global.app.project.activeItem = c; return c; };
  const prep = (words, layout) => N.timeGroups(N.groupWords(words, layout), layout.holdGap, 0.08).map(g => {
    g.compStart = g.start; g.compOut = g.outTime; g.words.forEach(w => (w.compStart = w.start)); return g;
  });
  const subs = (c) => c._l.filter(l => N.isGenerated(l));
  // Масштаб, поворот, прозрачность и сдвиг входа/выхода хранятся в текстовом аниматоре «NOIR Move», а не в ключах слоя.
  const moveGroup = (l) => l.textProps ? l.textProps.property("ADBE Text Animators").kids.find(x => x.name === "NOIR Move") : null;
  const mk = (l, kind) => { const g = moveGroup(l); if (!g) return []; const mn = { Opacity: "ADBE Text Opacity", Scale: "ADBE Text Scale 3D", Rotation: "ADBE Text Rotation", Position: "ADBE Text Position 3D" }[kind]; const q = g.property("ADBE Text Animator Properties").kids.find(k => k.matchName === mn); return q ? q.keys : []; };
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
      assert.ok(r.created >= (st.layout.reveal === "group" || st.layout.layerMode === "phrase" ? 2 : 5), "created " + r.created);
      assert.strictEqual(subs(c).map(l => l.property("Source Text").value.text).join(" ").split(/\s+/).length, 5);
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
    const c = mkComp(), st = styleOf("reels-glow"); st.base.fonts = ["Montserrat-Bold", "Inter-Bold"]; st.accent.fonts = ["Montserrat-Bold", "Inter-Bold"];
    const r = N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
    assert.ok(subs(c).every(l => l.src.value.font === "Inter-Bold"));
    assert.strictEqual(r.warnings.filter(w => /Montserrat-Bold/.test(w)).length, 1);
  });

  await test("НИ ОДНОГО шрифта стиля нет в системе: слои не получают несуществующий шрифт (нет окна Resolve Fonts), есть предупреждение", () => {
    const c = mkComp(), st = styleOf("editorial"); // Bodoni/Montserrat/SF Pro в «системе» отсутствуют
    st.base.fonts = ["Nope-A", "Nope-B"]; st.accent.fonts = ["BodoniModa28pt-Regular", "BodoniModa-Regular"];
    const r = N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
    subs(c).forEach(l => assert.ok(c._fonts.includes(l.src.value.font), "слой со шрифтом, которого нет: " + l.src.value.font));
    assert.ok(r.warnings.some(w => /нет на компьютере/.test(w)), r.warnings.join("|"));
  });
  await test("шрифт слоя не меняется на несуществующий при «Шрифт → выделенным»", () => {
    const c = mkComp(), st = styleOf("editorial"); N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true); const a = subs(c)[0], before = a.src.value.font;
    const r = N.restyleLayers(c, [a], { style: Object.assign({}, st.accent, { fonts: ["BodoniModa28pt-Regular"] }), parts: { font: true }, safeWidth: 0.88, anim: null });
    assert.strictEqual(a.src.value.font, before); assert.ok(r.warnings.some(w => /BodoniModa28pt-Regular/.test(w)));
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

  console.log("слой на фразу и караоке");
  const evalSel = (expr, time, inPoint, textIndex) => new Function("time", "inPoint", "textIndex", "selectorValue", "linear",
    expr.replace(/;([^;]*);?$/, ";return $1;"))(time, inPoint, textIndex, 1, (x, a, b, c, d) => x <= a ? c : x >= b ? d : c + (d - c) * (x - a) / (b - a));
  const animByName = (l, nm) => l.textProps.property("ADBE Text Animators").kids.find(x => x.name === nm);
  const exprOf = (an) => an.property("ADBE Text Selectors").kids[0].property("ADBE Text Expressible Amount").expression;
  const phraseGen = (c, id, tweak) => { const st = styleOf(id || "reels-glow"); st.layout.autoAccent = false; st.layout.layerMode = "phrase"; if (tweak) tweak(st); return { st, r: N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true) }; };
  await test("слой на фразу: фраза без акцентов — один слой, слова в нём по порядку; слои не по словам", () => {
    const c = mkComp(); const { st } = phraseGen(c, "reels-glow", st => { st.layout.reveal = "word"; st.layout.maxWords = 6; st.layout.maxChars = 99; st.layout.lineChars = 0; st.layout.punctBreak = false; st.layout.pauseBreak = 5; });
    const ls = subs(c), groups = prep(N.flattenWords(sample()), st.layout);
    assert.strictEqual(ls.length, groups.length, "по слою на фразу: " + ls.map(l => l.src.value.text).join(" | "));
    ls.forEach(l => assert.ok(/ /.test(l.src.value.text), "в слое несколько слов"));
  });
  await test("слой на фразу: слова проявляются в момент произнесения (селектор по словам, время от начала слоя)", () => {
    const c = mkComp(); phraseGen(c, "reels-glow", st => { st.layout.reveal = "word"; st.layout.maxWords = 6; st.layout.maxChars = 99; st.layout.lineChars = 0; st.layout.punctBreak = false; st.layout.pauseBreak = 5; });
    const l = subs(c).sort((a, b) => a.inPoint - b.inPoint)[0], an = animByName(l, "NOIR Words"); assert.ok(an, "аниматор появления слов");
    const sel = an.property("ADBE Text Selectors").kids[0]; assert.strictEqual(sel.matchName, "ADBE Text Expressible Selector");
    assert.strictEqual(sel.property("ADBE Text Range Type2").value, 3);
    const e = exprOf(an), n = l.src.value.text.split(" ").length, t0 = l.inPoint;
    assert.strictEqual(evalSel(e, t0, t0, 1), 1, "первое слово ещё скрыто ровно в начале"); assert.strictEqual(evalSel(e, t0 + 0.2, t0, 1), 0, "первое слово видно");
    assert.strictEqual(evalSel(e, t0 + 0.05, t0, n), 1, "последнее слово ещё скрыто");
    assert.strictEqual(evalSel(e, l.outPoint - 0.01, t0, n), 0, "к концу фразы видно всё");
    assert.strictEqual(evalSel(e, t0 + 10 + 0.2, t0 + 10, 1), 0, "сдвиг слоя по времени не ломает тайминг");
  });
  await test("караоке: все слова видны сразу, текущее слово подсвечивается цветом подсветки", () => {
    const c = mkComp(); const { st } = phraseGen(c, "reels-glow", st => { st.layout.reveal = "karaoke"; st.anim.highlightColor = [1, 0.8, 0]; st.layout.maxWords = 6; st.layout.maxChars = 99; st.layout.lineChars = 0; st.layout.punctBreak = false; st.layout.pauseBreak = 5; });
    const l = subs(c).sort((a, b) => a.inPoint - b.inPoint)[0];
    assert.ok(!animByName(l, "NOIR Words"), "в караоке слова не прячутся");
    const an = animByName(l, "NOIR Karaoke"); assert.ok(an);
    assert.deepStrictEqual(an.property("ADBE Text Animator Properties").kids.find(k => k.matchName === "ADBE Text Fill Color").value, [1, 0.8, 0]);
    const words = sample().segments[0].words, e = exprOf(an), t0 = l.inPoint;
    assert.strictEqual(evalSel(e, words[0].start + 0.05, t0, 1), 1); assert.strictEqual(evalSel(e, words[0].start + 0.05, t0, 2), 0);
    assert.strictEqual(evalSel(e, words[1].start + 0.01, t0, 1), 0); assert.strictEqual(evalSel(e, words[1].start + 0.01, t0, 2), 1);
  });
  await test("караоке со слоем на слово: каждое слово — свой слой, видны с начала фразы, подсветка в своё время", () => {
    const c = mkComp(); phraseGen(c, "reels-glow", st => { st.layout.layerMode = "word"; st.layout.reveal = "karaoke"; st.layout.maxWords = 6; st.layout.maxChars = 99; st.layout.lineChars = 0; st.layout.punctBreak = false; st.layout.pauseBreak = 5; });
    const ls = subs(c); assert.ok(ls.every(l => !/ /.test(l.src.value.text)));
    const g0 = ls.filter(l => N.groupInfo(l).gid === N.groupInfo(ls[ls.length - 1]).gid);
    assert.ok(g0.every(l => Math.abs(l.inPoint - g0[0].inPoint) < 1e-9), "слова видны с начала фразы");
    assert.ok(ls.every(l => animByName(l, "NOIR Karaoke")));
  });
  await test("слой на фразу с акцентами: акцент — отдельный слой своего стиля, обычные слова строки — один слой", () => {
    const c = mkComp(); const st = styleOf("kinetic-stack"); st.layout.autoAccent = false; st.layout.layerMode = "phrase"; st.layout.lineChars = 40; st.layout.maxChars = 99; st.layout.maxWords = 9;
    const d = { segments: [{ words: "мы продаём *дома* у моря".split(" ").map((t, i) => ({ text: t.replace(/\*/g, ""), start: i * 0.3, end: i * 0.3 + 0.25 })) }] };
    const words = N.applyEdits(d, "мы продаём *дома* у моря", []); N.generate(c, prep(words, st.layout), st, st.anim, true);
    const ls = subs(c), acc = ls.filter(l => l.label === 11);
    assert.strictEqual(acc.length, 1); assert.ok(/дома/i.test(acc[0].src.value.text));
    assert.ok(ls.length <= 4 && ls.length >= 2, ls.map(l => l.src.value.text).join(" | "));
  });
  await test("стиль выбранный в панели получает «слой на фразу», старые настройки без режима — «слой на слово»", () => {
    const a = N.createApp(ROOT); a.call("preset.choose", { id: "reels-glow" }); assert.strictEqual(a.settings().style.layout.layerMode, "phrase");
  });
  console.log("правка выделенных слоёв");
  const gen = (c, id, anim) => { const st = styleOf(id || "reels-glow"); st.layout.autoAccent = false; return N.generate(c, prep(N.flattenWords(sample()), st.layout), st, anim || st.anim, true); };
  const NOANIM = { animIn: "none", inDur: 0, animOut: "none", outDur: 0, distance: 0, blur: 0, easeInfluence: 80 };
  await test("слой помнит базовую позицию; теги работают с isGenerated", () => {
    const c = mkComp(); gen(c); const l = subs(c)[0];
    assert.ok(/^noir-captions:generated\|[\d.]+\|[\d.]+\|[\w]+-\d+\|\d+(?:\|.*)?$/.test(l.comment));
    const b = N.baseOf(l); assert.ok(Math.abs(b[0] - l.transform.Position.value[0]) < 1e-6 || l.transform.Position.keys.length);
  });
  await test("сделать акцентом: стиль, имя, метка и свечение — только у выделенного слоя", () => {
    const c = mkComp(), st = styleOf("reels-glow"); gen(c);
    const [a, b] = subs(c); a.selected = true;
    const posBefore = JSON.stringify(a.transform.Position.value);
    const r = N.restyleLayers(c, [a], { style: st.accent, accent: true, safeWidth: 0.88, anim: null });
    assert.strictEqual(r.changed, 1);
    assert.deepStrictEqual(a.src.value.fillColor, st.accent.color);
    assert.ok(a.effects.some(e => e.name === "NOIR Glow")); assert.strictEqual(a.label, 11);
    assert.ok(!(b.effects || []).some(e => e.name === "NOIR Glow"));
    assert.strictEqual(JSON.stringify(a.transform.Position.value), posBefore, "позиция изменилась");
  });
  await test("сделать обычным: свечение снимается, акцентный → обычный стиль", () => {
    const c = mkComp(), st = styleOf("reels-glow"); gen(c); const a = subs(c)[0];
    N.restyleLayers(c, [a], { style: st.accent, accent: true, safeWidth: 0.88, anim: null });
    N.restyleLayers(c, [a], { style: st.base, accent: false, safeWidth: 0.88, anim: null });
    assert.ok(!a.effects.some(e => e.name === "NOIR Glow")); assert.strictEqual(a.label, 9);
    assert.deepStrictEqual(a.src.value.fillColor, st.base.color);
  });
  await test("анимация к одному слою: ключи заменены, внутри слоя, позиция = база", () => {
    const c = mkComp(), st = styleOf("reels-glow"); gen(c);
    const a = subs(c)[0], b = subs(c)[1];
    const bKeys = JSON.stringify(b.transform.Opacity.keys), base = N.baseOf(a);
    const anim = { animIn: "blurRise", inDur: 0.3, animOut: "blur", outDur: 0.2, distance: 60, blur: 20, easeInfluence: 80 };
    N.restyleLayers(c, [a], { style: null, accent: false, safeWidth: 0.88, anim });
    assert.ok(a.effects.some(e => e.matchName === "ADBE Gaussian Blur 2"));
    assert.strictEqual(a.transform.Position.keys.length, 0, "у Position слоя не должно быть ключей — иначе слой нельзя двигать");
    assert.deepStrictEqual(a.transform.Position.value.slice(0, 2), base);
    for (const p of Object.values(a.transform)) for (const k of p.keys) assert.ok(k.t >= a.inPoint - 1e-9 && k.t <= a.outPoint + 1e-9);
    const mv = a.textProps.property("ADBE Text Animators").kids.find(x => x.name === "NOIR Move");
    assert.ok(mv, "нет аниматора NOIR Move");
    const mk = mv.property("ADBE Text Animator Properties").property("ADBE Text Position 3D").keys;
    assert.ok(mk.length >= 2 && mk.some(k => k.v[0] === 0 && k.v[1] === 0), "нет ключа с нулевым сдвигом");
    for (const k of mk) assert.ok(k.t >= a.inPoint - 1e-9 && k.t <= a.outPoint + 1e-9);
    assert.strictEqual(JSON.stringify(b.transform.Opacity.keys), bKeys, "соседний слой изменился");
  });
  await test("повторное применение анимации не копит ключи и эффекты; «Нет» убирает всё", () => {
    const c = mkComp(); gen(c); const a = subs(c)[0];
    const anim = { animIn: "pop", inDur: 0.2, animOut: "fade", outDur: 0.2, distance: 40, blur: 0, easeInfluence: 80 };
    N.restyleLayers(c, [a], { style: null, safeWidth: 0.88, anim }); const n1 = a.transform.Scale.keys.length;
    N.restyleLayers(c, [a], { style: null, safeWidth: 0.88, anim }); assert.strictEqual(a.transform.Scale.keys.length, n1);
    N.restyleLayers(c, [a], { style: null, safeWidth: 0.88, anim: Object.assign({}, anim, { animIn: "none", animOut: "none" }) });
    assert.ok(Object.values(a.transform).every(p => p.keys.length === 0));
    assert.deepStrictEqual(a.transform.Position.value, N.baseOf(a));
    assert.strictEqual((a.effects || []).filter(e => e.name === "NOIR Blur").length, 0);
  });
  await test("только шрифт: у выделенного слоя меняется шрифт, размер/цвет остаются; соседний не тронут", () => {
    const c = mkComp(), st = styleOf("reels-glow"); gen(c);
    const [a, b] = subs(c); const sizeBefore = a.src.value.fontSize, colBefore = JSON.stringify(a.src.value.fillColor);
    const fontB = b.src.value.font, posBefore = JSON.stringify(a.transform.Position.value);
    const style = Object.assign({}, st.accent, { fonts: ["Nope-Font", "TimesNewRomanPSMT"], size: 999, color: [0, 1, 0] });
    N.restyleLayers(c, [a], { style, parts: { font: true }, accent: true, safeWidth: 0.88, anim: null });
    assert.strictEqual(a.src.value.font, "TimesNewRomanPSMT");
    assert.strictEqual(a.src.value.fontSize, sizeBefore); assert.strictEqual(JSON.stringify(a.src.value.fillColor), colBefore);
    assert.strictEqual(b.src.value.font, fontB); assert.strictEqual(JSON.stringify(a.transform.Position.value), posBefore);
    assert.ok(!(a.effects || []).some(e => e.name === "NOIR Glow"), "эффекты не должны добавляться");
  });
  await test("разные шрифты на разные слои; нет шрифта -> предупреждение и слой не ломается", () => {
    const c = mkComp(), st = styleOf("reels-glow"); gen(c);
    const [a, b] = subs(c);
    N.restyleLayers(c, [a], { style: Object.assign({}, st.base, { fonts: ["TimesNewRomanPSMT"] }), parts: { font: true }, safeWidth: 0.88, anim: null });
    const r = N.restyleLayers(c, [b], { style: Object.assign({}, st.base, { fonts: ["Missing-Font"] }), parts: { font: true }, safeWidth: 0.88, anim: null });
    assert.strictEqual(a.src.value.font, "TimesNewRomanPSMT"); assert.notStrictEqual(a.src.value.font, b.src.value.font);
    assert.ok(r.warnings.some(w => /Missing-Font/.test(w)));
  });
  await test("по отдельности: только цвет / только эффекты / размер", () => {
    const c = mkComp(), st = styleOf("reels-glow"); gen(c); const a = subs(c)[0];
    const font0 = a.src.value.font, size0 = a.src.value.fontSize;
    N.restyleLayers(c, [a], { style: st.accent, parts: { color: true }, safeWidth: 0.88, anim: null });
    assert.deepStrictEqual(a.src.value.fillColor, st.accent.color); assert.strictEqual(a.src.value.font, font0); assert.strictEqual(a.src.value.fontSize, size0);
    N.restyleLayers(c, [a], { style: st.accent, parts: { fx: true }, safeWidth: 0.88, anim: null });
    assert.ok(a.effects.some(e => e.name === "NOIR Glow"));
    N.restyleLayers(c, [a], { style: st.accent, parts: { size: true }, safeWidth: 0.88, anim: null });
    assert.strictEqual(a.src.value.fontSize, st.accent.size);
  });
  await test("режим наложения и прозрачность: у новых слоёв Difference и 60%, анимация идёт до 60%", () => {
    const c = mkComp(), st = styleOf("invert"); st.base.opacity = 60; st.accent.opacity = 60;
    st.anim = { animIn: "fade", inDur: 0.2, animOut: "fade", outDur: 0.2, distance: 0, blur: 0, easeInfluence: 80 };
    N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
    subs(c).forEach(l => {
      assert.strictEqual(l.blendingMode, BlendingMode.DIFFERENCE);
      const vals = mk(l, "Opacity").map(k => k.v); assert.ok(Math.max(...vals) === 100 && Math.min(...vals) === 0, JSON.stringify(vals));
      assert.strictEqual(l.transform.Opacity.value, 60); assert.strictEqual(l.transform.Opacity.keys.length, 0, "прозрачность слоя без ключей");
    });
  });
  await test("без анимации прозрачность — просто значение слоя", () => {
    const c = mkComp(), st = styleOf("invert"); st.base.opacity = 40; st.accent.opacity = 40; st.anim = { animIn: "none", animOut: "none", inDur: 0, outDur: 0, distance: 0, blur: 0, easeInfluence: 80 };
    N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
    subs(c).forEach(l => { assert.strictEqual(l.transform.Opacity.value, 40); assert.strictEqual(l.transform.Opacity.keys.length, 0); });
  });
  await test("новые вылеты: rotate даёт ключи поворота, whip/slam — blur; Rotation возвращается в 0", () => {
    const c = mkComp(), st = styleOf("invert"); gen(c, "invert"); const a = subs(c)[0];
    N.restyleLayers(c, [a], { style: null, safeWidth: 0.88, anim: { animIn: "rotate", inDur: 0.25, animOut: "rotate", outDur: 0.2, distance: 40, blur: 20, easeInfluence: 80 } });
    const rk = mk(a, "Rotation"); assert.strictEqual(a.transform.Rotation.keys.length, 0); assert.ok(rk.length >= 3 && rk[0].v === -14 && rk[rk.length - 1].v === 14 && rk.some(k => k.v === 0));
    N.restyleLayers(c, [a], { style: null, safeWidth: 0.88, anim: { animIn: "slam", inDur: 0.2, animOut: "whipR", outDur: 0.2, distance: 40, blur: 20, easeInfluence: 80 } });
    assert.strictEqual(mk(a, "Rotation").length, 0); assert.ok(a.effects.some(e => e.matchName === "ADBE Gaussian Blur 2"));
    assert.strictEqual(mk(a, "Scale")[0].v[0], 260); assert.strictEqual(a.transform.Scale.keys.length, 0, "Scale слоя свободен");
  });
  await test("анимация выделенного слоя сохраняет его прозрачность (60%)", () => {
    const c = mkComp(); gen(c, "reels-glow", NOANIM); const a = subs(c)[0]; a.transform.Opacity.value = 60;
    N.restyleLayers(c, [a], { style: null, safeWidth: 0.88, anim: { animIn: "fade", inDur: 0.2, animOut: "none", outDur: 0, distance: 0, blur: 0, easeInfluence: 80 } });
    assert.strictEqual(a.transform.Opacity.value, 60); assert.strictEqual(Math.max(...mk(a, "Opacity").map(k => k.v)), 100);
  });
  await test("только режим наложения: Difference + прозрачность, остальное не меняется; «Инверсия» вкл/выкл", () => {
    const c = mkComp(), st = styleOf("invert"); gen(c, "reels-glow", NOANIM); const [a, b] = subs(c); const font0 = a.src.value.font, col0 = JSON.stringify(a.src.value.fillColor);
    N.restyleLayers(c, [a], { style: Object.assign({}, st.base, { opacity: 70 }), parts: { blend: true }, safeWidth: 0.88, anim: null });
    assert.strictEqual(a.blendingMode, BlendingMode.DIFFERENCE); assert.strictEqual(a.transform.Opacity.value, 70);
    assert.strictEqual(a.src.value.font, font0); assert.strictEqual(JSON.stringify(a.src.value.fillColor), col0); assert.strictEqual(b.blendingMode, BlendingMode.NORMAL);
    assert.strictEqual(N.toggleInvert([b]), true); assert.strictEqual(b.blendingMode, BlendingMode.DIFFERENCE); assert.deepStrictEqual(b.src.value.fillColor, [1, 1, 1]);
    assert.strictEqual(N.toggleInvert([b]), false); assert.strictEqual(b.blendingMode, BlendingMode.NORMAL);
  });
  await test("при создании: слово ~инверсия~ — Difference и белый, остальные слова обычные", () => {
    const c = mkComp(), st = styleOf("reels-glow"); st.layout.autoAccent = false; st.base.color = [0.5, 0.2, 0.2];
    const words = N.applyEdits(sample(), "Привет, ~это~ NOIR.\nСубтитры сами", []);
    N.generate(c, prep(words, st.layout), st, st.anim, true);
    const byName = (n) => subs(c).find(l => l.name === "NOIR · " + n);
    assert.strictEqual(byName("это").blendingMode, BlendingMode.DIFFERENCE); assert.deepStrictEqual(byName("это").src.value.fillColor, [1, 1, 1]);
    assert.strictEqual(byName("NOIR").blendingMode, BlendingMode.NORMAL); assert.deepStrictEqual(byName("NOIR").src.value.fillColor, [0.5, 0.2, 0.2]);
  });
  await test("палитра акцентов: акцентные слова получают цвета по кругу, обычные — свой цвет", () => {
    const c = mkComp(), st = styleOf("mix-colors"); st.layout.autoAccent = false;
    const words = N.applyEdits(sample(), "*Привет,* это *NOIR.*\n*Субтитры* *сами*", []);
    N.generate(c, prep(words, st.layout), st, st.anim, true);
    const col = (n) => JSON.stringify(subs(c).find(l => l.name === "NOIR · " + n).src.value.fillColor);
    const pal = st.accent.colors.map(x => JSON.stringify(x));
    assert.deepStrictEqual(["Привет", "NOIR", "Субтитры", "сами"].map(col), [pal[0], pal[1], pal[2], pal[3]]);
    assert.strictEqual(col("это"), JSON.stringify(st.base.color));
    const c2 = mkComp(); N.generate(c2, prep(N.applyEdits(sample(), "*а* *б* *в* *г* *д*\nб", []).slice(0, 5), st.layout), st, st.anim, true);
    const cols = subs(c2).map(l => JSON.stringify(l.src.value.fillColor)); assert.strictEqual(new Set(cols).size, 4, "палитра должна повторяться по кругу");
  });
  const phrase = (c, id, text) => { const st = styleOf(id || "kinetic-stack"); st.layout.autoAccent = false; st.layout.lineChars = 40; st.layout.maxChars = 99; const d = { segments: [{ words: text.split(" ").map((t, i) => ({ text: t.replace(/\*/g, ""), start: i * 0.3, end: i * 0.3 + 0.25 })) }] };
    N.generate(c, prep(N.applyEdits(d, text, []), Object.assign({}, st.layout, { maxWords: 9, punctBreak: false, pauseBreak: 9 })), st, st.anim, true); return st; };
  const byText = (c, t) => subs(c).find(l => l.src.value.text === t);
  await test("автоперекладка: слово стало акцентом (метка 11) — уходит на свою строку, фраза остаётся вокруг прежнего центра, группа и анимация сохраняются", () => {
    const c = mkComp(), st = phrase(c, "kinetic-stack", "если до этого квартира"); const ls = subs(c);
    const g0 = N.groupInfo(ls[0]).gid; assert.ok(ls.every(l => N.groupInfo(l).gid === g0), "одна фраза — одна группа");
    const center = () => { const b = subs(c).map(l => ({ p: N.baseOf(l), r: l.sourceRectAtTime() })); return [(Math.min(...b.map(x => x.p[0] - x.r.width / 2)) + Math.max(...b.map(x => x.p[0] + x.r.width / 2))) / 2, (Math.min(...b.map(x => x.p[1] - x.r.height / 2)) + Math.max(...b.map(x => x.p[1] + x.r.height / 2))) / 2]; };
    const c0 = center(), yBefore = N.baseOf(byText(c, "квартира"))[1], keysBefore = yBefore;
    byText(c, "квартира").label = 11;
    const r = N.reflowGroups(c, [byText(c, "квартира")], st.layout);
    assert.strictEqual(r.groups, 1); assert.strictEqual(r.moved, 4);
    assert.ok(N.baseOf(byText(c, "квартира"))[1] !== yBefore, "акцент должен уйти на свою строку");
    const ys = new Set(["если", "до", "этого"].map(t => Math.round(N.baseOf(byText(c, t))[1]))); assert.strictEqual(ys.size, 1, "обычные слова на одной строке");
    const c1 = center(); near(c1[0], c0[0], 1); near(c1[1], c0[1], 1);
    assert.ok(subs(c).every(l => N.groupInfo(l).gid === g0), "группа сохранилась");
    assert.strictEqual(byText(c, "квартира").transform.Position.keys.length, 0, "позиция без ключей");
    assert.notStrictEqual(N.baseOf(byText(c, "квартира"))[1], keysBefore, "слово переложено");
  });
  await test("автоперекладка: акцент снят — слова снова в строку; без метки группы слой пропускается; в сумме слои не теряются", () => {
    const c = mkComp(), st = phrase(c, "kinetic-stack", "если до этого квартира"); byText(c, "квартира").label = 11; N.reflowGroups(c, subs(c), st.layout);
    const y1 = new Set(subs(c).map(l => Math.round(N.baseOf(l)[1]))).size; assert.ok(y1 >= 2, "строк: " + y1);
    byText(c, "квартира").label = 9; N.reflowGroups(c, subs(c), st.layout);
    assert.ok(new Set(subs(c).map(l => Math.round(N.baseOf(l)[1]))).size < y1, "после снятия акцента строк меньше");
    const user = new mock.TextLayer(c, "свой", c._fonts); c._l.push(user); const n = c.numLayers;
    const r = N.reflowGroups(c, [user], st.layout); assert.strictEqual(r.groups, 0); assert.strictEqual(r.skipped, 1); assert.strictEqual(c.numLayers, n);
  });
  const animators = (l) => l.textProps ? l.textProps.property("ADBE Text Animators").kids.filter(x => x.name !== "NOIR Move") : [];
  const selOf = (an) => an.property("ADBE Text Selectors").kids[0];
  const ANI = (inn, out, o) => Object.assign({ animIn: inn, animOut: out, inDur: 0.4, outDur: 0.3, distance: 60, blur: 20, easeInfluence: 80 }, o || {});
  await test("по буквам (вход): аниматор с прозрачностью 0 и диапазоном 0→100% за inDur, слева направо; ключи слоя не создаются", () => {
    for (const [id, extra] of [["letFade", null], ["letRise", "ADBE Text Position 3D"], ["letPop", "ADBE Text Scale 3D"], ["letBlur", "ADBE Text Blur"], ["type", null]]) {
      const c = mkComp(), st = styleOf("noir-red"); st.anim = ANI(id, "none"); N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
      const l = subs(c)[0], an = animators(l); assert.strictEqual(an.length, 1, id); assert.strictEqual(an[0].name, "NOIR Letters In");
      assert.strictEqual(an[0].property("ADBE Text Animator Properties").property("ADBE Text Opacity").value, 0);
      if (extra) assert.ok(an[0].property("ADBE Text Animator Properties").kids.some(k => k.matchName === extra), id + " без " + extra);
      const start = selOf(an[0]).property("ADBE Text Percent Start").keys; assert.deepStrictEqual(start.map(k => k.v), [0, 100]);
      near(start[0].t, l.inPoint); assert.ok(start[1].t <= l.outPoint + 1e-9 && start[1].t > start[0].t);
      assert.ok(Object.values(l.transform).every(p => p.keys.length === 0), id + ": ключи слоя быть не должны");
    }
  });
  await test("по буквам (выход): конец диапазона 0→100% и заканчивается к outPoint; вход обычный + выход по буквам вместе", () => {
    const c = mkComp(), st = styleOf("noir-red"); st.anim = ANI("pop", "letFade"); N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
    const l = subs(c)[0], an = animators(l); assert.strictEqual(an.length, 1); assert.strictEqual(an[0].name, "NOIR Letters Out");
    const end = selOf(an[0]).property("ADBE Text Percent End").keys; assert.deepStrictEqual(end.map(k => k.v), [0, 100]); near(end[1].t, l.outPoint);
    assert.ok(mk(l, "Scale").length >= 2, "вход Pop записан в аниматор NOIR Move"); assert.ok(mk(l, "Scale").every(k => k.t <= end[0].t + 1e-9), "вход не должен залезать на выход");
    const c2 = mkComp(); const st2 = styleOf("noir-red"); st2.anim = ANI("letRise", "letType"); N.generate(c2, prep(N.flattenWords(sample()), st2.layout), st2, st2.anim, true);
    assert.deepStrictEqual(animators(subs(c2)[0]).map(a => a.name), ["NOIR Letters In", "NOIR Letters Out"]);
  });
  await test("по буквам: у короткого слова длительность ужимается; смена анимации убирает старые аниматоры; без анимации аниматоров нет", () => {
    const c = mkComp(), st = styleOf("noir-red"); const d = { segments: [{ words: [{ text: "и", start: 1, end: 1.1 }] }] };
    st.anim = ANI("letFade", "letFade", { inDur: 0.5, outDur: 0.5 }); N.generate(c, prep(N.flattenWords(d), st.layout), st, st.anim, true);
    const l = subs(c)[0], life = l.outPoint - l.inPoint; const k = animators(l).map(a => selOf(a)); const s0 = k[0].property("ADBE Text Percent Start").keys, e0 = k[1].property("ADBE Text Percent End").keys;
    assert.ok(s0[1].t - s0[0].t + (e0[1].t - e0[0].t) <= life * 0.8 + 1e-9, "вход+выход должны укладываться в 80% жизни слоя");
    N.restyleLayers(c, [l], { style: null, safeWidth: 0.9, anim: ANI("pop", "fade") }); assert.strictEqual(animators(l).length, 0, "старые аниматоры должны сниматься");
    N.restyleLayers(c, [l], { style: null, safeWidth: 0.9, anim: ANI("letPop", "none") }); assert.strictEqual(animators(l).length, 1);
    N.restyleLayers(c, [l], { style: null, safeWidth: 0.9, anim: ANI("none", "none") }); assert.strictEqual(animators(l).length, 0);
  });
  await test("по буквам: если AE не создал аниматор — слой остаётся рабочим (без исключения)", () => {
    const c = mkComp(), st = styleOf("noir-red"); st.anim = ANI("letFade", "none"); const orig = mock.TextLayer.prototype.property;
    mock.TextLayer.prototype.property = function (n) { if (n === "ADBE Text Properties") throw new Error("нет такого свойства"); return orig.call(this, n); };
    try { const r = N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true); assert.strictEqual(r.created, 5); } finally { mock.TextLayer.prototype.property = orig; }
  });
  // ---------- функции: счётчик, зачёркивание, маска ----------
  const CO = (o) => Object.assign({ from: 0, to: 100, duration: 2, step: 0, interval: 0, decimals: 0, thousands: "none", pad: 0, prefix: "", suffix: "", ease: "linear",
    side: "accent", size: 0, posX: 50, posY: 50, hold: 1, start: 1 }, o || {});
  const evalCo = (o, time, inPoint) => new Function("time", "inPoint", "return eval(" + JSON.stringify(N.counterExpression(o)) + ")")(time, inPoint === undefined ? 0 : inPoint);
  await test("счётчик: выражение — линейный ход от/до, время от начала слоя, конец ровно на «до», после конца держит значение", () => {
    const o = CO({});
    assert.strictEqual(evalCo(o, 0), "0"); assert.strictEqual(evalCo(o, 1), "50"); assert.strictEqual(evalCo(o, 2), "100"); assert.strictEqual(evalCo(o, 9), "100");
    assert.strictEqual(evalCo(o, 4, 3), "50", "время считается от inPoint"); assert.strictEqual(evalCo(o, 1, 3), "0", "до начала — «от»");
    assert.strictEqual(evalCo(CO({ from: 100, to: 0 }), 1), "50", "счёт вниз");
  });
  await test("счётчик: интервал обновления, шаг, плавность, десятичные, разделители тысяч, дополнение нулями, префикс/суффикс", () => {
    assert.strictEqual(evalCo(CO({ interval: 0.5 }), 0.7), "25", "обновляется раз в 0.5 с");
    assert.strictEqual(evalCo(CO({ interval: 0.5 }), 1.99), "75"); assert.strictEqual(evalCo(CO({ interval: 0.5 }), 2), "100");
    assert.strictEqual(evalCo(CO({ step: 10 }), 0.53), "30", "шаг 10: 26.5 → 30");
    assert.strictEqual(evalCo(CO({ step: 10 }), 3), "100", "в конце ровно «до», даже если не кратно шагу"); assert.strictEqual(evalCo(CO({ to: 95, step: 10 }), 5), "95");
    assert.strictEqual(evalCo(CO({ ease: "out" }), 1), "75"); assert.strictEqual(evalCo(CO({ ease: "in" }), 1), "25"); assert.strictEqual(evalCo(CO({ ease: "inout" }), 0.5), "13");
    assert.strictEqual(evalCo(CO({ to: 1, decimals: 2 }), 1), "0.50");
    assert.strictEqual(evalCo(CO({ to: 1234567, thousands: "space" }), 9), "1 234 567"); assert.strictEqual(evalCo(CO({ to: 1234567, thousands: "comma" }), 9), "1,234,567");
    assert.strictEqual(evalCo(CO({ to: 1234.5, decimals: 1, thousands: "dot" }), 9), "1.234,5", "точка-разделитель → десятичная запятая");
    assert.strictEqual(evalCo(CO({ to: 7, pad: 3 }), 9), "007"); assert.strictEqual(evalCo(CO({ to: 96, prefix: "$", suffix: " K" }), 9), "$96 K");
    assert.strictEqual(evalCo(CO({ from: -10, to: -5 }), 9), "-5"); assert.strictEqual(evalCo(CO({ suffix: "\"%'" }), 9), "100\"%'", "кавычки в суффиксе не ломают выражение");
  });
  await test("счётчик: formatCounter совпадает с выражением; выражение не содержит запрещённого", () => {
    for (const o of [CO({ to: 1234567.891, decimals: 2, thousands: "space", prefix: "~" }), CO({ to: 5, pad: 4, suffix: "x" }), CO({ from: 20, to: -3000, thousands: "comma" })])
      assert.strictEqual(evalCo(o, 99), N.formatCounter(o.to, o));
  });
  const ANIN = (o) => Object.assign({ animIn: "none", animOut: "none", inDur: 0.3, outDur: 0.3, distance: 40, blur: 10, easeInfluence: 80 }, o || {});
  await test("createCounter: слой с выражением, таймингом (старт…старт+длительность+удержание), центр и анимация из параметров", () => {
    const c = mkComp(), st = styleOf("kinetic-stack"); st.layout.safeWidth = 0.9;
    const r = N.createCounter(c, CO({ to: 96, suffix: " K", posX: 50, posY: 40, start: 2, duration: 3, hold: 1 }), st, ANIN({ animIn: "pop", animOut: "fade" }));
    const l = r.layer; assert.ok(l instanceof mock.TextLayer); assert.strictEqual(subs(c).length, 0, "счётчик не считается субтитром");
    assert.ok(l.comment.indexOf(N.COUNTER_TAG + "|") === 0); near(l.inPoint, 2); near(l.outPoint, 6);
    assert.ok(/time - inPoint/.test(l.src.expression)); assert.ok(l.src.value.text.length >= 2, "размер считается по самой длинной записи");
    const b = N.baseOf(l); near(b[0], c.width / 2); near(b[1], c.height * 0.4);
    assert.ok(mk(l, "Scale").length >= 2 && mk(l, "Opacity").length >= 2, "вход Pop и выход Fade записаны ключами"); assert.strictEqual(l.transform.Scale.keys.length + l.transform.Opacity.keys.length, 0);
    assert.ok(mk(l, "Opacity").every(k => k.t >= 2 - 1e-9 && k.t <= 6 + 1e-9), "ключи в пределах слоя");
  });
  await test("createCounter: настройки не мутируются; обычная сторона; старт вне композиции — понятная ошибка", () => {
    const c = mkComp(), st = styleOf("kinetic-stack"), snap = JSON.stringify(st), an = ANIN({ animIn: "rise" }), asnap = JSON.stringify(an);
    N.createCounter(c, CO({ side: "base", size: 300 }), st, an); assert.strictEqual(JSON.stringify(st), snap); assert.strictEqual(JSON.stringify(an), asnap);
    assert.strictEqual(c._l[0].src.value.fontSize, 300 * c.width / N.REF_WIDTH);
    assert.throws(() => N.createCounter(c, CO({ start: 99 }), st, ANIN()), /за пределами композиции/);
    const pal = styleOf("mix-colors"); N.createCounter(c, CO({}), pal, ANIN());
  });
  const mkTexts = (c) => { gen(c, "kinetic-stack"); return subs(c).slice(0, 3); };
  const SO = (o) => Object.assign({ color: [1, 0.2, 0.1], thickness: 8, offsetY: 0, tilt: 0, padding: 10, duration: 0.3, delay: 0.1, dir: "ltr" }, o || {});
  await test("зачёркивание: фигура-полоса на каждый текстовый слой, над ним по порядку, живёт со словом; вытирание масштабом по X от привязки", () => {
    const c = mkComp(), t = mkTexts(c);
    const r = N.strikeLayers(c, t, SO(), ANIN({ animOut: "fade" })); assert.strictEqual(r.made.length, 3); assert.strictEqual(r.skipped, 0);
    for (let i = 0; i < 3; i++) {
      const s = r.made[i], tx = t[i]; assert.ok(s.comment.indexOf(N.STRIKE_TAG) === 0); assert.ok(c._l.indexOf(s) < c._l.indexOf(tx), "полоса выше текста");
      near(s.inPoint, tx.inPoint + 0.1); near(s.outPoint, tx.outPoint);
      const sc = s.transform.Scale.keys; assert.deepStrictEqual(sc.map(k => k.v[0]), [0, 100]); assert.ok(sc[1].t - sc[0].t > 0 && sc[1].t - sc[0].t <= 0.3 + 1e-9 && sc[1].t <= tx.outPoint + 1e-9);
      const rect = tx.sourceRectAtTime(), w = rect.width * 1.1; near(s.transform["Anchor Point"].value[0], 0);
      const rs = s.vectors.property("ADBE Vector Group").property("ADBE Vectors Group").property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").value; near(rs[0], w); near(rs[1], 8 * c.width / N.REF_WIDTH);
      near(s.transform.Position.value[1], N.baseOf(tx)[1]); near(s.transform.Position.value[0], N.baseOf(tx)[0] - w / 2, 1e-6);
      assert.ok(s.transform.Opacity.keys.length === 2, "уход вместе со словом");
    }
  });
  await test("зачёркивание: направление, наклон, смещение, без выхода; пустой слой пропускается; удаление по тегу не трогает остальное", () => {
    const c = mkComp(), t = mkTexts(c), n0 = c.numLayers;
    const rt = N.strikeLayers(c, [t[0]], SO({ dir: "rtl" }), ANIN()).made[0], w = t[0].sourceRectAtTime().width * 1.1;
    near(rt.transform["Anchor Point"].value[0], w); near(rt.transform.Position.value[0], N.baseOf(t[0])[0] + w / 2); assert.strictEqual(rt.transform.Opacity.keys.length, 0);
    const ce = N.strikeLayers(c, [t[1]], SO({ dir: "center" }), ANIN()).made[0]; near(ce.transform["Anchor Point"].value[0], w1(t[1])); near(ce.transform.Position.value[0], N.baseOf(t[1])[0]);
    function w1(l) { return l.sourceRectAtTime().width * 1.1 / 2; }
    const tilt = N.strikeLayers(c, [t[2]], SO({ tilt: -8, offsetY: 10 }), ANIN()).made[0]; assert.strictEqual(tilt.transform.Rotation.value, -8);
    const rad = -8 * Math.PI / 180, vx = w1(t[2]), cy = N.baseOf(t[2])[1] + 0.1 * t[2].sourceRectAtTime().height;
    near(tilt.transform.Position.value[0], N.baseOf(t[2])[0] - vx * Math.cos(rad)); near(tilt.transform.Position.value[1], cy - vx * Math.sin(rad));
    const empty = new mock.TextLayer(c, "", c._fonts); empty.sourceRectAtTime = () => ({ left: 0, top: 0, width: 0, height: 0 }); c._l.push(empty);
    assert.strictEqual(N.strikeLayers(c, [empty], SO(), ANIN()).skipped, 1);
    assert.strictEqual(N.removeByTag(c, N.STRIKE_TAG), 3); assert.strictEqual(c.numLayers, n0 + 1);
  });
  await test("зачёркивание: очень короткое слово — вытирание укладывается в жизнь слоя", () => {
    const c = mkComp(), t = mkTexts(c)[0]; t.inPoint = 1; t.outPoint = 1.1;
    const s = N.strikeLayers(c, [t], SO({ duration: 5, delay: 5 }), ANIN()).made[0]; assert.ok(s.inPoint >= 1 && s.inPoint < s.outPoint && s.outPoint <= 1.1 + 1e-9);
    assert.ok(s.transform.Scale.keys.every(k => k.t <= s.outPoint + 1e-9));
  });
  const MO = (o) => Object.assign({ mode: "video", invert: false, restart: false, hideSource: true, color: [0, 0, 0], opacity: 100 }, o || {});
  const mkVideo = (c) => { const v = new mock.AVLayer(c, "clip.mp4"); v.inPoint = 0; v.outPoint = 30; c._l.push(v); return v; };
  await test("маска: видео внутри букв — копия видео под текстом, Alpha Matte, текст скрыт, оригинал скрыт, время по тексту", () => {
    const c = mkComp(), t = mkTexts(c), v = mkVideo(c); const n0 = c.numLayers;
    const r = N.maskTextLayers(c, t, v, MO()); assert.strictEqual(r.made.length, 3); assert.strictEqual(c.numLayers, n0 + 3);
    for (let i = 0; i < 3; i++) {
      const m = r.made[i]; assert.strictEqual(m.trackMatteLayer, t[i]); assert.strictEqual(m.trackMatteType, TrackMatteType.ALPHA);
      assert.strictEqual(c._l.indexOf(m), c._l.indexOf(t[i]) + 1, "прямо под текстом"); near(m.inPoint, t[i].inPoint); near(m.outPoint, t[i].outPoint);
      assert.ok(m.comment.indexOf(N.MASK_TAG) === 0 && m !== v); assert.strictEqual(t[i].enabled, false);
    }
    assert.strictEqual(v.enabled, false); assert.strictEqual(subs(c).length, 5, "субтитры не задеты");
  });
  await test("маска: инверсия матта, перезапуск клипа с начала слова, оригинал остаётся видимым; без видео — понятная ошибка", () => {
    const c = mkComp(), t = mkTexts(c), v = mkVideo(c);
    const m = N.maskTextLayers(c, [t[0]], v, MO({ invert: true, restart: true, hideSource: false })).made[0];
    assert.strictEqual(m.trackMatteType, TrackMatteType.ALPHA_INVERTED); near(m.startTime, t[0].inPoint); assert.strictEqual(v.enabled, true);
    assert.throws(() => N.maskTextLayers(c, [t[1]], null, MO()), /видео\/фото слой/);
  });
  await test("маска: вырез (буквы прозрачны) — сплошной слой с обратным матом, без исходного видео; снятие масок возвращает текст", () => {
    const c = mkComp(), t = mkTexts(c), n0 = c.numLayers;
    const r = N.maskTextLayers(c, t, null, MO({ mode: "cut", color: [0.1, 0.1, 0.1], opacity: 80 }));
    assert.strictEqual(r.made[0].trackMatteType, TrackMatteType.ALPHA_INVERTED); assert.strictEqual(r.made[0].transform.Opacity.value, 80); assert.deepStrictEqual(r.made[0].solidColor, [0.1, 0.1, 0.1]);
    assert.strictEqual(N.removeMasks(c), 3); assert.strictEqual(c.numLayers, n0); assert.ok(t.every(x => x.enabled === true), "текст снова виден");
  });
  await test("все слои сразу + пользовательский слой без тега", () => {
    const c = mkComp(), st = styleOf("kinetic-stack"); gen(c, "kinetic-stack");
    const user = new mock.TextLayer(c, "мой текст", c._fonts); user.inPoint = 1; user.outPoint = 3; c._l.push(user);
    user.transform.Position.value = [300, 700, 0];
    const all2 = c._l.slice();
    const r = N.restyleLayers(c, all2, { style: st.accent, accent: true, safeWidth: 0.88, anim: st.anim });
    assert.strictEqual(r.changed, all2.length);
    assert.ok(all2.every(l => JSON.stringify(l.src.value.fillColor) === JSON.stringify(st.accent.color)));
    assert.ok(!N.isGenerated(user), "пользовательский слой получил тег");
    assert.deepStrictEqual(N.baseOf(user).slice(0, 2), [300, 700]);
  });

  console.log("SFX");
  const LIB = N.sfxLibrary(ROOT);
  await test("библиотека SFX: все категории стартового набора, файлы только аудио, пути существуют", () => {
    for (const c of ["whoosh", "pop", "hit", "click", "rise", "shimmer", "morph", "counter", "blur_out", "scale_down", "glitch"]) assert.ok(LIB.files[c] && LIB.files[c].length, "нет категории " + c);
    assert.ok(Object.values(LIB.files).flat().every(f => fs.existsSync(f) && /\.wav$/.test(f)));
    assert.deepStrictEqual(LIB.names, LIB.names.slice().sort());
  });
  await test("библиотека SFX: пользовательская папка (категория = подпапка), чужие файлы игнорируются", () => {
    const ud = path.join(TMP, "userData", "NOIR Captions", "sfx"); fs.mkdirSync(path.join(ud, "мой пак"), { recursive: true });
    fs.writeFileSync(path.join(ud, "мой пак", "стук.wav"), "x"); fs.writeFileSync(path.join(ud, "мой пак", "заметки.txt"), "x"); fs.writeFileSync(path.join(ud, "loose.mp3"), "x");
    const lib = N.sfxLibrary(ROOT);
    assert.ok(lib.files["мой пак"].length === 1 && /стук\.wav$/.test(lib.files["мой пак"][0])); assert.strictEqual(lib.files.other.length, 1);
    assert.ok(lib.files.whoosh.length >= 3, "встроенные пропали");
  });
  await test("категория по имени: text_shimmer, blur_out_03, Title_Scale_Down, «Счётчик», whoosh 2… (и не путает похожие слова)", () => {
    const g = N.sfxGuessCategory;
    assert.deepStrictEqual(["text_shimmer.wav", "blur_out_03.wav", "Title_Scale_Down.mp3", "Счётчик 1.wav", "Swoosh-fast.wav", "UI_Click_2.wav", "big impact.wav", "Riser 3.wav", "Pop.wav", "Glitch_x.wav", "Смена слова.wav", "morph.wav", "counter.wav"].map(g),
      ["shimmer", "blur_out", "scale_down", "counter", "whoosh", "click", "hit", "rise", "pop", "glitch", "morph", "morph", "counter"]);
    ["popcorn.wav", "white.wav", "ticket.wav", "bonk.wav"].forEach(n => assert.strictEqual(g(n), null, n));
  });
  const userSfx = path.join(TMP, "userData", "NOIR Captions", "sfx");
  const withUserFiles = (files, fn) => {
    for (const f of files) { fs.mkdirSync(path.dirname(path.join(userSfx, f)), { recursive: true }); fs.writeFileSync(path.join(userSfx, f), "x"); }
    try { fn(); } finally { for (const f of files) { fs.rmSync(path.join(userSfx, f), { force: true }); const d = path.dirname(path.join(userSfx, f)); if (d !== userSfx && !fs.readdirSync(d).length) fs.rmdirSync(d); } }
  };
  await test("свои звуки главнее базовых: категория берёт только свои; «подмешивать» добавляет базовые; помечаются ★ (source)", () => {
    withUserFiles(["shimmer/мой_блеск.wav"], () => {
      const lib = N.sfxLibrary(ROOT); assert.deepStrictEqual(lib.files.shimmer.map(p => path.basename(p)), ["мой_блеск.wav"]);
      assert.strictEqual(lib.source[lib.files.shimmer[0]], "user"); assert.ok(lib.files.whoosh.every(p => lib.source[p] === "base"), "остальные категории — базовые");
      const mix = N.sfxLibrary(ROOT, { mixBase: true }); assert.strictEqual(mix.files.shimmer.length, 3); assert.ok(mix.files.shimmer.some(p => lib.source[p] === "base"));
    });
    assert.ok(N.sfxLibrary(ROOT).files.shimmer.length === 2, "после удаления своих — снова базовые");
  });
  await test("пак из Telegram: файлы лежат в куче/в одной папке — категории определяются по именам", () => {
    withUserFiles(["text_shimmer.wav", "pack41/blur_out_03.wav", "pack41/Title_Scale_Down.wav", "pack41/bonk.wav", "pack41/counter-fast.mp3", "pack41/заметки.txt"], () => {
      const lib = N.sfxLibrary(ROOT), nm = (c) => (lib.files[c] || []).map(p => path.basename(p));
      assert.deepStrictEqual(nm("shimmer"), ["text_shimmer.wav"]); assert.deepStrictEqual(nm("blur_out"), ["blur_out_03.wav"]);
      assert.deepStrictEqual(nm("scale_down"), ["Title_Scale_Down.wav"]); assert.deepStrictEqual(nm("counter"), ["counter-fast.mp3"]);
      assert.deepStrictEqual(nm("pack41"), ["bonk.wav"], "нераспознанный файл — в категорию по имени папки"); assert.ok(!Object.values(lib.files).flat().some(p => /\.txt$/.test(p)));
      assert.ok(lib.files.whoosh.length >= 3 && lib.files.hit.length >= 2, "не затронутые категории остались базовыми");
    });
  });
  await test("авто-озвучивание использует свои звуки, если они есть", () => {
    withUserFiles(["pop/свой_поп.wav"], () => {
      const lib = N.sfxLibrary(ROOT), p = N.planSfx([{ t: 0, kind: "in", accent: false, anim: "pop" }], lib, Object.assign({}, { appear: { mode: "auto" }, accent: { mode: "same" }, exit: { mode: "off" }, db: -6, dbRand: 0, minGap: 0 }));
      assert.ok(/свой_поп\.wav$/.test(p[0].file));
    });
  });
  const CFG = { appear: { mode: "auto" }, accent: { mode: "same" }, exit: { mode: "off" }, db: -6, dbRand: 0, minGap: 0.1 };
  await test("авто-подбор: pop→pop, slam→hit, whip→whoosh, none→click; выход blur→blur_out; чередование файлов", () => {
    const ev = (anim, t, extra) => Object.assign({ t, kind: "in", accent: false, anim }, extra);
    const cats = (list, cfg) => N.planSfx(list, LIB, cfg || CFG).map(p => p.cat);
    assert.deepStrictEqual(cats([ev("pop", 0), ev("slam", 1), ev("whipL", 2), ev("none", 3), ev("fade", 4)]), ["pop", "hit", "whoosh", "click", "shimmer"]);
    assert.deepStrictEqual(cats([ev("blur", 0, { kind: "out" })], Object.assign({}, CFG, { exit: { mode: "auto" } })), ["blur_out"]);
    const p = N.planSfx([ev("pop", 0), ev("pop", 1), ev("pop", 2), ev("pop", 3)], LIB, CFG);
    assert.strictEqual(new Set(p.slice(0, 3).map(x => x.file)).size, 3, "файлы не чередуются"); assert.strictEqual(p[3].file, p[0].file);
  });
  await test("режимы: выкл, конкретная категория, «акцент = другой звук», «как появление»", () => {
    const evs = [{ t: 0, kind: "in", accent: false, anim: "pop" }, { t: 1, kind: "in", accent: true, anim: "pop" }];
    assert.deepStrictEqual(N.planSfx(evs, LIB, Object.assign({}, CFG, { appear: { mode: "off" }, accent: { mode: "same" } })), []);
    assert.deepStrictEqual(N.planSfx(evs, LIB, Object.assign({}, CFG, { appear: { mode: "cat", value: "hit" } })).map(p => p.cat), ["hit", "hit"]);
    assert.deepStrictEqual(N.planSfx(evs, LIB, Object.assign({}, CFG, { accent: { mode: "cat", value: "shimmer" } })).map(p => p.cat), ["pop", "shimmer"]);
    assert.deepStrictEqual(N.planSfx(evs, LIB, Object.assign({}, CFG, { appear: { mode: "off" }, accent: { mode: "cat", value: "shimmer" } })).map(p => p.cat), ["shimmer"]);
  });
  await test("мин. интервал: близкие звуки пропускаются, акцент вытесняет обычный", () => {
    const e = (t, accent) => ({ t, kind: "in", accent, anim: "pop" });
    assert.strictEqual(N.planSfx([e(0), e(0.05), e(0.2), e(0.25)], LIB, CFG).length, 2);
    const p = N.planSfx([e(0, false), e(0.05, true)], LIB, Object.assign({}, CFG, { accent: { mode: "cat", value: "hit" } }));
    assert.strictEqual(p.length, 1); assert.strictEqual(p[0].cat, "hit"); near(p[0].t, 0.05);
    assert.strictEqual(N.planSfx([e(0), e(0.05)], LIB, Object.assign({}, CFG, { minGap: 0 })).length, 2);
  });
  await test("нет нужной категории: запасная (whoosh/pop/click); пустая библиотека — пустой план", () => {
    const lib = { names: ["click"], files: { click: ["/x/c.wav"] } };
    assert.strictEqual(N.planSfx([{ t: 0, kind: "in", accent: false, anim: "slam" }], lib, CFG)[0].cat, "click");
    assert.deepStrictEqual(N.planSfx([{ t: 0, kind: "in", accent: false, anim: "slam" }], { names: [], files: {} }, CFG), []);
  });
  await test("громкость: разброс повторяем и укладывается в ±dbRand", () => {
    const evs = []; for (let i = 0; i < 20; i++) evs.push({ t: i, kind: "in", accent: false, anim: "pop" });
    const c = Object.assign({}, CFG, { db: -6, dbRand: 3 }), a = N.planSfx(evs, LIB, c), b = N.planSfx(evs, LIB, c);
    assert.deepStrictEqual(a.map(p => p.db), b.map(p => p.db)); assert.ok(a.every(p => p.db >= -9 - 1e-9 && p.db <= -3 + 1e-9)); assert.ok(new Set(a.map(p => p.db)).size > 5);
  });
  await test("события из слоёв: появление на inPoint, выход за outDur до outPoint, акцент по метке", () => {
    const c = mkComp(); gen(c); const ls = subs(c).slice(0, 2); ls[1].label = 11;
    const ev = N.sfxEventsFromLayers(ls, { animIn: "pop", animOut: "blur", outDur: 0.2 });
    assert.strictEqual(ev.length, 4); near(ev[0].t, ls[0].inPoint); near(ev[1].t, Math.max(ls[0].inPoint, ls[0].outPoint - 0.2)); assert.strictEqual(ev[2].accent, true);
    assert.strictEqual(N.sfxEventsFromLayers(ls, { animIn: "pop", animOut: "none", outDur: 0.2 }).length, 2);
  });
  await test("расстановка в AE: слои в нужное время, громкость, метка; звук импортируется один раз", () => {
    const c = mkComp({ duration: 10 }); gen(c); const textCount = c.numLayers;
    const plan = N.planSfx([{ t: 1, kind: "in", accent: false, anim: "pop" }, { t: 2, kind: "in", accent: false, anim: "pop" }, { t: 4, kind: "in", accent: false, anim: "pop" }, { t: 20, kind: "in", accent: false, anim: "pop" }],
      { names: ["pop"], files: { pop: [LIB.files.pop[0]] } }, Object.assign({}, CFG, { db: -9 }));
    const r = N.placeSfx(c, plan);
    assert.strictEqual(r.placed, 3, "пятый — за пределами композиции"); const sfx = c._l.filter(l => String(l.comment).indexOf(N.SFX_TAG) === 0);
    assert.deepStrictEqual(sfx.map(l => l.startTime).sort((a, b) => a - b), [1, 2, 4]); assert.ok(sfx.every(l => l.label === 13 && /^NOIR SFX · pop_1$/.test(l.name)));
    assert.deepStrictEqual(sfx[0].audioLevels.value, [-9, -9]);
    const footage = global.app.project._items.filter(i => i instanceof mock.FootageItem && /pop_1\.wav$/.test(i.mainSource.file.fsName)); assert.strictEqual(footage.length, 1, "импортирован не один раз");
    assert.ok(global.app.project._items.some(i => i instanceof mock.FolderItem && i.name === "NOIR SFX"));
    assert.strictEqual(c._l.indexOf(sfx[0]) >= textCount, true, "звук должен лежать под текстом");
    assert.strictEqual(N.removeSfx(c), 3); assert.strictEqual(c.numLayers, textCount);
  });
  await test("расстановка: нет файла — предупреждение, остальные звуки ставятся", () => {
    const c = mkComp({ duration: 10 });
    const r = N.placeSfx(c, [{ t: 1, file: "/nope/missing.wav", cat: "x", db: 0 }, { t: 2, file: LIB.files.hit[0], cat: "hit", db: 0 }]);
    assert.strictEqual(r.placed, 1); assert.strictEqual(r.warnings.length, 1); assert.ok(/missing/.test(r.warnings[0]));
  });

  await test("инверсия для SVG/картинки: белая заливка с альфой + Difference; повторно — снимает; текст и SVG вместе", () => {
    const c = mkComp(); gen(c); const t = subs(c)[0], v = new mock.AVLayer(c, "logo.svg"); c._l.push(v);
    const a = N.createApp(ROOT);
    t.selected = v.selected = true;
    a.call("layers.invert");
    assert.strictEqual(v.blendingMode, BlendingMode.DIFFERENCE); assert.strictEqual(t.blendingMode, BlendingMode.DIFFERENCE);
    assert.strictEqual(v.effects.length, 1); assert.strictEqual(v.effects[0].matchName, "ADBE Fill"); assert.deepStrictEqual(v.effects[0].property("ADBE Fill-0002").value, [1, 1, 1, 1]);
    a.call("layers.invert"); assert.strictEqual(v.blendingMode, BlendingMode.NORMAL); assert.strictEqual(v.effects.length, 0);
    t.selected = v.selected = false; assert.throws(() => a.call("layers.invert"), /Выделите/);
  });
  console.log("трёхшаговый редактор");
  await test("ручной перенос создаёт разные строки даже в режиме целой фразы и переживает reflow", () => {
    const c = mkComp(), st = styleOf("interview-clean"); st.layout.autoAccent = false;
    const words = N.applyEdits(sample(), N.toEditorText(sample()).replace("это", "↵ это"), []);
    const gs = prep(words, st.layout); N.generate(c, gs, st, st.anim, true);
    const layers = subs(c), flagged = layers.filter(l => N.groupInfo(l).lineBefore);
    assert.ok(flagged.length > 0);
    N.reflowGroups(c, layers, st.layout);
    assert.ok(flagged.every(l => N.groupInfo(l).lineBefore));
  });
  await test("интенсивность меняет масштаб Pop, не меняя тайминги", () => {
    const c = mkComp(), st = styleOf("reels-glow");
    st.anim.intensity = .5;
    N.generate(c, prep(N.flattenWords(sample()), st.layout), st, st.anim, true);
    const keys = mk(subs(c)[0], "Scale");
    assert.ok(keys.some(k => Math.abs(k.v[0] - 85) < .001));
  });

  console.log("несколько аудиослоёв, свободное положение, вкладка «Правка»");
  const genSrc = (c, key, replace, anim) => {
    const st = styleOf("reels-glow"); st.layout.autoAccent = false;
    const gs = prep(N.flattenWords(sample()), st.layout); gs.forEach(g => (g.sourceKey = key));
    return N.generate(c, gs, st, anim || st.anim, replace);
  };
  const ofSrc = (c, key) => subs(c).filter(l => N.layerSource(l) === key);
  await test("замена по источнику: субтитры второго аудиослоя не удаляют субтитры первого", () => {
    const c = mkComp(); genSrc(c, "sA", "sA"); const a = ofSrc(c, "sA").length; assert.ok(a > 0);
    const r = genSrc(c, "sB", "sB");
    assert.strictEqual(r.removed, 0); assert.strictEqual(ofSrc(c, "sA").length, a, "субтитры первого слоя пропали");
    assert.ok(ofSrc(c, "sB").length > 0);
    const r2 = genSrc(c, "sA", "sA");
    assert.strictEqual(r2.removed, a); assert.strictEqual(ofSrc(c, "sA").length, a, "повтор того же слоя не дублирует");
    assert.ok(ofSrc(c, "sB").length > 0, "чужие субтитры не тронуты при замене");
    const legacy = c.layers.addText("старый"); legacy.comment = N.LAYER_TAG + "|1|2|g-0|0||0|";
    genSrc(c, "sA", "sA"); assert.ok(c._l.includes(legacy), "слой без метки источника не удаляется заменой по источнику");
    N.removeGenerated(c); assert.strictEqual(subs(c).length, 0, "без ключа — убираются все");
  });
  await test("sourceKey различает слои с одинаковым именем по id слоя; старые ссылки без id дают прежний ключ", () => {
    const d = sample(), base = { compId: 1, layerName: "clip.mp4", layerIndex: 2, startTime: 0, stretch: 100 };
    const k1 = N.sourceKey(d, Object.assign({ layerId: 11 }, base)), k2 = N.sourceKey(d, Object.assign({ layerId: 12 }, base));
    assert.notStrictEqual(k1, k2);
    const old = N.sourceKey(d, base); assert.notStrictEqual(old, k1); assert.strictEqual(old, N.sourceKey(d, Object.assign({}, base)));
  });
  await test("анимация не ставит ключи в Position: слой можно двигать, сдвиг входа/выхода — аниматором NOIR Move", () => {
    const c = mkComp(), anim = { animIn: "rise", inDur: 0.3, animOut: "left", outDur: 0.2, distance: 60, blur: 0, easeInfluence: 80 };
    genSrc(c, "sA", "sA", anim);
    for (const l of subs(c)) {
      assert.strictEqual(l.transform.Position.keys.length, 0, l.name);
      const mv = l.textProps.property("ADBE Text Animators").kids.filter(x => x.name === "NOIR Move");
      assert.strictEqual(mv.length, 1);
      const k = mv[0].property("ADBE Text Animator Properties").property("ADBE Text Position 3D").keys;
      assert.ok(k[0].v[1] > 0 && k[k.length - 1].v[0] < 0, "вход снизу, выход влево");
    }
    const l = subs(c)[0]; l.transform.Position.value = [100, 200, 0];
    assert.deepStrictEqual(N.baseOf(l), [100, 200]);
    N.restyleLayers(c, [l], { style: null, safeWidth: 0.88, anim });
    assert.deepStrictEqual(l.transform.Position.value.slice(0, 2), [100, 200], "смена анимации не возвращает слой на старое место");
    assert.strictEqual(l.textProps.property("ADBE Text Animators").kids.filter(x => x.name === "NOIR Move").length, 1, "аниматор не копится");
  });
  await test("Scale, Rotation и Opacity слоя без ключей: Pop/Rotate/Slam идут аниматором; якорь группы «All»; центр не уезжает по вертикали", () => {
    for (const id of ["pop", "punch", "zoom", "slam", "grow", "rotate", "blurPop", "rise", "fade"]) {
      const c = mkComp(), anim = { animIn: id, inDur: 0.3, animOut: id === "rise" ? "up" : "shrink", outDur: 0.2, distance: 60, blur: 10, easeInfluence: 80 };
      genSrc(c, "sA", "sA", anim);
      for (const l of subs(c)) {
        for (const k of ["Scale", "Rotation", "Opacity", "Position"]) assert.strictEqual(l.transform[k].keys.length, 0, id + " " + k);
        assert.ok(moveGroup(l), id + ": нет NOIR Move");
      }
    }
    const c = mkComp(); genSrc(c, "sA", "sA", { animIn: "pop", inDur: 0.3, animOut: "none", outDur: 0, distance: 0, blur: 0, easeInfluence: 80 });
    const l = subs(c)[0], more = l.textProps.property("ADBE Text More Options");
    assert.strictEqual(more.property("ADBE Text Anchor Point Option").value, 4);
    const dy = -(l.sourceRectAtTime().top + l.sourceRectAtTime().height / 2), sc = mk(l, "Scale"), ps = mk(l, "Position");
    assert.ok(ps.length >= sc.length, "позиция компенсируется на тех же кадрах, что и масштаб");
    sc.forEach(k => { const p = ps.find(q => Math.abs(q.t - k.t) < 1e-9); near(p.v[1], (-dy) * (1 - k.v[0] / 100), 1e-6); near(p.v[0], 0, 1e-9); });
    const before = N.PIVOT_BASELINE; N.PIVOT_BASELINE = false;
    try { const c2 = mkComp(); genSrc(c2, "sA", "sA", { animIn: "pop", inDur: 0.3, animOut: "none", outDur: 0, distance: 0, blur: 0, easeInfluence: 80 }); assert.strictEqual(mk(subs(c2)[0], "Position").length, 0, "без компенсации позиция не трогается"); } finally { N.PIVOT_BASELINE = before; }
  });
  await test("Scale слоя можно менять вручную: значение не создаёт ключей, регенерация его не ломает; старые слои с ключами переводятся на аниматор", () => {
    const c = mkComp(), anim = { animIn: "pop", inDur: 0.3, animOut: "none", outDur: 0, distance: 0, blur: 0, easeInfluence: 80 };
    genSrc(c, "sA", "sA", anim); const l = subs(c)[0]; l.transform.Scale.value = [130, 130, 100];
    N.restyleLayers(c, [l], { style: null, safeWidth: 0.88, anim });
    assert.deepStrictEqual(l.transform.Scale.value, [130, 130, 100], "ручной Scale сохранён"); assert.strictEqual(l.transform.Scale.keys.length, 0);
    const old = c.layers.addText("старый"); old.comment = N.LAYER_TAG + "|10|10|g-9|0||0|sZ"; old.transform.Scale.keys = [{ t: 0, v: [70, 70, 100] }, { t: 0.3, v: [100, 100, 100] }];
    N.restyleLayers(c, [old], { style: null, safeWidth: 0.88, anim });
    assert.strictEqual(old.transform.Scale.keys.length, 0, "старые ключи убраны"); assert.ok(mk(old, "Scale").length >= 2);
  });
  await test("аниматор не создан AE — запасной путь: ключи слоя как раньше", () => {
    const c = mkComp(), st = styleOf("reels-glow"), orig = mock.TextLayer.prototype.property;
    mock.TextLayer.prototype.property = function (n) { if (n === "ADBE Text Properties") throw new Error("нет"); return orig.call(this, n); };
    try { const gs = prep(N.flattenWords(sample()), st.layout); N.generate(c, gs, st, { animIn: "pop", inDur: 0.3, animOut: "fade", outDur: 0.2, distance: 40, blur: 0, easeInfluence: 80 }, true);
      assert.ok(subs(c).every(l => l.transform.Scale.keys.length >= 2 && l.transform.Opacity.keys.length >= 2), "слой остаётся анимированным"); } finally { mock.TextLayer.prototype.property = orig; }
  });
  const allKeyTimes = (l) => { const t = []; const g = moveGroup(l); const walk = (n) => { if (n.keys) n.keys.forEach(k => t.push(k.t)); if (n.kids) n.kids.forEach(walk); }; if (g) walk(g); return t; };
  await test("время: сдвиг переносит слой и ключи анимации на ту же величину", () => {
    const c = mkComp(), anim = { animIn: "pop", inDur: 0.3, animOut: "fade", outDur: 0.2, distance: 40, blur: 0, easeInfluence: 80 };
    genSrc(c, "sA", "sA", anim); const l = subs(c)[0], in0 = l.inPoint, out0 = l.outPoint, k0 = allKeyTimes(l); assert.ok(k0.length >= 4, "в тесте должны быть ключи анимации");
    N.retimeLayers(c, [l], { shift: 0.5 });
    near(l.inPoint, in0 + 0.5); near(l.outPoint, out0 + 0.5);
    allKeyTimes(l).forEach((t, i) => near(t, k0[i] + 0.5, 1e-9));
    N.retimeLayers(c, [l], { shift: -0.5 }); near(l.inPoint, in0); allKeyTimes(l).forEach((t, i) => near(t, k0[i], 1e-9));
  });
  await test("время: начало двигает только вход, конец — только выход; ключи остаются внутри слоя", () => {
    const c = mkComp(), anim = { animIn: "pop", inDur: 0.3, animOut: "fade", outDur: 0.2, distance: 40, blur: 0, easeInfluence: 80 };
    genSrc(c, "sA", "sA", anim); const l = subs(c)[0]; l.inPoint = 1; l.outPoint = 4;
    const before = allKeyTimes(l); N.applyAnimation(l, N.baseOf(l), 1, 4, Object.assign({ opacity: 100 }, anim));
    const k1 = allKeyTimes(l);
    N.retimeLayers(c, [l], { dIn: -0.4 }); near(l.inPoint, 0.6); near(l.outPoint, 4);
    const k2 = allKeyTimes(l); assert.strictEqual(k2.length, k1.length);
    k1.forEach((t, i) => near(k2[i], t < 2.5 ? t - 0.4 : t, 1e-9));
    N.retimeLayers(c, [l], { dOut: 0.7 }); near(l.outPoint, 4.7);
    allKeyTimes(l).forEach(t => assert.ok(t >= l.inPoint - 1e-9 && t <= l.outPoint + 1e-9, "ключ вне слоя"));
    assert.ok(Math.max(...allKeyTimes(l)) > 4.4, "выход уехал за концом");
  });
  await test("время: слой нельзя сделать короче, чем нужно для входа и выхода; границы композиции соблюдаются", () => {
    const c = mkComp({ duration: 10 }), anim = { animIn: "pop", inDur: 0.3, animOut: "fade", outDur: 0.2, distance: 40, blur: 0, easeInfluence: 80 };
    genSrc(c, "sA", "sA", anim); const l = subs(c)[0]; l.inPoint = 1; l.outPoint = 3; N.applyAnimation(l, N.baseOf(l), 1, 3, Object.assign({ opacity: 100 }, anim));
    N.retimeLayers(c, [l], { dIn: 5 });
    assert.ok(l.outPoint - l.inPoint >= 0.5 - 1e-9, "минимум = вход + выход"); allKeyTimes(l).forEach(t => assert.ok(t >= l.inPoint - 1e-9 && t <= l.outPoint + 1e-9));
    N.retimeLayers(c, [l], { shift: -50 }); assert.ok(l.inPoint >= 0);
    N.retimeLayers(c, [l], { shift: 50 }); assert.ok(l.outPoint <= 10 + 1e-9);
    const locked = subs(c)[1]; locked.locked = true; const li = locked.inPoint; N.retimeLayers(c, [locked], { shift: 1 }); assert.strictEqual(locked.inPoint, li, "заблокированный слой не меняется");
  });
  const omPhrase = (words) => ({ segments: [{ words: words.map((w, i) => ({ text: w.t, start: i * 0.35, end: i * 0.35 + 0.3, accent: w.a })) }] });
  const omGen = (c, d, tweak) => { const st = styleOf("old-money"); st.layout.autoAccent = false; if (tweak) tweak(st); const words = N.applyEdits(d, d.segments[0].words.map(w => (w.accent ? "*" + w.text + "*" : w.text)).join(" "), []); const gs = prep(words, st.layout); gs.forEach(g => (g.sourceKey = "sOM")); return { st, r: N.generate(c, gs, st, st.anim, true) }; };
  await test("OLD MONEY: акценты — в верхней зоне, мелкие слова — на уровне груди; два блока по центру", () => {
    const c = mkComp(); const { st } = omGen(c, omPhrase([{ t: "let" }, { t: "me", a: true }, { t: "be" }, { t: "the" }, { t: "first", a: true }, { t: "to" }, { t: "say" }]));
    const accent = subs(c).filter(l => l.label === 11), base = subs(c).filter(l => l.label !== 11);
    assert.ok(accent.length === 2 && base.length === 5, accent.length + "/" + base.length);
    const cy = (ls) => { const b = ls.map(l => ({ y: N.baseOf(l)[1], h: l.sourceRectAtTime().height })); return (Math.min(...b.map(x => x.y - x.h / 2)) + Math.max(...b.map(x => x.y + x.h / 2))) / 2; };
    near(cy(accent), c.height * st.layout.accentPosY / 100, 1e-6); near(cy(base), c.height * st.layout.posY / 100, 1e-6);
    assert.ok(cy(accent) < cy(base), "акценты выше");
    const cx = (ls) => { const b = ls.map(l => ({ x: N.baseOf(l)[0], w: l.sourceRectAtTime().width })); return (Math.min(...b.map(x => x.x - x.w / 2)) + Math.max(...b.map(x => x.x + x.w / 2))) / 2; };
    near(cx(accent), c.width / 2, 1); near(cx(base), c.width / 2, 1);
  });
  await test("OLD MONEY: разные анимации — blurPop у акцентов, blurRise у мелких; палитра акцентов; без акцента — как обычно", () => {
    const c = mkComp(); omGen(c, omPhrase([{ t: "let" }, { t: "me", a: true }, { t: "property", a: true }, { t: "be" }]));
    const acc = subs(c).filter(l => l.label === 11), base = subs(c).filter(l => l.label !== 11);
    acc.forEach(l => { assert.ok(mk(l, "Scale").length >= 3, "blurPop: масштаб с перелётом"); assert.strictEqual(l.transform.Scale.keys.length, 0); });
    base.forEach(l => { assert.strictEqual(mk(l, "Scale").length, 0, "blurRise без масштаба"); assert.ok(mk(l, "Position").length >= 2, "подъём"); });
    const inDur = (l) => { const t = mk(l, "Scale").map(k => k.t); return t.length ? Math.max(...t.filter(x => x <= l.inPoint + 0.5)) - l.inPoint : 0; };
    assert.ok(Math.abs(inDur(acc[0]) - 0.24) < 0.02, "accentInDur = 0.24");
    const colours = acc.map(l => JSON.stringify(l.src.value.fillColor)); assert.strictEqual(new Set(colours).size, 2, "акценты разных цветов из палитры");
    const c2 = mkComp(); omGen(c2, omPhrase([{ t: "a" }, { t: "b" }, { t: "c" }])); assert.strictEqual(subs(c2).length, 3);
  });
  await test("OLD MONEY: слова копятся (reveal word), старые слои без accentPosY ведут себя как раньше", () => {
    const c = mkComp(); omGen(c, omPhrase([{ t: "let" }, { t: "me", a: true }, { t: "be" }]));
    const ls = subs(c); const ins = ls.map(l => l.inPoint).sort((a, b) => a - b); assert.ok(ins[2] > ins[0], "появляются по очереди");
    assert.ok(ls.every(l => Math.abs(l.outPoint - ls[0].outPoint) < 1e-9), "держатся до конца фразы");
    const c3 = mkComp(); omGen(c3, omPhrase([{ t: "let" }, { t: "me", a: true }]), st => { delete st.layout.accentPosY; });
    const ys = new Set(subs(c3).map(l => Math.round(N.baseOf(l)[1]))); assert.ok(ys.size >= 1);
  });
  await test("автоперекладка при зонах: акценты и мелкие слова перекладываются каждый вокруг своего центра", () => {
    const c = mkComp(); const { st } = omGen(c, omPhrase([{ t: "let" }, { t: "me", a: true }, { t: "be" }, { t: "first", a: true }]));
    const acc = subs(c).filter(l => l.label === 11), yA = acc.map(l => N.baseOf(l)[1]);
    const r = N.reflowGroups(c, subs(c), st.layout); assert.strictEqual(r.groups, 1);
    acc.forEach((l, i) => near(N.baseOf(l)[1], yA[i], 1e-6));
    const base = subs(c).filter(l => l.label !== 11); assert.ok(Math.abs(N.baseOf(base[0])[1] - c.height * st.layout.posY / 100) < c.height * 0.05);
  });
  const faceStyle = () => { const st = styleOf("old-money"); st.layout.autoAccent = false; return st; };
  const genOM = (c, list) => { const st = faceStyle(); const d = omPhrase(list); const words = N.applyEdits(d, d.segments[0].words.map(w => (w.accent ? "*" + w.text + "*" : w.text)).join(" "), []); const gs = prep(words, st.layout); gs.forEach(g => (g.sourceKey = "sFace")); N.generate(c, gs, st, st.anim, true); return st; };
  const boxY = (ls, c) => { const b = ls.map(l => ({ y: N.baseOf(l)[1], h: l.sourceRectAtTime().height })); return { top: Math.min(...b.map(x => x.y - x.h / 2)) / c.height, bottom: Math.max(...b.map(x => x.y + x.h / 2)) / c.height }; };
  await test("«за человеком»: слои NOIR встают под выбранный слой, порядок сохраняется, чужие и заблокированные не трогаются", () => {
    const c = mkComp(); const { r } = omGen(c, omPhrase([{ t: "let" }, { t: "me", a: true }, { t: "be" }]));
    const video = c.layers.addText("видео без человека"); video.comment = ""; c._l.splice(c._l.indexOf(video), 1); c._l.unshift(video);
    const mine = subs(c).slice(), before = mine.map(l => l.index);
    const res = N.placeBehind(c, mine, video); assert.strictEqual(res.moved, mine.length);
    assert.ok(mine.every(l => l.index > video.index), "все ниже выбранного слоя");
    assert.deepStrictEqual(mine.map(l => l.index).sort((a, b) => a - b), mine.map(l => l.index).slice().sort((a, b) => a - b));
    assert.deepStrictEqual(mine.slice().sort((a, b) => a.index - b.index), mine.slice().sort((a, b) => before[mine.indexOf(a)] - before[mine.indexOf(b)]), "порядок слоёв сохранён");
  });
  await test("лицо: мелкий текст — ниже лица, акценты — выше головы; ничего не заходит на лицо; по горизонтали не двигается", () => {
    const c = mkComp(), st = genOM(c, [{ t: "let" }, { t: "me", a: true }, { t: "be" }, { t: "first" }]);
    const face = { x: 0.35, y: 0.30, w: 0.3, h: 0.2 }, xs = subs(c).map(l => N.baseOf(l)[0]);
    const r = N.avoidFace(c, subs(c), face, st.layout);
    const acc = subs(c).filter(l => l.label === 11), base = subs(c).filter(l => l.label !== 11);
    const faceTop = face.y - 0.45 * face.h, faceBottom = face.y + face.h + 0.15 * face.h;
    assert.ok(boxY(base, c).top >= faceBottom, "мелкий ниже лица+шеи"); assert.ok(boxY(acc, c).bottom <= faceTop + 1e-9, "акценты выше лба");
    assert.strictEqual(r.phrases, 1); subs(c).forEach((l, i) => near(N.baseOf(l)[0], xs[i], 1e-6));
  });
  await test("лицо: нет места сверху — всё идёт вниз; нет места нигде — текст уменьшается и влезает в большую полосу", () => {
    const c = mkComp(), st = genOM(c, [{ t: "let" }, { t: "me", a: true }, { t: "be" }]);
    N.avoidFace(c, subs(c), { x: 0.3, y: 0.05, w: 0.4, h: 0.3 }, st.layout);       // лицо у самого верха: верхней полосы нет
    const all = boxY(subs(c), c); assert.ok(all.top >= 0.05 + 0.3 * 1.15 - 1e-9, "целиком под лицом");
    const c2 = mkComp(), st2 = genOM(c2, [{ t: "let" }, { t: "me", a: true }, { t: "be" }]); const h0 = subs(c2)[0].src.value.fontSize;
    const r = N.avoidFace(c2, subs(c2), { x: 0.1, y: 0.2, w: 0.8, h: 0.55 }, st2.layout);   // лицо крупное: места мало, текст уменьшается
    assert.ok(r.shrunk >= 1 && subs(c2)[0].src.value.fontSize < h0, "текст уменьшен");
    const b2 = boxY(subs(c2), c2); assert.ok(b2.top >= 0 && b2.bottom <= 1.0001, "остался в кадре");
  });
  await test("placeZones: обычные слова и акценты — на заданной высоте, блок за блоком", () => {
    const c = mkComp(); genOM(c, [{ t: "let" }, { t: "me", a: true }, { t: "be" }]);
    N.placeZones(c, subs(c), 70, 15);
    near(boxY(subs(c).filter(l => l.label !== 11), c).top / 1 + (boxY(subs(c).filter(l => l.label !== 11), c).bottom - boxY(subs(c).filter(l => l.label !== 11), c).top) / 2, 0.70, 1e-6);
    near((boxY(subs(c).filter(l => l.label === 11), c).top + boxY(subs(c).filter(l => l.label === 11), c).bottom) / 2, 0.15, 1e-6);
  });
  await test("ручной сдвиг фразы переживает пересоздание; «исходные места» его снимает", () => {
    const c = mkComp(); genSrc(c, "sA", "sA");
    const ph0 = ofSrc(c, "sA").filter(l => N.groupInfo(l).segment === 0), before = ph0.map(l => N.baseOf(l));
    ph0.forEach(l => N.shiftLayer(l, 30, -400));
    const offsets = N.phraseOffsets(c, "sA"); assert.deepStrictEqual(Object.keys(offsets), ["0"]);
    const r = genSrc(c, "sA", "sA"); N.applyPhraseOffsets(r.made, offsets);
    const ph1 = ofSrc(c, "sA").filter(l => N.groupInfo(l).segment === 0);
    ph1.forEach((l, i) => { near(N.baseOf(l)[0], before[i][0] + 30); near(N.baseOf(l)[1], before[i][1] - 400); });
    assert.ok(ofSrc(c, "sA").filter(l => N.groupInfo(l).segment === 1).every(l => N.manualOffset(l)[1] === 0), "другая фраза не сдвинута");
    assert.strictEqual(N.resetPositions(ph1), ph1.length);
    ph1.forEach((l, i) => { near(N.baseOf(l)[0], before[i][0]); near(N.baseOf(l)[1], before[i][1]); });
  });
  await test("положение: фраза целиком ставится на высоту кадра, сдвиг и старые слои с ключами", () => {
    const c = mkComp(); genSrc(c, "sA", "sA");
    const one = ofSrc(c, "sA")[0], gid = N.groupInfo(one).gid, phrase = subs(c).filter(l => N.groupInfo(l).gid === gid);
    const r = N.moveBlocksTo(c, [one], null, 75);
    assert.strictEqual(r.phrases, 1); assert.strictEqual(r.layers, phrase.length, "двигается вся фраза");
    const ys = phrase.map(l => { const b = N.baseOf(l), h = l.sourceRectAtTime().height; return [b[1] - h / 2, b[1] + h / 2]; });
    near((Math.min(...ys.map(y => y[0])) + Math.max(...ys.map(y => y[1]))) / 2, c.height * 0.75, 1e-6);
    const x0 = N.baseOf(one)[0]; N.nudgeBlocks(c, [one], -20, 0); near(N.baseOf(one)[0], x0 - 20);
    const legacy = phrase[0]; legacy.transform.Position.keys = [{ t: 1, v: [10, 20, 0] }, { t: 2, v: [10, 30, 0] }];
    N.shiftLayer(legacy, 5, 5); assert.deepStrictEqual(legacy.transform.Position.keys.map(k => k.v), [[15, 25, 0], [15, 35, 0]]);
  });
  await test("размер текста: меняется размер шрифта, Scale и ключи слоя не затронуты; фраза остаётся вокруг прежнего центра", () => {
    const c = mkComp(), st = styleOf("reels-glow"); st.layout.autoAccent = false;
    const gs = prep(N.flattenWords(sample()), st.layout); gs.forEach(g => (g.sourceKey = "sA"));
    N.generate(c, gs, st, Object.assign({}, st.anim, { animIn: "fade", animOut: "none" }), true);
    const ls = subs(c).filter(l => N.groupInfo(l).segment === 0);
    const sizes = ls.map(l => l.src.value.fontSize), scaleKeys = ls.map(l => l.transform.Scale.keys.length);
    const centre = () => { const b = ls.map(l => ({ p: N.baseOf(l), r: l.sourceRectAtTime() })); return (Math.min(...b.map(x => x.p[0] - x.r.width / 2)) + Math.max(...b.map(x => x.p[0] + x.r.width / 2))) / 2; };
    const c0 = centre();
    const r = N.scaleFont(c, ls, 1.2, st.layout);
    assert.strictEqual(r.changed, ls.length);
    ls.forEach((l, i) => { near(l.src.value.fontSize, sizes[i] * 1.2, 1e-6); assert.strictEqual(l.transform.Scale.keys.length, scaleKeys[i]); assert.deepStrictEqual(l.transform.Scale.value, [100, 100, 100]); });
    near(centre(), c0, 1e-6);
    N.scaleFont(c, ls, 1 / 1.2, st.layout); ls.forEach((l, i) => near(l.src.value.fontSize, sizes[i], 1e-6));
  });
  console.log("галерея и проверка перед созданием");
  await test("недавние шрифты: порядок, уникальность, лимит", () => {
    assert.deepStrictEqual(N.recentItem(["A","B","C"], "B", 3), ["B","A","C"]);
    assert.deepStrictEqual(N.recentItem(["A","B","C"], "D", 3), ["D","A","B"]);
  });
  await test("проверка распознаёт отсутствующий шрифт, слишком длинную фразу и опасное положение", () => {
    const c = mkComp(), st = styleOf("reels-glow"); st.base.fonts = ["MissingFont"];
    st.layout.posX = 2; st.layout.posY = 1;
    const words = N.flattenWords(sample()); const groups = prep(words, st.layout);
    groups[0].text = "Много текста ".repeat(20); groups[0].end = groups[0].start + .1;
    const issues = N.checkCaptions(groups, st, c);
    for (const code of ["font", "long", "safe_area"]) assert.ok(issues.some(i => i.code === code), code);
    assert.strictEqual(c.numLayers, 0, "Проверка не должна создавать слои");
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
