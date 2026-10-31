"""Assemble the engine decision from saved runs; never infer missing passes."""
from pathlib import Path
import hashlib
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
suite = read(ROOT/'suite-hybrid.json')
summary = dict(suiteSha256=sha(ROOT/'suite-hybrid.json'), inputFiles=len(suite), changedInputs=[s['name'] for s in suite if sha(Path(s['path'])) != s['sha256']], runs={})
assert not summary['changedInputs']
sets = []
for browser in ['chrome','edge']:
    directory = ROOT/'runs'/f'hybrid-final-{browser}'
    rows = read(directory/'runs.json')
    visual = read(directory/f'browser-verification-{browser}.json')
    ui = read(directory/'ui-checks.json')
    good = [r for r in rows if r['kind'] != 'invalid']
    delivered = [r for r in good if r.get('output')]
    assert len(visual['results']) == len(delivered)
    assert all(r['pass'] for r in visual['results'])
    assert not ui['browserErrors']
    assert all(ui[k] for k in ['bothEnginesRendered','staleDownloadHidden','invalidFileAndRecovery','noHorizontalOverflow'])
    assert all(r['recovery'] == 'same worker accepted subsequent valid file' for r in rows if r['kind'] == 'invalid')
    summary['runs'][browser] = dict(browserVersion=visual['browser'],cases=len(rows),validAndEdgeCases=len(good),correctDelivered=len(delivered),primaryB=sum(r['details']['final']=='B' for r in delivered),fallbackA=sum(r['details']['final']=='A' for r in delivered),unsupported=[dict(sample=r['sample'],case=r['case'],details=r.get('failureDetails')) for r in good if not r.get('output')],invalidRejected=sum(r['kind']=='invalid' and not r.get('output') for r in rows),tolerantInputs=[r['sample'] for r in rows if r['kind']=='invalid' and r.get('output')],ui=ui)
    sets.append((directory,rows))

def key(r): return (r['sample'],r['case'])
other = {key(r):r for r in sets[1][1]}
equal = 0
for r in sets[0][1]:
    b = other[key(r)]
    assert bool(r.get('output')) == bool(b.get('output'))
    assert r.get('details',{}).get('final') == b.get('details',{}).get('final')
    assert r.get('details',{}).get('fallbackReasons') == b.get('details',{}).get('fallbackReasons')
    assert r.get('failureDetails') == b.get('failureDetails')
    if r.get('output'):
        assert sha(sets[0][0]/r['output']) == sha(sets[1][0]/b['output'])
        equal += 1
summary['crossBrowserIdenticalOutputFiles'] = equal
raw = read(sets[0][0]/'verification.json')['results']
raw = [r for r in raw if r['kind']!='invalid' and r.get('output')]
assert all(all(r[k] for k in ['source_unchanged','size_ok','frames_ok','delays_ok','loop_ok']) for r in raw)
summary['rawMetadataPassed'] = len(raw)
summary['viteBuild'] = 'PASS (local build; not WASM compilation)'
summary['gifMetaChecks'] = 'PASS'
summary['wasm198'] = 'not built; toolchain download remains paused'
summary['decision'] = 'Adopt conditional B-to-A for a bounded desktop-Chromium first version; refuse unsupported crops and known corrupt inputs. Not a universal GIF correctness guarantee.'
with (ROOT/'runs/hybrid-validation-summary.json').open('x',encoding='utf-8') as stream:
    json.dump(summary,stream,ensure_ascii=False,indent=2)

c = summary['runs']['chrome']
for result in summary['runs'].values():
    assert (result['cases'],result['validAndEdgeCases'],result['correctDelivered'],result['primaryB'],result['fallbackA'],len(result['unsupported']),result['invalidRejected']) == (159,151,148,116,32,3,7)
report = f'''# 双引擎验证最终结论

日期：2026-10-30。

## 决策

建议第一版采用 **B 主处理、A 有条件兜底、超出能力明确拒绝**。本轮验证支持这条受限路径，不支持“任意 GIF 都可无损处理”或“自动修复所有 GIF”的承诺。无需将完成 1.98 WASM 编译作为这条路径的前置条件；该下载保持暂停。

## 测试范围与结果

保留原有 38 个输入，新增 7 个确定性生成样本：255 色和 511 色分别与 disposal 1/2/3 组合，以及 1 个损坏 LZW 的组合样本。新清单 suite-hybrid.json 共 {len(suite)} 个输入；原清单 suite.json 未替换。六个正常新样本的三帧结构及第二帧的 255/511 色数量有独立 Pillow 检查记录；损坏样本使用 clear 后引用未定义码的 LZW 流。

| 指标 | Chrome | Edge |
|---|---:|---:|
| 输入数 | 45 | 45 |
| 裁剪记录 | 159 | 159 |
| 正常/边界选区 | 151 | 151 |
| 交付且通过画面检查 | 148 | 148 |
| 其中 B 直接交付 | 116 | 116 |
| 其中 A 兜底交付 | 32 | 32 |
| 能力不足，拒绝输出的合法选区 | 3 | 3 |
| 拒绝的明确异常输入 | 7 | 7 |
| 缺结束标记，容错接受 | 1 | 1 |

Chrome {c['browserVersion']}；Edge {summary['runs']['edge']['browserVersion']}。有效输出逐帧检查尺寸、alpha、可见 RGB 和播放总时长，148/148 通过；原始 GIF 块检查帧数、逐帧延迟和循环字段也全部符合。两侧 159 条记录的接受/拒绝及路由一致，全部 149 个输出文件逐字节一致（含 1 个 no_trailer 容错输出）。45 个输入哈希未变。

原先两个 disposal 的 1×1 失败样本通过 A 兜底解决，原先 511 色全图样本由 B 直接处理并通过。新增 255 色组合选区均可交付；新增 511 色组合各有一个 palette-union 选区被拒绝，其余已交付选区均正确。

## 固定路由

1. 共享容器校验后运行 B，显式指定输出逻辑画布为裁剪尺寸。
2. 收集完整诊断和核心返回码。非零退出或明确的数据损坏诊断直接拒绝，不切 A。
3. 只放行已核实的调色板警告及其固定续行；未知诊断直接拒绝。本轮不使用“任何警告都拒绝”，也不使用“忽略所有警告”。
4. 检查 B 输出尺寸、帧数、逐帧延迟、循环字段。符合则交付 B；不符合则尝试 A。
5. A 的 quantizedFrames 必须为零，且元数据检查合格，才交付 A；否则明确拒绝。

选择条件只依赖输入、选区、引擎诊断及输出检查，不按文件名挑引擎。测试时的浏览器画面比较属于独立离线验收，未冒充产品运行时每次都有像素正确性证明。

## 拒绝案例说明

hybrid-511colors-disposal1/2/3.gif 的 palette-union 选区均为 x=0,y=0,width=32,height=16。B 合并了帧并改变逐帧延迟；A 改写完整帧需要量化，quantizedFrames=3，因此被保护规则拒绝。disposal1 对照也被拒绝，说明帧合并本身会触发既定“不改变帧数”的要求，不能把所有拒绝归因于透明处置错误。这些文件在其他选区可正常处理，不能把整个文件标成损坏。

本轮没有把“视觉等价但合帧”自动视为合格，也没有默默放宽原定的帧数保持要求。若将来放宽该要求，需要另行验证时间线正确性。

## 第一版页面策略

- 自动切换引擎，界面不要求用户理解 A/B。
- 有明确证据损坏：提示“GIF 文件数据损坏或不完整，无法裁剪，请重新导出后再试”。
- 合法但当前选区无法处理：提示“暂时无法在保持颜色和动画信息的情况下裁剪此选区，请调整选区或更换文件”。不显示“GIF 有问题”。
- 未分类诊断：提示“暂时无法处理此 GIF”，不声称已确定文件损坏。
- 暂不加“修复成正确 GIF”按钮。转换可能沿用同一引擎限制，或改变颜色、透明和帧结构；当前没有通用修复能力的证据。

这只是页面策略结论，实验页仍显示验证数据和引擎选项，尚未开发正式产品交互。

## 工程验证和边界

Chrome/Edge 的实际 Worker、动画预览、GIF 下载、JSON 下载、选区改变后隐藏旧下载、错误恢复和 390px 布局均通过。8 个异常输入处理后，同一 Worker 均能继续处理正常文件。本轮 Vite 构建、JS 语法和 GIF 元数据定向检查通过。

B 为现有基于 1.92 的 WASM，诊断适配只改封装 JS、记录退出码及 stderr，不改 GIF 核心算法；适配与固定版本绑定，升级依赖须重新核查。A 为现有 gifuct-js + gifenc。1.98 WASM 没有构建或测试。

两个浏览器均为 Chromium；未覆盖 Safari、Firefox、手机真机、浏览器总内存峰值或任意 GIF 的普遍正确性。Plain Text 边界样本只核对浏览器显示图像，不能证明文字扩展被渲染。样本通过率不是线上文件成功率估计。Pillow 的背景解释差异继续单列，不替代浏览器画面比较。

## 证据与复现

- runs/hybrid-final-chrome：Chrome 159 条路由、输出、逐帧检查、原始元数据和 UI 记录。
- runs/hybrid-final-edge：Edge 对应记录和逐帧检查。
- runs/hybrid-validation-summary.json：两侧一致性、输入哈希及验收汇总。
- runs/hybrid-probe-chrome：开发探针，含警告续行分类修正前的数据，不混入最终统计。

```powershell
# 新标签不覆盖已有结果；先跑生成器仅用于首次创建扩展清单
node scripts/run-browser.mjs --label hybrid-new --suite suite-hybrid.json --engines H
node scripts/verify-browser.mjs runs/hybrid-new-chrome
node scripts/run-browser.mjs --label hybrid-new --suite suite-hybrid.json --engines H --edge
node scripts/verify-browser.mjs runs/hybrid-new-edge --edge
```
'''
with (ROOT/'双引擎验证最终结论.md').open('x',encoding='utf-8') as stream:
    stream.write(report)
print(json.dumps(summary,ensure_ascii=False))
