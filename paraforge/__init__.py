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


class Material:
    def __init__(self,
        name: str = '',
        color_string: str = '',
        r: float = 1.0,
        g: float = 1.0,
        b: float = 1.0,
        a: float = 1.0,
        metallicity: float = 0.0,
        roughness: float = 1.0,
    ):
        # Not a limitation of GLTF - this limitation is because of how I'm
        # moving strings into the Rust area
        assert len(name) <= 64
        if color_string:
            # Specifies RGB(A). Needed because I may add other formats in the
            # future
            assert color_string[0] == '#'
            assert len(color_string) in [4, 5, 7, 9]
        assert 0 <= metallicity <= 1
        assert 0 <= roughness <= 1
        
        self._name = name
        
        if color_string:
            step = 1 if len(color_string) <= 5 else 2
            divisor = 0xf if step == 1 else 0xff
            
            r = int(color_string[1         :1 +   step], 16)/divisor
            g = int(color_string[1 +   step:1 + 2*step], 16)/divisor
            b = int(color_string[1 + 2*step:1 + 3*step], 16)/divisor
            if len(color_string) == 1 + 4*step:
                a = int(color_string[1+3*step:1+4*step], 16)/divisor
        
        self._r = r
        self._g = g
        self._b = b
        self._a = a
        
        self._metallicity = metallicity
        self._roughness = roughness
        
        self._handle = new_material(self._name, self._r, self._g, self._b,
            self._a, self._metallicity, self._roughness)
    
    @property
    def name(self): return self._name
    @property
    def r(self): return self._r
    @property
    def g(self): return self._g
    @property
    def b(self): return self._b
    @property
    def a(self): return self._a
    @property
    def metallicity(self): return self._metallicity
    @property
    def roughness(self): return self._roughness
    @property
    def handle(self): return self._handle


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
metallicity: float, roughness: float) -> int:
    write_string(0, name)
    return wasm_call('new_material', r, g, b, a, metallicity, roughness)

def add_node_to_scene(scene: int, name: str) -> int:
    write_string(0, name)
    return wasm_call('add_node_to_scene', scene)

def add_mesh_to_node(node: int, name: str) -> int:
    write_string(0, name)
    return wasm_call('add_mesh_to_node', node)

def mesh_add_primitive(mesh: int, packed_geometry: int, material: int) -> int:
    return wasm_call('add_primitive_to_mesh', mesh, packed_geometry, material)

def new_geometry_cube() -> int:
    return wasm_call('new_geometry_cube')

def geometry_translate(handle: int, x: float, y: float, z: float):
    return wasm_call('geometry_translate', handle, x, y, z)

def geometry_scale(handle: int, x: float, y: float, z: float):
    return wasm_call('geometry_scale', handle, x, y, z)

def geometry_select_triangles(handle: int, x1: float, y1: float, z1: float,
x2: float, y2: float, z2: float):
    return wasm_call('geometry_select_triangles', handle, x1, y1, z1, x2, y2,
        z2)

def geometry_delete_triangles(handle: int):
    return wasm_call('geometry_delete_triangles', handle)

def geometry_pack(handle: int) -> int:
    return wasm_call('geometry_pack', handle)

def serialize_test() -> bytes:
    return bytes(wasm_call('serialize_test'))
