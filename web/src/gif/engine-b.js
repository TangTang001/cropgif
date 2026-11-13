import { GifError } from './errors.js';
import { createChildWorker } from './child-worker.js';
import gifsicle from 'gifsicle-wasm-browser';

// Upstream's helper uses `value instanceof Element`, but Element does not exist
// in a Worker. All our inputs are plain arrays/Blob/ArrayBuffer, not DOM nodes.
gifsicle.tool.testType = value => Object.prototype.toString.call(value).slice(8, -1).toLowerCase();

// Diagnostic adapter for the pinned 1.5.19 wrapper. Keep its core
// and baseline path intact; expose the CLI return value and all stderr lines.
export function cropBDiagnostic(buffer, r) {
  return runGifsicle(buffer, `--crop ${r.x},${r.y}+${r.width}x${r.height} input.gif -o /out/result.gif --logical-screen ${r.width}x${r.height}`);
}

export function resizeB(buffer, { width, height }) {
  return runGifsicle(buffer, `--resize-method sample --resize ${width}x${height} input.gif -o /out/result.gif`);
}

export function checkGifsicleInput(buffer) {
  return runGifsicle(buffer, 'input.gif -o /out/result.gif');
}

export function compressB(buffer, { colors, target }) {
  const flags = ['-O2', '-Okeep-empty'];
  if (colors) flags.push('--colors', colors, '--no-dither');
  if (target) flags.push('--resize-method', 'sample', '--resize', `${target.width}x${target.height}`);
  return runGifsicle(buffer, [...flags, 'input.gif', '-o', '/out/result.gif'].join(' '), Boolean(colors));
}

async function runGifsicle(buffer, command, allowTrivialPalette = false) {
  const marker = 'n=t(o,i)';
  const source = gifsicle.tool.workerLocalUrl;
  if (source.split(marker).length !== 2) throw new GifError('PROCESSING_FAILED', { reason: 'Pinned engine adapter mismatch' });
  const prefix = `const diagnostics=[];console.error=(...args)=>{if(diagnostics.length<128)diagnostics.push(args.join(' ').slice(-16384));};const send=self.postMessage.bind(self);self.postMessage=value=>send({value,diagnostics,exitCode:self.__cropExitCode});`;
  const patched = source.replace(marker, '(self.__cropExitCode=n=t(o,i))');
  const url = URL.createObjectURL(new Blob([prefix, patched], { type: 'text/javascript' }));
  const worker = createChildWorker(url);
  try {
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => resolve(data);
      worker.onerror = e => reject(new Error(e.message));
      worker.postMessage({ data: [{ name: 'input.gif', file: buffer.slice(0) }], command: [command], folder: [], isStrict: false });
    });
    const lines = [...new Set(result.diagnostics.flatMap(s => s.split('\n')).map(s => s.trim()).filter(Boolean))];
    const details = { command, exitCode: result.exitCode, diagnostics: lines, adapter: 'pinned wrapper JS diagnostics and CLI return capture; GIF core unchanged' };
    if (result.exitCode !== 0 || lines.some(s => /read error|corrupt|truncat|fatal|out of memory/i.test(s))) {
      const code = lines.some(s => /out of memory|memory allocation/i.test(s)) ? 'RESOURCE_LIMIT'
        : lines.some(s => /read error|corrupt|truncat/i.test(s)) ? 'CORRUPT_GIF' : 'PROCESSING_FAILED';
      throw new GifError(code, details);
    }
    if (lines.some((s, i) => !(allowTrivialPalette && /^this\.program: warning: trivial adaptive palette \(only \d+ colors? in source\)$/.test(s)) && !/warning: (too many colors, using local colormaps|background color not in colormap)/.test(s) && !(i > 0 && lines[i-1].includes('warning: too many colors, using local colormaps') && /^\(You may want to try .*--colors 256.*\.\)$/.test(s)))) {
      throw new GifError('PROCESSING_FAILED', details);
    }
    const file = Array.isArray(result.value) && result.value.find(f => f.name === 'result.gif');
    if (!file) throw new GifError('PROCESSING_FAILED', details);
    return { bytes: new Uint8Array(file.file), details };
  } finally { worker.terminate(); URL.revokeObjectURL(url); }
}
