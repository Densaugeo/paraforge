#### MicroPython build notes

Last built on 2024 June 30
- micrompython commit `5114f2c` (can't tell what version # this corresponds to)
- emsdk commit `e10826f` (version 3.1.56)
- gcc from Fedora repo (version 13.3.1)
- gcc-c++ might have been used as well, not sure. It's the same version as gcc

```
# Install Emscripten (micropython/ports/webassembly/README.md states they
# use Emscripten for WebAssembly support)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
git checkout 3.1.56
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
cd ..

git clone git@github.com:micropython/micropython.git
cd micropython
git checkout 5114f2c
make --directory mpy-cross
# Disable emscripten's asyncify to reduce .wasm size (by 70%!)
sed -i '1d' ports/webassembly/variants/standard/mpconfigvariant.mk
make --directory ports/webassembly
cd ..

cp micropython/ports/webassembly/build-standard/micropython.wasm .
```
