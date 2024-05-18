use std::sync::{Mutex, MutexGuard};

pub use nalgebra::Vector3 as V3;

use paraforge_macros::ffi;

/////////////
// Statics //
/////////////

// Statics are use to hold Paraforge's working data. They allow storing
// persistent data structres that can be modified across different FFI calls

static DATA_STRUCTURES: Mutex<Vec<DataStructure>> = Mutex::new(Vec::new());
static GEOMETRIES: Mutex<Vec<Geometry>> = Mutex::new(Vec::new());
static STRING_TRANSPORT: Mutex<[Vec<u8>; 4]> = Mutex::new([vec![], vec![],
  vec![], vec![]]);
static GLTF_SOURCE: Mutex<Option<GLTF>> = Mutex::new(None);
static GLTF_OUTPUT: Mutex<Vec<u8>> = Mutex::new(Vec::new());

fn lock<'a, T>(mutex: &'a Mutex<T>) -> Result<MutexGuard<'a, T>, ErrorCode> {
  match mutex.lock() {
    Ok(value) => return Ok(value),
    Err(_) => return Err(ErrorCode::Mutex),
  }
}

fn get_string_transport(handle: usize) -> FFIResult<String> {
  let string_transport = lock(&STRING_TRANSPORT)?;
  
  if handle >= 4 { return Err(ErrorCode::HandleOutOfBounds) };
  
  match String::from_utf8(string_transport[handle].clone()) {
    Ok(value) => return Ok(value),
    Err(_) => return Err(ErrorCode::UnicodeError),
  }
}

#[ffi]
fn string_transport(handle: usize, size: usize) -> FFIResult<FatPointer> {
  let mut string_transport = lock(&STRING_TRANSPORT)?;
  
  if handle >= 4 { return Err(ErrorCode::HandleOutOfBounds) };
  
  if size != 0xffffffff {
    if size > 64 { return Err(ErrorCode::SizeOutOfBounds) };
    string_transport[handle].resize(size, 0);
  }
  
  return FatPointer::try_from(&string_transport[handle]);
}

////////////////////
// Error Handling //
////////////////////

// FFIValue and its .pack() funciton are required because Rust's built-in
// conversions between usize, u32, u64, (), etc. are surprisingly limited.
// FFIValue ensure that everything #[ffi] functions return can be packed into a
// u64
pub trait FFIValue           { fn pack(self) -> u64; }
impl FFIValue for ()         { fn pack(self) -> u64 { 0           } }
impl FFIValue for usize      { fn pack(self) -> u64 { self as u64 } }
impl FFIValue for FatPointer { fn pack(self) -> u64 {
  ((self.offset as u64) << 32) + self.size as u64
} }

pub struct FatPointer {
  offset: usize,
  size: usize,
}

impl TryFrom<&Vec<u8>> for FatPointer {
  type Error = ErrorCode;
  
  fn try_from(value: &Vec<u8>) -> Result<Self, ErrorCode> {
    let offset = value.as_ptr() as usize;
    let size = value.len();
    
    if offset < 0x10000 {
      return Err(ErrorCode::PointerTooLow);
    }
    
    return Ok(Self { offset, size });
  }
}

// These error codes are returned from WebAssembly functions, so must use a
// WebAssembly variable type
#[derive(Debug, Copy, Clone)]
#[repr(u32)]
pub enum ErrorCode {
  None = 0,
  Mutex = 1,
  Generation = 2,
  NotImplemented = 3,
  WebAssemblyCompile = 4,
  WebAssemblyInstance = 5,
  WebAssemblyExecution = 6,
  ModuleNotParaforge = 7,
  ModelGeneratorNotFound = 8,
  ParameterCount = 9,
  ParameterType = 10,
  ParameterOutOfRange = 11,
  OutputNotGLB = 12,
  // Due to the use of ErrorCode/pointer unions in responses, pointers with
  // values below 2^16 could be confused with 16-bit error codes, and thus
  // result in errors. In theory this should never happen, since Paraforge code
  // should take up all of the first 64 kiB memory.
  PointerTooLow = 13,
  // For wrapper libraries if they get an error that isn't defined here. Should
  // theoretically never happen
  UnrecognizedErrorCode = 14,
  HandleOutOfBounds = 15,
  NotInitialized = 16,
  SizeOutOfBounds = 17,
  UnicodeError = 18,
}

// Any value type T used inside an FFIResult should implement FFIValue, but
// the Rust compiler does not seem to enforce this. Documenation at
// https://doc.rust-lang.org/reference/items/type-aliases.html recommends this
// syntax:
//
// type TypeAlias<T> = Bar<T> where T: Foo
//
// However, this syntax results in a compile error. A GitHub issue
// (https://github.com/rust-lang/rust/issues/21903) suggests that trait bounds
// on type aliases may be included in a future edition.
type FFIResult<T> = Result<T, ErrorCode>;

//////////////////////////////
// Non-GLTF Data Structures //
//////////////////////////////

#[derive(Clone, serde::Serialize)]
struct DataStructure {
  an_integer: i32,
  a_float: f32,
  a_string: String,
}

impl DataStructure {
  pub fn new() -> Self {
    Self {
      an_integer: 4,
      a_float: 1.2,
      a_string: String::from("Stringyyyyyy!"),
    }
  }
}

pub enum SelectionType {
  VERTICES,
  TRIANGLES,
}

pub struct Geometry {
  pub vertices: Vec<V3<f64>>,
  
  pub triangles: Vec<[u32; 3]>,
  
  pub selection: Vec<u32>,
  pub selection_type: SelectionType,
}

impl Geometry {
  /// Raw vertex byffer, suitable for GLTF packing
  pub fn vertices_raw(&self) -> impl Iterator + '_ {
    self.vertices.iter().flat_map(|v| vec![v[0] as f32, v[1] as f32,
      v[2] as f32])
  }
  
  /// Raw triangle byffer, suitable for GLTF packing
  pub fn triangles_raw(&self) -> impl Iterator + '_ {
    self.triangles.iter().flat_map(|v| {
      if self.vertices.len() < 0x10000 {
        return vec![
          (v[0]     ) as u8,
          (v[0] >> 8) as u8,
          (v[1]     ) as u8,
          (v[1] >> 8) as u8,
          (v[2]     ) as u8,
          (v[2] >> 8) as u8,
        ]
      } else {
        return vec![
          (v[0]      ) as u8,
          (v[0] >>  8) as u8,
          (v[0] >> 16) as u8,
          (v[0] >> 24) as u8,
          (v[1]      ) as u8,
          (v[1] >>  8) as u8,
          (v[1] >> 16) as u8,
          (v[1] >> 24) as u8,
          (v[2]      ) as u8,
          (v[2] >>  8) as u8,
          (v[2] >> 16) as u8,
          (v[2] >> 24) as u8,
        ]
      }
    })
  }
  
  pub fn triangles_raw_component_type(&self) -> ComponentType {
    if self.vertices.len() < 0x10000 {
      ComponentType::UnsignedShort
    } else {
      ComponentType::UnsignedInt
    }
  }
  
  // Apply a translation
  pub fn t(&mut self, x: f64, y: f64, z: f64) -> &mut Self {
    let translation = V3::new(x, y, z);
    
    for vertex in &mut self.vertices {
      *vertex += translation;
    }
    
    self
  }
  
  // Apply a scale
  pub fn s(&mut self, x: f64, y: f64, z: f64) -> &mut Self {
    let scale = V3::new(x, y, z);
    
    for vertex in &mut self.vertices {
      vertex.component_mul_assign(&scale);
    }
    
    self
  }
  
  // rotations / matrices
  
  // Merges
  
  // Vertex deduplication
  
  /// Returns a list of vertices within the bounding box defined by the given
  /// points. Allows error of 1e-6
  pub fn select_vertices(&mut self, bound_1: V3<f64>, bound_2: V3<f64>) {
    self.selection.drain(..);
    self.selection_type = SelectionType::VERTICES;
    
    let lower_bound = bound_1.inf(&bound_2) - V3::new(1e-6, 1e-6, 1e-6);
    let upper_bound = bound_1.sup(&bound_2) + V3::new(1e-6, 1e-6, 1e-6);
    
    for i in 0..self.vertices.len() {
      if lower_bound[0] < self.vertices[i][0] &&
         self.vertices[i][0] < upper_bound[0] &&
         lower_bound[1] < self.vertices[i][1] &&
         self.vertices[i][1] < upper_bound[1] &&
         lower_bound[2] < self.vertices[i][2] &&
         self.vertices[i][2] < upper_bound[2] {
        self.selection.push(i as u32);
      }
    }
  }
  
  /// Returns a list of triangles within the bounding box defined by the given
  /// points. Allows error of 1e-6
  pub fn select_triangles(&mut self, bound_1: V3<f64>, bound_2: V3<f64>) {
    self.select_vertices(bound_1, bound_2);
    let bounded_vertices = self.selection.clone();
    
    self.selection.drain(..);
    self.selection_type = SelectionType::TRIANGLES;
    
    for i in 0..self.triangles.len() {
      if bounded_vertices.contains(&self.triangles[i][0]) &&
         bounded_vertices.contains(&self.triangles[i][1]) &&
         bounded_vertices.contains(&self.triangles[i][2]) {
        self.selection.push(i as u32);
      }
    }
  }
  
  /// Automatically deletes affected triangles
  pub fn delete_vertex(&mut self, vertex: u32) {
    // Swap remove to avoid having to shift vertices
    self.vertices.swap_remove(vertex as usize);
    let swapped_vertex = self.vertices.len() as u32;
    
    for i in 0..self.triangles.len() {
      // Delete triangle if it includes deleted vertex
      if self.triangles[i].contains(&vertex) {
        self.triangles.swap_remove(i);
        continue;
      }
      
      // Update indices if swapped vertex is referenced
      for j in 0..2 {
        if self.triangles[i][j] == swapped_vertex {
          self.triangles[i][j] = vertex
        }
      }
    }
    
    self.selection.drain(..);
  }
  
  /// Automatically deletes affected triangles
  pub fn delete_vertices(&mut self) {
    // Vertices must be processed in reverse order, because deletion of lower-
    // index vertices can change the index of higher-index vertices
    self.selection.sort_unstable();
    self.selection.reverse();
    
    for vertex in self.selection.clone() {
      self.delete_vertex(vertex);
    }
  }
  
  pub fn delete_triangle(&mut self, triangle: u32) {
    self.triangles.swap_remove(triangle as usize);
    self.selection.drain(..);
  }
  
  pub fn delete_triangles(&mut self) {
    // Triangles must be processed in reverse order, because deletion of lower-
    // index vertices can change the index of higher-index vertices
    self.selection.sort_unstable();
    self.selection.reverse();
    
    for triangle in self.selection.clone() {
      self.delete_triangle(triangle);
    }
  }
  
  pub fn delete_stray_vertices(&mut self) {
    // Vertices must be processed in reverse order, because deletion of lower-
    // index vertices can change the index of higher-index vertices
    for vertex in self.vertices.len()..0 {
      let mut vertex_used = false;
      for triangle in &self.triangles {
        if triangle.contains(&(vertex as u32)) {
          vertex_used = true;
        }
      }
      
      if vertex_used {
        self.delete_vertex(vertex as u32);
      }
    }
  }
  
  pub fn cube() -> Self {
    Self {
      vertices: vec![
        V3::new(-1.0,  1.0, -1.0),
        V3::new(-1.0,  1.0,  1.0),
        
        V3::new(-1.0, -1.0, -1.0),
        V3::new(-1.0, -1.0,  1.0),
        
        V3::new( 1.0,  1.0, -1.0),
        V3::new( 1.0,  1.0,  1.0),
        
        V3::new( 1.0, -1.0, -1.0),
        V3::new( 1.0, -1.0,  1.0),
      ],
      triangles: vec![
        // Top
        [1, 3, 5],
        [3, 7, 5],
        
        // +X side
        [4, 5, 6],
        [5, 7, 6],
        
        // -X side
        [0, 2, 1],
        [1, 2, 3],
        
        // +Y side
        [0, 1, 4],
        [1, 5, 4],
        
        // -Y side
        [2, 6, 3],
        [3, 6, 7],
        
        // Bottom
        [0, 4, 2],
        [2, 4, 6],
      ],
      selection: Vec::new(),
      selection_type: SelectionType::VERTICES,
    }
  }
  
  // Use self instead of &self to cause a move, because this struct should not
  // be used again after packing
  pub fn pack(self, gltf: &mut GLTF) -> MeshPrimitive {
    // Calculate vertex bounds. The vertex bounds are f32 because that is the
    // same precision as GLTF vertices
    let mut min = V3::repeat(f32::MAX);
    let mut max = V3::repeat(f32::MIN);
    for vertex in &self.vertices {
      let vertex = V3::new(vertex.x as f32, vertex.y as f32, vertex.z as f32);
      min = min.inf(&vertex);
      max = max.sup(&vertex);
    }
    
    gltf.append_to_glb_bin(self.vertices_raw(), Type::VEC3,
      ComponentType::Float);
    // Can .unwrap() because the previous .append_to_glb_bin() call guarantees
    // .accessors/min/max will be populated
    gltf.accessors.last_mut().unwrap().min.extend_from_slice(min.as_slice());
    gltf.accessors.last_mut().unwrap().max.extend_from_slice(max.as_slice());
    gltf.buffer_views.last_mut().unwrap().target = Some(
      Target::ArrayBuffer);
    
    gltf.append_to_glb_bin(self.triangles_raw(), Type::SCALAR,
      self.triangles_raw_component_type());
    gltf.buffer_views.last_mut().unwrap().target = Some(
      Target::ElementArrayBuffer);
    
    let mut result = MeshPrimitive::new();
    result.attributes.position = Some(gltf.accessors.len() as u32 - 2);
    result.indices = Some(gltf.accessors.len() as u32 - 1);
    result
  }
}

/////////////////////////
// GLTF Data Structure //
/////////////////////////

#[derive(Clone, serde::Serialize)]
pub struct Asset {
  #[serde(skip_serializing_if = "String::is_empty")]
  pub copyright: String,
  
  #[serde(skip_serializing_if = "String::is_empty")]
  pub generator: String,
  
  // Don't skip if empty...this field is mandatory per GLTF spec!
  pub version: String,
  
  #[serde(skip_serializing_if = "String::is_empty")]
  #[serde(rename = "minVersion")]
  pub min_version: String,
  
  // pub extensions: ??,
  
  // In the .gltf spec, but will have to wait for later
  //pub extra: ??,
}

impl Asset {
  pub fn new() -> Self {
    Self {
      copyright: String::from(""),
      generator: String::from("emg v0.1.0"),
      version: String::from("2.0"),
      min_version: String::from("2.0"),
    }
  }
}

#[derive(Clone, serde::Serialize)]
pub struct GLTF {
  // Don't skip if empty...this field is mandatory per GLTF spec!
  pub asset: Asset,
  
  #[serde(skip_serializing_if = "Option::is_none")]
  pub scene: Option<u32>,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub scenes: Vec<Scene>,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub nodes: Vec<Node>,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub materials: Vec<Material>,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub meshes: Vec<Mesh>,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub accessors: Vec<Accessor>,
  
  #[serde(rename = "bufferViews")]
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub buffer_views: Vec<BufferView>,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub buffers: Vec<Buffer>,
  
  // TODO Not sure about the memory use effects of putting all GLB BIN data
  // into one vector during model construction. Look into using a
  // Vec<Vec<u8>> or similar when I have a suitable test setup
  #[serde(skip_serializing)]
  pub glb_bin: Vec<u8>,
  
  // In the .gltf spec, but will have to wait for later
  /*pub animations: ??
   *  pub asset: ??
   *  pub extensionsUsed: ??
   *  pub extensionsRequired: ??
   *  pub cameras: ??
   *  pub images: ??
   *  pub samplers: ??
   *  pub skins: ??
   *  pub textures: ??
   *  pub extensions: ??
   *  pub extras: ??*/
}

impl GLTF {
  pub fn new() -> Self {
    let scene = Scene::new("");
    
    Self {
      asset: Asset::new(),
      nodes: Vec::new(),
      materials: Vec::new(),
      scene: Some(0),
      scenes: vec![scene],
      meshes: Vec::new(),
      accessors: Vec::new(),
      buffer_views: Vec::new(),
      buffers: vec!(Buffer::new("")),
      glb_bin: Vec::new(),
    }
  }
  
  pub fn append_to_glb_bin(&mut self, buffer: impl IntoIterator,
  type_: Type, component_type: ComponentType) {
    let mut bytes = 0;
    for value in buffer.into_iter() {
      let sliced = unsafe { any_as_u8_slice(&value) };
      self.glb_bin.extend_from_slice(sliced);
      bytes += sliced.len() as u32;
    }
    self.buffers[0].byte_length += bytes;
    
    let mut buffer_view = BufferView::new("");
    buffer_view.buffer = 0;
    buffer_view.byte_length = bytes;
    buffer_view.byte_offset = (self.glb_bin.len() as u32) - bytes;
    self.buffer_views.push(buffer_view);
    
    let mut accessor = Accessor::new("");
    accessor.buffer_view = Some((self.buffer_views.len() - 1) as u32);
    accessor.type_ = type_;
    accessor.component_type = component_type;
    accessor.count = bytes/type_.component_count()/component_type.byte_count();
    self.accessors.push(accessor);
  }
  
  /// Creates a new node and adds it to the specified scene. If unsure, use
  /// scene 0
  pub fn new_root_node<S: Into<String>>(&mut self, scene: u32, name: S) ->
  *mut Node {
    let index = self.nodes.len() as u32;
    self.scenes[scene as usize].nodes.push(index);
    self.nodes.push(Node::new(name));
    self.nodes.last_mut().unwrap()
  }
  
  /// Creates a new node and adds it to the specified node
  pub fn new_node<S: Into<String>>(&mut self, node: u32, name: S) -> &mut Node {
    let index = self.nodes.len() as u32;
    self.nodes[node as usize].children.push(index);
    self.nodes.push(Node::new(name));
    self.nodes.last_mut().unwrap()
  }
  
  /// Creates a new mesh and adds it to the specified node
  pub fn new_mesh<S: Into<String>>(&mut self, node: u32, name: S) -> &mut Mesh {
  let index = self.meshes.len() as u32;
    self.nodes[node as usize].mesh = Some(index);
    self.meshes.push(Mesh::new(name));
    self.meshes.last_mut().unwrap()
  }
  
  pub fn new_material<S: Into<String>>(&mut self, name: S) -> &mut Material {
    self.materials.push(Material::new(name));
    
    // .unwrap() here doesn't unwrap .material, but instead unwraps the result
    // of calling .as_mut(), and is permissible because .material is guaranteed
    // to have a value after the previous line
    self.materials.last_mut().unwrap()
  }
}

// WARNING: Do not edit!
//
// Found this function here:
// https://stackoverflow.com/questions/28127165/how-to-convert-struct-to-u8
//
// Getting something into raw bytes in Rust is absurdly overcomplicated. Code
// that does this is densely packed with subtle dangers, hidden complications,
// and unpleasant surprises. Do not attempt to edit it.
unsafe fn any_as_u8_slice<T: Sized>(p: &T) -> &[u8] {
  ::core::slice::from_raw_parts(
    (p as *const T) as *const u8,
    ::core::mem::size_of::<T>(),
  )
}

#[derive(Clone, serde::Serialize)]
pub struct Scene {
  #[serde(skip_serializing_if = "String::is_empty")]
  pub name: String,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub nodes: Vec<u32>,
  
  //pub extensions: Vec<??>,
  
  // In the .gltf spec but not currently used:
  //pub extras: Vec<A JSON-serializable struct>,
}

impl Scene {
  pub fn new<S: Into<String>>(name: S) -> Self {
    Self { name: name.into(), nodes: Vec::new() }
  }
}

#[derive(Copy, Clone, PartialEq)]
#[derive(serde_tuple::Serialize_tuple)]
pub struct Translation {
  pub x: f64,
  pub y: f64,
  pub z: f64,
}

impl Translation {
  pub fn new() -> Self { Self { x: 0.0, y: 0.0, z: 0.0 } }
  pub fn is_default(&self) -> bool { *self == Self::new() }
}

#[derive(Copy, Clone, PartialEq)]
#[derive(serde_tuple::Serialize_tuple)]
pub struct Rotation {
  pub x: f64,
  pub y: f64,
  pub z: f64,
  pub w: f64,
}

impl Rotation {
  pub fn new() -> Self { Self { x: 0.0, y: 0.0, z: 0.0, w: 1.0 } }
  pub fn is_default(&self) -> bool { *self == Self::new() }
}

#[derive(Copy, Clone, PartialEq)]
#[derive(serde_tuple::Serialize_tuple)]
pub struct Scale {
  pub x: f64,
  pub y: f64,
  pub z: f64,
}

impl Scale {
  pub fn new() -> Self { Self { x: 1.0, y: 1.0, z: 1.0 } }
  pub fn is_default(&self) -> bool { *self == Self::new() }
}

#[derive(Clone, serde::Serialize)]
pub struct Node {
  #[serde(skip_serializing_if = "String::is_empty")]
  pub name: String,
  
  #[serde(skip_serializing_if = "Option::is_none")]
  pub mesh: Option<u32>,
  
  #[serde(rename = "translation")]
  #[serde(skip_serializing_if = "Translation::is_default")]
  pub t: Translation,
  
  #[serde(rename = "rotation")]
  #[serde(skip_serializing_if = "Rotation::is_default")]
  pub r: Rotation,
  
  #[serde(rename = "scale")]
  #[serde(skip_serializing_if = "Scale::is_default")]
  pub s: Scale,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub children: Vec<u32>,
  
  //pub mesh: ??,
  //pub extensions: ??,
  
  // In the .gltf spec but will have to wait for now:
  /*pub camera: ??,
   *  pub skin: ??,
   *  pub matrix: ??,
   *  pub weights: ??,
   *  pub extras: ??,*/
}

impl Node {
  pub fn new<S: Into<String>>(name: S) -> Self {
    Self {
      name: name.into(),
      mesh: None,
      t: Translation::new(),
      r: Rotation::new(),
      s: Scale::new(),
      children: Vec::new(),
    }
  }
}

#[derive(Copy, Clone, PartialEq, serde::Serialize)]
pub enum AlphaMode {
  OPAQUE,
  MASK,
  BLEND,
}

#[derive(Copy, Clone, PartialEq)]
#[derive(serde_tuple::Serialize_tuple)]
pub struct Color4 {
  pub r: f64,
  pub g: f64,
  pub b: f64,
  pub a: f64,
}

impl Color4 {
  pub fn new() -> Self { Self { r: 1.0, g: 1.0, b: 1.0, a: 1.0 } }
  pub fn is_default(&self) -> bool { *self == Self::new() }
}

#[derive(Copy, Clone, serde::Serialize)]
pub struct PBRMetallicRoughness {
  #[serde(rename = "baseColorFactor")]
  #[serde(skip_serializing_if = "Color4::is_default")]
  pub base_color_factor: Color4,
  
  #[serde(rename = "metallicFactor")]
  #[serde(skip_serializing_if = "is_default_metallic_factor")]
  pub metallic_factor: f64,
  
  #[serde(rename = "roughnessFactor")]
  #[serde(skip_serializing_if = "is_default_roughness_factor")]
  pub roughness_factor: f64,
  
  //pub extensions: ??,
  
  // In the .gltf spec but will have to wait for now:
  /*pub extras: ??,
   *  pub metallicRoughnessTexture: ??,
   *  pub baseColorTexture: ??,
   */
}

impl PBRMetallicRoughness {
  pub fn new() -> Self {
    Self {
      base_color_factor: Color4::new(),
      metallic_factor: 1.0,
      roughness_factor: 1.0,
    }
  }
}

fn is_default_metallic_factor(value: &f64) -> bool {
  *value == 1.0
}

fn is_default_roughness_factor(value: &f64) -> bool {
  *value == 1.0
}

fn is_default_emissive_factor(value: &[f64; 3]) -> bool {
  *value == [0.0, 0.0, 0.0]
}

fn is_default_alpha_mode(value: &AlphaMode) -> bool {
  *value == AlphaMode::OPAQUE
}

fn is_default_alpha_cutoff(value: &f64) -> bool {
  *value == 0.5
}

fn is_default_double_sided(value: &bool) -> bool {
  *value == false
}

#[derive(Clone, serde::Serialize)]
pub struct Material {
  #[serde(skip_serializing_if = "String::is_empty")]
  pub name: String,
  
  #[serde(rename = "emissiveFactor")]
  #[serde(skip_serializing_if = "is_default_emissive_factor")]
  pub emissive_factor: [f64; 3],
  
  #[serde(rename = "alphaMode")]
  #[serde(skip_serializing_if = "is_default_alpha_mode")]
  pub alpha_mode: AlphaMode,
  
  #[serde(rename = "alphaCutoff")]
  #[serde(skip_serializing_if = "is_default_alpha_cutoff")]
  pub alpha_cutoff: f64,
  
  #[serde(rename = "doubleSided")]
  #[serde(skip_serializing_if = "is_default_double_sided")]
  pub double_sided: bool,
  
  #[serde(rename = "pbrMetallicRoughness")]
  // Not sure how to skip serializing when unused for this one
  pub pbr_metallic_roughness: PBRMetallicRoughness,
  
  //pub extensions: ??,
  
  // In the .gltf spec but will have to wait for now:
  /*pub extras: ??,
   *  pub normalTexture: ??,
   *  pub occlusionTexture: ??,
   *  pub emissiveTexture: ??,*/
}

impl Material {
  pub fn new<S: Into<String>>(name: S) -> Self {
    Self {
      name: name.into(),
      emissive_factor: [0.0, 0.0, 0.0],
      alpha_mode: AlphaMode::OPAQUE,
      alpha_cutoff: 0.5,
      double_sided: false,
      pbr_metallic_roughness: PBRMetallicRoughness::new(),
    }
  }
}

// The fields here are in the spec in section 3.7 - Concepts / Geometry,
// which took me a while to find
#[derive(Copy, Clone, serde::Serialize)]
pub struct Attributes {
  #[serde(rename = "COLOR_0")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub color_0: Option<u32>,
  
  #[serde(rename = "JOINTS_0")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub joints_0: Option<u32>,
  
  #[serde(rename = "NORMAL")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub normal: Option<u32>,
  
  #[serde(rename = "POSITION")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub position: Option<u32>,
  
  #[serde(rename = "TANGENT")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub tangent: Option<u32>,
  
  #[serde(rename = "TEXCOORD_0")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub texcoord_0: Option<u32>,
  
  #[serde(rename = "TEXCOORD_1")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub texcoord_1: Option<u32>,
  
  #[serde(rename = "TEXCOORD_2")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub texcoord_2: Option<u32>,
  
  #[serde(rename = "TEXCOORD_3")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub texcoord_3: Option<u32>,
  
  #[serde(rename = "WEIGHTS_0")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub weights_0: Option<u32>,
}

impl Attributes {
  pub fn new() -> Self {
    Self {
      color_0: None,
      joints_0: None,
      normal: None,
      position: None,
      tangent: None,
      texcoord_0: None,
      texcoord_1: None,
      texcoord_2: None,
      texcoord_3: None,
      weights_0: None,
    }
  }
}

#[derive(Copy, Clone, PartialEq, serde_repr::Serialize_repr)]
#[repr(u8)]
pub enum Mode {
  Points = 0,
  Lines = 1,
  LineLoop = 2,
  LineStrip = 3,
  Triangles = 4,
  TriangleStrip = 5,
  TriangleFan = 6,
}

fn is_default_mode(value: &Mode) -> bool {
  *value == Mode::Triangles
}

#[derive(Copy, Clone, serde::Serialize)]
pub struct MeshPrimitive {
  pub attributes: Attributes,
  
  #[serde(skip_serializing_if = "Option::is_none")]
  pub indices: Option<u32>,
  
  #[serde(skip_serializing_if = "Option::is_none")]
  pub material: Option<u32>,
  
  #[serde(skip_serializing_if = "is_default_mode")]
  pub mode: Mode, // Default is triangles
  
  //pub extensions: ??,
  
  // In the .gltf spec but will have to wait for now:
  /*pub extras: ??,
   *  pub targets: ??,*/
}

impl MeshPrimitive {
  pub fn new() -> Self {
    Self {
      attributes: Attributes::new(),
      indices: None,
      material: None,
      mode: Mode::Triangles,
    }
  }
  
  /// Set material index
  pub fn material(&mut self, material: u32) -> &mut Self {
    self.material = Some(material);
    self
  }
}

#[derive(Clone, serde::Serialize)]
pub struct Mesh {
  #[serde(skip_serializing_if = "String::is_empty")]
  pub name: String,
  
  // No serialization filter, this is required per spec
  pub primitives: Vec<MeshPrimitive>,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub weights: Vec<f64>,
  
  //pub extensions: ??,
  
  // In the .gltf spec but will have to wait for now:
  /*pub extras: ??,*/
}

impl Mesh {
  pub fn new<S: Into<String>>(name: S) -> Self {
    Self {
      name: name.into(),
      primitives: Vec::new(),
      weights: Vec::new(),
    }
  }
  
  pub fn copy_primitive(&mut self, primitive: MeshPrimitive) ->
  &mut MeshPrimitive {
    self.primitives.push(primitive);
    self.primitives.last_mut().unwrap()
  }
}

#[derive(Copy, Clone, PartialEq, serde_repr::Serialize_repr)]
#[repr(u16)]
pub enum ComponentType {
  Byte = 5120,
  UnsignedByte = 5121,
  Short = 5122,
  UnsignedShort = 5123,
  UnsignedInt = 5125,
  Float = 5126,
}

impl ComponentType {
  pub fn byte_count(&self) -> u32 {
    match self {
      Self::Byte          => 1,
      Self::UnsignedByte  => 1,
      Self::Short         => 2,
      Self::UnsignedShort => 2,
      Self::UnsignedInt   => 4,
      Self::Float         => 4,
    }
  }
}

#[derive(Copy, Clone, serde::Serialize)]
pub enum Type {
  SCALAR,
  VEC2,
  VEC3,
  VEC4,
  MAT2,
  MAT3,
  MAT4,
}

impl Type {
  pub fn component_count(&self) -> u32 {
    match self {
      Self::SCALAR =>  1,
      Self::VEC2   =>  2,
      Self::VEC3   =>  3,
      Self::VEC4   =>  4,
      Self::MAT2   =>  4,
      Self::MAT3   =>  9,
      Self::MAT4   => 16,
    }
  }
}

#[derive(Clone, serde::Serialize)]
pub struct Accessor {
  // Next time I modify this, I want to try out:
  // #[serde(rename_all = "camelCase")]
  
  #[serde(skip_serializing_if = "String::is_empty")]
  pub name: String,
  
  #[serde(rename = "bufferView")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub buffer_view: Option<u32>,
  
  #[serde(rename = "byteOffset")]
  #[serde(skip_serializing_if = "is_default_byte_offset")]
  pub byte_offset: u32,
  
  #[serde(rename = "componentType")]
  pub component_type: ComponentType,
  
  #[serde(skip_serializing_if = "is_default_normalized")]
  pub normalized: bool,
  
  pub count: u32,
  
  #[serde(rename = "type")]
  pub type_: Type,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub max: Vec<f32>,
  
  #[serde(skip_serializing_if = "Vec::is_empty")]
  pub min: Vec<f32>,
  
  //pub extensions: ??,
  
  // In the .gltf spec but will have to wait for now:
  /* pub max: ??,
   *  pub min: ??,
   *  pub sparse: ??,
   *  pub extras: ??,*/
}

impl Accessor {
  pub fn new<S: Into<String>>(name: S) -> Self {
    Self {
      name: name.into(),
      buffer_view: None,
      byte_offset: 0,
      component_type: ComponentType::Byte,
      normalized: false,
      count: 0,
      type_: Type::SCALAR,
      min: Vec::new(),
      max: Vec::new(),
    }
  }
}

fn is_default_byte_offset(value: &u32) -> bool {
  *value == 0
}

fn is_default_normalized(value: &bool) -> bool {
  *value == false
}

#[derive(Copy, Clone, PartialEq, serde_repr::Serialize_repr)]
#[repr(u16)]
pub enum Target {
  ArrayBuffer = 34962,
  ElementArrayBuffer = 34963,
}

#[derive(Clone, serde::Serialize)]
pub struct BufferView {
  #[serde(skip_serializing_if = "String::is_empty")]
  pub name: String,
  
  pub buffer: u32,
  
  #[serde(rename = "byteLength")]
  pub byte_length: u32,
  
  #[serde(rename = "byteOffset")]
  pub byte_offset: u32,
  
  #[serde(rename = "byteStride")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub byte_stride: Option<u32>,
  
  #[serde(skip_serializing_if = "Option::is_none")]
  pub target: Option<Target>,
  
  //pub extensions: ??,
  
  // In the .gltf spec but will have to wait for now:
  /*pub extras: ??,*/
}

impl BufferView {
  pub fn new<S: Into<String>>(name: S) -> Self {
    Self {
      name: name.into(),
      buffer: 0,
      byte_length: 0,
      byte_offset: 0,
      byte_stride: None,
      target: None,
    }
  }
}

#[derive(Clone, serde::Serialize)]
pub struct Buffer {
  #[serde(skip_serializing_if = "String::is_empty")]
  pub name: String,
  
  #[serde(rename = "byteLength")]
  pub byte_length: u32,
  
  #[serde(skip_serializing_if = "String::is_empty")]
  pub uri: String,
  
  //pub extensions: ??,
  
  // In the .gltf spec but will have to wait for now:
  /*pub extras: ??,*/
}

impl Buffer {
  pub fn new<S: Into<String>>(name: S) -> Self {
    Self {
      name: name.into(),
      byte_length: 0,
      uri: String::from(""),
    }
  }
}

/////////
// FFI //
/////////

#[ffi]
fn init() -> FFIResult<()> {
  let mut gltf_source = lock(&GLTF_SOURCE)?;
  *gltf_source = Some(GLTF::new());
  return Ok(());
}

#[ffi]
fn new_data_structure() -> FFIResult<usize> {
  let mut data_structures = lock(&DATA_STRUCTURES)?;
  data_structures.push(DataStructure::new());
  return Ok(data_structures.len() - 1);
}

#[ffi]
fn multiply_float(index: u32, value: f32) -> FFIResult<()> {
  let mut data_structures = lock(&DATA_STRUCTURES)?;
  
  if data_structures.len() <= index as usize {
    return Err(ErrorCode::HandleOutOfBounds);
  }
  
  data_structures[index as usize].a_float *= value;
  return Ok(());
}

#[ffi]
fn serialize_test() -> FFIResult<FatPointer> {
  let data_structures = lock(&DATA_STRUCTURES)?;
  let mut gltf_output = lock(&GLTF_OUTPUT)?;
  
  gltf_output.clear();
  for i in 0..data_structures.len() {
    serde_json::ser::to_writer(&mut (*gltf_output), &data_structures[i])
      .unwrap();
  }
  
  return FatPointer::try_from(gltf_output.as_ref());
}

#[ffi]
fn new_material(r: f64, g: f64, b: f64, a: f64, metallicity: f64,
roughness: f64) -> FFIResult<usize> {
  let name = get_string_transport(0)?;
  
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLTF_SOURCE)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut gltf_source_option = lock(&GLTF_SOURCE)?;
  let gltf_source = gltf_source_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  let handle = gltf_source.materials.len();
  gltf_source.materials.push(Material::new(name));
  gltf_source.materials[handle].pbr_metallic_roughness = PBRMetallicRoughness {
    metallic_factor: metallicity,
    roughness_factor: roughness,
    base_color_factor: Color4 { r, g, b, a },
  };
  
  return Ok(handle);
}

#[ffi]
fn gen_test() -> FFIResult<()> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLTF_SOURCE)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut gltf_source_option = lock(&GLTF_SOURCE)?;
  let mut gltf_source = gltf_source_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  let node = gltf_source.nodes.len() as u32;
  gltf_source.new_root_node(0, "Fortress Wall Battlement");
  
  let mesh = gltf_source.meshes.len();
  gltf_source.new_mesh(node, "Fortress Wall Battlement");
  
  let red = 0u32;
  let black = 1u32;
  
  let mut red_block = Geometry::cube();
  red_block.s(1.0, 0.25, 0.3).t(0.0, -0.75, 4.1);
  let red_submesh = red_block.pack(&mut gltf_source);
  gltf_source.meshes[mesh].copy_primitive(red_submesh).material(red);
  
  let mut black_block = Geometry::cube();
  black_block.s(0.5, 0.25, 0.3).t(0.0, -0.75, 4.7);
  black_block.select_triangles(V3::new(-10.0, -10.0, 4.3),
    V3::new(10.0, 10.0, 4.5));
  black_block.delete_triangles();
  let black_submesh = black_block.pack(&mut gltf_source);
  gltf_source.meshes[mesh].copy_primitive(black_submesh).material(black);
  
  Ok(())
}

struct DryRunWriter {
  bytes_written: usize,
}

impl DryRunWriter {
  fn new() -> Self {
    Self { bytes_written: 0 }
  }
}

impl std::io::Write for DryRunWriter {
  fn write(&mut self, buf: &[u8]) -> Result<usize, std::io::Error> {
    self.bytes_written += buf.len();
    Ok(buf.len())
  }
  
  fn flush(&mut self) -> Result<(), std::io::Error> {
    Ok(())
  }
}

#[ffi]
fn serialize() -> FFIResult<FatPointer> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLTF_SOURCE)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let gltf_source_option = lock(&GLTF_SOURCE)?;
  let gltf_source = gltf_source_option.as_ref().ok_or(
    ErrorCode::NotInitialized)?;
  
  let mut gltf_output = lock(&GLTF_OUTPUT)?;
  
  let mut dry_run_writer = DryRunWriter::new();
  serde_json::ser::to_writer(&mut dry_run_writer, &gltf_source).unwrap();
  
  // Per GLB spec, the length field of each chunk EXCLUDES headers and INCLUDES 
  // padding
  let json_padding = (4 - dry_run_writer.bytes_written % 4) % 4;
  let json_length = dry_run_writer.bytes_written + json_padding;
  let bin_padding = (4 - gltf_source.glb_bin.len() % 4) % 4;
  let bin_length = gltf_source.glb_bin.len() + bin_padding;
  
  // Per GLB spec, overall length field INCLUDES headers
  let mut glb_length = 12 + 8 + json_length;
  if gltf_source.glb_bin.len() > 0 {
    glb_length += 8 + bin_length;
  }
  
  gltf_output.clear();
  gltf_output.reserve_exact(glb_length);
  
  // GLB header
  gltf_output.append(&mut String::from("glTF").into_bytes());
  gltf_output.extend_from_slice(&2u32.to_le_bytes()); // GLTF version #
  gltf_output.extend_from_slice(&(glb_length).to_le_bytes());
  
  // JSON chunk
  gltf_output.extend_from_slice(&(json_length).to_le_bytes());
  gltf_output.append(&mut String::from("JSON").into_bytes());
  serde_json::ser::to_writer(&mut (*gltf_output), &gltf_source).unwrap();
  for _ in 0..json_padding {
    // Per GLB spec, JSON chunk is padded with ASCII spaces
    gltf_output.push(0x20);
  }
  
  // BIN chunk
  if gltf_source.glb_bin.len() > 0 {
    gltf_output.extend_from_slice(&(bin_length).to_le_bytes());
    gltf_output.append(&mut String::from("BIN\0").into_bytes());
    gltf_output.extend(&gltf_source.glb_bin);
    for _ in 0..bin_padding {
      // Per GLB spec, BIN chunk is padded with zeroes
      gltf_output.push(0);
    }
  }
  
  gltf_output.shrink_to_fit();
  
  return FatPointer::try_from(gltf_output.as_ref());
}
