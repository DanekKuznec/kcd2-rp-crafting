const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("sklad.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
test("кнопка размещения личного заказа создаётся рядом с основными действиями", () => {
  assert.match(source, /post\.id = "g-post-own"/);
  assert.match(source, /document\.getElementById\("odel"\)\.after\(post\)/);
  assert.match(source, /post\.textContent = "Разместить заказ"/);
});
test("кнопка доступна во вкладке Мои заказы участнику с правом размещать", () => {
  assert.match(source, /post\.hidden = t !== "my" \|\| !canFacMove\(\)/);
  assert.match(source, /post\.disabled = !\(orders\[cur\]/);
});
test("при размещении состав копируется, а не добавляется к старому черновику", () => {
  assert.match(source, /gDraft\.qty = Object\.fromEntries\(Object\.entries\(o\.qty/);
  assert.match(source, /gDraft\.vars = \{ \.\.\.\(o\.vars \|\| \{\}\) \}/);
  assert.match(source, /gDraft\.client = \{ \.\.\.\(o\.client \|\| \{\}\) \}/);
  assert.match(source, /gDraft\.manual_set = !!o\.manualSet/);
});
test("заполненный черновик нельзя незаметно перезаписать", () => {
  assert.match(source, /!post\.dataset\.confirm/);
  assert.match(source, /post\.textContent = "Заменить черновик\?"/);
});
test("после переноса открывается форма фракции; новая версия JS подключена", () => {
  assert.match(source, /otab = "cex";[\s\S]*?setFocus\("draft"\)/);
  assert.match(html, /sklad\.js\?v=20261119b/);
});
