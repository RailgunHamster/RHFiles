# Three.js runtime subset

RHFiles vendors a pinned subset of Three.js `0.185.1` for its offline 3D
preview. The files in this directory come from the official `three` npm
package and are distributed under the MIT license in `LICENSE.txt`.

Included modules are the WebGL runtime, OrbitControls, and the official glTF,
FBX, OBJ/MTL, STL, PLY, and 3MF loaders plus their direct dependencies. The
official Draco and Meshopt decoders are included for compressed glTF assets.
No third-party format converter is bundled. The official addon modules have
their bare `three` imports rewritten to a relative path so they also work in
WebView environments without import-map support.

The `licenses` directory contains the upstream Draco (Apache-2.0), fflate
(MIT), and meshoptimizer (MIT) license notices used by the selected loaders.

`src/js/preview3d.bundle.js` is generated from `src/js/preview3d.js` with the
maintained esbuild package so RHFiles can lazy-load it as a classic script in
the Tauri asset protocol:

```text
npx esbuild@0.28.2 src/js/preview3d.js --bundle --format=iife --global-name=RHFiles3D --platform=browser --target=chrome105 --minify --outfile=src/js/preview3d.bundle.js
```
