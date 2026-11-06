"""Собирает сайт в один файл (для офлайна или чтобы отправить кому-то):
python tools/build_single.py  ->  dist/kuznya.html"""
import os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(R, p), encoding="utf-8").read()
html = rd("index.html")
html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + rd("style.css") + "</style>")
html = html.replace('<script src="data.js"></script>', "<script>\n" + rd("data.js") + "</script>")
html = html.replace('<script src="app.js"></script>', "<script>\n" + rd("app.js") + "</script>")
os.makedirs(os.path.join(R, "dist"), exist_ok=True)
open(os.path.join(R, "dist", "kuznya.html"), "w", encoding="utf-8").write(html)
print("dist/kuznya.html", len(html) // 1024, "KB")
