"""Check the built publication files without starting a server."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
import hashlib
import json
import struct
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
origin = 'https://gifcroplab.com'
pages = {'/': 'index.html', '/privacy/': 'privacy/index.html', '/licenses/': 'licenses/index.html'}


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical, self.h1, self.description = [], 0, []
        self.refs = []
        self.noindex = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'h1': self.h1 += 1
        if tag == 'link' and a.get('rel') == 'canonical': self.canonical.append(a.get('href'))
        if tag == 'meta' and a.get('name') == 'description': self.description.append(a.get('content'))
        if tag == 'meta' and a.get('name') == 'robots': self.noindex |= 'noindex' in a.get('content', '')
        for key in ('href', 'src'):
            if a.get(key): self.refs.append(a[key])


def target(path):
    return dist / (pages[path] if path in pages else path.lstrip('/'))


for url, name in pages.items():
    page = Page()
    page.feed((dist / name).read_text(encoding='utf-8'))
    assert page.canonical == [origin + url], (name, page.canonical)
    assert page.h1 == 1 and len(page.description) == 1 and page.description[0], name
    assert not page.noindex, name
    for ref in page.refs:
        parsed = urlparse(ref)
        if parsed.scheme and parsed.netloc != 'gifcroplab.com': continue
        if not parsed.path: continue
        assert parsed.path.startswith('/'), (name, ref)
        assert target(parsed.path).is_file(), (name, ref)

locs = [x.text for x in ET.parse(dist / 'sitemap.xml').findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
assert set(locs) == {origin + url for url in pages} and len(locs) == len(pages)
assert 'Sitemap: ' + origin + '/sitemap.xml' in (dist / 'robots.txt').read_text()
for name, size in [('social.png', (1200, 630)), ('apple-touch-icon.png', (180, 180)), ('favicon.png', (32, 32))]:
    data = (dist / name).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', data[16:24]) == size

notices = sorted((root / 'licenses').glob('*-LICENSE.txt')) + [root / 'licenses/gifsicle-COPYING.txt']
for source in notices:
    assert source.read_bytes() == (dist / 'licenses' / source.name).read_bytes(), source.name
files = sorted(str(p.relative_to(dist)).replace('\\', '/') for p in dist.rglob('*') if p.is_file())
expected = set(pages.values()) | {'robots.txt', 'sitemap.xml', '_headers', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'social.png'} | {'licenses/' + p.name for p in notices}
assert {p for p in files if not p.startswith('assets/')} == expected
assert all(Path(p).suffix in {'.js', '.css'} for p in files if p.startswith('assets/'))
print(json.dumps({'pages': list(pages), 'files': files, 'checks': 'canonical, H1, description, internal targets, sitemap, icons, original license bytes, publication file allowlist', 'sha256': {name: hashlib.sha256((dist / name).read_bytes()).hexdigest() for name in files}}, indent=2))
