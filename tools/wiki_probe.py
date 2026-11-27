import urllib.request, re
from bs4 import BeautifulSoup
URL='https://wiki.kcdroleplay.com/recipes/'
try:
 req=urllib.request.Request(URL,headers={'User-Agent':'KDRP-Crafting-Recipe-Audit/1.0'})
 with urllib.request.urlopen(req,timeout=30) as r:
  html=r.read().decode('utf8','replace'); print('HTTP',r.status,'HTML_LENGTH',len(html))
except Exception as e:
 print('FETCH_FAILED',type(e).__name__,str(e));raise
soup=BeautifulSoup(html,'html.parser')
main=soup.find('main') or soup.body
print('PAGE_TITLE',soup.title.get_text(' ',strip=True) if soup.title else None)
headings=main.find_all(re.compile('^h[1-6]$'))
for h in headings[:45]:
 print('HEADING',h.name,repr(h.get_text(' ',strip=True)[:130]))
tables=main.find_all('table')
print('TABLES',len(tables))
for tab in tables[:7]:
 near=tab.find_previous(re.compile('^h[1-6]$'))
 rows=tab.find_all('tr')
 print('TABLE',near.get_text(' ',strip=True)[:65] if near else '-',len(rows))
 for tr in rows[:3]:
  print('ROW',repr([x.get_text(' ',strip=True) for x in tr.find_all(['th','td'])]))
print('NEXT_TEXT',main.get_text(' ',strip=True)[:700])

import json, collections
for t in tables[:12]:
 print('TABLE_HTML',str(t)[:800].replace('\\n',' '))
 print('SUMMARY', [x.get_text(' ',strip=True) for x in list(t.parents)[:5] if x.name=='details'])
 near=t.find_previous(['h3','summary'])
 print('PREV',near.name if near else '-',near.get_text(' ',strip=True)[:125] if near else '-')
for heading in main.find_all('h3'):
 if 'pieces' not in heading.get_text():continue
 t=heading.find_next('table')
 print('CRAFT_SAMPLE',heading.get_text(' ',strip=True),[v.get_text(' ',strip=True) for v in t.find_all('tr')[1].find_all('td')])
src=open('data.js',encoding='utf8').read()
try:
 D=json.loads(src[src.index('=')+1:src.rstrip().rindex(';')])
 print('DATA_ITEMS',len(D['items']),'DATA_CRAFTS',collections.Counter(i['s'] for i in D['items']))
 print('DATA_MATERIALS',len(D['mat']),'DATA_RAWS',len(D['raw']))
 for sec in ['a','w','t','b','j','al','ck','br','cp']:
  x=[i for i in D['items'] if i['s']==sec]
  print('DATA_SAMPLE',sec,[(i['id'],i.get('en'),i.get('r'),i.get('m'),i.get('b'),i.get('o')) for i in x[:4]])
except Exception as e:
 print('DATA_PARSE_ERROR',repr(e))

from collections import Counter
print('TABLE_HEADERS',Counter(tuple(x.get_text(' ',strip=True) for x in t.find('tr').find_all(['th','td'])) for t in tables))
for h in main.find_all('h3'):
 if 'pieces' not in h.get_text():continue
 all_tables=[]
 for el in h.next_elements:
  if getattr(el,'name',None)=='h3':break
  if getattr(el,'name',None)=='table':all_tables.append(el)
 print('CRAFT_SUM',h.get_text(' ',strip=True),'TABLES',len(all_tables),'ROWS',sum(len(t.find_all('tr'))-1 for t in all_tables))
