import argparse, importlib

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

getattr(script, 'gen_' + args.generator)(*args.parameters)
print('Serialization:', paraforge.serialize())
