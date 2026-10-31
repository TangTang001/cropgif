"""Independently decode and compare browser outputs; never trusts candidate metadata."""
import argparse
import hashlib
import json
import platform
import statistics
import bisect
from pathlib import Path
import numpy as np
from PIL import Image, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[1]

def raw_meta(path):
    b = path.read_bytes()
    if len(b) < 13 or b[:6] not in (b'GIF87a', b'GIF89a'):
        raise ValueError('Invalid header')
    def word(p): return int.from_bytes(b[p:p+2], 'little')
    p = 13 + (3 * 2 ** ((b[10] & 7) + 1) if b[10] & 128 else 0)
    delays, loop, delay, disposal, frames = [], None, 0, 0, []
    def blocks(p):
        out = bytearray()
        while True:
            if p >= len(b): raise ValueError('Truncated blocks')
            n = b[p]; p += 1
            if n == 0: return p, out
            if p+n > len(b): raise ValueError('Truncated payload')
            out.extend(b[p:p+n]); p += n
    while p < len(b):
        marker = b[p]; p += 1
        if marker == 0x3b: break
        if marker == 0x21:
            label = b[p]; p += 1
            if label == 0xf9:
                delay = word(p+2) * 10
                disposal = (b[p+1] >> 2) & 7
                p += 6
            else:
                p, data = blocks(p)
                if label == 0xff and data[:11] in (b'NETSCAPE2.0', b'ANIMEXTS1.0') and len(data) >= 14:
                    loop = int.from_bytes(data[12:14], 'little')
                if label == 1: delay, disposal = 0, 0
        elif marker == 0x2c:
            flags = b[p+8]
            frames.append({'x': word(p), 'y': word(p+2), 'width': word(p+4), 'height': word(p+6), 'disposal': disposal})
            delays.append(delay); delay, disposal = 0, 0
            p += 9
            if flags & 128: p += 3 * 2 ** ((flags & 7) + 1)
            p += 1
            p, _ = blocks(p)
        else: raise ValueError(f'Unknown block {marker}')
    return {'width': word(6), 'height': word(8), 'frames': len(frames), 'delays': delays, 'loop': loop, 'frame_details': frames}

def verify(row, directory):
    result = {k: row.get(k) for k in ['sample', 'kind', 'engine', 'case', 'rect', 'output', 'error', 'recovery', 'firstRoundtripMs', 'warmMedianMs', 'initMs', 'outputBytes', 'nondeterministic']}
    path = Path(row['source'])
    result['source_unchanged'] = hashlib.sha256(path.read_bytes()).hexdigest() == row['sourceSha256']
    if not row.get('output'):
        result['status'] = 'REJECTED' if row['kind'] == 'invalid' else 'EDGE_ERROR' if row['kind'] == 'edge' else 'ERROR'
        return result
    if row['kind'] == 'invalid':
        result['status'] = 'ACCEPTED_TOLERANT' if path.name == 'no_trailer.gif' else 'ACCEPTED_INVALID_REVIEW'
        return result
    source = raw_meta(path)
    out_path = directory / row['output']
    output = raw_meta(out_path)
    r = row['rect']
    result.update(size_ok=(output['width'], output['height']) == (r['width'], r['height']),
                  frames_ok=source['frames'] == output['frames'],
                  delays_ok=source['delays'] == output['delays'], loop_ok=source['loop'] == output['loop'],
                  source_frames=source['frames'], output_frames=output['frames'],
                  source_loop=source['loop'], output_loop=output['loop'],
                  source_delays=source['delays'], output_delays=output['delays'])
    result['total_duration_ok'] = sum(source['delays']) == sum(output['delays'])
    aligned = not result['frames_ok'] or not result['delays_ok']
    pairs = list(zip(range(source['frames']), range(output['frames'])))
    if aligned and all(d > 0 for d in source['delays'] + output['delays']):
        def starts(delays):
            out = [0]
            for d in delays: out.append(out[-1]+d)
            return out
        source_starts, output_starts = starts(source['delays']), starts(output['delays'])
        end = min(source_starts[-1], output_starts[-1])
        times = sorted(t for t in set(source_starts + output_starts) if t < end)
        pairs = [(bisect.bisect_right(source_starts,t)-1, bisect.bisect_right(output_starts,t)-1) for t in times]
        result['pixel_comparison'] = 'aligned by animation timeline boundaries'
    else:
        result['pixel_comparison'] = 'frame index (zero-duration timeline is not inferred)' if aligned else 'same frame index and stored timing'
    alpha_differences = rgb_differences = max_error = checked = 0
    first_mismatch = None
    with Image.open(path) as original, Image.open(out_path) as actual:
        for i, j in pairs:
            original.seek(i); actual.seek(j)
            expected_image = original.convert('RGBA').crop((r['x'], r['y'], r['x']+r['width'], r['y']+r['height']))
            actual_image = actual.convert('RGBA')
            e, a = np.asarray(expected_image), np.asarray(actual_image)
            if e.shape != a.shape: continue
            alpha = e[:,:,3] != a[:,:,3]
            visible = (e[:,:,3] > 0) & (a[:,:,3] > 0)
            delta = np.abs(e[:,:,:3].astype('int16') - a[:,:,:3].astype('int16'))
            rgb = np.any(delta > 0, axis=2) & visible
            alpha_differences += int(np.sum(alpha))
            rgb_differences += int(np.sum(rgb))
            max_error = max(max_error, int(delta[visible].max()) if visible.any() else 0)
            checked += 1
            if first_mismatch is None and (alpha.any() or rgb.any()):
                first_mismatch = i
                diff_dir = directory / 'diffs' / out_path.stem
                diff_dir.mkdir(parents=True, exist_ok=True)
                expected_image.save(diff_dir / f'frame-{i}-expected.png')
                actual_image.save(diff_dir / f'frame-{i}-actual.png')
                diff = np.zeros_like(e)
                diff[:,:,3] = 255
                diff[alpha,:3] = [255, 0, 255]
                diff[rgb,:3] = [255, 70, 0]
                Image.fromarray(diff).save(diff_dir / f'frame-{i}-diff.png')
    result.update(checked_frames=checked, alpha_different_pixels=alpha_differences, rgb_different_pixels=rgb_differences,
                  max_rgb_channel_error=max_error, first_mismatch_frame=first_mismatch)
    result['reference_visual_timeline_equal'] = bool(result['size_ok'] and result['total_duration_ok'] and result['loop_ok'] and not alpha_differences and not rgb_differences and (not aligned or all(d > 0 for d in source['delays'] + output['delays'])))
    ok = all(result[k] for k in ['size_ok', 'frames_ok', 'delays_ok', 'loop_ok', 'source_unchanged']) and not alpha_differences and not rgb_differences and not row.get('nondeterministic')
    result['status'] = 'PASS' if ok else 'DIFF'
    if row['kind'] == 'edge': result['status'] = 'EDGE_' + result['status']
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('run', type=Path)
    args = parser.parse_args()
    directory = args.run.resolve()
    rows = json.loads((directory/'runs.json').read_text(encoding='utf-8'))
    results = []
    for row in rows:
        try: results.append(verify(row, directory))
        except Exception as e:
            results.append({'sample': row['sample'], 'engine': row['engine'], 'case': row['case'], 'status': 'VERIFIER_ERROR', 'error': str(e)})
    report = {'reference': {'python': platform.python_version(), 'pillow': pillow_version, 'numpy': np.__version__, 'note': 'Pillow composited RGBA reference plus independent raw GIF block metadata'}, 'results': results}
    (directory/'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# 自动验证结果', '', '这是 Pillow 参考下的严格结果，不能把 PASS 数量直接当成浏览器正确率。局部帧的背景语义与 Chrome 不同，须结合 chrome-reference/comparison.json 和总报告阅读。合帧后的像素按时间对齐检查，但帧数和逐帧时长序列仍严格验收。', '', '仅代表本目录 environment.json 中的版本和设备。EDGE 项单列，invalid 的拒绝可能发生在共享格式校验阶段。', '', '| 方案 | 正常精确通过 | 正常差异 | 正常错误 | 异常/边界 |', '|---|---:|---:|---:|---:|']
    engines = sorted({r['engine'] for r in results})
    for engine in engines:
        subset = [r for r in results if r['engine'] == engine]
        lines.append(f'| {engine} | {sum(r["status"] == "PASS" for r in subset)} | {sum(r["status"] == "DIFF" for r in subset)} | {sum(r["status"] in ("ERROR", "VERIFIER_ERROR") for r in subset)} | {sum(r["status"] not in ("PASS", "DIFF", "ERROR", "VERIFIER_ERROR") for r in subset)} |')
    lines += ['', '## 性能（中间选区；独立记录首次及三次后续运行中位数）', '', '| 样本 | 方案 | 初始化 ms | 首次选区处理 ms | 后续中位数 ms | 输出字节 |', '|---|---|---:|---:|---:|---:|']
    for row in rows:
        if row.get('warmMedianMs') is not None:
            lines.append(f'| {row["sample"]} | {row["engine"]} | {row["initMs"]:.1f} | {row["firstRoundtripMs"]:.1f} | {row["warmMedianMs"]:.1f} | {row["outputBytes"]} |')
    lines += ['', '注意：同一 Worker 的 full 在 center 前执行；center 首次不是引擎冷启动。真正冷任务可查 runs.json 的 full。Gifsicle 封装可能在每次调用中创建新的内部 Worker，因此后续耗时不意味着复用 WASM 实例。', '', '## 差异与错误', '', '| 样本 | 方案 | 选区 | 结果 | alpha 差异 | RGB 差异 | 帧数/时长/循环 |', '|---|---|---|---|---:|---:|---|']
    for r in results:
        if r['status'] not in ('PASS', 'EDGE_PASS', 'REJECTED', 'ACCEPTED_TOLERANT'):
            flags = '/'.join(str(r.get(k, '—')) for k in ['frames_ok', 'delays_ok', 'loop_ok'])
            lines.append(f'| {r["sample"]} | {r["engine"]} | {r["case"]} | {r["status"]} | {r.get("alpha_different_pixels", "—")} | {r.get("rgb_different_pixels", "—")} | {flags} |')
    lines += ['', '完整元数据、错误和像素计数见 verification.json；首个像素差异帧见 diffs/。手机真机、Safari、总内存峰值和完整动画肉眼观看均不由本脚本认证。']
    (directory/'verification.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    for engine in engines:
        statuses = {}
        for r in results:
            if r['engine'] == engine: statuses[r['status']] = statuses.get(r['status'], 0)+1
        print(engine, statuses)

if __name__ == '__main__': main()
