import json,re,math
exec(open('goods_map.py').read())
R='/home/claude/kcd2-rp-crafting/'
src=open(R+'data.js').read(); head=src[:src.index('=')+1]; D=json.loads(src[src.index('=')+1:src.rstrip().rindex(';')])
w=json.load(open('wiki_parsed.json'))
TR=dict(l.rstrip('\n').split('\t') for l in open('tr/all.tsv') if l.strip())
realm={x['item']:x for x in json.load(open('api/realm.json'))['auction']['items']}
# drop previous merge (idempotent)
OLD={'a','w'}
D['items']=[i for i in D['items'] if i['s'] in OLD]
D['raw']=[r for r in D['raw'] if r[0] in {'fe','co','cuo','ag','nug','au','met','hd','nettle','log','antl','agp','exw','resin','shaft','cgold','enam','jasp','acid','shark','borax','dclaw','wfrag','baxe','stres'}]
for k in list(D['mat']):
    if D['mat'][k].get('src')=='wiki': del D['mat'][k]
D['icons']={k:v for k,v in D['icons'].items() if not k.startswith('g_')}
rawk={r[0] for r in D['raw']}
def key_of(name):
    g=G[name]; k=g[0]
    if k in D['mat'] or k in rawk: return k
    if g[1] is None: return k   # material defined below
    price=0
    if g[2] and g[2] in realm:
        x=realm[g[2]]; price=x['avg'] or x['low'] or 0
    D['raw'].append([k,g[1],price]); rawk.add(k); return k
SECS=[('t','tailoring','Портняжное'),('b','bowyery','Лучное'),('j','jewelling','Ювелирное'),('al','alchemy','Алхимия'),('ck','cooking','Готовка'),('br','brewing','Пивоварение'),('cp','joinery','Столярное')]
# materials (parts); first recipe = main key, alternatives get suffix keys
EXIST={}
for s,cid,_ in SECS:
    seen={}
    for p in w[cid]['parts']:
        base,ru=PARTS[p['n']]
        seen[base]=seen.get(base,0)+1
        k=base if seen[base]==1 else f"{base}{seen[base]}"
        if k in D['mat'] and D['mat'][k].get('src')!='wiki':
            EXIST.setdefault(s,[]).append((k,p['l'])); continue  # existing (leather, pad) keep ours
        inp={key_of(n):q for n,q in p['inp'].items()}
        nm=ru if seen[base]==1 else (ru or D['mat'][base]['n'])+' (из: '+', '.join(D['mat'].get(x,{}).get('n') or next(r[1] for r in D['raw'] if r[0]==x) for x in inp)+')'
        D['mat'][k]={'n':nm,'inp':inp,'out':p['out'],'b':0,'src':'wiki','lvl':p['l'],'sec':s}
def cat_t(n):
    n=n.lower()
    if re.search(r'caparison|bridle|saddle|breeching|chanfron|spurs',n): return 'Конская сбруя'
    if re.search(r'boots|shoes',n): return 'Обувь'
    if re.search(r'gloves|mitts|hand wrap',n): return 'Перчатки'
    if re.search(r'hose|chausses|trousers|leggings|poleyn',n): return 'Ноги'
    if re.search(r'hat|cap\b|hood|coif|bonnet|veil|scarf|wreath|headband|chaperon|headscarf',n): return 'Голова'
    if re.search(r'skin$',n): return 'Кожи'
    if re.search(r'belt|apron',n): return 'Пояса и фартуки'
    return 'Тело'
def cat_b(n):
    n=n.lower()
    if 'arrow' in n: return 'Стрелы'
    if 'bolt' in n: return 'Болты'
    if 'crossbow' in n: return 'Арбалеты'
    if 'bow' in n: return 'Луки'
    return 'Огнестрел и заряды'
KIND={'Beds':'Кровати','Benches':'Скамьи','Camp':'Лагерь','Chests & cupboards':'Сундуки и шкафы','Comfort':'Уют','Food':'Еда','Games':'Игры','Garden & yard':'Сад и двор','Illicit':'Запретное','Ladders':'Лестницы','Lighting':'Освещение','Ornaments':'Украшения','Seats':'Стулья','Shelves':'Полки','Tables':'Столы','Work & trade':'Работа и торговля'}
SIZE={'small':'малый','middling':'средний','large':'большой','very large':'очень большой'}

# game names + icons from in-game screenshots (tailoring)
import base64,io
from PIL import Image, ImageOps, ImageEnhance
def unlock_fix(im):
    # icons of locked recipes are dimmed in game: lift shadows, contrast, colour
    lut=[min(255,int(255*((x/255)**0.7))) for x in range(256)]*3
    return ImageEnhance.Color(ImageOps.autocontrast(im.point(lut),cutoff=0.5)).enhance(1.25)
GAME={}; GICON={}
try:
    U=json.load(open('tess/uniq.json'))
    for l in open('tr/game_tailoring.tsv',encoding='utf8'):
        idx,en,ru=l.rstrip('\n').split('\t'); GAME[('t',en)]=ru
        im=Image.open(f"tess/rows/{U[int(idx)]['k']}_i.png").convert('RGB').resize((72,72),Image.LANCZOS)
        if U[int(idx)].get('locked'): im=unlock_fix(im)
        b=io.BytesIO(); im.save(b,'JPEG',quality=70); GICON[('t',en)]='data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
except FileNotFoundError: pass

# bowyery: game names, damage, icons from in-game screenshots
GST={}; MICON={}
try:
    BM=json.load(open('bow/match.json')); BL=json.load(open('bow/rows.json')); BLK={r['k']:r for r in BL}
    def bicon(k):
        im=Image.open(f"bow/rows/{k}_i.png").convert('RGB').resize((72,72),Image.LANCZOS)
        if BLK[k].get('lock'): im=unlock_fix(im)
        b=io.BytesIO(); im.save(b,'JPEG',quality=70); return 'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
    for l in open('tr/game_bowyery.tsv',encoding='utf8'):
        en,ru,dmg=l.rstrip('\n').split('\t'); GAME[('b',en)]=ru
        if dmg: GST[('b',en)]=[int(dmg),None]
        if en in BM: GICON[('b',en)]=bicon(BM[en][0])
    for mk,src in (('bowstr','bowstr_x3'),('bowstr2','bowstr_x3'),('bowstr3','bowstr_x4'),('haftc','hafts')):
        if src in BM: MICON[mk]=bicon(BM[src][0])
except FileNotFoundError: pass

# alchemy: game names, effects, icons
GFX={}
try:
    AIC=json.load(open('alc/icons.json'))
    def aicon(v):
        im=Image.open(v['f']).convert('RGB').crop(tuple(v['box'])).resize((72,72),Image.LANCZOS)
        im=unlock_fix(im); b=io.BytesIO(); im.save(b,'JPEG',quality=70); return 'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
    for l in open('tr/game_alchemy.tsv',encoding='utf8'):
        en,ru,fx=l.rstrip('\n').split('\t'); GAME[('al',en)]=ru
        if fx: GFX[('al',en)]=fx
        if en in AIC: GICON[('al',en)]=aicon(AIC[en])
    if 'cwater' in AIC: MICON['cwater']=aicon(AIC['cwater'])
except FileNotFoundError: pass
# brewing, cooking, jewelling, joinery: game names, effects, icons (screenshots 6 Nov)
try:
    NIC=json.load(open('new/icons.json'))
    for s,cid in (('br','brewing'),('ck','cooking'),('j','jewelling'),('cp','joinery')):
        PK={p['n'] for p in w[cid]['parts']}
        for l in open(f'tr/game_{cid}.tsv',encoding='utf8'):
            en,ru,fx=l.rstrip('\n').split('\t')
            ic=aicon(NIC[cid][en]) if en in NIC.get(cid,{}) else None
            if en in PK:
                if ic: MICON[PARTS[en][0]]=ic
                continue
            GAME[(s,en)]=ru
            if fx: GFX[(s,en)]=fx
            if ic: GICON[(s,en)]=ic
except FileNotFoundError: pass

# recipes that exist in game but not on the wiki (from screenshots 6 Nov)
exec(open('new/extra_recipes.py').read())
exec(open('new/iconbox.py').read())
G['beeswax']=('wax','Пчелиный воск','good:beeswax')
_ln,_ll,_li,_lf,_lfile=LUTE
D['mat']['lutep']={'n':_ln,'inp':{key_of(n):q for n,q in _li.items()},'out':1,'b':_lf,'src':'wiki','lvl':_ll,'sec':'cp'}
MICON['lutep']=aicon({'f':F+_lfile+'.png','box':iconbox(F+_lfile+'.png')})
EXTRA={'br':[],'cp':[]}
for ru,l,out,inp,f,tag in B:
    EXTRA['br'].append({'s':'br','l':l,'c':'Напитки','n':ru,'en':ru,'note':'есть в игре, нет на вики · плата за верстак не видна на скрине','r':{key_of(n):q for n,q in inp.items()},'b':0,'o':out,'id':'br:'+ru,'_ic':aicon({'f':F+f+'.png','box':iconbox(F+f+'.png')})})
for ru,l,inp,fee,f,cat in J:
    EXTRA['cp'].append({'s':'cp','l':l,'c':cat,'n':ru,'en':ru,'note':'есть в игре, нет на вики'+(' · плата за верстак не видна на скрине' if ru=='Fine lantern' else ''),'r':{key_of(n):q for n,q in inp.items()},'b':fee,'id':'cp:'+ru,'_ic':aicon({'f':F+f+'.png','box':iconbox(F+f+'.png')})})
CATS={}
for s,cid,label in SECS:
    items=[]
    for k,m in D['mat'].items():
        if m.get('sec')==s:
            it0={'s':s,'l':m['lvl'],'c':'Материалы','n':m['n'],'r':{},'b':0,'m':k,'id':f'{s}:{m["n"]}'}
            if k in MICON:
                ic='g_m_'+k; D['icons'][ic]=MICON[k]; it0['ic']=ic
            items.append(it0)
    for k,l in EXIST.get(s,[]):
        items.append({'s':s,'l':l,'c':'Материалы','n':D['mat'][k]['n'],'r':{},'b':0,'m':k,'id':f'{s}:{D["mat"][k]["n"]}'})
    for it in w[cid]['items']:
        ru=GAME.get((s,it['n']),TR[it['n']])
        if s=='t': c=cat_t(it['n'])
        elif s=='b': c=cat_b(it['n'])
        elif s=='cp': c=KIND[it['kind'].split(', ')[0]]
        else: c={'j':'Украшения','al':'Зелья и снадобья','ck':'Еда','br':'Напитки'}[s]
        note=it['n']+(f' · {it["var"]} вар.' if it['var'] else '')+(f' · {SIZE[it["kind"].split(", ")[1]]}' if s=='cp' else '')
        x={'s':s,'l':it['l'],'c':c,'n':ru,'en':it['n'],'note':note,'r':{key_of(n):q for n,q in it['inp'].items()},'b':it['fee'],'id':f'{s}:{ru}'}
        if (s,it['n']) in GST: x['st']=GST[(s,it['n'])]
        if (s,it['n']) in GFX: x['fx']=GFX[(s,it['n'])]
        if (s,it['n']) in GICON:
            ic='g_'+s+'_'+str(len(D['icons'])); D['icons'][ic]=GICON[(s,it['n'])]; x['ic']=ic
        if it['out']>1: x['o']=it['out']
        if it['var']: x['var']=it['var']
        items.append(x)
    for x in EXTRA.get(s,[]):
        x=dict(x); icd=x.pop('_ic'); ic='g_'+s+'_'+str(len(D['icons'])); D['icons'][ic]=icd; x['ic']=ic; items.append(x)
    items.sort(key=lambda i:(i['l'],0 if i['c']=='Материалы' else 1))
    order=['Материалы']+[c for c in dict.fromkeys(i['c'] for i in items) if c!='Материалы']
    CATS[s]=[c for c in order if any(i['c']==c for i in items)]
    D['items']+=items
for s,_,_ in SECS: D['cats'][s]=CATS[s]
D['secs']=[['a','Броня','Рецепты со скринов верстака бронника.'],['w','Оружие','Рецепты со скринов верстака кузнеца.']]+[[s,label,('Рецепты с вики сервера (wiki.kcdroleplay.com), названия и иконки со скринов игры. Оригинальное название под каждой вещью.' if s in ('al','br','ck','j','cp','b') else 'Рецепты с вики сервера (wiki.kcdroleplay.com), названия переведены с английского и могут не совпадать с игрой слово в слово. Оригинальное название под каждой вещью.')] for s,_,label in SECS]
# auction ids for new raws + mats
D['api']={g[2]:g[1] for g in G.values() if g[2] and g[1]}
seen_ids=set()
for i in D['items']:
    if i['id'] in seen_ids and i.get('en'):
        i['n']=i['n']+' ('+i['en']+')'; i['id']=i['s']+':'+i['n']
    seen_ids.add(i['id'])
ids=[i['id'] for i in D['items']]; assert len(ids)==len(set(ids)), [x for x in ids if ids.count(x)>1][:5]
open(R+'data.js','w').write(head+' '+json.dumps(D,ensure_ascii=False,separators=(',',':'))+';\n')
from collections import Counter
print(Counter(i['s'] for i in D['items'])); print('raws',len(D['raw']),'mats',len(D['mat']))
print([ (k,m['n'],m['inp'],m['out']) for k,m in D['mat'].items() if m.get('src')=='wiki'])
