// Minimal bounded container scanner; independent of decoder defaults.
export function inspectGIF(buffer) {
  const b = new Uint8Array(buffer);
  const text = (start, n) => String.fromCharCode(...b.subarray(start, start + n));
  const u16 = p => b[p] | (b[p + 1] << 8);
  const requireBytes = (p, n) => { if (p + n > b.length) throw new Error('GIF 数据被截断'); };
  requireBytes(0, 13);
  if (!['GIF87a', 'GIF89a'].includes(text(0, 6))) throw new Error('不是有效的 GIF87a/GIF89a');
  const width = u16(6), height = u16(8);
  if (!width || !height || width * height > 16_777_216) throw new Error('GIF 尺寸为零或超出本测试页上限');
  let p = 13 + ((b[10] & 128) ? 3 * (2 ** ((b[10] & 7) + 1)) : 0);
  requireBytes(0, p);
  const frames = [];
  let gce = { delay: 0, disposal: 0, transparentIndex: null };
  let loop = null, trailer = false, plainText = false;
  function subBlocks(capture = false) {
    const data = [];
    while (true) {
      requireBytes(p, 1);
      const size = b[p++];
      if (!size) return data;
      requireBytes(p, size);
      if (capture) for (let i = 0; i < size; i++) data.push(b[p + i]);
      p += size;
    }
  }
  while (p < b.length) {
    const marker = b[p++];
    if (marker === 0x3b) { trailer = true; break; }
    if (marker === 0x21) {
      requireBytes(p, 1);
      const label = b[p++];
      if (label === 0xf9) {
        requireBytes(p, 6);
        if (b[p] !== 4 || b[p + 5] !== 0) throw new Error('GIF 控制扩展格式错误');
        gce = { delay: u16(p + 2) * 10, disposal: (b[p + 1] >> 2) & 7, transparentIndex: b[p + 1] & 1 ? b[p + 4] : null };
        p += 6;
      } else {
        const data = subBlocks(label === 0xff);
        if (label === 0xff && ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(String.fromCharCode(...data.slice(0, 11))) && data[11] === 1) loop = data[12] | (data[13] << 8);
        if (label === 1) { plainText = true; gce = { delay: 0, disposal: 0, transparentIndex: null }; }
      }
    } else if (marker === 0x2c) {
      requireBytes(p, 9);
      const frame = { ...gce, x: u16(p), y: u16(p + 2), width: u16(p + 4), height: u16(p + 6) };
      if (!frame.width || !frame.height || frame.x + frame.width > width || frame.y + frame.height > height) throw new Error('子帧尺寸无效或超出画布');
      const packed = b[p + 8]; p += 9;
      if (packed & 128) p += 3 * (2 ** ((packed & 7) + 1));
      requireBytes(p, 1);
      if (b[p] < 2 || b[p] > 8) throw new Error('LZW 最小码长无效');
      p++; subBlocks(); frames.push(frame);
      if (frames.length * width * height > 300_000_000) throw new Error('总帧像素量超出本测试页上限');
      gce = { delay: 0, disposal: 0, transparentIndex: null };
    } else throw new Error(`未知 GIF 块 ${marker}`);
  }
  if (!frames.length) throw new Error('GIF 没有图像帧');
  return { width, height, frames, loop, trailer, plainText };
}

export function validateCrop(meta, r) {
  if (![r.x, r.y, r.width, r.height].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.width < 1 || r.height < 1 || r.x + r.width > meta.width || r.y + r.height > meta.height) throw new Error('选区必须为原图范围内的正整数像素尺寸');
}
