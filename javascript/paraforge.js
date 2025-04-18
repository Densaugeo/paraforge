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
    // this.files is used by calling programs for save/restore with
    // localStorage. this.scripts is used by UI for querying available scripts.
    // Is this the best way to organize this data? Probably not.
    this.files = {}
    this.scripts = {}
    this.last_gen = null
    
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
    this._running_function = null
  }
  
  async _thread_call(name, args) {
    if(this._resolve) {
      throw new Error(`Worker already running ${this._running_function}()!`)
    }
    
    this._worker.postMessage({
      function: name,
      args,
    })
    
    const promise = new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
      this._running_function = name
    })
    
    try {
      await promise
    } finally {
      this._resolve = null
      this._reject = null
      this._running_function = null
    }
    
    return promise
  }
  
  /**
   * Must be called exactly once after construction. Performs longer-running
   * initialization that is not suitable for the constructor
   * 
   * @return {Promise<undefined>}
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
   * NOTE: I think saving script download paths will require contents to always
   * be a URL, maybe remove the ArrayBuffer option?
   * 
   * @param path {string} Where to place the file in the virtual file system
   * @param contents {string | ArrayBuffer} Contents of the file. May be either
   *   a string containing a URL to download, or the actual contents in a buffer
   * @return {Promise<undefined>}
   */
  async add_file(path, contents) {
    let contents_
    if(contents instanceof ArrayBuffer) {
      contents_ = contents
      throw new Error('Not sure settings file contents without a URL can ' +
        'really be supported here. Remove?')
    }
    if(typeof contents === 'string') {
      const res = await fetch(contents, { cache: 'no-cache' })
      if(!res.ok) throw new Error(`Unable to download file "${contents}": ` +
        `HTTP code ${res.status}`)
      contents_ = await res.arrayBuffer()
    }
    
    await this._thread_call('add_file', {
      path,
      contents: contents_,
    })
    
    this.files[path] = contents
    
    // Checking if file should be added to .scripts. This check is the same as
    // the check used to filter responses to list_scripts() in the worker thread
    if(path[0] === '/' && !path.slice(1).includes('/')
    && path.slice(-3) === '.py') {
      this.scripts[path.slice(1, -3)] = {
        path,
        url: contents,
        generators: await this.inspect(path.slice(1, -3)),
      }
    }
  }
  
  /**
   * Check if a file exists in the virtual file system used by the MicroPython
   * VM
   * 
   * @param path {string}
   * @return {Promise<boolean>}
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
   * @return {Promise<Object>}
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
   * @return {Promise<undefined>}
   */
  async execute(script_name, generator, python_args=[], python_kwargs={}) {
    await this._thread_call('execute', {
      script_name,
      generator,
      python_args,
      python_kwargs,
    })
    
    this.last_gen = {
      script: script_name,
      generator,
      python_args,
      python_kwargs,
    }
    
    this.dispatchEvent(new GenEvent())
  }
  
  /**
   * Retrieve a completed model in .glb format
   * 
   * @return {Promise<Uint8Array>}
   */
  async serialize() {
    return await this._thread_call('serialize', {})
  }
  
  /**
   * Lists available Paraforge scripts. Any .py file added at the top level of
   * the VFS is considered an available script. Scripts are reported by module
   * name, not filename (so the .py extension is not included)
   * 
   * NOTE: Trying to replace this with the .scripts field, updated by
   * .add_file(). Hopefully this method can be removed if that goes well
   * 
   * @return {Promise<string[]>}
   */
  async list_scripts() {
    return await this._thread_call('list_scripts', {})
  }
  
  /**
   * Inspect a paraforge script and return an array of model generator names and
   * parameters.
   * 
   * @param module {string} Name of Python module to inspect (excluding .py)
   * @return {Promise<Object>}
   */
  async inspect(module) {
    return await this._thread_call('inspect', { module })
  }
  
  /**
   * Generate a model. The specified script must already be loaded. For
   * use cases where more control is needed, the lower-level function .execute()
   * is recommended.
   * 
   * @param script_url {string} URL of Python module to import
   * @param generator {string} Name of generator function to call. Do not
   *   include gen_ prefix
   * @param python_args {Array<any>} Arguments to pass to generator
   * @param python_kwargs {Object} Keyword arguments to pass to generator
   * @return {Promise<Uint8Array>}
   */
  async gen(script_url, generator, python_args=[], python_kwargs={}) {
    const script_filename = script_url.split('/').slice(-1)[0]
    
    const module_name = script_filename.slice(0, -3)
    if(module_name.includes('.')) {
      throw new Error('Paraforge script filenames must have exactly one period')
    }
    
    await this.execute(module_name, generator, python_args, python_kwargs)
    return await this.serialize()
  }
}

///////////////////
// Miscellaneous //
///////////////////

export class ParaforgeEvent extends Event {}

export class GenEvent extends ParaforgeEvent {
  constructor() {
    super('gen')
  }
}

export class StdoutEvent extends ParaforgeEvent {
  /**
   * @param path {line}
   */
  constructor(line) {
    super('stdout')
    this.line = line
  }
}

export class StderrEvent extends ParaforgeEvent {
  /**
   * @param path {line}
   */
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
