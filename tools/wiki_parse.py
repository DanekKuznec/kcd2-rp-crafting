import re,json,html,sys
s=open(sys.argv[1],encoding='utf8').read()
heads=[(m.start(),m.group(1)) for m in re.finditer(r'<h3 id="([a-z]+)"',s)]
txt=lambda x:re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>','',x))).strip()
def parse_inp(needs):
    inp={}
    for p in [x.strip() for x in needs.split(',') if x.strip()]:
        mq=re.match(r'(\d+)\s+(.+)',p); inp[mq.group(2)]=inp.get(mq.group(2),0)+int(mq.group(1))
    return inp
out={}
for k,(pos,cid) in enumerate(heads):
    end=heads[k+1][0] if k+1<len(heads) else len(s); sec=s[pos:end]
    title=txt(sec[sec.index('>')+1:sec.index('</h3>')])
    parts=[]
    m=re.search(r'<p>Its parts:(.*?)</p>',sec,re.S)
    if m:
        for pm in re.finditer(r'<b>(.*?)</b> ×(\d+) from level (\d+) \((.*?)\)',m.group(1),re.S):
            parts.append(dict(n=txt(pm.group(1)),out=int(pm.group(2)),l=int(pm.group(3)),inp=parse_inp(txt(pm.group(4)))))
    items=[];L=None
    for tok in re.finditer(r'<summary>Level (\d+)[^<]*</summary>|<tr>(<td>.*?)</tr>',sec,re.S):
        if tok.group(1): L=int(tok.group(1)); continue
        tds=re.findall(r'<td>(.*?)</td>',tok.group(2),re.S)
        kind=None
        if len(tds)==5 and cid=='joinery': lv=L; kind=txt(tds[1])+', '+txt(tds[2]); tds=[tds[0],tds[3],tds[4],'']
        elif len(tds)==5: lv=int(txt(tds[0])); tds=tds[1:]
        elif len(tds)==4: lv=L
        else: continue
        mk=tds[0]; b=re.search(r'<b>(.*?)</b>',mk,re.S); name=txt(b.group(1))
        rest=txt(mk[b.end():]); outn=1; var=None
        mo=re.search(r'×\s*(\d+)',rest)
        if mo: outn=int(mo.group(1))
        mv=re.search(r'(\d+) variants',rest)
        if mv: var=int(mv.group(1))
        needs=txt(tds[1]); fee=0
        mf=re.search(r'(?:^|\+ )(\d+) gr\.$',needs)
        if mf: fee=int(mf.group(1)); needs=needs[:mf.start()].strip()
        items.append(dict(kind=kind,n=name,l=lv,out=outn,var=var,inp=parse_inp(needs),fee=fee,t=txt(tds[2]),w=txt(tds[3]),rest=rest))
    out[cid]=dict(title=title,parts=parts,items=items)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
for cid,c in out.items(): print(cid,'|',c['title'],'| parts',len(c['parts']),'| items',len(c['items']),'| noLvl',sum(1 for i in c['items'] if i['l'] is None))
