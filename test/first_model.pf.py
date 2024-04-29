from paraforge import *

def model_first_model():
    red = Material('Red', '#f00', roughness=0.5)
    black = Material('Black', '#191919', roughness=0.5)
    
    red_block   = Geometry.cube().s(1  , 0.25, 0.3).t(0, -0.75, 4.1)
    black_block = Geometry.cube().s(0.5, 0.25, 0.3).t(0, -0.75, 4.7)
    black_block.select_triangles((-10, -10, 4.3), (10, 10, 4.5)) \
        .delete_triangles()
    
    node = Node(0, 'Fortress Wall Battlement')
    mesh = Mesh(node, 'Fortress Wall Battlement')
    mesh.append(MeshPrimitive(red_block  , material=red  ))
    mesh.append(MeshPrimitive(black_block, material=black))
