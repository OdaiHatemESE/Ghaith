"""Renders the غيث app icons from the same geometry as src/components/Logo.tsx (a 100x100 viewBox).
Run: python3 assets/brand/mark.py  (needs Pillow)."""
import math, os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..')
S = 4  # supersampling

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def gradient(size, c0, c1, angle=(1, 1)):
    w, h = size
    img = Image.new('RGB', size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = ((x / w) * angle[0] + (y / h) * angle[1]) / (angle[0] + angle[1])
            px[x, y] = lerp(c0, c1, t)
    return img

def drop_points(scale, ox=0, oy=0):
    # Teardrop: tip at (50,30), round bottom centred (50,67) r=22 — sampled as a polygon
    pts = []
    def cubic(p0, p1, p2, p3, n=60):
        for i in range(n + 1):
            t = i / n
            x = (1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t**2*p2[0] + t**3*p3[0]
            y = (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t**2*p2[1] + t**3*p3[1]
            pts.append((ox + x * scale, oy + y * scale))
    cubic((50, 30), (50, 30), (72, 54), (72, 67))
    cubic((72, 67), (72, 79.2), (62.2, 88), (50, 88))
    cubic((50, 88), (37.8, 88), (28, 79.2), (28, 67))
    cubic((28, 67), (28, 54), (50, 30), (50, 30))
    return pts

def mark(size, tile=True, mono=None, pad=0.0):
    """pad: fraction of the canvas left empty around the 100-unit mark (adaptive icons need a safe zone)"""
    W = size * S
    inner = W * (1 - 2 * pad)
    k = inner / 100
    o = W * pad
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    if tile:
        bg = gradient((W, W), hexrgb('#1C3561'), hexrgb('#0A1424')).convert('RGBA')
        m = Image.new('L', (W, W), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, W - 1, W - 1], radius=int(26 * W / 100), fill=255)
        img.paste(bg, (0, 0), m)
    # drop
    dm = Image.new('L', (W, W), 0)
    ImageDraw.Draw(dm).polygon(drop_points(k, o, o), fill=255)
    if mono:
        fill = Image.new('RGBA', (W, W), mono)
    else:
        fill = gradient((W, W), hexrgb('#A9DBFF'), hexrgb('#3D8BFF'), (0.6, 1)).convert('RGBA')
    img.paste(fill, (0, 0), dm)
    d = ImageDraw.Draw(img)
    # highlight stroke
    if not mono:
        hl = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        hd = ImageDraw.Draw(hl)
        arc = []
        for i in range(30):
            t = i / 29
            x = (1-t)**3*40 + 3*(1-t)**2*t*40 + 3*(1-t)*t**2*44 + t**3*49
            y = (1-t)**3*70 + 3*(1-t)**2*t*76 + 3*(1-t)*t**2*80 + t**3*81
            arc.append((o + x * k, o + y * k))
        hd.line(arc, fill=(255, 255, 255, 140), width=int(4 * k), joint='curve')
        r = 2 * k
        for p in (arc[0], arc[-1]):
            hd.ellipse([p[0]-r, p[1]-r, p[0]+r, p[1]+r], fill=(255, 255, 255, 140))
        img = Image.alpha_composite(img, hl)
        d = ImageDraw.Draw(img)
    # the dot of غ
    cx, cy, r = o + 50 * k, o + 15 * k, 6.5 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=mono or hexrgb('#A9DBFF') + (255,))
    return img.resize((size, size), Image.LANCZOS)

mark(1024).save(os.path.join(OUT, 'icon.png'))
mark(48).save(os.path.join(OUT, 'favicon.png'))
mark(1024, tile=False, pad=0.2).save(os.path.join(OUT, 'android-icon-foreground.png'))
mark(1024, tile=False, pad=0.2, mono=(255, 255, 255, 255)).save(os.path.join(OUT, 'android-icon-monochrome.png'))
mark(512, tile=False, pad=0.04).save(os.path.join(OUT, 'splash-icon.png'))
mark(96, tile=False, pad=0.06, mono=(255, 255, 255, 255)).save(os.path.join(OUT, 'notification-icon.png'))
print('ok')
