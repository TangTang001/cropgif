"""Run the fixed GIF crop matrix against a local native executable."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--exe', type=Path, required=True)
parser.add_argument('--label', required=True)
parser.add_argument('--sample')
parser.add_argument('--no-ignore-errors', action='store_true')
parser.add_argument('--fixed-screen', action='store_true')
args = parser.parse_args()
if not re.fullmatch(r'[\w.-]+', args.label) or args.label in ('.', '..'):
    parser.error('label must be a directory name')
exe = (ROOT / args.exe).resolve() if not args.exe.is_absolute() else args.exe.resolve()
version = subprocess.run([str(exe), '--version'], capture_output=True, check=True).stdout.decode('utf-8', 'replace')
if '1.98' not in version:
    raise SystemExit('Expected Gifsicle 1.98, got: ' + version)
directory = ROOT/'runs'/args.label
directory.mkdir()  # fail if results already exist; never overwrite a run
suite = json.loads((ROOT/'suite.json').read_text(encoding='utf-8'))
rows = []
engine = 'native-1.98-strict' if args.no_ignore_errors else 'native-1.98'
if args.fixed_screen:
    engine += '-screen'
for sample in suite:
    if args.sample and args.sample not in sample['name']:
        continue
    source = Path(sample['path'])
    assert hashlib.sha256(source.read_bytes()).hexdigest() == sample['sha256']
    W, H = sample.get('width', 1), sample.get('height', 1)
    w, h = max(1, W//2), max(1, H//2)
    cases = [('full', (0, 0, W, H)), ('center', ((W-w)//2, (H-h)//2, w, h)), ('edge', (W-w, H-h, w, h)), ('pixel', (0, 0, 1, 1))]
    if sample['kind'] == 'invalid':
        cases = cases[:1]
    seen = set()
    for name, rect in cases:
        if rect in seen:
            continue
        seen.add(rect)
        x, y, width, height = rect
        output = f'{sample["id"]}-{engine}-{name}.gif'
        command = [str(exe)] + (['--no-ignore-errors'] if args.no_ignore_errors else []) + ['--crop', f'{x},{y}+{width}x{height}', str(source), '-o', str(directory/output)]
        if args.fixed_screen:
            command += ['--logical-screen', f'{width}x{height}']
        row = dict(sample=sample['name'], source=str(source), sourceSha256=sample['sha256'], kind=sample['kind'], engine=engine, case=name, rect=dict(x=x, y=y, width=width, height=height), command=command, performance=False)
        start = time.perf_counter()
        try:
            result = subprocess.run(command, capture_output=True, timeout=60)
            row.update(exitCode=result.returncode, stderr=result.stderr.decode('utf-8', 'replace'), nativeElapsedMs=(time.perf_counter()-start)*1000)
            if result.returncode != 0:
                row['error'] = row['stderr'] or f'exit {result.returncode}'
            elif not (directory/output).is_file() or not (directory/output).stat().st_size:
                row['error'] = 'No nonempty output produced'
            else:
                row.update(output=output, outputBytes=(directory/output).stat().st_size)
        except subprocess.TimeoutExpired:
            row['error'] = 'Native process exceeded 60-second timeout'
        rows.append(row)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == sample['sha256']
    (directory/'runs.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{engine} {sample["name"]}: {sum(r.get("output") is not None for r in rows if r["sample"]==sample["name"])} outputs', flush=True)
if not rows:
    raise SystemExit('No matching samples')
(directory/'environment.json').write_text(json.dumps(dict(version=version, executable=str(exe), executableSha256=hashlib.sha256(exe.read_bytes()).hexdigest(), noIgnoreErrors=args.no_ignore_errors, fixedScreen=args.fixed_screen, timingNote='nativeElapsedMs includes process launch; not directly comparable to browser warm calls'), indent=2), encoding='utf-8')
print(f'Saved {len(rows)} cases: {directory}')
