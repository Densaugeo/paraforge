const rust_instance = await WebAssembly.instantiate(rust_module)

const onmessage = e => {
  console.log(`worker reports receiving ${e.data}`)
} 
