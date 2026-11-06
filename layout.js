// Раскладка: вкладки разделов, выпадающие фильтры, сворачивание цен.
// Логика расчётов вся в app.js, здесь только интерфейс.
(() => {
  const $ = s => document.querySelector(s),
    $$ = s => [...document.querySelectorAll(s)];
  const store = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) {}
  };

  // --- вкладки: Рецепты / Расчёт / Журнал / Данные ---
  function setView(v) {
    $$(".views button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === v)));
    $$(".view").forEach(s => (s.hidden = s.dataset.v !== v));
    $("#toolrow").hidden = v !== "book";
    $("#left").scrollTop = 0;
    store("forge-view", v);
  }
  $(".views").addEventListener("click", e => {
    const b = e.target.closest("button[data-view]");
    if (b) setView(b.dataset.view);
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-goview]");
    if (b) setView(b.dataset.goview);
  });
  setView(store("forge-view") || "book");

  // --- выпадающие меню ---
  const closeAll = except =>
    $$(".dd").forEach(d => {
      if (d === except) return;
      d.querySelector(".ddp").hidden = true;
      d.querySelector(".ddb").setAttribute("aria-expanded", "false");
    });
  $$(".dd").forEach(d => {
    const btn = d.querySelector(".ddb"),
      pop = d.querySelector(".ddp");
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const open = pop.hidden;
      closeAll(d);
      pop.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
    pop.addEventListener("click", e => {
      e.stopPropagation();
      if (e.target.closest(".tab")) setTimeout(() => closeAll(), 0);
    });
  });
  document.addEventListener("click", () => closeAll());
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAll();
  });

  // подпись на кнопке = выбранный пункт
  function syncLabel(ddId, boxId, fallback) {
    const dd = $("#" + ddId),
      box = $("#" + boxId),
      lab = dd.querySelector(".ddv");
    const upd = () => {
      const p = box.querySelector('.tab[aria-pressed="true"]');
      let t = p ? p.textContent.trim() : fallback;
      if (t === "Все виды") t = "все";
      lab.textContent = t;
      dd.hidden = box.hidden || !box.querySelector(".tab");
    };
    new MutationObserver(upd).observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed", "hidden"] });
    upd();
  }
  syncLabel("ddcats", "cats", "все");
  syncLabel("ddsort", "dsort", "как на верстаке");

  // --- сворачивание блока цен ---
  const tog = $("#ptog"),
    pbody = $("#pbody"),
    pp = $("#pricep");
  function setPrices(open) {
    tog.setAttribute("aria-expanded", String(open));
    pbody.hidden = !open;
    pp.classList.toggle("closed", !open);
    store("forge-prices-open", open ? "1" : "0");
  }
  tog.addEventListener("click", () => setPrices(tog.getAttribute("aria-expanded") !== "true"));
  setPrices(store("forge-prices-open") !== "0");

  // подсказка не должна висеть при прокрутке внутренних колонок
  document.addEventListener(
    "scroll",
    () => {
      const t = $("#dtip");
      if (t) t.hidden = true;
    },
    { capture: true, passive: true },
  );
})();
