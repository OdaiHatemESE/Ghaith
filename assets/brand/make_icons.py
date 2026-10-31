from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage
# Run from assets/brand: python3 make_icons.py (writes the PNGs next to it; copy them to assets/)
A=''
# ---- clean mark
m=Image.open('source-mark.png').convert('RGBA')
a=np.asarray(m).copy()
al=a[...,3].astype(float)
keep=al>40
lab,n=ndimage.label(keep); sizes=ndimage.sum(keep,lab,range(1,n+1))
big=np.isin(lab,[i+1 for i,s in enumerate(sizes) if s>2000])
region=ndimage.binary_dilation(big,iterations=4)
al[~region]=0
al[al<24]=0
al=np.where(al>=235,255,al)
a[...,3]=al.astype(np.uint8)
mark=Image.fromarray(a,'RGBA'); mark=mark.crop(mark.getbbox())
print('mark',mark.size)
mark.save('mark.png')

def fit(img,box):
    w,h=img.size; s=box/max(w,h); return img.resize((round(w*s),round(h*s)),Image.LANCZOS)
def center(canvas,img,dy=0):
    canvas.alpha_composite(img,((canvas.width-img.width)//2,(canvas.height-img.height)//2+dy))

# ---- background like the supplied tile: deep navy with cyan glow top-left and violet bottom-right
S=1024
y,x=np.mgrid[0:S,0:S]/S
base=np.array([6,8,58],float)
def glow(cx,cy,r,col,k):
    d=np.sqrt((x-cx)**2+(y-cy)**2)/r; w=np.clip(1-d,0,1)**2*k; return w[...,None]*np.array(col,float)
img=base+glow(0.0,0.0,0.85,[0,110,190],0.75)+glow(1.0,1.0,0.9,[120,10,230],0.85)+glow(0.5,0.55,0.6,[20,30,140],0.35)
img=np.clip(img,0,255).astype(np.uint8)
bg=Image.fromarray(img,'RGB').convert('RGBA')
bg.save('bg.png')

# icon.png (full bleed, OS rounds it)
ic=bg.copy(); center(ic,fit(mark,int(S*0.74)),dy=8); ic.convert('RGB').save('icon.png')
# adaptive
bg.convert('RGB').save('android-icon-background.png')
fg=Image.new('RGBA',(S,S),(0,0,0,0)); center(fg,fit(mark,int(S*0.58)),dy=6); fg.save('android-icon-foreground.png')
mono=Image.new('RGBA',(S,S),(0,0,0,0)); mm=fit(mark,int(S*0.58)); w=Image.new('RGBA',mm.size,(255,255,255,255)); w.putalpha(mm.getchannel('A')); center(mono,w,dy=6); mono.save('android-icon-monochrome.png')
# notification (white silhouette, 96)
notif=Image.new('RGBA',(96,96),(0,0,0,0)); nm=fit(mark,84); w=Image.new('RGBA',nm.size,(255,255,255,255)); w.putalpha(nm.getchannel('A').point(lambda v:255 if v>90 else 0)); center(notif,w); notif.save('notification-icon.png')
# splash: the mark alone (on the light background set in app.json)
sp=Image.new('RGBA',(1024,1024),(0,0,0,0)); center(sp,fit(mark,900)); sp.save('splash-icon.png')
# in-app logo
fit(mark,512).save('logo.png')
# favicon: supplied rounded tile, outside made transparent
t=Image.open('source-app-icon.png').convert('RGB').crop((296,33,1240,983))
ta=np.asarray(t).astype(int)
dist=(255-ta).max(axis=2)
alpha=np.clip((dist-6)*12,0,255).astype(np.uint8)
lab,n=ndimage.label(dist<10); edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
outside=np.isin(lab,list(edge))
alpha=np.where(outside,0,255).astype(np.uint8)
alpha=np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.2)))
tile=t.convert('RGBA'); tile.putalpha(Image.fromarray(alpha)); tile=tile.resize((944,944),Image.LANCZOS)
tile.save('tile.png'); tile.resize((196,196),Image.LANCZOS).save('favicon.png')
# preview sheet
pv=Image.new('RGBA',(1500,560),(238,240,250,255))
pv.alpha_composite(ic.resize((400,400)),(40,80))
r=Image.new('L',(400,400),0)
from PIL import ImageDraw
ImageDraw.Draw(r).ellipse((0,0,399,399),fill=255)
ad=bg.copy(); ad.alpha_composite(fg); ad=ad.resize((400,400)); ad.putalpha(r); pv.alpha_composite(ad,(480,80))
pv.alpha_composite(tile.resize((400,400)),(920,80))
nb=Image.new('RGBA',(96,96),(27,31,107,255)); nb.alpha_composite(notif); pv.alpha_composite(nb.resize((96,96)),(1360,80))
pv.convert('RGB').save('preview.png')
