import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startRun, loadFile, selectRect, cropAndRead, actualDownload, sha, bench } from './ui-support.mjs';

const edge = process.argv.includes('--edge');
const label = process.argv.find(x => x.startsWith('--label='))?.slice(8) || 'stage4-page';
const run = await startRun(label, edge), { page, out } = run;
const suite = JSON.parse(await readFile(resolve(bench, 'suite-hybrid.json'), 'utf8'));
const baseline = JSON.parse(await readFile(resolve(bench, 'runs/stage1-final-chrome/runs.json'), 'utf8'));
const baselineHashes = JSON.parse(await readFile(resolve(bench, 'runs/baseline-output-hashes-summary.json'), 'utf8')).outputs;
const rows = [];
try {
  for (const sample of suite) {
    assert.equal(sha(await readFile(sample.path)), sample.sha256);
    const state = await loadFile(page, sample.path);
    const w = Math.max(1, Math.floor((sample.width || 1) / 2)), h = Math.max(1, Math.floor((sample.height || 1) / 2));
    let cases = [
      ['full', { x: 0, y: 0, width: sample.width || 1, height: sample.height || 1 }],
      ['center', { x: Math.floor(((sample.width || 1) - w) / 2), y: Math.floor(((sample.height || 1) - h) / 2), width: w, height: h }],
      ['edge', { x: (sample.width || 1) - w, y: (sample.height || 1) - h, width: w, height: h }],
      ['pixel', { x: 0, y: 0, width: 1, height: 1 }],
      ...(sample.crops || []).map(c => [c.name, c.rect]),
    ];
    if (sample.kind === 'invalid') cases = cases.slice(0, 1);
    cases = cases.filter((c, i, all) => all.findIndex(a => JSON.stringify(a[1]) === JSON.stringify(c[1])) === i);
    for (const [name, rect] of cases) {
      const row = { sample: sample.name, source: sample.path, sourceSha256: sample.sha256, kind: sample.kind, performance: sample.performance, engine: 'H-production-page', case: name, rect };
      const old = baseline.find(r => r.sample === sample.name && r.case === name);
      assert.ok(old);
      if (state === 'error') {
        row.error = await page.locator('#status').textContent();
        row.errorCode = /Only GIF|valid GIF/.test(row.error) ? 'INVALID_GIF' : /damaged|incomplete/.test(row.error) ? 'CORRUPT_GIF' : 'PROCESSING_FAILED';
        row.rejectedAtLoad = true;
      } else {
        await selectRect(page, rect);
        const result = await cropAndRead(page);
        assert.deepEqual(result.requestRect, rect);
        assert.equal(result.liveWorkers, 0);
        assert.equal(result.created, result.terminated);
        if (result.base64) {
          assert.equal(result.matchesWorker, true);
          row.output = `${sample.id}-H-production-page-${name}.gif`;
          row.actualDownloadName = await actualDownload(page, out, row.output, result.base64);
          row.outputSHA256 = sha(Buffer.from(result.base64, 'base64'));
          assert.ok(old.output, 'Previously rejected crop unexpectedly delivered');
          assert.equal(row.outputSHA256, baselineHashes[`${sample.name}|${name}`], `${sample.name} ${name} changed bytes`);
          delete result.base64;
          Object.assign(row, result);
        } else {
          row.error = result.message; row.errorCode = result.errorCode; row.failureDetails = result.failureDetails;
          assert.ok(!old.output, 'Previously successful crop rejected');
        }
      }
      if (!row.output) assert.ok(!old.output, `${sample.name} failed at file load`);
      rows.push(row);
    }
    await writeFile(resolve(out, 'runs.json'), JSON.stringify(rows, null, 2));
    console.log(`${sample.name}: ${cases.length} cases; ${rows.filter(r => r.sample === sample.name && r.output).length} actual downloads`);
  }
  assert.equal(rows.length, 159);
  assert.equal(rows.filter(r => r.output && r.kind !== 'invalid').length, 148);
  assert.equal(rows.filter(r => r.output).length, 149);
  assert.equal(rows.filter(r => r.errorCode === 'UNSUPPORTED_CROP').length, 3);
  assert.equal(rows.filter(r => r.kind === 'invalid' && !r.output).length, 7);
  assert.deepEqual(run.errors, []); assert.deepEqual(run.remoteRequests, []);
  await writeFile(resolve(out, 'runtime-checks.json'), JSON.stringify({ errors: run.errors, remoteRequests: run.remoteRequests, allDownloadedBytesMatchCurrentTask: true, allSuccessfulOutputsMatchStage1: true, defaultProductLimits: true }, null, 2));
  console.log(`Verified 159 UI cases and 149 actual downloads: ${out}`);
} finally { await run.close(); }
