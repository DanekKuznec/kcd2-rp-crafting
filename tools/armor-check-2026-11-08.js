// Сверка брони со скринами игры (8 ноября): ресурсы, плата за верстак, названия.
const fs = require("fs");
const SH = fs.readFileSync(__dirname + "/armor-shots-2026-11-08.txt", "utf8").trim().split("\n").map(l => {
  const [n, r, b] = l.split("|");
  return { n, r: Object.fromEntries(r.trim().split(/\s+/).map(t => { const m = t.match(/^([a-z]+)(\d+)$/); return [m[1], +m[2]]; })), b: b ? +b : null };
});
const AL = {"Панские пластинчатые поножи (8 ур.)":"Панские пластинчатые поножи (фасон 2)","Нюрнбергские латные перчатки":"Нюрнбергские латные перчатки (тяжёлая версия)","Магдебургские латные наручи (Hanush)":"Магдебургские латные наручи (фасон 2)","Пластинчатые рукава с ронделями":"Пластинчатые рукава с ронделами","Налокотники с ронделями":"Налокотники с ронделами","Панцирь скряги":"Панцирь скраги","Кольчужный воротник со знаком":"Кольчужный воротник со значком","Цервельер с ронделями":"Цервельер с ронделами"};
const norm = s => s.toLowerCase().replace(/ё/g, "е").replace(/[«»"]/g, "").trim();
const ORDER = ["steel","pad","hd","ag","nug","au","met","cuo","co","fe"];
function patch(file) {
  const src = fs.readFileSync(file, "utf8");
  const head = src.slice(0, src.indexOf("window.FORGE_DATA = ")), body = src.slice(src.indexOf("window.FORGE_DATA = ") + 20).trim().replace(/;\s*$/, "");
  const D = JSON.parse(body);
  const log = [], rename = {};
  for (const i of D.items.filter(x => x.s === "a" && !x.m)) {
    const gameName = AL[i.n] || i.n;
    const s = SH.find(x => norm(x.n) === norm(gameName));
    if (!s) continue;
    const r = {};
    ORDER.concat(Object.keys(s.r)).forEach(k => { if (s.r[k] && !(k in r)) r[k] = s.r[k]; });
    const before = JSON.stringify(i.r) + "|" + i.b;
    i.r = r;
    if (s.b != null) i.b = s.b;
    if (gameName !== i.n) { rename[i.id] = "a:" + gameName; i.n = gameName; i.id = "a:" + gameName; }
    if (before !== JSON.stringify(i.r) + "|" + i.b) log.push(i.n);
  }
  fs.writeFileSync(file, head + "window.FORGE_DATA = " + JSON.stringify(D) + ";\n");
  return { log, rename };
}
for (const f of process.argv.slice(2)) { const r = patch(f); console.log(f, "changed:", r.log.length, "renamed:", JSON.stringify(r.rename)); }
