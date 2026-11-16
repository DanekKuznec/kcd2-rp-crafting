const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareMoves } = require("../warehouse-payment.js");
const base = { faction: "kutna", note: "Пополнение", batch: "batch-1", payer: "guild", paidAmount: "751" };
test("один ресурс - источник и сумма", () => {
  const rows = prepareMoves([["ag", 5]], base);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].paid_by, "guild");
  assert.equal(rows[0].paid_amount, 751);
});
test("несколько ресурсов - платёж записан ровно один раз", () => {
  const rows = prepareMoves([["ag", 5], ["co", 2], ["fe", 4]], base);
  assert.equal(rows.reduce((a, x) => a + (x.paid_amount || 0), 0), 751);
  assert.deepEqual(rows.map(x => x.paid_amount), [751, null, null]);
});
test("смешанная партия - списание не получает сумму или плательщика", () => {
  const rows = prepareMoves([["fe", -3], ["ag", 5], ["co", -1], ["steel", 2]], base);
  assert.deepEqual(rows.map(x => x.paid_amount), [null, 751, null, null]);
  assert.deepEqual(rows.map(x => x.paid_by), [null, "guild", null, "guild"]);
});
test("сумма 0 допустима", () => {
  assert.equal(prepareMoves([["ag", 1]], { ...base, paidAmount: "0" })[0].paid_amount, 0);
});
test("только списание - сумма не требуется", () => {
  const rows = prepareMoves([["ag", -2]], { ...base, paidAmount: "" });
  assert.equal(rows[0].paid_amount, null);
  assert.equal(rows[0].paid_by, null);
});
test("пустая, отрицательная, дробная и недопустимая сумма отклоняются", () => {
  for (const paidAmount of ["", "-1", "1.2", "abc", "9007199254740992"])
    assert.throws(() => prepareMoves([["ag", 1]], { ...base, paidAmount }));
});
test("некорректное количество материалов не проходит", () => {
  assert.throws(() => prepareMoves([["ag", NaN]], base));
  assert.throws(() => prepareMoves([["ag", 0]], base));
});
test("исходные количества не изменяются", () => {
  const data = [["ag", 2], ["fe", -1]];
  prepareMoves(data, base);
  assert.deepEqual(data, [["ag", 2], ["fe", -1]]);
});
test("без материалов нет записи", () => {
  assert.throws(() => prepareMoves([], base));
});
