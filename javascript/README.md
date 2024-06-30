#### MicroPython build notes

Last built on 2024 June 30
- micropython commit `0dd25a3` (can't tell what version # this corresponds to)
- emsdk commit `a33daf3` (version 3.1.61)
- gcc from Fedora repo (version 13.3.1)
- gcc-c++ might have been used as well, not sure. It's the same version as gcc

```
# Install Emscripten (micropython/ports/webassembly/README.md states they
# use Emscripten for WebAssembly support)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
cd ..

git clone git@github.com:micropython/micropython.git

# Set up cross-compiler (documented in MicroPython readme)
cd micropython/mpy-cross
make
cd ../..

cd micropython/ports/webassembly
make submodules
make
cd ../../..
cp micropython/ports/webassembly/build-standard/micropython.wasm .
```
