use std::sync::Mutex;

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

static DATA_STRUCTURES: Mutex<Vec<DataStructure>> = Mutex::new(Vec::new());

#[no_mangle]
pub extern "C" fn new_data_structure() -> u32 {
  let mut unlocked = DATA_STRUCTURES.lock().unwrap();
  unlocked.push(DataStructure::new());
  (unlocked.len() - 1) as u32
}

#[no_mangle]
pub extern "C" fn multiply_float(index: u32, value: f32) -> u32 {
  let mut unlocked = DATA_STRUCTURES.lock().unwrap();
  
  // TODO I think error codes will have to be saved in an atomic for later
  // retrieval
  if unlocked.len() <= index as usize { return 1 };
  
  unlocked[index as usize].a_float *= value;
  return 0;
}

#[no_mangle]
pub extern "C" fn get_float(index: u32) -> f32 {
  let unlocked = DATA_STRUCTURES.lock().unwrap();
  
  unlocked[index as usize].a_float
}
