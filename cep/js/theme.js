/* NOIR · follows the After Effects interface brightness. The panel background is AE's own panel colour;
   surfaces, lines and text are computed from it here (old CEP Chromium has no color-mix()). */
(function () {
    "use strict";
    var root = document.documentElement;
    function hex(c) { return "#" + c.map(function (v) { var h = Math.max(0, Math.min(255, Math.round(v))).toString(16); return h.length < 2 ? "0" + h : h; }).join(""); }
    function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function apply(bg) {
        var lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255, light = lum > 0.55, toward = light ? [0, 0, 0] : [255, 255, 255];
        root.setAttribute("data-theme", light ? "light" : "dark");
        var s = root.style;
        s.setProperty("--bg", hex(bg));
        s.setProperty("--surface", hex(mix(bg, toward, light ? 0.035 : 0.045)));
        s.setProperty("--surface-2", hex(mix(bg, toward, light ? 0.07 : 0.085)));
        s.setProperty("--surface-3", hex(mix(bg, toward, light ? 0.11 : 0.13)));
        s.setProperty("--line", hex(mix(bg, toward, light ? 0.12 : 0.11)));
        s.setProperty("--line-strong", hex(mix(bg, toward, light ? 0.22 : 0.2)));
        s.setProperty("--text", light ? "#14171c" : "#f3f5f8");
        s.setProperty("--muted", hex(mix(bg, light ? [0, 0, 0] : [255, 255, 255], light ? 0.58 : 0.58)));
        s.setProperty("--faint", hex(mix(bg, light ? [0, 0, 0] : [255, 255, 255], light ? 0.4 : 0.36)));
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
