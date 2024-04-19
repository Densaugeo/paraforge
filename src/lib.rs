use std::sync::Mutex;
use std::sync::atomic::{Ordering, AtomicU64};

//static ERROR_CODE: AtomicU32 = AtomicU32::new(0);
static MODEL_POINTER: AtomicU64 = AtomicU64::new(0);
static MODEL_SIZE: AtomicU64 = AtomicU64::new(0);
static DATA_STRUCTURES: Mutex<Vec<DataStructure>> = Mutex::new(Vec::new());
static GLTF_OUTPUT: Mutex<Vec<u8>> = Mutex::new(Vec::new());

// WebAssembly is rumored to always be 32 bit, so assume that's the pointer size
#[no_mangle]
pub extern "C" fn model_pointer() -> u64 {
  MODEL_POINTER.load(Ordering::Relaxed)
}

// WebAssembly is rumored to always be 32 bit, so assume that's the pointer size
#[no_mangle]
pub extern "C" fn model_size() -> u64 {
  MODEL_SIZE.load(Ordering::Relaxed)
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
pub extern "C" fn new_data_structure() -> u32 {
  let mut unlocked = DATA_STRUCTURES.lock().unwrap();
  unlocked.push(DataStructure::new());
  0
}

#[no_mangle]
pub extern "C" fn multiply_float(index: u32, value: f32) -> u32 {
  let mut unlocked = DATA_STRUCTURES.lock().unwrap();
  
  if unlocked.len() <= index as usize { return 1 };
  
  unlocked[index as usize].a_float *= value;
  0
}

#[no_mangle]
pub extern "C" fn serialize() -> u32 {
  let data_structures = DATA_STRUCTURES.lock().unwrap();
  let mut gltf_output = GLTF_OUTPUT.lock().unwrap();
  
  for i in 0..data_structures.len() {
    serde_json::ser::to_writer(&mut (*gltf_output), &data_structures[i])
      .unwrap();
  }
  
  MODEL_POINTER.store(gltf_output.as_ptr() as u64, Ordering::Relaxed);
  MODEL_SIZE.store(gltf_output.len() as u64, Ordering::Relaxed);
  
  0
}
