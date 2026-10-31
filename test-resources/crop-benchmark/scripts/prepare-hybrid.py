"""Deterministic compound GIFs; preserve the original inventory and fixtures."""
from pathlib import Path
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[1]
le = lambda n: struct.pack('<H', n)

def image(x, palette, disposal, colors, corrupt=False):
    codes = [256, 300, 257] if corrupt else [c for i in range(256) for c in (256, i % colors)] + [257]
    acc = bits = 0
    packed = bytearray()
    for code in codes:
        acc |= code << bits
        bits += 9
        while bits >= 8:
            packed.append(acc & 255)
            acc >>= 8
            bits -= 8
    if bits:
        packed.append(acc & 255)
    blocks = b''.join(bytes([len(packed[i:i+255])]) + packed[i:i+255] for i in range(0, len(packed), 255)) + b'\x00'
    gce = b'\x21\xf9\x04' + bytes([disposal << 2]) + le(10) + b'\x00\x00'
    return gce + b'\x2c' + le(x) + le(0) + le(16) + le(16) + b'\x87' + palette + b'\x08' + blocks

samples = json.loads((ROOT/'suite.json').read_text(encoding='utf-8'))
for colors, disposal, corrupt in [(128,1,False),(128,2,False),(128,3,False),(256,1,False),(256,2,False),(256,3,False),(256,2,True)]:
    red = bytes(v for i in range(256) for v in (i,0,0))
    green = bytes(v for i in range(256) for v in (0,i,0))
    blue = bytes(v for i in range(256) for v in (0,0,i))
    header = b'GIF89a' + le(64) + le(16) + b'\xf7\x00\x00' + red
    loop = b'\x21\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00'
    data = header + loop + image(0,red,1,colors) + image(16,green,disposal,colors) + image(48,blue,1,colors,corrupt) + b'\x3b'
    name = f'hybrid-{colors*2-1}colors-disposal{disposal}{"-corrupt" if corrupt else ""}.gif'
    path = ROOT/'generated'/name
    if path.exists():
        assert path.read_bytes() == data, 'Existing fixture differs; will not overwrite'
    else:
        path.write_bytes(data)
    samples.append(dict(id=f'h{len(samples)-38:02d}',name='generated/'+name,path=str(path),sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),width=64,height=16,frames=3,kind='invalid' if corrupt else 'valid',performance=False,crops=[dict(name='palette-union',rect=dict(x=0,y=0,width=32,height=16))]))
destination = ROOT/'suite-hybrid.json'
with destination.open('x',encoding='utf-8') as stream:
    json.dump(samples,stream,ensure_ascii=False,indent=2)
print(f'Prepared {len(samples)} samples, including 7 compound fixtures; original suite unchanged')
