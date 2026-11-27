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
