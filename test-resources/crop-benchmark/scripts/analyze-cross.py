"""Summarize Chrome-vs-Pillow and cropped Chrome-vs-Chrome pixel comparisons."""
from pathlib import Path
import json
import sys
import bisect
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

root = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('用法：python scripts/analyze-cross.py runs/<运行目录>')
argument = Path(sys.argv[1])
directory = argument.resolve() if argument.is_absolute() else (root/argument).resolve()
reference = directory / 'chrome-reference'
if not (reference/'index.json').is_file():
    raise SystemExit(f'缺少原生解码结果：{reference / "index.json"}\n请先成功执行：node scripts/cross-check.mjs "{directory}"\n如果该命令报错，需先解决它，再运行分析。')
index = json.loads((reference / 'index.json').read_text(encoding='utf-8'))
if any(f.get('error') for f in index['files']):
    raise SystemExit('原生解码结果含错误，请检查 index.json 的 error 字段，不能生成通过报告。')
decoded = {f['path']: f for f in index['files']}
rows = json.loads((directory / 'runs.json').read_text(encoding='utf-8'))

def array(frame):
    return np.frombuffer((reference/frame['file']).read_bytes(), dtype='uint8').reshape(frame['height'], frame['width'], 4)

def diff(a, b):
    if a.shape != b.shape: return {'shape': False}
    mask = (a[:,:,3] > 0) & (b[:,:,3] > 0)
    return {'alpha': int(np.sum(a[:,:,3] != b[:,:,3])), 'rgb': int(np.sum(np.any(a[:,:,:3] != b[:,:,:3], axis=2) & mask))}

sources = []
for file in index['files']:
    if not file['id'].startswith('source-'): continue
    differences = []
    with Image.open(file['path']) as im:
        for i, frame in enumerate(file['frames']):
            im.seek(i)
            differences.append(diff(array(frame), np.asarray(im.convert('RGBA'))))
    sources.append({'source': file['path'], 'chrome_vs_pillow': differences})
outputs = []
for row in rows:
    if row.get('output') is None: continue
    output = decoded.get(str(directory/row['output']))
    source = decoded.get(row['source'])
    if output is None or source is None: continue
    result = {'sample': row['sample'], 'engine': row['engine'], 'case': row['case'], 'same_frame_count': len(source['frames']) == len(output['frames'])}
    pairs = list(zip(source['frames'], output['frames']))
    result['alignment'] = 'frame index'
    if not result['same_frame_count']:
        def starts(frames):
            out = [0]
            for f in frames: out.append(out[-1] + (f['durationUs'] or 0))
            return out
        a, b = starts(source['frames']), starts(output['frames'])
        times = sorted(t for t in set(a+b) if t < min(a[-1], b[-1]))
        pairs = [(source['frames'][bisect.bisect_right(a,t)-1], output['frames'][bisect.bisect_right(b,t)-1]) for t in times]
        result['alignment'] = 'Chrome decoded animation timeline'
        result['same_total_duration'] = a[-1] == b[-1]
    r = row['rect']
    comparisons = []
    for i, (a, b) in enumerate(pairs):
        expected = array(a)[r['y']:r['y']+r['height'], r['x']:r['x']+r['width']]
        actual = array(b)
        difference = diff(expected, actual)
        comparisons.append(difference)
        if 'diff_directory' not in result and (difference.get('alpha',0) or difference.get('rgb',0)):
            folder = reference / 'diffs' / f'{Path(row["sample"]).stem}-{row["engine"]}-{row["case"]}'
            folder.mkdir(parents=True, exist_ok=True)
            Image.fromarray(expected).save(folder/'expected.png')
            Image.fromarray(actual).save(folder/'actual.png')
            scale = min(64, max(1, 512//max(expected.shape[:2])))
            Image.fromarray(expected).resize((expected.shape[1]*scale, expected.shape[0]*scale),Image.Resampling.NEAREST).save(folder/'expected-zoom.png')
            Image.fromarray(actual).resize((actual.shape[1]*scale, actual.shape[0]*scale),Image.Resampling.NEAREST).save(folder/'actual-zoom.png')
            result['diff_directory'] = folder.relative_to(directory).as_posix()
    result['chrome_source_crop_vs_output'] = comparisons
    outputs.append(result)
report = {'browser': index['browser'], 'sources': sources, 'outputs': outputs}
(reference/'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('SOURCE disagreements:')
for r in sources:
    if any(v.get('shape') is False or v.get('alpha',0) or v.get('rgb',0) for v in r['chrome_vs_pillow']): print(Path(r['source']).name, r['chrome_vs_pillow'])
print('OUTPUT differences (frame/time aligned):')
for r in outputs:
    d = r.get('chrome_source_crop_vs_output', [])
    if any(v.get('shape') is False or v.get('alpha',0) or v.get('rgb',0) for v in d): print(r['sample'], r['engine'], r['case'], d)
