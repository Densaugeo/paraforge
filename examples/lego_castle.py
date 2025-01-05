from paraforge import *

def gen_first_model() -> Node:
    red = Material('Red', '#f00', roughness=0.5)
    black = Material('Black', r=0.1, g=0.1, b=0.1, roughness=0.5)
    
    voxel = lambda: Geometry.Cube().s(0.5, 0.5, 0.6).t(0.5, 0.5, 0.6)
    
    # red_block   = Geometry.Cube().s(1  , 0.25, 0.3).t(0, 0.25, 0.3)
    # black_block = Geometry.Cube().s(0.5, 0.5, 0.5).sz(6)
    black_block = voxel().sz(7)
    black_block_2 = voxel().sx(1).sz(7).tx(3)
    black_block_3 = voxel().sy(1).sz(7).ty(3)
    black_block_4 = voxel().sy(1).sz(7).tx(3).ty(3)
    # black_block.select_tris(-10, -10, 0.5, 10, 10, 0.7).delete_tris()
    
    node = Node('Keep corner')#.t(0.5, 0.5, 0.6).sz(1.2)
    node.mesh = Mesh()
    # node.mesh.new_prim(red_block.pack(), material=red)
    node.mesh.new_prim(black_block.pack(), material=black)
    node.mesh.new_prim(black_block_2.pack(), material=black)
    node.mesh.new_prim(black_block_3.pack(), material=black)
    node.mesh.new_prim(black_block_4.pack(), material=black)
    
    return node
