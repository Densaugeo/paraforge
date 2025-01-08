from math import *

from paraforge import *

def gen_first_model(towers: int = 2, gates: int = 0x09000000) -> Node:
    red = Material('Red', '#f00')
    black = Material('Black', r=0.1, g=0.1, b=0.1)
    gray = Material('Gray', '#888')
    
    
    
    core_wall = Geometry().add_cube(unit=True).s(2, 12, 7).t(-7, -7, 0)
    floors = Geometry().add_cube(unit=True).s(4, 12, 1/3).t(-8, -8, 7)
    
    for geometry in [core_wall, floors]:
        geometry.select(-100, -100, -100, 100, 100, 100)
        for i in range(3): geometry.copy().rotate_euler(0, 0, pi/2)
        
        # If there's multiple towers, move +X side to make room
        geometry.select(0, -8, 0, 8, 8, 100).tx(16*(towers - 1))
    
    
    
    black_block = Geometry()
    
    # Posts around corner
    black_block.add_cube(unit=True).s(1, 1, 7).t(-8, -8, 0)
    #black_block.add_cube(unit=True).s(2, 2, 7).t(-5, -5, 0)
    black_block.add_cube(unit=True).s(1, 2, 7).t(-8, -5, 0)
    black_block.add_cube(unit=True).s(2, 1, 7).t(-5, -8, 0)
    
    # Posts in center of (short) walls
    black_block.add_cube(unit=True).s(1, 2, 7).ty(-1).tx(-8)
    black_block.add_cube(unit=True).s(1, 2, 7).ty(-1).tx(-5)
    
    black_block.select(-2, 2, 0, -8, -8, 7)
    for _ in range(3): black_block.copy().rotate_euler(0, 0, pi/2)
    
    # If there's multiple towers, move +X side to make room
    black_block.select(2, -8, 0, 8, 8, 7).tx(16*(towers - 1))
    
    # If there's multiple towers, repeat appropriate wall section along X-axis
    black_block.select(2, -2, 0, -6, -8, 7)
    for _ in range(2*(towers - 1)): black_block.copy().tx(8)
    
    black_block.select(2,  2, 0, -6,  8, 7)
    for _ in range(2*(towers - 1)): black_block.copy().tx(8)
    
    
    
    walkway_wall = Geometry()
    # Start in +X/+Y quadrant facing toward +X
    x = 16*towers - 12
    y = 4
    θ = 0
    for i in range(4*towers + 4):
        if not gates & 1 << (31 - i):
            walkway_wall.add_cube().s(0.5, 3, 0.5).tx(3.5)\
                .rotate_euler(0, 0, θ)\
                .t(x, y, 7.5 + 1/3)
        
        # Proceed counter-clockwise (+θ)
        if   i ==            0: θ += pi/2
        elif i == 2*towers    : θ += pi/2
        elif i == 2*towers + 1: y -=    8
        elif i == 2*towers + 2: θ += pi/2
        elif i == 4*towers + 2: θ += pi/2
        else                  : x += -8 if i < 2*towers + 2 else 8
    
    
    
    node = Node('Keep corner')#.t(0.5, 0.5, 0.6).sz(1.2)
    node.mesh = Mesh()
    node.mesh.new_prim(core_wall   .pack(), material=red  )
    node.mesh.new_prim(black_block .pack(), material=black)
    node.mesh.new_prim(floors      .pack(), material=gray )
    node.mesh.new_prim(walkway_wall.pack(), material=red  )
    
    node.tz(-8.8).sz(1.2)
    
    return node
