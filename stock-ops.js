/* Isolated stock updates: rollback affects only one order's changes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StockOps = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const valid = n => typeof n === 'number' && Number.isSafeInteger(n);
  function apply(current, changes) {
    const next = { ...current }, delta = {};
    for (const [key, change] of changes) {
      if (!valid(change)) throw new Error('Некорректное изменение склада: ' + key);
      const old = next[key] || 0;
      if (!valid(old) || old < 0) throw new Error('Некорректный остаток: ' + key);
      const updated = Math.max(0, old + change);
      if (!Number.isSafeInteger(updated)) throw new Error('Слишком большое количество: ' + key);
      if (updated) next[key] = updated;
      else delete next[key];
      const actual = updated - old;
      if (actual) delta[key] = (delta[key] || 0) + actual;
    }
    return { stock: next, delta };
  }
  function undo(current, delta) {
    const next = { ...current };
    for (const [key, change] of Object.entries(delta)) {
      if (!valid(change)) throw new Error('Некорректная запись изменения: ' + key);
      const old = next[key] || 0;
      const updated = old - change;
      if (!valid(old) || old < 0 || !Number.isSafeInteger(updated) || updated < 0)
        throw new Error('Нельзя отменить: часть возвращаемых запасов уже израсходована (' + key + ')');
      if (updated) next[key] = updated;
      else delete next[key];
    }
    return next;
  }
  return { apply, undo };
});
