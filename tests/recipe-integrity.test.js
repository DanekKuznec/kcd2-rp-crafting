const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync("data.js", "utf8"), sandbox, { filename: "data.js", timeout: 10000 });
const data = sandbox.window.FORGE_DATA;

test("девять ремёсел и уникальные идентификаторы предметов", () => {
  assert.ok(data && Array.isArray(data.secs) && Array.isArray(data.items) && Array.isArray(data.raw));
  assert.equal(data.secs.length, 9);
  const ids = data.items.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length > 0);
});

const rawKeys = new Set(data.raw.map(r => r[0]));
const matKeys = new Set(Object.keys(data.mat));
const known = new Set([...rawKeys, ...matKeys]);

test("сырьё и заготовки не перекрывают друг друга", () => {
  for (const key of rawKeys) assert.ok(!matKeys.has(key), "Неоднозначный ресурс: " + key);
});
test("все ссылки из рецептов известны системе", () => {
  for (const [key, m] of Object.entries(data.mat)) {
    assert.ok(Number.isFinite(m.out) && m.out > 0, "Выход заготовки: " + key);
    for (const [input, qty] of Object.entries(m.inp || {})) {
      assert.ok(known.has(input), "Неизвестный ресурс " + input + " в " + key);
      assert.ok(Number.isFinite(qty) && qty > 0, "Некорректный расход " + input + " в " + key);
    }
  }
  for (const item of data.items) {
    if (item.m) assert.ok(matKeys.has(item.m), "Неизвестная заготовка для " + item.id);
    else for (const [key, qty] of Object.entries(item.r || {})) {
      assert.ok(known.has(key), "Неизвестный ресурс " + key + " у " + item.id);
      assert.ok(Number.isFinite(qty) && qty > 0, "Некорректный расход " + key + " у " + item.id);
    }
  }
});
test("нет циклов в графе изготовления заготовок", () => {
  const done = new Set(), active = new Set();
  function visit(key) {
    if (done.has(key)) return;
    assert.ok(!active.has(key), "Цикл изготовления: " + key);
    active.add(key);
    for (const sub of Object.keys(data.mat[key]?.inp || {})) if (matKeys.has(sub)) visit(sub);
    active.delete(key);
    done.add(key);
  }
  for (const key of matKeys) visit(key);
});
test("расчётная себестоимость конечных предметов конечна и неотрицательна", () => {
  const prices = Object.fromEntries(data.raw.map(r => [r[0], Number(r[2]) || 0]));
  const memo = {};
  function costOf(key) {
    if (!matKeys.has(key)) return prices[key] || 0;
    if (key in memo) return memo[key];
    const m = data.mat[key];
    return (memo[key] = ((Number(m.b) || 0) +
      Object.entries(m.inp).reduce((sum, [res, qty]) => sum + costOf(res) * qty, 0)) / m.out);
  }
  for (const item of data.items) {
    const c = item.m ? costOf(item.m) :
      (Object.entries(item.r || {}).reduce((sum, [key, qty]) => sum + costOf(key) * qty, 0) +
      (Number(item.b) || 0)) / (Number(item.o) || 1);
    assert.ok(Number.isFinite(c) && c >= 0, "Некорректная себестоимость " + item.id + ": " + c);
  }
});
