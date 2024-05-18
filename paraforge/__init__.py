import os, enum, ctypes

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
    NotInitialized = 16
    SizeOutOfBounds = 17
    UnicodeError = 18

class ParaforgeError(Exception):
    def __init__(self, code: ErrorCode):
        super().__init__(f'Code {code.value}: {code.name}')

store = wasmtime.Store()
with open(f'{os.path.dirname(__file__)}/paraforge.wasm', 'rb') as f:
    module = wasmtime.Module(store.engine, f.read())
instance = wasmtime.Instance(store, module, [])


def read_string(handle: int) -> str:
    return str(wasm_call('string_transport', handle, -1), 'utf8')

def write_string(handle: int, string: str):
    raw_bytes = bytes(string, 'utf8')[:64]
    size = len(raw_bytes)
    
    dst_ptr = wasm_call('string_transport', handle, size)
    ctypes.memmove(dst_ptr, raw_bytes, len(raw_bytes))

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
        return memory.get_buffer_ptr(store, value, tag)

def init():
    return wasm_call('init')

def new_data_structure():
    return wasm_call('new_data_structure')

def multiply_float(handle: int, value: float):
    return wasm_call('multiply_float', handle, value)

def serialize() -> bytes:
    return bytes(wasm_call('serialize'))

def new_material(name: str, r: float, g: float, b: float, a: float,
metallicity: float, roughness: float):
    write_string(0, name)
    return wasm_call('new_material', r, g, b, a, metallicity, roughness)

def gen_test():
    return wasm_call('gen_test')

def serialize_test() -> bytes:
    return bytes(wasm_call('serialize_test'))
