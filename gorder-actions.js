/* Claim one free faction order and verify Supabase actually changed it. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FORGE_ORDER_ACTIONS = api;
})(typeof window !== "undefined" ? window : null, function () {
  async function claim(sb, id, faction, userId) {
    if (!sb || !id || !faction || !userId) throw new Error("Не удалось определить заказ или участника.");
    const { data, error } = await sb.from("gorders")
      .update({ taken_by: userId, status: "work" })
      .eq("id", id)
      .eq("faction", faction)
      .eq("status", "new")
      .is("taken_by", null)
      .select("id,status,taken_by")
      .maybeSingle();
    if (error) throw new Error("Не удалось взять заказ: " + error.message);
    if (!data) throw new Error("Заказ не изменён. Возможно, его уже взяли или у тебя нет прав. Обнови список.");
    if (data.status !== "work" || data.taken_by !== userId)
      throw new Error("Сервер не подтвердил принятие заказа. Обнови список.");
    return data;
  }
  return { claim };
});
