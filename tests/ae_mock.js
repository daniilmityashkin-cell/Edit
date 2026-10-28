// Минимальная имитация объектной модели After Effects + ScriptUI для тестов в Node.
// Это НЕ замена проверки в настоящем AE: мок проверяет логику и отсутствие
// опечаток/обращений к несуществующим переменным.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");

const PropertyValueType = { ThreeD_SPATIAL: 1, TwoD_SPATIAL: 2, ThreeD: 3, TwoD: 4, OneD: 5 };
const ParagraphJustification = { CENTER_JUSTIFY: "center" };
function KeyframeEase(speed, influence) { this.speed = speed; this.influence = influence; }

class Prop {
  constructor(type, value) { this.propertyValueType = type; this.value = value; this.keys = []; }
  get numKeys() { return this.keys.length; }
  setValue(v) { this.value = v; }
  setValueAtTime(t, v) {
    if (!isFinite(t)) throw new Error("bad key time " + t);
    const i = this.keys.findIndex(k => Math.abs(k.t - t) < 1e-9);
    if (i >= 0) this.keys[i].v = v; else this.keys.push({ t, v });
    this.keys.sort((a, b) => a.t - b.t);
  }
  setTemporalEaseAtKey(i, a, b) {
    const n = { 1: 1, 2: 1, 3: 3, 4: 2, 5: 1 }[this.propertyValueType];
    if (a.length !== n || b.length !== n) throw new Error("ease dimension mismatch");
    if (i < 1 || i > this.keys.length) throw new Error("key index out of range");
  }
}

class TextDocument {
  constructor(text) { this.text = text; this.fontSize = 36; this.font = "ArialMT"; this.tracking = 0; }
  resetCharStyle() {} resetParagraphStyle() {}
}

class Effect {
  constructor(matchName) {
    this.matchName = matchName; this.name = matchName; this.props = {};
  }
  property(mn) {
    if (!this.props[mn]) {
      const p = new Prop(PropertyValueType.OneD, 0);
      // как в AE: у Drop Shadow непрозрачность 0..255
      if (mn === "ADBE Drop Shadow-0002") { p.hasMax = true; p.maxValue = 255; }
      this.props[mn] = p;
    }
    return this.props[mn];
  }
}

class Layer {
  constructor(comp, name) {
    this.comp = comp; this.name = name; this.comment = ""; this.locked = false; this.label = 0;
    this.startTime = 0; this._in = 0; this._out = comp.duration; this.stretch = 100;
    this.timeRemapEnabled = false; this.hasAudio = false;
    this.transform = {
      "Position": new Prop(PropertyValueType.ThreeD_SPATIAL, [0, 0, 0]),
      "Scale": new Prop(PropertyValueType.ThreeD, [100, 100, 100]),
      "Opacity": new Prop(PropertyValueType.OneD, 100),
      "Anchor Point": new Prop(PropertyValueType.ThreeD_SPATIAL, [0, 0, 0]),
    };
  }
  get inPoint() { return this._in; }
  set inPoint(v) { if (v >= this._out) throw new Error("inPoint >= outPoint"); this._in = v; }
  get outPoint() { return this._out; }
  set outPoint(v) { if (v <= this._in) throw new Error("outPoint <= inPoint"); this._out = v; }
  get index() { return this.comp._l.indexOf(this) + 1; }
  property(n) {
    if (n === "Transform") return { property: k => this.transform[k] };
    if (this.src && n === "Source Text") return this.src;
    if (n === "ADBE Effect Parade") {
      const self = this; self.effects = self.effects || [];
      return { canAddProperty: () => true, addProperty: (mn) => { const e = new Effect(mn); self.effects.push(e); return e; } };
    }
    throw new Error("no property " + n);
  }
  remove() { this.comp._l.splice(this.comp._l.indexOf(this), 1); }
}
class AVLayer extends Layer {}
class TextLayer extends AVLayer {
  constructor(comp, text, fonts) {
    super(comp, text);
    this.src = new Prop(PropertyValueType.OneD, new TextDocument(text));
    const origSet = this.src.setValue.bind(this.src);
    // Как в AE: setValue копирует документ; неизвестный шрифт не применяется.
    this.src.setValue = (doc) => {
      const copy = Object.assign(new TextDocument(doc.text), doc);
      if (!fonts.includes(copy.font)) copy.font = "ArialMT";
      origSet(copy);
    };
    Object.defineProperty(this.src, "value", {
      get() { return Object.assign(new TextDocument(this._v.text), this._v); },
      set(v) { this._v = v; },
    });
    this.src._v = new TextDocument(text);
  }
  sourceRectAtTime() {
    const d = this.src.value;
    return { left: 0, top: -d.fontSize * 0.75, width: d.text.length * d.fontSize * 0.5, height: d.fontSize * 0.75 };
  }
}
class FootageItem { constructor(file) { this.mainSource = { file }; } }
class CompItem {
  constructor(o) {
    Object.assign(this, { id: 1, name: "Comp", width: 1080, height: 1920, duration: 30, frameRate: 30 }, o);
    this.frameDuration = 1 / this.frameRate; this._l = [];
    const self = this;
    this.layers = { addText(t) { const l = new TextLayer(self, t, self._fonts || []); self._l.unshift(l); return l; } };
  }
  get numLayers() { return this._l.length; }
  layer(i) { return this._l[i - 1]; }
  get selectedLayers() { return this._l.filter(l => l.selected); }
}

// ---------- File / Folder ----------
class FSItem {
  constructor(p) { this.fsName = path.resolve(String(p).replace(/^~/, os.homedir())); }
  get exists() { return fs.existsSync(this.fsName); }
  get parent() { return new FolderC(path.dirname(this.fsName)); }
  get name() { return path.basename(this.fsName); }
}
class FileC extends FSItem {
  open(mode) { this._mode = mode; if (mode === "r") { if (!this.exists) return false; this._buf = fs.readFileSync(this.fsName, "utf8"); } else this._buf = ""; return true; }
  read() { return this._buf; }
  write(s) { this._buf += s; }
  close() { if (this._mode === "w") fs.writeFileSync(this.fsName, this._buf, "utf8"); }
}
class FolderC extends FSItem {
  create() { fs.mkdirSync(this.fsName, { recursive: true }); return true; }
  getFiles(mask) {
    const re = new RegExp("^" + String(mask || "*").replace(/\./g, "\\.").replace(/\*/g, ".*") + "$", "i");
    return fs.readdirSync(this.fsName).filter(f => re.test(f)).map(f => new FileC(path.join(this.fsName, f)));
  }
}
const File = (p) => new FileC(p);
File.openDialog = () => null; File.saveDialog = () => null;
const Folder = (p) => new FolderC(p);

// ---------- ScriptUI ----------
class UI {
  constructor(type, parent, a, b) {
    this.type = type; this.parent = parent; this.children = []; this.preferredSize = { width: 0, height: 0 };
    this.enabled = true; this.graphics = { newBrush: () => ({}), BrushType: { SOLID_COLOR: 0 } };
    this.layout = { layout() {}, resize() {} };
    if (type === "dropdownlist") { this.items = []; (b || []).forEach(t => this.add("item", t)); this._sel = null; }
    else if (type === "checkbox") { this.text = a; this.value = false; }
    else if (type === "edittext" || type === "statictext" || type === "button" || type === "tab" || type === "panel") this.text = b !== undefined && type !== "tab" && type !== "panel" ? b : (b || a || "");
    if (type === "progressbar") this.value = 0;
  }
  add(type, bounds, text, props) {
    if (this.type === "dropdownlist" && type === "item") { const it = { text: bounds, index: this.items.length }; this.items.push(it); return it; }
    const el = new UI(type, this, bounds, text);
    if (type === "edittext") el.text = text || "";
    if (type === "statictext" || type === "button") el.text = text;
    this.children.push(el); return el;
  }
  removeAll() { this.items = []; this._sel = null; }
  get selection() { return this._sel; }
  set selection(v) { this._sel = typeof v === "number" ? this.items[v] : v; if (this.onChange) this.onChange(); }
  find(pred) { if (pred(this)) return this; for (const c of this.children) { const r = c.find(pred); if (r) return r; } return null; }
  button(text) { return this.find(e => e.type === "button" && e.text === text); }
}
class Panel extends UI { constructor() { super("panel"); } }
class Window extends UI { constructor() { super("window"); } center() {} show() {} }

function install(opts = {}) {
  const settings = {};
  const tasks = {};
  let taskId = 0;
  const log = { alerts: [] };
  const g = global;
  Object.assign(g, {
    PropertyValueType, ParagraphJustification, KeyframeEase, CompItem, AVLayer, TextLayer, FootageItem,
    File, Folder, Panel, Window,
    alert: (m) => { log.alerts.push(String(m)); if (opts.verbose) console.log("ALERT:", m); },
    confirm: () => true,
    prompt: (m, d) => (opts.promptAnswer !== undefined ? opts.promptAnswer : d),
  });
  Folder.temp = new FolderC(opts.temp || os.tmpdir());
  Folder.userData = new FolderC(path.join(opts.temp || os.tmpdir(), "userData"));
  g.$ = {
    os: "Linux", global: g, fileName: "", getenv: (k) => process.env[k] || null,
    colorPicker: () => -1, evalFile: (f) => (0, eval)(fs.readFileSync(f.fsName, "utf8")),
  };
  g.system = { callSystem: (cmd) => { try { return cp.execSync(cmd, { encoding: "utf8" }); } catch (e) { return e.stdout || ""; } } };
  g.app = {
    project: { activeItem: null },
    fonts: { allFonts: (opts.fonts || []).map(f => [{ familyName: f.split("-")[0], styleName: f.split("-")[1] || "Regular", postScriptName: f }]) },
    settings: {
      haveSetting: (s, k) => (s + "/" + k) in settings,
      getSetting: (s, k) => settings[s + "/" + k],
      saveSetting: (s, k, v) => { settings[s + "/" + k] = v; },
    },
    beginUndoGroup() {}, endUndoGroup() {},
    scheduleTask(code, ms, repeat) { const id = ++taskId; tasks[id] = setInterval(() => (0, eval)(code), ms); return id; },
    cancelTask(id) { clearInterval(tasks[id]); delete tasks[id]; },
  };
  return { log, settings, tasks };
}

module.exports = { install, CompItem, AVLayer, TextLayer, FootageItem, File, Folder, Panel, UI };
