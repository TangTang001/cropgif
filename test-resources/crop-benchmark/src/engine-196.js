// Independent evaluation of npm gifsicle-wasm@1.96.4 (1.96.3 omitted dist files).
// The local .mjs adds only an ES-module export to upstream's CommonJS/UMD file.
let createModule, wasmBinary, version;

function invoke(module, args) {
  const argv = module._malloc((args.length + 1) * 4);
  const pointers = [];
  try {
    args.forEach((arg, i) => {
      const pointer = module.stringToNewUTF8(arg);
      pointers.push(pointer);
      module.setValue(argv + i * 4, pointer, 'i32');
    });
    module.setValue(argv + args.length * 4, 0, 'i32');
    try { return module._run_gifsicle(args.length, argv); }
    catch (error) {
      if (typeof error.status !== 'number') throw error;
      return error.status;
    }
  } finally {
    for (const pointer of pointers) module._free(pointer);
    module._free(argv);
  }
}

export async function init196() {
  const script = await fetch('/wasm/gifsicle-1.96.4.mjs');
  if (!script.ok) throw new Error(`JS load failed: ${script.status}`);
  const modulePath = URL.createObjectURL(new Blob([await script.text()], { type: 'text/javascript' }));
  try { createModule = (await import(/* @vite-ignore */ modulePath)).default; }
  finally { URL.revokeObjectURL(modulePath); }
  const response = await fetch('/wasm/gifsicle-1.96.4.wasm');
  if (!response.ok) throw new Error(`WASM load failed: ${response.status}`);
  wasmBinary = new Uint8Array(await response.arrayBuffer());
  const lines = [];
  const module = await createModule({ wasmBinary, print: s => lines.push(s), printErr: s => lines.push(s) });
  invoke(module, ['gifsicle', '--version']);
  version = lines.join('\n');
  if (!/Gifsicle 1\.96\b/i.test(version)) throw new Error(`Unexpected core: ${version}`);
}

export async function crop196(buffer, rect) {
  const diagnostics = [];
  // Fresh instance per crop isolates the C CLI's global/static state.
  const module = await createModule({ wasmBinary, print: () => {}, printErr: s => diagnostics.push(s) });
  module.FS.writeFile('/input.gif', new Uint8Array(buffer));
  const command = ['gifsicle', '--crop', `${rect.x},${rect.y}+${rect.width}x${rect.height}`, '/input.gif', '-o', '/output.gif', '--logical-screen', `${rect.width}x${rect.height}`];
  let exitCode;
  try { exitCode = invoke(module, command); }
  catch (error) {
    if (typeof error.status !== 'number') throw error;
    exitCode = error.status;
  }
  const details = { package: 'gifsicle-wasm@1.96.4', version, command, exitCode, diagnostics, wasmBytes: wasmBinary.length, freshInstancePerJob: true, mode: 'raw candidate evaluation; output metadata and pixels independently audited, no A fallback' };
  if (exitCode !== 0 || diagnostics.some(s => /read error|corrupt|truncat|fatal|out of memory/i.test(s))) {
    throw Object.assign(new Error(`Gifsicle 1.96 failed (${exitCode}): ${diagnostics.join('\n')}`), { details });
  }
  // Save raw successful CLI outputs, including any metadata mismatch, for audit.
  // A production candidate must additionally reject all independently found errors.
  const bytes = module.FS.readFile('/output.gif').slice();
  return { bytes, details };
}
