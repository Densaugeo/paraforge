/////////////////////////
// Preload HTTP Assets //
/////////////////////////

const rust_module_promise = (async () => {
  const res = await fetch(new URL('paraforge-rust.wasm', import.meta.url),
    { cache: 'no-store' })
  return await WebAssembly.compileStreaming(res)
})()

const mp_module_promise = (async () => {
  const res = await fetch(new URL('micropython.wasm', import.meta.url),
    { cache: 'no-store' })
  return await WebAssembly.compileStreaming(res)
})()

const worker_file_promise = (async () => {
  const res = await fetch(new URL('worker.js', import.meta.url),
    { cache: 'no-store' })
  // The worker response must be converted into text before being converted into
  // a file object, otherwise browser console will not provide error information
  // for error that occur inside the worker thread
  const text = await res.text()
  return URL.createObjectURL(new File([text], 'worker.js', {
    type: 'text/javascript',
  }))
})()

const paraforge_init_py_promise = (async () => {
  const res = await fetch(new URL('__init__.py', import.meta.url),
    { cache: 'no-store' })
  return await res.arrayBuffer()
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

/////////////////////
// Paraforge Class //
/////////////////////

export class Paraforge extends EventTarget {
  /**
   * @param verbosity {number} Defaults to 0 (no logging). Higher value = more
   *   logging
   */
  constructor(verbosity=0) {
    super()
    
    this.verbosity = verbosity
    
    this._worker = new Worker(worker_file, { type: 'module' })
    
    // Note: errors in the worker thread do not consistently trigger this
    // function
    this._worker.onerror = e => {
      console.log('An error happened in a worker. Good luck getting any ' +
        'debugging info.')
      throw e
    }
    
    this._worker.onmessage = message => {
      if(message.data.function) {
        const e = message.data.error
        
        if(e === null) this._resolve(message.data.result)
        else {
          const error_type = e.name === 'PythonError' ? PythonError : Error
          this._reject(new error_type(e.message))
        }
        
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
            this.dispatchEvent(new StderrEvent(message.data.line))
            break
          case 'log':
            if(message.data.priority <= this.verbosity) {
              console.log(message.data.line)
            }
            break
          default:
            throw new Error('Unrecognized event received from worker thread: ' +
              message.data.event)
        }
      }
    }
    
    this._resolve = null
    this._reject = null
  }
  
  _thread_call(name, args) {
    if(this._resolve) throw new Error('Worker already running!')
    
    this._worker.postMessage({
      function: name,
      args,
    })
    
    return new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }
  
  /**
   * Must be called exactly once after construction. Performs longer-running
   * initialization that is not suitable for the constructor
   */
  async init() {
    return await this._thread_call('init', {
      rust_module,
      mp_module,
      paraforge_init_py,
    })
  }
  
  /**
   * Add a file into the virtual file system used by the MicroPython VM
   * 
   * @param path {string} Where to place the file in the virtual file system
   * @param contents {string | ArrayBuffer} Contents of the file. May be either
   *   a string containing a URL to download, or the actual contents in a buffer
   */
  async add_file(path, contents) {
    let contents_
    if(contents instanceof ArrayBuffer) contents_ = contents
    if(typeof contents === 'string') {
      const res = await fetch(contents, { cache: 'no-cache' })
      if(!res.ok) throw new Error(`Unable to download file "${contents}": ` +
        `HTTP code ${res.status}`)
      contents_ = await res.arrayBuffer()
    }
    
    return await this._thread_call('add_file', {
      path,
      contents: contents_,
    })
  }
  
  /**
   * Check if a file exists in the virtual file system used by the MicroPython
   * VM
   * 
   * @param path {string}
   */
  async check_file_exists(path) {
    return await this._thread_call('check_file_exists', {
      path
    })
  }
  
  /**
   * Evaluate arbitrary Python inside the MicroPython VM. Intended for
   * debugging. VM does not have access to any outside resources except the Rust
   * WebAssembly module
   * 
   * @param code {string}
   */
  async python(code) {
    return await this._thread_call('python', { code })
  }
  
  /**
   * Execute a model generator. Model generator must be loaded with .add_file()
   * first, and the result must be retrieved later with .serialize(). For simple
   * use cases, using the convenience function .gen() instead is recommended.
   * 
   * @param script_name {string} Name of Python module to import
   * @param generator {string} Name of generator function to call. Do not
   *   include gen_ prefix
   * @param python_args {Array<any>} Arguments to pass to generator
   * @param python_kwargs {Object} Keyword arguments to pass to generator
   */
  async execute(script_name, generator, python_args=[], python_kwargs={}) {
    return await this._thread_call('execute', {
      script_name,
      generator,
      python_args,
      python_kwargs,
    })
  }
  
  /**
   * Retrieve a completed model in .glb format
   * 
   * @returns {Promise<Uint8Array>}
   */
  async serialize() {
    return await this._thread_call('serialize', {})
  }
  
  /**
   * Generate a model. Automatically loads the specified script first. For
   * use cases where more control is needed, the lower-level function .execute()
   * is recommended.
   * 
   * @param script_url {string} URL of Python module to import
   * @param generator {string} Name of generator function to call. Do not
   *   include gen_ prefix
   * @param python_args {Array<any>} Arguments to pass to generator
   * @param python_kwargs {Object} Keyword arguments to pass to generator
   */
  async gen(script_url, generator, python_args=[], python_kwargs={}) {
    const script_filename = script_url.split('/').slice(-1)[0]
    if(script_filename.slice(-3) !== '.py') {
      throw new Error('Paraforge script filenames must end in .py')
    }
    
    const module_name = script_filename.slice(0, -3)
    if(module_name.includes('.')) {
      throw new Error('Paraforge script filenames must have exactly one period')
    }
    
    if(!await this.check_file_exists('/' + script_filename)) {
      await this.add_file('/' + script_filename, script_url)
    }
    
    await this.execute(module_name, generator, python_args, python_kwargs)
    return await this.serialize()
  }
}

///////////////////
// Miscellaneous //
///////////////////

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

class PythonError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PythonError'
  }
}
