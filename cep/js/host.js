/* NOIR · connection to After Effects. One queue: calls run strictly one after another, so an edit never overtakes an action.
   call(op, args) -> Promise of the result; the host's state comes with every reply and is broadcast to listeners.
   Polling happens only while recognition or a face scan runs. */
(function () {
    "use strict";
    var cep = window.__adobe_cep__, chain = Promise.resolve(), state = null, listeners = { state: [], error: [], busy: [] };
    var pending = 0, pollTimer = 0, pollQueued = false, online = !!cep;
    function emit(type, value) { listeners[type].forEach(function (fn) { try { fn(value); } catch (e) { if (window.console) console.error(e); } }); }
    function evalScript(script) { return new Promise(function (resolve) { cep.evalScript(script, resolve); }); }
    function parse(raw) {
        try { var r = JSON.parse(raw); if (r && typeof r === "object") return r; } catch (e) {}
        return { ok: false, error: "Нет ответа от After Effects: " + String(raw).slice(0, 240) };
    }
    function literal(text) { return JSON.stringify(text).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }
    function run(script) {
        if (!cep) return Promise.resolve({ ok: false, error: NoirI18n.t("err.noCep") });
        var job = chain.then(function () { pending++; emit("busy", pending); return evalScript(script); }).then(function (raw) {
            pending--; emit("busy", pending);
            var r = parse(raw);
            if (r.state) { state = r.state; emit("state", state); schedulePoll(); }
            return r;
        });
        chain = job.then(null, function () {});
        return job;
    }
    function schedulePoll() {
        clearTimeout(pollTimer);
        if (!state || !(state.recognizing || state.scanning) || document.hidden) return;
        pollTimer = setTimeout(function () {
            if (pending || pollQueued) { schedulePoll(); return; }
            pollQueued = true; run(script("poll")).then(function () { pollQueued = false; });
        }, 800);
    }
    function script(op, args) { return "NOIR_CEP.call(" + literal(JSON.stringify({ op: op, args: args || {} })) + ")"; }
    // Rejects with Error(message) on failure; listeners of "error" get the message too unless quiet.
    function call(op, args, quiet) {
        return run(script(op, args)).then(function (r) {
            if (r.ok) return r.result;
            if (!quiet) emit("error", r.error);
            var e = new Error(r.error); e.host = true; throw e;
        });
    }
    function open() {
        return run("NOIR_CEP.open()").then(function (r) { if (!r.ok) { online = false; emit("error", r.error); throw new Error(r.error); } online = true; return r.result; });
    }
    document.addEventListener("visibilitychange", schedulePoll);
    window.NoirHost = {
        available: !!cep, open: open, call: call,
        state: function () { return state; }, online: function () { return online; }, busy: function () { return pending > 0; },
        on: function (type, fn) { listeners[type].push(fn); },
        // A pure promise that waits until the queue is empty (tests and the assistant use it).
        idle: function () { return chain; }
    };
})();
