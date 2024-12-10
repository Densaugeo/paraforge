import argparse, importlib, struct, json, sys

import paraforge

parser = argparse.ArgumentParser()
parser.add_argument('script', type=str,
    help='Specify Paraforge script (usually uses .pf.py extension)')
parser.add_argument('generator', type=str,
    help='Specify which model generator within given script to use')
parser.add_argument('parameters', type=str, nargs='*',
    help='Parameters to pass to model generator')
parser.add_argument('--format', type=str, default='GLB',
    help='Output format')
args = parser.parse_args()

# This seems over-complicated, but is based on the docs:
# https://docs.python.org/3/library/importlib.html#importing-a-source-file-directly
import sys, importlib.util
spec = importlib.util.spec_from_file_location('script', args.script)
script = importlib.util.module_from_spec(spec)
sys.modules['script'] = script
spec.loader.exec_module(script)

paraforge.init()
model = getattr(script, 'gen_' + args.generator)(*args.parameters)
paraforge.wasm_call('scene_add_node', 0, model.handle)
glb = paraforge.serialize()
glb_length = struct.unpack('<L', glb[8:12])[0]
assert glb_length == len(glb)
json_length = struct.unpack('<L', glb[12:16])[0]
json_data = json.loads(glb[20:20 + json_length])
if glb_length > json_length + 20:
    bin_length = struct.unpack('<L', glb[20 + json_length:24 + json_length])[0]
    bin_data = glb[28 + json_length:]
    assert bin_length == len(bin_data)
else:
    bin_data = None

if args.format.lower() == 'pretty':
    print(json.dumps(json_data, indent=2, sort_keys=True))
elif args.format.lower() == 'gltf':
    raise NotImplementedError()
elif args.format.lower() == 'glb':
    sys.stdout.buffer.write(glb)
