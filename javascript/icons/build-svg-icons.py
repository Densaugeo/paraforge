import os, pathlib

folder = pathlib.Path(__file__).parent

with open(folder / 'svg-icons.js', 'w') as output_f:
    output_f.write('export const svg_icons = {\n')
    
    for filename in os.listdir(folder):
        if filename[-4:] != '.svg':
            continue
        
        with open(folder / filename) as svg_f:
            svg = svg_f.read()
            assert '`' not in svg, ('Don\'t want to deal with escaping '
              'backticks')
            
            output_f.write(f"  '{filename}': `{svg}`,\n")
    
    output_f.write('}\n')
