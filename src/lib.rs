use std::sync::Mutex;
use std::sync::atomic::{Ordering, AtomicU32};

static MODEL_POINTER: AtomicU32 = AtomicU32::new(0);
static MODEL_SIZE: AtomicU32 = AtomicU32::new(0);
static DATA_STRUCTURES: Mutex<Vec<DataStructure>> = Mutex::new(Vec::new());
static GLTF_OUTPUT: Mutex<Vec<u8>> = Mutex::new(Vec::new());

// WebAssembly is rumored to always be 32 bit, so assume that's the pointer size
#[no_mangle]
pub extern "C" fn model_pointer() -> u32 {
  MODEL_POINTER.load(Ordering::Relaxed)
}

// WebAssembly is rumored to always be 32 bit, so assume that's the pointer size
#[no_mangle]
pub extern "C" fn model_size() -> u32 {
  MODEL_SIZE.load(Ordering::Relaxed)
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
  ModuleNotEMG = 7,
  ModelGeneratorNotFound = 8,
  ParameterCount = 9,
  ParameterType = 10,
  ParameterOutOfRange = 11,
  OutputNotGLB = 12,
}

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

#[no_mangle]
pub extern "C" fn new_data_structure() -> u64 {
  let mut data_structures = match DATA_STRUCTURES.lock() {
    Ok(v) => v,
    Err(_) => return ErrorCode::Mutex as u64,
  };
  
  data_structures.push(DataStructure::new());
  return ((data_structures.len() - 1) as u64) << 32
}

#[no_mangle]
pub extern "C" fn multiply_float(index: u32, value: f32) -> ErrorCode {
  let mut data_structures = match DATA_STRUCTURES.lock() {
    Ok(v) => v,
    Err(_) => return ErrorCode::Mutex,
  };
  
  if data_structures.len() <= index as usize {
    return ErrorCode::Generation;
  }
  
  data_structures[index as usize].a_float *= value;
  return ErrorCode::None
}

#[no_mangle]
pub extern "C" fn serialize() -> ErrorCode {
  let data_structures = match DATA_STRUCTURES.lock() {
    Ok(v) => v,
    Err(_) => return ErrorCode::Mutex,
  };
  let mut gltf_output = match GLTF_OUTPUT.lock() {
    Ok(v) => v,
    Err(_) => return ErrorCode::Mutex,
  };
  
  gltf_output.clear();
  for i in 0..data_structures.len() {
    serde_json::ser::to_writer(&mut (*gltf_output), &data_structures[i])
      .unwrap();
  }
  
  MODEL_POINTER.store(gltf_output.as_ptr() as u32, Ordering::Relaxed);
  MODEL_SIZE.store(gltf_output.len() as u32, Ordering::Relaxed);
  
  return ErrorCode::None
}
