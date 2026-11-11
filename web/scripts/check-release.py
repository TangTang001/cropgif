"""Check the built publication files without starting a server."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
import hashlib
import json
import struct
from zipfile import ZipFile
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
origin = 'https://gifcroplab.com'
pages = {'/': 'index.html', '/crop-gif-to-circle/': 'crop-gif-to-circle/index.html', '/privacy/': 'privacy/index.html', '/licenses/': 'licenses/index.html'}


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
        for key in ('href', 'src', 'srcset'):
            if a.get(key): self.refs.append(a[key])


def target(path):
    return dist / (pages[path] if path in pages else path.lstrip('/'))


for url, name in pages.items():
    page = Page()
    page.feed((dist / name).read_text(encoding='utf-8'))
    assert page.canonical == [origin + url], (name, page.canonical)
    assert page.h1 == 1 and len(page.description) == 1 and page.description[0], name
    assert page.noindex == (url == '/licenses/'), name
    for ref in page.refs:
        parsed = urlparse(ref)
        if parsed.scheme and parsed.netloc != 'gifcroplab.com': continue
        if not parsed.path: continue
        assert parsed.path.startswith('/'), (name, ref)
        assert target(parsed.path).is_file(), (name, ref)

locs = [x.text for x in ET.parse(dist / 'sitemap.xml').findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
assert sorted(locs) == [origin + '/', origin + '/crop-gif-to-circle/', origin + '/privacy/']
not_found = Page()
not_found.feed((dist / '404.html').read_text(encoding='utf-8'))
assert not_found.noindex and not_found.h1 == 1 and not not_found.canonical, '404.html'
assert '/' in not_found.refs, '404 must link home'
for ref in not_found.refs:
    assert ref.startswith('/') and target(ref).is_file(), ('404.html', ref)
assert 'Sitemap: ' + origin + '/sitemap.xml' in (dist / 'robots.txt').read_text()
for name, size in [('social.png', (1200, 630)), ('apple-touch-icon.png', (180, 180)), ('favicon.png', (32, 32))]:
    data = (dist / name).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', data[16:24]) == size

notices = sorted((root / 'public/licenses').glob('*.txt'))
assert len(notices) == 5, 'third-party notice count'
for source in notices:
    assert source.read_bytes() == (dist / 'licenses' / source.name).read_bytes(), source.name
files = sorted(str(p.relative_to(dist)).replace('\\', '/') for p in dist.rglob('*') if p.is_file())
source_files = {'source/gifsicle-1.92-source.zip', 'source/README.txt', 'source/provenance.json'}
provenance = json.loads((dist / 'source/provenance.json').read_text(encoding='utf-8'))
archive_path = dist / 'source/gifsicle-1.92-source.zip'
assert hashlib.sha256(archive_path.read_bytes()).hexdigest() == provenance['archive']['sha256']
with ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    for required in ['gifsicle-1.92/src/gifsicle.c', 'gifsicle-1.92/COPYING', 'wasm-codecs/packages/gifsicle/Dockerfile', 'wasm-codecs/packages/gifsicle/build.sh', 'wasm-codecs/packages/gifsicle/src/pre.ts', 'wasm-codecs/packages/gifsicle/lib/pre.js', 'gifsicle-wasm-browser/src/build.js', 'gifsicle-wasm-browser/LICENSE']:
        assert required in archive.namelist(), required
    wasm = archive.read('gifsicle-wasm-browser/src/gifsicle.wasm')
    assert hashlib.sha256(wasm).hexdigest() == provenance['core']['wasmSha256']
examples = {
    f'examples/{name}.{ext}'
    for name in ('gif-crop-before', 'gif-crop-after', 'gif-freeform-before', 'gif-freeform-after', 'gif-circle-after')
    for ext in ('gif', 'png')
}
examples |= {
    f'examples/avatar-{name}.{ext}'
    for name in ('robot-before', 'robot-circle', 'cat-before', 'cat-square')
    for ext in ('gif', 'png')
}
expected = set(pages.values()) | {'404.html', 'robots.txt', 'sitemap.xml', '_headers', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'social.png'} | {'licenses/' + p.name for p in notices} | source_files | examples
assert {p for p in files if not p.startswith('assets/')} == expected
assert all(Path(p).suffix in {'.js', '.css'} for p in files if p.startswith('assets/'))
print(json.dumps({'pages': list(pages), 'files': files, 'checks': 'canonical, H1, description, internal targets, sitemap, 404 noindex and home link, icons, original license bytes, publication file allowlist', 'sha256': {name: hashlib.sha256((dist / name).read_bytes()).hexdigest() for name in files}}, indent=2))
