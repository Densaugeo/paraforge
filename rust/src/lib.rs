use std::collections::{BTreeMap, HashMap, BTreeSet};
use std::sync::{Mutex, MutexGuard};

pub use nalgebra::Vector3 as V3;

use paraforge_macros::ffi;

/////////////
// Statics //
/////////////

// Statics are use to hold Paraforge's working data. They allow storing
// persistent data structures that can be modified across different FFI calls

static GEOMETRIES: Mutex<Vec<Geometry>> = Mutex::new(Vec::new());
static PACKED_GEOMETRIES: Mutex<Vec<PackedGeometry>> = Mutex::new(Vec::new());
static STRING_TRANSPORT: Mutex<[Vec<u8>; 4]> = Mutex::new([vec![], vec![],
  vec![], vec![]]);
static GLB_JSON: Mutex<Option<gltf_json::Root>> = Mutex::new(None);
static GLB_BIN: Mutex<Vec<u8>> = Mutex::new(Vec::new());
static GLB_OUTPUT: Mutex<Vec<u8>> = Mutex::new(Vec::new());


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
  VtxOutOfBounds = 19,
  TriOutOfBounds = 20,
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

#[derive(PartialEq)]
pub enum SelectionType {
  VTCS,
  TRIS,
}

pub struct Geometry {
  pub vtcs: Vec<V3<f64>>,
  
  pub tris: Vec<[u32; 3]>,
  
  pub selection: BTreeSet<u32>,
  pub selection_type: SelectionType,
}

impl Geometry {
  /// Raw vertex buffer, suitable for GLTF packing
  pub fn vtcs_raw(&self) -> impl Iterator + '_ {
    self.vtcs.iter().flat_map(|v| vec![v[0] as f32, v[1] as f32,
      v[2] as f32])
  }
  
  /// Raw triangle buffer, suitable for GLTF packing
  pub fn tris_raw(&self) -> impl Iterator + '_ {
    self.tris.iter().flat_map(|v| {
      if self.vtcs.len() < 0x10000 {
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
  
  pub fn tris_raw_component_type(&self) -> gltf_json::accessor::ComponentType {
    if self.vtcs.len() < 0x10000 {
      gltf_json::accessor::ComponentType::U16
    } else {
      gltf_json::accessor::ComponentType::U32
    }
  }
  
  // Apply a translation
  pub fn translate(&mut self, x: f64, y: f64, z: f64) {
    let translation = V3::new(x, y, z);
    
    for vtx in &mut self.vtcs {
      *vtx += translation;
    }
  }
  
  // Apply a scale
  pub fn scale(&mut self, x: f64, y: f64, z: f64) {
    let scale = V3::new(x, y, z);
    
    for vtx in &mut self.vtcs {
      vtx.component_mul_assign(&scale);
    }
  }
  
  // rotations / matrices
  
  // Merges
  
  // Vertex deduplication
  
  /// Selects vertices within the bounding box defined by the given points.
  /// Allows error of 1e-6
  pub fn select_vtcs(&mut self, bound_1: V3<f64>, bound_2: V3<f64>) {
    self.selection.clear();
    self.selection_type = SelectionType::VTCS;
    
    let lower_bound = bound_1.inf(&bound_2) - V3::new(1e-6, 1e-6, 1e-6);
    let upper_bound = bound_1.sup(&bound_2) + V3::new(1e-6, 1e-6, 1e-6);
    
    for i in 0..self.vtcs.len() {
      if lower_bound[0] < self.vtcs[i][0] && self.vtcs[i][0] < upper_bound[0] &&
         lower_bound[1] < self.vtcs[i][1] && self.vtcs[i][1] < upper_bound[1] &&
         lower_bound[2] < self.vtcs[i][2] && self.vtcs[i][2] < upper_bound[2] {
        self.selection.insert(i as u32);
      }
    }
  }
  
  /// Selects triangles within the bounding box defined by the given points.
  /// Allows error of 1e-6
  pub fn select_tris(&mut self, bound_1: V3<f64>, bound_2: V3<f64>) {
    self.select_vtcs(bound_1, bound_2);
    let bounded_vtcs = self.selection.clone();
    
    self.selection.clear();
    self.selection_type = SelectionType::TRIS;
    
    for i in 0..self.tris.len() {
      if bounded_vtcs.contains(&self.tris[i][0]) &&
         bounded_vtcs.contains(&self.tris[i][1]) &&
         bounded_vtcs.contains(&self.tris[i][2]) {
        self.selection.insert(i as u32);
      }
    }
  }
  
  pub fn create_vtx(&mut self, vtx: V3<f64>) {
    self.vtcs.push(vtx);
  }
  
  /// Automatically deletes affected triangles
  pub fn delete_vtx(&mut self, vtx: u32) {
    // Swap remove to avoid having to shift vertices
    self.vtcs.swap_remove(vtx as usize);
    let swapped_vtx = self.vtcs.len() as u32;
    
    for i in 0..self.tris.len() {
      // Delete triangle if it includes deleted vertex
      if self.tris[i].contains(&vtx) {
        self.tris.swap_remove(i);
        continue;
      }
      
      // Update indices if swapped vertex is referenced
      for j in 0..2 {
        if self.tris[i][j] == swapped_vtx {
          self.tris[i][j] = vtx
        }
      }
    }
    
    self.selection.clear();
  }
  
  /// Automatically deletes affected triangles
  pub fn delete_vtcs(&mut self) {
    // Vertices must be processed in reverse order, because deletion of lower-
    // index vertices can change the index of higher-index vertices
    for vtx in self.selection.clone().iter().rev() {
      self.delete_vtx(*vtx);
    }
  }
  
  pub fn create_tri(&mut self, tri: [u32; 3]) -> FFIResult<()> {
    for vtx in tri {
      if vtx >= self.vtcs.len() as u32 {
        return Err(ErrorCode::VtxOutOfBounds)
      }
    }
    
    self.tris.push(tri);
    
    Ok(())
  }
  
  pub fn delete_tri(&mut self, tri: u32) {
    self.tris.swap_remove(tri as usize);
    self.selection.clear();
  }
  
  pub fn delete_tris(&mut self) {
    // Triangles must be processed in reverse order, because deletion of lower-
    // index triangles can change the index of higher-index triangles
    for tri in self.selection.clone().iter().rev() {
      self.delete_tri(*tri);
    }
  }
  
  pub fn delete_stray_vtcs(&mut self) {
    // Vertices must be processed in reverse order, because deletion of lower-
    // index vertices can change the index of higher-index vertices
    for vtx in self.vtcs.len()..0 {
      let mut vtx_used = false;
      for tri in &self.tris {
        if tri.contains(&(vtx as u32)) {
          vtx_used = true;
        }
      }
      
      if vtx_used {
        self.delete_vtx(vtx as u32);
      }
    }
  }
  
  pub fn extrude(&mut self, displacement: V3<f64>) {
    // Maps indices of original vertices to their extruded counterparts
    let mut vtx_mapping = HashMap::new();
    
    // Key is a (u32, u32) representing vertices of an edge, value is a bool
    // representing whether the edge is should be extruded into new triangles
    // (generally this is true when the edge is part of exactly one in-selection
    // triangle)
    let mut edges = HashMap::new();
    
    let all_selected = self.selection.len() == match self.selection_type {
      SelectionType::VTCS => self.vtcs.len(),
      SelectionType::TRIS => self.tris.len(),
    };
    
    // Note: When selecting by triangles, there can be duplicate vertices in the
    // selection
    let vtcs_in_selection: Box<dyn Iterator<Item = u32>> =
    match self.selection_type {
      SelectionType::VTCS => Box::new(self.selection.iter().copied()),
      SelectionType::TRIS => Box::new(self.selection.iter().flat_map(
        |tri_index| self.tris[*tri_index as usize]
      )),
    };
    
    // Copy selected vertices
    for vtx_index in vtcs_in_selection {
      // Repeat vertices are only possible here if using triangle selection
      if self.selection_type == SelectionType::TRIS {
        if vtx_mapping.contains_key(&vtx_index) { continue }
      }
      
      vtx_mapping.insert(vtx_index, self.vtcs.len() as u32);
      let vtx = self.vtcs[vtx_index as usize];
      self.vtcs.push(vtx + displacement);
    }
    
    let candidate_tris: Box<dyn Iterator<Item = u32>> =
    match self.selection_type {
      SelectionType::VTCS => Box::new(0u32..self.tris.len() as u32),
      SelectionType::TRIS => Box::new(self.selection.iter().copied()),
    };
    
    // Move/copy selected tris (tris are only copied if the entire geometry was
    // selected)
    for tri_index in candidate_tris {
      let tri = &mut self.tris[tri_index as usize];
      
      let Some(&t0) = vtx_mapping.get(&tri[0]) else { continue };
      let Some(&t1) = vtx_mapping.get(&tri[1]) else { continue };
      let Some(&t2) = vtx_mapping.get(&tri[2]) else { continue };
      
      for i in 0..3 {
        let (e0, e1) = (tri[i], tri[(i + 1) % 3]);
        
        if edges.contains_key(&(e0, e1)) {
          edges.entry((e0, e1)).and_modify(|entry| *entry = false);
        } else if edges.contains_key(&(e1, e0)) {
          edges.entry((e1, e0)).and_modify(|entry| *entry = false);
        } else {
          edges.insert((e0, e1), true);
        }
      }
      
      if all_selected {
        (tri[0], tri[1]) = (tri[1], tri[0]);
        self.tris.push([t0, t1, t2]);
      } else {
        (tri[0], tri[1], tri[2]) = (t0, t1, t2);
      }
    }
    
    // Extrude true edges into new tris
    for (key, value) in edges {
      if value == false { continue }
      
      self.tris.push([key.0, key.1, *vtx_mapping.get(&key.1).unwrap()]);
      self.tris.push([key.0, *vtx_mapping.get(&key.1).unwrap(),
        *vtx_mapping.get(&key.0).unwrap()]);
    }
  }
  
  pub fn new() -> Self {
    Self {
      vtcs: Vec::new(),
      tris: Vec::new(),
      selection: BTreeSet::new(),
      selection_type: SelectionType::VTCS,
    }
  }
  
  pub fn cube() -> Self {
    Self {
      vtcs: vec![
        V3::new(-1.0,  1.0, -1.0),
        V3::new(-1.0,  1.0,  1.0),
        
        V3::new(-1.0, -1.0, -1.0),
        V3::new(-1.0, -1.0,  1.0),
        
        V3::new( 1.0,  1.0, -1.0),
        V3::new( 1.0,  1.0,  1.0),
        
        V3::new( 1.0, -1.0, -1.0),
        V3::new( 1.0, -1.0,  1.0),
      ],
      tris: vec![
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
      selection: BTreeSet::new(),
      selection_type: SelectionType::VTCS,
    }
  }
  
  pub fn pack(&self, glb_bin: &mut Vec<u8>, glb_json: &mut gltf_json::Root)
  -> PackedGeometry {
    // Calculate vertex bounds. The vertex bounds are f32 because that is the
    // same precision as GLTF vertices
    let mut min = V3::repeat(f32::MAX);
    let mut max = V3::repeat(f32::MIN);
    for vtx in &self.vtcs {
      let vtx = V3::new(vtx.x as f32, vtx.y as f32, vtx.z as f32);
      min = min.inf(&vtx);
      max = max.sup(&vtx);
    }
    
    append_to_glb_bin(glb_bin, glb_json, self.vtcs_raw(),
      gltf_json::accessor::Type::Vec3, gltf_json::accessor::ComponentType::F32);
    // Can .unwrap() because the previous .append_to_glb_bin() call guarantees
    // .accessors/min/max will be populated
    glb_json.accessors.last_mut().unwrap().min = Some(
      gltf_json::Value::from(min.as_slice()));
    glb_json.accessors.last_mut().unwrap().max = Some(
      gltf_json::Value::from(max.as_slice()));
    glb_json.buffer_views.last_mut().unwrap().target = Some(
      gltf_json::validation::Checked::Valid(
      gltf_json::buffer::Target::ArrayBuffer));
    
    append_to_glb_bin(glb_bin, glb_json, self.tris_raw(),
      gltf_json::accessor::Type::Scalar, self.tris_raw_component_type());
    // Can .unwrap() because the previous .append_to_glb_bin() call guarantees
    // .accessors/min/max will be populated
    glb_json.buffer_views.last_mut().unwrap().target = Some(
      gltf_json::validation::Checked::Valid(
      gltf_json::buffer::Target::ElementArrayBuffer));
    
    return PackedGeometry {
      vtx_buffer: glb_json.accessors.len() as u32 - 2,
      tri_buffer: glb_json.accessors.len() as u32 - 1,
    }
  }
}

pub struct PackedGeometry {
  vtx_buffer: u32,
  tri_buffer: u32,
}

/////////////////////////////////////////////////
// Crater Where GLTF Data Structure Used To Be //
/////////////////////////////////////////////////

fn append_to_glb_bin(glb_bin: &mut Vec<u8>, glb_json: &mut gltf_json::Root,
buffer: impl IntoIterator, type_: gltf_json::accessor::Type,
component_type: gltf_json::accessor::ComponentType) {
  let mut bytes = 0;
  for value in buffer.into_iter() {
    let sliced = unsafe { any_as_u8_slice(&value) };
    glb_bin.extend_from_slice(sliced);
    bytes += sliced.len() as u64;
  }
  glb_json.buffers[0].byte_length.0 += bytes;
  
  let buffer_view = glb_json.push(gltf_json::buffer::View {
    name: None,
    buffer: gltf_json::Index::new(0),
    byte_length: gltf_json::validation::USize64(bytes),
    byte_offset: Some(gltf_json::validation::USize64(
      (glb_bin.len() as u64) - bytes)),
    byte_stride: None,
    target: Some(gltf_json::validation::Checked::Valid(
      gltf_json::buffer::Target::ArrayBuffer)),
    extensions: None,
    extras: gltf_json::extras::Void::default(),
  });
  
  glb_json.push(gltf_json::Accessor {
    name: None,
    buffer_view: Some(buffer_view),
    byte_offset: None,
    type_: gltf_json::validation::Checked::Valid(type_),
    component_type: gltf_json::validation::Checked::Valid(
      gltf_json::accessor::GenericComponentType(component_type)),
    count: gltf_json::validation::USize64(
      bytes/component_count(type_)/byte_count(component_type)),
    min: None, // Overwritten shortly after by calling function
    max: None, // Overwritten shortly after by calling function
    normalized: false,
    sparse: None,
    extensions: None,
    extras: gltf_json::extras::Void::default(),
  });
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

fn component_count(type_: gltf_json::accessor::Type) -> u64 {
  match type_ {
    gltf_json::accessor::Type::Scalar =>  1,
    gltf_json::accessor::Type::Vec2   =>  2,
    gltf_json::accessor::Type::Vec3   =>  3,
    gltf_json::accessor::Type::Vec4   =>  4,
    gltf_json::accessor::Type::Mat2   =>  4,
    gltf_json::accessor::Type::Mat3   =>  9,
    gltf_json::accessor::Type::Mat4   => 16
  }
}

fn byte_count(component_type: gltf_json::accessor::ComponentType) -> u64 {
  match component_type {
    gltf_json::accessor::ComponentType::U8  => 1,
    gltf_json::accessor::ComponentType::I8  => 1,
    gltf_json::accessor::ComponentType::U16 => 2,
    gltf_json::accessor::ComponentType::I16 => 2,
    gltf_json::accessor::ComponentType::U32 => 4,
    gltf_json::accessor::ComponentType::F32 => 4,
  }
}

/////////
// FFI //
/////////

#[ffi]
fn init() -> FFIResult<()> {
  let mut glb_json_option = lock(&GLB_JSON)?;
  *glb_json_option = Some(gltf_json::Root::default());
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  let mut glb_bin = lock(&GLB_BIN)?;
  
  glb_json.asset.generator = Some(String::from("emg v0.1.0"));
  glb_json.asset.min_version = Some(String::from("2.0"));
  
  // Currently, all paraforge models use a single buffer which packs into the
  // BIN section of the GLB output
  glb_json.push(gltf_json::Buffer {
    name: None,
    byte_length: gltf_json::validation::USize64(0),
    uri: None,
    extensions: None,
    extras: Default::default(),
  });
  
  let scene_handle = glb_json.push(gltf_json::Scene {
    name: Some(String::from("A name for a scene")),
    nodes: Vec::new(),
    extensions: None,
    extras: Default::default(),
  });
  glb_json.scene = Some(scene_handle);
  
  glb_bin.clear();
  
  return Ok(());
}

#[ffi]
fn new_material(r: f64, g: f64, b: f64, a: f64, metallicity: f64,
roughness: f64) -> FFIResult<usize> {
  let name = get_string_transport(0)?;
  
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  let mut pbr = gltf_json::material::PbrMetallicRoughness::default();
  pbr.metallic_factor.0 = metallicity as f32;
  pbr.roughness_factor.0 = roughness as f32;
  pbr.base_color_factor = gltf_json::material::PbrBaseColorFactor([r as f32,
    g as f32, b as f32, a as f32]);
  
  let mut material = gltf_json::Material::default();
  material.name = Some(name);
  material.pbr_metallic_roughness = pbr;
  
  return Ok(glb_json.push(material).value());
}

#[ffi]
fn new_node_in_scene(scene: usize) -> FFIResult<usize> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  if scene >= glb_json.scenes.len() {
    return Err(ErrorCode::HandleOutOfBounds);
  }
  
  let mut node = gltf_json::Node::default();
  node.name = Some(String::from("Fortress Wall Battlement"));
  
  let handle = glb_json.push(node);
  glb_json.scenes[scene].nodes.push(handle);
  return Ok(handle.value());
}

#[ffi]
fn new_mesh_in_node(node: usize) -> FFIResult<usize> {
  let name = get_string_transport(0)?;
  
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  if node >= glb_json.nodes.len() {
    return Err(ErrorCode::HandleOutOfBounds);
  }
  
  let handle = glb_json.push(gltf_json::Mesh {
    name: Some(String::from(name)),
    primitives: Vec::new(),
    weights: None,
    extensions: None,
    extras: Default::default(),
  });
  glb_json.nodes[node].mesh = Some(handle);
  return Ok(handle.value());
}

#[ffi]
fn new_prim_in_mesh(mesh: usize, packed_geometry: usize, material: usize)
-> FFIResult<usize> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  if mesh >= glb_json.meshes.len() {
    return Err(ErrorCode::HandleOutOfBounds);
  }
  if material >= glb_json.materials.len() {
    return Err(ErrorCode::HandleOutOfBounds);
  }
  
  let packed_geometries = lock(&PACKED_GEOMETRIES)?;
  if packed_geometry >= packed_geometries.len() {
    return Err(ErrorCode::HandleOutOfBounds);
  }
  
  let mut prim = gltf_json::mesh::Primitive {
    attributes: BTreeMap::new(),
    indices: Some(gltf_json::Index::new(
      packed_geometries[packed_geometry].tri_buffer)),
    material: Some(gltf_json::Index::new(material as u32)),
    mode: gltf_json::validation::Checked::Valid(
      gltf_json::mesh::Mode::Triangles),
    targets: None,
    extensions: None,
    extras: Default::default(),
  };
  prim.attributes.insert(
    gltf_json::validation::Checked::Valid(gltf_json::mesh::Semantic::Positions), gltf_json::Index::new(packed_geometries[packed_geometry].vtx_buffer));
  
  glb_json.meshes[mesh].primitives.push(prim);
  return Ok(glb_json.meshes[mesh].primitives.len() - 1);
}

#[ffi]
fn get_scene_count() -> FFIResult<usize> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  Ok(glb_json.scenes.len())
}

#[ffi]
fn get_node_count() -> FFIResult<usize> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  Ok(glb_json.nodes.len())
}

#[ffi]
fn get_mesh_count() -> FFIResult<usize> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  Ok(glb_json.meshes.len())
}

#[ffi]
fn mesh_get_prim_count(handle: u32) -> FFIResult<usize> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  Ok(glb_json.meshes[handle as usize].primitives.len())
}

#[ffi]
fn get_material_count() -> FFIResult<usize> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  
  Ok(glb_json.materials.len())
}

#[ffi]
fn geometry_new() -> FFIResult<usize> {
  let mut geometries = lock(&GEOMETRIES)?;
  geometries.push(Geometry::new());
  return Ok(geometries.len() - 1);
}

#[ffi]
fn geometry_new_cube() -> FFIResult<usize> {
  let mut geometries = lock(&GEOMETRIES)?;
  geometries.push(Geometry::cube());
  return Ok(geometries.len() - 1);
}

#[ffi]
fn geometry_translate(handle: usize, x: f64, y: f64, z: f64) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].translate(x, y, z);
  
  Ok(())
}

#[ffi]
fn geometry_scale(handle: usize, x: f64, y: f64, z: f64) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].scale(x, y, z);
  
  Ok(())
}

#[ffi]
fn geometry_select_vtcs(handle: usize, x1: f64, y1: f64, z1: f64, x2: f64,
y2: f64, z2: f64) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].select_vtcs(V3::new(x1, y1, z1), V3::new(x2, y2, z2));
  
  Ok(())
}

#[ffi]
fn geometry_select_tris(handle: usize, x1: f64, y1: f64, z1: f64, x2: f64,
y2: f64, z2: f64) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].select_tris(V3::new(x1, y1, z1), V3::new(x2, y2, z2));
  
  Ok(())
}

#[ffi]
fn geometry_create_vtx(handle: usize, x: f64, y: f64, z: f64) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].create_vtx(V3::new(x, y, z));
  
  Ok(())
}

#[ffi]
fn geometry_delete_vtx(handle: usize, vtx: u32) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].delete_vtx(vtx);
  
  Ok(())
}

#[ffi]
fn geometry_delete_vtcs(handle: usize) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].delete_vtcs();
  
  Ok(())
}

#[ffi]
fn geometry_create_tri(handle: usize, a: u32, b: u32, c: u32) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].create_tri([a, b, c])?;
  
  Ok(())
}

#[ffi]
fn geometry_delete_tri(handle: usize, tri: u32) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].delete_tri(tri);
  
  Ok(())
}

#[ffi]
fn geometry_delete_tris(handle: usize) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].delete_tris();
  
  Ok(())
}

#[ffi]
fn geometry_delete_stray_vtcs(handle: usize) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].delete_stray_vtcs();
  
  Ok(())
}

#[ffi]
fn geometry_set_vtx(handle: usize, vtx: u32, x: f64, y: f64, z: f64)
-> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  if vtx >= geometries[handle].vtcs.len() as u32 {
    return Err(ErrorCode::VtxOutOfBounds)
  };
  
  geometries[handle].vtcs[vtx as usize] = V3::new(x, y, z);
  
  Ok(())
}

#[ffi]
fn geometry_set_tri(handle: usize, tri: u32, a: u32, b: u32, c: u32)
-> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  if tri >= geometries[handle].tris.len() as u32 {
    return Err(ErrorCode::TriOutOfBounds)
  };
  
  geometries[handle].tris[tri as usize] = [a, b, c];
  
  Ok(())
}

#[ffi]
fn geometry_get_vtx_count(handle: usize) -> FFIResult<usize> {
  let geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  Ok(geometries[handle].vtcs.len())
}

#[ffi]
fn geometry_get_tri_count(handle: usize) -> FFIResult<usize> {
  let geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  Ok(geometries[handle].tris.len())
}

#[ffi]
fn geometry_extrude(handle: usize, x: f64, y: f64, z: f64) -> FFIResult<()> {
  let mut geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  
  geometries[handle].extrude(V3::new(x, y, z));
  
  Ok(())
}

#[ffi]
fn geometry_pack(handle: usize) -> FFIResult<usize> {
  // This lock must be saved in a variable before it can be used.
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let mut glb_json_option = lock(&GLB_JSON)?;
  let mut glb_json = glb_json_option.as_mut().ok_or(
    ErrorCode::NotInitialized)?;
  let mut glb_bin = lock(&GLB_BIN)?;
  
  let geometries = lock(&GEOMETRIES)?;
  if handle >= geometries.len() { return Err(ErrorCode::HandleOutOfBounds) };
  let mut packed_geometries = lock(&PACKED_GEOMETRIES)?;
  
  packed_geometries.push(geometries[handle].pack(&mut glb_bin, &mut glb_json));
  return Ok(packed_geometries.len() - 1);
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
  // (lock(&GLB_JSON)?).as_ref()... does not compile. This snippet cannot be
  // wrapped in a function
  let glb_json_option = lock(&GLB_JSON)?;
  let glb_json = glb_json_option.as_ref().ok_or(
    ErrorCode::NotInitialized)?;
  let glb_bin = lock(&GLB_BIN)?;
  
  let mut glb_output = lock(&GLB_OUTPUT)?;
  
  let mut dry_run_writer = DryRunWriter::new();
  serde_json::ser::to_writer(&mut dry_run_writer, &glb_json).unwrap();
  
  // Per GLB spec, the length field of each chunk EXCLUDES headers and INCLUDES
  // padding
  let json_padding = (4 - dry_run_writer.bytes_written % 4) % 4;
  let json_length = dry_run_writer.bytes_written + json_padding;
  let bin_padding = (4 - glb_bin.len() % 4) % 4;
  let bin_length = glb_bin.len() + bin_padding;
  
  // Per GLB spec, overall length field INCLUDES headers
  let mut glb_length = 12 + 8 + json_length;
  if glb_bin.len() > 0 {
    glb_length += 8 + bin_length;
  }
  
  glb_output.clear();
  glb_output.reserve_exact(glb_length);
  
  // GLB header
  glb_output.append(&mut String::from("glTF").into_bytes());
  glb_output.extend_from_slice(&2u32.to_le_bytes()); // GLTF version #
  glb_output.extend_from_slice(&(glb_length).to_le_bytes());
  
  // JSON chunk
  glb_output.extend_from_slice(&(json_length).to_le_bytes());
  glb_output.append(&mut String::from("JSON").into_bytes());
  serde_json::ser::to_writer(&mut (*glb_output), &glb_json).unwrap();
  for _ in 0..json_padding {
    // Per GLB spec, JSON chunk is padded with ASCII spaces
    glb_output.push(0x20);
  }
  
  // BIN chunk
  if glb_bin.len() > 0 {
    glb_output.extend_from_slice(&(bin_length).to_le_bytes());
    glb_output.append(&mut String::from("BIN\0").into_bytes());
    glb_output.extend(&*glb_bin);
    for _ in 0..bin_padding {
      // Per GLB spec, BIN chunk is padded with zeroes
      glb_output.push(0);
    }
  }
  
  glb_output.shrink_to_fit();
  
  return FatPointer::try_from(glb_output.as_ref());
}
