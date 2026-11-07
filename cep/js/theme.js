/* NOIR · follows the After Effects interface brightness. The panel background is AE's own panel colour;
   surfaces, lines and text are computed from it here (old CEP Chromium has no color-mix()). */
(function () {
    "use strict";
    var root = document.documentElement;
    function hex(c) { return "#" + c.map(function (v) { var h = Math.max(0, Math.min(255, Math.round(v))).toString(16); return h.length < 2 ? "0" + h : h; }).join(""); }
    function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    // Dark AE skin → the NOIR palette: warm near-black surfaces for the black-and-gold look (whatever grey AE uses).
    // Light AE skin → light surfaces computed from AE's colour, with darker gold accents.
    var NOIR = { "--bg": "#0b0a09", "--surface": "#13110f", "--surface-2": "#1a1714", "--surface-3": "#25211b", "--line": "#262119", "--line-strong": "#3a3226",
        "--text": "#f5f0e6", "--muted": "#a59c8c", "--faint": "#6f675a" };
    function apply(bg) {
        var lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255, light = lum > 0.55, toward = [0, 0, 0];
        root.setAttribute("data-theme", light ? "light" : "dark");
        var s = root.style, k;
        if (!light) { for (k in NOIR) s.setProperty(k, NOIR[k]); return; }
        s.setProperty("--bg", hex(bg));
        s.setProperty("--surface", hex(mix(bg, toward, 0.035)));
        s.setProperty("--surface-2", hex(mix(bg, toward, 0.07)));
        s.setProperty("--surface-3", hex(mix(bg, toward, 0.11)));
        s.setProperty("--line", hex(mix(bg, toward, 0.12)));
        s.setProperty("--line-strong", hex(mix(bg, toward, 0.22)));
        s.setProperty("--text", "#17130d");
        s.setProperty("--muted", hex(mix(bg, [0, 0, 0], 0.58)));
        s.setProperty("--faint", hex(mix(bg, [0, 0, 0], 0.4)));
    }
    function fromHost() {
        try {
            var env = JSON.parse(window.__adobe_cep__.getHostEnvironment()), c = env.appSkinInfo.panelBackgroundColor.color;
            apply([c.red, c.green, c.blue]);
        } catch (e) { apply([35, 35, 35]); }
    }
    if (window.__adobe_cep__ && window.__adobe_cep__.getHostEnvironment) {
        fromHost();
        try { window.__adobe_cep__.addEventListener("com.adobe.csxs.events.ThemeColorChanged", fromHost); } catch (e) {}
    } else apply([35, 35, 35]);
    window.NoirTheme = { apply: apply };
})();
