import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectGIF, validateCrop } from '../src/gif/inspect.js';
import { readGIFFile } from '../src/gif/client.js';
import { GifError, normalizeError } from '../src/gif/errors.js';
import { LIMITS } from '../src/config.js';

const fixture = await readFile(new URL('../../test-resources/codec-corpus/testdata/anim_3frame_rgb.gif', import.meta.url));
const buffer = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength);
const meta = inspectGIF(buffer);
const hasCode = code => error => error instanceof GifError && error.code === code;

test('limits accept the exact bound and reject the next smaller allowance', () => {
  const bounds = { maxFileBytes: buffer.byteLength, maxCanvasPixels: meta.width * meta.height, maxFrames: 3, maxTotalFramePixels: meta.width * meta.height * 3 };
  assert.equal(inspectGIF(buffer, bounds).frames.length, 3);
  for (const [limit, bound] of Object.entries(bounds)) {
    assert.throws(() => inspectGIF(buffer, { ...bounds, [limit]: bound - 1 }), error => hasCode('RESOURCE_LIMIT')(error) && error.details.limit === limit);
  }
});

test('actual default canvas, frame-count, total-pixel and file-size boundaries', () => {
  // Small encoded local frames isolate scanner limits without allocating full RGBA canvases.
  function container(width, height, frames) {
    const image = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0];
    const bytes = new Uint8Array(19 + frames * image.length + 1);
    bytes.set([71, 73, 70, 56, 57, 97, width & 255, width >> 8, height & 255, height >> 8, 0x80, 0, 0, 0, 0, 0, 255, 255, 255]);
    for (let i = 0; i < frames; i++) bytes.set(image, 19 + i * image.length);
    bytes[bytes.length - 1] = 0x3b;
    return bytes.buffer;
  }
  assert.equal(inspectGIF(container(2048, 2048, 1)).width, 2048);
  assert.throws(() => inspectGIF(container(2049, 2048, 1)), error => error.details.limit === 'maxCanvasPixels');
  assert.equal(inspectGIF(container(1, 1, 500)).frames.length, 500);
  assert.throws(() => inspectGIF(container(1, 1, 501)), error => error.details.limit === 'maxFrames');
  assert.equal(inspectGIF(container(2000, 1000, 30)).frames.length, 30);
  assert.throws(() => inspectGIF(container(2000, 1000, 31)), error => error.details.limit === 'maxTotalFramePixels');
  const padded = new Uint8Array(LIMITS.maxFileBytes);
  padded.set(new Uint8Array(container(1, 1, 1)));
  assert.equal(inspectGIF(padded.buffer).frames.length, 1);
  assert.throws(() => inspectGIF(new ArrayBuffer(LIMITS.maxFileBytes + 1)), error => error.details.limit === 'maxFileBytes');
});

test('oversized file is rejected before reading bytes; empty MIME is accepted', async () => {
  let read = false;
  await assert.rejects(readGIFFile({ size: LIMITS.maxFileBytes + 1, arrayBuffer() { read = true; } }), hasCode('RESOURCE_LIMIT'));
  assert.equal(read, false);
  assert.equal(await readGIFFile({ size: buffer.byteLength, type: '', arrayBuffer: async () => buffer }), buffer);
});

test('invalid headers, truncated data and invalid crop are classified', () => {
  const bad = new Uint8Array(buffer.slice(0)); bad[0] = 0;
  assert.throws(() => inspectGIF(bad.buffer), hasCode('INVALID_GIF'));
  assert.throws(() => inspectGIF(buffer.slice(0, 12)), hasCode('CORRUPT_GIF'));
  assert.throws(() => validateCrop(meta, { x: 0, y: 0, width: 0, height: 1 }), hasCode('UNSUPPORTED_CROP'));
  assert.throws(() => validateCrop(meta, { x: 0, y: 0, width: meta.width + 1, height: 1 }), hasCode('UNSUPPORTED_CROP'));
});

test('unknown errors and memory errors are not called file corruption', () => {
  assert.equal(normalizeError(new Error('unknown exit 1')).code, 'PROCESSING_FAILED');
  assert.equal(normalizeError(new Error('out of memory')).code, 'RESOURCE_LIMIT');
  const timeout = new GifError('TIMEOUT');
  assert.equal(normalizeError(timeout), timeout);
});

test('raw metadata retains loop absence, raw delays and tolerated no-trailer behavior', async () => {
  for (const [file, loop] of [['no_loop_ext.gif', null], ['loop_3.gif', 3]]) {
    const bytes = await readFile(new URL('../../test-resources/codec-corpus/testdata/' + file, import.meta.url));
    assert.equal(inspectGIF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).loop, loop);
  }
  const noTrailer = inspectGIF(buffer.slice(0, -1));
  assert.equal(noTrailer.trailer, false);
  assert.deepEqual(noTrailer.frames.map(f => f.delay), meta.frames.map(f => f.delay));
});
