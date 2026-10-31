"""Build unmodified Gifsicle sources for Emscripten; keep target config separate."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
source = ROOT/'tools/gifsicle-1.98'
build = ROOT/'tools/wasm198-build'
output = ROOT/'public/wasm'
build.mkdir(exist_ok=True)
output.mkdir(parents=True, exist_ok=True)
settings = {name: '1' for name in ['HAVE_CBRTF','HAVE_INT64_T','HAVE_INTTYPES_H','HAVE_MKSTEMP','HAVE_POW','HAVE_SNPRINTF','HAVE_STDINT_H','HAVE_STDIO_H','HAVE_STDLIB_H','HAVE_STRERROR','HAVE_STRINGS_H','HAVE_STRING_H','HAVE_SYS_SELECT_H','HAVE_SYS_STAT_H','HAVE_SYS_TIME_H','HAVE_SYS_TYPES_H','HAVE_TIME_H','HAVE_UINT64_T','HAVE_UINTPTR_T','HAVE_UNISTD_H','STDC_HEADERS','X_DISPLAY_MISSING']}
settings.update(PACKAGE='"gifsicle"',PACKAGE_NAME='"gifsicle"',PACKAGE_TARNAME='"gifsicle"',PACKAGE_STRING='"gifsicle 1.98"',PACKAGE_VERSION='"1.98"',PACKAGE_URL='"https://www.lcdf.org/gifsicle/"',PACKAGE_BUGREPORT='""',VERSION='"1.98 (WASM)"',PATHNAME_SEPARATOR="'/'",RANDOM='rand',SIZEOF_FLOAT='4',SIZEOF_UNSIGNED_INT='4',SIZEOF_UNSIGNED_LONG='4',SIZEOF_VOID_P='4')
template = (source/'config.h.in').read_text(encoding='utf-8')
config = re.sub(r'^#undef (\w+)$', lambda m: '#define '+m[1]+' '+settings[m[1]] if m[1] in settings else '/* #undef '+m[1]+' */',template,flags=re.M)
(build/'config.h').write_text(config,encoding='utf-8')
names = ['clp','fmalloc','giffunc','gifread','gifunopt','gifwrite','merge','optimize','quantize','support','xform','gifsicle','kcolor']
files = [source/'src'/f'{name}.c' for name in names]
emcc = ROOT/'tools/emsdk-main/upstream/emscripten/emcc.bat'
flags = ['-O2','-DHAVE_CONFIG_H','-I'+str(build),'-I'+str(source/'include'),'-I'+str(source/'src'),'-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createGifsicle198','-sENVIRONMENT=web,worker,node','-sEXPORTED_RUNTIME_METHODS=FS,callMain','-sINVOKE_RUN=0','-sEXIT_RUNTIME=1','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912','-sSTACK_SIZE=1048576','-o',str(output/'gifsicle-1.98.mjs')]
command = [str(emcc), *map(str,files), *flags]
environment = os.environ.copy()
# Build cache and config remain inside the portable SDK/project.
environment['EM_CACHE'] = str(ROOT/'tools/emsdk-main/upstream/emscripten/cache')
result = subprocess.run(command,cwd=build,env=environment,capture_output=True)
(build/'build.log').write_bytes(result.stdout+b'\n'+result.stderr)
print((result.stdout+result.stderr).decode('utf-8','replace'))
if result.returncode:
    raise SystemExit(result.returncode)
version = subprocess.run([str(emcc),'--version'],capture_output=True,env=environment,check=True).stdout.decode('utf-8','replace')
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = dict(gifsicleVersion='1.98',emscripten=version,sourceUrl='https://www.lcdf.org/gifsicle/gifsicle-1.98.tar.gz',sourceArchiveSha256=digest(ROOT/'tools/gifsicle-1.98.tar.gz'),configSha256=digest(build/'config.h'),sourceFiles={p.name:digest(p) for p in files},command=command,initialMemory=16777216,maximumMemory=536870912,threads=False,coreAlgorithmChanges=False,artifacts={p.name:dict(bytes=p.stat().st_size,sha256=digest(p)) for p in [output/'gifsicle-1.98.mjs',output/'gifsicle-1.98.wasm']})
(output/'gifsicle-1.98-build.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('WASM artifacts:',json.dumps(manifest['artifacts']))
