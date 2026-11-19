const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const app = fs.readFileSync("app.js","utf8");
const sklad = fs.readFileSync("sklad.js","utf8");
const index = fs.readFileSync("index.html","utf8");

test("Главная вкладка Заказы имеет две подвкладки и сохраняет выбор", () => {
  assert.match(sklad, /data-t="cex">Заказы<\/button>/);
  assert.match(sklad, /data-order-sub="offline"/);
  assert.match(sklad, /data-order-sub="faction"/);
  assert.match(sklad, /forge-order-subtab/);
});
test("Разместить заказ из Моих заказов перемещает его только в локальное хранилище", () => {
  const from = sklad.indexOf('post.addEventListener("click"');
  const to = sklad.indexOf('    if (post) {', from);
  assert.ok(from >= 0 && to > from);
  const code = sklad.slice(from,to);
  assert.match(code,/saveOffline\(\[entry, \.\.\.offlineOrders\]\)/);
  assert.match(code,/orders\.splice\(cur, 1\)/);
  assert.ok(code.indexOf("saveOffline") < code.indexOf("orders.splice"));
  assert.doesNotMatch(code, /\.from\("gorders"\)/);
  assert.match(code,/orderSubtab = "offline"/);
});
test("Вкладка фракции использует Supabase; офлайн не должен требовать прав участника", () => {
  assert.match(sklad,/draftOn = \(\) => otab === "cex" && orderSubtab === "faction" && canFacMove\(\)/);
  assert.match(sklad,/if \(orderSubtab === "offline"\) \{/);
  assert.match(sklad,/gbox\.innerHTML = orderSubtabs\(\) \+ offlineHtml\(\)/);
  const offline = sklad.indexOf('if (orderSubtab === "offline") {');
  const auth = sklad.indexOf("if (!ok) {",offline);
  assert.ok(auth > offline);
  assert.match(sklad,/if \(b\.id === "gd-send"\)/);
  assert.match(sklad,/sb\.from\("gorders"\)\.insert/);
});
test("Размещённый заказ можно вернуть в работу без потери состава", () => {
  assert.match(sklad,/b\.dataset\.offline === "open"/);
  assert.match(sklad,/orders\.push\(JSON\.parse\(JSON\.stringify\(entry\.order\)\)\)/);
  assert.match(sklad,/switchOrder\(\)/);
  assert.match(sklad,/if \(o\.gid\)/);
});
test("Экспорт и импорт данных включают офлайн заказы; старый импорт не стирает новые", () => {
  assert.match(app,/journal, offlineOrders/);
  assert.match(app,/if \(Array\.isArray\(j\.offlineOrders\)\)/);
  assert.match(app,/forge-offline-orders-imported/);
  assert.match(sklad,/addEventListener\("forge-offline-orders-imported"/);
});
test("Версии кэша обновлены", () => {
  assert.match(index,/app\.js\?v=20261119c/);
  assert.match(index,/sklad\.js\?v=20261119c/);
});
