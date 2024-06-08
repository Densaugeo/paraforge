import os, subprocess
from pathlib import Path

####################
# Setup / Teardown #
####################

def setup_module():
    os.mkdir(Path(__file__).parent / 'test-temp')
    os.chdir(Path(__file__).parent / 'test-temp')
    os.symlink('../paraforge', 'paraforge')

#########
# Tests #
#########

def test_demo():
    result = subprocess.run([
        'python', '-m', 'paraforge', '../examples/first_model.pf.py',
        'first_model',
    ], capture_output=True)
    
    assert result.returncode == 0
    
    with open('../test-files/first_model.glb', 'rb') as f:
        assert result.stdout == f.read()
