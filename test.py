import os, sys, subprocess, json, struct
from pathlib import Path

import pytest

from paraforge import *

####################
# Setup / Teardown #
####################

def setup_module():
    os.mkdir(Path(__file__).parent / 'test-temp')
    os.chdir(Path(__file__).parent / 'test-temp')
    os.symlink('../paraforge', 'paraforge')

###########
# Helpers #
###########

def parse_glb(glb: bytes) -> (object, bytes):
    # Save this in a variable because putting len(glb) in an assert causes the
    # whole glb buffer to be printed in any error messages
    glb_length = len(glb)
    
    assert glb_length >= 20, '.glb must be at least 20 bytes but this is ' + \
        f'{glb_length} bytes'
    
    magic_bytes, gltf_version, expected_glb_length, json_length, json_type = \
        struct.unpack('<4sLLL4s', glb[:20])
    
    assert magic_bytes == b'glTF', '.glb header must begin with b\'glTF\' ' + \
        f'but this .glb begins with {magic_bytes}'
    assert gltf_version == 2, 'This test suite is designed for GLTF ' + \
        f'version 2 but .glb header reports version {gltf_version}'
    assert expected_glb_length == glb_length, '.glb header states file is ' + \
        f'{expected_glb_length} bytes but it is actually {glb_length} bytes'
    assert json_type == b'JSON', 'First .glb chunk must have type ' + \
        f'b\'JSON\' but reports chunk header {json_type}'
    assert glb_length >= 20 + json_length, 'JSON chunk header reports a ' + \
        f'length of {json_length} bytes, but this .glb only has space for ' + \
        f'{glb_length - 20} bytes of JSON after the headers'
    
    bin_ = None
    
    if glb_length >= 28 + json_length:
        # BIN chunk found!
        bin_start = 28 + json_length
        bin_length, bin_type = struct.unpack('<L4s',
            glb[bin_start - 8:bin_start])
        
        assert bin_type == b'BIN\x00', 'Second .glb chunk must have type ' + \
            f'b\'BIN\x00\' but reports chunk header {bin_type}' + (
                '(a possible BIN chunk starts at byte '
                f'{glb.find(b'BIN\x00') - 4} in this file)'
                if b'BIN\x00' in glb else ''
            )
        assert glb_length >= bin_start + bin_length, 'BIN chunk ' + \
            f'header reports a length of {bin_length} bytes, but this ' + \
            f'.glb only has space for {glb_length - bin_start} ' + \
            'bytes of BIN after the headers and JSON chunk'
        assert glb_length == bin_start + bin_length, 'This .glb has ' + \
            f'{glb_length - bin_start - bin_length} bytes trailing after ' + \
            'the BIN chunk, but GLTF version 2 does not allow any more chunks'
        
        bin_ = glb[bin_start:bin_start + bin_length]
    else:
        # No BIN chunk
        assert glb_length == 20 + json_length, 'This .glb has ' + \
            f'{glb_length - 20 - json_length} bytes trailing after the ' + \
            'JSON chunk. That\'s not enough bytes for another chunk ' + \
            'header, so they shouldn\'t be there'
    
    json_ = json.loads(glb[20:20 + json_length])
    return (json_, bin_)

#########
# Tests #
#########

def test_demo():
    result = subprocess.run([
        sys.executable, '-m', 'paraforge', '../examples/first_model.py',
        'first_model',
    ], capture_output=True)
    
    assert result.returncode == 0
    json_actual, bin_actual = parse_glb(result.stdout)
    
    with open('../test-files/first_model.glb', 'rb') as f:
        json_expected, bin_expected = parse_glb(f.read())
    
    assert json_actual == json_expected
    assert bin_actual == bin_expected
    
    with open('../test-files/first_model.glb', 'rb') as f:
        assert result.stdout == f.read(), 'Final diff failed. If the test ' + \
            'fails here, it usually means the generated .glb is ' + \
            'funtionally identical but JSON values are printed in a ' + \
            'different order'

@pytest.mark.parametrize('vtx', [
    (0, 0, 0),
    (1, 2, 3),
    (-1e+6, 0, 1e+6),
])
def test_manual_vtcs(vtx: tuple[float, float, float]):
    init()
    
    geometry = Geometry()
    assert geometry.get_vtx_count() == 0
    geometry.create_vtx(*vtx)
    assert geometry.get_vtx_count() == 1
    
    geometry.pack()
    json_, bin_ = parse_glb(serialize())
    
    assert len(bin_) == 12
    assert bin_ == struct.pack('<fff', *vtx)

# Making an unnamed Node previously triggered a bug in which string transports
# attempted to use address 0, causing the pointer to be misinterpreted as an
# error
def test_unnamed_node():
    init()
    Node()
