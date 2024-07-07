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

self.addEventListener('message', async e => {
  const args_string = Object.keys(e.data.args).map(
    key => `${key}=${e.data.args[key]}`
  ).join(', ')
  log(1, `Executing call from main thread: ${e.data.function}(${args_string})`)
  
  const result = await self[e.data.function](e.data.args)
  
  self.postMessage({
    function: e.data.function,
    result,
    error_code: 0,
  })
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
  '/paraforge/__init__.py': init_args.paraforge_init_py,
  [`/${init_args.script_name}.py`]: new Uint8Array(init_args.script_contents),
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
}]

const lookup_attr = (js_handle, name_pointer, result_pointer) => {
  // js_handle is used by emscripten to designate which JS object to look up
  // attributes on. Since paraforge only permits lookups on one object, this
  // should always be zero
  if(js_handle !== 0) throw new TypeError('js_handle must be 0')
  
  const name = UTF8ToString(name_pointer)
  
  // The name not existing is very common: upython tries to look up all sorts of
  // pythonic properties that don't exist here. upython expects to get false
  // back when they don't exist, that's what emscripten's JS wrappers do
  if(!(name in proxy_js_ref[0])) return false
  
  const result = proxy_js_ref[0][name]
  proxy_convert_js_to_mp_obj_jsside(result, result_pointer);
  return true
}

const call = (function_handle, ...pointers) => {
  // The last pointer is for the return value
  const result_pointer = pointers.pop()
  
  // All other pointers are for argument values
  const translated_args = pointers.map(proxy_convert_mp_to_js_obj_jsside)
  
  const ret = proxy_js_ref[function_handle](...translated_args)
  
  // Use force_float option because paraforge.wasm's return types are all
  // i64...but micropython.wasm only recognizes i32 at FFI boundary. Luckily,
  // micropython.wasm never needs to call .serialize() or .string_transport()
  // directly, which are the only functions that need the full 64 bits. Most
  // only use the upper 32 bit as a union tag to distinguish between an error
  // and whatever the function returns, so the 53 bits available in the integer
  // part of a double are enough
  const force_float = proxy_js_ref[function_handle] === py_rust_call
  
  proxy_convert_js_to_mp_obj_jsside(ret, result_pointer, force_float);
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
  var sp = upython_instance.exports.stackSave()
  try {
    return upython_instance.exports.__indirect_function_table.get(index)(...args)
  } catch(e) {
    upython_instance.exports.stackRestore(sp)
    if (e !== e+0) throw e
      upython_instance.exports.setThrew(1, 0)
  }
}

const getValue = (ptr, type) => {
  switch (type) {
    // 64-bit ints not supported, because upython was compiled with
    // emscripten's WASM_BIGINT flag not set. Additionally, upython offers no
    // FFI type for i64, so even if WASM_BIGINT is used actually moving them
    // across the FFI boundary requires using proxy objects
    case 'i32'   : return PYMEM_I32[ptr >> 2]
    case 'float' : return PYMEM_F32[ptr >> 2]
    case 'double': return PYMEM_F64[ptr >> 3]
    default: throw new TypeError(`invalid type for getValue: ${type}`)
  }
}

const setValue = (ptr, value, type) => {
  switch (type) {
    case 'i32'   : PYMEM_I32[ptr >> 2] = value; break
    case 'float' : PYMEM_F32[ptr >> 2] = value; break
    case 'double': PYMEM_F64[ptr >> 3] = value; break
    default: throw new TypeError(`invalid type for getValue: ${type}`)
  }
}

const UTF8ToString = (pointer, max_length) => {
  if(pointer === 0) return ''
  
  // Must use var and not let, due to javascript's bizarre scoping rules
  for(var length = 0; PYMEM_U8[pointer + length]; ++length) {
    // If max_length is undefined this does nothing, that mirros how
    // emscripten did this
    if(length >= max_length) break
  }
  
  return UTF8Decoder.decode(PYMEM_U8.subarray(pointer, pointer + length))
}

const stringToUTF8 = (string, pointer, max_length) => {
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
    path = UTF8ToString(path);
    if(path[0] !== '/') path = '/' + path
    log(3, `___syscall_openat path converted to "${path}"`)
    if(!(path in VFS)) return -1
    return new VirtualFD(path).value
  } catch (e) { return -1 }
}

const ___syscall_stat64 = (path, buf) => {
  log(2, `___syscall_stat64(path=${path}, buf=${buf})`)
  
  try {
    path = UTF8ToString(path)
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

const upython_instance = await WebAssembly.instantiate(init_args.upython_module, {
  'env': wasmImports,
  'wasi_snapshot_preview1': wasmImports,
})

const upython_buffer = upython_instance.exports.memory.buffer
const PYMEM_U8  = new Uint8Array  (upython_buffer)
const PYMEM_I32 = new Int32Array  (upython_buffer)
const PYMEM_U32 = new Uint32Array (upython_buffer)
const PYMEM_F32 = new Float32Array(upython_buffer)
const PYMEM_F64 = new Float64Array(upython_buffer)

// 1 MB heap size used by upython's default build, seems good enough
const upython_heap_size = 1024*1024

upython_instance.exports.__wasm_call_ctors()
upython_instance.exports.mp_js_init(upython_heap_size)
upython_instance.exports.proxy_c_init()

self.python = async args => {
  const { code } = args
  
  const mystery_pointer = upython_instance.exports.malloc(3 * 4)
  const stack = upython_instance.exports.stackSave()
  
  try {
    const utf8 = UTF8Encoder.encode(code + '\0')
    const string_pointer = upython_instance.exports.stackAlloc(utf8.length)
    PYMEM_U8.set(utf8, string_pointer)
    
    upython_instance.exports.mp_js_do_exec(string_pointer, mystery_pointer)
  } finally {
    upython_instance.exports.stackRestore(stack)
  }
  
  try {
    return proxy_convert_mp_to_js_obj_jsside(mystery_pointer)
  } finally {
    upython_instance.exports.free(mystery_pointer)
  }
}

self.gen = args => {
  const { script_name, generator, python_args, python_kwargs } = args
  
  const passthrough = python_args
  Object.keys(python_kwargs).forEach(key => {
    passthrough.push(`${key}=${python_kwargs[key]}`)
  })
  
  python({ code: `
    import ${script_name}
    ${script_name}.gen_${generator}(${passthrough.join(', ')})
  ` })
}

// These constants should match the constants in proxy_c.c.

const PROXY_KIND_MP_EXCEPTION = -1;
const PROXY_KIND_MP_NULL = 0;
const PROXY_KIND_MP_NONE = 1;
const PROXY_KIND_MP_BOOL = 2;
const PROXY_KIND_MP_INT = 3;
const PROXY_KIND_MP_FLOAT = 4;
const PROXY_KIND_MP_STR = 5;
const PROXY_KIND_MP_CALLABLE = 6;
const PROXY_KIND_MP_GENERATOR = 7;
const PROXY_KIND_MP_OBJECT = 8;
const PROXY_KIND_MP_JSPROXY = 9;

const PROXY_KIND_JS_UNDEFINED = 0;
const PROXY_KIND_JS_NULL = 1;
const PROXY_KIND_JS_BOOLEAN = 2;
const PROXY_KIND_JS_INTEGER = 3;
const PROXY_KIND_JS_DOUBLE = 4;
const PROXY_KIND_JS_STRING = 5;
const PROXY_KIND_JS_OBJECT = 6;

class PythonError extends Error {
    constructor(exc_type, exc_details) {
        super(exc_details);
        this.name = "PythonError";
        this.type = exc_type;
    }
}

function proxy_convert_js_to_mp_obj_jsside(js_obj, out, force_float=false) {
  //console.log(`proxy_convert_js_to_mp_obj_jsside(js_obj=${js_obj}, out=${out})`)
    let kind;
    if (js_obj === undefined) {
      // upython interprets PROXY_KIND_JS_UNDEFINED as being the root JS object.
      // I have no idea why. PROXY_KIND_JS_NULL is interpreted as None, so use
      // that instead
      kind = PROXY_KIND_JS_NULL;
    } else if (js_obj === null) {
        kind = PROXY_KIND_JS_NULL;
    } else if (typeof js_obj === "number") {
        if (Number.isInteger(js_obj) && force_float == false) {
            kind = PROXY_KIND_JS_INTEGER;
            setValue(out + 4, js_obj, "i32");
        } else {
            kind = PROXY_KIND_JS_DOUBLE;
            // double must be stored to an address that's a multiple of 8
            const temp = (out + 4) & ~7;
            setValue(temp, js_obj, "double");
            const double_lo = getValue(temp, "i32");
            const double_hi = getValue(temp + 4, "i32");
            setValue(out + 4, double_lo, "i32");
            setValue(out + 8, double_hi, "i32");
        }
    } else if (typeof js_obj === "string") {
        kind = PROXY_KIND_JS_STRING;
        const len = new TextEncoder().encode(js_obj).length
        const buf = upython_instance.exports.malloc(len + 1);
        stringToUTF8(js_obj, buf, len + 1);
        setValue(out + 4, len, "i32");
        setValue(out + 8, buf, "i32");
    } else {
        kind = PROXY_KIND_JS_OBJECT;
        const id = proxy_js_ref.length;
        proxy_js_ref[id] = js_obj;
        setValue(out + 4, id, "i32");
    }
    setValue(out + 0, kind, "i32");
}

function proxy_convert_mp_to_js_obj_jsside(value) {
    const kind = getValue(value, "i32");
    let obj;
    if (kind === PROXY_KIND_MP_EXCEPTION) {
        // Exception
        const str_len = getValue(value + 4, "i32");
        const str_ptr = getValue(value + 8, "i32");
        const str = UTF8ToString(str_ptr, str_len);
        upython_instance.exports.free(str_ptr);
        const str_split = str.split("\x04");
        throw new PythonError(str_split[0], str_split[1]);
    }
    if (kind === PROXY_KIND_MP_NULL) {
        // MP_OBJ_NULL
        throw new Error("NULL object");
    }
    if (kind === PROXY_KIND_MP_NONE) {
        // None
        obj = null;
    } else if (kind === PROXY_KIND_MP_INT) {
        // int
        obj = getValue(value + 4, "i32");
    } else if (kind === PROXY_KIND_MP_FLOAT) {
        // float
        // double must be loaded from an address that's a multiple of 8
        const temp = (value + 4) & ~7;
        const double_lo = getValue(value + 4, "i32");
        const double_hi = getValue(value + 8, "i32");
        setValue(temp, double_lo, "i32");
        setValue(temp + 4, double_hi, "i32");
        obj = getValue(temp, "double");
    } else if (kind === PROXY_KIND_MP_STR) {
        // str
        const str_len = getValue(value + 4, "i32");
        const str_ptr = getValue(value + 8, "i32");
        obj = UTF8ToString(str_ptr, str_len);
    }
    //alert(`proxy_convert_mp_to_js_obj_jsside(value=${value}) -> ${obj}`)
    return obj;
}

init_return_resolve(null)
