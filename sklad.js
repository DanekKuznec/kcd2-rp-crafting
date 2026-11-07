// Склад цеха: общий для участников, вход через Discord, данные в Supabase.
// Таблицы и права - tools/sklad.sql. Остатки = сумма движений (положил +, взял -).
(() => {
  const root = document.getElementById("sklad");
  if (!root) return;
  const cfg = window.SKLAD || {};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const nm = k => (typeof NAME !== "undefined" && NAME[k]) || k;
  const keys = typeof ALLK !== "undefined" ? ALLK : [];
  const num = n => Number(n).toLocaleString("ru-RU");
  const when = t => new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  if (!cfg.url || !cfg.key) {
    root.innerHTML = `<div class="panel"><h2>Склад цеха</h2><p class="hint">Склад ещё не подключён. Нужно завести базу Supabase и вписать её адрес в <code>sklad-config.js</code>.</p></div>`;
    return;
  }
  if (!window.supabase) {
    root.innerHTML = `<div class="panel"><h2>Склад цеха</h2><p class="warn">Не загрузилась библиотека для склада. Проверь интернет и обнови страницу.</p></div>`;
    return;
  }
  const sb = window.supabase.createClient(cfg.url, cfg.key);
  let dir = 1;
  const S = { user: null, me: null, members: [], moves: [], stock: {}, q: "", all: false, err: "" };

  async function load() {
    const { data: u } = await sb.auth.getUser();
    S.user = u && u.user;
    if (!S.user) return render();
    const { data: mem, error: e1 } = await sb.from("members").select("*").order("created_at");
    S.members = mem || [];
    S.me = S.members.find(m => m.user_id === S.user.id) || { role: "pending", name: "" };
    if (S.me.role === "member" || S.me.role === "head") {
      const { data: mv, error: e2 } = await sb.from("moves").select("*").order("created_at", { ascending: false }).limit(2000);
      S.moves = mv || [];
      S.stock = {};
      S.moves.forEach(m => (S.stock[m.res] = (S.stock[m.res] || 0) + m.qty));
      S.err = (e1 || e2 || {}).message || "";
    }
    render();
  }

  const who = id => (S.members.find(m => m.user_id === id) || {}).name || "кто-то";
  const ROLE = { head: "глава цеха", member: "участник", pending: "ждёт подтверждения" };

  function render() {
    if (!S.user) {
      root.innerHTML = `<div class="panel"><h2>Склад цеха</h2><p>Общий склад цеха: кто что положил и взял, остатки по каждому ресурсу.</p><button class="btn go" id="sk-login" type="button">Войти через Discord</button></div>`;
      return;
    }
    const head = S.me.role === "head",
      ok = head || S.me.role === "member";
    let h = `<div class="panel"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Склад цеха</h2><span class="hint">${esc(S.me.name || "без ника")} · ${ROLE[S.me.role] || S.me.role} <button class="linkbtn" id="sk-out" type="button">выйти</button></span></div>`;
    if (!ok) {
      h += `<p>Ты вошёл, но глава цеха ещё не подтвердил доступ. Напиши ему, он нажмёт «Подтвердить» у твоего ника.</p></div>`;
      root.innerHTML = h;
      return;
    }
    if (S.err) h += `<p class="warn">${esc(S.err)}</p>`;
    // запись
    h += `<form class="sk-form" id="sk-form" autocomplete="off">
      <label>Ресурс<input id="sk-res" list="sk-list" placeholder="начни вводить название" required></label>
      <label>Сколько<input id="sk-qty" type="number" min="1" step="1" required></label>
      <span class="seg sk-dir" role="group" aria-label="Что сделал"><button type="button" data-d="1" aria-pressed="${dir > 0}">Положил</button><button type="button" data-d="-1" aria-pressed="${dir < 0}">Взял</button></span>
      <label class="sk-note">Заметка<input id="sk-note" placeholder="например: на заказ Яна"></label>
      <button class="btn go" type="submit">Записать</button>
      <datalist id="sk-list">${keys.map(k => `<option value="${esc(nm(k))}">`).join("")}</datalist>
    </form><p class="hint" id="sk-msg"></p>`;
    // остатки
    const ks = Object.keys(S.stock).filter(k => S.all || S.stock[k] !== 0);
    const all = S.all ? [...new Set([...keys.filter(k => !MAT[k]), ...ks])] : ks;
    const q = S.q.trim().toLowerCase();
    const rows = all
      .filter(k => !q || nm(k).toLowerCase().includes(q))
      .sort((a, b) => nm(a).localeCompare(nm(b), "ru"));
    h += `<div class="row" style="gap:10px;align-items:center;margin-top:14px"><h3 style="margin:0">Остатки</h3><input class="search" id="sk-q" type="search" placeholder="Поиск" value="${esc(S.q)}" style="max-width:220px"><label class="hint"><input type="checkbox" id="sk-all" ${S.all ? "checked" : ""}> показать всё сырьё</label></div>
      <div class="tablebox"><table class="mini"><thead><tr><th class="l">Ресурс</th><th>Остаток</th></tr></thead><tbody>${
        rows.length ? rows.map(k => `<tr><td class="l">${esc(nm(k))}</td><td class="num ${S.stock[k] < 0 ? "buy" : ""}"><b>${num(S.stock[k] || 0)}</b></td></tr>`).join("") : `<tr><td colspan="2" class="hint">Пока пусто.</td></tr>`
      }</tbody></table></div>`;
    // журнал
    h += `<h3>Журнал</h3><div class="tablebox"><table class="mini"><thead><tr><th class="l">Когда</th><th class="l">Кто</th><th class="l">Что</th><th class="l">Заметка</th>${head ? "<th></th>" : ""}</tr></thead><tbody>${
      S.moves.slice(0, 200).map(m => `<tr><td class="l">${when(m.created_at)}</td><td class="l">${esc(who(m.user_id))}</td><td class="l ${m.qty > 0 ? "ok" : "buy"}">${m.qty > 0 ? "положил" : "взял"} ${num(Math.abs(m.qty))} · ${esc(nm(m.res))}</td><td class="l hint">${esc(m.note)}</td>${head ? `<td><button class="linkbtn" data-del="${m.id}" type="button" title="Удалить запись (ошибка)">×</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="5" class="hint">Записей пока нет.</td></tr>`
    }</tbody></table></div>`;
    // участники (для главы)
    if (head) {
      h += `<h3>Участники</h3><div class="tablebox"><table class="mini"><thead><tr><th class="l">Ник</th><th class="l">Роль</th><th></th></tr></thead><tbody>${S.members
        .map(m => `<tr><td class="l">${esc(m.name || "без ника")}${m.user_id === S.user.id ? " (ты)" : ""}</td><td class="l ${m.role === "pending" ? "warn" : ""}">${ROLE[m.role]}</td><td class="l">${
          m.user_id === S.user.id ? "" : `${m.role === "pending" ? `<button class="btn" data-role="member" data-u="${m.user_id}" type="button">Подтвердить</button>` : ""}${m.role === "member" ? `<button class="btn" data-role="head" data-u="${m.user_id}" type="button">Сделать главой</button>` : ""}${m.role === "head" ? `<button class="btn" data-role="member" data-u="${m.user_id}" type="button">Снять главу</button>` : ""}<button class="btn" data-role="pending" data-u="${m.user_id}" type="button">${m.role === "pending" ? "Отказать" : "Закрыть доступ"}</button>`
        }</td></tr>`)
        .join("")}</tbody></table></div>`;
    }
    root.innerHTML = h + "</div>";
  }

  const keyOf = txt => {
    const t = txt.trim().toLowerCase();
    return keys.find(k => nm(k).toLowerCase() === t) || null;
  };
  root.addEventListener("click", async e => {
    const t = e.target;
    if (t.id === "sk-login") {
      try { localStorage.setItem("forge-view", "sklad"); } catch (_) {}
      await sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: location.origin + location.pathname } });
    } else if (t.id === "sk-out") {
      await sb.auth.signOut();
      S.user = null;
      render();
    } else if (t.closest(".sk-dir button")) {
      dir = +t.dataset.d;
      root.querySelectorAll(".sk-dir button").forEach(b => b.setAttribute("aria-pressed", String(b === t)));
    } else if (t.dataset.del) {
      if (t.dataset.armed !== "1") {
        t.dataset.armed = "1";
        t.textContent = "удалить?";
        return;
      }
      const { error } = await sb.from("moves").delete().eq("id", t.dataset.del);
      if (error) alertMsg(error.message);
      load();
    } else if (t.dataset.role) {
      const { error } = await sb.from("members").update({ role: t.dataset.role }).eq("user_id", t.dataset.u);
      if (error) alertMsg(error.message);
      load();
    }
  });
  const alertMsg = m => {
    const el = document.getElementById("sk-msg");
    if (el) el.textContent = m;
  };
  root.addEventListener("submit", async e => {
    if (e.target.id !== "sk-form") return;
    e.preventDefault();
    const k = keyOf(document.getElementById("sk-res").value),
      n = Math.floor(+document.getElementById("sk-qty").value),
      note = document.getElementById("sk-note").value.trim().slice(0, 200);
    if (!k) return alertMsg("Такого ресурса нет в списке. Выбери из подсказок.");
    if (!(n > 0)) return alertMsg("Укажи количество.");
    if (dir < 0 && (S.stock[k] || 0) < n && !confirmLow(k, n)) return;
    const { error } = await sb.from("moves").insert({ res: k, qty: dir * n, note });
    if (error) return alertMsg("Не записалось: " + error.message);
    alertMsg(`Записано: ${dir > 0 ? "положил" : "взял"} ${n} · ${nm(k)}`);
    await load();
    document.getElementById("sk-res").focus();
  });
  let lowArmed = "";
  function confirmLow(k, n) {
    const tag = k + n;
    if (lowArmed === tag) return true;
    lowArmed = tag;
    alertMsg(`На складе только ${num(S.stock[k] || 0)} · ${nm(k)}. Нажми «Записать» ещё раз, если всё верно.`);
    return false;
  }
  root.addEventListener("input", e => {
    if (e.target.id === "sk-q") {
      S.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const q = document.getElementById("sk-q");
      q.focus();
      q.setSelectionRange(pos, pos);
    }
  });
  root.addEventListener("change", e => {
    if (e.target.id === "sk-all") {
      S.all = e.target.checked;
      render();
    }
  });

  sb.auth.onAuthStateChange(() => load());
  sb.channel("sklad")
    .on("postgres_changes", { event: "*", schema: "public", table: "moves" }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "members" }, () => load())
    .subscribe();
  load();
})();
