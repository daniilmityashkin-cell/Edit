// HTML panel in Chromium against the real host (cep/host/bridge.jsx + ae/noir/*.jsx) running on the AE mock in Node.
//   node tests/test_cep_browser.js            (SHOTS=dir to save screenshots)
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), mock = require("./ae_mock");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "noir-browser-"));
mock.install({ temp: tmp, fonts: ["Inter-Bold", "Inter-SemiBold", "TimesNewRomanPSMT", "ArialMT"] });
global.$.fileName = root + "/cep/host/bridge.jsx";
(0, eval)(fs.readFileSync(global.$.fileName, "utf8"));
NOIR_CEP.load(root);
const N = global.NOIR, SHOTS = process.env.SHOTS;
const comp = new mock.CompItem({ duration: 12, _fonts: ["Inter-Bold", "Inter-SemiBold", "ArialMT"] }); global.app.project.activeItem = comp;
const subs = () => comp._l.filter(l => N.isGenerated(l));

let passed = 0, failed = 0;
async function step(name, fn) {
    try { await fn(); passed++; console.log("  ok  " + name); }
    catch (e) { failed++; console.log("  FAIL " + name + "\n       " + String(e.stack || e).split("\n").slice(0, 4).join("\n       ")); }
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

    console.log("HTML panel");
    await step("загрузка: оболочка, шрифт Inter, тема AE, главная с кольцом", async () => {
        await page.waitForSelector(".topbar");
        assert.ok(await page.evaluate(() => document.fonts.load('12px "Inter"').then(f => f.length > 0)), "Inter loads");
        assert.strictEqual(await page.getAttribute("html", "data-theme"), "dark");
        assert.ok(await page.locator(".orbit-orb").isVisible());
        assert.ok(calls.includes("NOIR_CEP.open()"));
        await shot("home");
    });
    await step("без дела панель не обращается к AE; переходы по вкладкам локальные", async () => {
        await settle(); const n = calls.length;
        for (const p of ["video", "text", "style", "edit", "settings", "home"]) await tab(p);
        await page.waitForTimeout(1200);
        assert.strictEqual(calls.length, n, calls.slice(n).join(","));
    });
    await step("наведение на шар раскрывает разделы, клик по разделу открывает страницу", async () => {
        const orb = await page.locator(".orbit-orb").boundingBox();
        await page.mouse.move(orb.x + orb.width / 2, orb.y + orb.height / 2);
        await page.waitForSelector(".orbit.open");
        await page.waitForTimeout(700); await shot("home-open");
        await page.locator('.orbit-tile[data-id="style"]').click();
        assert.ok(await page.locator("#page-style").isVisible());
    });
    await step("распознавание: состояние «занят», опрос идёт только пока работает, по готовности — редактор", async () => {
        let cb; const keep = { a: N.getAudioSource, m: N.modelCached, s: N.startRecognition };
        N.getAudioSource = () => ({ file: "x.wav", link: null }); N.modelCached = () => true;
        N.startRecognition = (src, o, c) => { cb = c; c.onStatus({ state: "recognizing", message: "Распознаю", progress: 0.4 }); };
        try {
            await tab("video"); await page.locator(".page-video .btn.primary").click();
            await page.waitForFunction(() => document.querySelector(".pill").dataset.state === "busy");
            assert.ok(await page.locator(".progress").isVisible());
            await shot("recognizing");
            const polls = calls.filter(c => c === "poll").length; await page.waitForTimeout(1900);
            assert.ok(calls.filter(c => c === "poll").length > polls, "polls while busy");
            cb.onDone({ schema: "noir-captions/1", language: "ru", source: { file: path.join(tmp, "clip.mp4") }, segments: [
                { words: [{ text: "Привет,", start: 1, end: 1.3 }, { text: "это", start: 1.35, end: 1.5 }, { text: "NOIR.", start: 1.5, end: 2 }] },
                { words: [{ text: "Субтитры", start: 3, end: 3.6, conf: 0.4 }, { text: "сами", start: 3.6, end: 3.9 }] }] }, { link: null });
            await page.waitForFunction(() => !document.querySelector("#page-text").hidden && document.querySelector(".editor").value.indexOf("Привет") === 0);
            const n = calls.length; await page.waitForTimeout(1300); assert.strictEqual(calls.length, n, "polling stops");
            assert.ok(await page.locator(".word.low").count() === 0, "phrase 1 has no low words");
        } finally { Object.assign(N, { getAudioSource: keep.a, modelCached: keep.m, startRecognition: keep.s }); }
    });
    await step("текст: правка уходит в AE с задержкой; выделенное слово — акцент; фраза по курсору", async () => {
        const ed = page.locator(".editor");
        await page.evaluate(() => { const e = document.querySelector(".editor"); const i = e.value.indexOf("сами"); e.focus(); e.setSelectionRange(i, i + 4); });
        await page.keyboard.type("сама");
        await page.waitForTimeout(500); await settle();
        assert.ok(/сама/.test(await page.evaluate(() => NoirHost.state().text)));
        await page.evaluate(() => { const e = document.querySelector(".editor"); const i = e.value.indexOf("это"); e.focus(); e.setSelectionRange(i, i + 3); });
        await page.locator(".word-tools .chip").first().click(); await settle();
        assert.ok(/\*это\*/.test(await ed.inputValue()), await ed.inputValue());
        await page.evaluate(() => { const e = document.querySelector(".editor"); const i = e.value.indexOf("Субтитры"); e.focus(); e.setSelectionRange(i, i); });
        await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300); await settle();
        assert.strictEqual(await page.evaluate(() => NoirHost.state().phrase), 1);
        assert.ok(await page.locator(".word.low").count() === 1, "low-confidence word marked");
        await shot("text");
    });
    await step("слово исправляется в чипе с сохранением тайминга", async () => {
        await page.locator(".word.low").click(); const input = page.locator(".word-input");
        await input.fill("Субтитры!"); await input.press("Enter"); await settle();
        assert.ok(/Субтитры!/.test(await page.evaluate(() => NoirHost.state().text)));
    });
    await step("создание: проверка замечаний, «создать с замечаниями», затем «Обновить все»", async () => {
        await page.locator(".sticky-actions .btn.primary").click(); await settle();
        if (await page.locator(".issues").isVisible()) { await shot("issues"); await page.locator(".issues .btn.primary").click(); await settle(); }
        assert.ok(subs().length > 0, "layers made");
        await page.waitForFunction(() => document.querySelector(".topbar .btn.primary").textContent.indexOf("Обновить") >= 0);
    });
    await step("стиль: выбор карточки и избранное; размер — ползунок", async () => {
        await tab("style");
        const card = page.locator(".style-card").nth(2), id = await card.locator(".style-pick").getAttribute("aria-label");
        await card.locator(".style-pick").click(); await settle();
        assert.ok(await card.evaluate(e => e.classList.contains("on")), "selected " + id);
        await card.locator(".star").click(); await settle();
        assert.strictEqual(await page.evaluate(() => NoirHost.state().settings.favoriteStyles.length), 1);
        await page.locator('.field[data-path="quick.size"] input').evaluate(e => { e.value = 120; e.dispatchEvent(new Event("change")); }); await settle();
        assert.strictEqual(await page.evaluate(() => NoirHost.state().settings.quick.size), 120);
        await shot("style");
    });
    await step("правка: «Внизу» двигает субтитры; ошибка без выделения — понятный тост", async () => {
        await tab("edit");
        await page.getByRole("button", { name: "Внизу", exact: true }).click(); await settle();
        assert.ok(/Фраз перемещено/.test(await page.evaluate(() => NoirHost.state().status)));
        await page.locator('.field[data-path="scope"] .seg[data-value="selected"]').click(); await settle();
        await page.getByRole("button", { name: "Применить текущий стиль" }).click(); await settle();
        await page.waitForSelector(".toast.show.error"); assert.ok(/Выделите/.test(await page.locator(".toast").textContent()));
        await page.locator('.field[data-path="scope"] .seg[data-value="source"]').click(); await settle();
        await shot("edit");
    });
    await step("настройки: расширенный режим открывает параметры; число сохраняется в AE", async () => {
        await tab("settings");
        assert.strictEqual(await page.locator('.field[data-path="style.layout.lineGap"]').isVisible(), false);
        await page.locator('.field[data-path="advanced"] .switch').click();
        assert.ok(await page.locator('.field[data-path="style.layout.lineGap"]').isVisible());
        const f = page.locator('.field[data-path="style.layout.maxWords"] input'); await f.fill("3"); await f.press("Tab"); await settle();
        assert.strictEqual(await page.evaluate(() => NoirHost.state().settings.style.layout.maxWords), 3);
        await shot("settings");
    });
    await step("светлая тема AE и английский интерфейс", async () => {
        await page.evaluate(() => NoirTheme.apply([214, 214, 214]));
        assert.strictEqual(await page.getAttribute("html", "data-theme"), "light");
        await shot("settings-light");
        await page.locator('.field[data-path="lang"] .seg[data-value="en"]').click(); await settle();
        await page.waitForFunction(() => document.querySelector('.tab[data-page="video"]').textContent === "Video");
        await page.locator('.field[data-path="lang"] .seg[data-value="ru"]').click(); await settle();
        await page.evaluate(() => NoirTheme.apply([35, 35, 35]));
        const text = await page.evaluate(() => NoirHost.state().text);
        await tab("text"); await page.locator(".editor").focus(); await page.locator(".editor").blur(); await page.waitForTimeout(450); await settle();
        assert.strictEqual(await page.evaluate(() => NoirHost.state().text), text, "rebuilt editor must not overwrite AE text");
        assert.strictEqual(await page.locator(".editor").inputValue(), text);
    });
    await step("радиальное меню: правая кнопка открывает, Esc закрывает; пункт выполняет команду", async () => {
        await tab("text");
        const lead = await page.locator("#page-text .lead").boundingBox();
        await page.mouse.click(lead.x + 20, lead.y + 6, { button: "right" });
        await page.waitForSelector(".noir-wheel"); await shot("wheel");
        await page.keyboard.press("Escape"); assert.strictEqual(await page.locator(".noir-wheel").count(), 0);
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
    await step("узкая панель 300 px: без горизонтальной прокрутки, вкладки помещаются", async () => {
        await page.setViewportSize({ width: 300, height: 520 });
        for (const p of ["home", "video", "text", "style", "edit", "settings"]) {
            await tab(p); await page.waitForTimeout(80);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), p);
            const over = await page.evaluate(() => { const pg = document.querySelector(".page:not([hidden])"); return pg.scrollWidth - pg.clientWidth; });
            assert.ok(over <= 1, p + " overflows by " + over);
        }
        await tab("text"); await page.waitForTimeout(300); await shot("narrow-text");
    });
    await step("нет ошибок в консоли", async () => { assert.deepStrictEqual(errors, [], errors.join("\n")); });

    await browser.close(); server.close();
    console.log("\n" + passed + " passed, " + failed + " failed");
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
