const test = require('node:test');
const assert = require('node:assert/strict');
const { apply, undo } = require('../stock-ops.js');

test('отмена первого заказа не отменяет второй', () => {
  const first = apply({fe: 100}, [['fe', -20]]);
  const second = apply(first.stock, [['fe', -30]]);
  assert.deepEqual(undo(second.stock, first.delta), {fe: 70});
});
test('излишки заготовок возвращаются корректно', () => {
  const x = apply({fe: 10}, [['fe', -5], ['steel', 2]]);
  assert.deepEqual(x.stock, {fe: 5, steel: 2});
  assert.deepEqual(undo(x.stock, x.delta), {fe: 10});
});
test('отмена запрещена, если излишки уже потратили', () => {
  const x = apply({}, [['steel', 2]]);
  assert.throws(() => undo({steel: 1}, x.delta), /израсходована/);
});
test('учитывается только фактически списанное со склада', () => {
  const x = apply({fe: 3}, [['fe', -10]]);
  assert.deepEqual(x.delta, {fe: -3});
  assert.deepEqual(undo(x.stock, x.delta), {fe: 3});
});
test('ошибка второго ресурса не меняет первый', () => {
  const original = {fe: 10};
  assert.throws(() => apply(original, [['fe', -4], ['coal', NaN]]));
  assert.deepEqual(original, {fe: 10});
});
test('невозможен отрицательный остаток при отмене', () => {
  assert.throws(() => undo({}, {fe: 2}), /израсходована/);
});
test('два изменения одного ресурса в заказе не теряются', () => {
  const x = apply({}, [['steel', -5], ['steel', 5]]);
  assert.deepEqual(x.stock, {steel: 5});
  assert.deepEqual(undo(x.stock, x.delta), {});
});