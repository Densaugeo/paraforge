const rust_module_promise = (async () => {
  const response = await fetch('../paraforge/paraforge.wasm',
    { cache: 'no-store' })
  return await WebAssembly.compileStreaming(response)
})()

const upython_module_promise = (async () => {
  const response = await fetch('micropython.wasm',
    { cache: 'no-store' })
  return await WebAssembly.compileStreaming(response)
})()

const worker_file_promise = (async () => {
  const response = await fetch('paraforge-worker.js', { cache: 'no-store' })
  // The worker response must be converted into text before being converted into
  // a file object, otherwise browser console will not provide error information
  // for error that occur inside the worker thread
  const text = await response.text()
  return URL.createObjectURL(new File([text], 'paraforge-worker.js'))
})()

const paraforge_init_py_promise = (async () => {
  const response = await fetch('../paraforge/__init__.py', { cache: 'reload' })
  const array_buffer = await response.arrayBuffer()
  return new Uint8Array(array_buffer)
})()

const [
  rust_module,
  upython_module,
  worker_file,
  paraforge_init_py,
] = await Promise.all([
  rust_module_promise,
  upython_module_promise,
  worker_file_promise,
  paraforge_init_py_promise,
])

export class Paraforge {
  constructor() {
    this.worker = new Worker(worker_file, { type: 'module' })
    
    this.worker.onerror = e => {
      console.log('An error happened in a worker. Good luck getting any ' +
        'debugging info.')
      throw e
    }
    
    this.worker.onmessage = message => {
      console.log(message.data)
    }
    
    this.worker.postMessage({
      type: 'init',
      rust_module,
    })
  }
  
  gen() {
    this.worker.postMessage(['helloooooo'])
  }
}

export const event_emitter = new EventTarget()

/////////////////////////
// Virtual File System //
/////////////////////////

class ParaforgeEvent extends Event {}

class StdoutEvent extends ParaforgeEvent {
  constructor(line) {
    super('stdout')
    this.line = line
  }
}

class StderrEvent extends ParaforgeEvent {
  constructor(line) {
    super('stderr')
    this.line = line
  }
}

export let VFS = {
  STDOUT: line => event_emitter.dispatchEvent(new StdoutEvent(line)),
  STDERR: line => event_emitter.dispatchEvent(new StderrEvent(line)),
  '/paraforge': null,
  '/paraforge/__init__.py': paraforge_init_py,
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






function test_function(foo) {
  //throw new Error('asdf')
  return foo*2
}
function test_string_function(string) {
  return string + ' functionized'
}

function string_transport(handle, string) {
  const raw_bytes = new TextEncoder().encode(string).slice(0, 64)
  const fat_pointer = Module.rust_instance.exports.string_transport(handle,
    raw_bytes.length)
  const pointer = Number(fat_pointer >> BigInt(32))
  
  const memory = new Uint8Array(Module.rust_instance.exports.memory.buffer)
  for(let i = 0; i < raw_bytes.length; ++i) {
    memory[pointer + i] = raw_bytes[i]
  }
}

function serialize() {
  const fat_pointer =  Module.rust_instance.exports.serialize()
  const offset = Number(fat_pointer >> BigInt(32))
  const size = Number(fat_pointer & BigInt(0xffffffff))
  console.log(`offset=${offset}, size=${size}`)
  
  const memory = new Uint8Array(Module.rust_instance.exports.memory.buffer)
  return memory.slice(offset, offset + size)
}
window.serialize = serialize

function py_rust_call(name, ...args) {
  return Number(Module.rust_instance.exports[name](...args))
}

let proxy_js_ref = [{
  // Test functions
  test_function, test_string_function,
  
  // Real functions
  string_transport,
  py_rust_call,
}]

var _createMicroPythonModule = async function() {

var Module = {};


function lookup_attr(js_handle, name_pointer, result_pointer) {
  // js_handle is used by emscripten to designate which JS object to look up
  // attributes on. Since paraforge only permits lookups on one object, this
  // should always be zero
  if(js_handle !== 0) throw new TypeError('js_handle must be 0')
  
  const name = UTF8ToString(name_pointer)
  
  //console.log(`lookup_attr(name=${name})`)
  
  // The name not existing is very common: upython tries to look up all sorts of
  // pythonic properties that don't exist here. upython expects to get false
  // back when they don't exist, that's what emscripten's JS wrappers do
  if(!(name in proxy_js_ref[0])) return false
  
  const result = proxy_js_ref[0][name]
  proxy_convert_js_to_mp_obj_jsside(result, result_pointer);
  return true
}

function call(function_handle, ...pointers) {
  // The last pointer is for the return value
  const result_pointer = pointers.pop()
  
  // All other pointers are for argument values
  const translated_args = pointers.map(proxy_convert_mp_to_js_obj_jsside)
  
  const ret = proxy_js_ref[function_handle](...translated_args);
  
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

function calln(function_handle, argument_count, arguments_pointer,
result_pointer) {
  let args = []
  for(let i = 0; i < argument_count; ++i) {
    args.push(arguments_pointer + 12*i)
  }
  
  call(function_handle, ...args, result_pointer)
}


    /**
     * @param {number} ptr
     * @param {string} type
     */
  function getValue(ptr, type) {
    switch (type) {
      case 'i32': return HEAP32[((ptr)>>2)];
      // 64-bit ints not supported, because upython was compiled with
      // emscripten's WASM_BIGINT flag not set. Additionally, upython offers no
      // FFI type for i64, so even if WASM_BIGINT is used actually moving them
      // across the FFI boundary requires using proxy objects
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: throw new TypeError(`invalid type for getValue: ${type}`)
    }
  }

  
    /**
     * @param {number} ptr
     * @param {number} value
     * @param {string} type
     */
  function setValue(ptr, value, type) {
    switch (type) {
      case 'i32': HEAP32[((ptr)>>2)] = value; break;
      case 'float': HEAPF32[((ptr)>>2)] = value; break;
      case 'double': HEAPF64[((ptr)>>3)] = value; break;
      default: throw new TypeError(`invalid type for getValue: ${type}`)
    }
  }

  
  
  function UTF8ToString(pointer, max_length) {
    if(pointer === 0) return ''
    
    // Must use var and not let, due to javascript's bizarre scoping rules
    for(var length = 0; HEAPU8[pointer + length]; ++length) {
      // If max_length is undefined this does nothing, that mirros how
      // emscripten did this
      if(length >= max_length) break
    }
    
    return Module.UTF8Decoder.decode(HEAPU8.subarray(pointer, pointer + length))
  }
  
  
  
  function stringToUTF8(string, pointer, max_length) {
    if(typeof max_length !== 'number' || max_length <= 0) return 0
    
    // -1 for string null terminator
    let view = HEAPU8.subarray(pointer, pointer + max_length - 1)
    
    let len = Module.UTF8Encoder.encodeInto(string, view).written
    HEAPU8[pointer + len] = 0 // Null terminator
    return len + 1
  }
  
  
  
  function ___syscall_openat(dirfd, path, flags, varargs) {
    console.log(`___syscall_openat(dirfd=${dirfd}, path=${path}, flags=${flags}, varargs=${varargs})`)
    try {
      path = UTF8ToString(path);
      if(path[0] !== '/') path = '/' + path
      console.log(`___syscall_openat path converted to "${path}"`)
      if(!(path in VFS)) return -1
      return new VirtualFD(path).value
    } catch (e) { return -1 }
  }

  function ___syscall_stat64(path, buf) {
    console.log(`___syscall_stat64(path=${path}, buf=${buf})`)
    try {
      path = UTF8ToString(path)
      if(path[0] !== '/') path = '/' + path
      console.log(`___syscall_stat64 path converted to "${path}"`)

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
      HEAPU32.fill(0, buf >> 2, (buf + 92) >> 2)
      
      // Mode. It's a bit field, some of it seems to be for file permissions
      // (but MicroPython ignores that part). MicroPython expects one bit to be
      // set though (no idea why). Which bit depends on whether path is a file
      // or folder
      const is_folder = VFS[path] === null
      HEAPU32[(buf + 4) >> 2] = path in VFS ? (is_folder ? 0x4000 : 0x8000) : 0
    } catch (e) { return -1 }
    
    return 0
  }

  function _fd_close(fd) {
    console.log(`_fd_close(fd=${fd})`)
    try {
      VirtualFD.instances[fd] = null
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }

  function _fd_read(fd, iov, iovcnt, pnum) {
    console.log(`_fd_read(fd=${fd}, iov=${iov}, iovcnt=${iovcnt}, pnum=${pnum})`)
    if(iovcnt !== 1) throw TypeError(`_fd_read(): parameter iovcnt must be 1`)
    
    var ptr = HEAPU32[((iov)>>2)];
    var len = HEAPU32[(((iov)+(4))>>2)];
    let virtual_fd = VirtualFD.instances[fd]
    let virtual_file = VFS[virtual_fd.path]
    let bytes_to_read = Math.min(len, virtual_file.length - virtual_fd.cursor)
    for(let i = 0; i < bytes_to_read; ++i) {
      HEAPU8[ptr + i] = virtual_file[virtual_fd.cursor + i]
    }
    virtual_fd.cursor += bytes_to_read
    HEAPU32[((pnum)>>2)] = bytes_to_read
    //console.log(`Read ${bytes_to_read} bytes: ${HEAPU8.slice(ptr, ptr + bytes_to_read)}`)
    
    return 0
  }

  
  function _fd_write(fd, iov, iovcnt, pnum) {
    console.log(`_fd_write(fd=${fd}, iov=${iov}, iovcnt=${iovcnt}, pnum=${pnum})`)
    if(fd !== 1 && fd !== 2) {
      throw TypeError(`_fd_write(): parameter fd must be 1 or 2 (writing is ' +
        'only supported for stdout and stderr)`)
    }
    if(iovcnt !== 1) throw TypeError(`_fd_write(): parameter iovcnt must be 1`)
    
    var ptr = HEAPU32[((iov)>>2)];
    var len = HEAPU32[(((iov)+(4))>>2)];
    let text = new TextDecoder().decode(HEAPU8.slice(ptr, ptr + len))
    if(fd === 1) VFS.STDOUT(text)
    if(fd === 2) VFS.STDERR(text)
    HEAPU32[((pnum)>>2)] = len
    
    return 0
  }

class NotImplementedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NotImplementedError'
  }
}
const NIE = NotImplementedError

var MP_JS_EPOCH = Date.now();

var wasmImports = {
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
    HEAPU8.copyWithin(dest, src, src + num)
  },
  emscripten_scan_registers: () => {
    throw new NIE('emscripten_scan_registers')
  },
  emscripten_resize_heap: () => { throw new NIE('emscripten_resize_heap') },
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
  mp_js_ticks_ms: () => Date.now() - MP_JS_EPOCH,
  mp_js_time_ms: () => Date.now(),
  
  // This is actually a full implementation of mp_js_hook: emscripten only uses
  // it for node and it's a no-op in browser
  mp_js_hook: () => null,
  
  // Below is the Python-JS bridge stuff, still needs organizing
  
  call0: call,
  call0_kwarg: () => { throw new NIE('call0_kwarg') },
  call1: call,
  call1_kwarg: () => { throw new NIE('call1_kwarg') },
  call2: call,
  calln: calln,
  has_attr: () => { throw new NIE('has_attr') },
  
  js_get_len: () => { throw new NIE('js_get_len') },
  js_reflect_construct: () => { throw new NIE('js_reflect_construct') },
  js_subscr_int: () => { throw new NIE('js_subscr_int') },
  js_subscr_load: () => { throw new NIE('js_subscr_load') },
  js_subscr_store: () => { throw new NIE('js_subscr_store') },
  js_then_continue: () => { throw new NIE('js_then_continue') },
  js_then_reject: () => { throw new NIE('js_then_reject') },
  js_then_resolve: () => { throw new NIE('js_then_resolve') },
  lookup_attr: lookup_attr,
  
  proxy_convert_mp_to_js_then_js_to_js_then_js_to_mp_obj_jsside: () => { throw new NIE('proxy_convert_mp_to_js_then_js_to_js_then_js_to_mp_obj_jsside') },
  proxy_convert_mp_to_js_then_js_to_mp_obj_jsside: () => { throw new NIE('proxy_convert_mp_to_js_then_js_to_mp_obj_jsside') },
  store_attr: () => { throw new NIE('store_attr') },
};

// invoke_* and dynCall_* are actually for internal use by the MicroPython
// .wasm. Because wasm doesn't have goto or exception support built-in,
// emscripten borrows them from the host environment by relaying the function
// calls involved through this external layer https://stackoverflow.com/questions/45511465/purpose-of-invoke-functions-generated-by-emscripten
//
// Update: After disabling emscripten's asyncify to reduce .wasm size (by 70%!)
// the dynCall_* exports disappeared, and are replaced by functions accessed
// through __indirect_function_table
function invoke(index, ...args) {
  var sp = Module.instance.exports.stackSave()
  try {
    return Module.instance.exports.__indirect_function_table.get(index)(...args)
  } catch(e) {
    Module.instance.exports.stackRestore(sp)
    if (e !== e+0) throw e
    Module.instance.exports.setThrew(1, 0)
  }
}

const rust_instance = await WebAssembly.instantiate(rust_module)

const upython_instance = await WebAssembly.instantiate(upython_module, {
  'env': wasmImports,
  'wasi_snapshot_preview1': wasmImports,
})

Module.module = upython_module
Module.instance = upython_instance
Module.UTF8Encoder = new TextEncoder('utf8')
Module.UTF8Decoder = new TextDecoder('utf8')

Module.setValue = setValue;
Module.getValue = getValue;
Module.UTF8ToString = UTF8ToString;
Module.stringToUTF8 = stringToUTF8;

const buffer = Module.instance.exports.memory.buffer
const HEAPU8  = Module.HEAPU8  = new Uint8Array  (buffer)
const HEAP32  = Module.HEAP32  = new Int32Array  (buffer)
const HEAPU32 = Module.HEAPU32 = new Uint32Array (buffer)
const HEAPF32 = Module.HEAPF32 = new Float32Array(buffer)
const HEAPF64 = Module.HEAPF64 = new Float64Array(buffer)

Module.instance.exports.__wasm_call_ctors()




// Got two WebAssembly modules with isntances now...time to try running a
// paraforge PoC!
rust_instance.exports.init()
Module.rust_instance = rust_instance



return Module
}

export async function loadMicroPython() {
    const heapsize = 1024*1024
    
    const Module = await _createMicroPythonModule();
    globalThis.Module = Module;
    Module.instance.exports.mp_js_init(heapsize)
    Module.instance.exports.proxy_c_init()
    return {
        runPython(code) {
            const mystery_pointer = Module.instance.exports.malloc(3 * 4);
            const stack = Module.instance.exports.stackSave();
            
            try {
              const utf8 = Module.UTF8Encoder.encode(code + '\0')
              const string_pointer = 
                Module.instance.exports.stackAlloc(utf8.length);
              Module.HEAPU8.set(utf8, string_pointer)
              
              Module.instance.exports.mp_js_do_exec(string_pointer, mystery_pointer);
            } finally {
              Module.instance.exports.stackRestore(stack)
            }
            
            return proxy_convert_mp_to_js_obj_jsside_with_free(mystery_pointer);
        },
        gen(args_) {
          const { script_name, script_contents, generator, args } = args_
          
          VFS[`/${script_name}.py`] = new Uint8Array(script_contents)
          
          return this.runPython(`
            import ${script_name}
            ${script_name}.gen_${generator}(${args})
          `)
        },
    };
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
            Module.setValue(out + 4, js_obj, "i32");
        } else {
            kind = PROXY_KIND_JS_DOUBLE;
            // double must be stored to an address that's a multiple of 8
            const temp = (out + 4) & ~7;
            Module.setValue(temp, js_obj, "double");
            const double_lo = Module.getValue(temp, "i32");
            const double_hi = Module.getValue(temp + 4, "i32");
            Module.setValue(out + 4, double_lo, "i32");
            Module.setValue(out + 8, double_hi, "i32");
        }
    } else if (typeof js_obj === "string") {
        kind = PROXY_KIND_JS_STRING;
        const len = new TextEncoder().encode(js_obj).length
        const buf = Module.instance.exports.malloc(len + 1);
        Module.stringToUTF8(js_obj, buf, len + 1);
        Module.setValue(out + 4, len, "i32");
        Module.setValue(out + 8, buf, "i32");
    } else {
        kind = PROXY_KIND_JS_OBJECT;
        const id = proxy_js_ref.length;
        proxy_js_ref[id] = js_obj;
        Module.setValue(out + 4, id, "i32");
    }
    Module.setValue(out + 0, kind, "i32");
}

function proxy_convert_mp_to_js_obj_jsside(value) {
    const kind = Module.getValue(value, "i32");
    let obj;
    if (kind === PROXY_KIND_MP_EXCEPTION) {
        // Exception
        const str_len = Module.getValue(value + 4, "i32");
        const str_ptr = Module.getValue(value + 8, "i32");
        const str = Module.UTF8ToString(str_ptr, str_len);
        Module.instance.exports.free(str_ptr);
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
        obj = Module.getValue(value + 4, "i32");
    } else if (kind === PROXY_KIND_MP_FLOAT) {
        // float
        // double must be loaded from an address that's a multiple of 8
        const temp = (value + 4) & ~7;
        const double_lo = Module.getValue(value + 4, "i32");
        const double_hi = Module.getValue(value + 8, "i32");
        Module.setValue(temp, double_lo, "i32");
        Module.setValue(temp + 4, double_hi, "i32");
        obj = Module.getValue(temp, "double");
    } else if (kind === PROXY_KIND_MP_STR) {
        // str
        const str_len = Module.getValue(value + 4, "i32");
        const str_ptr = Module.getValue(value + 8, "i32");
        obj = Module.UTF8ToString(str_ptr, str_len);
    }
    //alert(`proxy_convert_mp_to_js_obj_jsside(value=${value}) -> ${obj}`)
    return obj;
}

function proxy_convert_mp_to_js_obj_jsside_with_free(value) {
    const ret = proxy_convert_mp_to_js_obj_jsside(value);
    Module.instance.exports.free(value);
    return ret;
}
