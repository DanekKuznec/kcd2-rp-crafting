// Склад цеха: общий для участников, вход через Discord, данные в Supabase.
// Таблицы и права - tools/sklad.sql. Остатки = сумма движений (положил +, взял -).
(() => {
  const root = document.getElementById("sklad");
  if (!root) return;
  const cfg = window.SKLAD || {};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const nm = k => (typeof NAME !== "undefined" && NAME[k]) || k;
  // заготовки, которые никто не делает (готовое оружие как основа для улучшения), на склад не идут
  const made = new Set((typeof ITEMS !== "undefined" ? ITEMS : []).map(i => i.m).filter(Boolean));
  const keys = (typeof ALLK !== "undefined" ? ALLK : []).filter(k => !(typeof MAT !== "undefined" && MAT[k] && !made.has(k)));
  const num = n => Number(n).toLocaleString("ru-RU");
  const when = t => new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  if (!cfg.url || !cfg.key) {
    root.innerHTML = `<div class="panel"><h2>Склад цеха</h2><p class="hint">Склад ещё не подключён. Нужно завести базу Supabase и вписать её адрес в <code>sklad-config.js</code>.</p></div>`;
    return;
  }
  const fail = msg => (root.innerHTML = `<div class="panel"><h2>Склад цеха</h2><p class="warn">${esc(msg)}</p><p class="hint">Обнови страницу (Ctrl+F5). Если не помогло - скинь скрин этого сообщения.</p></div>`);
  root.innerHTML = `<div class="panel"><h2>Склад цеха</h2><p class="hint">Загружаю склад…</p></div>`;
  // библиотека Supabase: основной адрес в index.html, запасной - отсюда
  const lib = () =>
    window.supabase
      ? Promise.resolve()
      : new Promise((ok, no) => {
          const sc = document.createElement("script");
          sc.src = "https://unpkg.com/@supabase/supabase-js@2.49.4/dist/umd/supabase.js";
          sc.onload = ok;
          sc.onerror = () => no(new Error("не загрузилась библиотека склада (supabase-js)"));
          document.head.appendChild(sc);
        });
  lib()
    .then(start)
    .catch(e => fail("Склад не запустился: " + (e && e.message)));
  function start() {
  const sb = window.supabase.createClient(cfg.url, cfg.key);
  const S = { user: null, me: null, members: [], moves: [], stock: {}, limits: {}, q: "", limOpen: false, err: "" };
  // ресурсы ремесла: сырьё и заготовки, которые нужны на его вещи
  function secRes(sec) {
    const list = sec === "aw" ? ["a", "w"] : [sec],
      out = new Set(),
      walk = k => {
        if (MAT[k] && !made.has(k)) return;
        out.add(k);
        if (MAT[k]) Object.keys(MAT[k].inp).forEach(walk);
      };
    ITEMS.filter(i => sec === "all" || list.includes(i.s)).forEach(i => (i.m ? walk(i.m) : Object.keys(i.r).forEach(walk)));
    return out;
  }
  const AW = secRes("aw");
  const MATITEM = {};
  ITEMS.forEach(i => i.m && !MATITEM[i.m] && (MATITEM[i.m] = i));
  const RICON = window.FORGE_RICON || {};
  const resIcon = k =>
    MATITEM[k] ? icon(MATITEM[k]) : RICON[k] ? `<img class="ic" src="${RICON[k]}" alt="" loading="lazy">` : icon({ n: nm(k) });

  async function load() {
    try {
      await loadInner();
    } catch (e) {
      fail("Ошибка склада: " + (e && e.message));
    }
  }
  async function loadInner() {
    const { data: ss } = await sb.auth.getSession();
    S.user = ss && ss.session && ss.session.user;
    if (!S.user) return render();
    const { data: mem, error: e1 } = await sb.from("members").select("*").order("created_at");
    S.members = mem || [];
    S.me = S.members.find(m => m.user_id === S.user.id) || { rank: 0, admin: false, name: "", rp_name: "" };
    if (S.me.rank >= 1 || S.me.admin) {
      const { data: mv, error: e2 } = await sb.from("moves").select("*").order("created_at", { ascending: false }).limit(2000);
      S.moves = mv || [];
      const { data: lm } = await sb.from("limits").select("*");
      S.limits = Object.fromEntries((lm || []).map(l => [l.res, l]));
      S.stock = {};
      S.moves.forEach(m => (S.stock[m.res] = (S.stock[m.res] || 0) + m.qty));
      S.err = (e1 || e2 || {}).message || "";
    }
    render();
  }

  // Ранги цеха как в игре. 0 - нет доступа (ждёт подтверждения).
  const RANKS = ["нет доступа", "Батрак", "Ученик", "Подмастерье", "Старший Подмастерье", "Мастер Кузнец", "Цеховой Мастер", "Цеховой Писарь", "Цеховой Старейшина", "Цехмейстер"];
  const disp = m => (m && (m.rp_name || m.name)) || "кто-то";
  const who = id => disp(S.members.find(m => m.user_id === id));
  const canApprove = () => S.me.admin || S.me.rank >= 8;

  let render = function () {
    if (!S.user) {
      root.innerHTML = `<div class="panel"><h2>Склад цеха</h2><p>Общий склад цеха: кто что положил и взял, остатки по каждому ресурсу.</p><button class="btn go" id="sk-login" type="button">Войти через Discord</button></div>`;
      return;
    }
    const head = canApprove(),
      ok = S.me.rank >= 1 || S.me.admin;
    let h = `<div class="panel"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Склад цеха</h2><span class="hint">${esc(disp(S.me))} · ${S.me.rank ? RANKS[S.me.rank] : "ждёт подтверждения"} <button class="linkbtn" id="sk-out" type="button">выйти</button></span></div>`;
    if (!ok) {
      h += `<p>Ты вошёл как <b>${esc(S.me.name || "без ника")}</b>, но доступ ещё не подтвердили. Напиши цехмейстеру или цеховому старейшине, они выдадут ранг.</p></div>`;
      root.innerHTML = h;
      return;
    }
    if (S.err) h += `<p class="warn">${esc(S.err)}</p>`;
    h += `<p class="hint" id="sk-msg"></p>`;
    // остатки: только то, что идёт в рецепты брони и оружия
    const q = S.q.trim().toLowerCase();
    const pick = ks => ks.filter(k => AW.has(k) && (!q || nm(k).toLowerCase().includes(q)));
    const raws = pick(keys.filter(k => !MAT[k])),
      mats = pick(keys.filter(k => MAT[k]));
    const buyTxt = l => (l && l.buy_min != null ? (l.buy_max != null && +l.buy_max !== +l.buy_min ? `${num(l.buy_min)}-${num(l.buy_max)}` : num(l.buy_min)) + " гр." : "");
    const tile = k => {
      const l = S.limits[k],
        st = S.stock[k] || 0,
        lim = l && l.lim != null ? +l.lim : null,
        full = lim != null && st >= lim,
        sub = [lim != null ? `лимит ${num(lim)}` : "", full ? "не скупаем" : buyTxt(l) ? "скуп " + buyTxt(l) : ""].filter(Boolean).join(" · ");
      return `<div class="sk-tile${st ? "" : " zero"}${full ? " full" : ""}" title="${esc(nm(k))}">
        <span class="sk-cnt ${st < 0 ? "buy" : ""}">×${num(st)}${full ? " ✓" : ""}</span>${resIcon(k)}
        <span class="sk-nm">${esc(nm(k))}</span><span class="sk-sub">${sub || "&nbsp;"}</span>
        <span class="sk-act"><button type="button" class="sk-pm" data-k="${k}" data-s="-1" title="Взял">−</button><input class="sk-n" data-k="${k}" type="number" min="1" step="1" placeholder="0"><button type="button" class="sk-pm" data-k="${k}" data-s="1" title="Положил">+</button></span></div>`;
    };
    const grid = (title, ks) => (ks.length ? `<div class="sk-cat">${title}</div><div class="sk-grid">${ks.map(tile).join("")}</div>` : "");
    h += `<div class="row" style="gap:10px;align-items:center;margin-top:6px;flex-wrap:wrap"><h3 style="margin:0">Остатки</h3><input class="search" id="sk-q" type="search" placeholder="Поиск" value="${esc(S.q)}" style="max-width:220px"><span class="hint">впиши число и нажми + (положил) или − (взял)</span></div>
      ${grid("Сырьё", raws)}${grid("Заготовки", mats)}${!raws.length && !mats.length ? '<p class="hint">Ничего не найдено.</p>' : ""}`;
    if (S.me.admin || S.me.rank >= 6) {
      const rowsOf = ks =>
        ks
          .map(k => {
            const l = S.limits[k];
            return `<tr><td>${resIcon(k)}</td><td class="l">${esc(nm(k))}</td><td class="num"><input class="sk-lim" data-k="${k}" type="number" min="0" value="${l && l.lim != null ? l.lim : ""}" placeholder="—"></td><td class="num"><input class="sk-bmin" data-k="${k}" type="number" min="0" step="0.5" value="${l && l.buy_min != null ? +l.buy_min : ""}" placeholder="от">-<input class="sk-bmax" data-k="${k}" type="number" min="0" step="0.5" value="${l && l.buy_max != null ? +l.buy_max : ""}" placeholder="до"></td></tr>`;
          })
          .join("");
      h += `<details class="sk-lims"${S.limOpen ? " open" : ""}><summary>Лимиты и цены скупки</summary><div class="tablebox"><table class="mini sk-stock"><thead><tr><th></th><th class="l">Ресурс</th><th>Лимит</th><th>Скупаем по</th></tr></thead><tbody>${rowsOf([...raws, ...mats])}</tbody></table></div></details>`;
    }
    // журнал: чистить и менять «кто» могут цехмейстер, старейшина и управляющий
    const whoSel = m =>
      `<select class="sk-who" data-id="${m.id}">${S.members.some(x => x.user_id === m.user_id) ? "" : `<option selected>${esc(who(m.user_id))}</option>`}${[...S.members]
        .filter(x => x.rank > 0 || x.admin || x.user_id === m.user_id)
        .map(x => `<option value="${x.user_id}" ${x.user_id === m.user_id ? "selected" : ""}>${esc(disp(x))}</option>`)
        .join("")}</select>`;
    h += `<h3>Журнал</h3><div class="tablebox"><table class="mini"><thead><tr><th class="l">Когда</th><th class="l">Кто</th><th class="l">Что</th><th class="l">Заметка</th>${head ? "<th></th>" : ""}</tr></thead><tbody>${
      S.moves.slice(0, 200).map(m => `<tr><td class="l">${when(m.created_at)}</td><td class="l">${head ? whoSel(m) : esc(who(m.user_id))}</td><td class="l ${m.qty > 0 ? "ok" : "buy"}">${m.qty > 0 ? "положил" : "взял"} ${num(Math.abs(m.qty))} · ${esc(nm(m.res))}</td><td class="l hint">${esc(m.note)}</td>${head ? `<td><button class="linkbtn" data-del="${m.id}" type="button" title="Удалить запись (ошибка)">×</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="5" class="hint">Записей пока нет.</td></tr>`
    }</tbody></table></div>`;
    // участники: ранги видят все, менять могут управляющий, цехмейстер и старейшина
    const mine = m => m.user_id === S.user.id,
      editable = m => S.me.admin || (head && !mine(m) && !m.admin && m.rank <= S.me.rank),
      maxRank = S.me.admin ? 9 : S.me.rank;
    const list = [...S.members].sort((a, b) => (a.rank === 0) - (b.rank === 0) || b.rank - a.rank || disp(a).localeCompare(disp(b), "ru"));
    const pend = list.filter(m => m.rank === 0 && !m.admin);
    h += `<h3>Участники${head && pend.length ? ` <span class="warn">· ждут подтверждения: ${pend.length}</span>` : ""}</h3>
      <div class="tablebox"><table class="mini"><thead><tr><th class="l">Персонаж</th><th class="l">Discord</th><th class="l">Ранг</th>${S.me.admin ? '<th class="l">Управление сайтом</th>' : ""}</tr></thead><tbody>${list
      .map(m => {
        const nameCell = mine(m) || editable(m) ? `<input class="sk-rp" data-u="${m.user_id}" value="${esc(m.rp_name)}" placeholder="имя персонажа">` : esc(m.rp_name || "—");
        const rankCell = editable(m)
          ? `<select class="sk-rank" data-u="${m.user_id}">${RANKS.map((r, i) => (i <= maxRank || i === m.rank ? `<option value="${i}" ${i === m.rank ? "selected" : ""}>${i ? i + " · " + r : "нет доступа"}</option>` : "")).join("")}</select>`
          : `<span class="${m.rank ? "" : "warn"}">${m.rank ? m.rank + " · " + RANKS[m.rank] : "ждёт подтверждения"}</span>`;
        const adm = S.me.admin ? `<td class="l">${mine(m) ? "да (ты)" : `<label class="hint"><input type="checkbox" class="sk-adm" data-u="${m.user_id}" ${m.admin ? "checked" : ""}> да</label> <button class="linkbtn" data-kick="${m.user_id}" type="button" title="Удалить из списка">убрать</button>`}</td>` : "";
        return `<tr><td class="l">${nameCell}${mine(m) ? ' <span class="hint">(ты)</span>' : ""}</td><td class="l hint">${esc(m.name || "")}</td><td class="l">${rankCell}</td>${adm}</tr>`;
      })
      .join("")}</tbody></table></div>`;
    root.innerHTML = h + "</div>";
  }

  root.addEventListener("click", async e => {
    const t = e.target;
    if (t.id === "sk-login") {
      try { localStorage.setItem("forge-view", "sklad"); } catch (_) {}
      await sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: location.origin + location.pathname } });
    } else if (t.id === "sk-out") {
      await sb.auth.signOut();
      S.user = null;
      render();
    } else if (t.classList.contains("sk-pm")) {
      put(t.dataset.k, +t.dataset.s);
    } else if (t.dataset.del) {
      if (t.dataset.armed !== "1") {
        t.dataset.armed = "1";
        t.textContent = "удалить?";
        return;
      }
      const { error } = await sb.from("moves").delete().eq("id", t.dataset.del);
      if (error) alertMsg(error.message);
      load();
    } else if (t.dataset.kick) {
      if (t.dataset.armed !== "1") {
        t.dataset.armed = "1";
        t.textContent = "точно убрать?";
        return;
      }
      const { error } = await sb.from("members").delete().eq("user_id", t.dataset.kick);
      if (error) alertMsg(error.message);
      load();
    }
  });
  const alertMsg = m => {
    const el = document.getElementById("sk-msg");
    if (el) el.textContent = m;
  };
  async function put(k, sign) {
    const inp = root.querySelector(`.sk-n[data-k="${k}"]`),
      n = Math.floor(+(inp && inp.value));
    if (!(n > 0)) return alertMsg(`Впиши, сколько ${sign > 0 ? "положил" : "взял"} · ${nm(k)}.`);
    if (sign < 0 && (S.stock[k] || 0) < n && !confirmLow(k, n)) return;
    const { error } = await sb.from("moves").insert({ res: k, qty: sign * n, note: "" });
    if (error) return alertMsg("Не записалось: " + error.message);
    lowArmed = "";
    await load();
    alertMsg(`Записано: ${sign > 0 ? "положил" : "взял"} ${n} · ${nm(k)}`);
  }
  let lowArmed = "";
  function confirmLow(k, n) {
    const tag = k + n;
    if (lowArmed === tag) return true;
    lowArmed = tag;
    alertMsg(`На складе только ${num(S.stock[k] || 0)} · ${nm(k)}. Нажми − ещё раз, если всё верно.`);
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
  const upd = async (u, patch) => {
    const { error } = await sb.from("members").update(patch).eq("user_id", u);
    if (error) alertMsg("Не сохранилось: " + error.message);
    load();
  };
  root.addEventListener("change", e => {
    const t = e.target;
    if (t.classList.contains("sk-rank")) return upd(t.dataset.u, { rank: +t.value });
    if (t.classList.contains("sk-who"))
      return sb.from("moves").update({ user_id: t.value }).eq("id", t.dataset.id).then(({ error }) => {
        if (error) alertMsg("Не сохранилось: " + error.message);
        load();
      });
    if (t.classList.contains("sk-rp")) return upd(t.dataset.u, { rp_name: t.value.trim().slice(0, 60) });
    if (t.classList.contains("sk-adm")) return upd(t.dataset.u, { admin: t.checked });
    if (t.classList.contains("sk-lim") || t.classList.contains("sk-bmin") || t.classList.contains("sk-bmax")) {
      const k = t.dataset.k,
        v = t.value === "" ? null : Math.max(0, +t.value),
        col = t.classList.contains("sk-lim") ? "lim" : t.classList.contains("sk-bmin") ? "buy_min" : "buy_max";
      return sb
        .from("limits")
        .upsert({ res: k, ...(S.limits[k] ? { lim: S.limits[k].lim, buy_min: S.limits[k].buy_min, buy_max: S.limits[k].buy_max } : {}), [col]: col === "lim" && v != null ? Math.round(v) : v })
        .then(({ error }) => {
          if (error) alertMsg("Не сохранилось: " + error.message);
          load();
        });
    }
  });
  root.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.classList.contains("sk-n")) put(e.target.dataset.k, e.shiftKey ? -1 : 1);
  });
  root.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("sk-lims")) S.limOpen = e.target.open; }, true);

  // --- Кнопка «Списать со склада цеха» в расчёте заказа (только для участников цеха)
  const woBar = document.getElementById("odone") && document.getElementById("odone").parentElement;
  const wo = document.createElement("div");
  wo.id = "sk-wo";
  wo.className = "sk-wo";
  if (woBar) woBar.after(wo);
  function woPlan() {
    // считаем заказ так, как будто «склад» = склад цеха: сначала берём готовые заготовки, потом сырьё
    const saved = stock;
    stock = Object.fromEntries(Object.entries(S.stock).filter(([, v]) => v > 0));
    let b;
    try {
      b = breakdown();
    } finally {
      stock = saved;
    }
    const take = [...b.mid.filter(m => m.s > 0).map(m => [m.k, m.s]), ...b.rows.filter(r => r.s > 0).map(r => [r.k, r.s])];
    const lack = b.rows.filter(r => r.buy > 0).map(r => [r.k, r.buy]);
    return { take, lack, n: b.t.n };
  }
  function woRender(plan) {
    const ok = S.user && S.me && (S.me.rank >= 1 || S.me.admin);
    if (!ok) return (wo.innerHTML = "");
    if (!plan)
      return (wo.innerHTML = `<button class="btn" id="sk-wo-go" type="button" title="Списать со склада цеха то, что уйдёт на этот заказ">Списать со склада цеха</button>`);
    const li = a => a.map(([k, n]) => `<li>${esc(nm(k))}: <b>${num(n)}</b></li>`).join("");
    wo.innerHTML = plan.take.length
      ? `<div class="panel sk-wo-box"><b>Списать со склада цеха на заказ «${esc(O().name)}»:</b><ul>${li(plan.take)}</ul>${plan.lack.length ? `<p class="hint">На складе цеха не хватает, нужно докупить или взять своё:</p><ul class="hint">${li(plan.lack)}</ul>` : ""}<button class="btn go" id="sk-wo-yes" type="button">Подтвердить списание</button> <button class="btn" id="sk-wo-no" type="button">Отмена</button> <span class="hint" id="sk-wo-msg"></span></div>`
      : `<div class="panel sk-wo-box"><p>${plan.n ? "На складе цеха нет ничего из того, что нужно на этот заказ." : "В заказе пока нет вещей."}</p><button class="btn" id="sk-wo-no" type="button">Закрыть</button></div>`;
  }
  let woCur = null;
  wo.addEventListener("click", async e => {
    const id = e.target.id;
    if (id === "sk-wo-go") {
      woCur = woPlan();
      woRender(woCur);
    } else if (id === "sk-wo-no") {
      woCur = null;
      woRender();
    } else if (id === "sk-wo-yes" && woCur) {
      e.target.disabled = true;
      const note = `Заказ «${O().name}»`.slice(0, 200);
      const { error } = await sb.from("moves").insert(woCur.take.map(([k, n]) => ({ res: k, qty: -n, note })));
      if (error) {
        e.target.disabled = false;
        document.getElementById("sk-wo-msg").textContent = "Не списалось: " + error.message;
        return;
      }
      wo.innerHTML = `<p class="ok">Списано со склада цеха: ${woCur.take.map(([k, n]) => `${esc(nm(k))} ${num(n)}`).join(", ")}.</p>`;
      woCur = null;
      await load();
      setTimeout(() => woRender(), 4000);
    }
  });
  const _render = render;
  render = function () {
    _render();
    if (!woCur) woRender();
  };

  // нельзя ждать запросы прямо внутри onAuthStateChange - supabase-js может зависнуть, поэтому через setTimeout
  sb.auth.onAuthStateChange(ev => {
    if (ev !== "INITIAL_SESSION") setTimeout(load, 0);
  });
  sb.channel("sklad")
    .on("postgres_changes", { event: "*", schema: "public", table: "moves" }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "members" }, () => load())
    .subscribe();
  load();
  }
})();
