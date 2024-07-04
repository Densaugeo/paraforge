//throw Error('An error')
//const foo = does.not.exist

let rust_instance = null
const init = async args => {
  rust_instance = await WebAssembly.instantiate(args.rust_module)
  
  const bytes = new Uint8Array(rust_instance.exports.memory.buffer)
  
  postMessage({
    message: 'Rust module instantiated',
    some_memory: bytes.slice(0, 100),
  })
}

self.onmessage = e => {
  if(e.data.type === 'init') {
    init(e.data)
  }
}

postMessage({ some: 'object' })
