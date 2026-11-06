/*
 * Счётная книга ремесленника (KCD2 RP) — вся логика страницы.
 *
 * Данные (рецепты, сырьё, характеристики, иконки) лежат в data.js как window.FORGE_DATA.
 * Всё состояние пользователя (цены, заказы, склад, журнал) хранится в localStorage
 * под ключом KEY и пишется функцией save().
 *
 * Порядок разделов в файле:
 *   1. Данные и состояние
 *   2. Себестоимость (дерево рецептов)
 *   3. Цены сырья и цены с аукциона KCDRP
 *   4. Заготовки: крафтить или купить
 *   5. Разбор заказа: заготовки, сырьё, своё/заказчика/склад
 *   6. Заказы: список, статус, журнал продаж
 *   7. Каталог чертежей, сортировка по характеристикам, подсказка при наведении
 *   8. Панель заказа, «Заказ выполнен», план крафта, текст для заказчика
 *   9. Сохранение в файл / загрузка, журнал продаж, сворачивание, общий renderAll()
 */

// ============================================================
// 1. Данные и состояние
// ============================================================
const DATA = window.FORGE_DATA;
const RAWK = DATA.raw.map(r => r[0]),
  MAT = DATA.mat;
const NAME = {};
DATA.raw.forEach(([k, n]) => (NAME[k] = n));
Object.entries(MAT).forEach(([k, m]) => (NAME[k] = m.n));
const MAINRAW = [
  "fe",
  "co",
  "cuo",
  "ag",
  "nug",
  "au",
  "met",
  "hd",
  "nettle",
  "log",
  "antl",
  "resin",
  "shaft",
];
const DEF = { markup: 120, mk_leather: 6, mk_pad: 9 };
DATA.raw.forEach(([k, , v]) => (DEF[k] = v));
const ITEMS = DATA.items,
  BYID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const KEY = "forge-ledger-v4";
const newOrder = name => ({
  name,
  qty: {},
  client: {},
  done: false,
  steps: {},
  due: "",
  pay: "no",
  paid: 0,
  given: false,
  vars: {},
  manual: "",
  allc: false,
});
let P = { ...DEF },
  stock = {},
  sec = "a",
  tab = "all",
  cat = "all",
  query = "",
  orders = [newOrder("Заказ 1")],
  cur = 0,
  off = {},
  sign = "",
  showAll = false,
  journal = [],
  jper = "week";
const V3MAP = {
  steel: "steel",
  pad: "pad",
  leather: "leather",
  iron: "fe",
  coal: "co",
  hide: "hd",
  nettle: "nettle",
  copper: "cuo",
  ore: "ag",
  nug: "nug",
  gold: "au",
  met: "met",
};
function fromV3(s) {
  const p = {},
    st = {};
  Object.entries(s.P || {}).forEach(([k, v]) => {
    if (k === "markup" || k === "cdisc") p[k] = v;
    else if (V3MAP[k] && RAWK.includes(V3MAP[k])) p[V3MAP[k]] = v;
  });
  Object.entries(s.stock || {}).forEach(([k, v]) => {
    if (V3MAP[k]) st[V3MAP[k]] = v;
  });
  return { p, st };
}
const cleanOrders = arr =>
  (Array.isArray(arr) && arr.length ? arr : [newOrder("Заказ 1")]).map(o => ({
    name: o.name || "Заказ",
    qty: Object.fromEntries(Object.entries(o.qty || {}).filter(([k]) => BYID[k])),
    client: o.client || {},
    done: !!o.done,
    snap: o.snap,
    steps: o.steps || {},
    due: o.due || "",
    pay: o.pay || "no",
    paid: +o.paid || 0,
    given: !!o.given,
    vars: o.vars || {},
    jid: o.jid,
    manual: o.manual || "",
    allc: !!o.allc,
  }));
try {
  const s = JSON.parse(localStorage.getItem(KEY) || "null");
  if (s) {
    P = { ...DEF, ...(s.P || {}) };
    stock = s.stock || {};
    sec = s.sec || "a";
    off = s.off || {};
    sign = s.sign || "";
    journal = Array.isArray(s.journal) ? s.journal : [];
    orders = cleanOrders(s.orders);
    cur = Math.max(0, Math.min(s.cur | 0, orders.length - 1));
  } else {
    const o = JSON.parse(localStorage.getItem("forge-ledger-v3") || "null");
    if (o) {
      const { p, st } = fromV3(o);
      P = { ...DEF, ...p };
      stock = st;
    }
  }
} catch (e) {}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ P, stock, sec, orders, cur, off, sign, journal }));
  } catch (e) {}
};
const O = () => orders[cur],
  Q = () => O().qty;

// ============================================================
// 2. Себестоимость
// ============================================================
// uc(k) — себестоимость 1 шт. заготовки k из сырья по текущим ценам P.
// Рецепт заготовки может давать несколько штук за раз (MAT[k].out), поэтому делим на выход.
// Если цена заготовки на аукционе (P["mk_"+k]) задана и ниже — берётся она.
let UC = {};
function uc(k) {
  if (k in UC) return UC[k];
  if (!MAT[k]) return (UC[k] = P[k] || 0);
  const m = MAT[k];
  UC[k] = 0;
  let s = m.b || 0;
  for (const [x, n] of Object.entries(m.inp)) s += n * uc(x);
  return (UC[k] = s / m.out);
}
const recalc = () => {
  UC = {};
};
// i.o — сколько штук даёт один крафт (стрелы, пиво…); себестоимость считаем на 1 шт.
const cost = i =>
  i.m ? uc(i.m) : (Object.entries(i.r).reduce((s, [k, n]) => s + n * uc(k), 0) + i.b) / (i.o || 1);
const DEPTH = {};
function depth(k) {
  if (k in DEPTH) return DEPTH[k];
  if (!MAT[k]) return (DEPTH[k] = 0);
  DEPTH[k] = 0;
  return (DEPTH[k] = 1 + Math.max(...Object.keys(MAT[k].inp).map(depth)));
}
const MATORD = Object.keys(MAT).sort((a, b) => depth(b) - depth(a));
const ALLK = [...RAWK, ...Object.keys(MAT)];
const cPrice = k => uc(k);

const fmt = (v, d = 0) => (isFinite(v) ? v.toLocaleString("ru-RU", { maximumFractionDigits: d }) : "—");
const g = v => fmt(Math.round(v * 10) / 10, 1);
const esc = s =>
  String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const initials = i =>
  esc(
    i.n
      .replace(/[«»()]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0])
      .join(""),
  );
function icon(i, cls = "ic") {
  return i.ic && DATA.icons[i.ic]
    ? `<img class="${cls}" src="${DATA.icons[i.ic]}" alt="" loading="lazy">`
    : `<span class="${cls} none" aria-hidden="true">${initials(i)}</span>`;
}
const compText = i =>
  Object.entries(i.m ? MAT[i.m].inp : i.r)
    .map(([k, n]) => `${esc(NAME[k])} <b>${n}</b>`)
    .join(" · ");
function arm(b, txt, orig) {
  b.dataset.armed = "1";
  b.textContent = txt;
  clearTimeout(b._t);
  b._t = setTimeout(() => disarm(b, orig), 3000);
}
function disarm(b, orig) {
  delete b.dataset.armed;
  b.textContent = orig;
  clearTimeout(b._t);
}

// ============================================================
// 3. Цены сырья
// ============================================================
const priceField = (k, pre = "") =>
  `<div class="pf"><label for="p_${pre}${k}">${k === "markup" ? "Работа, % от себест." : esc(NAME[k])}</label><input id="p_${pre}${k}" data-p="${k}" type="number" min="0" step="0.5" inputmode="decimal" value="${P[k]}"></div>`;
function rawUsed(s) {
  const out = new Set(),
    walk = k => {
      if (MAT[k]) Object.keys(MAT[k].inp).forEach(walk);
      else out.add(k);
    };
  ITEMS.filter(i => i.s === s).forEach(i => {
    if (i.m) walk(i.m);
    else Object.keys(i.r).forEach(walk);
  });
  return RAWK.filter(k => out.has(k));
}
const SECNAME = Object.fromEntries(DATA.secs.map(([k, n]) => [k, n]));
const PRICE_TITLE = { a: "Бронное дело", w: "Кузнечное дело" };
// Цены показываем для открытого ремесла; броня и оружие идут вместе, как раньше.
// Поля перерисовываются при смене ремесла, поэтому слушаем ввод на контейнерах.
function renderPrices() {
  const list = sec === "a" || sec === "w" ? ["a", "w"] : [sec],
    el = document.getElementById("pgrid");
  el.innerHTML = list
    .map(
      s =>
        `<div><h3 class="ph3">${esc(PRICE_TITLE[s] || SECNAME[s])}</h3><div class="prices">${rawUsed(s)
          .map(k => priceField(k, s + "_"))
          .join("")}</div></div>`,
    )
    .join("");
}
document.getElementById("pricesm").innerHTML = priceField("markup");
["pgrid", "pricesm"].forEach(id =>
  document.getElementById(id).addEventListener("input", e => {
    if (!e.target.dataset.p) return;
    const v = parseFloat(e.target.value);
    const k = e.target.dataset.p;
    P[k] = isNaN(v) ? 0 : v;
    document.querySelectorAll(`[data-p="${k}"]`).forEach(i => {
      if (i !== e.target) i.value = e.target.value;
    });
    save();
    recalc();
    renderAll();
  }),
);
document.getElementById("reset").addEventListener("click", () => {
  P = { ...DEF };
  document.querySelectorAll("[data-p]").forEach(i => (i.value = P[i.dataset.p]));
  save();
  recalc();
  renderAll();
});
// ------------------------------------------------------------
// Цены с аукциона KCDRP
// Сайт KCDRP не отдаёт данные другим сайтам (CORS), поэтому сначала пробуем напрямую,
// а если нельзя — берём копию, которую GitHub Actions раз в час кладёт в ветку prices
// (.github/workflows/prices.yml). API_ID: id товара в API -> название сырья в калькуляторе.
// ------------------------------------------------------------
const API_URL = "https://account.kcdroleplay.com/api/ucp/realm?world=ru";
const API_ID = {
  ...(DATA.api || {}),
  "good:ore": "Железная руда",
  "good:coal": "Уголь",
  "good:copperore": "Медная руда",
  "good:silver": "Серебряная руда",
  "good:silvernugget": "Самородки чистого серебра",
  "good:gold": "Золотая руда",
  "good:meteoric": "Метеоритное железо",
  "good:hide": "Шкуры",
  "good:nettle": "Крапива",
  "good:logs": "Брёвна",
  "good:antler": "Рога",
  "good:finesilver": "Чистое серебро",
  "good:resin": "Сосновая смола",
  "good:haft": "Древки",
  "good:relicstub": "Обломок оружия",
  "good:relicaxe": "Сломанный топор",
  "good:relicclaw": "Драконий коготь",
  "good:leather": "кожа",
  "good:padding": "набивка",
  "good:steel": "steel",
  "good:linen": "льняное полотно",
  "good:bowstring": "bowstrings",
  "good:malt": "ячменный солод",
  "good:charcoalwater": "угольная вода",
  "good:memorialcoin": "памятные монеты",
  "good:noose": "верёвки повешенного",
};
/** Разбирает ответ API (или его копию с GitHub) в { "Название сырья": [минимальная, средняя за 7 дней] }. */
function parseRealm(txt) {
  let d = null;
  try {
    d = JSON.parse(txt.replace(/^\uFEFF/, ""));
  } catch (e) {
    return null;
  }
  const it = d && d.auction && d.auction.items;
  if (!Array.isArray(it)) return null;
  const map = {};
  it.forEach(x => {
    const n = API_ID[x.item];
    if (n) map[n] = [x.low > 0 ? x.low : null, x.avg > 0 ? x.avg : null];
  });
  return map;
}
function applyMarket(raw, note) {
  const col = +document.getElementById("mkcol").value;
  const parsed = parseRealm(raw);
  if (!parsed) {
    note.textContent = "Это не похоже на ответ аукциона KCDRP (нет списка auction).";
    return false;
  }
  const nm = s => s.toLowerCase().replace(/ё/g, "е").trim(),
    mp = {};
  Object.entries(parsed).forEach(([n, v]) => {
    const k = nm(n);
    if (!mp[k]) mp[k] = v;
  });
  const got = [],
    gotM = [],
    fb = [];
  const pick = (v, k) => {
    if (!v) return null;
    if (v[col] != null) return v[col];
    const o = v[1 - col];
    if (o != null) {
      fb.push(k);
      return o;
    }
    return null;
  };
  RAWK.forEach(k => {
    const x = pick(mp[nm(NAME[k])], k);
    if (x != null) {
      P[k] = x;
      document.querySelectorAll(`[data-p="${k}"]`).forEach(i => (i.value = P[k]));
      got.push(k);
    }
  });
  Object.entries(MATMK).forEach(([k, list]) => {
    for (const n of list) {
      const x = pick(mp[nm(n)], "mk_" + k);
      if (x != null) {
        P["mk_" + k] = x;
        gotM.push(k);
        break;
      }
    }
  });
  if (!got.length && !gotM.length) {
    note.textContent = "Не нашёл знакомого сырья. Проверь, что скопировал таблицу с ценами.";
    return false;
  }
  save();
  recalc();
  renderAll();
  note.textContent =
    "С аукциона KCDRP, " +
    (col ? "средняя цена за 7 дней. " : "самая дешёвая цена сейчас. ") +
    "Обновлено: " +
    got.map(k => `${NAME[k].toLowerCase()} ${fmt(P[k], 1)}`).join(", ") +
    (gotM.length
      ? ". Заготовки с аукциона: " +
        gotM.map(k => `${NAME[k].toLowerCase()} ${fmt(P["mk_" + k], 1)}`).join(", ")
      : "") +
    (fb.length
      ? ". Нет в продаже, взята другая колонка: " +
        fb.map(k => NAME[k.replace(/^mk_/, "")].toLowerCase()).join(", ")
      : "");
  return true;
}
const MIRROR_URL = "https://raw.githubusercontent.com/DanekKuznec/kcd2-rp-crafting/prices/auction.json";
async function getText(url, ms) {
  const c = new AbortController(),
    t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { credentials: "omit", cache: "no-store", signal: c.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}
document.querySelectorAll(".mkfetch").forEach(btn =>
  btn.addEventListener("click", async e => {
    const b = e.currentTarget,
      note = document.getElementById("mknote"),
      fn = document.getElementById("mkfnote");
    document.getElementById("mkcol").value = b.dataset.col;
    const all = document.querySelectorAll(".mkfetch");
    all.forEach(x => (x.disabled = true));
    fn.textContent = "Загружаю…";
    try {
      let txt = null,
        when = "прямо сейчас";
      try {
        txt = await getText(API_URL, 6000);
      } catch (err) {}
      if (!txt) {
        txt = await getText(MIRROR_URL + "?t=" + Date.now(), 10000);
        try {
          const u = JSON.parse(txt).updated;
          if (u) {
            const d = new Date(u),
              min = Math.round((Date.now() - d) / 60000);
            when =
              "на " +
              d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) +
              (min >= 0 ? ` (${min < 60 ? min + " мин" : Math.round(min / 60) + " ч"} назад)` : "");
          }
        } catch (err) {}
      }
      fn.textContent = "Цены " + when + ".";
      applyMarket(txt, note);
    } catch (err) {
      console.warn("auction", err);
      fn.textContent = "Не удалось загрузить цены с аукциона. Попробуй позже.";
    } finally {
      all.forEach(x => (x.disabled = false));
    }
  }),
);
// ============================================================
// 4. Заготовки: крафтить или купить
// ============================================================
// MATMK — как заготовка называется на аукционе (для подстановки цены).
const MATMK = {
  linen: ["льняное полотно"],
  bowstr: ["bowstrings", "тетивы"],
  malt: ["ячменный солод"],
  cwater: ["угольная вода"],
  mcoin: ["памятные монеты"],
  noose: ["верёвки повешенного"],
  leather: ["кожа"],
  pad: ["набивка"],
  steel: ["стальные бруски", "steel"],
  cu: ["copper", "медь"],
  frank: ["frankfurt steel", "франкфуртская сталь"],
  horn: ["antler shards", "оленьи рога"],
  tol: ["толедская сталь", "toledo steel"],
  iron: ["железо", "iron"],
  scrap: ["железный лом"],
  fast: ["крепёж", "крепеж"],
  sheet: ["листовая сталь"],
};
const mkRows = document.getElementById("mkrows");
function renderMkCmp() {
  mkRows.innerHTML = Object.keys(MAT)
    .filter(k => k !== "indr")
    .map(k => {
      const c = uc(k),
        m = +P["mk_" + k] || 0;
      const verdict = !m
        ? '<span class="hint">впиши цену</span>'
        : m < c
          ? `<span class="buy">купить: дешевле на ${g(c - m)} гр.</span>`
          : m > c
            ? `<span class="ok">крафтить: дешевле на ${g(m - c)} гр.</span>`
            : "одинаково";
      return `<tr><td class="l">${esc(NAME[k])}</td><td class="num">${g(c)}</td><td class="num"><input class="mkin" data-mk="${k}" type="number" min="0" step="0.5" inputmode="decimal" placeholder="—" value="${m || ""}" aria-label="Цена на аукционе: ${esc(NAME[k])}"></td><td class="l">${verdict}</td></tr>`;
    })
    .join("");
}
mkRows.addEventListener("input", e => {
  const k = e.target.dataset.mk;
  if (!k) return;
  const v = parseFloat(e.target.value);
  if (v > 0) P["mk_" + k] = v;
  else delete P["mk_" + k];
  save();
  const c = uc(k),
    m = v > 0 ? v : 0,
    cell = e.target.closest("tr").lastElementChild;
  cell.innerHTML = !m
    ? '<span class="hint">впиши цену</span>'
    : m < c
      ? `<span class="buy">купить: дешевле на ${g(c - m)} гр.</span>`
      : m > c
        ? `<span class="ok">крафтить: дешевле на ${g(m - c)} гр.</span>`
        : "одинаково";
});
function renderDerived() {
  document.getElementById("derived").innerHTML =
    ["steel", "iron", "scrap", "leather", "pad", "cu", "frank", "tol"]
      .map(k => `<span>${esc(NAME[k])}: <b>${g(uc(k))}</b></span>`)
      .join("") + `<span>Работа: <b>+${fmt(P.markup)}%</b></span>`;
}

// ============================================================
// 5. Разбор заказа
// ============================================================
// needOf() — сколько каких вещей в заказе; breakdown() разворачивает дерево рецептов:
// что сделать заранее (заготовки), сколько сырья нужно, что даёт заказчик, что берём со склада.
function needOf() {
  const need = {},
    add = (k, n) => (need[k] = (need[k] || 0) + n);
  let n = 0,
    c = 0,
    b = 0;
  for (const [id, q] of Object.entries(Q())) {
    const i = BYID[id];
    if (!i) continue;
    n += q;
    c += cost(i) * q;
    if (i.m) add(i.m, q);
    else {
      const crafts = i.o ? Math.ceil(q / i.o) : q;
      b += i.b * crafts;
      Object.entries(i.r).forEach(([k, v]) => add(k, v * crafts));
    }
  }
  return { need, n, cost: c, b };
}
function treeKeys() {
  const s = new Set(),
    walk = k => {
      if (s.has(k)) return;
      s.add(k);
      if (MAT[k]) Object.keys(MAT[k].inp).forEach(walk);
    };
  for (const id of Object.keys(Q())) {
    const i = BYID[id];
    if (!i) continue;
    if (i.m) walk(i.m);
    else Object.keys(i.r).forEach(walk);
  }
  return s;
}
function breakdown(bare) {
  let cl = null;
  if (!bare && O().allc) {
    cl = {};
    breakdown(true).rows.forEach(r => (cl[r.k] = r.all));
  }
  const t = needOf(),
    need = { ...t.need },
    C = k => (bare ? 0 : cl ? cl[k] || 0 : O().client[k] || 0),
    S = k => (bare || cl ? 0 : stock[k] || 0);
  const take = (n, k) => {
    const c = Math.min(C(k), n),
      s = Math.min(S(k), n - c);
    return { c, s, rest: n - c - s };
  };
  const mid = [],
    used = {},
    surplus = {};
  let matBench = 0;
  for (const k of MATORD) {
    const n = need[k] || 0;
    if (!n) continue;
    const m = MAT[k],
      x = take(n, k);
    used[k] = x.c;
    const crafts = Math.ceil(x.rest / m.out);
    surplus[k] = crafts * m.out - x.rest;
    matBench += crafts * (m.b || 0);
    Object.entries(m.inp).forEach(([i, v]) => (need[i] = (need[i] || 0) + v * crafts));
    mid.push({ k, need: n, c: x.c, s: x.s, make: x.rest, crafts, d: depth(k) });
  }
  const rows = RAWK.filter(k => need[k]).map(k => {
    const all = need[k],
      x = take(all, k),
      isOff = !!off[k];
    used[k] = x.c;
    return {
      k,
      all,
      c: x.c,
      s: x.s,
      buy: x.rest,
      off: isOff,
      money: isOff ? 0 : x.rest * uc(k),
      offVal: isOff ? (all - x.c) * uc(k) : 0,
    };
  });
  let disc = 0;
  ALLK.forEach(k => (disc += C(k) * cPrice(k)));
  const extra = ALLK.map(k => [k, C(k) - (used[k] || 0)]).filter(([, v]) => v > 0);
  const unpriced = rows.filter(r => !r.off && !(P[r.k] > 0)).map(r => r.k);
  return {
    t,
    mid,
    rows,
    disc,
    extra,
    surplus,
    matBench,
    unpriced,
    buyMoney: rows.reduce((s, r) => s + r.money, 0),
    offVal: rows.reduce((s, r) => s + r.offVal, 0),
  };
}

// --- Поля «сырьё заказчика» и «склад»
const cg = document.getElementById("client"),
  sb = document.getElementById("stock");
function visKeys(src) {
  const tk = treeKeys();
  return ALLK.filter(k => tk.has(k) || src[k]);
}
function renderClientInputs() {
  const o = O(),
    ks = visKeys(o.client);
  if (o.allc) {
    cg.innerHTML = `<span class="hint">Стоит галочка «Всё сырьё от заказчика» в заказе: считается, что он принёс всё нужное, склад не трогается.</span>`;
    document.getElementById("cname").textContent = o.name;
    return;
  }
  cg.innerHTML = ks.length
    ? ks
        .map(
          k =>
            `<div class="cres"><span class="cl">${esc(NAME[k])}</span><label class="sr" for="c_${k}">Сколько дал: ${esc(NAME[k])}</label><input id="c_${k}" data-c="${k}" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${o.client[k] || ""}"><span class="cp num" title="Засчитывается по рыночной цене">по ${g(cPrice(k))}</span></div>`,
        )
        .join("")
    : `<span class="hint">Сначала добавь вещи в заказ.</span>`;
  document.getElementById("cname").textContent = o.name;
}
document.getElementById("callc").addEventListener("click", () => {
  const b = breakdown(true);
  if (!b.t.n) return;
  const o = O();
  o.client = {};
  b.rows.forEach(r => (o.client[r.k] = r.all));
  save();
  renderOrder();
});
cg.addEventListener("input", e => {
  const k = e.target.dataset.c;
  if (!k) return;
  const v = Math.max(0, parseInt(e.target.value) || 0),
    o = O();
  if (v) o.client[k] = v;
  else delete o.client[k];
  save();
  renderOrder("c");
});
document.getElementById("cclear").addEventListener("click", () => {
  O().client = {};
  save();
  renderClientInputs();
  renderOrder();
});
function renderStockInputs() {
  const ks = showAll ? ALLK : visKeys(stock);
  sb.innerHTML = ks.length
    ? ks
        .map(
          k =>
            `<div class="pf"><label for="s_${k}">${esc(NAME[k])}${MAT[k] ? ' <span class="rtag">заготовка</span>' : ""}</label><input id="s_${k}" data-s="${k}" type="number" min="0" step="1" inputmode="numeric" value="${stock[k] || ""}"></div>`,
        )
        .join("")
    : `<span class="hint">Пусто. Добавь вещи в заказ или включи «Показать все ресурсы».</span>`;
}
sb.addEventListener("input", e => {
  const k = e.target.dataset.s;
  if (!k) return;
  const v = Math.max(0, parseInt(e.target.value) || 0);
  if (v) stock[k] = v;
  else delete stock[k];
  save();
  renderOrder("s");
});
document.getElementById("sall").addEventListener("change", e => {
  showAll = e.target.checked;
  renderStockInputs();
});
const sclr = document.getElementById("sclear");
sclr.addEventListener("click", () => {
  if (sclr.dataset.armed) {
    stock = {};
    save();
    renderStockInputs();
    renderOrder();
    disarm(sclr, "Очистить склад");
  } else arm(sclr, "Точно очистить?", "Очистить склад");
});

// ============================================================
// 6. Заказы
// ============================================================
const osel = document.getElementById("osel"),
  oname = document.getElementById("oname"),
  odel = document.getElementById("odel");
const countOf = o => Object.values(o.qty).reduce((a, b) => a + b, 0);
const PAYTXT = { no: "не оплачено", pre: "предоплата", yes: "оплачено" };
const dueTxt = o => (o.due ? o.due.split("-").reverse().slice(0, 2).join(".") : "");
const optLabel = (o, n) =>
  `${o.given ? "✓ отдан · " : o.done ? "сделан · " : ""}${o.name} · ${n} шт.${o.due ? " · до " + dueTxt(o) : ""}${o.given ? "" : " · " + PAYTXT[o.pay || "no"]}`;
function renderOrderList() {
  osel.innerHTML = orders
    .map((o, i) => `<option value="${i}">${esc(optLabel(o, countOf(o)))}</option>`)
    .join("");
  osel.value = String(cur);
  oname.value = O().name;
}
osel.addEventListener("change", () => {
  cur = +osel.value;
  save();
  switchOrder();
});
document.getElementById("onew").addEventListener("click", () => {
  orders.push(newOrder("Заказ " + (orders.length + 1)));
  cur = orders.length - 1;
  save();
  switchOrder();
  oname.focus();
  oname.select();
});
oname.addEventListener("input", () => {
  O().name = oname.value || "Без названия";
  save();
  osel.options[cur].textContent = optLabel(O(), countOf(O()));
  document.getElementById("cname").textContent = O().name;
});
odel.addEventListener("click", () => {
  if (!odel.dataset.armed) {
    arm(odel, "Точно удалить?", "Удалить");
    return;
  }
  disarm(odel, "Удалить");
  orders.splice(cur, 1);
  if (!orders.length) orders.push(newOrder("Заказ 1"));
  cur = Math.min(cur, orders.length - 1);
  save();
  switchOrder();
});
document.getElementById("clearq").addEventListener("click", () => {
  O().qty = {};
  save();
  renderTable();
  renderOrder();
});
function switchOrder() {
  renderOrderList();
  renderStatus();
  renderTable();
  renderOrder();
}
const odue = document.getElementById("odue"),
  opay = document.getElementById("opay"),
  opaid = document.getElementById("opaid"),
  ogiven = document.getElementById("ogiven"),
  omanual = document.getElementById("omanual"),
  oallc = document.getElementById("oallc"),
  paidbox = document.getElementById("paidbox");
function renderStatus() {
  const o = O();
  odue.value = o.due || "";
  opay.value = o.pay || "no";
  opaid.value = o.paid || "";
  omanual.value = o.manual || "";
  oallc.checked = !!o.allc;
  ogiven.checked = !!o.given;
  paidbox.hidden = o.pay !== "pre";
}
const statusChanged = () => {
  const o = O();
  o.due = odue.value;
  o.pay = opay.value;
  o.paid = Math.max(0, parseFloat(opaid.value) || 0);
  o.manual = Math.max(0, parseFloat(omanual.value) || 0) || "";
  o.allc = oallc.checked;
  const wasGiven = o.given;
  o.given = ogiven.checked;
  paidbox.hidden = o.pay !== "pre";
  if (o.given && !wasGiven) addToJournal(o);
  else if (!o.given && wasGiven && o.jid) {
    journal = journal.filter(r => r.id !== o.jid);
    delete o.jid;
  }
  save();
  renderOrderList();
  renderOrder();
  renderJournal();
};
function addToJournal(o) {
  const b = breakdown(),
    t = b.t;
  if (!t.n) return;
  const { mat, labor, price } = priceOf(b);
  const id = "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  o.jid = id;
  journal.unshift({
    id,
    date: new Date().toISOString().slice(0, 10),
    name: o.name,
    items: sortedIds().map(k => ({ n: BYID[k].n, q: Q()[k], v: varOf(k) })),
    price: Math.round(price),
    labor: Math.round(labor),
    cost: Math.round(t.cost),
  });
}
document.getElementById("omreset").addEventListener("click", () => {
  omanual.value = "";
  statusChanged();
});
[odue, opay, opaid, omanual, oallc, ogiven].forEach(el =>
  el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", statusChanged),
);
const signEl = document.getElementById("sign");
signEl.value = sign;
signEl.addEventListener("input", () => {
  sign = signEl.value;
  save();
});

// ============================================================
// 7. Каталог чертежей
// ============================================================
const secs = document.getElementById("secs"),
  tabs = document.getElementById("tabs"),
  cats = document.getElementById("cats");
secs.addEventListener("click", e => {
  const b = e.target.closest("button[data-s]");
  if (!b) return;
  sec = b.dataset.s;
  tab = "all";
  cat = "all";
  save();
  renderCatalogNav();
  renderTable();
});
secs.innerHTML = DATA.secs.map(([k, n]) => `<button type="button" data-s="${k}">${esc(n)}</button>`).join("");
if (!SECNAME[sec]) sec = "a";
function renderCatalogNav() {
  renderPrices();
  secs.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.s === sec)));
  const its = ITEMS.filter(i => i.s === sec),
    LV = [...new Set(its.map(i => i.l))].sort((a, b) => a - b);
  tabs.innerHTML = [["all", "Все"], ...LV.map(l => [String(l), l + " ур."])]
    .map(([v, t]) => `<button class="tab" type="button" data-v="${v}">${t}</button>`)
    .join("");
  const CS = DATA.cats[sec].filter(c => its.some(i => i.c === c));
  cats.innerHTML = [["all", "Все виды"], ...CS.map(c => [c, c])]
    .map(([v, t]) => `<button class="tab" type="button" data-c="${esc(v)}">${esc(t)}</button>`)
    .join("");
  document.getElementById("footnote").textContent =
    sec === "a"
      ? "Рецепты со скринов верстака бронника. Сталь: 3 железной руды + 2 угля → 2 бруска. Железо: 2 руды + 1 уголь → 3. Набивка: 3 крапивы + 1 кожа → 2. Кожа: 1 шкура → 2."
      : sec === "w"
        ? "Рецепты со скринов верстака кузнеца, состав как в «Компонентах» панели крафта. Заготовки (железо, лом, крепёж, гарды, навершия, особая сталь) считаются из сырья автоматически."
        : DATA.secs.find(x => x[0] === sec)[2] +
          " Колонка «Выход» — сколько штук даёт один крафт; себестоимость и цена указаны за 1 шт.";
}
tabs.addEventListener("click", e => {
  const b = e.target.closest(".tab");
  if (!b) return;
  tab = b.dataset.v;
  renderTable();
});
cats.addEventListener("click", e => {
  const b = e.target.closest(".tab");
  if (!b) return;
  cat = b.dataset.c;
  renderTable();
});
document.getElementById("q").addEventListener("input", e => {
  query = e.target.value.trim().toLowerCase();
  renderTable();
});
function setQty(id, v) {
  v = Math.max(0, v | 0);
  if (v) Q()[id] = v;
  else delete Q()[id];
  save();
  renderTable();
  renderOrder();
}
const tb = document.getElementById("tb");
function renderTable() {
  tabs.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === tab)));
  cats.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.c === cat)));
  const match = i =>
    i.s === sec &&
    (tab === "all" || String(i.l) === tab) &&
    (cat === "all" || i.c === cat) &&
    (!query || i.n.toLowerCase().includes(query) || (i.en && i.en.toLowerCase().includes(query)));
  let h = "",
    pl = null,
    pc = null;
  const q = Q();
  const F = FIELDS[sec] || [];
  if (dsort !== "" && !F.some(f => String(f[1]) === dsort)) dsort = "";
  dsortEl.innerHTML =
    `<span class="sortlbl">Сортировать внутри групп:</span><button class="tab" type="button" data-d="">как на верстаке</button>` +
    F.map(([t, n]) => `<button class="tab" type="button" data-d="${n}">${t.toLowerCase()}</button>`).join(
      "",
    ) +
    `<span class="sortlbl sorthint">${cat !== "all" ? "— по всему виду, без учёта уровня" : ""}</span>`;
  dsortEl.hidden = !F.length;
  dsortEl
    .querySelectorAll(".tab")
    .forEach(b => b.setAttribute("aria-pressed", String(b.dataset.d === dsort)));
  let list = ITEMS.filter(match);
  const flat = dsort !== "" && cat !== "all";
  if (dsort !== "") {
    const gk = i => (flat ? i.c : i.l + "|" + i.c),
      gi = {};
    list.forEach((i, n) => {
      if (!(gk(i) in gi)) gi[gk(i)] = n;
    });
    const v = i => (!i.st ? -1 : i.st[+dsort]);
    list = list
      .map((i, n) => [i, n])
      .sort((a, b) => gi[gk(a[0])] - gi[gk(b[0])] || v(b[0]) - v(a[0]) || a[1] - b[1])
      .map(x => x[0]);
  }
  list.forEach(i => {
    if (!flat && i.l !== pl) {
      h += `<tr class="lvl"><td colspan="7">Уровень ${i.l}</td></tr>`;
      pl = i.l;
      pc = null;
    }
    if (i.c !== pc) {
      h += `<tr class="cat"><td></td><td colspan="6">${esc(i.c)}</td></tr>`;
      pc = i.c;
    }
    const c = cost(i),
      id = esc(i.id);
    h += `<tr class="${q[i.id] ? "picked" : ""}"${FIELDS[i.s] && i.c !== "Материалы" && i.c !== "Детали" ? ` data-tip="${id}"` : ""}><td>${icon(i)}</td><td class="name"><div class="ru" style="font-size:14.5px;color:var(--ink)">${esc(i.n)}</div>${flat ? `<div class="flag">${i.l} ур.</div>` : ""}${i.note ? `<div class="flag">${esc(i.note)}</div>` : ""}</td>
      <td class="comp">${compText(i)}</td><td class="num res">${i.m ? "<b>" + MAT[i.m].out + "</b>" : i.o ? "<b>" + i.o + "</b>" : "1"}</td>      <td class="num cost">${fmt(c, i.m || i.o ? 1 : 0)}</td><td class="num sell">${fmt(c * (1 + P.markup / 100), i.m || i.o ? 1 : 0)}</td>
      <td><div class="qcell"><input class="qty" data-k="${id}" type="number" min="0" step="1" value="${q[i.id] || ""}" aria-label="Количество: ${esc(i.n)}"><button class="add" type="button" data-k="${id}" aria-label="Добавить: ${esc(i.n)}">+</button></div></td></tr>`;
  });
  tb.innerHTML = h || `<tr><td colspan="7" class="l note">Ничего не найдено.</td></tr>`;
}
tb.addEventListener("input", e => {
  const t = e.target;
  if (!t.classList.contains("qty")) return;
  const v = Math.max(0, parseInt(t.value) || 0);
  if (v) Q()[t.dataset.k] = v;
  else delete Q()[t.dataset.k];
  save();
  t.closest("tr").classList.toggle("picked", !!v);
  renderOrder();
});
tb.addEventListener("click", e => {
  const b = e.target.closest(".add");
  if (!b) return;
  setQty(b.dataset.k, (Q()[b.dataset.k] || 0) + 1);
});
// --- Сортировка по характеристикам и подсказка при наведении
// FIELDS — какие характеристики есть у брони (a) и оружия (w); индекс = позиция в item.st.
// В item.st последним элементом идёт вес. DMAX — лучшее значение в каждом виде (для полосок).
const dsortEl = document.getElementById("dsort"),
  dtip = document.getElementById("dtip");
document.body.appendChild(dtip);
let dsort = "";
try {
  dsort = localStorage.getItem("forge-dsort") || "";
} catch (e) {}
dsortEl.addEventListener("click", e => {
  const b = e.target.closest(".tab");
  if (!b) return;
  dsort = b.dataset.d;
  try {
    localStorage.setItem("forge-dsort", dsort);
  } catch (e) {}
  renderTable();
});
const FIELDS = {
  b: [["Урон", 0]],
  a: [
    ["Колющий", 0],
    ["Режущий", 1],
    ["Дробящий", 2],
  ],
  w: [
    ["Атака", 0],
    ["Колющий", 1],
    ["Режущий", 2],
    ["Дробящий", 3],
    ["Защита", 4],
  ],
};
const DMAX = {};
ITEMS.forEach(i => {
  if (!i.st) return;
  const F = FIELDS[i.s],
    k = i.s + i.c,
    m = DMAX[k] || (DMAX[k] = {});
  F.forEach(([, n]) => {
    if (i.st[n] > (m[n] || 0)) m[n] = i.st[n];
  });
});
function tipHtml(i) {
  const head = `<div class="dt-n">${esc(i.n)}</div><div class="dt-s">${esc(i.c)} · ${i.l} ур.</div>`;
  if (!i.st) return head + `<div class="dt-none">Нет данных о характеристиках</div>`;
  const F = FIELDS[i.s],
    m = DMAX[i.s + i.c] || {},
    bar = (v, mx) => `<i><u style="width:${Math.round((100 * v) / (mx || 1))}%"></u></i>`;
  const rows = F.filter(([, n]) => i.s !== "w" || i.st[n])
    .map(([t, n]) => `<div class="dt-r"><span>${t}</span><b>${i.st[n]}</b>${bar(i.st[n], m[n])}</div>`)
    .join("");
  const wi = F.length;
  return (
    head +
    `<div class="dt-h">${i.s === "a" ? "Защита" : "Характеристики"}</div>` +
    rows +
    (i.st[wi] != null ? `<div class="dt-w">Вес: <b>${i.st[wi]}</b></div>` : "") +
    `<div class="dt-f">полосы — от лучшего в разделе «${esc(i.c)}»</div>`
  );
}
function placeTip(x, y) {
  const w = dtip.offsetWidth,
    h = dtip.offsetHeight,
    vw = innerWidth,
    vh = innerHeight;
  let L = x + 16,
    T = y + 14;
  if (L + w > vw - 8) L = Math.max(8, x - w - 16);
  if (T + h > vh - 8) T = Math.max(8, vh - h - 8);
  dtip.style.left = L + "px";
  dtip.style.top = T + "px";
}
let tipId = null;
document.addEventListener("mousemove", e => {
  const r = e.target.closest && e.target.closest("#tb tr[data-tip]");
  if (!r || e.target.closest("input,button")) {
    dtip.hidden = true;
    tipId = null;
    return;
  }
  if (r.dataset.tip !== tipId) {
    tipId = r.dataset.tip;
    dtip.innerHTML = tipHtml(BYID[tipId]);
    dtip.hidden = false;
  }
  placeTip(e.clientX, e.clientY);
});
addEventListener(
  "scroll",
  () => {
    dtip.hidden = true;
    tipId = null;
  },
  { passive: true },
);

// ============================================================
// 8. Панель заказа
// ============================================================
const sortedIds = () =>
  Object.keys(Q())
    .filter(id => BYID[id])
    .sort((a, b) => BYID[a].s.localeCompare(BYID[b].s) || BYID[a].l - BYID[b].l);
const varOf = id => (O().vars || {})[id] || "";
const nameV = (id, v) => BYID[id].n + (v ? ` — ${v}` : "");
function priceOf(b) {
  const t = b.t;
  const mat = t.cost - b.disc - b.offVal,
    labor = (t.cost * P.markup) / 100,
    calc = mat + labor,
    man = +O().manual || 0;
  return man > 0
    ? { mat, labor: man - mat, price: man, calc, manual: true }
    : { mat, labor, price: calc, calc, manual: false };
}
function renderOrder(skip) {
  const b = breakdown(),
    t = b.t,
    q = Q(),
    ids = sortedIds();
  document.getElementById("tiles").innerHTML = ids.length
    ? `<div class="tiles">${ids
        .map(id => {
          const i = BYID[id],
            k = esc(id);
          return `<div class="tile" title="${esc(i.n)}: ${fmt(cost(i))} гр.">
     <span class="lv">${i.l}</span>${icon(i)}<span class="badge">${q[id]}</span><span class="tn">${esc(i.n)}</span>${(i.s === "a" || i.var) && !i.m ? `<input class="var" data-v="${k}" list="varlist" maxlength="40" placeholder="вариант" value="${esc(varOf(id))}" aria-label="Вариант: ${esc(i.n)}">` : ""}
     <span class="ctl"><button type="button" data-k="${k}" data-d="-1" aria-label="Убрать одну">−</button><button type="button" data-k="${k}" data-d="1" aria-label="Добавить одну">+</button><button type="button" data-k="${k}" data-d="x" aria-label="Убрать из заказа">×</button></span></div>`;
        })
        .join("")}</div>`
    : `<div class="empty">Нажми «+» у предмета в таблице, и он появится здесь.</div>`;
  const pr = priceOf(b),
    { mat, labor, price } = pr,
    bench = t.b + b.matBench;
  omanual.placeholder = t.n ? fmt(Math.round(pr.calc)) : "по расчёту";
  document.getElementById("bsum").innerHTML = t.n
    ? `
    <span class="k">Вещей</span><span class="v">${t.n}</span>
    <span class="k">Себестоимость</span><span class="v">${fmt(t.cost)} гр.</span>
    ${b.disc ? `<span class="k">Сырьё заказчика</span><span class="v ok">−${fmt(b.disc)} гр.</span>` : ""}
    ${
      b.offVal
        ? `<span class="k">Не считается (${b.rows
            .filter(r => r.off)
            .map(r => NAME[r.k].toLowerCase())
            .join(", ")})</span><span class="v ok">−${fmt(b.offVal)} гр.</span>`
        : ""
    }
    <span class="k">Материалы</span><span class="v">${fmt(mat)} гр.</span>
    ${pr.manual ? `<span class="k">По расчёту</span><span class="v" style="text-decoration:line-through;color:var(--muted)">${fmt(pr.calc)} гр.</span><span class="k">За работу выходит</span><span class="v ${labor < 0 ? "buy" : ""}">${labor < 0 ? "−" : "+"}${fmt(Math.abs(labor))} гр.</span>` : `<span class="k">Работа ${fmt(P.markup)}% от полной себестоимости</span><span class="v">+${fmt(labor)} гр.</span>`}
    <span class="k">${pr.manual ? "Твоя цена" : "Цена заказчику"}</span><span class="v big" style="color:var(--copper)">${fmt(price)} гр.</span>
    ${O().pay === "pre" ? `<span class="k">Внесено</span><span class="v ok">${fmt(O().paid || 0)} гр.</span><span class="k">Осталось доплатить</span><span class="v buy">${fmt(Math.max(0, price - (O().paid || 0)))} гр.</span>` : ""}
    <span class="k">Верстак</span><span class="v">${fmt(bench)} гр.</span>
    <span class="k">Докупить сырья</span><span class="v">${fmt(b.buyMoney)} гр.</span>
    <span class="k">Из кармана</span><span class="v">${fmt(b.buyMoney + bench)} гр.</span>
    ${b.unpriced.length ? `<span class="k warn" style="grid-column:1/-1">Нет цены: ${b.unpriced.map(k => NAME[k].toLowerCase()).join(", ")}. Впиши её вверху, иначе цена занижена.</span>` : ""}`
    : "";
  document.getElementById("mTot").textContent = fmt(price) + " гр.";
  if (osel.options[cur]) osel.options[cur].textContent = optLabel(O(), t.n);
  if (skip !== "c") renderClientInputs();
  if (skip !== "s") renderStockInputs();
  renderBreakdown(b);
  renderDone(b);
  renderPlan(b);
}
document.getElementById("tiles").addEventListener("input", e => {
  const t = e.target;
  if (!t.classList.contains("var")) return;
  const o = O();
  o.vars = o.vars || {};
  const v = t.value.trim();
  if (v) o.vars[t.dataset.v] = v;
  else delete o.vars[t.dataset.v];
  save();
});
document.getElementById("tiles").addEventListener("change", e => {
  if (e.target.classList.contains("var")) renderVarList();
});
function renderVarList() {
  const s = new Set();
  orders.forEach(o => Object.values(o.vars || {}).forEach(v => s.add(v)));
  journal.forEach(r => r.items.forEach(x => x.v && s.add(x.v)));
  document.getElementById("varlist").innerHTML = [...s]
    .sort()
    .map(v => `<option value="${esc(v)}">`)
    .join("");
}
document.getElementById("tiles").addEventListener("click", e => {
  const b = e.target.closest("button[data-k]");
  if (!b) return;
  const k = b.dataset.k;
  setQty(k, b.dataset.d === "x" ? 0 : (Q()[k] || 0) + +b.dataset.d);
});
const howText = r => {
  const m = MAT[r.k];
  return r.crafts
    ? `${fmt(r.crafts)} × (${Object.entries(m.inp)
        .map(([k, n]) => `${n} ${NAME[k].toLowerCase()}`)
        .join(" + ")}) → ${fmt(r.crafts * m.out)}`
    : "не нужно";
};
function renderBreakdown(b) {
  const has = b.t.n > 0;
  document.getElementById("bd").hidden = !has;
  document.getElementById("rempty").hidden = has;
  const o = O(),
    cl = ALLK.filter(k => o.client[k]);
  document.getElementById("csum").innerHTML = !cl.length
    ? ""
    : `<b>Скидка с его сырья: <span class="ok">${fmt(b.disc)} гр.</span></b><br><span class="hint">Засчитано: ${cl.map(k => `${NAME[k]} ${fmt(o.client[k])} × ${g(cPrice(k))} = ${fmt(o.client[k] * cPrice(k))}`).join("; ")}.</span>` +
      (b.extra.length
        ? `<br><span class="buy">Не пойдёт в заказ (излишек, останется у тебя): ${b.extra.map(([k, v]) => `${NAME[k]} ${fmt(v)}`).join(", ")}.</span>`
        : "");
  if (!has) return;
  const cell = v => `<td class="num">${v ? fmt(v) : "·"}</td>`;
  const bb = breakdown(true),
    realMid = Object.fromEntries(b.mid.map(r => [r.k, r])),
    realRow = Object.fromEntries(b.rows.map(r => [r.k, r]));
  const mids = bb.mid
    .map(r => realMid[r.k] || { k: r.k, need: 0, c: 0, s: 0, make: 0, crafts: 0, d: r.d, full: r.need })
    .map(r => ({ ...r, full: (bb.mid.find(x => x.k === r.k) || {}).need || r.need }));
  document.getElementById("mid").innerHTML = mids.length
    ? mids
        .map(
          r =>
            `<tr><td class="l">${esc(NAME[r.k])}</td>${cell(r.full)}<td class="num ok">${r.c ? fmt(r.c) : "·"}</td>${cell(r.s)}<td class="num"><b>${r.make ? fmt(r.make) : "·"}</b></td><td class="l hint">${r.make ? esc(howText(r)) : r.need ? "хватает" : "не нужно, хватает заготовок выше"}</td></tr>`,
        )
        .join("")
    : `<tr><td class="l hint" colspan="6">Заготовки не нужны.</td></tr>`;
  const raws = bb.rows.map(f => {
    const r = realRow[f.k] || { k: f.k, c: 0, s: 0, buy: 0, money: 0, off: !!off[f.k] };
    return { ...r, all: f.all };
  });
  document.getElementById("raw").innerHTML =
    raws
      .map(
        r =>
          `<tr class="${r.off ? "offrow" : ""}"><td class="l"><button type="button" class="rtog" data-k="${r.k}" aria-pressed="${!r.off}" title="${r.off ? "Нажми, чтобы снова считать" : "Нажми, чтобы не считать"}">${esc(NAME[r.k])}</button></td><td class="num"><b>${fmt(r.all)}</b></td><td class="num ok">${r.c ? fmt(r.c) : "·"}</td>${cell(r.s)}<td class="num ${r.off ? "" : r.buy ? "buy" : "ok"}">${r.off ? "не считается" : r.buy ? fmt(r.buy) : !r.c && !r.s ? "хватает (заготовки на складе)" : "хватает"}</td><td class="num">${r.money ? fmt(r.money) : "·"}</td></tr>`,
      )
      .join("") +
    `<tr><td class="l"><b>Итого докупить</b></td><td colspan="4"></td><td class="num"><b>${fmt(b.buyMoney)}</b></td></tr>`;
}
document.getElementById("raw").addEventListener("click", e => {
  const b = e.target.closest(".rtog");
  if (!b) return;
  const k = b.dataset.k;
  if (off[k]) delete off[k];
  else off[k] = 1;
  save();
  recalc();
  renderOrder();
});

// --- «Заказ выполнен»: списание со склада и отмена
const doneBtn = document.getElementById("odone"),
  doneNote = document.getElementById("odonenote"),
  undoBtn = document.getElementById("oundo");
function renderDone(b) {
  const o = O();
  doneBtn.hidden = !b.t.n;
  doneBtn.disabled = o.done;
  undoBtn.hidden = !(o.done && o.snap);
  if (!doneBtn.dataset.armed)
    doneBtn.textContent = o.done ? "Заказ выполнен ✓" : "Заказ выполнен: списать со склада";
  doneNote.textContent = o.done
    ? o.snap
      ? "Склад списан. Если нажал по ошибке, можно отменить."
      : "Склад по этому заказу уже списан."
    : "Спишет со склада то, что ушло в дело, и добавит излишки: лишнее сырьё заказчика и лишние заготовки после крафта.";
}
undoBtn.addEventListener("click", () => {
  const o = O();
  if (!o.done || !o.snap) return;
  if (!undoBtn.dataset.armed) {
    arm(undoBtn, "Точно вернуть склад?", "Отменить выполнение");
    return;
  }
  disarm(undoBtn, "Отменить выполнение");
  stock = o.snap;
  delete o.snap;
  o.done = false;
  save();
  renderOrderList();
  renderOrder();
});
doneBtn.addEventListener("click", () => {
  if (O().done) return;
  if (!doneBtn.dataset.armed) {
    arm(doneBtn, "Точно? Склад изменится", "Заказ выполнен: списать со склада");
    return;
  }
  disarm(doneBtn, "Заказ выполнен: списать со склада");
  const b = breakdown(),
    add = (k, v) => {
      const n = Math.max(0, (stock[k] || 0) + v);
      if (n) stock[k] = n;
      else delete stock[k];
    };
  O().snap = JSON.parse(JSON.stringify(stock));
  b.mid.forEach(r => add(r.k, -r.s));
  b.rows.forEach(r => add(r.k, -r.s));
  b.extra.forEach(([k, v]) => add(k, v));
  Object.entries(b.surplus).forEach(([k, v]) => {
    if (v > 0) add(k, v);
  });
  O().done = true;
  save();
  renderOrderList();
  renderOrder();
});

// --- План крафта по шагам
const planEl = document.getElementById("plan"),
  planNote = document.getElementById("plannote");
function renderPlan(b) {
  const o = O();
  o.steps = o.steps || {};
  const steps = [];
  [...b.mid]
    .filter(r => r.crafts)
    .sort((x, y) => x.d - y.d)
    .forEach(r => {
      const m = MAT[r.k];
      steps.push([
        "m_" + r.k,
        `${NAME[r.k]}: ${fmt(r.crafts)} раз (${Object.entries(m.inp)
          .map(([k, n]) => `${n} ${NAME[k].toLowerCase()}`)
          .join(" + ")}), выйдет ${fmt(r.crafts * m.out)}`,
      ]);
    });
  sortedIds().forEach(id => {
    const i = BYID[id];
    if (!i.m) steps.push(["i_" + id, `Сделать: ${nameV(id, varOf(id))} × ${Q()[id]}`]);
  });
  const done = steps.filter(([k]) => o.steps[k]).length;
  planEl.innerHTML = steps
    .map(
      ([k, txt]) =>
        `<li class="${o.steps[k] ? "ok-step" : ""}"><label><input type="checkbox" data-st="${esc(k)}" ${o.steps[k] ? "checked" : ""}> ${esc(txt)}</label></li>`,
    )
    .join("");
  planNote.textContent = steps.length ? `Сделано ${done} из ${steps.length}` : "";
}
planEl.addEventListener("change", e => {
  const c = e.target.closest("input[data-st]");
  if (!c) return;
  const o = O();
  if (c.checked) o.steps[c.dataset.st] = 1;
  else delete o.steps[c.dataset.st];
  save();
  renderOrder();
});
document.getElementById("planreset").addEventListener("click", () => {
  O().steps = {};
  save();
  renderOrder();
});

// --- Текст для заказчика
const copyBtn = document.getElementById("copyc"),
  copyTxt = document.getElementById("copytxt"),
  copyNote = document.getElementById("copynote");
function clientText() {
  const b = breakdown(),
    t = b.t;
  if (!t.n) return "";
  const o = O();
  const L = [`Заказ: ${o.name}`];
  sortedIds().forEach(id => L.push(`- ${nameV(id, varOf(id))} × ${Q()[id]}`));
  const pr = priceOf(b),
    matFull = t.cost - b.offVal,
    price = pr.price,
    labor = pr.labor;
  L.push(`Материалы: ${fmt(matFull)} гр.`);
  const cl = ALLK.filter(k => o.client[k]);
  if (o.allc) {
    L.push("Сырьё: всё ваше");
    L.push(`Засчитано за ваше сырьё: −${fmt(b.disc)} гр.`);
  } else if (cl.length) {
    L.push(`Ваше сырьё: ${cl.map(k => `${NAME[k].toLowerCase()} ${fmt(o.client[k])}`).join(", ")}`);
    L.push(`Засчитано за ваше сырьё: −${fmt(b.disc)} гр.`);
  }
  if (!pr.manual) L.push(`Работа: ${fmt(labor)} гр.`);
  L.push(`К оплате: ${fmt(price)} гр.`);
  if (o.pay === "pre" && o.paid) {
    L.push(`Внесено: ${fmt(o.paid)} гр.`);
    L.push(`Осталось: ${fmt(Math.max(0, price - o.paid))} гр.`);
  } else if (o.pay === "yes") L.push("Оплачено.");
  if (o.due) L.push(`Срок: ${dueTxt(o)}`);
  if (sign.trim()) L.push(sign.trim());
  return L.join("\n");
}
copyBtn.addEventListener("click", () => {
  const txt = clientText();
  if (!txt) {
    copyNote.textContent = "Заказ пуст.";
    return;
  }
  copyTxt.value = txt;
  const fallback = () => {
    copyTxt.hidden = false;
    copyTxt.focus();
    copyTxt.select();
    copyNote.textContent = "Скопируй текст вручную (Ctrl+C).";
  };
  try {
    navigator.clipboard.writeText(txt).then(() => {
      copyTxt.hidden = false;
      copyNote.textContent = "Скопировано. Вставляй в письмо или Discord.";
    }, fallback);
  } catch (e) {
    fallback();
  }
});

// ============================================================
// 9. Сохранение / загрузка, журнал, общий рендер
// ============================================================
const dataNote = document.getElementById("datanote");
let dlCap = null;
(async () => {
  try {
    if (window.claude && window.claude.use) dlCap = await window.claude.use("downloads");
  } catch (e) {}
})();
document.getElementById("dsave").addEventListener("click", async () => {
  const data = JSON.stringify(
    { app: "forge-ledger", v: 4, P, stock, orders, cur, off, sign, journal },
    null,
    1,
  );
  const d = new Date(),
    name = `kuznya_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
  if (dlCap) {
    try {
      await dlCap.save({ filename: name, data });
      dataNote.textContent = "Файл сохранён.";
    } catch (e) {
      dataNote.textContent =
        e && e.code === "cancelled" ? "Сохранение отменено." : "Не получилось сохранить файл.";
    }
    return;
  }
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    dataNote.textContent = "Файл сохранён в загрузки.";
  } catch (e) {
    dataNote.textContent = "Не получилось сохранить файл.";
  }
});
document.getElementById("dload").addEventListener("change", async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== "forge-ledger") throw 0;
    if ((j.v | 0) >= 4) {
      P = { ...DEF, ...(j.P || {}) };
      stock = j.stock || {};
      off = j.off || {};
      sign = j.sign || "";
      journal = Array.isArray(j.journal) ? j.journal : [];
      orders = cleanOrders(j.orders);
      cur = Math.max(0, Math.min(j.cur | 0, orders.length - 1));
      dataNote.textContent = `Загружено: заказов ${orders.length}.`;
    } else {
      const { p, st } = fromV3(j);
      P = { ...DEF, ...p };
      stock = st;
      dataNote.textContent = "Загружены цены и склад из старой версии (старые заказы не переносятся).";
    }
    save();
    signEl.value = sign;
    document.querySelectorAll("[data-p]").forEach(i => (i.value = P[i.dataset.p]));
    recalc();
    renderOrderList();
    renderStatus();
    renderAll();
  } catch (err) {
    dataNote.textContent = "Это не файл кузни или он повреждён.";
  }
  e.target.value = "";
});

// --- Журнал продаж
const jbox = document.getElementById("jlist"),
  jsum = document.getElementById("jsum"),
  jtop = document.getElementById("jtop");
document.getElementById("jper").addEventListener("click", e => {
  const bt = e.target.closest("button[data-p]");
  if (!bt) return;
  jper = bt.dataset.p;
  renderJournal();
});
function inPer(r) {
  if (jper === "all") return true;
  const d = new Date(r.date + "T00:00:00"),
    now = new Date();
  now.setHours(0, 0, 0, 0);
  if (jper === "week") {
    const s = new Date(now);
    s.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return d >= s;
  }
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
function renderJournal() {
  document
    .querySelectorAll("#jper button")
    .forEach(bt => bt.setAttribute("aria-pressed", String(bt.dataset.p === jper)));
  const rs = journal.filter(inPer),
    sum = f => rs.reduce((s, r) => s + (r[f] || 0), 0);
  jsum.innerHTML = `<span>Заказов: <b>${rs.length}</b></span><span>Выручка: <b>${fmt(sum("price"))} гр.</b></span><span>Из них за работу: <b>${fmt(sum("labor"))} гр.</b></span><span>Вещей: <b>${fmt(rs.reduce((s, r) => s + r.items.reduce((a, x) => a + x.q, 0), 0))}</b></span>`;
  const top = {};
  rs.forEach(r => r.items.forEach(x => (top[x.n] = (top[x.n] || 0) + x.q)));
  const tl = Object.entries(top)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5);
  jtop.innerHTML = tl.length
    ? `Чаще всего заказывают: ${tl.map(([n, q]) => `${esc(n)} — ${q}`).join(", ")}`
    : "";
  jbox.innerHTML = rs.length
    ? rs
        .map(
          r =>
            `<tr><td class="l num">${r.date.split("-").reverse().join(".")}</td><td class="l">${esc(r.name)}</td><td class="l hint">${r.items.map(x => esc(x.n + (x.v ? ` — ${x.v}` : "") + " × " + x.q)).join(", ")}<input class="jnote" data-j="${r.id}" maxlength="120" placeholder="заметка" value="${esc(r.note || "")}" aria-label="Заметка к заказу"></td><td class="num"><b>${fmt(r.price)}</b></td><td class="num">${fmt(r.labor)}</td><td><button class="btn jdel" type="button" data-j="${r.id}" aria-label="Удалить запись">×</button></td></tr>`,
        )
        .join("")
    : `<tr><td class="l hint" colspan="6">Пока пусто. Запись появляется, когда ставишь у заказа галочку «Отдан заказчику».</td></tr>`;
}
jbox.addEventListener("input", e => {
  const t = e.target;
  if (!t.classList.contains("jnote")) return;
  const r = journal.find(x => x.id === t.dataset.j);
  if (!r) return;
  const v = t.value.trim();
  if (v) r.note = v;
  else delete r.note;
  save();
});
jbox.addEventListener("click", e => {
  const bt = e.target.closest(".jdel");
  if (!bt) return;
  if (!bt.dataset.armed) {
    bt.dataset.armed = "1";
    bt.textContent = "Точно?";
    setTimeout(() => {
      delete bt.dataset.armed;
      bt.textContent = "×";
    }, 3000);
    return;
  }
  journal = journal.filter(r => r.id !== bt.dataset.j);
  orders.forEach(o => {
    if (o.jid === bt.dataset.j) delete o.jid;
  });
  save();
  renderJournal();
});

const foldBtn = document.getElementById("fold"),
  catBody = document.getElementById("catbody");
let folded = false;
try {
  folded = localStorage.getItem("forge-fold") === "1";
} catch (e) {}
function applyFold() {
  catBody.hidden = folded;
  [tabs, cats].forEach(el => (el.hidden = folded));
  foldBtn.textContent = folded ? "Показать чертежи" : "Свернуть чертежи";
  foldBtn.setAttribute("aria-expanded", String(!folded));
}
foldBtn.addEventListener("click", () => {
  folded = !folded;
  try {
    localStorage.setItem("forge-fold", folded ? "1" : "0");
  } catch (e) {}
  applyFold();
});
document.getElementById("q").addEventListener("focus", () => {
  if (folded) {
    folded = false;
    applyFold();
  }
});
applyFold();
function renderAll() {
  renderMkCmp();
  renderJournal();
  renderVarList();
  renderDerived();
  renderCatalogNav();
  renderTable();
  renderOrder();
}
renderOrderList();
renderStatus();
renderAll();
