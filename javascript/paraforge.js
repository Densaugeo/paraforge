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
    
    // Note: errors in the worker thread do not consistently trigger this
    // function
    this._worker.onerror = e => {
      console.log('An error happened in a worker. Good luck getting any ' +
        'debugging info.')
      throw e
    }
    
    this._worker.onmessage = message => {
      //console.log(message.data)
      
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
            this.dispatchEvent(new StdoutEvent(message.data.line))
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

class PythonError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PythonError'
  }
}
