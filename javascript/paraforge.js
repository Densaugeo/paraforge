/////////////////////////
// Preload HTTP Assets //
/////////////////////////

const rust_module_promise = (async () => {
  const response = await fetch('../paraforge/paraforge.wasm',
    { cache: 'no-store' })
  return await WebAssembly.compileStreaming(response)
})()

const mp_module_promise = (async () => {
  const response = await fetch('micropython.wasm',
    { cache: 'no-store' })
  return await WebAssembly.compileStreaming(response)
})()

const worker_file_promise = (async () => {
  const response = await fetch('micropython-reduced.js', { cache: 'no-store' })
  // The worker response must be converted into text before being converted into
  // a file object, otherwise browser console will not provide error information
  // for error that occur inside the worker thread
  const text = await response.text()
  return URL.createObjectURL(new File([text], 'micropython-reduced.js'))
})()

const paraforge_init_py_promise = (async () => {
  const response = await fetch('../paraforge/__init__.py', { cache: 'reload' })
  const array_buffer = await response.arrayBuffer()
  return new Uint8Array(array_buffer)
})()

const [
  rust_module,
  mp_module,
  worker_file,
  paraforge_init_py,
] = await Promise.all([
  rust_module_promise,
  mp_module_promise,
  worker_file_promise,
  paraforge_init_py_promise,
])

////////////////////////////////////
// Paraforge Class (Experimental) //
////////////////////////////////////

export class Paraforge extends EventTarget {
  constructor(verbosity) {
    super()
    
    this.verbosity = verbosity
    
    this._worker = new Worker(worker_file, { type: 'module' })
    
    this._worker.onerror = e => {
      console.log('An error happened in a worker. Good luck getting any ' +
        'debugging info.')
      throw e
    }
    
    this._worker.onmessage = message => {
      //console.log(message.data)
      
      if(message.data.function) {
        if(message.data.error === null) this._resolve(message.data.result)
        else this._reject(message.data.error)
        
        this._resolve = null
        this._reject = null
      }
      
      if(message.data.event) {
        switch(message.data.event) {
          case 'stdout':
            if(1 <= this.verbosity) {
              console.log(`stdout: ${message.data.line}`)
            }
            this.dispatchEvent(new StdoutEvent(message.data.line))
            break
          case 'stderr':
            if(1 <= this.verbosity) {
              console.log(`stderr: ${message.data.line}`)
            }
            this.dispatchEvent(new StdoutEvent(message.data.line))
            break
          case 'log':
            if(message.data.priority <= this.verbosity) {
              console.log(message.data.line)
            }
            break
          default: throw new Error('idk')
        }
      }
    }
    
    this._resolve = null
    this._reject = null
  }
  
  init(script_name, script_contents) {
    if(this._resolve) throw new Error('Worker already running!')
    
    this._worker.postMessage({
      function: 'init',
      args: {
        rust_module,
        mp_module,
        paraforge_init_py,
        script_name,
        script_contents,
      },
    })
    
    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }
  
  python(code) {
    if(this._resolve) throw new Error('Worker already running!')
    
    this._worker.postMessage({
      function: 'python',
      args: {
        code,
      },
    })
    
    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }
  
  gen(script_name, generator, python_args, python_kwargs) {
    if(this._resolve) throw new Error('Worker already running!')
    
    this._worker.postMessage({
      function: 'gen',
      args: {
        script_name,
        generator,
        python_args,
        python_kwargs,
      },
    })
    
    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }
  
  serialize() {
    if(this._resolve) throw new Error('Worker already running!')
    
    this._worker.postMessage({
      function: 'serialize',
      args: {},
    })
    
    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }
}

/////////////////////////
// Virtual File System //
/////////////////////////

export class ParaforgeEvent extends Event {}

export class StdoutEvent extends ParaforgeEvent {
  constructor(line) {
    super('stdout')
    this.line = line
  }
}

export class StderrEvent extends ParaforgeEvent {
  constructor(line) {
    super('stderr')
    this.line = line
  }
}

export class ParaforgeError extends Error {}
export class NotImplementedError extends ParaforgeError {
  constructor(message) {
    super(message)
    this.name = 'NotImplementedError'
  }
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
