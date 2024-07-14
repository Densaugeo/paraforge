import * as paraforge from './paraforge.js'
window.paraforge = paraforge

const paraforge_class_instance = new paraforge.Paraforge(1)
await paraforge_class_instance.init()
await paraforge_class_instance.add_file('/first_model.py',
  '../examples/first_model.pf.py')

paraforge_class_instance.addEventListener('stderr', e => {
  document.getElementById('micropython-stdout').innerHTML +=
    `<text style="color:#f00">${e.line}</text>`
})
paraforge_class_instance.addEventListener('stdout', e => {
  document.getElementById('micropython-stdout').innerHTML += e.line
})

await paraforge_class_instance.gen('first_model', 'first_model', [], {})
await paraforge_class_instance.python(`
  import time
  print('Sleeping...', end='')
  time.sleep(1)
  print('OK')
  print()
  
  import random
  print(random.random())
  print()
  
  big_list = []
  for i in range(1e+5):
      big_list.append(i)
  print(big_list[-1])
  print()
  
  #1/0
`)

let res = await fetch('../test-files/first_model.glb', { cache: 'reload' })
let res_array_buffer = await res.arrayBuffer()
window.expected_glb = new Uint8Array(res_array_buffer)
window.actual_glb = await paraforge_class_instance.serialize()
const decoder = new TextDecoder()
console.log('Is the actual .glb as expected?')
console.log(decoder.decode(expected_glb) == decoder.decode(actual_glb))
//console.log(decoder.decode(expected_glb))
//console.log(decoder.decode(actual_glb))
for(let i = 0; i < expected_glb.length; ++i) {
  if(expected_glb[i] != actual_glb[i]) {
    console.log(`First difference at ${i}`)
    break
  }
}
