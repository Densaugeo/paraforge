import os, enum

import wasmtime

class ErrorCode(enum.Enum):
    None_ = 0
    Mutex = 1
    Generation = 2
    NotImplemented = 3
    WebAssemblyCompile = 4
    WebAssemblyInstance = 5
    WebAssemblyExecution = 6
    ModuleNotEMG = 7
    ModelGeneratorNotFound = 8
    ParameterCount = 9
    ParameterType = 10
    ParameterOutOfRange = 11
    OutputNotGLB = 12

class ParaforgeError(Exception):
    pass

store = wasmtime.Store()
with open(f'{os.path.dirname(__file__)}/paraforge.wasm', 'rb') as f:
    module = wasmtime.Module(store.engine, f.read())
instance = wasmtime.Instance(store, module, [])

def wasm_call(function: str, *args):
    return_code = instance.exports(store)[function](store, *args)
    
    if return_code:
        raise ParaforgeError(f'Code {return_code}: '
            f'{ErrorCode(return_code).name}')

def wasm_get_atomic(function: str) -> int:
    return instance.exports(store)[function](store)

def new_data_structure():
    wasm_call('new_data_structure')

def multiply_float(index: int, value: float):
    wasm_call('multiply_float', index, value)

def serialize():
    wasm_call('serialize')
    memory: wasmtime.Memory = instance.exports(store)['memory']
    buffer = memory.read(
        store,
        wasm_get_atomic('model_pointer'),
        wasm_get_atomic('model_size') + wasm_get_atomic('model_pointer'),
    )
    return bytes(buffer)
