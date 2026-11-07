/* NOIR home screen: a glass ring with glowing section circles sitting on its rim, around an assistant orb.
   Hover the orb (or focus it) and the ring grows out of it while the circles pop onto the rim one after another.
   Click a circle -> that section opens full-size. Click the orb -> assistant. Plain HTML buttons, no connector lines. */
(function () {
    "use strict";
    var ICONS = {
        video: "M2 4h9v8H2z M11 7l4-2v6l-4-2", text: "M3 3h10 M8 3v10 M5.5 13h5", style: "M3 2h10v12H3z M5 5h6 M5 8h6 M5 11h3",
        place: "M3 3h10 M3 13h10 M8 5v6 M5.5 8.5L8 11l2.5-2.5", time: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z M8 5v3l2 1.5",
        anim: "M2 8h4 M6 8l-2-2 M6 8l-2 2 M9 3v10 M9 8h5 M14 8l-2-2 M14 8l-2 2", layers: "M8 2l6 3-6 3-6-3z M2 8l6 3 6-3 M2 11l6 3 6-3",
        more: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M12.6 3.4l-1.4 1.4 M4.8 11.2l-1.4 1.4"
    };
    var NS = "http://www.w3.org/2000/svg";
    function svgEl(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
    function icon(name) {
        var s = svgEl("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" });
        svgEl("path", { d: ICONS[name] || ICONS.more, fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round", "stroke-linejoin": "round" }, s);
        return s;
    }
    function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }

    var observer = null, moveHandler = null, current = null;
    function mount(host, options) {
        unmount(host);
        var groups = options.groups, orbit = el("div", "orbit", host), open = false, closeTimer = 0, m = { Rn: 120, Ro: 100, Ri: 62, T: 64, orb: 70 };
        host.classList.add("home-ready");
        var hint = el("p", "orbit-hint", host);
        hint.textContent = options.hint || "";
        var arrows = svgEl("svg", { "class": "orbit-arrows", "aria-hidden": "true" }, orbit);
        var tiles = groups.map(function (g, i) {
            var b = el("button", "orbit-tile", orbit); b.type = "button"; b.dataset.id = g.id; b.setAttribute("aria-label", g.label);
            b.tabIndex = -1; b.style.setProperty("--i", i);
            var ico = el("span", "tile-icon", b); ico.appendChild(icon(g.icon || g.id)); el("span", "tile-label", b).textContent = g.label;
            b.onclick = function () { options.open(g.id); };
            return b;
        });
        var ring = el("div", "orbit-ring", orbit);     // above the circles: where they overlap, the glass blurs them
        var orb = el("button", "orbit-orb", orbit); orb.type = "button"; orb.setAttribute("aria-label", "Помощник"); orb.setAttribute("aria-haspopup", "true");
        orb.innerHTML = '<span class="orb-glow"></span><span class="orb-core"></span><svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0 -10 L2.8 -2.8 L10 0 L2.8 2.8 L0 10 L-2.8 2.8 L-10 0 L-2.8 -2.8Z"></path></svg>';

        // Sizes follow the free space. Labels sit outside the circles (beside the side ones, above the top one, below the bottom one),
        // so width needs Rn + T/2 + label and height needs Rn + T/2 + a text line.
        function fit() {
            var LABEL_W = 80, LABEL_H = 22, n = tiles.length;
            var availW = host.clientWidth - 16, hintH = host.clientHeight < 340 ? 0 : hint.offsetHeight + 8;
            hint.style.display = hintH ? "" : "none";
            var availH = host.clientHeight - hintH - 12;
            var S = Math.max(150, Math.min(availW, availH)), T = Math.max(40, Math.min(84, S * 0.21));
            var Rn = Math.min(availW / 2 - LABEL_W - 9 - T / 2, availH / 2 - LABEL_H - 6 - T / 2, 200);
            Rn = Math.max(Rn, 60);
            T = Math.max(34, Math.min(T, 2 * Rn * Math.sin(Math.PI / n) - 10));       // neighbouring circles keep a gap
            var Ro = Rn - T * 0.28, Ri = Ro * 0.6, orbD = Math.max(36, Math.min(110, Ri * 1.5));     // circles overlap the rim only by ~a fifth
            m.Rn = Rn; m.Ro = Ro; m.Ri = Ri; m.T = T; m.orb = orbD;
            var W = Math.max(S, 2 * (Rn + T / 2 + LABEL_W)), H = Math.max(S, 2 * (Rn + T / 2 + LABEL_H));
            orbit.style.width = W + "px"; orbit.style.height = H + "px";
            orbit.style.setProperty("--T", T + "px"); orbit.style.setProperty("--orb", orbD + "px");
            ring.style.width = ring.style.height = (2 * Ro) + "px"; ring.style.borderWidth = (Ro - Ri) + "px";
            tiles.forEach(function (b, i) {
                var a = i * 2 * Math.PI / n, x = Rn * Math.sin(a), y = -Rn * Math.cos(a);
                b.style.setProperty("--x", x.toFixed(1) + "px"); b.style.setProperty("--y", y.toFixed(1) + "px");
                b.style.setProperty("--ix", (Math.sin(a) * T * 0.13).toFixed(1) + "px"); b.style.setProperty("--iy", (-Math.cos(a) * T * 0.13).toFixed(1) + "px");   // the icon sits on the clear, outer part
                b.dataset.side = Math.abs(x) < Rn * 0.3 ? (y < 0 ? "top" : "bottom") : (x > 0 ? "right" : "left");
            });
            // small curved arrows between neighbouring circles, just outside them
            arrows.setAttribute("width", W); arrows.setAttribute("height", H); arrows.setAttribute("viewBox", (-W / 2) + " " + (-H / 2) + " " + W + " " + H);
            while (arrows.firstChild) arrows.removeChild(arrows.firstChild);
            var Ra = Rn + T / 2 + 6, gap = (T / 2 + 14) / Ra;
            for (var i = 0; i < n; i++) {
                var a0 = i * 2 * Math.PI / n + gap, a1 = (i + 1) * 2 * Math.PI / n - gap;
                if (a1 - a0 < 0.12) continue;
                var p0 = [Ra * Math.sin(a0), -Ra * Math.cos(a0)], p1 = [Ra * Math.sin(a1), -Ra * Math.cos(a1)];
                svgEl("path", { d: "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " A" + Ra.toFixed(1) + " " + Ra.toFixed(1) + " 0 0 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1), fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-linecap": "round" }, arrows);
                var tx = Math.cos(a1), ty = Math.sin(a1);        // tangent at the end
                svgEl("path", { d: "M" + (p1[0] - 5 * tx - 3.2 * ty).toFixed(1) + " " + (p1[1] - 5 * ty + 3.2 * tx).toFixed(1) + " L" + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + " L" + (p1[0] - 5 * tx + 3.2 * ty).toFixed(1) + " " + (p1[1] - 5 * ty - 3.2 * tx).toFixed(1), fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-linecap": "round", "stroke-linejoin": "round" }, arrows);
            }
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
            if (!open) { if (d <= m.orb / 2 + 8) setOpen(true); }
            else if (d > m.Rn + m.T * 0.95) { clearTimeout(closeTimer); closeTimer = setTimeout(function () { setOpen(false); }, 380); }
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
