// Склад фракции: общий для участников, вход через Discord, данные в Supabase.
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
    root.innerHTML = `<div class="panel"><h2>Склад фракции</h2><p class="hint">Склад ещё не подключён. Нужно завести базу Supabase и вписать её адрес в <code>sklad-config.js</code>.</p></div>`;
    return;
  }
  const fail = msg => (root.innerHTML = `<div class="panel"><h2>Склад фракции</h2><p class="warn">${esc(msg)}</p><p class="hint">Обнови страницу (Ctrl+F5). Если не помогло - скинь скрин этого сообщения.</p></div>`);
  root.innerHTML = `<div class="panel"><h2>Склад фракции</h2><p class="hint">Загружаю склад…</p></div>`;
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
  const S = { factions: [], facStock: {}, ofMoves: [], ofMembers: [], user: null, me: null, members: [], moves: [], stock: {}, limits: {}, q: "", note: "", gorders: [], limOpen: false, err: "" };
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
  // фракции: у каждой свой склад, участники и заказы
  let F = "kutna";
  try { F = localStorage.getItem("forge-faction") || "kutna"; } catch (_) {}
  const fac = () => S.factions.find(x => x.id === F) || { id: F, name: F, secs: [] };
  let OF = null; // своя фракция человека
  const ofac = () => S.factions.find(x => x.id === OF) || { id: OF, name: OF || "", secs: [] };
  const ofNick = () => !!(S.myFac && (S.myFac.rp_name || "").trim());
  const canFacView = () => !!(S.user && S.myFac && ofNick() && (S.myFac.rank >= 1 || S.admin));
  const canFacMove = () => !!(S.user && S.myFac && ofNick() && (S.myFac.rank >= 3 || S.admin));
  const canApproveOF = () => !!(S.admin || (S.myFac && S.myFac.rank >= 8));
  const ofWho = id => disp((S.ofMembers || []).find(m => m.user_id === id));
  const AWcache = {};
  const facRes = () => {
    const secs = fac().secs || [];
    const key = secs.join(",") || "all";
    if (!AWcache[key]) {
      const out = new Set();
      (secs.length ? secs : ["all"]).forEach(sc => secRes(sc).forEach(k => out.add(k)));
      AWcache[key] = out;
    }
    return AWcache[key];
  };
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
    if (!S.factions.length) {
      const { data: fs } = await sb.from("factions").select("*").order("sort");
      S.factions = fs || [];
      if (S.factions.length && !S.factions.some(x => x.id === F)) F = S.factions[0].id;
    }
    const { data: ss } = await sb.auth.getSession();
    S.user = ss && ss.session && ss.session.user;
    if (!S.user) return render();
    // своя фракция у человека одна: по ней идут заказ фракции и списание в расчёте
    const { data: mine } = await sb.from("members").select("*").eq("user_id", S.user.id);
    S.admin = (mine || []).some(m => m.admin);
    S.myFac = (mine || [])[0] || null;
    OF = S.myFac ? S.myFac.faction : null;
    const { data: mem, error: e1 } = await sb.from("members").select("*").eq("faction", F).order("created_at");
    S.members = mem || [];
    S.me = S.members.find(m => m.user_id === S.user.id);
    S.joined = !!S.me;
    S.me = S.me ? { ...S.me, admin: S.admin } : { rank: 0, admin: S.admin, name: "", rp_name: "" };
    const getStock = async f => {
      const { data: st, error } = await sb.from("stock").select("*").eq("faction", f);
      const o = {};
      if (!error && Array.isArray(st)) st.forEach(r => (o[r.res] = +r.qty || 0));
      return o;
    };
    if (S.me.rank >= 1 || S.me.admin) {
      const { data: mv, error: e2 } = await sb.from("moves").select("*").eq("faction", F).order("created_at", { ascending: false }).limit(1000);
      S.moves = mv || [];
      const { data: lm } = await sb.from("limits").select("*").eq("faction", F);
      S.limits = Object.fromEntries((lm || []).map(l => [l.res, l]));
      // остатки считает база по ВСЕМ записям (вид stock), журнал грузим только последние
      S.stock = await getStock(F);
      S.err = (e1 || e2 || {}).message || "";
    }
    // своя фракция: склад для расчёта, участники для имён, заказы фракции
    if (OF && canFacView()) {
      S.facStock = OF === F && (S.me.rank >= 1 || S.me.admin) ? S.stock : await getStock(OF);
      if (OF === F) S.ofMembers = S.members;
      else {
        const { data: om } = await sb.from("members").select("*").eq("faction", OF);
        S.ofMembers = om || [];
      }
      const { data: go } = await sb.from("gorders").select("*").eq("faction", OF).order("created_at", { ascending: false }).limit(200);
      S.gorders = go || [];
      if (OF !== F) {
        const { data: fm } = await sb.from("moves").select("id,note").eq("faction", OF).order("created_at", { ascending: false }).limit(1000);
        S.ofMoves = fm || [];
      } else S.ofMoves = S.moves;
    } else {
      S.facStock = {};
      S.gorders = [];
      S.ofMembers = [];
      S.ofMoves = [];
    }
    window.FAC_STOCK = S.facStock;
    render();
  }

  // Ранги цеха как в игре. 0 - нет доступа (ждёт подтверждения).
  const RANKS = ["нет доступа", "Батрак", "Ученик", "Подмастерье", "Старший Подмастерье", "Мастер Кузнец", "Цеховой Мастер", "Цеховой Писарь", "Цеховой Старейшина", "Цехмейстер"];
  const disp = m => (m && (m.rp_name || m.name)) || "кто-то";
  const who = id => disp(S.members.find(m => m.user_id === id));
  const canApprove = () => S.me.admin || S.me.rank >= 8;
  // класть, брать и списывать со склада: Подмастерье (3) и выше
  const hasNick = () => !!(S.me && (S.me.rp_name || "").trim());
  const canMove = () => !!(S.user && S.me && (S.me.admin || (hasNick() && S.me.rank >= 3)));

  const facTabs = () =>
    S.factions.length > 0
      ? `<div class="seg sk-facs" role="tablist" aria-label="Фракция">${S.factions.map(x => `<button type="button" data-fac="${esc(x.id)}" aria-pressed="${x.id === F}">${esc(x.name)}</button>`).join("")}</div>`
      : "";
  let render = function () {
    if (!S.user) {
      root.innerHTML = facTabs() + `<div class="panel"><h2>Склад фракции · ${esc(fac().name)}</h2><p>Общий склад фракции: кто что положил и взял, остатки по каждому ресурсу. У каждой фракции свой склад, свои участники и свой вход.</p><button class="btn go" id="sk-login" type="button">Войти через Discord</button></div>`;
      return;
    }
    const head = canApprove(),
      ok = S.me.rank >= 1 || S.me.admin;
    let h = facTabs() + `<div class="panel"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Склад фракции · ${esc(fac().name)}</h2><span class="hint">${S.joined ? `${esc(disp(S.me))} · ${S.me.rank ? RANKS[S.me.rank] : "ждёт подтверждения"}` : S.admin ? "смотришь как управляющий" : "не во фракции"} <button class="linkbtn" id="sk-out" type="button">выйти</button></span></div>`;
    if (!S.joined && S.myFac && !S.admin) {
      h += `<p>Ты состоишь во фракции «${esc(ofac().name)}». Состоять можно только в одной фракции, поэтому склад «${esc(fac().name)}» тебе недоступен.</p></div>`;
      root.innerHTML = h;
      return;
    }
    if ((!S.joined && !S.admin) || (S.joined && !(S.me.rp_name || "").trim())) {
      h += `<form id="sk-nick" class="sk-form" autocomplete="off"><p style="margin:0 0 6px;width:100%">${S.joined ? "Сначала впиши свой игровой ник, как у персонажа на сервере." : `Чтобы войти в склад фракции «${esc(fac().name)}», впиши свой игровой ник, как у персонажа на сервере, и подай заявку.`} Ник увидят во фракции, по нему тебя подтвердят.</p>
        <label>Игровой ник<input id="sk-nick-in" maxlength="60" required placeholder="например: Данек Врана" style="width:260px"></label>
        <button class="btn go" type="submit">${S.joined ? "Сохранить" : "Подать заявку"}</button><span class="hint" id="sk-msg"></span></form></div>`;
      root.innerHTML = h;
      setTimeout(() => { const i = document.getElementById("sk-nick-in"); if (i) i.focus(); }, 0);
      return;
    }
    if (!ok) {
      h += `<p>Ты вошёл как <b>${esc(disp(S.me))}</b>${S.me.name && S.me.rp_name ? ` (Discord: ${esc(S.me.name)})` : ""}, но доступ ещё не подтвердили. Напиши главе фракции, тебе выдадут ранг.</p></div>`;
      root.innerHTML = h;
      return;
    }
    if (S.err) h += `<p class="warn">${esc(S.err)}</p>`;
    h += `<p class="hint" id="sk-msg"></p>`;
    // остатки: только то, что идёт в рецепты брони и оружия
    const q = S.q.trim().toLowerCase();
    const AW = facRes();
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
        ${canMove() ? `<span class="sk-act"><button type="button" class="sk-pm" data-k="${k}" data-s="-1" title="Взял">−</button><input class="sk-n" data-k="${k}" type="number" min="1" step="1" placeholder="0"><button type="button" class="sk-pm" data-k="${k}" data-s="1" title="Положил">+</button></span>` : ""}</div>`;
    };
    const grid = (title, ks) => (ks.length ? `<div class="sk-cat">${title}</div><div class="sk-grid">${ks.map(tile).join("")}</div>` : "");
    h += `<div class="row" style="gap:10px;align-items:center;margin-top:6px;flex-wrap:wrap"><h3 style="margin:0">Остатки</h3><input class="search" id="sk-q" type="search" placeholder="Поиск" value="${esc(S.q)}" style="max-width:220px">${canNote() ? `<input class="search" id="sk-note" placeholder="Заметка к следующей записи (необязательно)" value="${esc(S.note)}" maxlength="200" style="max-width:320px">` : ""}<span class="hint">${canMove() ? "впиши число и нажми + (положил) или − (взял)" : "класть и брать со склада могут Подмастерье и выше"}</span></div>
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
    const rankOf = u => (S.members.find(x => x.user_id === u) || { rank: 0 }).rank;
    const noteEditable = m => S.me.admin || (S.me.rank >= 3 && rankOf(m.user_id) <= S.me.rank);
    // журнал: чистить и менять «кто» могут цехмейстер, старейшина и управляющий
    const whoSel = m =>
      `<select class="sk-who" data-id="${m.id}">${S.members.some(x => x.user_id === m.user_id) ? "" : `<option selected>${esc(who(m.user_id))}</option>`}${[...S.members]
        .filter(x => x.rank > 0 || x.admin || x.user_id === m.user_id)
        .map(x => `<option value="${x.user_id}" ${x.user_id === m.user_id ? "selected" : ""}>${esc(disp(x))}</option>`)
        .join("")}</select>`;
    h += `<h3>Журнал <span class="hint" style="font-family:inherit;text-transform:none;letter-spacing:0">${S.moves.length >= 1000 ? "последние 1000 записей" : "записей: " + S.moves.length}</span></h3><div class="tablebox sk-jbox"><table class="mini sk-journal"><thead><tr><th class="l">Когда</th><th class="l">Кто</th><th class="l">Что</th><th class="l">Заметка</th>${head ? "<th></th>" : ""}</tr></thead><tbody>${
      S.moves.map(m => `<tr><td class="l">${when(m.created_at)}</td><td class="l">${head ? whoSel(m) : esc(who(m.user_id))}</td><td class="l ${m.qty > 0 ? "ok" : "buy"}">${m.qty > 0 ? "положил" : "взял"} ${num(Math.abs(m.qty))} · ${esc(nm(m.res))}</td><td class="l hint">${noteEditable(m) ? `<input class="sk-mnote" data-id="${m.id}" value="${esc(m.note)}" maxlength="200" placeholder="—">` : esc(m.note)}</td>${head ? `<td><button class="linkbtn" data-del="${m.id}" type="button" title="Удалить запись. Остаток на складе тоже изменится">×</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="5" class="hint">Записей пока нет.</td></tr>`
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
    if (t.dataset.fac) {
      if (t.dataset.fac === F) return;
      F = t.dataset.fac;
      try { localStorage.setItem("forge-faction", F); } catch (_) {}
      Object.assign(S, { members: [], moves: [], stock: {}, limits: {}, gorders: [], me: null, joined: false, q: "", note: "", err: "" });
      woCur = null; gDone = gPlan = null;
      root.innerHTML = facTabs() + `<div class="panel"><p class="hint">Загружаю…</p></div>`;
      return load();
    }
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
        t.textContent = "удалить? остаток изменится";
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
      const { error } = await sb.from("members").delete().eq("faction", F).eq("user_id", t.dataset.kick);
      if (error) alertMsg(error.message);
      load();
    }
  });
  const alertMsg = m => {
    const el = document.getElementById("sk-msg");
    if (el) el.textContent = m;
  };
  const canNote = () => S.me && (S.me.admin || S.me.rank >= 3);
  async function put(k, sign) {
    if (!canMove()) return;
    const inp = root.querySelector(`.sk-n[data-k="${k}"]`),
      n = Math.floor(+(inp && inp.value));
    if (!(n > 0)) return alertMsg(`Впиши, сколько ${sign > 0 ? "положил" : "взял"} · ${nm(k)}.`);
    if (sign < 0 && (S.stock[k] || 0) < n && !confirmLow(k, n)) return;
    const note = canNote() ? (S.note || "").trim().slice(0, 200) : "";
    const { error } = await sb.from("moves").insert({ faction: F, res: k, qty: sign * n, note });
    if (error) return alertMsg("Не записалось: " + error.message);
    lowArmed = "";
    S.note = "";
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
    if (e.target.id === "sk-note") S.note = e.target.value;
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
    const { error } = await sb.from("members").update(patch).eq("faction", F).eq("user_id", u);
    if (error) alertMsg("Не сохранилось: " + error.message);
    load();
  };
  root.addEventListener("change", e => {
    const t = e.target;
    if (t.classList.contains("sk-rank")) return upd(t.dataset.u, { rank: +t.value });
    if (t.classList.contains("sk-mnote"))
      return sb.from("moves").update({ note: t.value.trim().slice(0, 200) }).eq("id", t.dataset.id).then(({ error }) => {
        if (error) alertMsg("Не сохранилось: " + error.message);
        load();
      });
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
        .upsert({ faction: F, res: k, ...(S.limits[k] ? { lim: S.limits[k].lim, buy_min: S.limits[k].buy_min, buy_max: S.limits[k].buy_max } : {}), [col]: col === "lim" && v != null ? Math.round(v) : v }, { onConflict: "faction,res" })
        .then(({ error }) => {
          if (error) alertMsg("Не сохранилось: " + error.message);
          load();
        });
    }
  });
  root.addEventListener("submit", async e => {
    if (e.target.id !== "sk-nick") return;
    e.preventDefault();
    const v = document.getElementById("sk-nick-in").value.trim().replace(/\s+/g, " ").slice(0, 60);
    if (v.length < 2) return alertMsg("Ник слишком короткий.");
    const { error } = S.joined
      ? await sb.from("members").update({ rp_name: v }).eq("faction", F).eq("user_id", S.user.id)
      : await sb.from("members").insert({ faction: F, user_id: S.user.id, rp_name: v });
    if (error) return alertMsg("Не сохранилось: " + error.message);
    load();
  });
  root.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.classList.contains("sk-n")) put(e.target.dataset.k, e.shiftKey ? -1 : 1);
  });
  root.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("sk-lims")) S.limOpen = e.target.open; }, true);

  // --- Расчёт заказа: какой склад учитывать - личный или склад своей фракции
  // breakdown() в app.js берёт window.FAC_STOCK, когда window.SRC_FAC = true
  const posStock = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v > 0));
  function withStock(st, fn) {
    const a = window.SRC_FAC, b = window.FAC_STOCK;
    window.SRC_FAC = !!st;
    window.FAC_STOCK = st || b;
    try {
      return fn();
    } finally {
      window.SRC_FAC = a;
      window.FAC_STOCK = b;
    }
  }
  let srcFac = false;
  try { srcFac = localStorage.getItem("forge-src") === "fac"; } catch (_) {}
  const sw = document.createElement("div");
  sw.className = "seg srcsw";
  sw.hidden = true;
  const rh = document.getElementById("rh");
  if (rh) rh.after(sw);
  const wo = document.createElement("div");
  wo.id = "sk-wo";
  wo.className = "sk-wo";
  const stockDet = document.getElementById("stock") && document.getElementById("stock").closest("details");
  if (stockDet) stockDet.after(wo);
  let woCur = null, woArm = false, woArmKey = "", woArmAt = 0;
  function setSrc(v) {
    srcFac = v;
    try { localStorage.setItem("forge-src", v ? "fac" : "my"); } catch (_) {}
    woArm = false;
    applySrc();
  }
  function applySrc() {
    const on = srcFac && canFacView();
    window.SRC_FAC = on;
    window.FAC_STOCK = posStock(S.facStock);
    document.body.classList.toggle("srcfac", on);
    const a = document.activeElement,
      busy = a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.closest("#zakaz, #raschet");
    if (typeof renderOrder === "function" && !busy) renderOrder();
    else woRender();
  }
  function woRender() {
    const view = canFacView();
    document.querySelectorAll("#raschet thead th").forEach(th => {
      if (/^Со склада/.test(th.textContent)) th.textContent = view && srcFac ? "Со склада фракции" : "Со склада";
    });
    sw.hidden = !view;
    if (!view) {
      if (window.SRC_FAC) {
        window.SRC_FAC = false;
        document.body.classList.remove("srcfac");
      }
      return (wo.innerHTML = "");
    }
    const on = srcFac;
    sw.innerHTML = `<button type="button" data-src="my" aria-pressed="${!on}">Личный склад</button><button type="button" data-src="fac" aria-pressed="${on}">Склад фракции «${esc(ofac().name)}»</button>`;
    if (!on) return (wo.innerHTML = "");
    if (woCur && woCur.msg) return (wo.innerHTML = woCur.msg);
    const b = breakdown();
    if (!b.t.n) return (wo.innerHTML = `<div class="panel sk-wo-box"><h3 style="margin:0 0 6px">Склад фракции «${esc(ofac().name)}»</h3><p class="hint">В заказе пока нет вещей.</p></div>`);
    const have = k => S.facStock[k] || 0;
    const row = (k, need, c, s, lack, mid) =>
      `<tr><td>${resIcon(k)}</td><td class="l">${esc(nm(k))}${mid ? ' <span class="rtag">заготовка</span>' : ""}</td><td class="num">${num(need)}</td><td class="num hint">${c ? num(c) : ""}</td><td class="num">${num(have(k))}</td><td class="num"><b>${s ? num(s) : "—"}</b></td><td class="l ${lack ? "buy" : "ok"}">${lack ? (mid ? `сделать ${num(lack)}` : `не хватает ${num(lack)}`) : "✓ хватает"}</td></tr>`;
    const mids = b.mid.map(m => row(m.k, m.need, m.c, m.s, m.make, true)).join("");
    const raws = b.rows.map(r => row(r.k, r.all, r.c, r.s, r.buy, false)).join("");
    const take = [...b.mid.filter(m => m.s > 0).map(m => [m.k, m.s]), ...b.rows.filter(r => r.s > 0).map(r => [r.k, r.s])];
    const short = b.rows.filter(r => r.buy > 0).length;
    wo.innerHTML = `<div class="panel sk-wo-box"><h3 style="margin:0 0 4px">Склад фракции «${esc(ofac().name)}»</h3>
      <p class="hint" style="margin:0 0 8px">Что нужно на заказ, сколько возьмётся со склада фракции и хватает ли. Сначала идёт сырьё заказчика, потом склад фракции. Готовые заготовки со склада уменьшают число крафтов.</p>
      <div class="tablebox"><table class="mini"><thead><tr><th></th><th class="l">Ресурс</th><th>Нужно</th><th>От заказчика</th><th>На складе</th><th>Спишется</th><th class="l">Хватает?</th></tr></thead><tbody>
      ${mids ? `<tr class="cat"><td></td><td colspan="6">Заготовки</td></tr>${mids}` : ""}${raws ? `<tr class="cat"><td></td><td colspan="6">Сырьё</td></tr>${raws}` : ""}</tbody></table></div>
      <p style="margin:8px 0 0">${short ? `<span class="buy">Сырья на складе фракции не хватает: ${short} поз.</span> Недостающее докупаешь или берёшь своё.` : '<span class="ok">Всего хватает.</span>'}</p>
      ${canFacMove()
        ? take.length
          ? `${O().facDone || S.ofMoves.some(m => m.note === `Заказ «${O().name}»`.slice(0, 200)) ? `<p class="warn" style="margin:8px 0 0">По заказу «${esc(O().name)}» со склада фракции уже списывали${O().facDone ? " " + when(O().facDone) : ""}. Проверь, чтобы не списать второй раз.</p>` : ""}<div class="obar" style="margin-top:8px"><button class="btn go" id="sk-wo-yes" type="button">${woArm ? "Точно? Склад фракции изменится" : "Заказ выполнен: списать со склада фракции"}</button><span class="hint" id="sk-wo-msg">В журнал фракции запишется от тебя с заметкой «Заказ «${esc(O().name)}»».</span></div>`
          : '<p class="hint">Со склада фракции на этот заказ брать нечего.</p>'
        : '<p class="hint">Списывать со склада фракции могут Подмастерье и выше.</p>'}</div>`;
    woCur = { take };
  }
  sw.addEventListener("click", e => {
    const b = e.target.closest("button[data-src]");
    if (b) setSrc(b.dataset.src === "fac");
  });
  wo.addEventListener("click", async e => {
    if (e.target.id !== "sk-wo-yes" || !woCur || !woCur.take) return;
    if (!woArm) {
      woArm = true;
      woArmKey = qKey();
      woArmAt = Date.now();
      e.target.textContent = "Точно? Склад фракции изменится";
      return;
    }
    if (Date.now() - woArmAt < 500) return; // двойной клик не считаем подтверждением
    woArm = false;
    e.target.disabled = true;
    const take = woCur.take;
    const note = `Заказ «${O().name}»`.slice(0, 200);
    const o = O();
    const { error } = await sb.from("moves").insert(take.map(([k, n]) => ({ faction: OF, res: k, qty: -n, note, user_id: S.user.id })));
    if (!error) {
      o.facDone = new Date().toISOString();
      save();
    }
    if (error) {
      e.target.disabled = false;
      document.getElementById("sk-wo-msg").textContent = "Не списалось: " + error.message;
      return;
    }
    woCur = { msg: `<div class="panel sk-wo-box"><p class="ok" style="margin:0">Списано со склада фракции: ${take.map(([k, n]) => `${esc(nm(k))} ${num(n)}`).join(", ")}.</p></div>` };
    woRender();
    await load();
    setTimeout(() => {
      woCur = null;
      applySrc();
    }, 4000);
  });

  // --- Вкладка «Заказ цеху» в панели заказов (только подтверждённые участники)
  const zak = document.getElementById("zakaz");
  let otab = "my";
  try { otab = localStorage.getItem("forge-otab") || "my"; } catch (_) {}
  const tabs = document.createElement("div");
  tabs.className = "seg otabs";
  tabs.hidden = true;
  tabs.innerHTML = '<button type="button" data-t="my">Мои заказы</button><button type="button" data-t="cex">Заказ фракции</button>';
  const gbox = document.createElement("div");
  gbox.id = "gord";
  gbox.hidden = true;
  if (zak) {
    zak.querySelector("h2").after(tabs);
    zak.appendChild(gbox);
  }
  const ST = { new: "ждёт мастера", work: "в работе", done: "готов" };
  const itemName = id => (typeof BYID !== "undefined" && BYID[id] ? BYID[id].n : id);
  let gArm = "", gDone = null, gPlan = null, gMsgId = null, gMsgTxt = "", gSendNote = "";
  const gNoteTxt = g => `Заказ фракции «${g.name || "Заказ"}» · ${(g.note || "").trim()}`.slice(0, 200);
  // посчитать заказ цеха теми же функциями, что и свой заказ (временно подменяем текущий заказ и склад)
  function calcG(g, guildStock) {
    const tmp = newOrder(g.name || "Заказ");
    tmp.qty = Object.fromEntries(Object.entries(g.items || {}).filter(([id]) => BYID[id]).map(([id, q]) => [id, +q]));
    tmp.manual = +g.manual > 0 ? String(g.manual) : "";
    const savedO = orders[cur];
    orders[cur] = tmp;
    try {
      return withStock(guildStock || null, () => {
        const b = breakdown();
        return { b, pr: priceOf(b) };
      });
    } finally {
      orders[cur] = savedO;
    }
  }
  function gRender() {
    if (!zak) return;
    const ok = canFacView();
    tabs.hidden = !ok;
    const t = ok ? otab : "my";
    tabs.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
    // кнопка списания со склада фракции прямо в панели заказа
    let wb = document.getElementById("g-wo");
    if (!wb && document.getElementById("odel")) {
      wb = document.createElement("button");
      wb.id = "g-wo";
      wb.className = "btn";
      wb.type = "button";
      wb.textContent = "Склад фракции";
      wb.title = "Открыть расчёт по складу своей фракции: что нужно, сколько спишется и хватает ли";
      document.getElementById("odel").after(wb);
      wb.addEventListener("click", () => {
        const go = document.querySelector('[data-goview="calc"]');
        if (go) go.click();
        setSrc(true);
        setTimeout(() => wo.scrollIntoView({ block: "start" }), 50);
      });
    }
    if (wb) wb.hidden = !canFacView();
    zak.classList.toggle("cex", t === "cex");
    gbox.hidden = t !== "cex";
    if (t !== "cex") return;
    const mine = typeof O === "function" ? O() : null,
      myCnt = mine ? Object.values(mine.qty || {}).reduce((a, b) => a + (+b || 0), 0) : 0;
    const uid = S.user.id;
    let h = `<p class="hint" style="margin:6px 0">Общие заказы фракции «${esc(ofac().name)}»: их видят все подтверждённые участники. Любой мастер может взять заказ в работу.</p>
      ${canFacMove() ? "" : '<p class="hint">Создавать и брать заказы могут Подмастерье и выше.</p>'}<div class="obar"${canFacMove() ? "" : " hidden"}><input id="g-sendnote" maxlength="300" placeholder="Для кого или номер заказа" value="${esc(gSendNote)}" style="flex:1;min-width:120px"><button class="btn go" id="g-send" type="button" ${myCnt ? "" : "disabled"} title="${myCnt ? "" : "Сначала набери вещи в своём заказе"}">Отправить во фракцию мой заказ${mine && myCnt ? ` «${esc(mine.name)}»` : ""}</button></div>
      <p class="hint" id="g-msg"></p>`;
    const list = S.gorders;
    h += list.length
      ? list
          .map(g => {
            const takenMe = g.taken_by === uid,
              canDel = g.created_by === uid || canApproveOF(),
              canNoteG = g.created_by === uid || takenMe || canApproveOF(),
              canPrice = g.created_by === uid || canApproveOF();
            let c;
            try { c = calcG(g); } catch (_) { c = null; }
            const ids = Object.keys(g.items || {}).filter(id => typeof BYID !== "undefined" && BYID[id]);
            const tilesH = ids.length
              ? `<div class="tiles">${ids.map(id => { const i = BYID[id]; return `<div class="tile" title="${esc(i.n)}"><span class="lv">${i.l}</span>${icon(i)}<span class="badge">${num(g.items[id])}</span><span class="tn">${esc(i.n)}</span></div>`; }).join("")}</div>`
              : '<p class="hint">Вещей нет.</p>';
            let sumH = "";
            if (c && c.b.t.n) {
              const t = c.b.t, pr = c.pr, bench = t.b + c.b.matBench, raw = t.cost - bench, pct = t.cost ? Math.round((pr.labor / t.cost) * 100) : 0;
              sumH = `<div class="sum">
                <span class="k">Вещей</span><span class="v">${t.n}</span>
                <span class="k">Материалы</span><span class="v">${fmt(raw)} гр.</span>
                <span class="k">Верстак</span><span class="v">${fmt(bench)} гр.</span>
                <span class="k">За работу ${pr.manual ? `(${pct}%)` : `${fmt(P.markup)}%`}</span><span class="v ${pr.labor < 0 ? "buy" : ""}">${pr.labor < 0 ? "−" : "+"}${fmt(Math.abs(pr.labor))} гр.</span>
                <span class="k">Цена заказчику</span><span class="v big pv">${canPrice ? `<input class="pman g-price" data-id="${g.id}" type="number" min="0" step="1" inputmode="numeric" value="${Math.round(pr.full)}" title="Можно вписать свою цену"> гр.` : `${fmt(Math.round(pr.full))} гр.`}</span>
                ${pr.manual ? `<span class="k hint">своя цена, по расчёту ${fmt(Math.round(pr.calc))} гр.</span><span class="v">${canPrice ? `<button class="linkbtn" data-g="preset" data-id="${g.id}" type="button">↺ вернуть</button>` : ""}</span>` : ""}</div>`;
            }
            const btns = [
              g.status === "new" && !g.taken_by && canFacMove() ? `<button class="btn" data-g="take" data-id="${g.id}" type="button">Взять</button>` : "",
              takenMe && g.status === "work" && gDone !== g.id ? `<button class="btn go" data-g="done" data-id="${g.id}" type="button">Выполнил</button><button class="btn" data-g="drop" data-id="${g.id}" type="button">Отказаться</button>` : "",
              takenMe && g.status === "done" ? `<button class="btn" data-g="reopen" data-id="${g.id}" type="button">Не готово</button>` : "",
              `<button class="btn" data-g="copy" data-id="${g.id}" type="button" title="Создать такой же заказ у себя, чтобы посчитать сырьё">В мои заказы</button>`,
              canDel ? `<button class="btn" data-g="del" data-id="${g.id}" type="button">${gArm === "del" + g.id ? "Точно удалить?" : "Удалить"}</button>` : "",
            ].join("");
            let doneH = "";
            if (gDone === g.id && gPlan) {
              const li = a => a.map(([k, n]) => `<li>${esc(nm(k))}: <b>${num(n)}</b></li>`).join("");
              doneH = `<div class="sk-wo-box"><b>${gPlan.take.length ? "Спишется со склада фракции:" : "Со склада фракции списывать нечего."}</b>${gPlan.take.length ? `<ul>${li(gPlan.take)}</ul>` : ""}${gPlan.lack.length ? `<p class="hint">На складе фракции не хватало, это ты брал своё или докупал:</p><ul class="hint">${li(gPlan.lack)}</ul>` : ""}<p class="hint">В журнал запишется от тебя с заметкой «${esc(gNoteTxt(g))}».</p>${S.ofMoves.some(m => m.note === gNoteTxt(g)) ? '<p class="warn">По этому заказу со склада фракции уже списывали (есть в журнале). Проверь, чтобы не списать второй раз.</p>' : ""}<button class="btn go" data-g="done-yes" data-id="${g.id}" type="button">Подтвердить выполнение</button> <button class="btn" data-g="done-no" data-id="${g.id}" type="button">Отмена</button></div>`;
            }
            return `<div class="gcard st-${g.status}"><div class="gtop"><b>${esc(g.name || "Заказ")}</b><span class="gst">${ST[g.status]}${g.taken_by ? " · " + esc(ofWho(g.taken_by)) : ""}</span></div>
              ${tilesH}${sumH}
              <div class="hint">от ${esc(ofWho(g.created_by))} · ${when(g.created_at)}${g.due ? " · срок " + esc(g.due) : ""}</div>
              <div class="gnote">${canNoteG ? `<input class="g-note" data-id="${g.id}" maxlength="300" value="${esc(g.note)}" placeholder="Для кого или номер заказа (нужно, чтобы выполнить)">` : g.note ? esc(g.note) : '<span class="hint">без заметки</span>'}</div>
              ${gMsgId === g.id && gMsgTxt ? `<p class="warn" style="margin:4px 0">${esc(gMsgTxt)}</p>` : ""}
              ${doneH}
              <div class="obar">${btns}</div></div>`;
          })
          .join("")
      : '<p class="hint">Заказов фракции пока нет.</p>';
    gbox.innerHTML = h;
  }
  tabs.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    otab = b.dataset.t;
    try { localStorage.setItem("forge-otab", otab); } catch (_) {}
    gRender();
  });
  gbox.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.classList.contains("g-price")) e.target.blur();
  });
  gbox.addEventListener("input", e => {
    if (e.target.id === "g-sendnote") gSendNote = e.target.value;
  });
  gbox.addEventListener("change", async e => {
    const t = e.target;
    if (t.classList.contains("g-price")) {
      const g = S.gorders.find(x => String(x.id) === t.dataset.id);
      if (!g) return;
      let v = Math.max(0, Math.round(+t.value || 0));
      // цена совпала с расчётной - значит своей цены нет
      try { if (Math.round(calcG({ ...g, manual: 0 }).pr.calc) === v) v = 0; } catch (_) {}
      const { error } = await sb.from("gorders").update({ manual: v }).eq("id", g.id);
      if (error) { gMsgId = g.id; gMsgTxt = "Цена не сохранилась: " + error.message; }
      else g.manual = v;
      return load();
    }
    if (!t.classList.contains("g-note")) return;
    const { error } = await sb.from("gorders").update({ note: t.value.trim().slice(0, 300) }).eq("id", t.dataset.id);
    if (error) { gMsgId = +t.dataset.id; gMsgTxt = "Заметка не сохранилась: " + error.message; return load(); }
    const g = S.gorders.find(x => String(x.id) === t.dataset.id);
    if (g) g.note = t.value.trim().slice(0, 300);
  });
  const gMsg = m => { const el = document.getElementById("g-msg"); if (el) el.textContent = m; };
  gbox.addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (!canFacMove() && b.dataset.g !== "copy" && b.dataset.g !== "del") return;
    if (b.id === "g-send") {
      if (b.disabled) return;
      b.disabled = true;
      const o = O();
      const items = Object.fromEntries(Object.entries(o.qty || {}).filter(([, q]) => +q > 0));
      if (!Object.keys(items).length) return gMsg("В твоём заказе нет вещей.");
      const { error } = await sb.from("gorders").insert({ faction: OF, name: (o.name || "Заказ").slice(0, 80), items, due: (o.due || "").slice(0, 20), note: gSendNote.trim().slice(0, 300), manual: +o.manual > 0 ? +o.manual : 0, status: "new", created_by: S.user.id });
      if (error) return gMsg("Не отправилось: " + error.message);
      gSendNote = "";
      return load();
    }
    const g = S.gorders.find(x => String(x.id) === b.dataset.id);
    if (!g) return;
    const act = b.dataset.g;
    let patch = null;
    if (act === "take") patch = { taken_by: S.user.id, status: "work" };
    if (act === "drop") patch = { taken_by: null, status: "new" };
    gMsgId = null;
    if (act === "done") {
      const ni = gbox.querySelector(`.g-note[data-id="${g.id}"]`);
      if (ni && ni.value.trim() !== (g.note || "")) {
        const { error } = await sb.from("gorders").update({ note: ni.value.trim().slice(0, 300) }).eq("id", g.id);
        if (!error) g.note = ni.value.trim().slice(0, 300);
      }
      if (!(g.note || "").trim()) {
        gMsgId = g.id;
        gMsgTxt = "Сначала впиши в заметку, для кого заказ или его номер.";
        return gRender();
      }
      const c = calcG(g, Object.fromEntries(Object.entries(S.facStock).filter(([, v]) => v > 0)));
      gPlan = { take: [...c.b.mid.filter(m => m.s > 0).map(m => [m.k, m.s]), ...c.b.rows.filter(r => r.s > 0).map(r => [r.k, r.s])], lack: c.b.rows.filter(r => r.buy > 0).map(r => [r.k, r.buy]) };
      gDone = g.id;
      return gRender();
    }
    if (act === "done-no") {
      gDone = gPlan = null;
      return gRender();
    }
    if (act === "done-yes") {
      b.disabled = true;
      const { error: e1 } = await sb.from("gorders").update({ status: "done" }).eq("id", g.id);
      if (e1) { gMsgId = g.id; gMsgTxt = "Не вышло: " + e1.message; gDone = gPlan = null; return load(); }
      if (gPlan && gPlan.take.length) {
        const note = gNoteTxt(g);
        const { error } = await sb.from("moves").insert(gPlan.take.map(([k, n]) => ({ faction: OF, res: k, qty: -n, note, user_id: S.user.id })));
        if (error) {
          await sb.from("gorders").update({ status: "work" }).eq("id", g.id);
          gMsgId = g.id;
          gMsgTxt = "Не списалось, заказ не отмечен выполненным: " + error.message;
          gDone = gPlan = null;
          return load();
        }
      }
      gDone = gPlan = null;
      return load();
    }
    if (act === "reopen") patch = { status: "work" };
    if (act === "preset") patch = { manual: 0 };
    if (patch) {
      const { error } = await sb.from("gorders").update(patch).eq("id", g.id);
      if (error) gMsg("Не вышло: " + error.message);
      return load();
    }
    if (act === "copy") {
      const o = newOrder((g.name || "Заказ фракции").slice(0, 40));
      o.qty = Object.fromEntries(Object.entries(g.items || {}).filter(([id]) => typeof BYID === "undefined" || BYID[id]));
      o.due = g.due || "";
      if (+g.manual > 0) o.manual = String(g.manual);
      orders.push(o);
      cur = orders.length - 1;
      save();
      switchOrder();
      otab = "my";
      try { localStorage.setItem("forge-otab", otab); } catch (_) {}
      return gRender();
    }
    if (act === "del") {
      if (gArm !== "del" + g.id) { gArm = "del" + g.id; return gRender(); }
      gArm = "";
      const { error } = await sb.from("gorders").delete().eq("id", g.id);
      if (error) gMsg("Не удалилось: " + error.message);
      return load();
    }
  });
  // свой заказ поменялся: обновить кнопку «Отправить в цех» и закрыть устаревший предпросмотр списания
  const qKey = () => (typeof O === "function" ? JSON.stringify(O().qty) + cur : "");
  if (typeof renderOrder === "function") {
    const _ro = renderOrder;
    renderOrder = function (...a) {
      const r = _ro.apply(this, a);
      try {
        if (woArmKey !== qKey()) woArm = false;
        woRender();
        if (otab === "cex" && !typing()) gRender();
      } catch (_) {}
      return r;
    };
  }
  const _render = render;
  render = function () {
    _render();
    // склад фракции поменялся (или права) - пересчитать заказ, если он считается по складу фракции
    if ((srcFac && canFacView()) || window.SRC_FAC) applySrc();
    else woRender();
    gRender();
  };

  // нельзя ждать запросы прямо внутри onAuthStateChange - supabase-js может зависнуть, поэтому через setTimeout
  sb.auth.onAuthStateChange(ev => {
    if (ev !== "INITIAL_SESSION") setTimeout(load, 0);
  });
  // чужие изменения приходят сразу; если человек что-то печатает, обновляем после того, как он выйдет из поля
  const typing = () => {
    const a = document.activeElement;
    return !!a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.id !== "sk-q" && (root.contains(a) || gbox.contains(a));
  };
  let liveT = 0, livePend = false;
  const liveLoad = () => {
    clearTimeout(liveT);
    liveT = setTimeout(() => (typing() ? (livePend = true) : load()), 300);
  };
  document.addEventListener("focusout", () =>
    setTimeout(() => {
      if (livePend && !typing()) {
        livePend = false;
        load();
      }
    }, 0),
  );
  sb.channel("sklad")
    .on("postgres_changes", { event: "*", schema: "public", table: "moves" }, liveLoad)
    .on("postgres_changes", { event: "*", schema: "public", table: "members" }, liveLoad)
    .on("postgres_changes", { event: "*", schema: "public", table: "gorders" }, liveLoad)
    .subscribe();
  load();
  }
})();
