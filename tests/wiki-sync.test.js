const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("data.js","utf8"),context,{timeout:15000});
const D=context.window.FORGE_DATA;
const report=JSON.parse(fs.readFileSync("data/wiki_sync_report.json","utf8"));
test("все 43 подтверждённые новинки 27 ноября присутствуют", () => {
  assert.equal(D.items.length, 1331);
  assert.equal(D.items.filter(i => i.note && i.note.includes("27.11.2026")).length,43);
  assert.deepEqual({...report.added},{a:15,w:20,t:8});
});
test("сохранены все старые идентификаторы без дублей", () => {
  const ids=D.items.map(i=>i.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(report.original_items,1288);
});
test("три добавленных красителя без придуманных цен", () => {
  for(const key of ["dye_weld","dye_woad","dye_madder"]){
    const raw=D.raw.find(r=>r[0]===key);
    assert.ok(raw,"не найден "+key);
    assert.equal(raw[2],0,"без подтверждённой цены нельзя назначать стоимость");
  }
});
test("рецепты не ссылаются на отсутствующие материалы",()=>{
  const known=new Set([...D.raw.map(r=>r[0]),...Object.keys(D.mat)]);
  for(const item of D.items)for(const [key,qty] of Object.entries(item.r||{})){
    assert.ok(known.has(key),item.id+" -> "+key);
    assert.ok(Number.isFinite(qty) && qty>0,item.id+" quantity "+key);
  }
});
test("для новых рецептов есть уровень, категория и уникальное имя",()=>{
  for(const item of D.items.filter(i=>i.note&&i.note.includes("27.11.2026"))){
    assert.ok(item.l>=1&&item.l<=10,item.id+" level");
    assert.ok(D.cats[item.s].includes(item.c),item.id+" category "+item.c);
    assert.ok(item.en,item.id+" official name");
    assert.ok(Number.isFinite(item.b)&&item.b>=0,item.id+" fee");
  }
});
test("основная страница запрашивает обновлённые данные",()=>{
  const html=fs.readFileSync("index.html","utf8");
  assert.match(html,/data\.js\?v=20261127a/);
});
