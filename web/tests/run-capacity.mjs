import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startRun, loadFile, selectRect, cropAndRead, bench } from './ui-support.mjs';

const edge = process.argv.includes('--edge');
const label = process.argv.find(x => x.startsWith('--label='))?.slice(8) || 'stage4-capacity';
const run = await startRun(label, edge), { page, out } = run;
const records = [], performance = [];
function container(width, height, frames = 1, targetBytes) {
  const frame = Buffer.from([0x21,0xf9,4,4,1,0,0,0, 0x2c,0,0,0,0,1,0,1,0,0,2,2,0x44,1,0]);
  const header = Buffer.from([71,73,70,56,57,97,width&255,width>>8,height&255,height>>8,0x80,0,0,0,0,0,255,255,255]);
  const length = targetBytes || header.length + frames * frame.length + 1;
  const result = Buffer.alloc(length); header.copy(result);
  let p = header.length;
  if (targetBytes) {
    result[p++] = 0x21; result[p++] = 0xfe;
    let remaining = length - p - 1 - frames * frame.length - 1;
    while (remaining > 0) {
      let n = Math.min(255, remaining - 1);
      if (remaining - n - 1 === 1) n--;
      assert.ok(n > 0); result[p++] = n; p += n; remaining -= n + 1;
    }
    result[p++] = 0;
  }
  for (let i = 0; i < frames; i++) { frame.copy(result, p); p += frame.length; }
  result[p++] = 0x3b; assert.equal(p, length);
  return result;
}
try {
  const fixtures = resolve(out, 'fixtures'); await mkdir(fixtures);
  const boundaryCases = [
    ['file-exact', container(1,1,1,20*1024*1024), true],
    ['file-over', Buffer.concat([container(1,1,1,20*1024*1024),Buffer.from([0])]), false],
    ['canvas-exact', container(2048,2048), true],
    ['canvas-over', container(2049,2048), false],
    ['frames-exact', container(1,1,500), true],
    ['frames-over', container(1,1,501), false],
    ['total-exact', container(2000,1000,30), true],
    ['total-over', container(2000,1000,31), false],
  ];
  for (const [name, bytes, accepted] of boundaryCases) {
    const path = resolve(fixtures, `${name}.gif`); await writeFile(path, bytes);
    const start = Date.now();
    const state = await loadFile(page, path);
    assert.equal(state, accepted ? 'ready' : 'error', name);
    if (accepted) {
      await selectRect(page, { x:0,y:0,width:1,height:1 });
      const result = await cropAndRead(page);
      assert.equal(result.state, 'success', name); assert.equal(result.matchesWorker, true); assert.equal(result.liveWorkers, 0);
      delete result.base64; records.push({ name, inputBytes: bytes.length, ...result });
    } else {
      const text = await page.locator('#file-error').textContent(); assert.match(text, /processing limits/, name);
      assert.equal(await page.locator('#download').getAttribute('href'), null);
      records.push({ name, inputBytes: bytes.length, rejected: true, message: text, elapsedMs: Date.now()-start });
    }
    console.log(`boundary ${name}: ${accepted ? 'accepted and processed' : 'early refusal'}`);
  }
  const baseline = JSON.parse(await readFile(resolve(bench, 'runs/stage1-final-chrome/runs.json'), 'utf8'));
  const chosen = [
    baseline.find(r => r.sample === 'generated/pattern-1024x768-60f.gif' && r.case === 'center'),
    baseline.find(r => r.sample === 'testdata/123D_Make_Trifoil_Cardboard.gif' && r.case === 'full'),
    baseline.find(r => r.sample === 'testdata/123D_Make_Trifoil_Cardboard.gif' && r.case === 'center'),
  ];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  for (const sample of chosen) {
    assert.ok(sample); assert.equal(await loadFile(page, sample.source), 'ready'); await selectRect(page, sample.rect);
    const samples = [];
    for (let i = 0; i < 4; i++) {
      const result = await cropAndRead(page);
      assert.equal(result.state, 'success'); assert.equal(result.details.final, sample.details.final); assert.equal(result.liveWorkers, 0);
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics } = await cdp.send('Performance.getMetrics');
      samples.push({ roundtripMs: result.firstRoundtripMs, workerProcessingMs: result.processingMs, outputBytes: result.outputBytes,
        finalEngine: result.details.final, animationTicks: result.animationTicks, maxAnimationGapMs: result.maxAnimationGapMs,
        mainThreadHeapAfterGC: metrics.find(m => m.name === 'JSHeapUsedSize').value, activePageURLs: result.activePageURLs });
      assert.equal(result.activePageURLs, 2);
      assert.ok(result.firstRoundtripMs < 60000);
      // A long task must leave the main page producing frames.
      if (result.firstRoundtripMs > 1000) assert.ok(result.animationTicks > 0 && result.maxAnimationGapMs < 1000);
    }
    performance.push({ sample: sample.sample, rect: sample.rect, first: samples[0], subsequent: samples.slice(1),
      note: 'Every task creates new processing and child Workers. Subsequent tasks do not prove WASM instance reuse. Heap is main-thread only after forced GC, not total or peak process memory.' });
    console.log(`performance ${sample.sample} ${sample.case}: ${samples.map(s => s.roundtripMs.toFixed(1)).join(', ')} ms`);
  }
  assert.deepEqual(run.errors, []); assert.deepEqual(run.remoteRequests, []);
  await writeFile(resolve(out, 'checks.json'), JSON.stringify({ boundaries: records, performance, errors: run.errors, remoteRequests: run.remoteRequests, capacityClaim: 'Protective configuration checked on these fixtures and this desktop only; not a universal file/device capacity guarantee.' }, null, 2));
} finally { await run.close(); }
