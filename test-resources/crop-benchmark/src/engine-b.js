import gifsicle from 'gifsicle-wasm-browser';

// Upstream's helper uses `value instanceof Element`, but Element does not exist
// in a Worker. All our inputs are plain arrays/Blob/ArrayBuffer, not DOM nodes.
gifsicle.tool.testType = value => Object.prototype.toString.call(value).slice(8, -1).toLowerCase();

// Experimental diagnostic adapter for the pinned 1.5.19 wrapper. Keep its core
// and baseline path intact; expose the CLI return value and all stderr lines.
export async function cropBDiagnostic(buffer, r) {
  const marker = 'n=t(o,i)';
  const source = gifsicle.tool.workerLocalUrl;
  if (source.split(marker).length !== 2) throw new Error('B 诊断适配与当前库版本不符');
  const prefix = `const diagnostics=[];console.error=(...args)=>{if(diagnostics.length<128)diagnostics.push(args.join(' ').slice(-16384));};const send=self.postMessage.bind(self);self.postMessage=value=>send({value,diagnostics,exitCode:self.__cropExitCode});`;
  const patched = source.replace(marker, '(self.__cropExitCode=n=t(o,i))');
  const url = URL.createObjectURL(new Blob([prefix, patched], { type: 'text/javascript' }));
  const worker = new Worker(url);
  const command = `--crop ${r.x},${r.y}+${r.width}x${r.height} input.gif -o /out/result.gif --logical-screen ${r.width}x${r.height}`;
  try {
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => resolve(data);
      worker.onerror = e => reject(new Error(e.message));
      worker.postMessage({ data: [{ name: 'input.gif', file: buffer.slice(0) }], command: [command], folder: [], isStrict: false });
    });
    const lines = [...new Set(result.diagnostics.flatMap(s => s.split('\n')).map(s => s.trim()).filter(Boolean))];
    const details = { command, exitCode: result.exitCode, diagnostics: lines, adapter: 'pinned wrapper JS diagnostics and CLI return capture; GIF core unchanged' };
    if (result.exitCode !== 0 || lines.some(s => /read error|corrupt|truncat|fatal|out of memory/i.test(s))) {
      throw Object.assign(new Error(`B 输入错误：${lines.join('\n') || result.value || result.exitCode}`), { details });
    }
    if (lines.some((s, i) => !/warning: (too many colors, using local colormaps|background color not in colormap)/.test(s) && !(i > 0 && lines[i-1].includes('warning: too many colors, using local colormaps') && /^\(You may want to try .*--colors 256.*\.\)$/.test(s)))) {
      throw Object.assign(new Error(`B 未分类诊断，拒绝自动兜底：${lines.join('\n')}`), { details });
    }
    const file = Array.isArray(result.value) && result.value.find(f => f.name === 'result.gif');
    if (!file) throw Object.assign(new Error('B 未生成输出，拒绝自动兜底'), { details });
    return { bytes: new Uint8Array(file.file), details };
  } finally { worker.terminate(); URL.revokeObjectURL(url); }
}

export async function cropB(buffer, r, strict = false, unoptimize = false) {
  const command = `${unoptimize ? '--unoptimize ' : ''}--crop ${r.x},${r.y}+${r.width}x${r.height} input.gif -o /out/result.gif`;
  const files = await gifsicle.run({ input: [{ file: new Blob([buffer], { type: 'image/gif' }), name: 'input.gif' }], command: [command], isStrict: strict });
  const file = files.find(f => f.name === 'result.gif') || files[0];
  if (!file) throw new Error('Gifsicle 未生成输出');
  return { bytes: new Uint8Array(await file.arrayBuffer()), details: { command, isStrict: strict, adapter: 'worker-safe type detection; no GIF engine modifications' } };
}
