// Проверка кода для ExtendScript (ES3): зарезервированные слова как имена, ES5+-конструкции.
"use strict";
const fs = require("fs"), path = require("path");
const RESERVED = "break case catch continue default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with abstract boolean byte char class const debugger double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile".split(" ");
const dir = path.join(__dirname, "../ae/noir");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".jsx")).map(f => path.join(dir, f)).concat([path.join(__dirname, "../ae/NOIR Captions.jsx")]);
let bad = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((ln, i) => {
    const code = ln.replace(/\/\/.*$/, "").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    if (/^\s*\*|^\s*\/\*/.test(ln)) return;
    const hits = [];
    for (const w of RESERVED) {
      if (new RegExp("\\." + w + "\\b|[{,]\\s*" + w + "\\s*:|\\bvar\\s+" + w + "\\b|\\bfunction\\s+" + w + "\\b").test(code)) hits.push("зарезервированное слово «" + w + "»");
    }
    if (/\b(let|const)\b|=>|`|\.\.\./.test(code)) hits.push("ES6-синтаксис");
    if (/\.(map|forEach|filter|reduce|some|every|find|includes|trim|indexOf)\(/.test(code) && !/(text|name|txt|t|s|str|c|id|fsName|comment)\b[\w.()\[\]]*\.indexOf\(|toLowerCase\(\)\.indexOf|\.text\.indexOf|\.comment\.indexOf/.test(code) && /\.(map|forEach|filter|reduce|some|every|find|includes|trim)\(/.test(code)) hits.push("метод ES5+ у массива");
    if (/,\s*[}\]]/.test(code)) hits.push("висячая запятая");
    for (const h of hits) { console.log(path.relative(process.cwd(), f) + ":" + (i + 1) + "  " + h + "  | " + ln.trim().slice(0, 80)); bad++; }
  });
}
if (bad) { console.log(bad + " проблем(ы) для ExtendScript"); process.exit(1); }
console.log("ES3-проверка: ok (" + files.length + " файлов)");
