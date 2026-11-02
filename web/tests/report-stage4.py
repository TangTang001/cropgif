"""Audit saved phase-4 evidence against the current production snapshot."""
from pathlib import Path
import hashlib
import json
import statistics

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT.parent / 'test-resources/crop-benchmark/runs'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
key = lambda r: (r['sample'], r['case'])
summary = dict(stage=4, date='2026-11-02', browsers={})
baseline = {key(r): r for r in read(RUNS/'stage1-final-chrome/runs.json')}
baseline_hashes = read(RUNS/'baseline-output-hashes-summary.json')['outputs']
baseline_diff = {key(r) for r in read(RUNS/'stage1-final-chrome/verification.json')['results'] if r['status']=='DIFF'}
outputs = []
for name in ['chrome', 'edge']:
    folder = RUNS/f'stage4-page1-{name}'
    rows = read(folder/'runs.json')
    environment = read(folder/'environment.json')
    raw = read(folder/'verification.json')['results']
    visual = read(folder/f'browser-verification-{name}.json')['results']
    runtime = read(folder/'runtime-checks.json')
    capacity = read(RUNS/f'stage4-capacity2-{name}/checks.json')
    interaction = read(RUNS/f'stage4-ui1-{name}/checks.json')
    assert len(rows)==159 and len({r['sample'] for r in rows})==45
    valid = [r for r in rows if r.get('output') and r['kind']!='invalid']
    assert len(valid)==148 and sum(bool(r.get('output')) for r in rows)==149
    refused = [r for r in rows if r.get('errorCode')=='UNSUPPORTED_CROP']
    assert len(refused)==3
    assert all(r['failureDetails']['fallbackDetails']['quantizedFrames']>0 for r in refused)
    assert all(r['details']['fallbackDetails']['quantizedFrames']==0 for r in valid if r['details']['final']=='A')
    assert sum(r['kind']=='invalid' and not r.get('output') for r in rows)==7
    assert len(visual)==148 and all(r['pass'] for r in visual)
    for r in raw:
        if r.get('output') and r['kind']!='invalid':
            assert all(r[k] for k in ['size_ok','frames_ok','delays_ok','loop_ok','source_unchanged'])
    assert {key(r) for r in raw if r['status']=='DIFF'}==baseline_diff
    hashes = {}
    for r in rows:
        assert sha(Path(r['source']))==r['sourceSha256']
        old = baseline[key(r)]
        assert bool(r.get('output'))==bool(old.get('output'))
        if r.get('output'):
            assert r['matchesWorker'] and r['liveWorkers']==0
            assert r['created']==r['terminated']
            hashes[key(r)] = sha(folder/r['output'])
            assert hashes[key(r)]==baseline_hashes[r['sample']+'|'+r['case']]
    outputs.append(hashes)
    assert not runtime['errors'] and not runtime['remoteRequests']
    assert runtime['defaultProductLimits']
    assert not capacity['errors'] and not capacity['remoteRequests']
    assert len(capacity['boundaries'])==8
    assert sum(r.get('rejected',False) for r in capacity['boundaries'])==4
    for r in capacity['boundaries']:
        if not r.get('rejected'): assert r['state']=='success' and r['liveWorkers']==0
    assert len(capacity['performance'])==3
    for sample in capacity['performance']:
        tasks = [sample['first'],*sample['subsequent']]
        assert len(tasks)==4 and all(t['activePageURLs']==2 for t in tasks)
        heaps = [t['mainThreadHeapAfterGC'] for t in tasks]
        assert heaps[-1]-heaps[0]<16*1024*1024, 'Main-thread heap growth needs investigation'
        sample['subsequentMedianMs']=statistics.median(t['roundtripMs'] for t in sample['subsequent'])
    assert len(interaction['checks'])==8 and not interaction['errors'] and not interaction['remoteRequests']
    for evidence in [environment['sourceSha256'], interaction['files'], read(RUNS/f'stage4-capacity2-{name}/environment.json')['sourceSha256']]:
        for path, recorded in evidence.items(): assert sha(ROOT/path)==recorded, f'Changed: {path}'
    summary['browsers'][name]=dict(environment=environment, records=159, validOutputs=148, tolerantOutputs=1,
        primaryB=sum(r['details']['final']=='B' for r in valid), fallbackA=sum(r['details']['final']=='A' for r in valid),
        knownUnsupported=[dict(sample=r['sample'],rect=r['rect']) for r in refused], invalidRejected=7,
        rawMetadataPassed=148, browserPixelsPassed=148, pillowReferenceDifferences=len(baseline_diff),
        actualDownloadsMatchingCurrentTask=149, byteIdenticalToStage1=149, interaction=interaction['checks'], capacity=capacity)
assert outputs[0]==outputs[1]
summary['crossBrowserIdenticalDownloads']=149
dist = [str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/'dist').rglob('*') if p.is_file()]
assert len(dist)==4 and all(p.endswith(('.html','.js','.css')) for p in dist)
summary['productionFiles']=dist
(RUNS/'stage4-acceptance-summary.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
lines = ['# GIF Crop 正式页面验收报告', '', '日期：2026-11-02。状态：阶段 3、4 已完成本机桌面验收。范围为第一版开发计划的结果/下载/恢复、完整正确性回归、容量与浏览器验收；SEO 与发布准备属于阶段 5。', '',
    '## 版本与设备', '',
    'Windows；Intel Core i7-13700H，约 16 GiB 系统内存。Chrome 155.0.8059.39、Edge 156.0.4314.58，均使用实际安装浏览器的 headless 模式。Vite 7.1.7、gifsicle-wasm-browser 1.5.19、gifuct-js 2.1.2、gifenc 1.0.3。生产 Worker 和处理核心与阶段 1 一致。', '',
    '13 项 Node 定向检查通过，生产构建通过。所有页面验收运行生产静态预览；无意外远程 HTTP 请求，无页面异常、浏览器退出或错误结果成功交付。源码与构建哈希逐项核对，详见机器摘要。', '',
    '## 完整页面回归', '',
    '| 检查 | Chrome | Edge |', '|---|---:|---:|',
    '| 输入 / 选区记录 | 45 / 159 | 45 / 159 |',
    '| 有效输出：原始元数据及浏览器逐帧画面通过 | 148 | 148 |',
    '| B 主处理 / A 兜底 | 116 / 32 | 116 / 32 |',
    '| 已知复杂合法选区拒绝 | 3 | 3 |',
    '| 明确异常输入拒绝 / no_trailer 容错接受 | 7 / 1 | 7 / 1 |',
    '| 实际浏览器下载，字节等于当前任务及阶段 1 基线 | 149 | 149 |', '',
    '总计 318 条正式 UI 记录、298 次实际下载。两浏览器全部 149 对下载逐字节一致。使用默认产品限制，未放宽限制以通过正确性测试。文件由真实选择入口载入，选区经宽高和键盘操作进入同一状态，实际点击 Crop 并下载；没有绕过页面直接调用实验引擎。', '',
    '原始 GIF 块独立核对画布、帧数、逐帧原始延迟、循环扩展；浏览器 ImageDecoder 按合成播放时间线核对 alpha 和可见 RGB，296 个有效输出检查均通过。两浏览器属于 Chromium 家族，此项不证明跨浏览器引擎一致性。Pillow 参考仍有原来同一组 23 条画面差异，两侧差异集合与阶段 1 相同，单列保存，不用 Pillow 的通过数量代替浏览器正确性。', '',
    '已知拒绝仍是 hybrid-511colors-disposal1/2/3 的 (0,0,32,16) palette-union 选区，原因是 A 需要量化，均未交付；成功 A 输出的 quantizedFrames 全为 0。真实损坏输入不会借 A 绕过。拒绝原因按内容和诊断路由，生产代码没有按样本文件名选择引擎。', '',
    '## 交互、下载与恢复', '',
    '阶段 3 在两侧分别验证六种任务状态、当前任务实际下载、第二次不同裁剪下载、真实 A 兜底、三个已知拒绝后的恢复、损坏 LZW 后恢复、受控超时后恢复。每侧 Worker 创建/终止 26/26，最终页面 URL 仅原图与当前结果两个。60 秒产品超时通过测试注入缩短至 350ms 验证整个任务树终止，原图/选区保留且可再次处理；不把超时归为文件损坏。详见阶段3验收报告.md。', '',
    '最终代码重新通过桌面八向手柄、1×1 选区、宽高草稿、Square、键盘移动/缩放、窗口变化、滚动前及捕获中滚动、125% CSS zoom 和页面合成缩放、390px 无横向溢出、触摸移动/缩放/取消、矩形及正方形逐帧导出核验；已查看桌面和窄屏截图。触摸为 CDP 模拟，不冒充真机。', '',
    '## 确认的防护配置与容量边界', '',
    '| 限制 | 恰好达到限制的测试 | 首个超限测试 | 两侧结果 |', '|---|---|---|---|',
    '| 文件 20 MiB | 合法 GIF 注释填充至 20,971,520 字节 | 再增加 1 字节 | 接受并处理 / 提前拒绝 |',
    '| 画布 4,194,304 像素 | 2048×2048 | 2049×2048 | 接受并处理 / 提前拒绝 |',
    '| 500 帧 | 1×1、500 帧 | 501 帧 | 接受并处理 / 提前拒绝 |',
    '| 总帧像素 60,000,000 | 2000×1000、30 帧 | 31 帧 | 接受并处理 / 提前拒绝 |',
    '| 请求 60 秒 | 产品配置保持 60,000ms | 受控超时任务 | 实际终止，之后可恢复 |', '',
    '每侧 8 项容量边界检查均通过，维持以上配置。边界样本使用稀疏子帧或注释填充，导出选区 1×1，以隔离限制机制；不推断任意同等文件大小、画布、帧数的动画均可稳定处理。1024×768、60 帧的正常图案另在完整回归中实际全图导出并通过逐帧核验。各限制同时生效，不表示 4M 画布和 500 帧可同时使用。', '',
    '## 性能与页面响应', '',
    '性能任务串行运行。往返计时从发送 Worker 请求至收到最终消息，排除测试读取/转码和下载开销；Worker 内耗时另外保存。首次是该样本/选区本轮首次任务，后续为三次任务中位数。每次都新建 Worker，后续耗时不证明复用 WASM 实例；未声称单独测得纯 WASM 初始化耗时。', '',
    '| 浏览器 | 样本 / 选区 / 最终引擎 | 首次往返 ms | 首次 Worker 内 ms | 后续中位数 ms | 输出字节 |', '|---|---|---:|---:|---:|---:|']
for name,b in summary['browsers'].items():
    for sample in b['capacity']['performance']:
        first = sample['first']
        label = '1024×768、60 帧图案 / 512×384' if 'pattern-' in sample['sample'] else ('真实动画 / 全图' if sample['rect']['width']==480 else '真实动画 / 240×240')
        lines.append(f"| {name} | {label} / {first['finalEngine']} | {first['roundtripMs']:.1f} | {first['workerProcessingMs']:.1f} | {sample['subsequentMedianMs']:.1f} | {first['outputBytes']} |")
lines += ['', '运行中记录 requestAnimationFrame 心跳、最大间隔及任务后 Worker/URL 数量。每次处理后主线程强制 GC 的堆读数无持续增长；只用于发现明显主线程保留，既不是自然 GC 下的内存曲线，也不包括全部 Worker/WASM/图像缓存和浏览器进程峰值。没有在手机上确认容量，不将防护上限写成全设备支持承诺。', '',
    '## 证据与复现', '',
    '机器摘要：../test-resources/crop-benchmark/runs/stage4-acceptance-summary.json；其中包含实际设备、源码/构建哈希、路由计数、容量和性能记录。baseline-output-hashes-summary.json 保存原阶段 1 的 149 个输出哈希，避免为字节对照提交大体积旧输出。', '',
    '完整本机证据：runs/stage4-page1-chrome 与 -edge（159 条记录、实际下载、原始元数据及逐帧比较）；stage4-ui1-chrome 与 -edge（交互截图/检查）；stage4-capacity2-chrome 与 -edge（最终容量/性能）；stage3-flow1-chrome 与 -edge（恢复与超时）。测试 GIF、截图、差异图在本机保留并由 Git 忽略，可按脚本重建。', '',
    '```powershell', '# web 目录，label 必须不存在', 'npm test', 'npm run build',
    'node tests/run-flow.mjs --label=my-flow', 'node tests/run-flow.mjs --label=my-flow --edge',
    'node tests/run-page-regression.mjs --label=my-page', 'node tests/run-page-regression.mjs --label=my-page --edge',
    '# test-resources/crop-benchmark 目录', 'python scripts/verify.py runs/my-page-chrome', 'node scripts/verify-browser.mjs runs/my-page-chrome',
    'python scripts/verify.py runs/my-page-edge', 'node scripts/verify-browser.mjs runs/my-page-edge --edge',
    '# 回到 web，性能单独串行', 'node tests/run-interaction.mjs --label=my-ui', 'node tests/run-interaction.mjs --label=my-ui --edge',
    'node tests/run-capacity.mjs --label=my-capacity', 'node tests/run-capacity.mjs --label=my-capacity --edge',
    '# report-stage4.py 审计本报告固定标签；如换标签，调整该文件中的输入路径', 'python tests/report-stage4.py', '```', '',
    '## 支持范围与后续', '',
    '已验收：本机桌面 Chrome/Edge 的正式静态页面和上述样本。未验收：真实 Android/iOS 文件选择、触摸与保存，Safari/Firefox，其他设备容量及总进程内存峰值。未测浏览器不列为首发支持；桌面窄屏及 CDP 触摸不替代真机。', '',
    '生产构建只有 4 个 HTML/JS/CSS 文件，不包含测试/用户 GIF、SDK、工具链或测试入口。下一阶段是 SEO/发布候选包、托管配置和许可证来源材料；底层 WASM 源码/编译来源映射仍按 licenses/README.md 留作发布前事项。发布和外部账号配置需要明确授权。']
(ROOT/'验收报告.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Phase 4 audit passed: two browsers, 318 UI cases, 298 actual downloads, 296 valid visual/metadata checks.')
