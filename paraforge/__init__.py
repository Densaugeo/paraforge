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
    ModuleNotParaforge = 7
    ModelGeneratorNotFound = 8
    ParameterCount = 9
    ParameterType = 10
    ParameterOutOfRange = 11
    OutputNotGLB = 12
    PointerTooLow = 13
    UnrecognizedErrorCode = 14
    HandleOutOfBounds = 15

class ParaforgeError(Exception):
    def __init__(self, code: ErrorCode):
        super().__init__(f'Code {code.value}: {code.name}')

store = wasmtime.Store()
with open(f'{os.path.dirname(__file__)}/paraforge.wasm', 'rb') as f:
    module = wasmtime.Module(store.engine, f.read())
instance = wasmtime.Instance(store, module, [])

def wasm_call(function: str, *args):
    function = instance.exports(store)[function]
    result = function(store, *args)
    tag = (result % 2**64) >> 32
    value = result & 0xffffffff
    
    if tag == 0:
        # Success!
        return value
    elif tag < 2**16:
        # Oh noes! A tag in this range must be an error code
        try:
            raise ParaforgeError(ErrorCode(value))
        except ValueError as e:
            raise ParaforgeError(ErrorCode.UnrecognizedErrorCode) from e
    else:
        # Tags of 2^16 and higher are only used for returning fat pointers
        # to WebAssembly memory areas
        memory: wasmtime.Memory = instance.exports(store)['memory']
        return bytes(memory.read(store, tag, tag + value))

def new_data_structure():
    return wasm_call('new_data_structure')

def multiply_float(handle: int, value: float):
    return wasm_call('multiply_float', handle, value)

def serialize():
    return wasm_call('serialize')
