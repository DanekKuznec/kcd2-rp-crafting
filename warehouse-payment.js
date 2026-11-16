/* A payment is recorded once per warehouse batch, not once per material. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FORGE_WAREHOUSE_PAYMENT = api;
})(typeof window !== "undefined" ? window : null, function () {
  function prepareMoves(entries, opts) {
    const { faction, note, batch, payer, paidAmount } = opts;
    if (!Array.isArray(entries) || !entries.length) throw new Error("Нет материалов для записи.");
    const incoming = entries.some(([, n]) => n > 0);
    if (incoming && payer !== "self" && payer !== "guild") throw new Error("Выбери, кто оплатил пополнение.");
    const raw = String(paidAmount == null ? "" : paidAmount).trim();
    const amount = incoming ? Number(raw) : null;
    if (incoming && (!raw || !Number.isSafeInteger(amount) || amount < 0))
      throw new Error("Впиши сумму пополнения в грошах: целое число от 0.");
    let recorded = false;
    return entries.map(([res, qty]) => {
      if (typeof res !== "string" || !res || !Number.isSafeInteger(qty) || qty === 0)
        throw new Error("Некорректное количество материалов.");
      const firstIncoming = qty > 0 && !recorded;
      if (firstIncoming) recorded = true;
      return {
        faction, res, qty, note, batch,
        paid_by: qty > 0 ? payer : null,
        paid_amount: firstIncoming ? amount : null
      };
    });
  }
  return { prepareMoves };
});
