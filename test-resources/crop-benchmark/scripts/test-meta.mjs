import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectGIF, validateCrop } from '../src/gif-meta.js';
const load = async name => {
  const bytes = await readFile(new URL(`../../codec-corpus/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
const zero = inspectGIF(await load('valid/delay_0.gif'));
assert.equal(zero.frames[0].delay, 0);
assert.equal(inspectGIF(await load('valid/loop_3.gif')).loop, 3);
assert.equal(inspectGIF(await load('valid/no_loop_ext.gif')).loop, null);
assert.equal(inspectGIF(await load('valid/transparent_bg.gif')).frames[0].transparentIndex, 0);
for (const name of ['empty.gif', 'bad_magic.gif', 'truncated_header.gif', 'truncated_lzw.gif', 'zero_dimensions.gif']) {
  const buffer = await load(`invalid/${name}`);
  assert.throws(() => inspectGIF(buffer));
}
validateCrop(zero, { x: 0, y: 0, width: zero.width, height: zero.height });
assert.throws(() => validateCrop(zero, { x: 0, y: 0, width: 0, height: 1 }));
assert.throws(() => validateCrop(zero, { x: 1, y: 0, width: zero.width, height: 1 }));
assert.throws(() => validateCrop(zero, { x: 0.5, y: 0, width: 1, height: 1 }));
console.log('Raw timing, loop presence, transparency, malformed inputs and crop bounds: PASS');
