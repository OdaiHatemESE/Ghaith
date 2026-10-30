"""Renders the غيث app icons: the wordmark «غيث» in Reem Kufi Bold on the night background, with the
soft blue-violet glow of the voice orb behind it. Run: python3 assets/brand/mark.py  (Pillow with raqm)."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..')
FONT = os.path.join(HERE, '..', '..', 'node_modules', '@expo-google-fonts', 'reem-kufi', '700Bold', 'ReemKufi_700Bold.ttf')
BG0, BG1 = (16, 24, 42), (7, 11, 20)


def background(size, rounded=True):
    img = Image.new('RGBA', (size, size), BG1 + (255,))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = min(1, ((x - size * 0.2) ** 2 + (y - size * 0.15) ** 2) ** 0.5 / (size * 1.1))
            px[x, y] = tuple(int(BG0[i] + (BG1[i] - BG0[i]) * t) for i in range(3)) + (255,)
    if rounded:
        m = Image.new('L', (size, size), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.23), fill=255)
        img.putalpha(m)
    return img


def glow(size, strength=1.0):
    g = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    for (cx, cy, r, col) in [(0.42, 0.55, 0.30, (91, 124, 255)), (0.6, 0.48, 0.26, (154, 107, 255)), (0.5, 0.62, 0.2, (79, 211, 255))]:
        a = int(150 * strength)
        d.ellipse([(cx - r) * size, (cy - r) * size, (cx + r) * size, (cy + r) * size], fill=col + (a,))
    return g.filter(ImageFilter.GaussianBlur(size * 0.12))


def word(size, color=(242, 245, 251, 255), scale=0.46):
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    font = ImageFont.truetype(FONT, int(size * scale), layout_engine=ImageFont.Layout.RAQM)
    d = ImageDraw.Draw(layer)
    box = d.textbbox((0, 0), 'غيث', font=font, direction='rtl', language='ar')
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1] - size * 0.02), 'غيث', font=font, fill=color, direction='rtl', language='ar')
    return layer


def icon(size, rounded=True, bg=True, mono=None, scale=0.46, glow_strength=1.0, text=True):
    S = size * 2
    img = background(S, rounded) if bg else Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if bg and glow_strength:
        img = Image.alpha_composite(img, glow(S, glow_strength))
        if rounded:
            m = Image.new('L', (S, S), 0)
            ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.23), fill=255)
            img.putalpha(m)
    if text:
        img = Image.alpha_composite(img, word(S, mono or (242, 245, 251, 255), scale))
    return img.resize((size, size), Image.LANCZOS)


icon(1024).save(os.path.join(OUT, 'icon.png'))
icon(48, scale=0.5).save(os.path.join(OUT, 'favicon.png'))
icon(1024, rounded=False, bg=False, scale=0.34).save(os.path.join(OUT, 'android-icon-foreground.png'))
icon(1024, rounded=False, bg=False, scale=0.34, mono=(255, 255, 255, 255)).save(os.path.join(OUT, 'android-icon-monochrome.png'))
icon(1024, rounded=False, bg=True, glow_strength=1.0, text=False).save(os.path.join(OUT, 'android-icon-background.png'))
icon(512, rounded=False, bg=False, scale=0.5).save(os.path.join(OUT, 'splash-icon.png'))
icon(96, rounded=False, bg=False, scale=0.62, mono=(255, 255, 255, 255)).save(os.path.join(OUT, 'notification-icon.png'))
print('ok')
