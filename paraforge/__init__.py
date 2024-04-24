import ctypes, os, enum

import cffi


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


ffi = cffi.FFI()

ffi.cdef('''
    uint64_t model_pointer();
    uint64_t model_size();
    uint32_t new_data_structure();
    uint32_t multiply_float(uint32_t index, float value);
    uint32_t serialize();
''')

rust = ffi.dlopen(f'{os.path.dirname(__file__)}/libparaforge.so')


def check_code(return_code: int):
    if return_code:
        raise ParaforgeError(f'Code {return_code}: '
            f'{ErrorCode(return_code).name}')

def new_data_structure():
    check_code(rust.new_data_structure())

def multiply_float(index: int, value: float):
    check_code(rust.multiply_float(index, value))

def serialize():
    check_code(rust.serialize())
    return ctypes.string_at(rust.model_pointer(), rust.model_size())
