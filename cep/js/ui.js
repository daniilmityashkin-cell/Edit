/* NOIR · small view helpers: elements, icons, form controls bound to a settings path, toasts.
   A bound control sends "settings.set" on change and is refreshed from the host state (never while it has focus). */
(function () {
    "use strict";
    var t = function (k, v) { return NoirI18n.t(k, v); };
    var NS = "http://www.w3.org/2000/svg";
    // Icons: Lucide subset in js/icons.js (24×24 grid, 2 px stroke scaled to the icon size by CSS).
    var ALIAS = { text: "captions", style: "palette", spark: "sparkles", video: "mic" };
    function el(tag, cls, parent, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        if (parent) parent.appendChild(e);
        return e;
    }
    function icon(name, parent) {
        var lib = window.NoirIcons || {}, s = document.createElementNS(NS, "svg");
        s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "icon");
        s.innerHTML = lib[ALIAS[name] || name] || lib.more || "";
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
        var nav = document.querySelector(".tabs");          // just under the tabs: they stay readable
        box.style.top = (nav ? Math.round(nav.getBoundingClientRect().bottom) + 8 : 52) + "px";
        box.textContent = text || ""; box.className = "toast" + (text ? " show" : "") + (kind ? " " + kind : "");
        if (text) toastTimer = setTimeout(function () { box.className = "toast"; }, ms || (kind === "error" ? 7000 : 3200));
    }

    window.NoirUI = {
        el: el, icon: icon, button: button, iconButton: iconButton, card: card, row: row, field: field, refresh: refresh, toast: toast, toHex: toHex, fromHex: fromHex, valueAt: valueAt, t: t,
        bind: function (send, stateFn) { sendSetting = send; getState = stateFn; }
    };
})();
