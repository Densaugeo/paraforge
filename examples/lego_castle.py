from math import *

from paraforge import *

def gen_first_model(gates: int = 0) -> Node:
    red = Material('Red', '#f00')
    black = Material('Black', r=0.1, g=0.1, b=0.1)
    gray = Material('Gray', '#888')
    yellow = Material('Yellow', '#ff0')
    
    
    
    core_wall = Geometry()\
        .add_cube(unit=True).s(2, 12, 7).t(-7, -7, 0)
    
    floors = Geometry()\
        .add_cube(unit=True).s(4, 12, 1/3).t(-8, -8, 7)\
        .add_cube(unit=True).s(2, 14, 1/3).t(-8, -8, 13 + 1/3)\
        .add_cube(unit=True).s(1, 15, 1  ).t(-8, -8, 13 + 2/3)
    
    upper_battlements = Geometry()\
        .add_cube(unit=True).s(1, 2, 1).t(-8, -8, 14 + 2/3)\
        .add_cube(unit=True).s(1, 2, 1).t(-8, -5, 14 + 2/3)\
        .add_cube(unit=True).s(1, 4, 1).t(-8, -2, 14 + 2/3)\
        .add_cube(unit=True).s(1, 2, 1).t(-8,  3, 14 + 2/3)\
        .add_cube(unit=True).s(1, 1, 1).t(-8,  6, 14 + 2/3)\
        \
        .add_cube(unit=True).s(1, 7, 1).t(-4, -4, 17 + 2/3)\
        .add_cube(unit=True).s(2, 1, 1).t(-4, -4, 18 + 2/3)\
        .add_cube(unit=True).s(1, 1, 1).t(-4, -3, 18 + 2/3)\
        .add_cube(unit=True).s(1, 2, 1).t(-4, -1, 18 + 2/3)
    
    tower_frame = Geometry()\
        .add_cube(unit=True).s(1, 7, 2).t(-4, -4, 7)\
        .add_cube(unit=True).s(1, 1, 4 + 1/3).t(-4, -4, 9)\
        .add_cube(unit=True).s(1, 7, 1).t(-4, -4, 13 + 1/3)\
        .add_cube(unit=True).s(1, 1, 1).t(-4, -4, 15 + 1/3)\
        .add_cube(unit=True).s(1, 7, 1).t(-4, -4, 16 + 1/3)\
        \
        .add_cube(unit=True).s(2, 2, 1).t(-7, -5, 12 + 1/3)\
        .add_cube(unit=True).s(2, 2, 1).t(-6, -5, 13 + 1/3)\
        .add_cube(unit=True).s(2, 2, 1).t(-5, -5, 14 + 1/3)\
        .add_cube(unit=True).s(2, 2, 1).t(-5, -6, 13 + 1/3)\
        .add_cube(unit=True).s(2, 2, 1).t(-5, -7, 12 + 1/3)
    
    r = 2
    tower_arches = Geometry()\
        .add_cylinder(32).s(r, r/1.2, 0.5).rotate_euler(pi/2, 0, 0)
    
    # Knock out some vtcs to make a half-circle
    tower_arches.delete_vtx(0).delete_vtx(1)
    tower_arches.select(-100, -100, -100, 100, 100, -0.1).delete_vtcs()
    
    # Extrude. The upper half of the extrusion will turn into the outside of the
    # arch
    tower_arches.select(-100, -100, -100, 100, 100, 100).extrude(0, 0, 20)
    
    # Merge vertices on the upper extrusion to form a rectangular outside, still
    # bonded to the half-circle
    for xs in [-1, 1]:
        for ys in [-1, 1]:
            tower_arches\
                .select(100*xs, 100*ys, 10, r*xs, 0, 100)\
                .merge((r + 1)*xs, 0.5*ys, 0)\
                .select(100*xs, 100*ys, 10,    0, 0, 100)\
                .merge((r + 1)*xs, 0.5*ys, 2)
    
    tower_arches.select(-100, -100, -100, 100, 100, 100).t(0, -3.5, 14 + 1/3)
    
    tower_roof = Geometry().add_cube(unit=True).s(8, 8, 1/3).t(-4, -4, 17 + 1/3)
    
    outer_frame = Geometry()
    
    # Posts around corner
    outer_frame.add_cube(unit=True).s(1, 1, 7).t(-8, -8, 0)
    outer_frame.add_cube(unit=True).s(2, 2, 7).t(-5, -5, 0)
    outer_frame.add_cube(unit=True).s(1, 2, 7).t(-8, -5, 0)
    outer_frame.add_cube(unit=True).s(2, 1, 7).t(-5, -8, 0)
    
    # Post above corner
    outer_frame.add_cube(unit=True).s(1, 1, 1).t(-8, -8, 7 + 1/3)
    outer_frame.add_cube(unit=True).s(1, 1, 1).t(-7, -7, 7 + 1/3)
    outer_frame.add_cube(unit=True).s(2, 2, 5).t(-8, -8, 8 + 1/3)
    
    # Posts in center of (short) walls
    outer_frame.add_cube(unit=True).s(1, 2, 7).ty(-1).tx(-8)
    outer_frame.add_cube(unit=True).s(1, 2, 7).ty(-1).tx(-5)
    
    # Post above center of short wall
    outer_frame.add_cube(unit=True).s(1, 2, 1).t(-8, -1, 7 + 1/3)
    outer_frame.add_cube(unit=True).s(1, 4, 1).t(-7, -2, 7 + 1/3)
    outer_frame.add_cube(unit=True).s(2, 4, 5).t(-8, -2, 8 + 1/3)
    
    # Crossbeams
    outer_frame.add_cube(unit=True).s(14, 1, 1).t(-7, -7, 11 + 1/3)
    
    
    
    for geometry in [core_wall, floors, upper_battlements, tower_frame,
    tower_arches, outer_frame]:
        geometry.select(-100, -100, -100, 100, 100, 100)
        for i in range(3): geometry.copy().rotate_euler(0, 0, pi/2)
    
    
    
    walkway_wall = Geometry()
    walkway_battlements = Geometry()
    for i, (x, y, θ) in enumerate([
        ( 4,  4, 0     ),
        ( 4,  4, 0.5*pi),
        (-4,  4, 0.5*pi),
        (-4,  4,     pi),
        (-4, -4,     pi),
        (-4, -4, 1.5*pi),
        ( 4, -4, 1.5*pi),
        ( 4, -4, 2  *pi),
    ]):
        if gates & (1 << i):
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
    
    
    
    node = Node('Keep')
    node.mesh = Mesh()
    node.mesh.new_prim(core_wall          .pack(), material=red   )
    node.mesh.new_prim(outer_frame        .pack(), material=black )
    node.mesh.new_prim(floors             .pack(), material=gray  )
    node.mesh.new_prim(upper_battlements  .pack(), material=gray  )
    node.mesh.new_prim(walkway_wall       .pack(), material=red   )
    node.mesh.new_prim(walkway_battlements.pack(), material=black )
    node.mesh.new_prim(tower_frame        .pack(), material=yellow)
    node.mesh.new_prim(tower_arches       .pack(), material=black )
    node.mesh.new_prim(tower_roof         .pack(), material=gray  )
    node.tz(-17).sz(1.2)
    return node
