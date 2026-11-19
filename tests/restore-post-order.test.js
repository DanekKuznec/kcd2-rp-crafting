const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("sklad.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
test("кнопка Разместить заказ остаётся в Моих заказах", () => {
  assert.match(source, /post\.id = "g-post-own"/);
  assert.match(source, /document\.getElementById\("odel"\)\.after\(post\)/);
  assert.match(source, /post\.textContent = "Разместить заказ"/);
  assert.match(source, /post\.hidden = t !== "my"/);
});
test("кнопка не требует прав цеха для личного офлайн-размещения", () => {
  assert.match(source,/post\.disabled = !\(orders\[cur\] && !orders\[cur\]\.gid/);
  assert.match(source,/if \(o\.gid\)/);
  assert.match(source,/saveOffline\(\[entry, \.\.\.offlineOrders\]\)/);
});
test("личный заказ перенесён в офлайн, черновик фракции не переписан", () => {
  const begin = source.indexOf('post.addEventListener("click"');
  const end = source.indexOf('    if (post) {',begin);
  const click = source.slice(begin,end);
  assert.ok(begin >= 0 && end > begin);
  assert.match(click,/orders\.splice\(cur, 1\)/);
  assert.doesNotMatch(click,/gDraft\./);
  assert.match(click,/orderSubtab = "offline"/);
});
test("личные заказы можно возвратить в Мои заказы", () => {
  assert.match(source,/b\.dataset\.offline === "open"/);
  assert.match(source,/orders\.push\(JSON\.parse\(JSON\.stringify\(entry\.order\)\)\)/);
});
test("в фракционной подвкладке остаётся отправка во фракцию", () => {
  assert.match(source,/if \(b\.id === "gd-send"\)/);
  assert.match(source,/sb\.from\("gorders"\)\.insert/);
  assert.match(html,/sklad\.js\?v=20261119c/);
});
