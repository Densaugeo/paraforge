from paraforge import *

def gen_manual_vertices():
    red   = Material('Red', '#f00')
    green = Material('Green', '#0f0')
    blue  = Material('Blue', '#00f')
    
    red_block   = Geometry()
    green_block = Geometry.Cube().t(3, 0, 0)
    blue_block  = Geometry.Cube().t(6, 0, 0)
    
    red_block.create_vertex(-1, 1, 0)
    red_block.create_vertex(1, -1, 0)
    red_block.create_vertex(0, 0, 5)
    red_block.create_triangle(0, 1, 2)
    
    node = Node('Manual Vertices Test')
    mesh = node.add_mesh('Manual Vertices Test')
    mesh.add_primitive(red_block  .pack(), material=red  )
    mesh.add_primitive(green_block.pack(), material=green)
    mesh.add_primitive(blue_block .pack(), material=blue )
