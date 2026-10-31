"""Create local deterministic performance fixtures and a hashed test inventory."""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT.parent / 'codec-corpus'
generated = ROOT / 'generated'
generated.mkdir(exist_ok=True)

# Our own deterministic fixtures, not derived from third-party media.
palette = [v for i in range(256) for v in (i, (i * 37) % 256, (i * 91) % 256)]
for w, h, count in [(640, 480, 60), (1024, 768, 60)]:
    path = generated / f'pattern-{w}x{h}-{count}f.gif'
    if not path.exists():
        yy, xx = np.indices((h, w))
        frames = []
        for n in range(count):
            array = ((xx // 8 + yy // 8 + n * 7) % 256).astype('uint8')
            frame = Image.fromarray(array).convert('P')
            frame.putpalette(palette)
            frames.append(frame)
        frames[0].save(path, save_all=True, append_images=frames[1:], duration=[40, 80, 120] * 20, loop=2, optimize=False, disposal=1)

# Two disjoint 256-entry local palettes coexist on the display canvas.
# This stresses RGBA-reencode pipelines: the second displayed frame has 511 colors.
union_path = generated / 'palette-union-511colors.gif'
if not union_path.exists():
    def le(n): return struct.pack('<H', n)
    def image_block(x, palette_bytes):
        codes = []
        for value in range(256): codes.extend([256, value])  # clear before each pixel, fixed 9-bit code width
        codes.append(257)
        acc = bits = 0
        packed = bytearray()
        for code in codes:
            acc |= code << bits; bits += 9
            while bits >= 8:
                packed.append(acc & 255); acc >>= 8; bits -= 8
        if bits: packed.append(acc & 255)
        blocks = b''.join(bytes([len(packed[i:i+255])]) + packed[i:i+255] for i in range(0, len(packed), 255)) + b'\x00'
        gce = b'\x21\xf9\x04\x04' + le(10) + b'\x00\x00'
        descriptor = b'\x2c' + le(x) + le(0) + le(16) + le(16) + b'\x87'
        return gce + descriptor + palette_bytes + b'\x08' + blocks
    red = bytes(v for i in range(256) for v in (i, 0, 0))
    green = bytes(v for i in range(256) for v in (0, i, 0))
    header = b'GIF89a' + le(32) + le(16) + b'\xf7\x00\x00' + red
    loop = b'\x21\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00'
    union_path.write_bytes(header + loop + image_block(0, red) + image_block(16, green) + b'\x3b')
    with Image.open(union_path) as im:
        im.seek(1)
        pixels = np.asarray(im.convert('RGB'))
        assert np.unique(pixels.reshape(-1, 3), axis=0).shape[0] == 511

samples = []
selected = list(sorted((CORPUS / 'testdata').glob('*.gif')))
existing = {p.name for p in selected}
extras = ['1x1.gif', 'transparent_bg.gif', 'dispose_none.gif', 'small_frame_big_canvas.gif', 'loop_infinite.gif', 'loop_once.gif', 'static_256colors.gif', 'static_interlaced.gif', 'delay_0.gif', 'delay_10ms.gif']
selected += [CORPUS / 'valid' / name for name in extras if name not in existing]
selected += sorted((CORPUS / 'invalid').glob('*.gif'))
selected += sorted((CORPUS / 'edge-cases').glob('*.gif'))
selected += sorted(generated.glob('*.gif'))
for i, path in enumerate(selected):
    name = path.relative_to(CORPUS).as_posix() if path.is_relative_to(CORPUS) else f'generated/{path.name}'
    row = {'id': f's{i:02d}', 'name': name, 'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size}
    try:
        with Image.open(path) as im:
            row.update(width=im.width, height=im.height, frames=im.n_frames)
            for f in range(im.n_frames):
                im.seek(f)
                im.load()
    except Exception as e:
        row['reference_error'] = str(e)
    row['kind'] = 'invalid' if '/invalid/' in str(path).replace('\\', '/') else 'edge' if '/edge-cases/' in str(path).replace('\\', '/') else 'valid'
    row['performance'] = name.startswith('generated/') or (name.startswith('testdata/') and row['bytes'] > 1000)
    samples.append(row)
(ROOT / 'suite.json').write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Prepared {len(samples)} samples; originals unchanged; generated fixtures: {len(list(generated.glob("*.gif")))}')
