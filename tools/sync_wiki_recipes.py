#!/usr/bin/env python3
"""Conservative sync from official KCDRP wiki. Stable IDs/icons/stats preserved.

Does NOT guess Czech/Russian translations, material prices, or A/W name mappings.
Run from repository root. Requires beautifulsoup4. --apply updates data.js and report.
"""
import argparse, collections, datetime, json, re, urllib.request
from pathlib import Path
from bs4 import BeautifulSoup
from goods_map import G

URL = "https://wiki.kcdroleplay.com/recipes/"
SECS = {"Smithing":"w","Armouring":"a","Tailoring":"t","Bowyery":"b",
        "Jewelling":"j","Alchemy":"al","Cooking":"ck","Brewing":"br","Carpentry":"cp"}
PARTS = {"t","b","j","al","ck","br","cp"}
# Crosswalk for original game parts: verified against existing MAT/raw keys.
EXTRA_GOODS = {
    "Ordinary sword guard":"gcom", "Pig skin":"pig",
    "Coin sword pommel":"pflat", "Straight sword guard":"gstr",
    "Frankfurt steel":"frank", "Toledo steel":"tol",
    "Antler shards":"horn", "hafts":"shaft", "Exotic wood":"exw",
    "Coloured gold":"cgold", "Tincal":"borax", "Dogfish skin":"shark",
    "Sheet steel":"sheet", "Cow skin":"cow", "Eight-sided sword pommel":"poct",
    "Horned sword guard":"guard", "Deer skin":"deer",
    "Decorated sword pommel":"porn", "Pear sword pommel":"ppear",
    "Reinforced sword guard":"gref", "Enamel powder":"enam",
    "Jasper":"jasp", "Acidum chloridum":"acid",
    "pure silver nuggets":"nug", "Broken axe":"baxe", "meteoric iron":"met",
    "Dragon claw":"dclaw", "Rock Pitch":"stres", "Weapon stub":"wfrag",
    "Henry's longsword":"indr",
}
# The wiki added three dye plants. A zero is an *unset price*, not a price claim.
DYES = {"weld":("dye_weld","Weld (красильное растение)"),
        "woad":("dye_woad","Woad (красильное растение)"),
        "madder":("dye_madder","Madder (красильное растение)")}
OLD_PARTS = {"w": {"Scrap metal","Fastening material","Iron","Antler shards","Copper",
    "Straight sword guard","Pear sword pommel","Horned sword guard","Eight-sided sword pommel",
    "Frankfurt steel","Toledo steel","Reinforced sword guard",
    "Decorated sword pommel (Smithing)","Sheet steel"},
    "a":{"Iron (Armouring)"}}
def new_category(sec,name):
    n=norm(name)
    if sec=="a":
        if "gauntlet" in n:return "Кисти"
        if "arm" in n:return "Руки"
        if "chausses" in n or "legs" in n:return "Ноги"
        if "collar" in n or "hood" in n or "bascinet" in n:return "Голова"
        return "Тело"
    if sec=="w":
        if "axe" in n or "battleaxe" in n:return "Топоры"
        if "hammer" in n or "mace" in n:return "Булавы и молоты"
        if "bardiche" in n or "polehammer" in n:return "Древковое"
        return "Мечи"
    if "spurs" in n:return "Конская сбруя"
    if "hose" in n:return "Ноги"
    return "Тело"


def norm(s):
    return re.sub(r"\s+", " ", str(s).replace("’", "'").strip()).casefold()

def parse():
    request = urllib.request.Request(URL, headers={"User-Agent":"KDRP Crafting Sync (reference checker)"})
    with urllib.request.urlopen(request, timeout=45) as f:
        html = f.read().decode("utf8","replace")
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main") or soup.body
    recipes = []
    for table in main.find_all("table"):
        h = table.find_previous("h3")
        if not h: continue
        sec = next((key for title,key in SECS.items() if h.get_text(" ",strip=True).startswith(title)),None)
        if not sec: continue
        heading = table.find_parent("details")
        summary = heading.find("summary") if heading else None
        level = int(re.search(r"Level\s+(\d+)",summary.get_text(" ",strip=True)).group(1)) if summary and re.search(r"Level\s+(\d+)",summary.get_text(" ",strip=True)) else None
        ths = [v.get_text(" ",strip=True) for v in table.find("tr").find_all(["th","td"])]
        for row in table.find_all("tr")[1:]:
            cells = row.find_all("td")
            if len(cells) != len(ths): continue
            fields = dict(zip(ths,cells))
            name_cell = fields.get("Makes") or fields.get("Piece")
            if not name_cell: continue
            b = name_cell.find("b")
            name = (b or name_cell).get_text(" ",strip=True)
            full = name_cell.get_text(" ",strip=True)
            variants = re.search(r"\b(\d+)\s+variants?\b",full)
            qty = re.search(r"×\s*(\d+)\s*$", full)
            out = int(qty.group(1)) if qty else 1
            if not b:
                name = re.sub(r"\s*×\s*\d+\s*$","",name)
                name = re.sub(r"\s*\d+\s+variants?\s*$","",name)
            if "Level" in fields:
                level = int(fields["Level"].get_text(" ",strip=True))
            if level is None: raise ValueError(f"Unknown level for {sec}:{name}")
            needs = fields["Needs"].get_text(" ",strip=True)
            bench = re.search(r"\s+\+\s+(\d+)\s+gr\.?\s*$",needs)
            fee = int(bench.group(1)) if bench else 0
            if bench:needs=needs[:bench.start()].strip()
            ingredients={}
            for part in needs.split(", "):
                if not part:continue
                m = re.fullmatch(r"(\d+)\s+(.+)",part.strip())
                if not m: raise ValueError(f"Unknown ingredient: {sec}:{name}: {part}")
                count,ingredient=int(m.group(1)),m.group(2)
                if ingredient == "wool":
                    # Wiki permits hides as a 1:1 substitute when wool is insufficient.
                    key="hd"
                elif ingredient in DYES:
                    key=DYES[ingredient][0]
                elif ingredient in EXTRA_GOODS:
                    key=EXTRA_GOODS[ingredient]
                elif ingredient not in G:
                    # Never invent an ingredient mapping: hold this recipe for review.
                    key="UNMAPPED_WIKI:" + ingredient
                else:
                    key=G[ingredient][0]
                ingredients[key]=ingredients.get(key,0)+count
            recipes.append({"sec":sec,"en":name,"l":level,"r":ingredients,"b":fee,
                            "o":out,"var":int(variants.group(1)) if variants else 0,
                            "kind":fields.get("Kind").get_text(" ",strip=True) if fields.get("Kind") else ""})
    if len(recipes) != 1276:
        raise ValueError(f"Expected 1276 confirmed wiki table rows, received {len(recipes)}. Stop - source changed.")
    return recipes

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--apply",action="store_true")
    args=ap.parse_args()
    recipes=parse()
    source=Path("data.js").read_text(encoding="utf8")
    start=source.index("=")+1
    end=source.rstrip().rindex(";")
    D=json.loads(source[start:end])
    rawkeys={r[0] for r in D["raw"]}
    if args.apply:
        for k,label in DYES.values():
            if k not in rawkeys:
                D["raw"].append([k,label,0]) # price unknown, user must set
                rawkeys.add(k)
    translations={}
    for line in Path("data/wiki_names_ru.tsv").read_text(encoding="utf8").splitlines():
        chunks=line.split("\t")
        if len(chunks)>=2: translations[norm(chunks[0])]=chunks[1].strip()
    existing={}
    for item in D["items"]:
        for label in (item.get("en"),item.get("n"),item.get("note","").split(" · ")[0]):
            if label:
                arr=existing.setdefault((item["s"],norm(label)),[])
                if not any(v["id"]==item["id"] for v in arr):arr.append(item)
    updated=collections.Counter(); same=collections.Counter(); added=collections.Counter()
    skipped=[]; details=[]; new_items=[]
    wa_signatures={}
    for i in D["items"]:
        if i["s"] not in ("a","w"): continue
        if i.get("m"): continue
        signature=(i["s"],i["l"],i.get("b",0),tuple(sorted(i.get("r",{}).items())))
        wa_signatures.setdefault(signature,[]).append(i["id"])
    wa_missing=collections.defaultdict(list)
    for recipe in recipes:
        sec, en = recipe["sec"], recipe["en"]
        unresolved=[k for k in recipe["r"] if k.startswith("UNMAPPED_WIKI:")]
        if unresolved:
            skipped.append({"craft":sec,"english_name":en,"reason":"ingredient not mapped","ingredients":unresolved})
            continue
        candidates=existing.get((sec,norm(en)),[])
        if not candidates and norm(en) in translations:
            candidates=existing.get((sec,norm(translations[norm(en)])),[])
        # Armour/weapon names are from screenshots; report unmapped signatures.
        if sec in ("a","w"):
            signature=(sec,recipe["l"],recipe["b"],tuple(sorted(recipe["r"].items())))
            if signature not in wa_signatures:
                wa_missing[sec].append(en)
        if len(candidates)!=1:
            signature=(sec,recipe["l"],recipe["b"],tuple(sorted(recipe["r"].items())))
            # Armour and weapons had Russian names from game screenshots. Only
            # genuinely NEW signatures (not existing parts) are appended; their
            # official English names are retained instead of guessed translations.
            is_new_wa = sec in ("w","a") and signature not in wa_signatures and en not in OLD_PARTS[sec]
            if (sec=="t" and not candidates) or is_new_wa:
                newname=en
                if any(i["id"]==f"{sec}:{newname}" for i in D["items"]+new_items):
                    n=2
                    while any(i["id"]==f"{sec}:{en} (рецепт {n})" for i in D["items"]+new_items):
                        n+=1
                    newname=f"{en} (рецепт {n})"
                new={"id":f"{sec}:{newname}","s":sec,"l":recipe["l"],
                     "c":new_category(sec,en),"n":newname,"en":en,
                     "note":"Рецепт с официальной вики KCDRP (27.11.2026)",
                     "r":recipe["r"],"b":recipe["b"]}
                if recipe["o"]!=1:new["o"]=recipe["o"]
                if recipe["var"]:new["var"]=recipe["var"]
                new_items.append(new);added[sec]+=1
            else:
                skipped.append({"craft":sec,"english_name":en,"reason":"no unique mapping to current IDs"})
            continue
        item=candidates[0]
        if sec in ("a","w"):
            # No verified locale alias was found in current data in this case.
            continue
        change={}
        if item.get("m"):
            m=D["mat"].get(item["m"])
            if m is None:raise ValueError("Unknown material "+item["m"])
            for key,val in (("inp",recipe["r"]),("out",recipe["o"]),("b",recipe["b"])):
                if m.get(key)!=val:change["mat."+key]={"old":m.get(key),"new":val}
            if args.apply:
                m.update(inp=recipe["r"],out=recipe["o"],b=recipe["b"])
        else:
            for key,val in (("r",recipe["r"]),("b",recipe["b"])):
                if item.get(key)!=val:change[key]={"old":item.get(key),"new":val}
            if item.get("o",1)!=recipe["o"]:
                change["o"]={"old":item.get("o",1),"new":recipe["o"]}
            if args.apply:
                item["r"]=recipe["r"];item["b"]=recipe["b"]
                if recipe["o"]!=1:item["o"]=recipe["o"]
                else:item.pop("o",None)
        if item["l"]!=recipe["l"]:
            change["l"]={"old":item["l"],"new":recipe["l"]}
        if args.apply:item["l"]=recipe["l"]
        if change:
            updated[sec]+=1
            details.append({"id":item["id"],"en":en,"changes":change})
        else:same[sec]+=1

    if args.apply:
        # Exactly the announced 43 new recipes: 20 smithing, 15 armouring, 8 tailoring.
        if dict(added) != {"w":20,"a":15,"t":8}:
            raise ValueError(f"Unexpected new recipes: {dict(added)}. Stop sync, review source.")
        # Preserve the order of all pre-existing items; only append new entries.
        D["items"].extend(new_items)
    all_ids=[i["id"] for i in D["items"]]
    assert len(all_ids)==len(set(all_ids)), "Duplicate item ID"
    valid=set(x[0] for x in D["raw"])|set(D["mat"])
    for i in D["items"]:
        for key in i.get("r",{}):
            if key not in valid:raise ValueError(f"Unrecognised key {key} in {i['id']}")
    report={"source":URL,"fetched_date":"2026-11-27","wiki_recipes":len(recipes),
            "wiki_counts":dict(collections.Counter(x["sec"] for x in recipes)),
            "original_items":len(json.loads(source[start:end])["items"]),
            "updated":dict(updated),"unchanged":dict(same),"added":dict(added),
            "new_materials_without_prices":[{"key":k,"name":label} for k,label in DYES.values() if k not in {r[0] for r in json.loads(source[start:end])["raw"]}],
            "skipped_count":len(skipped),"skipped":skipped,
            "changes":details}
    Path("data/wiki_sync_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("RESULT",json.dumps({k:v for k,v in report.items() if k not in ("changes","skipped")},ensure_ascii=False))
    print("SKIPPED_SUMMARY",json.dumps({str(k):v for k,v in collections.Counter((x["craft"],x["reason"]) for x in skipped).items()},ensure_ascii=False))
    print("UNMAPPED_MATERIALS",json.dumps(dict(collections.Counter(y for x in skipped for y in x.get("ingredients",[]))),ensure_ascii=False))
    print("SKIPPED_TAILORING",json.dumps([x for x in skipped if x["craft"]=="t"][:50],ensure_ascii=False))
    print("UNMATCHED_SAMPLE",json.dumps(skipped[:20],ensure_ascii=False))
    print("WA_MISSING_SIGNATURES",json.dumps({k:{"count":len(v),"names":v[:90]} for k,v in wa_missing.items()},ensure_ascii=False))
    print("UPDATED_SAMPLE",json.dumps(details[:6],ensure_ascii=False))
    if args.apply:
        Path("data.js").write_text(source[:start]+" "+json.dumps(D,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf8")
        print("APPLIED",len(D["items"]))
if __name__=="__main__":
    main()
