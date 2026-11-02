import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startRun, loadFile, selectRect, cropAndRead, actualDownload, root, bench } from './ui-support.mjs';

const edge = process.argv.includes('--edge');
const label = process.argv.find(x => x.startsWith('--label='))?.slice(8) || 'stage3-flow';
const run = await startRun(label, edge), { page, out } = run;
const checks = [];
const valid = resolve(root, '../test-resources/codec-corpus/testdata/anim_3frame_rgb.gif');
try {
  assert.equal(await page.locator('#editor').getAttribute('data-state'), 'empty');
  await page.evaluate(() => {
    window.__states = ['empty'];
    new MutationObserver(records => { for (const record of records) if (record.attributeName === 'data-state') window.__states.push(document.getElementById('editor').dataset.state); }).observe(document.getElementById('editor'), { attributes: true });
  });
  const bytes = await readFile(valid);
  assert.equal(await loadFile(page, { name: 'CON.gif', mimeType: 'image/gif', buffer: bytes }), 'ready');
  await selectRect(page, { x: 1, y: 1, width: 2, height: 2 });
  let result = await cropAndRead(page);
  assert.equal(result.state, 'success'); assert.equal(result.matchesWorker, true); assert.equal(result.liveWorkers, 0);
  assert.equal(await actualDownload(page, out, 'first.gif', result.base64), 'gif-CON-crop-2x2.gif');
  await selectRect(page, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(await page.locator('#download').getAttribute('href'), null);
  const second = await cropAndRead(page);
  assert.equal(second.matchesWorker, true); assert.notEqual(second.base64, result.base64);
  await actualDownload(page, out, 'second.gif', second.base64);
  checks.push('empty/ready/success; safe actual filenames; second download matches current Worker bytes');

  const baseline = JSON.parse(await readFile(resolve(bench, 'runs/stage1-final-chrome/runs.json'), 'utf8'));
  const fallback = baseline.find(r => r.details?.final === 'A');
  await loadFile(page, fallback.source); await selectRect(page, fallback.rect);
  result = await cropAndRead(page); assert.equal(result.details.final, 'A'); assert.equal(result.matchesWorker, true);
  await actualDownload(page, out, 'fallback-a.gif', result.base64);
  checks.push('real A fallback download uses current successful bytes');

  const refused = baseline.filter(r => r.errorCode === 'UNSUPPORTED_CROP');
  for (const example of refused) {
    assert.equal(await loadFile(page, example.source), 'ready');
    await selectRect(page, example.rect); result = await cropAndRead(page);
    assert.equal(result.state, 'error'); assert.equal(result.errorCode, 'UNSUPPORTED_CROP');
    assert.match(result.message, /cannot preserve/); assert.equal(result.base64, null); assert.equal(result.liveWorkers, 0);
    await loadFile(page, valid); assert.equal((await cropAndRead(page)).state, 'success');
  }
  checks.push('all three known complex crops refuse without download, then recover');
  await loadFile(page, resolve(root, '../test-resources/codec-corpus/invalid/bad_lzw_code.gif'));
  if (await page.locator('#editor').getAttribute('data-state') === 'ready') {
    result = await cropAndRead(page); assert.equal(result.errorCode, 'CORRUPT_GIF');
    assert.match(result.message, /damaged|incomplete/);
  } else assert.match(await page.locator('#file-error').textContent(), /damaged|incomplete/);
  assert.equal(await page.locator('#download').getAttribute('href'), null);
  await loadFile(page, valid); assert.equal((await cropAndRead(page)).state, 'success');
  checks.push('real corrupt LZW cannot bypass refusal; next valid file succeeds');

  await page.evaluate(() => {
    window.__pulses = 0;
    window.__pulseChannel = new BroadcastChannel('gif-ui-timeout');
    window.__pulseChannel.onmessage = () => window.__pulses++;
    window.__uiTest.mode = 'timeout';
  });
  await page.locator('#crop').click();
  assert.equal(await page.locator('#choose').isDisabled(), true);
  assert.equal(await page.locator('#width').isDisabled(), true);
  assert.equal(await page.locator('#crop').isDisabled(), true);
  assert.equal(await page.locator('#editor').getAttribute('data-state'), 'processing');
  await page.waitForFunction(() => document.getElementById('editor').dataset.state === 'error');
  assert.match(await page.locator('#status').textContent(), /too long/);
  assert.equal(await page.locator('#download').getAttribute('href'), null);
  assert.equal(await page.locator('#crop').isEnabled(), true);
  assert.equal(await page.locator('#original').isVisible(), true);
  await page.waitForTimeout(100);
  const pulses = await page.evaluate(() => window.__pulses);
  assert.ok(pulses > 0);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__pulses), pulses);
  assert.equal(await page.evaluate(() => window.__uiTest.live.size), 0);
  await page.evaluate(() => { window.__uiTest.mode = ''; window.__pulseChannel.close(); });
  result = await cropAndRead(page); assert.equal(result.state, 'success');
  checks.push('controlled UI timeout terminates parent and child; controls and original selection recover');
  assert.equal(result.created, result.terminated);
  assert.equal(result.activePageURLs, 2); // one original + current output, not cumulative
  const stats = { created: result.created, terminated: result.terminated, activePageURLs: result.activePageURLs };
  const states = await page.evaluate(() => window.__states);
  for (const state of ['empty', 'loading', 'ready', 'processing', 'success', 'error']) assert.ok(states.includes(state), state);
  assert.deepEqual(run.errors, []); assert.deepEqual(run.remoteRequests, []);
  await writeFile(resolve(out, 'checks.json'), JSON.stringify({ checks, states: [...new Set(states)], stats, controlledTimeoutMs: 350, postTimeoutChildPulsesStopped: true, errors: run.errors, remoteRequests: run.remoteRequests }, null, 2));
  console.log(JSON.stringify({ checks, stats }));
} finally { await run.close(); }
