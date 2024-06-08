from paraforge import *

def gen_first_model():
    red = Material('Red', '#f00', roughness=0.5)
    black = Material('Black', r=0.1, g=0.1, b=0.1, roughness=0.5)
    
    red_block   = Geometry.Cube().s(1  , 0.25, 0.3).t(0, -0.75, 4.1)
    black_block = Geometry.Cube().s(0.5, 0.25, 0.3).t(0, -0.75, 4.7)
    black_block.select_triangles(-10, -10, 4.3, 10, 10, 4.5) \
        .delete_triangles()
    
    node = Node('Fortress Wall Battlement')
    mesh = node.add_mesh('Fortress Wall Battlement')
    mesh.add_primitive(red_block.pack(), material=red)
    mesh.add_primitive(black_block.pack(), material=black)
