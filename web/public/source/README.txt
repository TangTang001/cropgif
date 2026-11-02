Gifsicle source and browser build materials
==========================================

The WASM embedded in gifsicle-wasm-browser 1.5.19 is byte-identical to
package/lib/gifsicle.wasm in @wasm-codecs/gifsicle 1.0.0. SHA256:
b4d9f84e5f8aa7cbe7cc2f90431b511456593324cb4aa75fcabf4ada8c218e05

Contents:
- gifsicle-1.92/: upstream C source, headers, build files and original notices.
  https://github.com/kohler/gifsicle/tree/1e2ca7401692ba94d7405de6e9dd1d1e73ca880f
- wasm-codecs/: original Gifsicle browser build scripts and interface sources.
  https://github.com/cyrilwanner/wasm-codecs/tree/89fb54b412e262832d61d9da5b4deb02ead184d4
- gifsicle-wasm-browser/: wrapper 1.5.19 source, packaging script, generated
  Emscripten glue and the original WASM, with its MIT notice.
  https://github.com/renzhezhilu/gifsicle-wasm-browser/tree/7033183ee0db22bb339a878571d743b9642e1c77
- provenance.json: versions, references and file checksums.

Core build:
See wasm-codecs/packages/gifsicle/Dockerfile and build.sh. The Dockerfile uses
trzeci/emscripten:1.39.18-upstream and Gifsicle v1.92. It adjusts configure.ac
to allow undefined symbols, then uses bootstrap.sh, emconfigure and emmake.
build.sh links the listed object files with lib/pre.js, -Oz and -flto.
The TypeScript source for pre.js is src/pre.ts; a copy of the generated pre.js
from the published package is included so the original link step is available.
From wasm-codecs/packages/gifsicle, with Docker available:
  docker build -t gifcroplab-gifsicle-source .
  docker run --rm -v "$PWD:/build" gifcroplab-gifsicle-source /build/build.sh
These commands use external upstream images and downloads. We have not
rerun this historical toolchain or asserted a bit-for-bit reproducible build.

Wrapper build:
See gifsicle-wasm-browser/src/build.js and src/readme.md. The script embeds
the WASM as base64 into a Worker and minifies the wrapper using uglify-js.
The build script also updates the upstream demo's service worker/version.
Generated Emscripten JS and WASM are included as inputs, not described as C
source replacements. Unrelated demo assets have been omitted.

GIF Crop Lab uses the published core without changing its WASM bytes.
Our Worker adapter changes wrapper type detection and captures CLI diagnostics;
those modifications are in the website repository's web/src/gif/engine-b.js.
https://github.com/TangTang001/cropgif

Licenses:
Gifsicle: see gifsicle-1.92/COPYING and its README.md Copyright/License section.
Wrappers/build interfaces: see their original LICENSE files.
Third-party notices remain applicable independently of the website license.
