"""Generate original, flat-color animated avatar fixtures for the crop examples."""
from pathlib import Path
import math
from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "examples"
COLORS = ["#edf4ff", "#dbe9ff", "#2563eb", "#1e3a8a", "#ffffff", "#93c5fd",
          "#eef2ff", "#c7d2fe", "#6366f1", "#312e81", "#a5b4fc", "#ddd6fe"]
palette = []
for color in COLORS:
    palette.extend(tuple(bytes.fromhex(color[1:])))
palette += [0] * (768 - len(palette))
palette_image = Image.new("P", (1, 1))
palette_image.putpalette(palette)

for animal in ("robot", "cat"):
    frames = []
    for frame in range(24):
        canvas = Image.new("RGB", (320, 240), COLORS[0 if animal == "robot" else 6])
        draw = ImageDraw.Draw(canvas)
        y = round(3 * math.sin(frame * math.tau / 24))
        # Background accents stay outside the centered avatar crop.
        accent = COLORS[1 if animal == "robot" else 7]
        draw.ellipse((83, 204, 237, 218), fill=accent)
        blink = frame in (10, 11)
        if animal == "robot":
            draw.rounded_rectangle((105, 167+y, 215, 242+y), radius=38, fill=COLORS[2])
            draw.line((160, 51+y, 160, 68+y), fill=COLORS[3], width=6)
            draw.ellipse((151, 35+y, 169, 53+y), fill=COLORS[2])
            draw.rounded_rectangle((89, 87+y, 231, 161+y), radius=19, fill=COLORS[5])
            draw.rounded_rectangle((101, 66+y, 219, 179+y), radius=30, fill=COLORS[2])
            draw.rounded_rectangle((113, 87+y, 207, 153+y), radius=20, fill=COLORS[4])
            for x in (137, 183):
                if blink:
                    draw.line((x-6, 113+y, x+6, 113+y), fill=COLORS[3], width=5)
                else:
                    draw.ellipse((x-5, 103+y, x+5, 117+y), fill=COLORS[3])
            draw.arc((147, 118+y, 173, 138+y), 0, 180, fill=COLORS[3], width=3)
            draw.ellipse((151, 188+y, 169, 206+y), fill=COLORS[5])
        else:
            draw.rounded_rectangle((104, 174+y, 216, 253+y), radius=40, fill=COLORS[8])
            draw.polygon([(102, 110+y), (99, 48+y), (142, 80+y)], fill=COLORS[8])
            draw.polygon([(178, 80+y), (221, 48+y), (218, 110+y)], fill=COLORS[8])
            draw.polygon([(110, 84+y), (109, 65+y), (129, 82+y)], fill=COLORS[11])
            draw.polygon([(191, 82+y), (211, 65+y), (210, 84+y)], fill=COLORS[11])
            draw.ellipse((98, 70+y, 222, 191+y), fill=COLORS[8])
            draw.ellipse((125, 122+y, 195, 180+y), fill=COLORS[7])
            for x in (133, 187):
                if blink:
                    draw.arc((x-8, 108+y, x+8, 122+y), 180, 360, fill=COLORS[9], width=4)
                else:
                    draw.ellipse((x-4, 109+y, x+4, 122+y), fill=COLORS[9])
            draw.polygon([(154, 137+y), (166, 137+y), (160, 144+y)], fill=COLORS[9])
            draw.arc((148, 139+y, 160, 154+y), 0, 110, fill=COLORS[9], width=2)
            draw.arc((160, 139+y, 172, 154+y), 70, 180, fill=COLORS[9], width=2)
            for x1, x2 in [(105, 127), (193, 215)]:
                draw.line((x1, 139+y, x2, 143+y), fill=COLORS[9], width=2)
                draw.line((x1, 153+y, x2, 150+y), fill=COLORS[9], width=2)
        # A small orbiting glint keeps every animation frame distinct.
        sparkle_x = round(160 + 82 * math.cos(frame * math.tau / 24))
        sparkle_y = round(124 + 82 * math.sin(frame * math.tau / 24))
        draw.ellipse((sparkle_x-3, sparkle_y-3, sparkle_x+3, sparkle_y+3),
                     fill=COLORS[5 if animal == "robot" else 10])
        frame_image = Image.new("RGB", (320, 180), COLORS[0 if animal == "robot" else 6])
        frame_image.paste(canvas.resize((240, 180), Image.Resampling.NEAREST), (40, 0))
        frame_draw = ImageDraw.Draw(frame_image)
        for x, top, radius in [(30, 34, 11), (287, 142, 14), (20, 120, 5), (301, 47, 6)]:
            frame_draw.ellipse((x-radius, top-radius, x+radius, top+radius), fill=accent)
        frames.append(frame_image.quantize(palette=palette_image, dither=Image.Dither.NONE))
    path = OUTPUT / f"avatar-{animal}-before.gif"
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, loop=0, disposal=2, optimize=False)
    frames[0].convert("RGB").save(path.with_suffix(".png"))
    print(path.name, path.stat().st_size)
