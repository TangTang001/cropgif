import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startRun } from './ui-support.mjs';

const edge = process.argv.includes('--edge');
const label = process.argv.find(x => x.startsWith('--label='))?.slice(8) || 'stage5-publication';
const run = await startRun(label, edge);
const { page, out } = run;
const base = new URL(page.url()).origin;
const checks = [];
try {
  for (const path of ['/', '/privacy/', '/licenses/']) {
    const response = await page.goto(base + path);
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://gifcroplab.com' + path);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path + ' width ' + width);
      await page.screenshot({ path: resolve(out, `${path === '/' ? 'home' : path.split('/')[1]}-${width}.png`), fullPage: true });
    }
    checks.push(path + ': HTTP 200, canonical, single H1, desktop and 390px no overflow');
  }
  for (const path of ['/robots.txt', '/sitemap.xml', '/favicon.svg', '/social.png', '/licenses/gifsicle-COPYING.txt']) {
    const response = await page.request.get(base + path);
    assert.equal(response.status(), 200, path);
    assert.ok((await response.body()).length > 0, path);
  }
  await page.goto(base);
  assert.equal(await page.locator('footer a[href="https://github.com/TangTang001/cropgif"]').count(), 1);
  await page.locator('footer a[href="/privacy/"]').click();
  assert.equal(new URL(page.url()).pathname, '/privacy/');
  checks.push('static files served; privacy navigation and GitHub support entry present');
  assert.deepEqual(run.errors, []);
  assert.deepEqual(run.remoteRequests, []);
  await writeFile(resolve(out, 'checks.json'), JSON.stringify({ checks, errors: run.errors, remoteRequests: run.remoteRequests }, null, 2));
  console.log(JSON.stringify({ checks }));
} finally { await run.close(); }
