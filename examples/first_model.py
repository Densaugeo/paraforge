from paraforge import *

def gen_first_model() -> Node:
    red = Material('Red', '#f00', roughness=0.5)
    black = Material('Black', r=0.1, g=0.1, b=0.1, roughness=0.5)
    
    red_block   = Geometry.Cube().s(1  , 0.25, 0.3).t(0, 0.25, 0.3)
    black_block = Geometry.Cube().s(0.5, 0.25, 0.3).t(0, 0.25, 0.9)
    black_block.select_tris(-10, -10, 0.5, 10, 10, 0.7).delete_tris()
    
    node = Node('Fortress Wall Battlement')
    node.mesh = Mesh('Fortress Wall Battlement')
    node.mesh.new_prim(red_block.pack(), material=red)
    node.mesh.new_prim(black_block.pack(), material=black)
    
    return node
