# Находит рамку иконки на скрине (по левой красноватой кромке) и даёт рамку для вырезки.
from PIL import Image
def iconbox(f):
    im=Image.open(f).convert('RGB'); px=im.load(); W=im.size[0]
    x0=32 if W==763 else 30
    isf=lambda p: p[0]>80 and p[0]-p[1]>30 and p[0]-p[2]>35
    ys=[y for y in range(10,200) if isf(px[x0,y]) or isf(px[x0+1,y])]
    best=(0,0); s=None
    for i,y in enumerate(ys):
        if s is None or y!=ys[i-1]+1: s=y
        if y-s>best[1]-best[0]: best=(s,y)
    top=best[0] if 70<=best[1]-best[0]<=90 else (42 if W==763 else 30)
    return [x0+3,top+3,x0+76,top+76]
