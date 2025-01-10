from math import *

from paraforge import *

def gen_first_model(towers: int = 1, gates: int = 0x09000000) -> Node:
    red = Material('Red', '#f00')
    black = Material('Black', r=0.1, g=0.1, b=0.1)
    gray = Material('Gray', '#888')
    yellow = Material('Yellow', '#ff0')
    
    
    
    core_wall = Geometry().add_cube(unit=True).s(2, 12, 7).t(-7, -7, 0)
    floors = Geometry()\
        .add_cube(unit=True).s(4, 12, 1/3).t(-8, -8, 7)\
        .add_cube(unit=True).s(2, 14, 1/3).t(-8, -8, 13 + 1/3)\
        .add_cube(unit=True).s(1, 15, 1  ).t(-8, -8, 13 + 2/3)
    
    for geometry in [core_wall, floors]:
        geometry.select(-100, -100, -100, 100, 100, 100)
        for i in range(3): geometry.copy().rotate_euler(0, 0, pi/2)
        
        # If there's multiple towers, move +X side to make room
        geometry.select(0, -8, 0, 8, 8, 100).tx(16*(towers - 1))
    
    
    
    upper_battlements = Geometry()
    
    upper_battlements.add_cube(unit=True).s(2, 1, 1).t(-8, -8, 14 + 2/3)
    upper_battlements.add_cube(unit=True).s(1, 1, 1).t(-8, -7, 14 + 2/3)
    upper_battlements.add_cube(unit=True).s(1, 2, 1).t(-8, -5, 14 + 2/3)
    upper_battlements.add_cube(unit=True).s(1, 4, 1).t(-8, -2, 14 + 2/3)
    upper_battlements.add_cube(unit=True).s(1, 2, 1).t(-8,  3, 14 + 2/3)
    
    upper_battlements.select(-100, -100, -100, 100, 100, 100)
    for i in range(3): upper_battlements.copy().rotate_euler(0, 0, pi/2)
    
    # If there's multiple towers, move +X side to make room
    upper_battlements.select(2.5, -8, 0, 8, 8, 100).tx(16*(towers - 1))
    
    # If there's multiple towers, repeat appropriate wall section along X-axis
    upper_battlements.select(2, 8, 0, -5.5, -8, 100)
    for _ in range(2*(towers - 1)): upper_battlements.copy().tx(8)
    
    
    
    black_block = Geometry()
    
    # Posts around corner
    black_block.add_cube(unit=True).s(1, 1, 7).t(-8, -8, 0)
    black_block.add_cube(unit=True).s(2, 2, 7).t(-5, -5, 0)
    black_block.add_cube(unit=True).s(1, 2, 7).t(-8, -5, 0)
    black_block.add_cube(unit=True).s(2, 1, 7).t(-5, -8, 0)
    
    # Post above corner
    black_block.add_cube(unit=True).s(1, 1, 1).t(-8, -8, 7 + 1/3)
    black_block.add_cube(unit=True).s(1, 1, 1).t(-7, -7, 7 + 1/3)
    black_block.add_cube(unit=True).s(2, 2, 5).t(-8, -8, 8 + 1/3)
    
    # Crossbeams
    black_block.add_cube(unit=True).s(14, 1, 1).t(-7, -7, 11 + 1/3)
    for i in range(3): black_block.copy().rotate_euler(0, 0, pi/2)
    
    # Posts in center of (short) walls
    black_block.add_cube(unit=True).s(1, 2, 7).ty(-1).tx(-8)
    black_block.add_cube(unit=True).s(1, 2, 7).ty(-1).tx(-5)
    
    # Post above center of short wall
    black_block.add_cube(unit=True).s(1, 2, 1).t(-8, -1, 7 + 1/3)
    black_block.add_cube(unit=True).s(1, 4, 1).t(-7, -2, 7 + 1/3)
    black_block.add_cube(unit=True).s(2, 4, 5).t(-8, -2, 8 + 1/3)
    
    black_block.select(-2, 2, 0, -8, -8, 100)
    for _ in range(3): black_block.copy().rotate_euler(0, 0, pi/2)
    
    # If there's multiple towers, move +X side to make room
    black_block.select(2.5, -8, 0, 8, 8, 100).tx(16*(towers - 1))
    
    # If there's multiple towers, repeat appropriate wall section along X-axis
    black_block.select(2, -2, 0, -5.5, -8, 100)
    for _ in range(2*(towers - 1)): black_block.copy().tx(8)
    
    black_block.select(2,  2, 0, -5.5,  8, 100)
    for _ in range(2*(towers - 1)): black_block.copy().tx(8)
    
    
    
    walkway_wall = Geometry()
    walkway_battlements = Geometry()
    # Start in +X/+Y quadrant facing toward +X
    x = 16*towers - 12
    y = 4
    θ = 0
    for i in range(4*towers + 4):
        if gates & 1 << (31 - i):
            for y_2 in [2.5, -2.5]:
                walkway_wall.add_cube().s(0.5, 0.5, 0.5).tx(3.5).ty(y_2)\
                    .rotate_euler(0, 0, θ)\
                    .t(x, y, 7.5 + 1/3)
        else:
            walkway_wall.add_cube().s(0.5, 3, 0.5).tx(3.5)\
                .rotate_euler(0, 0, θ)\
                .t(x, y, 7.5 + 1/3)
            walkway_battlements.add_cube().s(0.5, 1, 0.5).tx(3.5)\
                .rotate_euler(0, 0, θ)\
                .t(x, y, 8.5 + 1/3)
        
        # Proceed counter-clockwise (+θ)
        if   i ==            0: θ += pi/2
        elif i == 2*towers    : θ += pi/2
        elif i == 2*towers + 1: y -=    8
        elif i == 2*towers + 2: θ += pi/2
        elif i == 4*towers + 2: θ += pi/2
        else                  : x += -8 if i < 2*towers + 2 else 8
    
    
    
    tower_frame = Geometry()
    tower_frame.add_cube(unit=True).s(1, 7, 2).t(-4, -4, 7)
    tower_frame.add_cube(unit=True).s(1, 1, 4 + 1/3).t(-4, -4, 9)
    tower_frame.add_cube(unit=True).s(1, 7, 1).t(-4, -4, 13 + 1/3)
    tower_frame.add_cube(unit=True).s(1, 1, 1).t(-4, -4, 15 + 1/3)
    tower_frame.add_cube(unit=True).s(1, 7, 1).t(-4, -4, 16 + 1/3)
    
    tower_frame.add_cube(unit=True).s(2, 2, 1).t(-7, -5, 12 + 1/3)
    tower_frame.add_cube(unit=True).s(2, 2, 1).t(-6, -5, 13 + 1/3)
    tower_frame.add_cube(unit=True).s(2, 2, 1).t(-5, -5, 14 + 1/3)
    tower_frame.add_cube(unit=True).s(2, 2, 1).t(-5, -6, 13 + 1/3)
    tower_frame.add_cube(unit=True).s(2, 2, 1).t(-5, -7, 12 + 1/3)
    
    tower_frame.select(-100, -100, -100, 100, 100, 100)
    for _ in range(3): tower_frame.copy().rotate_euler(0, 0, pi/2)
    
    
    
    tower_arches = Geometry()
    tower_arches.add_square(unit=True).s(1, 2, 1).rotate_euler(-pi/2, 0, 0)\
        .t(-4, -3, 16 + 1/3)
    tower_arches.extrude(0, 1, 0)
    tower_arches.extrude(0, 1, 0).tz(-16 - 1/3).sz(0.5).tz(16 + 1/3)
    tower_arches.extrude(0, 1, 0).tz(-16 - 1/3).sz(0.5).tz(16 + 1/3)
    tower_arches.extrude(0, 1, 0).tz(-16 - 1/3).sz(2  ).tz(16 + 1/3)
    tower_arches.extrude(0, 1, 0).tz(-16 - 1/3).sz(2  ).tz(16 + 1/3)
    tower_arches.extrude(0, 1, 0)
    
    tower_arches.select(-100, -100, -100, 100, 100, 100)
    for _ in range(3): tower_arches.copy().rotate_euler(0, 0, pi/2)
    
    
    
    tower_roof = Geometry()
    
    tower_roof.add_cube(unit=True).s(1, 7, 1).t(-4, -4, 17 + 2/3)
    tower_roof.add_cube(unit=True).s(2, 1, 1).t(-4, -4, 18 + 2/3)
    tower_roof.add_cube(unit=True).s(1, 1, 1).t(-4, -3, 18 + 2/3)
    tower_roof.add_cube(unit=True).s(1, 2, 1).t(-4, -1, 18 + 2/3)
    
    tower_roof.select(-100, -100, -100, 100, 100, 100)
    for _ in range(3): tower_roof.copy().rotate_euler(0, 0, pi/2)
    
    tower_roof.add_cube(unit=True).s(8, 8, 1/3).t(-4, -4, 17 + 1/3)
    
    
    
    node = Node('Keep corner')#.t(0.5, 0.5, 0.6).sz(1.2)
    node.mesh = Mesh()
    node.mesh.new_prim(core_wall          .pack(), material=red   )
    node.mesh.new_prim(black_block        .pack(), material=black )
    node.mesh.new_prim(floors             .pack(), material=gray  )
    node.mesh.new_prim(upper_battlements  .pack(), material=gray  )
    node.mesh.new_prim(walkway_wall       .pack(), material=red   )
    node.mesh.new_prim(walkway_battlements.pack(), material=black )
    node.mesh.new_prim(tower_frame        .pack(), material=yellow)
    node.mesh.new_prim(tower_arches       .pack(), material=black )
    node.mesh.new_prim(tower_roof         .pack(), material=gray  )
    
    node.t(4, 4, -16).sz(1.2)
    
    return node
