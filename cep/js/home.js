/* NOIR home screen: a calm orb in the middle; hover it and the section tiles slide out from under it onto a ring.
   Click a tile -> that section opens full-size (the panel decides what that means). Click the orb -> assistant.
   Plain HTML buttons (real focus, real text), no connector lines. Layout numbers follow the free space. */
(function () {
    "use strict";
    var ICONS = {
        video: "M2 4h9v8H2z M11 7l4-2v6l-4-2", text: "M3 3h10 M8 3v10 M5.5 13h5", style: "M3 2h10v12H3z M5 5h6 M5 8h6 M5 11h3",
        place: "M3 3h10 M3 13h10 M8 5v6 M5.5 8.5L8 11l2.5-2.5", time: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z M8 5v3l2 1.5",
        anim: "M2 8h4 M6 8l-2-2 M6 8l-2 2 M9 3v10 M9 8h5 M14 8l-2-2 M14 8l-2 2", layers: "M8 2l6 3-6 3-6-3z M2 8l6 3 6-3 M2 11l6 3 6-3",
        more: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M12.6 3.4l-1.4 1.4 M4.8 11.2l-1.4 1.4"
    };
    var NS = "http://www.w3.org/2000/svg";
    function icon(name) {
        var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("aria-hidden", "true");
        var p = document.createElementNS(NS, "path"); p.setAttribute("d", ICONS[name] || ICONS.more);
        p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "1.3"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
        s.appendChild(p); return s;
    }
    function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }

    var observer = null, moveHandler = null, current = null;
    function mount(host, options) {
        unmount(host);
        var groups = options.groups, orbit = el("div", "orbit", host), open = false, closeTimer = 0, metrics = { R: 140, T: 70, orb: 90 };
        host.classList.add("home-ready");
        var hint = el("p", "orbit-hint", host);
        hint.textContent = "Наведите на шар — откроются разделы. Нажмите на шар — помощник.";
        var rings = el("div", "orbit-rings", orbit);
        var orb = el("button", "orbit-orb", orbit); orb.type = "button"; orb.setAttribute("aria-label", "Помощник"); orb.setAttribute("aria-haspopup", "true");
        orb.innerHTML = '<span class="orb-glow"></span><span class="orb-core"></span><svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0 -10 L2.8 -2.8 L10 0 L2.8 2.8 L0 10 L-2.8 2.8 L-10 0 L-2.8 -2.8Z"></path></svg>';
        var tiles = groups.map(function (g, i) {
            var b = el("button", "orbit-tile", orbit); b.type = "button"; b.dataset.id = g.id; b.setAttribute("aria-label", g.label);
            b.tabIndex = -1; b.style.setProperty("--i", i);
            var ico = el("span", "tile-icon", b); ico.appendChild(icon(g.icon || g.id)); el("span", "tile-label", b).textContent = g.label;
            b.onclick = function () { options.open(g.id); };
            return b;
        });
        function fit() {
            var w = host.clientWidth, hintH = host.clientHeight < 330 ? 0 : hint.offsetHeight + 8;
            hint.style.display = hintH ? "" : "none";
            var S = Math.max(150, Math.min(w - 8, host.clientHeight - hintH - 8)), n = tiles.length;
            metrics.T = Math.max(40, Math.min(86, S * 0.19)); metrics.orb = Math.max(54, Math.min(120, S * 0.26));
            metrics.R = Math.min(S * 0.37, S / 2 - metrics.T / 2 - 24);                    // labels hang below the tiles
            metrics.R = Math.max(metrics.R, metrics.orb / 2 + metrics.T / 2 + 6);
            metrics.T = Math.max(34, Math.min(metrics.T, 2 * metrics.R * Math.sin(Math.PI / n) - 8));   // neighbouring tiles never touch
            orbit.style.setProperty("--S", S + "px"); orbit.style.setProperty("--T", metrics.T + "px"); orbit.style.setProperty("--orb", metrics.orb + "px");
            tiles.forEach(function (b, i) {
                var a = i * 2 * Math.PI / tiles.length;
                b.style.setProperty("--x", (metrics.R * Math.sin(a)).toFixed(1) + "px"); b.style.setProperty("--y", (-metrics.R * Math.cos(a)).toFixed(1) + "px");
            });
            rings.style.setProperty("--r1", (metrics.R * 2) + "px"); rings.style.setProperty("--r2", (metrics.R * 2 + metrics.T * 1.6) + "px");
        }
        function setOpen(on) {
            clearTimeout(closeTimer); if (open === on) return; open = on;
            orbit.classList.toggle("open", on);
            tiles.forEach(function (b) { b.tabIndex = on ? 0 : -1; });
            orb.setAttribute("aria-expanded", String(on));
        }
        function distanceFromCenter(e) { var r = orbit.getBoundingClientRect(); return Math.sqrt(Math.pow(e.clientX - (r.left + r.width / 2), 2) + Math.pow(e.clientY - (r.top + r.height / 2), 2)); }
        moveHandler = function (e) {
            var d = distanceFromCenter(e);
            if (!open) { if (d <= metrics.orb / 2 + 8) setOpen(true); }
            else if (d > metrics.R + metrics.T * 0.95) { clearTimeout(closeTimer); closeTimer = setTimeout(function () { setOpen(false); }, 380); }
            else clearTimeout(closeTimer);
        };
        host.addEventListener("pointermove", moveHandler);
        host.addEventListener("pointerleave", function () { clearTimeout(closeTimer); closeTimer = setTimeout(function () { setOpen(false); }, 380); });
        orb.addEventListener("focus", function () { setOpen(true); });
        orb.onclick = function () { options.assistant(); };
        orbit.addEventListener("keydown", function (e) {
            if (e.key === "Escape") { setOpen(false); orb.focus(); return; }
            var i = tiles.indexOf(document.activeElement);
            if (i < 0 && document.activeElement !== orb) return;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setOpen(true); tiles[(i + 1) % tiles.length].focus(); }
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); tiles[(i <= 0 ? tiles.length : i) - 1].focus(); }
        });
        if (window.ResizeObserver) { observer = new ResizeObserver(fit); observer.observe(host); } else window.addEventListener("resize", fit);
        fit();
        current = { host: host, orbit: orbit, open: setOpen, state: function () { return open; } };
    }
    function unmount(host) {
        if (observer) { observer.disconnect(); observer = null; }
        if (moveHandler && current) current.host.removeEventListener("pointermove", moveHandler);
        moveHandler = null; current = null;
        host.textContent = ""; host.classList.remove("home-ready");
    }
    window.NoirHome = { mount: mount, setOpen: function (on) { if (current) current.open(on); }, isOpen: function () { return !!current && current.state(); } };
})();
