// HTML panel in Chromium against the real host (cep/host/bridge.jsx + ae/noir/*.jsx) running on the AE mock in Node.
//   node tests/test_cep_browser.js            (SHOTS=dir to save screenshots)
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), mock = require("./ae_mock");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "noir-browser-"));
mock.install({ temp: tmp, fonts: ["Inter-Bold", "Inter-SemiBold", "TimesNewRomanPSMT", "ArialMT", "Montserrat-Medium", "Montserrat-Bold", "Montserrat-ExtraBold", "Montserrat-SemiBold", "Poppins-SemiBold", "Poppins-ExtraBold"] });
process.env.HF_HOME = path.join(tmp, "hf");                  // no models "downloaded" until the test says so
global.$.fileName = root + "/cep/host/bridge.jsx";
(0, eval)(fs.readFileSync(global.$.fileName, "utf8"));
NOIR_CEP.load(root);
const N = global.NOIR, SHOTS = process.env.SHOTS;
N.isWindows = () => true;                                    // the setup buttons are offered on Windows only
const comp = new mock.CompItem({ duration: 12, _fonts: ["Inter-Bold", "Inter-SemiBold", "ArialMT"] }); global.app.project.activeItem = comp;
const subs = () => comp._l.filter(l => N.isGenerated(l));

let passed = 0, failed = 0;
async function step(name, fn) {
    try { await fn(); passed++; console.log("  ok  " + name); }
    catch (e) { failed++; console.log("  FAIL " + name + "\n       " + String(e.stack || e).split("\n").slice(0, 4).join("\n       ")); }
}

// Runs in the page: texts that do not fit their box, and leaf elements (labels, icons, fields, words) that overlap each other.
function layoutProblems() {
    const out = [], vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0" && e.offsetParent !== null; };
    const name = (e) => (e.className && e.className.baseVal !== undefined ? e.getAttribute("class") : e.className) + ":" + (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24);
    const scope = document.querySelector(".shell");
    [...scope.querySelectorAll("button, .btn-label, .field-label, .style-name, .seg, .tab, .chip, label, .pill, .title, .ready-title, .ready-hint")].forEach(e => {
        if (!vis(e) || e.classList.contains("tl-word")) return; const cs = getComputedStyle(e);
        if (cs.textOverflow === "ellipsis" || cs.overflow === "hidden" && e.classList.contains("btn-label")) return;
        if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") out.push("вылезает " + name(e) + " " + e.scrollWidth + ">" + e.clientWidth);
    });
    // what is actually visible of an element: its box cut by every scrolling / clipping ancestor
    const clipped = (e) => {
        let r = e.getBoundingClientRect(), box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
            const cs = getComputedStyle(p); if (!/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
            const q = p.getBoundingClientRect(); box = { left: Math.max(box.left, q.left), top: Math.max(box.top, q.top), right: Math.min(box.right, q.right), bottom: Math.min(box.bottom, q.bottom) };
        }
        return box;
    };
    const leaves = [...scope.querySelectorAll(".btn-label, .icon, .field-label, input, select, textarea, .seg, .style-name, .range-value, .pill, .title, .orb-btn, .lead, .hint, .tl-word, .ready-title, .ready-hint, .pv-word")].filter(vis);
    const rects = leaves.map(clipped);
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i], b = leaves[j]; if (a.contains(b) || b.contains(a)) continue;
        if (!!a.closest(".sticky-actions") !== !!b.closest(".sticky-actions")) continue;   // the sticky action bar floats over the page by design
        const r = rects[i], q = rects[j], ox = Math.min(r.right, q.right) - Math.max(r.left, q.left), oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        if (ox > 1.5 && oy > 1.5) out.push("наложение " + name(a) + " × " + name(b));
    }
    return out;
}

(async () => {
    const launch = fs.existsSync("/usr/bin/chromium") ? { executablePath: "/usr/bin/chromium" } : {};
    const browser = await chromium.launch(Object.assign({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] }, launch));
    const page = await browser.newPage({ viewport: { width: 460, height: 640 } });
    page.setDefaultTimeout(8000);
    const errors = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    const calls = [];
    await page.exposeFunction("hostEval", script => {
        const m = /^NOIR_CEP\.call\((.*)\)$/.exec(script);
        calls.push(m ? JSON.parse(JSON.parse(m[1])).op : script);
        return (0, eval)(script);
    });
    const server = require("http").createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, ""), file = path.resolve(root, "cep", rel || "index.html");
        if (!file.startsWith(path.join(root, "cep") + path.sep)) { res.writeHead(403); res.end(); return; }
        try { res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" })[path.extname(file)] || "application/octet-stream"); res.end(fs.readFileSync(file)); }
        catch (e) { res.writeHead(404); res.end(); }
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    await page.addInitScript(() => {
        window.__adobe_cep__ = { evalScript: (s, cb) => window.hostEval(s).then(cb),
            getHostEnvironment: () => JSON.stringify({ appSkinInfo: { panelBackgroundColor: { color: { red: 35, green: 35, blue: 35 } } } }), addEventListener: () => {} };
        window.confirm = () => true;
    });
    await page.goto("http://127.0.0.1:" + server.address().port + "/index.html");
    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + ".png") }); };
    const settle = () => page.evaluate(() => NoirHost.idle()).then(() => page.waitForTimeout(60));
    const tab = (name) => page.locator('.tab[data-page="' + name + '"]').click();
    const hostState = () => page.evaluate(() => NoirHost.state());

    console.log("HTML panel");
    await step("загрузка: 4 вкладки, шрифт Inter, тема AE; первый экран — распознавание; кнопка-шар", async () => {
        await page.waitForSelector(".topbar"); await page.waitForSelector(".ready-row"); await settle();
        assert.ok(await page.evaluate(() => document.fonts.load('12px "Inter"').then(f => f.length > 0)), "Inter loads");
        assert.strictEqual(await page.getAttribute("html", "data-theme"), "dark");
        assert.deepStrictEqual(await page.$$eval(".tab", ts => ts.map(t => t.dataset.page)), ["text", "style", "edit", "settings"]);
        assert.ok(await page.locator(".text-empty").isVisible() && await page.locator(".orb-btn").isVisible());
        assert.strictEqual(await page.locator(".topbar .btn.primary").isVisible(), false, "на экране распознавания одна главная кнопка");
        assert.ok(calls.includes("NOIR_CEP.open()") && calls.includes("setup.check"));
        await shot("start");
    });
    await step("без дела панель не обращается к AE; переходы по вкладкам локальные", async () => {
        await settle(); const n = calls.length;
        for (const p of ["style", "edit", "settings", "text"]) await tab(p);
        await page.waitForTimeout(1200);
        assert.strictEqual(calls.length, n, calls.slice(n).join(","));
    });
    await step("готовность: видно, чего не хватает (без наложений); «Установить» открывает окно установки; без готовности распознавание не запускается; «Проверить снова»", async () => {
        const rows = await page.$$eval(".text-empty .ready-row", rs => rs.map(r => r.className + " " + r.textContent));
        assert.ok(rows.some(r => /bad/.test(r) && /Движок/.test(r)) && rows.some(r => /bad/.test(r) && /Модель/.test(r)), rows.join(" | "));
        assert.strictEqual(await page.locator(".pill").getAttribute("data-state"), "warn");
        const probs = [];
        for (const w of [300, 460]) { await page.setViewportSize({ width: w, height: 640 }); await page.waitForTimeout(120); (await page.evaluate(layoutProblems)).forEach(f => probs.push(w + "px: " + f)); }
        await page.setViewportSize({ width: 460, height: 640 });
        if (probs.length) console.log(probs.map(x => "       · " + x).join("\n"));
        assert.strictEqual(probs.length, 0, "наложения на экране распознавания");
        global.__executed = [];
        await page.locator(".text-empty .ready-row.bad", { hasText: "Движок" }).getByRole("button", { name: "Установить" }).click(); await settle();
        assert.ok(global.__executed.length === 1 && /setup_.*\.cmd$/.test(global.__executed[0]), "окно установки: " + global.__executed);
        const before = calls.filter(c => c === "recognize").length;
        await page.locator(".text-empty .btn.primary.wide").click(); await settle();
        assert.strictEqual(calls.filter(c => c === "recognize").length, before, "распознавание не запускается без движка");
        assert.ok(await page.locator(".toast.show.error").isVisible());
        await page.evaluate((py) => NoirHost.call("settings.set", { path: "python", value: py }), process.execPath);
        N.modelCached = () => true;
        await page.locator(".text-empty").getByRole("button", { name: "Проверить снова" }).click(); await settle();
        await page.waitForSelector(".text-empty .ready-row.ok");
        assert.strictEqual(await page.locator(".pill").getAttribute("data-state"), "idle");
        await shot("ready");
    });
    await step("распознавание: «занят», опрос только пока работает, по готовности — редактор", async () => {
        let cb; const keep = { a: N.getAudioSource, s: N.startRecognition };
        N.getAudioSource = () => ({ file: "x.wav", link: null });
        N.startRecognition = (src, o, c) => { cb = c; c.onStatus({ state: "recognizing", message: "Распознаю", progress: 0.4 }); };
        try {
            await page.locator(".text-empty .btn.primary.wide").click();
            await page.waitForFunction(() => document.querySelector(".pill").dataset.state === "busy");
            assert.ok(await page.locator(".topline").isVisible());
            assert.ok(/40%/.test(await page.locator(".text-empty .btn.primary.wide").textContent()));
            await shot("recognizing");
            const polls = calls.filter(c => c === "poll").length; await page.waitForTimeout(1900);
            assert.ok(calls.filter(c => c === "poll").length > polls, "polls while busy");
            cb.onDone({ schema: "noir-captions/1", language: "ru", source: { file: path.join(tmp, "clip.mp4") }, segments: [
                { words: [{ text: "Привет,", start: 1, end: 1.3 }, { text: "это", start: 1.35, end: 1.5 }, { text: "NOIR.", start: 1.5, end: 2 }] },
                { words: [{ text: "Субтитры", start: 3, end: 3.6, conf: 0.4 }, { text: "сами", start: 3.6, end: 3.9 }] }] }, { link: null });
            await page.waitForFunction(() => !document.querySelector(".text-body").hidden && document.querySelector(".editor").value.indexOf("Привет") === 0);
            const n = calls.length; await page.waitForTimeout(1300); assert.strictEqual(calls.length, n, "polling stops");
        } finally { Object.assign(N, { getAudioSource: keep.a, startRecognition: keep.s }); }
    });
    await step("текст: правка уходит в AE с задержкой; выделенное слово — акцент; фраза по курсору", async () => {
        const ed = page.locator(".editor");
        await page.evaluate(() => { const e = document.querySelector(".editor"); const i = e.value.indexOf("сами"); e.focus(); e.setSelectionRange(i, i + 4); });
        await page.keyboard.type("сама");
        await page.waitForTimeout(500); await settle();
        assert.ok(/сама/.test((await hostState()).text));
        await page.evaluate(() => { const e = document.querySelector(".editor"); const i = e.value.indexOf("это"); e.focus(); e.setSelectionRange(i, i + 3); });
        await page.locator(".word-tools .chip").first().click(); await settle();
        assert.ok(/\*это\*/.test(await ed.inputValue()), await ed.inputValue());
        await page.evaluate(() => { const e = document.querySelector(".editor"); const i = e.value.indexOf("Субтитры"); e.focus(); e.setSelectionRange(i, i); });
        await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300); await settle();
        assert.strictEqual((await hostState()).phrase, 1);
        assert.strictEqual(await page.locator(".tl-word.low").count(), 1, "неуверенное слово помечено");
        await shot("text");
    });
    await step("таймлайн: тянуть край слова меняет тайминг в AE; клик — к слову; двойной клик — исправить слово; Alt+→ — начало", async () => {
        await page.evaluate(() => NoirHost.call("phrase.select", { index: 0 })); await settle();
        assert.strictEqual(await page.locator(".tl-word").count(), 3);
        const end0 = (await hostState()).words[0].end;
        await page.locator(".timeline").evaluate(e => e.scrollIntoView({ block: "start" })); await page.waitForTimeout(100);
        const pps = await page.evaluate(() => { const t = document.querySelector(".tl-track"); return t.getBoundingClientRect().width; });
        assert.ok(await page.evaluate(() => [...document.querySelectorAll(".tl-word .tl-text")].every(x => x.scrollWidth <= x.clientWidth + 1)), "слова в таймлайне не обрезаны");
        const h = await page.locator('.tl-word[data-index="0"] .tl-h.r').boundingBox();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
        await page.mouse.move(h.x + h.width / 2 + 12, h.y + h.height / 2, { steps: 4 }); await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2, { steps: 4 }); await page.mouse.up(); await settle();
        const s1 = await hostState();
        assert.ok(s1.words[0].end > end0 + 0.03, end0 + " → " + s1.words[0].end); assert.ok(s1.words[0].end <= s1.words[1].start + 1e-9, "порядок слов сохранён");
        assert.strictEqual(s1.phraseDirty, true);
        await page.locator('.tl-word[data-index="2"]').click(); await settle();
        assert.ok(Math.abs(comp.time - s1.words[2].start) < 1e-6, "клик ставит время AE на слово: " + comp.time);
        await page.locator('.tl-word[data-index="2"]').dblclick(); const inp = page.locator(".tl-input");
        await inp.fill("НУАР."); await inp.press("Enter"); await settle();
        assert.ok(/НУАР\./.test((await hostState()).text));
        await page.locator('.tl-word[data-index="1"]').focus(); const st0 = (await hostState()).words[1].start;
        await page.keyboard.press("Alt+ArrowRight"); await settle();
        assert.ok(Math.abs((await hostState()).words[1].start - st0 - 0.02) < 1e-6, "Alt+→ двигает начало");
        const n0 = (await hostState()).words.length, keepEnd = (await hostState()).words[2].end;
        await page.locator('.tl-word[data-index="1"]').focus(); await page.keyboard.press("Delete"); await settle();
        const sd = await hostState(); assert.strictEqual(sd.words.length, n0 - 1, "Delete удаляет слово"); assert.ok(Math.abs(sd.words[1].end - keepEnd) < 1e-9, "тайминг соседа на месте");
        await page.evaluate(() => NoirHost.call("text.undo")); await settle(); assert.strictEqual((await hostState()).words.length, n0);
        await shot("timeline");
    });
    await step("создание: замечания, «создать с замечаниями», затем «Обновить все»", async () => {
        await page.locator(".sticky-actions .btn.primary").click(); await settle();
        if (await page.locator(".issues").isVisible()) {
            await shot("issues");
            const fix = page.getByRole("button", { name: "Исправить автоматически" });
            if (await fix.count()) { await fix.click(); await settle(); await page.waitForTimeout(200); await settle(); }
            if (await page.locator(".issues").isVisible()) { await page.getByRole("button", { name: "Создать с замечаниями" }).click(); await settle(); }
        }
        assert.ok(subs().length > 0, "layers made");
        await page.waitForFunction(() => document.querySelector(".topbar .btn.primary").textContent.indexOf("Обновить") >= 0);
        assert.strictEqual((await hostState()).dirty, false);
    });
    await step("стиль: живое превью при наведении; выбор и избранное; стили без шрифта — в конце с пометкой", async () => {
        await tab("style");
        const card = page.locator(".style-card:not(.missing)").nth(1);
        await card.hover(); await page.waitForTimeout(350);
        const previewAnims = (c) => c.getAnimations({ subtree: true }).filter(a => !(window.CSSTransition && a instanceof CSSTransition)).length;
        assert.ok(await card.evaluate(new Function("c", "return (" + previewAnims + ")(c) > 0")), "превью анимируется");
        await page.mouse.move(2, 2); await page.waitForTimeout(50);
        assert.strictEqual(await card.evaluate(new Function("c", "return (" + previewAnims + ")(c)")), 0, "превью останавливается");
        await card.locator(".style-pick").click(); await settle();
        assert.ok(await card.evaluate(e => e.classList.contains("on")));
        await card.locator(".star").click(); await settle();
        assert.strictEqual((await hostState()).settings.favoriteStyles.length, 1);
        const order = await page.$$eval(".style-card", cs => cs.map(c => c.classList.contains("missing")));
        assert.ok(order.includes(true) && order.includes(false) && order.lastIndexOf(false) < order.indexOf(true), "сначала стили с установленными шрифтами: " + order.join(","));
        assert.ok(await page.locator(".style-card.missing .nofont").first().isVisible());
        await page.locator('.field[data-path="quick.size"] input').evaluate(e => { e.value = 120; e.dispatchEvent(new Event("change")); }); await settle();
        assert.strictEqual((await hostState()).settings.quick.size, 120);
        await card.hover(); await page.waitForTimeout(400); await shot("style");
        await page.mouse.move(2, 2);
    });
    await step("правка: «Внизу» двигает субтитры; без выделения — понятная ошибка", async () => {
        await tab("edit");
        await page.getByRole("button", { name: "Внизу", exact: true }).click(); await settle();
        assert.ok(/Фраз перемещено/.test((await hostState()).status));
        await page.locator('.field[data-path="scope"] .seg[data-value="selected"]').click(); await settle();
        await page.getByRole("button", { name: "Применить текущий стиль" }).click(); await settle();
        await page.waitForSelector(".toast.show.error"); assert.ok(/Выделите/.test(await page.locator(".toast").textContent()));
        await page.locator('.field[data-path="scope"] .seg[data-value="source"]').click(); await settle();
        await shot("edit");
    });
    await step("пульт в AE: «Добавить пульт» создаёт слой со слайдерами и подключает субтитры; «Убрать пульт» отвязывает", async () => {
        await tab("edit");
        await page.getByRole("button", { name: "Добавить пульт" }).click(); await settle();
        assert.ok(N.findControl(comp), "слой NOIR Control"); assert.strictEqual((await hostState()).control, true);
        const linked = subs().filter(l => l.textProps.property("ADBE Text Animators").kids.some(x => x.name === "NOIR Control"));
        assert.strictEqual(linked.length, subs().length);
        assert.ok(await page.getByRole("button", { name: "Обновить привязку" }).isVisible());
        await page.getByRole("button", { name: "Убрать пульт" }).click(); await settle();
        assert.strictEqual(N.findControl(comp), null); assert.ok(await page.getByRole("button", { name: "Добавить пульт" }).isVisible());
    });
    await step("настройки: готовность и распознавание здесь же; вид панели — компактный / обычный / подробный; число сохраняется в AE", async () => {
        await tab("settings");
        assert.ok(await page.locator("#set-recognition .ready-row.ok").isVisible());
        assert.strictEqual(await page.locator('.field[data-path="style.layout.lineGap"]').isVisible(), false);
        await page.locator('.field[data-path="mode"] .seg[data-value="compact"]').click();
        assert.ok(await page.evaluate(() => document.body.classList.contains("mode-compact")));
        assert.strictEqual(await page.locator('#page-settings .hint').first().isVisible(), false, "в компактном виде пояснений нет");
        await page.locator('.field[data-path="mode"] .seg[data-value="detailed"]').click();
        assert.ok(await page.locator('.field[data-path="style.layout.lineGap"]').isVisible());
        assert.ok(!(await page.evaluate(() => document.body.classList.contains("mode-compact"))));
        const f = page.locator('.field[data-path="style.layout.maxWords"] input'); await f.fill("3"); await f.press("Tab"); await settle();
        assert.strictEqual((await hostState()).settings.style.layout.maxWords, 3);
        await shot("settings");
    });
    await step("светлая тема AE и английский интерфейс; пересборка не стирает текст", async () => {
        await page.evaluate(() => NoirTheme.apply([214, 214, 214]));
        assert.strictEqual(await page.getAttribute("html", "data-theme"), "light");
        await shot("settings-light");
        await page.locator('.field[data-path="lang"] .seg[data-value="en"]').click(); await settle();
        await page.waitForFunction(() => document.querySelector('.tab[data-page="text"]').textContent === "Text");
        assert.strictEqual(await page.locator('.field[data-path="style.layout.maxWords"] .field-label').textContent(), "Words per phrase, max");
        assert.strictEqual(await page.locator('.field[data-path="mode"] .seg[data-value="detailed"]').textContent(), "Detailed");
        await page.evaluate(() => NoirHost.call("layers.invert").catch(() => {})); await settle();
        await page.waitForSelector(".toast.show.error");
        assert.strictEqual(await page.locator(".toast").textContent(), "Select text layers, SVG, images or shapes.", "сообщение AE по-английски");
        await shot("english");
        await page.locator('.field[data-path="lang"] .seg[data-value="ru"]').click(); await settle();
        await page.evaluate(() => NoirTheme.apply([35, 35, 35]));
        const text = (await hostState()).text;
        await tab("text"); await page.locator(".editor").focus(); await page.locator(".editor").blur(); await page.waitForTimeout(450); await settle();
        assert.strictEqual((await hostState()).text, text, "rebuilt editor must not overwrite AE text");
        assert.strictEqual(await page.locator(".editor").inputValue(), text);
    });
    await step("радиальное меню: кнопка-шар, правая кнопка и Пробел открывают, Esc закрывает", async () => {
        await page.locator(".orb-btn").click(); await page.waitForSelector(".noir-wheel"); await page.waitForTimeout(250); await shot("wheel");
        await page.keyboard.press("Escape"); assert.strictEqual(await page.locator(".noir-wheel").count(), 0);
        const lead = await page.locator("#page-text .text-body .lead").boundingBox();
        await page.mouse.click(lead.x + 20, lead.y + 6, { button: "right" }); await page.waitForSelector(".noir-wheel");
        await page.keyboard.press("Escape"); assert.strictEqual(await page.locator(".noir-wheel").count(), 0);
        await page.locator("#page-text .text-body .lead").click(); await page.keyboard.press(" "); await page.waitForSelector(".noir-wheel");
        await page.keyboard.press("Escape");
    });
    await step("радиальное меню v2: до 8 секторов, клавиши 1–8, пункты второго кольца не налезают друг на друга и не выходят за панель", async () => {
        const bad = [];
        for (const [w, h] of [[300, 520], [460, 640], [520, 500], [820, 700]]) {
            await page.setViewportSize({ width: w, height: h });
            for (const [x, y] of [[w / 2, h / 2], [20, 20], [w - 10, h - 10]]) {
                await page.evaluate(([x, y]) => NoirWheel.open(x, y, "sticky"), [x, y]);
                const n = await page.locator(".rw-tile").count(); assert.ok(n >= 4 && n <= 8, "sectors " + n);
                for (let k = 1; k <= n; k++) {
                    await page.keyboard.press(String(k)); if (!(await page.evaluate(() => NoirWheel.isOpen()))) { await page.evaluate(([x, y]) => NoirWheel.open(x, y, "sticky"), [x, y]); continue; }
                    await page.waitForTimeout(320);          // after the pop-in animation
                    const r = await page.evaluate(() => {
                        const boxes = [...document.querySelectorAll(".rw-item, .rw-tile, .rw-orb, .rw-card")].map(e => ({ c: e.className, t: e.textContent || e.className, r: e.getBoundingClientRect() })), out = [];
                        for (let i = 0; i < boxes.length; i++) {
                            const a = boxes[i].r; if (a.left < -1 || a.top < -1 || a.right > innerWidth + 1 || a.bottom > innerHeight + 1) out.push("за краем: " + boxes[i].t);
                            for (let j = i + 1; j < boxes.length; j++) { const b = boxes[j].r;
                                if (/rw-card/.test(boxes[i].c + boxes[j].c) && /rw-item/.test(boxes[i].c + boxes[j].c)) continue;   // rows live inside the card
                                if (document.querySelector(".rw-card.over") && /rw-tile|rw-orb/.test(boxes[i].c + boxes[j].c)) continue;   // tiny panel: the card is a sheet over the ring
                                const round = (q) => /rw-tile|rw-orb/.test(boxes[q].c); if (round(i) && round(j)) { const d = Math.hypot((a.left + a.right - b.left - b.right) / 2, (a.top + a.bottom - b.top - b.bottom) / 2); if (d < (a.width + b.width) / 2 - 1) out.push(boxes[i].t + " ○ " + boxes[j].t); continue; }
                                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push(boxes[i].t + " × " + boxes[j].t); }
                        }
                        return out;
                    });
                    r.forEach(m => bad.push(w + "px @" + Math.round(x) + "," + Math.round(y) + " сектор " + k + ": " + m));
                    await page.keyboard.press("Backspace");
                }
                await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
            }
        }
        // the sheet goes away when the pointer leaves the ring and the sheet; in a 520×500 panel it is not drawn over the ring
        await page.setViewportSize({ width: 520, height: 500 });
        await page.evaluate(() => NoirWheel.open(260, 250, "sticky")); await page.waitForTimeout(400);
        const t2 = await page.locator(".rw-tile").nth(1).boundingBox();
        await page.mouse.move(t2.x + t2.width / 2, t2.y + t2.height / 2); await page.waitForTimeout(250);
        assert.ok(await page.locator(".rw-sheet").isVisible(), "панель раздела показана");
        assert.strictEqual(await page.locator(".rw-sheet.over").count(), 0, "в окне 520×500 панель не поверх кольца");
        // moving straight onto another tile switches the section at once, even while the pointer keeps moving
        const t4 = await page.locator(".rw-tile").nth(3).boundingBox();
        await page.mouse.move(t4.x + t4.width / 2 - 3, t4.y + t4.height / 2, { steps: 6 }); await page.mouse.move(t4.x + t4.width / 2 + 3, t4.y + t4.height / 2, { steps: 3 });
        assert.ok(await page.locator(".rw-tile").nth(3).evaluate(e => e.classList.contains("active")), "раздел переключается сразу");
                await page.mouse.move(2, 2); await page.waitForTimeout(600);
        assert.strictEqual(await page.locator(".rw-sheet").isVisible(), false, "курсор ушёл — панель спряталась");
        await page.keyboard.press("Escape");
                await page.setViewportSize({ width: 400, height: 720 });
        await page.evaluate(() => NoirWheel.open(200, 360, "sticky")); await page.waitForTimeout(600);
        const tileW = await page.locator(".rw-tile").first().evaluate(e => e.getBoundingClientRect().width);
        assert.ok(tileW >= 50, "узкая панель: кружки не мельчают (" + tileW + " px)");
        await page.keyboard.press("Escape");
        await page.setViewportSize({ width: 460, height: 640 });
        if (bad.length) console.log([...new Set(bad)].slice(0, 30).map(x => "       · " + x).join("\n"));
        assert.strictEqual(bad.length, 0);
        await page.evaluate(() => NoirWheel.open(230, 320, "sticky")); await page.keyboard.press("1"); await page.keyboard.press("3"); await settle();
        assert.ok(/Фраз перемещено/.test((await hostState()).status));
        assert.strictEqual(await page.evaluate(() => NoirWheel.isOpen()), false);
    });
    await step("помощник: план показывается до выполнения; «Отмена» ничего не меняет, «Применить» выполняет", async () => {
        await page.evaluate(() => NoirAssistant.setSettings({ endpoint: "http://127.0.0.1:59999" }));
        await page.evaluate(() => NoirAssistant.open());
        const input = page.locator(".as-form input");
        await input.fill("поставь вверху"); await input.press("Enter");
        await page.waitForSelector(".as-plan"); await shot("assistant");
        const before = calls.filter(c => c === "run").length;
        await page.locator(".as-plan .btn.ghost").click(); await settle();
        assert.strictEqual(calls.filter(c => c === "run").length, before, "cancel runs nothing");
        await input.fill("поставь вверху"); await input.press("Enter");
        await page.locator(".as-plan").last().locator(".btn.primary").click();
        await page.waitForFunction(() => document.querySelectorAll(".as-msg.note").length >= 2); await settle();
        assert.ok(calls.filter(c => c === "run").length > before);
        await page.keyboard.press("Escape");
    });
    await step("помощник без ИИ: слова-паразиты и эмодзи — «было → стало», после «Применить» тайминги прочих слов на месте; «динамичнее» — план настроек", async () => {
        const lines = (await hostState()).text.split("\n");
        await page.evaluate((t) => NoirHost.call("text.replace", { text: t }), ["Ну, " + lines[0].split(" ").slice(1).join(" "), "Субтитры деньги"].join("\n")); await settle();
        await page.evaluate(() => NoirHost.call("phrase.select", { index: 0 })); await settle();
        const before = (await hostState()).words;
        await page.evaluate(() => NoirAssistant.open());
        const input = page.locator(".as-form input");
        await input.fill("убери слова-паразиты"); await input.press("Enter");
        await page.waitForSelector(".as-diff-row");
        assert.ok(/^Ну,/.test(await page.locator(".as-diff-row del").first().textContent()));
        await page.locator(".as-plan").last().locator(".btn.primary").click();
        await page.waitForFunction(() => /Готово/.test([...document.querySelectorAll(".as-msg.note")].pop().textContent)); await settle();
        const after = (await hostState()).words;
        assert.strictEqual(after.length, before.length - 1); assert.ok(Math.abs(after[0].start - before[1].start) < 1e-9 && Math.abs(after[0].end - before[1].end) < 1e-9, "тайминг сохранён");
        await input.fill("добавь эмодзи"); await input.press("Enter");
        await page.waitForFunction(() => /💰/.test([...document.querySelectorAll(".as-diff-row ins")].map(e => e.textContent).join(" ")));
        await page.locator(".as-plan").last().locator(".btn.primary").click(); await page.waitForTimeout(300); await settle();
        assert.ok(/деньги💰/.test((await hostState()).text));
        await input.fill("сделай динамичнее"); await input.press("Enter");
        await page.waitForFunction(() => /Сила анимации/.test(document.querySelector(".as-plan:last-of-type") ? [...document.querySelectorAll(".as-plan")].pop().textContent : ""));
        await page.locator(".as-plan").last().locator(".btn.primary").click(); await page.waitForTimeout(400); await settle();
        const st = (await hostState()).settings; assert.strictEqual(st.quick.intensity, "1.5"); assert.strictEqual(st.style.anim.animIn, "pop");
        await input.fill("переведи на английский"); await input.press("Enter");
        await page.waitForFunction(() => /ИИ-модель/.test([...document.querySelectorAll(".as-msg")].pop().textContent));
        await shot("assistant-text");
        await page.keyboard.press("Escape");
    });
    await step("помощник с ИИ (заглушка Ollama): перевод — с сохранением строк; исправление ошибок — только строки с тем же числом слов", async () => {
        const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
        await page.route("http://127.0.0.1:11434/**", async (route) => {
            const req = route.request();
            if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
            if (req.url().endsWith("/api/tags")) return route.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/json" }, cors), body: JSON.stringify({ models: [{ name: "qwen2.5:7b" }] }) });
            const body = JSON.parse(req.postData()), sys = body.messages[0].content, user = JSON.parse(body.messages[1].content);
            let out;
            if (/translate video subtitles/.test(sys)) out = { lines: user.lines.map(l => ({ i: l.i, text: "EN " + l.text })) };
            else if (/fix speech-recognition/.test(sys)) out = { lines: user.lines.map(l => ({ i: l.i, text: l.i === 0 ? l.text.replace("НУАР.", "NOIR.") : l.text + " лишнее" })) };
            else out = { say: "?", commands: [] };
            return route.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/json" }, cors), body: JSON.stringify({ message: { content: JSON.stringify(out) } }) });
        });
        await page.evaluate(() => NoirAssistant.setSettings({ endpoint: "http://127.0.0.1:11434" }));
        await page.evaluate(() => NoirAssistant.open());
        await page.waitForFunction(() => /qwen/.test(document.querySelector(".as-mode").textContent));
        const input = page.locator(".as-form input"), text0 = (await hostState()).text;
        await input.fill("исправь ошибки в тексте"); await input.press("Enter");
        await page.waitForSelector(".as-diff-row");
        assert.strictEqual(await page.locator(".as-diff-row").count(), 1, "строка с другим числом слов пропущена");
        assert.ok(/пропущено: 1/.test(await page.locator(".as-plan").last().textContent()));
        await page.locator(".as-plan").last().locator(".btn.primary").click(); await page.waitForTimeout(300); await settle();
        assert.ok(/NOIR\./.test((await hostState()).text) && !/лишнее/.test((await hostState()).text));
        await input.fill("переведи на английский"); await input.press("Enter");
        await page.waitForFunction(() => document.querySelectorAll(".as-plan").length && /английский/.test([...document.querySelectorAll(".as-plan")].pop().textContent));
        await page.locator(".as-plan").last().locator(".btn.primary").click(); await page.waitForTimeout(300); await settle();
        const tr = (await hostState()).text.split("\n");
        assert.strictEqual(tr.length, text0.split("\n").length, "строк столько же"); assert.ok(tr.every(l => /^EN /.test(l)), tr.join(" | "));
        await page.evaluate(() => NoirHost.call("text.undo")); await settle();
        assert.ok(!/^EN /.test((await hostState()).text), "перевод отменяется одной отменой");
        await page.keyboard.press("Escape");
        await page.evaluate(() => NoirAssistant.setSettings({ endpoint: "http://127.0.0.1:59999" }));
        await page.unroute("http://127.0.0.1:11434/**");
    });
    await step("память помощника: «запомни», «что ты помнишь», принятый ответ ИИ повторяется без ИИ, предпочтения уходят в ИИ; список в настройках с удалением", async () => {
        const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
        let sent = null;
        await page.route("http://127.0.0.1:11434/**", async (route) => {
            const req = route.request();
            if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
            if (req.url().endsWith("/api/tags")) return route.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/json" }, cors), body: JSON.stringify({ models: [{ name: "qwen2.5:7b" }] }) });
            sent = JSON.parse(req.postData());
            return route.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/json" }, cors), body: JSON.stringify({ message: { content: JSON.stringify({ say: "Поставлю внизу.", commands: [{ op: "place", y: 80 }] }) } }) });
        });
        await page.evaluate(() => NoirAssistant.setSettings({ endpoint: "http://127.0.0.1:11434" }));
        await page.evaluate(() => NoirAssistant.open());
        await page.waitForFunction(() => /qwen/.test(document.querySelector(".as-mode").textContent));
        const input = page.locator(".as-form input"), last = () => page.evaluate(() => [...document.querySelectorAll(".as-msg")].pop().textContent);
        await input.fill("запомни: субтитры всегда внизу"); await input.press("Enter");
        await page.waitForFunction(() => /Запомнил/.test([...document.querySelectorAll(".as-msg")].pop().textContent));
        await input.fill("Запомни: нуар пишется NOIR"); await input.press("Enter");
        await page.waitForFunction(() => /«нуар» → «NOIR»/.test([...document.querySelectorAll(".as-msg")].pop().textContent));
        await input.fill("сделай красиво как я люблю"); await input.press("Enter");
        await page.waitForFunction(() => /высоту 80%/.test(([...document.querySelectorAll(".as-plan")].pop() || {}).textContent || ""));
        assert.ok(/субтитры всегда внизу/.test(sent.messages[1].content), "предпочтения переданы ИИ");
        await page.locator(".as-plan").last().locator(".btn.primary").click(); await page.waitForTimeout(400); await settle();
        await page.keyboard.press("Escape");
        await page.unroute("http://127.0.0.1:11434/**");
        await page.evaluate(() => NoirAssistant.setSettings({ endpoint: "http://127.0.0.1:59999" }));
        await page.evaluate(() => NoirAssistant.open());
        await input.fill("Сделай красиво, как я люблю!"); await input.press("Enter");
        await page.waitForFunction(() => /высоту 80%/.test(([...document.querySelectorAll(".as-plan")].pop() || {}).textContent || ""));
        assert.ok(/из памяти/.test(await page.evaluate(() => [...document.querySelectorAll(".as-msg.ai")].pop().textContent)));
        await page.locator(".as-plan").last().locator(".btn.ghost").click();
        await input.fill("что ты помнишь?"); await input.press("Enter");
        await page.waitForFunction(() => /нуар → NOIR/.test(([...document.querySelectorAll(".as-plan")].pop() || {}).textContent || ""));
        await shot("assistant-memory");
        await input.fill("забудь про внизу"); await input.press("Enter");
        await page.waitForFunction(() => /Забыл записей: 1/.test([...document.querySelectorAll(".as-msg")].pop().textContent));
        await page.keyboard.press("Escape");
        await tab("settings"); await page.locator("#set-memory summary").click();
        await page.waitForSelector("#set-memory .mem-item");
        const items = await page.locator("#set-memory .mem-text").allTextContents();
        assert.ok(items.some(x => /нуар → NOIR/.test(x)) && items.some(x => /как я люблю/.test(x)) && !items.some(x => /всегда внизу/.test(x)), items.join(" | "));
        await shot("settings-memory");
        await page.locator("#set-memory .mem-item .icon-btn").first().click();
        await page.waitForFunction((n) => document.querySelectorAll("#set-memory .mem-item").length === n - 1, items.length);
        await page.locator("#set-memory summary").click(); await tab("text");
    });
    await step("скрипты помощника (эксперимент): выключены — подсказка; включены — ИИ пишет код, AE проверяет (запрещённое — повтор, потом блок), код виден до запуска, «Применить» выполняет", async () => {
        const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
        let scriptCalls = 0;
        await page.route("http://127.0.0.1:11434/**", async (route) => {
            const req = route.request();
            if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
            if (req.url().endsWith("/api/tags")) return route.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/json" }, cors), body: JSON.stringify({ models: [{ name: "qwen2.5:7b" }, { name: "qwen2.5-coder:7b" }] }) });
            const body = JSON.parse(req.postData()), sys = body.messages[0].content, user = body.messages[1].content;
            let out;
            if (/ExtendScript/.test(sys)) {
                scriptCalls++;
                if (/файл/.test(user)) out = { say: "Удалю файл.", code: "var f = new File('C:/x.txt'); f.remove();" };
                else if (/rejected/.test(user)) out = { say: "Добавлю красный слой на всю композицию.", code: "var s = comp.layers.addSolid([1, 0, 0], 'NOIR red', comp.width, comp.height, 1, comp.duration);\nlog('Добавлен красный слой');" };
                else out = { say: "?", code: "const s = comp.layers.addSolid([1,0,0], 'x', 10, 10, 1, 1);" };
                out.model = body.model;
            } else out = { say: "Напишу скрипт: красный слой.", commands: [{ op: "script", task: "add a full-size red solid named NOIR red" }] };
            return route.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/json" }, cors), body: JSON.stringify({ message: { content: JSON.stringify(out) } }) });
        });
        await page.evaluate(() => NoirAssistant.setSettings({ endpoint: "http://127.0.0.1:11434" }));
        await page.evaluate(() => NoirAssistant.open());
        await page.waitForFunction(() => /qwen/.test(document.querySelector(".as-mode").textContent));
        const input = page.locator(".as-form input");
        await input.fill("скрипт: добавь красный слой"); await input.press("Enter");
        await page.waitForFunction(() => /Включите/.test([...document.querySelectorAll(".as-msg")].pop().textContent));
        await page.locator(".as-settings summary").click();
        await page.locator(".as-check input").check(); await settle();
        assert.strictEqual((await hostState()).settings.assistantScripts, true);
        await page.locator(".as-settings select.as-model").nth(1).selectOption("qwen2.5-coder:7b");
        await page.locator(".as-settings summary").click();
        await input.fill("сделай красный фон под всем, как плашку"); await input.press("Enter");
        await page.waitForSelector(".as-code");
        assert.strictEqual(scriptCalls, 2, "первый код не ES3 — ИИ переписал");
        assert.ok(/addSolid/.test(await page.locator(".as-code").last().textContent()));
        await shot("assistant-script");
        const n0 = comp._l.length;
        await page.locator(".as-plan").last().locator(".btn.primary").click();
        await page.waitForFunction(() => /Добавлен красный слой/.test([...document.querySelectorAll(".as-msg.note")].pop().textContent)); await settle();
        assert.strictEqual(comp._l.length, n0 + 1); assert.ok(comp._l.some(l => l.name === "NOIR red"));
        await input.fill("скрипт: удали файл с диска"); await input.press("Enter");
        await page.waitForFunction(() => /Не запускаю/.test(([...document.querySelectorAll(".as-plan")].pop() || {}).textContent || ""));
        assert.strictEqual(await page.locator(".as-plan").last().locator(".btn.primary").count(), 0, "кнопки «Применить» нет");
        await page.keyboard.press("Escape");
        await page.evaluate(() => NoirAssistant.setSettings({ endpoint: "http://127.0.0.1:59999" }));
        await page.unroute("http://127.0.0.1:11434/**");
        await page.evaluate(() => NoirHost.call("settings.set", { path: "assistantScripts", value: false })); await settle();
    });
    await step("помощник: нарезка по речи — сначала замер «было → стало», «Отмена» ничего не режет, «Применить» режет видео и пересоздаёт субтитры", async () => {
        const v = new mock.AVLayer(comp, "clip.mp4"); v.source = { hasVideo: true }; comp._l.push(v); comp._l.forEach(l => { l.selected = l === v; });
        await page.evaluate(() => NoirAssistant.open());
        const input = page.locator(".as-form input");
        await input.fill("убери паузы длиннее 0,5 секунды"); await input.press("Enter");
        await page.waitForSelector(".as-cut");
        const card = page.locator(".as-plan").last();
        assert.ok(/12 с → \d(\.\d)? с/.test(await card.locator(".as-cut-big").textContent()), await card.textContent());
        await shot("assistant-cut");
        await card.locator(".btn.ghost").click(); await settle();
        assert.ok(comp._l.includes(v), "после «Отмена» видео не тронуто");
        await input.fill("вырежи паузы"); await input.press("Enter");
        await page.waitForFunction(() => document.querySelectorAll(".as-cut").length === 2);
        await page.locator(".as-plan").last().locator(".btn.primary").click();
        await page.waitForFunction(() => /Нарезано/.test([...document.querySelectorAll(".as-msg.note")].pop().textContent)); await settle();
        const pieces = comp._l.filter(l => l.comment === N.CUT_TAG);
        assert.strictEqual(pieces.length, 2); assert.ok(!comp._l.includes(v));
        assert.ok((await hostState()).words[0].start < 0.3, "слова на новом времени");
        await page.keyboard.press("Escape");
    });
    await step("узкая панель 300 px: без горизонтальной прокрутки, вкладки помещаются", async () => {
        await page.setViewportSize({ width: 300, height: 520 });
        for (const p of ["text", "style", "edit", "settings"]) {
            await tab(p); await page.waitForTimeout(80);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), p);
            const over = await page.evaluate(() => { const pg = document.querySelector(".page:not([hidden])"); return pg.scrollWidth - pg.clientWidth; });
            if (over > 1) console.log(await page.evaluate(() => { const pg = document.querySelector(".page:not([hidden])"), W = pg.getBoundingClientRect().right; return [...pg.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > W + 1 && e.offsetParent).slice(0, 6).map(e => e.tagName + "." + e.className + ":" + (e.textContent || "").slice(0, 30)).join("\n"); }));
            assert.ok(over <= 1, p + " overflows by " + over);
        }
        await tab("text"); await page.waitForTimeout(300); await shot("narrow-text");
    });
    await step("ничего не налезает: тексты, иконки, поля и слова таймлайна не пересекаются и не вылезают (все страницы, 4 ширины)", async () => {
        const problems = [];
        for (const mode of ["detailed", "compact"]) {
            await page.evaluate((m) => { const b = document.querySelector('.field[data-path="mode"] .seg[data-value="' + m + '"]'); if (b) b.click(); }, mode);
            for (const [w, h] of [[300, 560], [380, 640], [460, 700], [820, 760]]) {
                await page.setViewportSize({ width: w, height: h });
                for (const p of ["text", "style", "edit", "settings"]) {
                    await tab(p); await page.waitForTimeout(220);
                    (await page.evaluate(layoutProblems)).forEach(f => problems.push(mode + " " + w + "px " + p + ": " + f));
                }
            }
            await tab("settings");
        }
        await page.setViewportSize({ width: 460, height: 640 });
        const uniq = [...new Set(problems)]; if (uniq.length) console.log(uniq.map(x => "       · " + x).join("\n")); assert.strictEqual(uniq.length, 0, uniq.length + " problems");
    });
    await step("нет ошибок в консоли", async () => { assert.deepStrictEqual(errors, [], errors.join("\n")); });

    await browser.close(); server.close();
    console.log("\n" + passed + " passed, " + failed + " failed");
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
