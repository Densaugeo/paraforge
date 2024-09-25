/**
 * Sends log event, which main thread will print to console if priority <=
 * verbosity
 * 
 * Priority guidelines:
 * 0 - For debug/development only
 * 1 - Life cycle events, messages into/out of the worker thread
 * 2 - Internal function calls
 * 3 - Details inside funciton calls
 * 
 * @param priority {number} Lower values = more important
 * @param line {string} Message to log
 */
const log = (priority, line) => {
  self.postMessage({ event: 'log', priority, line })
}

////////////////////
// Setup for Init //
////////////////////

// Most of the traditional init work happens later on, in each relevant section.
// This section sets up messaging to the main thread and retrieves the init
// arguments supplied from the main thread

self.addEventListener('message', async message => {
  const data = message.data
  const args_string = Object.keys(data.args).map(
    key => `${key}=${data.args[key]}`
  ).join(', ')
  log(1, `Executing call from main thread: ${data.function}(${args_string})`)
  
  let result = null, error = null
  
  try {
    result = await self[data.function](data.args)
  } catch(e) {
    // Send an error back to the main thread for error handling by the caller...
    // but the error object itself can't be sent across threads, so send a
    // new object (but PythonErrors, unlike regular Errors CAN be sent to the
    // main thread...at the cost of their type and constructor changing)
    error = {
      name: e.name,
      message: e.message,
    }
    // Info like line # is lost when sending back. So throw the error in this
    // thread as well, which has a better chance of showing debug info. Errors
    // reported from upython do not need to be thrown here because the host
    // environment doesn't have any extra information to report
    if(!(e instanceof PythonError)) throw e
  } finally {
    self.postMessage({
      function: data.function,
      result,
      error,
    })
  }
})

let init_args_resolve
const init_args_promise = new Promise((resolve, _reject) => {
  init_args_resolve = resolve
})

let init_return_resolve
const init_return_promise = new Promise((resolve, _reject) => {
  init_return_resolve = resolve
})

self.init = args => {
  delete self.init
  init_args_resolve(args)
  return init_return_promise
}

const init_args = await init_args_promise

/////////////////////////
// Virtual File System //
/////////////////////////

let stdout_buffer = '', stderr_buffer = ''

const VFS = {
  STDOUT: message => {
    stdout_buffer += message
    
    for(let i; i = stdout_buffer.indexOf('\n') + 1;) {
      self.postMessage({ event: 'stdout', line: stdout_buffer.slice(0, i) })
      stdout_buffer = stdout_buffer.slice(i)
    }
  },
  STDERR: message => {
    stderr_buffer += message
    
    for(let i; i = stderr_buffer.indexOf('\n') + 1;) {
      self.postMessage({ event: 'stderr', line: stderr_buffer.slice(0, i) })
      stderr_buffer = stderr_buffer.slice(i)
    }
  },
  '/paraforge': null,
  '/paraforge/__init__.py': new Uint8Array(init_args.paraforge_init_py),
}

class VirtualFD {
  constructor(path) {
    VirtualFD.instances.forEach((v, i) => {
      if(v === null) this.value = i
    })
    if(this.value === undefined) this.value = VirtualFD.instances.length
    
    this.path = path
    this.cursor = 0
    
    VirtualFD.instances[this.value] = this
  }
}
// STDIN etc. are just placeholders to make sure file descriptors 0-2 don't get
// used. The actual logic for them is handled as special cases in the relevant
// functions, and edge cases with creating or deleting a file of the same name
// aren't a concern because the VFS is read-only (for the wasm VM)
VirtualFD.instances = ['STDIN', 'STDOUT', 'STDERR']

self.add_file = args => {
  const { path, contents } = args
  VFS[path] = new Uint8Array(contents)
}

self.check_file_exists = args => {
  const { path } = args
  return path in VFS
}

/////////////////////////////
// Rust WebAssembly Module //
/////////////////////////////

const rust_instance = await WebAssembly.instantiate(init_args.rust_module)
rust_instance.exports.init()

const string_transport = (handle, string) => {
  const raw_bytes = new TextEncoder().encode(string).slice(0, 64)
  const fat_pointer = rust_instance.exports.string_transport(handle,
    raw_bytes.length)
  const pointer = Number(fat_pointer >> BigInt(32))
  
  const memory = new Uint8Array(rust_instance.exports.memory.buffer)
  for(let i = 0; i < raw_bytes.length; ++i) {
    memory[pointer + i] = raw_bytes[i]
  }
}

const py_rust_call = (name, ...args) => {
  log(2, `py_rust_call(name=${name}, args=${args})`)
  
  // The Rust exports return i64, but only the lower 48 bits are used so they
  // convert to JS numbers without loss
  return Number(rust_instance.exports[name](...args))
}

self.serialize = async () => {
  const fat_pointer =  rust_instance.exports.serialize()
  const offset = Number(fat_pointer >> BigInt(32))
  const size = Number(fat_pointer & BigInt(0xffffffff))
  log(3, `serialize() found model at offset=${offset}, size=${size}`)
  
  const memory = new Uint8Array(rust_instance.exports.memory.buffer)
  return memory.slice(offset, offset + size)
}

////////////////////////////////////
// MicroPython WebAssembly Module //
////////////////////////////////////

const proxy_js_ref = [{
    string_transport,
    py_rust_call,
  },
  string_transport,
  py_rust_call,
]

const lookup_attr = (js_handle, name_pointer, result_pointer) => {
  // js_handle is used by emscripten to designate which JS object to look up
  // attributes on. Since paraforge only permits lookups on one object, this
  // should always be zero
  if(js_handle !== 0) throw new TypeError('js_handle must be 0')
  
  const name = mp_read_utf8(name_pointer)
  
  // The name not existing is very common: upython tries to look up all sorts of
  // pythonic properties that don't exist here. upython expects to get false
  // back when they don't exist, that's what emscripten's JS wrappers do
  if(!(name in proxy_js_ref[0])) return false
  
  const result = proxy_js_ref[0][name]
  proxy_convert_js_to_mp(result, result_pointer);
  return true
}

const call = (function_handle, ...pointers) => {
  // The last pointer is for the return value
  const result_pointer = pointers.pop()
  
  // All other pointers are for argument values
  const translated_args = pointers.map(proxy_convert_mp_to_js)
  
  const ret = proxy_js_ref[function_handle](...translated_args)
  
  // Force handling py_rust_call() results as f64 because paraforge.wasm's
  // return types are all i64...but micropython.wasm only recognizes i32 at FFI
  // boundary. Luckily, micropython.wasm never needs to call .serialize() or
  // .string_transport() directly, which are the only functions that need the
  // full 64 bits. Most only use the upper 32 bit as a union tag to distinguish
  // between an error and whatever the function returns, so the 53 bits
  // available in the integer part of a double are enough
  if(proxy_js_ref[function_handle] === py_rust_call) {
    proxy_convert_js_to_mp(ret, result_pointer, PROXY_KIND_JS_DOUBLE)
  } else {
    proxy_convert_js_to_mp(ret, result_pointer)
  }
}

const calln = (function_handle, argument_count, arguments_pointer,
result_pointer) => {
  let args = []
  for(let i = 0; i < argument_count; ++i) {
    args.push(arguments_pointer + 12*i)
  }
  
  call(function_handle, ...args, result_pointer)
}

// invoke_* and dynCall_* are actually for internal use by the MicroPython
// .wasm. Because wasm doesn't have goto or exception support built-in,
// emscripten borrows them from the host environment by relaying the function
// calls involved through this external layer https://stackoverflow.com/questions/45511465/purpose-of-invoke-functions-generated-by-emscripten
//
// Update: After disabling emscripten's asyncify to reduce .wasm size (by 70%!)
// the dynCall_* exports disappeared, and are replaced by functions accessed
// through __indirect_function_table
const invoke = (index, ...args) => {
  var sp = mp_instance.exports.stackSave()
  try {
    return mp_instance.exports.__indirect_function_table.get(index)(...args)
  } catch(e) {
    mp_instance.exports.stackRestore(sp)
    if (e !== e+0) throw e
      mp_instance.exports.setThrew(1, 0)
  }
}

const get_value = (ptr, type) => {
  switch (type) {
    // 64-bit ints not supported, because upython was compiled with
    // emscripten's WASM_BIGINT flag not set. Additionally, upython offers no
    // FFI type for i64, so even if WASM_BIGINT is used actually moving them
    // across the FFI boundary requires using proxy objects
    case 'i32'   : return PYMEM_I32[ptr >> 2]
    case 'float' : return PYMEM_F32[ptr >> 2]
    case 'double': return PYMEM_F64[ptr >> 3]
    default: throw new TypeError(`invalid type for get_value: ${type}`)
  }
}

const set_value = (ptr, value, type) => {
  switch (type) {
    case 'i32'   : PYMEM_I32[ptr >> 2] = value; break
    case 'float' : PYMEM_F32[ptr >> 2] = value; break
    case 'double': PYMEM_F64[ptr >> 3] = value; break
    default: throw new TypeError(`invalid type for get_value: ${type}`)
  }
}

const mp_read_utf8 = (pointer, max_length) => {
  if(pointer === 0) return ''
  
  // Must use var and not let, due to javascript's bizarre scoping rules
  for(var length = 0; PYMEM_U8[pointer + length]; ++length) {
    // If max_length is undefined this does nothing, that mirros how
    // emscripten did this
    if(length >= max_length) break
  }
  
  return UTF8Decoder.decode(PYMEM_U8.subarray(pointer, pointer + length))
}

const mp_write_utf8 = (string, pointer, max_length) => {
  if(typeof max_length !== 'number' || max_length <= 0) return 0
  
  // -1 for string null terminator
  let view = PYMEM_U8.subarray(pointer, pointer + max_length - 1)
  
  let len = UTF8Encoder.encodeInto(string, view).written
  PYMEM_U8[pointer + len] = 0 // Null terminator
  return len + 1
}

const ___syscall_openat = (dirfd, path, flags, varargs) => {
  log(2, `___syscall_openat(dirfd=${dirfd}, path=${path}, flags=${flags}, ` +
    `varargs=${varargs})`)
  
  try {
    path = mp_read_utf8(path);
    if(path[0] !== '/') path = '/' + path
    log(3, `___syscall_openat path converted to "${path}"`)
    if(!(path in VFS)) return -1
    return new VirtualFD(path).value
  } catch (e) { return -1 }
}

const ___syscall_stat64 = (path, buf) => {
  log(2, `___syscall_stat64(path=${path}, buf=${buf})`)
  
  try {
    path = mp_read_utf8(path)
    if(path[0] !== '/') path = '/' + path
    log(3, `___syscall_stat64 path converted to "${path}"`)

    // Format is similar to stat struct from
    // https://www.man7.org/linux/man-pages/man3/stat.3type.html . However,
    // the inode # is moved to the end of the struct.
    //
    // Offset    Size    Name       Description
    // 0         4       dev        Idk what this is
    // 4         4       mode       Only field upython needs (see code)
    // 8         4       nlink      # of hard links
    // 12        4       UID
    // 16        4       GID
    // 20        4       rdev       Idk what this is
    // 24        8       size
    // 32        4       blksize    Block size
    // 36        4       blocks     Block count (but in 512 B blocks)
    // 40        16      atim       Time of last access
    // 56        16      mtim       Time of last modification
    // 72        16      ctime      Time of last status change
    // 88        8       ino        Inode #
    //
    // The 3 timestamp fields are each 16 bytes (2 64-bit timestamps, idk why
    // each timestamp field timestamps inside it)
    PYMEM_U32.fill(0, buf >> 2, (buf + 92) >> 2)
    
    // Mode. It's a bit field, some of it seems to be for file permissions
    // (but MicroPython ignores that part). MicroPython expects one bit to be
    // set though (no idea why). Which bit depends on whether path is a file
    // or folder
    const is_folder = VFS[path] === null
    PYMEM_U32[(buf + 4) >> 2] = path in VFS ? (is_folder ? 0x4000 : 0x8000) : 0
  } catch (e) { return -1 }
  
  return 0
}

const _fd_close = fd => {
  log(2, `_fd_close(fd=${fd})`)
  
  VirtualFD.instances[fd] = null
  return 0
}

const _fd_read = (fd, iov, iovcnt, pnum) => {
  log(2, `_fd_read(fd=${fd}, iov=${iov}, iovcnt=${iovcnt}, pnum=${pnum})`)
  
  if(iovcnt !== 1) throw TypeError(`_fd_read(): parameter iovcnt must be 1`)
  
  const output_pointer = PYMEM_U32[iov       >> 2]
  const output_length  = PYMEM_U32[(iov + 4) >> 2]
  const virtual_fd = VirtualFD.instances[fd]
  const virtual_file = VFS[virtual_fd.path]
  const bytes_to_read = Math.min(output_length,
    virtual_file.length - virtual_fd.cursor)
  
  PYMEM_U8.set(
    virtual_file.slice(virtual_fd.cursor, virtual_fd.cursor + bytes_to_read),
    output_pointer,
  )
  
  virtual_fd.cursor += bytes_to_read
  PYMEM_U32[pnum >> 2] = bytes_to_read
  return 0
}

const _fd_write = (fd, iov, iovcnt, pnum) => {
  log(2, `_fd_write(fd=${fd}, iov=${iov}, iovcnt=${iovcnt}, pnum=${pnum})`)
  
  if(fd !== 1 && fd !== 2) {
    throw TypeError(`_fd_write(): parameter fd must be 1 or 2 (writing is ' +
      'only supported for stdout and stderr)`)
  }
  if(iovcnt !== 1) throw TypeError(`_fd_write(): parameter iovcnt must be 1`)
  
  const input_pointer = PYMEM_U32[iov       >> 2]
  const input_length  = PYMEM_U32[(iov + 4) >> 2]
  const text = new TextDecoder().decode(PYMEM_U8.slice(input_pointer,
    input_pointer + input_length))
  
  if(fd === 1) VFS.STDOUT(text)
  if(fd === 2) VFS.STDERR(text)
  
  PYMEM_U32[((pnum)>>2)] = input_length
  return 0
}

export class ParaforgeError extends Error {}
export class NotImplementedError extends ParaforgeError {
  constructor(message) {
    super(message)
    this.name = 'NotImplementedError'
  }
}

const MP_JS_EPOCH = Date.now()

const NIE = NotImplementedError
const wasmImports = {
  // System call functions expected by emscripten. I only implement the ones
  // needed
  __syscall_chdir     : () => { throw new NIE('__syscall_chdir'     ) },
  __syscall_fstat64   : () => { throw new NIE('__syscall_fstat64'   ) },
  __syscall_getcwd    : () => { throw new NIE('__syscall_getcwd'    ) },
  __syscall_getdents64: () => { throw new NIE('__syscall_getdents64') },
  __syscall_lstat64   : () => { throw new NIE('__syscall_lstat64'   ) },
  __syscall_mkdirat   : () => { throw new NIE('__syscall_mkdirat'   ) },
  __syscall_newfstatat: () => { throw new NIE('__syscall_newfstatat') },
  __syscall_openat    : ___syscall_openat,
  __syscall_poll      : () => { throw new NIE('__syscall_poll'      ) },
  __syscall_renameat  : () => { throw new NIE('__syscall_renameat'  ) },
  __syscall_rmdir     : () => { throw new NIE('__syscall_rmdir'     ) },
  __syscall_stat64    : ___syscall_stat64,
  __syscall_statfs64  : () => { throw new NIE('__syscall_statfs64'  ) },
  __syscall_unlinkat  : () => { throw new NIE('__syscall_unlinkat'  ) },
  fd_close            : _fd_close,
  fd_read             : _fd_read,
  fd_write            : _fd_write,
  fd_seek             : () => { throw new NIE('fd_seek'             ) },
  fd_sync             : () => { throw new NIE('fd_sync'             ) },
  
  // Emulation of flow control / standard library functions not available in
  // wasm (some of these might be built-in in future wasm versions)
  emscripten_memcpy_js: (dest, src, num) => {
    PYMEM_U8.copyWithin(dest, src, src + num)
  },
  emscripten_scan_registers: () => {
    throw new NIE('emscripten_scan_registers')
  },
  emscripten_resize_heap   : () => { throw new NIE('emscripten_resize_heap') },
  _emscripten_throw_longjmp: () => { throw Infinity },
  invoke_i    : invoke,
  invoke_ii   : invoke,
  invoke_iii  : invoke,
  invoke_iiii : invoke,
  invoke_iiiii: invoke,
  invoke_v    : invoke,
  invoke_vi   : invoke,
  invoke_vii  : invoke,
  invoke_viii : invoke,
  invoke_viiii: invoke,
  mp_js_random_u32: () => crypto.getRandomValues(new Uint32Array(1))[0],
  mp_js_ticks_ms  : () => Date.now() - MP_JS_EPOCH,
  mp_js_time_ms   : () => Date.now(),
  
  // This is actually a full implementation of mp_js_hook: emscripten only uses
  // it for node and it's a no-op in browser
  mp_js_hook: () => null,
  
  // Python-JS bridge functions expected by emscripten. I only implement the
  // ones needed
  lookup_attr         : lookup_attr,
  has_attr            : () => { throw new NIE('has_attr'            ) },
  store_attr          : () => { throw new NIE('store_attr'          ) },
  call0               : call,
  call1               : call,
  call2               : call,
  calln               : calln,
  call0_kwarg         : () => { throw new NIE('call0_kwarg'         ) },
  call1_kwarg         : () => { throw new NIE('call1_kwarg'         ) },
  js_get_len          : () => { throw new NIE('js_get_len'          ) },
  js_reflect_construct: () => { throw new NIE('js_reflect_construct') },
  js_subscr_int       : () => { throw new NIE('js_subscr_int'       ) },
  js_subscr_load      : () => { throw new NIE('js_subscr_load'      ) },
  js_subscr_store     : () => { throw new NIE('js_subscr_store'     ) },
  js_then_continue    : () => { throw new NIE('js_then_continue'    ) },
  js_then_reject      : () => { throw new NIE('js_then_reject'      ) },
  js_then_resolve     : () => { throw new NIE('js_then_resolve'     ) },
  proxy_convert_mp_to_js_then_js_to_js_then_js_to_mp_obj_jsside: () => {
    throw new NIE('proxy_convert_mp_to_js_then_js_to_js_then_js_to_mp_obj_' +
      'jsside')
  },
  proxy_convert_mp_to_js_then_js_to_mp_obj_jsside: () => {
    throw new NIE('proxy_convert_mp_to_js_then_js_to_mp_obj_jsside')
  },
}

const UTF8Encoder = new TextEncoder('utf8')
const UTF8Decoder = new TextDecoder('utf8')

const mp_instance = await WebAssembly.instantiate(init_args.mp_module, {
  'env': wasmImports,
  'wasi_snapshot_preview1': wasmImports,
})

const mp_buffer = mp_instance.exports.memory.buffer
const PYMEM_U8  = new Uint8Array  (mp_buffer)
const PYMEM_I32 = new Int32Array  (mp_buffer)
const PYMEM_U32 = new Uint32Array (mp_buffer)
const PYMEM_F32 = new Float32Array(mp_buffer)
const PYMEM_F64 = new Float64Array(mp_buffer)

// 1 MB heap size used by upython's default build, seems good enough
const mp_heap_size = 1024*1024

mp_instance.exports.__wasm_call_ctors()
mp_instance.exports.mp_js_init(mp_heap_size)
mp_instance.exports.proxy_c_init()

self.python = async args => {
  const { code } = args
  
  const mystery_pointer = mp_instance.exports.malloc(3 * 4)
  const stack = mp_instance.exports.stackSave()
  
  try {
    const utf8 = UTF8Encoder.encode(code + '\0')
    const string_pointer = mp_instance.exports.stackAlloc(utf8.length)
    PYMEM_U8.set(utf8, string_pointer)
    
    mp_instance.exports.mp_js_do_exec(string_pointer, mystery_pointer)
  } finally {
    mp_instance.exports.stackRestore(stack)
  }
  
  try {
    return proxy_convert_mp_to_js(mystery_pointer)
  } finally {
    mp_instance.exports.free(mystery_pointer)
  }
}

self.execute = args => {
  const { script_name, generator, python_args, python_kwargs } = args
  
  const passthrough = python_args
  Object.keys(python_kwargs).forEach(key => {
    passthrough.push(`${key}=${python_kwargs[key]}`)
  })
  
  // Trying to escape the module name is just too complicated, so write it in a
  // file and then have the uPython side read it
  VFS['/paraforge/string_transfer'] = UTF8Encoder.encode(script_name)
  
  return python({ code: `
    with open('/paraforge/string_transfer') as f:
        module = __import__(f.read())
    module.gen_${generator}(${passthrough.join(', ')})
  ` })
}

// These constants should match the constants in upython's proxy_c.c.

const PROXY_KIND_MP_EXCEPTION = -1
const PROXY_KIND_MP_NULL      = 0
const PROXY_KIND_MP_NONE      = 1
const PROXY_KIND_MP_BOOL      = 2
const PROXY_KIND_MP_INT       = 3
const PROXY_KIND_MP_FLOAT     = 4
const PROXY_KIND_MP_STR       = 5
const PROXY_KIND_MP_CALLABLE  = 6
const PROXY_KIND_MP_GENERATOR = 7
const PROXY_KIND_MP_OBJECT    = 8
const PROXY_KIND_MP_JSPROXY   = 9

const PROXY_KIND_JS_UNDEFINED = 0
const PROXY_KIND_JS_NULL      = 1
const PROXY_KIND_JS_BOOLEAN   = 2
const PROXY_KIND_JS_INTEGER   = 3
const PROXY_KIND_JS_DOUBLE    = 4
const PROXY_KIND_JS_STRING    = 5
const PROXY_KIND_JS_OBJECT    = 6

class PythonError extends Error {
  constructor(type, message) {
    super(message)
    this.name = 'PythonError'
    
    // I don't currently use the type, but upython sends it, and I might use it
    // later
    this.type = type
  }
}

const proxy_detect_kind = js => {
  // upython interprets PROXY_KIND_JS_UNDEFINED as being the root JS object. I
  // have no idea why. PROXY_KIND_JS_NULL is interpreted as None, so use that
  // instead
  switch(typeof js) {
    case 'undefined': return PROXY_KIND_JS_NULL
    case 'null'     : return PROXY_KIND_JS_NULL
    case 'boolean'  : return PROXY_KIND_JS_BOOLEAN
    case 'number'   : return Number.isInteger(js)
                           ? PROXY_KIND_JS_INTEGER
                           : PROXY_KIND_JS_DOUBLE
    case 'string'   : return PROXY_KIND_JS_STRING
    default         : return PROXY_KIND_JS_OBJECT
  }
}

const proxy_convert_js_to_mp = (js, pointer, proxy_kind) => {
  proxy_kind = proxy_kind ?? proxy_detect_kind(js)
  
  switch(proxy_kind) {
    case PROXY_KIND_JS_BOOLEAN:
      set_value(pointer + 4, js, 'i32')
      break
    
    case PROXY_KIND_JS_INTEGER:
      set_value(pointer + 4, js, 'i32')
      break
    
    case PROXY_KIND_JS_DOUBLE:
      // f64 must be stored to an address that's a multiple of 8
      const temp = (pointer + 4) & ~7
      set_value(temp, js, 'double')
      const double_lo = get_value(temp, 'i32')
      const double_hi = get_value(temp + 4, 'i32')
      set_value(pointer + 4, double_lo, 'i32')
      set_value(pointer + 8, double_hi, 'i32')
      break
    
    case PROXY_KIND_JS_STRING:
      const length = UTF8Encoder.encode(js).length
      const buffer = mp_instance.exports.malloc(length + 1)
      mp_write_utf8(js, buffer, length + 1)
      set_value(pointer + 4, length, 'i32')
      set_value(pointer + 8, buffer, 'i32')
      break
    
    case PROXY_KIND_JS_OBJECT:
      const handle = proxy_js_ref.indexOf(js)
      if(handle === -1) throw new Error('Only objects in proxy_js_ref may be passed to MicroPython')
      set_value(pointer + 4, handle, 'i32')
      break
  }
  
  // proxy_kind is written last, because if it written earlier it can be
  // overwritten by the byte shuffling for writing f64s
  set_value(pointer, proxy_kind, 'i32')
}

const proxy_convert_mp_to_js = pointer => {
  const proxy_kind = get_value(pointer, 'i32')
  
  switch(proxy_kind) {
    case PROXY_KIND_MP_NONE:
      return null
    
    case PROXY_KIND_MP_INT:
      return get_value(pointer + 4, 'i32')
    
    case PROXY_KIND_MP_FLOAT:
      // f64 must be loaded from an address that's a multiple of 8. This is
      // straight from emscripten's wrappers, so I assume the occasional
      // overwrite of the PROXY_KIND value is okay
      const temp = (pointer + 4) & ~7
      const double_lo = get_value(pointer + 4, 'i32')
      const double_hi = get_value(pointer + 8, 'i32')
      set_value(temp, double_lo, 'i32')
      set_value(temp + 4, double_hi, 'i32')
      return get_value(temp, 'double')
    
    case PROXY_KIND_MP_STR:
      var length  = get_value(pointer + 4, 'i32')
      var pointer = get_value(pointer + 8, 'i32')
      return mp_read_utf8(pointer, length)
    
    case PROXY_KIND_MP_EXCEPTION:
      var length  = get_value(pointer + 4, 'i32')
      var pointer = get_value(pointer + 8, 'i32')
      const string = mp_read_utf8(pointer, length)
      
      // Not sure why this one is freed when the others aren't, but it's in the
      // original emscaripten wrappers. Maybe the exception is assumed to be
      // consumed by the host, so upython doesn't grabage collect it?
      mp_instance.exports.free(pointer)
      
      throw new PythonError(...string.split('\x04'))
    
    default:
      throw new Error('Unsupported type returned from MicroPython ' +
        `(PROXY_KIND value = ${proxy_kind})`)
  }
}

init_return_resolve(null)
