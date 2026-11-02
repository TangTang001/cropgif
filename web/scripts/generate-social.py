"""Regenerate the committed site images with Pillow (development only)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1] / 'public'
blue, ink, muted = '#2563eb', '#25282d', '#69717d'


def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf', size)


def icon(size):
    im = Image.new('RGB', (size, size), 'white')
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=size * .23, fill=blue)
    def points(values):
        return [(int(x * size / 64), int(y * size / 64)) for x, y in values]
    d.line(points([(20, 12), (20, 44), (52, 44)]), fill='white', width=max(2, round(size * 5 / 64)), joint='curve')
    d.line(points([(12, 20), (44, 20), (44, 52)]), fill='white', width=max(2, round(size * 5 / 64)), joint='curve')
    return im


icon(180).save(root / 'apple-touch-icon.png')
icon(64).resize((32, 32), Image.Resampling.LANCZOS).save(root / 'favicon.png')
im = Image.new('RGB', (1200, 630), '#f5f7fb')
d = ImageDraw.Draw(im)
d.rounded_rectangle((40, 40, 1160, 590), radius=24, fill='white', outline='#dde0e6', width=2)
im.paste(icon(56), (88, 88))
d.text((160, 95), 'GIF Crop Lab', font=font(32, True), fill=ink)
d.text((88, 215), 'Crop animated GIFs.', font=font(60, True), fill=ink)
d.text((88, 300), 'Freeform or square.', font=font(42), fill=blue)
d.text((88, 375), 'Preview. Download. Keep files on your device.', font=font(27), fill=muted)
d.rounded_rectangle((88, 465, 305, 524), radius=10, fill=blue)
d.text((116, 480), 'Crop GIF online', font=font(23, True), fill='white')
d.text((865, 500), 'gifcroplab.com', font=font(22), fill=muted)
im.save(root / 'social.png', optimize=True)
print('Generated social.png (1200x630), apple-touch-icon.png (180x180), favicon.png (32x32).')
