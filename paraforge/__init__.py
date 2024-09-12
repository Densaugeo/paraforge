try:
    import wasmtime
    micropython = False
except ImportError:
    micropython = True

if micropython:
    import js
else:
    import os, ctypes

class ParaforgeError(Exception):
    def __init__(self):
        super().__init__(f'Paraforge error code {self.code}')
    
    def from_code(code: int) -> 'ParaforgeError':
        return paraforge_errors[code]()

paraforge_errors = []
for code, name in [
    ( 0, 'None_'),
    ( 1, 'Mutex'),
    ( 2, 'Generation'),
    ( 3, 'NotImplemented'),
    ( 4, 'WebAssemblyCompile'),
    ( 5, 'WebAssemblyInstance'),
    ( 6, 'WebAssemblyExecution'),
    ( 7, 'ModuleNotParaforge'),
    ( 8, 'ModelGeneratorNotFound'),
    ( 9, 'ParameterCount'),
    (10, 'ParameterType'),
    (11, 'ParameterOutOfRange'),
    (12, 'OutputNotGLB'),
    (13, 'PointerTooLow'),
    (14, 'UnrecognizedErrorCode'),
    (15, 'HandleOutOfBounds'),
    (16, 'NotInitialized'),
    (17, 'SizeOutOfBounds'),
    (18, 'UnicodeError'),
    (19, 'VertexOutOfBounds'),
]:
    paraforge_errors.append(type(name, (ParaforgeError, ), { 'code': code }))


if not micropython:
    store = wasmtime.Store()
    with open(f'{os.path.dirname(__file__)}/paraforge.wasm', 'rb') as f:
        module = wasmtime.Module(store.engine, f.read())
    instance = wasmtime.Instance(store, module, [])


class Node:
    @property
    def name(self): return self._name
    @property
    def handle(self): return self._handle
    
    def __init__(self, name: str = ''):
        assert len(name) <= 64
        
        self._name = name
        
        self._handle = add_node_to_scene(0, self._name)
    
    def add_mesh(self, name: str = ''):
        return Mesh(self, name)


class Mesh:
    @property
    def name(self): return self._name
    @property
    def node(self): return self._node
    @property
    def handle(self): return self._handle
    
    def __init__(self, node: Node, name: str = ''):
        assert len(name) <= 64
        
        self._name = name
        self._node = node
        
        self._handle = add_mesh_to_node(self._node.handle, self._name)
    
    def add_primitive(self, packed_geometry: 'PackedGeometry',
    material: 'Material'):
        add_primitive_to_mesh(self._handle, packed_geometry.handle,
            material.handle)


class PackedGeometry():
    @property
    def handle(self): return self._handle


class Material:
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


class Geometry:
    def Cube() -> 'Geometry':
        return Geometry(new_geometry_cube())
    
    @property
    def handle(self): return self._handle
    
    def __init__(self, handle: int | None = None):
        self._handle = wasm_call('geometry_new') if handle is None else handle
    
    def t(self, x: int | float, y: int | float, z: int | float) -> 'Geometry':
        return self.translate(x, y, z)
    
    def translate(self, x: int | float, y: int | float, z: int | float,
    ) -> 'Geometry':
        geometry_translate(self._handle, float(x), float(y), float(z))
        return self
    
    def s(self, x: int | float, y: int | float, z: int | float) -> 'Geometry':
        return self.scale(x, y, z)
    
    def scale(self, x: int | float, y: int | float, z: int | float,
    ) -> 'Geometry':
        geometry_scale(self._handle, float(x), float(y), float(z))
        return self
    
    def select_vertices(self, x1: int | float, y1: int | float,
    z1: int | float, x2: int | float, y2: int | float, z2: int | float,
    ) -> 'Geometry':
        # Not at all sure that the layer of separate functions for things like
        # geometry_select_triangles() is really necessary
        wasm_call('geometry_select_vertices', self._handle,
            float(x1), float(y1), float(z1), float(x2), float(y2), float(z2))
        return self
    
    def select_triangles(self, x1: int | float, y1: int | float,
    z1: int | float, x2: int | float, y2: int | float, z2: int | float,
    ) -> 'Geometry':
        geometry_select_triangles(self._handle, float(x1), float(y1), float(z1),
            float(x2), float(y2), float(z2))
        return self
    
    def create_vertex(self, x: int | float, y: int | float, z: int | float,
    ) -> 'Geometry':
        wasm_call('geometry_create_vertex', self._handle,
            float(x), float(y), float(z))
        return self
    
    def delete_vertex(self, vertex: int) -> 'Geometry':
        wasm_call('geometry_delete_vertex', self._handle, vertex)
        return self
    
    def delete_vertices(self) -> 'Geometry':
        wasm_call('geometry_delete_vertices', self._handle)
        return self
    
    def create_triangle(self, a: int, b: int, c: int) -> 'Geometry':
        wasm_call('geometry_create_triangle', self._handle, a, b, c)
        return self
    
    def delete_triangle(self, triangle: int) -> 'Geometry':
        wasm_call('geometry_delete_triangle', self._handle, triangle)
        return self
    
    def delete_triangles(self) -> 'Geometry':
        geometry_delete_triangles(self._handle)
        return self
    
    def delete_stray_vertices(self) -> 'Geometry':
        wasm_call('geometry_delete_stray_vertices', self._handle)
        return self
    
    def pack(self) -> PackedGeometry:
        result = PackedGeometry()
        result._handle = geometry_pack(self._handle)
        return result


def read_string(handle: int) -> str:
    return str(wasm_call('string_transport', handle, -1), 'utf8')

def write_string(handle: int, string: str):
    if micropython:
        js.string_transport(handle, string)
    else:
        raw_bytes = bytes(string, 'utf8')[:64]
        size = len(raw_bytes)
        
        dst_ptr = wasm_call('string_transport', handle, size)
        ctypes.memmove(dst_ptr, raw_bytes, len(raw_bytes))

def wasm_call(function: str, *args):
    if micropython:
        # paraforge.wasm functions return i64...but micropython.wasm offers no
        # means to transfer an i64 across its FFI boundary. So the JS call
        # actually returns an f64. All the paraforge.wasm functions called by
        # this library return values low enough to fit in the 53 integer bits
        # available in an f64
        result = int(js.py_rust_call(function, *args))
    else:
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
            #raise ParaforgeError(ErrorCode(value))
            raise ParaforgeError.from_code(value)
        except ValueError as e:
            raise ParaforgeError(ErrorCode.UnrecognizedErrorCode) from e
    else:
        # Tags of 2^16 and higher are only used for returning fat pointers
        # to WebAssembly memory areas
        memory: wasmtime.Memory = instance.exports(store)['memory']
        return memory.get_buffer_ptr(store, value, tag)

def init():
    return wasm_call('init')

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

def add_primitive_to_mesh(mesh: int, packed_geometry: int, material: int,
) -> int:
    return wasm_call('add_primitive_to_mesh', mesh, packed_geometry, material)

def new_geometry_cube() -> int:
    return wasm_call('geometry_cube')

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
