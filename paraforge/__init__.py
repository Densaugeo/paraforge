import math

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
    (19, 'VtxOutOfBounds'),
    (20, 'TriOutOfBounds'),
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
    
    @property
    def translation(self): return self._translation
    @translation.setter
    def translation(self, v: [float, float, float]):
        wasm_call('node_set_translation', self._handle, *v)
        self._translation = v
    
    def t(self, x: int | float, y: int | float, z: int | float) -> 'Node':
        if self._translation is None:
            self._translation = [0.0, 0.0, 0.0]
        
        self._translation[0] += float(x)
        self._translation[1] += float(y)
        self._translation[2] += float(z)
        wasm_call('node_set_translation', self._handle, *self._translation)
        return self
    
    def tx(self, v: int | float) -> 'Node': return self.t(v  , 0.0, 0.0)
    def ty(self, v: int | float) -> 'Node': return self.t(0.0, v  , 0.0)
    def tz(self, v: int | float) -> 'Node': return self.t(0.0, 0.0, v  )
    
    @property
    def quaternion(self): return self._quaternion
    @quaternion.setter
    def quaternion(self, v: [float, float, float, float]):
        wasm_call('node_set_rotation', self._handle, *v)
    
    def r(self, x: int | float, y: int | float, z: int | float) -> 'Node':
        # Constructions of euler rotation quaternion largely taken from
        # https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
        cr = math.cos(x/2) # x = roll
        sr = math.sin(x/2)
        cp = math.cos(y/2) # y = pitch
        sp = math.sin(y/2)
        cy = math.cos(z/2) # z = yaw
        sy = math.sin(z/2)
        
        new_quaternion = [
            sr * cp * cy - cr * sp * sy,
            cr * sp * cy + sr * cp * sy,
            cr * cp * sy - sr * sp * cy,
            cr * cp * cy + sr * sp * sy,
        ]
        
        # Multiplication of quaternions taken from
        # https://math.libretexts.org/Bookshelves/Abstract_and_Geometric_Algebra/Introduction_to_Groups_and_Geometries_(Lyons)/01%3A_Preliminaries/1.02%3A_Quaternions . Variable names chosen to match literature used
        b, c, d, a = self._quaternion or [0.0, 0.0, 0.0, 1.0]
        b_, c_, d_, a_ = new_quaternion
        
        self._quaternion = [
            a*b_ + b*a_ + c*d_ - d*c_,
            a*c_ + c*a_ - b*d_ + d*b_,
            a*d_ + d*a_ + b*c_ - c*b_,
            
            a*a_ - b*b_ - c*c_ - d*d_,
        ]
        
        wasm_call('node_set_rotation', self._handle, *self._quaternion)
        return self
    
    def rx(self, v: int | float) -> 'Node': return self.r(v  , 0.0, 0.0)
    def ry(self, v: int | float) -> 'Node': return self.r(0.0, v  , 0.0)
    def rz(self, v: int | float) -> 'Node': return self.r(0.0, 0.0, v  )
    
    @property
    def scale(self): return self._scale
    @scale.setter
    def scale(self, v: [float, float, float]):
        wasm_call('node_set_scale', self._handle, *v)
    
    def s(self, x: int | float, y: int | float, z: int | float) -> 'Node':
        if self._scale is None:
            self._scale = [1.0, 1.0, 1.0]
        
        self._scale[0] *= float(x)
        self._scale[1] *= float(y)
        self._scale[2] *= float(z)
        wasm_call('node_set_scale', self._handle, *self._scale)
        return self
    
    def sx(self, v: int | float) -> 'Node': return self.s(v  , 1.0, 1.0)
    def sy(self, v: int | float) -> 'Node': return self.s(1.0, v  , 1.0)
    def sz(self, v: int | float) -> 'Node': return self.s(1.0, 1.0, v  )
    def sa(self, v: int | float) -> 'Node': return self.s(v  , v  , v  )
    
    @property
    def matrix(self): return self._matrix
    @matrix.setter
    def matrix(self, v: [float, float, float, float, float, float, float, float,
    float, float, float, float, float, float, float, float]):
        wasm_call('node_set_matrix', self._handle, *v)
    
    @property
    def mesh(self): return self._mesh
    @mesh.setter
    def mesh(self, v: 'Mesh'):
        wasm_call('node_set_mesh', self._handle, v.handle)
        self._mesh = v
    
    def __init__(self, name: str = '', mesh: 'Mesh' = None,
    _skip_init: bool = False):
        if _skip_init:
            return
        
        assert len(name) <= 64
        
        self._name = name
        self._translation = None
        self._quaternion = None
        self._scale = None
        self._matrix = None
        self._mesh = None
        
        write_string(0, name)
        self._handle = wasm_call('node_new')
        
        # Must assign through constructor to attach mesh. ._handle must already
        # be present
        if mesh is not None:
            self.mesh = mesh
    
    def add(self, node: 'Node') -> 'Node':
        wasm_call('node_add_node', self._handle, node.handle)
        return self
    
    def clone_subtree(self) -> 'Node':
        '''
        Clones this Node, and recursively clones all children. Nodes are fully
        cloned into new instances, while other objects in the tree like Meshes
        reference existing instances. This is to accomodate the GLTF spec, which
        forbids Nodes from appearing multiple times in the same Scene, but
        permits it for other objects.
        '''
        result = Node(_skip_init=True)
        result._name = self._name
        result._translation = self._translation
        result._quaternion = self._quaternion
        result._scale = self._scale
        result._matrix = self._matrix
        result._mesh = self._mesh
        
        result._handle = wasm_call('node_clone_subtree', self._handle)
        return result


class Mesh:
    @property
    def name(self): return self._name
    @property
    def handle(self): return self._handle
    
    def __init__(self, name: str = ''):
        assert len(name) <= 64
        
        self._name = name
        
        write_string(0, name)
        self._handle = wasm_call('mesh_new')
    
    def new_prim(self, packed_geometry: 'PackedGeometry', material: 'Material'):
        wasm_call('mesh_add_prim', self._handle, packed_geometry.handle,
            material.handle)
    
    def get_prim_count(self) -> int:
        return wasm_call('mesh_get_prim_count', self._handle)


class PackedGeometry:
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
        
        write_string(0, name)
        self._handle = wasm_call('new_material', r, g, b, a, metallicity,
            roughness)


class Geometry:
    def Cube() -> 'Geometry':
        return Geometry(wasm_call('geometry_new_cube'))
    
    @property
    def handle(self): return self._handle
    
    def __init__(self, handle: int | None = None):
        self._handle = wasm_call('geometry_new') if handle is None else handle
    
    def t(self, x: int | float, y: int | float, z: int | float) -> 'Geometry':
        return self.translate(x, y, z)
    
    def tx(self, v: int | float) -> 'Geometry': return self.t(v  , 0.0, 0.0)
    def ty(self, v: int | float) -> 'Geometry': return self.t(0.0, v  , 0.0)
    def tz(self, v: int | float) -> 'Geometry': return self.t(0.0, 0.0, v  )
    
    def translate(self, x: int | float, y: int | float, z: int | float,
    ) -> 'Geometry':
        wasm_call('geometry_translate', self._handle, float(x), float(y),
            float(z))
        return self
    
    def rotate_euler(self, x: int | float, y: int | float, z: int | float,
    ) -> 'Geometry':
        wasm_call('geometry_rotate_euler', self._handle, float(x), float(y),
            float(z))
        return self

    def rotate_axis(self, x: int | float, y: int | float, z: int | float,
    ω: int | float) -> 'Geometry':
        wasm_call('geometry_rotate_axis', self._handle, float(x), float(y),
            float(z), float(ω))
        return self

    def s(self, x: int | float, y: int | float, z: int | float) -> 'Geometry':
        return self.scale(x, y, z)
    
    def sx(self, v: int | float) -> 'Geometry': return self.s(v  , 1.0, 1.0)
    def sy(self, v: int | float) -> 'Geometry': return self.s(1.0, v  , 1.0)
    def sz(self, v: int | float) -> 'Geometry': return self.s(1.0, 1.0, v  )
    
    def scale(self, x: int | float, y: int | float, z: int | float,
    ) -> 'Geometry':
        wasm_call('geometry_scale', self._handle, float(x), float(y), float(z))
        return self
    
    def select(self, x1: int | float, y1: int | float, z1: int | float,
    x2: int | float, y2: int | float, z2: int | float) -> 'Geometry':
        wasm_call('geometry_select', self._handle,
            float(x1), float(y1), float(z1), float(x2), float(y2), float(z2))
        return self
    
    def create_vtx(self, x: int | float, y: int | float, z: int | float,
    ) -> 'Geometry':
        wasm_call('geometry_create_vtx', self._handle,
            float(x), float(y), float(z))
        return self
    
    def delete_vtx(self, vtx: int) -> 'Geometry':
        wasm_call('geometry_delete_vtx', self._handle, vtx)
        return self
    
    def delete_vtcs(self) -> 'Geometry':
        wasm_call('geometry_delete_vtcs', self._handle)
        return self
    
    def create_tri(self, a: int, b: int, c: int) -> 'Geometry':
        wasm_call('geometry_create_tri', self._handle, a, b, c)
        return self
    
    def delete_tri(self, tri: int) -> 'Geometry':
        wasm_call('geometry_delete_tri', self._handle, tri)
        return self
    
    def delete_tris(self) -> 'Geometry':
        wasm_call('geometry_delete_tris', self._handle)
        return self
    
    def delete_stray_vtcs(self) -> 'Geometry':
        wasm_call('geometry_delete_stray_vtcs', self._handle)
        return self
    
    def flip_normals(self) -> 'Geometry':
        wasm_call('geometry_flip_normals', self._handle)
        return self
    
    def doubleside(self) -> 'Geometry':
        wasm_call('geometry_doubleside', self._handle)
        return self
    
    def copy(self) -> 'Geometry':
        wasm_call('geometry_copy', self._handle)
        return self
    
    def set_vtx(self, vtx: int, x: int | float, y: int | float, z: int | float
    ) -> 'Geometry':
        wasm_call('geometry_set_vtx', self._handle, vtx,
            float(x), float(y), float(z))
        return self
    
    def set_tri(self, tri: int, a: int, b: int, c: int) -> 'Geometry':
        wasm_call('geometry_set_tri', self._handle, tri, a, b, c)
        return self
    
    def get_vtx_count(self) -> int:
        return wasm_call('geometry_get_vtx_count', self._handle)
    
    def get_tri_count(self) -> int:
        return wasm_call('geometry_get_tri_count', self._handle)
    
    def extrude(self, x: int | float, y: int | float, z: int | float
    ) -> 'Geometry':
        wasm_call('geometry_extrude', self._handle,
            float(x), float(y), float(z))
        return self
    
    def add_square(self, unit: bool = False) -> 'Geometry':
        '''
        If unit is set, new vtcs are bounded by 0..1 on each axis. Otherwise,
        new vtcs are centered about the origin and bounded by -1..1.
        '''
        wasm_call('geometry_add_square', self._handle, int(unit))
        return self
    
    def add_cube(self, unit: bool = False) -> 'Geometry':
        '''
        If unit is set, new vtcs are bounded by 0..1 on each axis. Otherwise,
        new vtcs are centered about the origin and bounded by -1..1.
        '''
        wasm_call('geometry_add_cube', self._handle, int(unit))
        return self
    
    def add_circle(self, segments: int = 8) -> 'Geometry':
        wasm_call('geometry_add_circle', self._handle, segments)
        return self
    
    def add_cylinder(self, segments: int = 8, unit: bool = False) -> 'Geometry':
        wasm_call('geometry_add_cylinder', self._handle, segments, int(unit))
        return self
    
    def pack(self) -> PackedGeometry:
        result = PackedGeometry()
        result._handle = wasm_call('geometry_pack', self._handle)
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
    # String transports need to be exercised after start, otherwise attempting
    # to write a string of length 0 will cause the string buffer to be at
    # address 0, and packing that into a pointer causes it to be interpreted as
    # as an error. This cannot be 'properly' fixed until multi return is usable
    for i in range(4):
        write_string(i, '.')
    
    return wasm_call('init')

def serialize() -> bytes:
    return bytes(wasm_call('serialize'))

def get_scene_count() -> int:
    return wasm_call('get_scene_count')

def get_node_count() -> int:
    return wasm_call('get_node_count')

def get_mesh_count() -> int:
    return wasm_call('get_mesh_count')

def get_material_count() -> int:
    return wasm_call('get_material_count')
