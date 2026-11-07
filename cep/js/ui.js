/* NOIR · small view helpers: elements, icons, form controls bound to a settings path, toasts.
   A bound control sends "settings.set" on change and is refreshed from the host state (never while it has focus). */
(function () {
    "use strict";
    var t = function (k, v) { return NoirI18n.t(k, v); };
    var NS = "http://www.w3.org/2000/svg";
    var ICONS = {
        home: "M2.5 7.5L8 3l5.5 4.5 M4 6.5V13h8V6.5", video: "M2 4h9v8H2z M11 7l3-2v6l-3-2", text: "M3 3h10 M8 3v10 M5.5 13h5",
        style: "M3 2h10v12H3z M5 5h6 M5 8h6 M5 11h3", edit: "M3 13l7-7 M9 4l3 3 M11 2l1 1", settings: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M12.6 3.4l-1.4 1.4 M4.8 11.2l-1.4 1.4",
        place: "M3 3h10 M3 13h10 M8 5v6 M5.5 8.5L8 11l2.5-2.5", time: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z M8 5v3l2 1.5",
        anim: "M2 8h4 M6 8l-2-2 M6 8l-2 2 M9 3v10 M9 8h5 M14 8l-2-2 M14 8l-2 2", layers: "M8 2l6 3-6 3-6-3z M2 8l6 3 6-3 M2 11l6 3 6-3",
        more: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M12.6 3.4l-1.4 1.4 M4.8 11.2l-1.4 1.4",
        play: "M5 3l8 5-8 5z", star: "M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5z", up: "M8 13V3 M4 7l4-4 4 4", down: "M8 3v10 M4 9l4 4 4-4",
        left: "M13 8H3 M7 4L3 8l4 4", right: "M3 8h10 M9 4l4 4-4 4", plus: "M8 3v10 M3 8h10", minus: "M3 8h10", close: "M4 4l8 8 M12 4l-8 8",
        spark: "M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z", check: "M3 8.5l3 3 7-7", undo: "M5 6H10a3.5 3.5 0 0 1 0 7H6 M7.5 3.5L5 6l2.5 2.5", file: "M4 2h5l3 3v9H4z M9 2v3h3", trash: "M3 4h10 M6 4V2.5h4V4 M4.5 4l.7 9.5h5.6l.7-9.5"
    };
    function el(tag, cls, parent, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        if (parent) parent.appendChild(e);
        return e;
    }
    function icon(name, parent) {
        var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "icon");
        var p = document.createElementNS(NS, "path"); p.setAttribute("d", ICONS[name] || ICONS.more); s.appendChild(p);
        if (parent) parent.appendChild(s);
        return s;
    }
    // button(label, cls, parent, onclick, iconName)
    function button(label, cls, parent, onclick, iconName) {
        var b = el("button", "btn" + (cls ? " " + cls : ""), parent); b.type = "button";
        if (iconName) icon(iconName, b);
        if (label) el("span", "btn-label", b, label);
        if (onclick) b.addEventListener("click", function (e) { onclick(e, b); });
        return b;
    }
    function iconButton(iconName, label, parent, onclick, cls) {
        var b = button("", "icon-btn" + (cls ? " " + cls : ""), parent, onclick, iconName);
        b.setAttribute("aria-label", label); b.title = label; return b;
    }
    function card(parent, title, lead, cls) {
        var c = el("section", "card" + (cls ? " " + cls : ""), parent);
        if (title) el("h2", "card-title", c, title);
        if (lead) el("p", "lead", c, lead);
        return c;
    }
    function row(parent, cls) { return el("div", "row" + (cls ? " " + cls : ""), parent); }

    // ---------- settings binding ----------
    var bindings = [], sendSetting = null, getState = function () { return null; };
    function valueAt(obj, path) { var parts = path.split("."); for (var i = 0; i < parts.length && obj !== undefined && obj !== null; i++) obj = obj[parts[i]]; return obj; }
    function toHex(c) { if (!(c instanceof Array)) return "#ffffff"; return "#" + c.slice(0, 3).map(function (v) { var h = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return h.length < 2 ? "0" + h : h; }).join(""); }
    function fromHex(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }
    // spec: {path, label, kind: select|number|range|toggle|color|text|segmented, options:[{id,label}] | fn, min, max, step, unit, hint, adv, map:{in,out}, value(st) — custom read, commit(v) — custom write, show(st)}
    function field(parent, spec) {
        var wrap = el(spec.kind === "toggle" ? "label" : "div", "field field-" + spec.kind + (spec.adv ? " adv" : ""), parent), input, out;
        wrap.dataset.path = spec.path;
        var id = "f-" + spec.path.replace(/[^a-z0-9]/gi, "-");
        if (spec.kind !== "toggle") { var lab = el("label", "field-label", wrap, spec.label); lab.htmlFor = id; }
        function commit(v) { if (spec.map && spec.map.out) v = spec.map.out(v); if (spec.commit) spec.commit(v); else sendSetting(spec.path, v); }
        switch (spec.kind) {
            case "select":
                input = el("select", "input", wrap); input.id = id;
                input.addEventListener("change", function () { commit(input.value); });
                break;
            case "segmented":
                input = el("div", "segmented", wrap); input.setAttribute("role", "radiogroup"); input.setAttribute("aria-label", spec.label);
                break;
            case "number": case "text":
                input = el(spec.multiline ? "textarea" : "input", "input", wrap); input.id = id;
                if (!spec.multiline) input.type = spec.kind === "number" ? "number" : "text";
                if (spec.kind === "number") { input.min = spec.min; input.max = spec.max; input.step = spec.step || "any"; input.inputMode = "decimal"; }
                if (spec.placeholder) input.placeholder = spec.placeholder;
                var timer = 0;
                input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { if (input.value !== "" || spec.kind === "text") commit(spec.kind === "number" ? Number(input.value) : input.value); }, 400); });
                input.addEventListener("change", function () { clearTimeout(timer); if (input.value !== "" || spec.kind === "text") commit(spec.kind === "number" ? Number(input.value) : input.value); });
                break;
            case "range":
                var line = el("div", "range-row", wrap);
                input = el("input", "range", line); input.type = "range"; input.id = id; input.min = spec.min; input.max = spec.max; input.step = spec.step || 1;
                out = el("output", "range-value", line);
                input.addEventListener("input", function () { out.textContent = input.value + (spec.unit || ""); });
                input.addEventListener("change", function () { commit(Number(input.value)); });
                break;
            case "toggle":
                input = el("input", "switch", wrap); input.type = "checkbox"; input.id = id;
                el("span", "field-label", wrap, spec.label);
                input.addEventListener("change", function () { commit(input.checked); });
                break;
            case "color":
                input = el("input", "color", wrap); input.type = "color"; input.id = id;
                input.addEventListener("change", function () { commit(fromHex(input.value)); });
                break;
        }
        if (spec.hint) el("p", "hint", wrap, spec.hint);
        var b = { spec: spec, wrap: wrap, input: input, out: out, last: undefined };
        bindings.push(b);
        var st = getState(); if (st) refreshOne(b, st);
        return wrap;
    }
    function options(spec, st) { return typeof spec.options === "function" ? spec.options(st) : spec.options || []; }
    function refreshOne(b, st) {
        var s = b.spec, v = s.value ? s.value(st) : valueAt(st.settings, s.path), input = b.input;
        if (s.map && s.map["in"]) v = s.map["in"](v);
        if (s.kind === "select" || s.kind === "segmented") {
            var opts = options(s, st), sig = JSON.stringify(opts);
            if (b.sig !== sig) {
                b.sig = sig; input.textContent = "";
                opts.forEach(function (o) {
                    if (s.kind === "select") { var op = el("option", "", input, o.label); op.value = o.id; }
                    else {
                        var btn = el("button", "seg", input, o.label); btn.type = "button"; btn.dataset.value = o.id; btn.setAttribute("role", "radio");
                        btn.addEventListener("click", function () { var v = s.map && s.map.out ? s.map.out(o.id) : o.id; if (s.commit) s.commit(v); else sendSetting(s.path, v); });
                    }
                });
            }
            if (s.kind === "select") { if (document.activeElement !== input) input.value = String(v); }
            else Array.prototype.forEach.call(input.children, function (c) { var on = c.dataset.value === String(v); c.classList.toggle("on", on); c.setAttribute("aria-checked", String(on)); });
        } else if (s.kind === "toggle") input.checked = !!v;
        else if (s.kind === "color") input.value = toHex(v);
        else if (document.activeElement !== input) {
            var text = v === undefined || v === null ? "" : String(s.kind === "number" || s.kind === "range" ? Math.round(Number(v) * 1000) / 1000 : v);
            if (input.value !== text) input.value = text;
            if (b.out) b.out.textContent = text + (s.unit || "");
        }
        b.wrap.hidden = s.show ? !s.show(st) : false;
    }
    function refresh(st) {
        bindings = bindings.filter(function (b) { return document.body.contains(b.wrap); });
        bindings.forEach(function (b) { refreshOne(b, st); });
    }

    // ---------- toast ----------
    var toastTimer = 0;
    function toast(text, kind, ms) {
        var box = document.getElementById("toast"); if (!box) return;
        clearTimeout(toastTimer);
        box.textContent = text || ""; box.className = "toast" + (text ? " show" : "") + (kind ? " " + kind : "");
        if (text) toastTimer = setTimeout(function () { box.className = "toast"; }, ms || (kind === "error" ? 7000 : 3200));
    }

    window.NoirUI = {
        el: el, icon: icon, button: button, iconButton: iconButton, card: card, row: row, field: field, refresh: refresh, toast: toast, toHex: toHex, fromHex: fromHex, valueAt: valueAt, t: t,
        bind: function (send, stateFn) { sendSetting = send; getState = stateFn; }
    };
})();
