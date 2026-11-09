create extension if not exists pg_net;
create table if not exists private.settings (faction text primary key references public.factions on delete cascade, discord_webhook text);
create table if not exists private.res_names (res text primary key, name text not null);
insert into private.res_names(res,name) values ('fe','Железная руда'),('co','Уголь'),('cuo','Медная руда'),('ag','Серебряная руда'),('nug','Самородки чистого серебра'),('au','Золотая руда'),('met','Метеоритное железо'),('hd','Шкуры'),('nettle','Крапива'),('log','Брёвна'),('antl','Рога'),('agp','Чистое серебро'),('exw','Экзотическая древесина'),('resin','Сосновая смола'),('shaft','Древки'),('cgold','Цветное золото'),('enam','Порошок эмали'),('jasp','Яшма'),('acid','Acidum chloridum'),('shark','Кожа акулы'),('borax','Бура'),('dclaw','Драконий коготь'),('wfrag','Обломок оружия'),('baxe','Сломанный топор'),('stres','Каменная смола'),('harepelt','Заячья шкурка'),('pelt','Волчьи шкуры'),('hemp','Пеньковое волокно'),('flax','Лён'),('chamom','Ромашка'),('honey','Мёд'),('barley','Ячмень'),('hops','Хмель'),('sage','Шалфей'),('plum','Сливы'),('grape','Виноград'),('heartw','Дубовая сердцевина'),('amber','Янтарь'),('wax','Пчелиный воск'),('feather','Совиные перья'),('pearl','Речной жемчуг'),('wwpelt','Шкуры белого волка'),('sulph','Сера'),('nitre','Селитра'),('tusk','Кабаньи клыки'),('yew','Заготовки древнего тиса'),('rantl','Королевские рога'),('crystal','Горный хрусталь'),('mint','Мята'),('wormw','Полынь'),('thistle','Чертополох'),('dandel','Одуванчик'),('charc','Древесный уголь'),('bella','Белладонна'),('valer','Валериана'),('hyper','Зверобой'),('eyebr','Очанка'),('poppy','Опийный мак'),('ginger','Имбирь'),('marig','Календула'),('comfrey','Окопник'),('leach','Выщелоченный уголь'),('cobweb','Паутина'),('feverf','Пиретрум'),('elder','Листья бузины'),('mandr','Корень мандрагоры'),('oldmandr','Древняя мандрагора'),('apple','Яблоко'),('boletus','Белый гриб'),('lepiota','Зонтик (гриб)'),('pear','Груша'),('beet','Свёкла'),('carrot','Морковь'),('egg','Яйцо'),('roach','Плотва'),('onion','Лук'),('cabbage','Капуста'),('hare','Зайчатина'),('garlic','Чеснок'),('pork','Свинина'),('milk','Молоко'),('horser','Хрен'),('chicken','Курица'),('mutton','Баранина'),('venison','Оленина'),('beef','Говядина'),('carp','Карп'),('eel','Угорь'),('salami','Салями (продукт)'),('wolfmt','Волчатина'),('boar','Кабанятина'),('cheese','Сыр (продукт)'),('pike','Щука'),('porkten','Свиная вырезка'),('sheepst','Бараний желудок'),('beeften','Говяжья вырезка'),('beefkid','Говяжьи почки'),('wolfhrt','Волчье сердце'),('beeftng','Говяжий язык'),('porkliv','Свиная печень'),('aseed','Древние семена'),('hay','Сено'),('leather','Кожа'),('pad','Набивка'),('iron','Железо'),('scrap','Железный лом'),('fast','Крепёж'),('horn','Оленьи рога'),('cu','Медь'),('steel','Сталь (бруски)'),('frank','Франкфуртская сталь'),('tol','Толедская сталь'),('sheet','Листовая сталь'),('gcom','Обычная гарда'),('gstr','Прямая гарда'),('guard','Гарда'),('gref','Укреплённая гарда'),('pflat','Плоское навершие меча'),('poct','Восьмигранное навершие меча'),('ppear','Грушевидное навершие меча'),('porn','Украшенное навершие меча'),('indr','Длинный меч Индржиха'),('cow','Коровья шкура'),('deer','Оленья шкура'),('pig','Свиная кожа'),('leather2','Кожа (из: Заячья шкурка)'),('leather3','Кожа (из: Волчьи шкуры)'),('pad2','Набивка (из: Пеньковое волокно, Кожа)'),('linen','Льняное полотно'),('pad3','Набивка (из: Льняное полотно, Кожа)'),('lstrip','Льняные полосы'),('lstrip2','Льняные полосы (из: Крапива)'),('suture','Набор для швов'),('noose','Верёвка повешенного'),('bowstr','Тетивы'),('bowstr2','Тетивы (из: Пеньковое волокно, Сосновая смола)'),('bowstr3','Тетивы (из: Льняное полотно, Сосновая смола)'),('haftc','Древки (лучные)'),('agpc','Чистое серебро (ювелирное)'),('mcoin','Памятные монеты'),('poult','Окопниковая припарка'),('cwater','Угольная вода'),('malt','Ячменный солод'),('lutep','Лютни (деталь)') on conflict (res) do update set name=excluded.name;
create or replace function public.set_discord_webhook(f text, url text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'нет прав'; end if;
  if url is not null and url <> '' and url !~ '^https://(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_\-]+$' then
    raise exception 'это не адрес вебхука Discord';
  end if;
  insert into private.settings(faction, discord_webhook) values (f, nullif(url, ''))
    on conflict (faction) do update set discord_webhook = excluded.discord_webhook;
end $$;
create or replace function public.has_discord_webhook(f text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from private.settings where faction = f and discord_webhook is not null)
$$;
revoke execute on function public.set_discord_webhook(text, text) from public, anon;
revoke execute on function public.has_discord_webhook(text) from public, anon;
grant execute on function public.set_discord_webhook(text, text), public.has_discord_webhook(text) to authenticated;

create or replace function private.dpost(f text, msg text) returns void
  language plpgsql security definer set search_path = public as $$
declare u text;
begin
  select discord_webhook into u from private.settings where faction = f;
  if u is null or msg is null or msg = '' then return; end if;
  perform net.http_post(url := u,
    body := jsonb_build_object('content', left(msg, 1990), 'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)),
    headers := '{"Content-Type":"application/json"}'::jsonb);
exception when others then null;
end $$;
create or replace function private.who(f text, u uuid) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(rp_name, ''), nullif(name, '')) from public.members where user_id = u and faction = f), 'кто-то')
$$;
create or replace function private.rn(r text) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select name from private.res_names where res = r), r)
$$;
create or replace function private.items_txt(items jsonb, vars jsonb) returns text
  language sql stable security definer set search_path = public as $$
  select string_agg(split_part(k, ':', 2) || coalesce(' (' || nullif(vars ->> k, '') || ')', '') || ' ×' || v, ', ')
  from jsonb_each_text(coalesce(items, '{}'::jsonb)) as t(k, v)
$$;

-- склад: одна запись (блок) - одно сообщение
create or replace function private.moves_discord() returns trigger
  language plpgsql security definer set search_path = public as $$
declare g record;
begin
  for g in
    select faction, min(user_id::text)::uuid as u, max(note) as note,
      string_agg(case when qty > 0 then qty || ' ' || private.rn(res) end, ', ' order by id) as ins,
      string_agg(case when qty < 0 then (-qty) || ' ' || private.rn(res) end, ', ' order by id) as outs
    from nt group by faction, coalesce(batch, id::text)
  loop
    perform private.dpost(g.faction, '**Склад** · ' || private.who(g.faction, g.u)
      || coalesce(E'\nПоложил: ' || g.ins, '') || coalesce(E'\nВзял: ' || g.outs, '')
      || coalesce(E'\n_' || nullif(g.note, '') || '_', ''));
  end loop;
  return null;
end $$;
drop trigger if exists moves_discord on public.moves;
create trigger moves_discord after insert on public.moves referencing new table as nt
  for each statement execute function private.moves_discord();

-- заказы фракции: новый, взят, отказ, удалён
create or replace function private.gorders_discord() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform private.dpost(new.faction, '**Новый заказ фракции** «' || new.name || '» · от ' || private.who(new.faction, new.created_by)
      || coalesce(E'\n' || private.items_txt(new.items, new.vars), '')
      || coalesce(E'\nДля: ' || nullif(new.note, ''), '')
      || case new.src when 'mine' then E'\nЗаказ мастера' when 'cex' then E'\nЗаказ цеха' else '' end);
  elsif tg_op = 'UPDATE' then
    if old.taken_by is null and new.taken_by is not null then
      perform private.dpost(new.faction, private.who(new.faction, new.taken_by) || ' взял заказ «' || new.name || '»');
    elsif old.taken_by is not null and new.taken_by is null then
      perform private.dpost(new.faction, private.who(new.faction, old.taken_by) || ' отказался от заказа «' || new.name || '», он снова ждёт мастера');
    end if;
  elsif tg_op = 'DELETE' then
    if old.status <> 'done' then
      perform private.dpost(old.faction, 'Заказ «' || old.name || '» удалён' || coalesce(' · ' || private.who(old.faction, auth.uid()), ''));
    end if;
    return old;
  end if;
  return new;
end $$;
drop trigger if exists gorders_discord on public.gorders;
create trigger gorders_discord after insert or update or delete on public.gorders
  for each row execute function private.gorders_discord();

-- выполненный заказ
create or replace function private.fjournal_discord() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform private.dpost(new.faction, '**Выполнен заказ** «' || new.name || '» · ' || private.who(new.faction, new.created_by)
    || coalesce(E'\nДля: ' || nullif(new.note, ''), '')
    || coalesce(E'\n' || (select string_agg((i ->> 'n') || ' ×' || (i ->> 'q'), ', ') from jsonb_array_elements(new.items) i), '')
    || E'\nЦена: ' || new.price || ' гр.'
    || case when new.src is not null then ' · мастеру ' || new.master || ' · в казну ' || new.treasury else '' end);
  return new;
end $$;
drop trigger if exists fjournal_discord on public.fjournal;
create trigger fjournal_discord after insert on public.fjournal
  for each row execute function private.fjournal_discord();
