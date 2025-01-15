from math import *

from paraforge import *

from feature_tests import *

π = pi

def gen_composite_model() -> Node:
    result = Node('Composite model test')
    
    # Plain default gear at origin
    default_gear = gen_gear()
    result.add(default_gear)
    
    # Gears with different tooth counts
    for i in range(4):
        result.add(gen_gear(tooth_count=4 + 4*i).ty(4).tx(-6 + 4*i).sz(0.25))
    
    # Extrusion tests
    extrusions = Node() \
        .add(gen_extrusion().tx(4)) \
        .add(gen_extrusion_inside_out().tx(8))
    result.add(extrusions)
    
    # Subtree cloning tests
    result.add(default_gear.clone_subtree().ty(-4))
    result.add(extrusions.clone_subtree().ty(-4))
    
    # Geometry tests
    result.add(gen_cubes().tx(-4))
    result.add(gen_squares().t(-4, -4, 0))
    result.add(gen_extrudey_tower().t(-4, -8, 0))
    result.add(gen_circle_and_cylinder().ty(-8))
    result.add(gen_merged_pillar().t(8, -8, 0))
    
    return result
