use std::sync::{Mutex, MutexGuard};

use paraforge_macros::ffi;

/////////////
// Statics //
/////////////

// Statics are use to hold Paraforge's working data. They allow storing
// persistent data structres that can be modified across different FFI calls

static DATA_STRUCTURES: Mutex<Vec<DataStructure>> = Mutex::new(Vec::new());
static GLTF_OUTPUT: Mutex<Vec<u8>> = Mutex::new(Vec::new());

fn lock<'a, T>(mutex: &'a Mutex<T>) -> Result<MutexGuard<'a, T>, ErrorCode> {
  match mutex.lock() {
    Ok(value) => return Ok(value),
    Err(_) => return Err(ErrorCode::Mutex),
  }
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

impl TryFrom<MutexGuard<'_, Vec<u8>>> for FatPointer {
  type Error = ErrorCode;
  
  fn try_from(value: MutexGuard<'_, Vec<u8>>) -> Result<Self, ErrorCode> {
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

/////////////////////
// Data Structures //
/////////////////////

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

/////////
// FFI //
/////////

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
fn serialize() -> FFIResult<FatPointer> {
  let data_structures = lock(&DATA_STRUCTURES)?;
  let mut gltf_output = lock(&GLTF_OUTPUT)?;
  
  gltf_output.clear();
  for i in 0..data_structures.len() {
    serde_json::ser::to_writer(&mut (*gltf_output), &data_structures[i])
      .unwrap();
  }
  
  return FatPointer::try_from(gltf_output);
}
