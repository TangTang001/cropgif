let createModule, wasmBinary, version;

export async function init198() {
  const modulePath = '/wasm/gifsicle-1.98.mjs';
  createModule = (await import(/* @vite-ignore */ modulePath)).default;
  const response = await fetch('/wasm/gifsicle-1.98.wasm');
  if (!response.ok) throw new Error(`WASM 加载失败：${response.status}`);
  wasmBinary = new Uint8Array(await response.arrayBuffer());
  const lines = [];
  const module = await createModule({ wasmBinary, noInitialRun: true, print: s => lines.push(s), printErr: s => lines.push(s) });
  module.callMain(['--version']);
  version = lines.join('\n');
  if (!version.includes('1.98')) throw new Error(`核心版本不符：${version}`);
}

export async function crop198(buffer, r) {
  const warnings = [];
  let exitCode = 0;
  // A fresh CLI instance keeps static C state and files isolated between jobs.
  const wasmMemory = new WebAssembly.Memory({ initial: 256, maximum: 8192 });
  const module = await createModule({ wasmBinary, wasmMemory, noInitialRun: true, print: () => {}, printErr: s => warnings.push(s), onExit: status => { exitCode = status; } });
  module.FS.writeFile('/input.gif', new Uint8Array(buffer));
  module.FS.mkdir('/out');
  const command = ['--no-ignore-errors', '--crop', `${r.x},${r.y}+${r.width}x${r.height}`, '/input.gif', '-o', '/out/result.gif', '--logical-screen', `${r.width}x${r.height}`];
  try {
    const status = module.callMain(command);
    if (typeof status === 'number') exitCode = status;
  } catch (error) {
    if (typeof error.status !== 'number') throw error;
    exitCode = error.status;
  }
  if (exitCode !== 0) throw new Error(`Gifsicle 1.98 退出码 ${exitCode}：${warnings.join('\n')}`);
  const bytes = module.FS.readFile('/out/result.gif').slice();
  return { bytes, details: { version, command, warnings, exitCode, wasmBytes: wasmBinary.length, linearMemoryAllocatedBytes: wasmMemory.buffer.byteLength, memoryNote: 'linear memory allocation only; not peak browser/process memory', freshInstancePerJob: true } };
}
