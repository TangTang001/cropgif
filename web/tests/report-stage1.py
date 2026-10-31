"""Validate saved stage-1 evidence and emit its acceptance report."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
BENCH = ROOT.parent / 'test-resources/crop-benchmark'
read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
key = lambda row: (row['sample'], row['case'])
suite = read(BENCH / 'suite-hybrid.json')
assert len(suite) == 45
assert all(sha(Path(row['path'])) == row['sha256'] for row in suite)
summary = dict(stage=1, date='2026-10-31', inputsUnchanged=45, runs={})
sets = []
for browser in ['chrome', 'edge']:
    directory = BENCH / 'runs' / f'stage1-final-{browser}'
    rows = read(directory / 'runs.json')
    baseline = {key(r): r for r in read(BENCH / 'runs' / f'hybrid-final-{browser}' / 'runs.json')}
    raw = read(directory / 'verification.json')['results']
    visual = read(directory / f'browser-verification-{browser}.json')
    env = read(directory / 'environment.json')
    runtime = read(directory / 'runtime-checks.json')
    assert len(rows) == len(baseline) == 159
    assert len(visual['results']) == 148 and all(r['pass'] for r in visual['results'])
    assert not runtime['errors'] and runtime['allTasksReleased'] and runtime['originalBuffersRetained']
    for path, recorded in env['sourceSha256'].items():
        assert sha(ROOT / path) == recorded, f'Changed production source: {path}'
    valid = [r for r in rows if r['kind'] != 'invalid']
    passed = [r for r in valid if r.get('output')]
    rejected = [r for r in valid if not r.get('output')]
    assert len(passed) == 148 and len(rejected) == 3
    assert all(r['errorCode'] == 'UNSUPPORTED_CROP' for r in rejected)
    assert sum(r['kind'] == 'invalid' and not r.get('output') for r in rows) == 7
    assert [r['sample'] for r in rows if r['kind'] == 'invalid' and r.get('output')] == ['invalid/no_trailer.gif']
    assert all(r.get('recovery') == 'new production task accepted subsequent valid file' for r in rows if r['kind'] == 'invalid' or r.get('error'))
    for row in raw:
        assert row.get('source_unchanged')
        if row['kind'] != 'invalid' and row.get('output'):
            assert all(row.get(k) for k in ['size_ok', 'frames_ok', 'delays_ok', 'loop_ok'])
    same_baseline = 0
    for row in rows:
        previous = baseline[key(row)]
        assert bool(row.get('output')) == bool(previous.get('output'))
        if row.get('output'):
            assert row['details']['final'] == previous['details']['final']
            assert row['details']['fallbackReasons'] == previous['details']['fallbackReasons']
            assert sha(directory / row['output']) == sha(BENCH / 'runs' / f'hybrid-final-{browser}' / previous['output'])
            same_baseline += 1
            if row['details']['final'] == 'A': assert row['details']['fallbackDetails']['quantizedFrames'] == 0
    result = dict(browser=env['version'], records=len(rows), validDelivered=len(passed), primaryB=sum(r['details']['final'] == 'B' for r in passed), fallbackA=sum(r['details']['final'] == 'A' for r in passed), unsupported=len(rejected), invalidRejected=7, tolerantInputs=1, identicalToBaseline=same_baseline, runtime=runtime)
    assert (result['primaryB'], result['fallbackA'], same_baseline) == (116, 32, 149)
    summary['runs'][browser] = result
    sets.append((directory, rows))
other = {key(r): r for r in sets[1][1]}
equal = 0
for row in sets[0][1]:
    match = other[key(row)]
    assert row.get('errorCode') == match.get('errorCode')
    if row.get('output'):
        assert sha(sets[0][0] / row['output']) == sha(sets[1][0] / match['output'])
        equal += 1
assert equal == 149
safety_dir = BENCH / 'runs/stage1-safety-owned-workers'
safety = read(safety_dir / 'checks.json')
assert all(safety[k] for k in ['rejectsBeforeFileRead','singleTask','workerEnforcesDefaultProtocolLimits','recoveryAfterTimeout','explicitCancellation','emptyMimeAccepted'])
assert safety['timeout']['sawChildRunning'] and safety['timeout']['childStopped'] and safety['timeout']['workerReleased']
assert safety['repeatedTaskResources']['created'] == safety['repeatedTaskResources']['terminated'] == 11
assert all(safety['productionPreview'][k] for k in ['actualDownload','invalidFileClearsOldResult','recovery'])
assert not safety['productionPreview']['remoteRequests']
assert '# pass 6' in (safety_dir / 'unit-tests.tap').read_text(encoding='utf-8-sig')
deps = read(ROOT / 'dependency-evidence.json')
for name, package in deps['packages'].items():
    for path, recorded in package['filesSha256'].items(): assert sha(ROOT / 'node_modules' / name / path) == recorded
build = {str(p.relative_to(ROOT / 'dist')).replace('\\','/'): sha(p) for p in (ROOT / 'dist').rglob('*') if p.is_file()}
assert len(build) == 4 and not any('test' in p or p.endswith('.gif') or p.endswith('.exe') for p in build)
summary.update(crossBrowserIdenticalOutputFiles=equal, safety=safety, unitTestsPassed=6, buildFilesSha256=build, dependenciesEvidenceSha256=sha(ROOT / 'dependency-evidence.json'), productionLockSha256=sha(ROOT / 'package-lock.json'), status='stage1-complete')
with (BENCH / 'runs/stage1-acceptance-summary.json').open('x', encoding='utf-8') as stream:
    json.dump(summary, stream, ensure_ascii=False, indent=2)
c, e = summary['runs']['chrome'], summary['runs']['edge']
report = f'''# GIF Crop 阶段 1 验收报告

日期：2026-10-31。状态：**阶段 1 完成**。本轮 Goal 为“正式工程与处理核心”，尚未实施阶段 2 的原型页面和裁剪交互。

## 交付

- 新建独立 web 工程，Vite 7.1.7 + 原生 JS/CSS；固定 gifsicle-wasm-browser 1.5.19、gifuct-js 2.1.2、gifenc 1.0.3，保留 package-lock.json。
- src/gif 中迁移原容器校验、完整 A 合成与编码算法、B 诊断适配及 H 路由。B 非零或未知诊断不切 A；B 仅在动画元数据不符时切 A，A 量化结果始终拒绝。
- 集中资源限制与结构化错误码：INVALID_GIF、CORRUPT_GIF、UNSUPPORTED_CROP、RESOURCE_LIMIT、TIMEOUT、UNSUPPORTED_ENV、PROCESSING_FAILED。损坏、超限、超时、未知错误分开处理，页面只显示英文提示。
- 主线程保留输入，仅转移副本。每个任务独立处理 Worker；B 的子 Worker 由主线程登记和转发消息，仍运行同一份封装脚本与 WASM。任务完成、失败、取消或超时统一终止资源。
- 最小集成页可选文件、全图处理、预览及实际下载；它用于验证核心，不是蓝色原型页面的最终实现。

## 生产 Worker 回归

tests/run-regression.mjs 直接导入 web/src/gif/client.js，实际调用正式 Worker 和 H，不调用实验页的处理核心。使用原正确性扫描配置（16,777,216 画布像素、300,000,000 总帧像素等），与默认产品限制检查分开。

| 检查 | Chrome {c['browser']} | Edge {e['browser']} |
|---|---:|---:|
| 输入 / 选区记录 | 45 / 159 | 45 / 159 |
| 有效输出通过画面及原始动画元数据 | 148 | 148 |
| B 主处理 / A 兜底 | 116 / 32 | 116 / 32 |
| 已知复杂合法选区拒绝 | 3 | 3 |
| 明确异常输入拒绝 | 7 | 7 |
| no_trailer 容错接受 | 1 | 1 |
| 与旧 H 基线逐字节相同的输出 | 149 | 149 |

两个浏览器的 149 个输出也逐字节一致，45 个输入哈希未变。148 个有效输出逐帧 alpha、可见 RGB 和播放时间线均通过；独立原始 GIF 块扫描的尺寸、帧数、逐帧延迟和循环字段全部通过。另一个输出属于 no_trailer 容错，不混入有效输出数量。

三个 hybrid-511colors-disposal1/2/3 的 palette-union 选区继续返回 UNSUPPORTED_CROP；记录 A 的量化原因，未降低验收要求。B 损坏拒绝和 A 因量化拒绝后，同一客户端均可创建新任务成功处理正常文件。成功及失败任务的 Worker 均已释放，原输入 buffer 未被转移或清空。

Pillow 的 23 条正常参考差异单独保留于 verification.json；浏览器检查为 148/148。参考差异不直接当作浏览器画面错误，也不以 Pillow 通过数量代替浏览器验收。

## 资源、超时与构建

- 6 项 Node 定向测试全部通过。默认 20 MiB、4,194,304 画布像素、500 帧、60,000,000 总帧像素均检查刚好边界和刚超限；超大文件在读取前拒绝，空 MIME 的真实 GIF 允许读取。这里验证限制机制，不证明该容量在所有设备上可稳定处理。
- 默认超时配置 60 秒；受控测试将阈值缩短到 350ms，实测约 {safety['timeout']['elapsedMs']:.1f}ms 后终止任务，并确认子 Worker 心跳停止。之后真实生产任务成功。没有用随机慢 GIF 或仅停止 UI 等待代替验证。
- 初次测试发现“只 terminate 外层时子 Worker 继续运行”，因此引入主线程所有权，测试确认修复。B 的核心算法、命令和诊断白名单未变。
- 重复任务测试创建/终止 11/11 个处理与子 Worker；显式取消、拒绝重复提交、Worker 限制、错误恢复均通过。这是资源生命周期检查，没有测量浏览器进程内存峰值。
- Vite build 通过，dist 仅有 index.html、页面 JS/CSS、生产 Worker 共 4 个文件，不含测试样本、实验输出、原生工具或 SDK。阶段 1 生产预览验证实际下载及错误后恢复，未产生远程 HTTP 请求。
- npm ci 因网络中断未完成，随后复用并逐文件核对实验工程的同版本依赖。9 个关键包（包含构建二进制）的版本、来源 integrity 和文件 SHA256 已记录在 dependency-evidence.json；未升级依赖。

## 证据与复现

- ../test-resources/crop-benchmark/runs/stage1-final-chrome 与 stage1-final-edge：每侧 159 条生产入口记录、输出、源码/锁文件哈希、元数据及逐帧浏览器验证。
- ../test-resources/crop-benchmark/runs/stage1-safety-owned-workers：任务生命周期、超时、实际生产下载及 6 项定向检查记录。
- ../test-resources/crop-benchmark/runs/stage1-acceptance-summary.json：本报告的机器可读断言和构建哈希。
- licenses/：实际许可证、上游来源与发布前待确认事项。

```powershell
# web 目录：label 必须不存在
npm test
npm run build
node tests/run-regression.mjs --label stage1-new
node tests/run-regression.mjs --label stage1-new --edge

# test-resources/crop-benchmark 目录
python scripts/verify.py runs/stage1-new-chrome
node scripts/verify-browser.mjs runs/stage1-new-chrome
python scripts/verify.py runs/stage1-new-edge
node scripts/verify-browser.mjs runs/stage1-new-edge --edge
```

## 剩余范围

阶段 2 的默认全图选区、拖动缩放、宽高输入与比例锁定尚未开发；阶段 3 的完整流程和交互验收、阶段 4 容量与设备验收、阶段 5 SEO/发布候选包继续按开发计划执行。真实手机、Safari/Firefox、设备容量、总内存峰值与生产托管尚未验收。嵌入式 WASM 的准确源码/编译来源映射仍为发布前事项，见 licenses/README.md。本轮未执行 Git 提交、push、PR 或发布。
'''
with (ROOT / '阶段1验收报告.md').open('x', encoding='utf-8') as stream:
    stream.write(report)
print(json.dumps({k: {a:v for a,v in r.items() if a != 'runtime'} for k,r in summary['runs'].items()}, ensure_ascii=False, indent=2))
