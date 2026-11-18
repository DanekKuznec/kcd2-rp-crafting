const test = require("node:test");
const assert = require("node:assert/strict");
const { claim } = require("../gorder-actions.js");

function mock(result) {
  const calls = [];
  const query = {
    update(values) { calls.push(["update", values]); return this; },
    eq(key, value) { calls.push(["eq", key, value]); return this; },
    is(key, value) { calls.push(["is", key, value]); return this; },
    select(fields) { calls.push(["select", fields]); return this; },
    async maybeSingle() { return result; }
  };
  return { db: { from(name) { calls.push(["from", name]); return query; } }, calls };
}
test("кнопка Взять принимает только свободный заказ и проверяет возвращённую запись", async () => {
  const { db, calls } = mock({ data: { id: 41, status: "work", taken_by: "user-1" }, error: null });
  const result = await claim(db, 41, "kutna", "user-1");
  assert.equal(result.status, "work");
  assert.deepEqual(calls, [
    ["from", "gorders"],
    ["update", { taken_by: "user-1", status: "work" }],
    ["eq", "id", 41],
    ["eq", "faction", "kutna"],
    ["eq", "status", "new"],
    ["is", "taken_by", null],
    ["select", "id,status,taken_by"]
  ]);
});
test("нулевое количество обновлённых строк не выдаётся за успешный результат", async () => {
  await assert.rejects(claim(mock({ data: null, error: null }).db, 41, "kutna", "user-1"), /Заказ не изменён/);
});
test("ошибка Supabase видна пользователю", async () => {
  await assert.rejects(claim(mock({ data: null, error: { message: "нет прав" } }).db, 41, "kutna", "user-1"), /нет прав/);
});
test("ошибочное подтверждение статуса или исполнителя не принимается", async () => {
  await assert.rejects(claim(mock({ data: { id: 41, status: "new", taken_by: null }, error: null }).db, 41, "kutna", "user-1"), /не подтвердил/);
  await assert.rejects(claim(mock({ data: { id: 41, status: "work", taken_by: "someone-else" }, error: null }).db, 41, "kutna", "user-1"), /не подтвердил/);
});
test("отсутствие фракции и идентификатора отклоняется до запроса", async () => {
  await assert.rejects(claim(mock({}).db, 41, "", "user-1"), /определить/);
});
