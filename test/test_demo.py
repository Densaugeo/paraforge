import subprocess

def test_demo():
    result = subprocess.run([
        'python', '-m', 'paraforge', 'first_model.pf.py', 'first_model',
    ], capture_output=True)
    
    assert result.returncode == 0
    
    with open('first_model.glb') as f:
        assert result.stdout == f.read()
