const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("sklad.js", "utf8");
const start = source.indexOf("// START WAREHOUSE_SAVE_PREPARE");
const end = source.indexOf("// END WAREHOUSE_SAVE_PREPARE");
assert.ok(start !== -1 && end > start, "Резервная функция сохранения должна быть в основном скрипте");
const fnSrc = source.slice(start, end);
const sandbox = {};
vm.runInNewContext(fnSrc + "\nthis.prepare = prepareWarehouseMovesFallback;", sandbox);
const prepare = sandbox.prepare;
const opts = { faction: "kutna", note: "Поставка", batch: "b-24", payer: "self", paidAmount: "0" };

test("Записать готовит 24 позиции одной операцией, сумма один раз", () => {
  const entries = Array.from({ length: 24 }, (_, i) => ["res-" + i, i % 4 === 0 ? -i - 1 : i + 1]);
  const rows = prepare(entries, opts);
  assert.equal(rows.length, 24);
  assert.equal(rows.filter(r => r.paid_amount !== null).length, 1);
  assert.equal(rows.filter(r => r.qty > 0 && r.paid_by !== "self").length, 0);
  assert.equal(rows.filter(r => r.qty < 0 && r.paid_by !== null).length, 0);
  assert.equal(rows.every(r => r.batch === "b-24"), true);
});
test("платёж на 24 позиции не суммируется по каждой строке", () => {
  const entries = Array.from({ length: 24 }, (_, i) => ["res-" + i, i + 1]);
  const rows = prepare(entries, { ...opts, paidAmount: "12000", payer: "guild" });
  assert.equal(rows.reduce((sum, r) => sum + (r.paid_amount || 0), 0), 12000);
});
test("только списания не требуют суммы", () => {
  const rows = prepare([["fe", -12], ["co", -4]], { ...opts, paidAmount: "" });
  assert.equal(rows.every(r => r.paid_amount === null && r.paid_by === null), true);
});
test("непрогруженный вспомогательный модуль не требуется для Записать", () => {
  assert.equal(source.includes("window.FORGE_WAREHOUSE_PAYMENT.prepareMoves("), false);
  assert.match(source, /rows = prepareWarehouseMoves\(l,/);
});
test("пустая и нецелая суммы отклоняются до отправки", () => {
  for (const val of ["", "1.5", "-10", "abc"]) {
    assert.throws(() => prepare([["fe", 5]], { ...opts, paidAmount: val }), /сумму пополнения/);
  }
});
