from math import *

from paraforge import *

π = pi

def gen_manual_vertices(tooth_count: int = 8, pitch_radius: float = 1.0,
pressure_angle: float = π/9, backlash: float = 0.1, curve_segments: int = 10,
):
    z = tooth_count
    rp = pitch_radius # m
    ψ = pressure_angle # rad
    B = backlash # m
    ns = curve_segments
    
    assert z > 0, f'Tooth count = {z}, but should be > 0'
    assert rp > 0, f'Pitch radius = {rp}, but should be > 0'
    assert 0 <= ψ <= π/2, f'Pressure angle = {ψ}, but should between 0 and π/2'
    assert 0 <= B <= π*rp/z, f'Backlash = {B}, but should between 0 and ' \
        'π*pitch_radius/tooth_count'
    assert ns > 0, f'Curve segments = {ns}, but should be > 0'
    
    m = 2*rp/z # Module, m
    p = π*m # Circular pitch, m
    rb = rp*cos(ψ) # Base radius, m
    ha = m # Addendum, m
    ra = rp + ha # Addendum radius, m
    hd = max(ha, rp - rb) # Dedendum, m (Maybe make into a parameter?)
    assert hd >= ha, f'Dedendum = {hd}, but should be >= module'
    assert hd >= rp - rb, f'Dedendum = {hd}, but should be >= ' \
        '(tooth_count*module/2) * (1 - cos(pressure_angle))'
    θr = π/z - B/(z*m) + 2*(tan(ψ) - ψ) # Root arc, rad
    Imax = sqrt((ra/rb)**2 - 1) # Involute parameter limit
    θi = Imax - atan(Imax) # Involute arc, rad
    
    red_block = Geometry()
    red_block.create_vertex(0, 0, 0)
    for i in range(curve_segments + 1):
        t = Imax*i/curve_segments
        r = rb*sqrt(1 + t**2)
        θ = t - atan(t)
        red_block.create_vertex(r*cos(θ), r*sin(θ), 0)
    for i in range(curve_segments + 1):
        θ = θi + (θr - 2*θi)*i/curve_segments
        red_block.create_vertex(ra*cos(θ), ra*sin(θ), 0)
    for i in range(curve_segments, -1, -1):
        t = Imax*i/curve_segments
        r = rb*sqrt(1 + t**2)
        θ = θr - (t - atan(t))
        red_block.create_vertex(r*cos(θ), r*sin(θ), 0)
    for i in range(curve_segments + 1):
        θ = θr + (2*π/z - θr)*i/curve_segments
        red_block.create_vertex((rp - hd)*cos(θ), (rp - hd)*sin(θ), 0)
    red_block.create_vertex(rb*cos(2*π/z), rb*sin(2*π/z), 0)
    for i in range(1, 3 + 4*ns):
        red_block.create_triangle(0, i, i + 1)
    
    red_block.select_vertices(-10, -10, -10, 10, 0.2, 10)
    red_block.extrude(0, 0, 1)
    
    red_block.select_triangles(-10, -10, -10, 0.7, 10, 10)
    red_block.extrude(0, 0, 2)
    
    green_block = Geometry()
    for x in [-1, 1]:
        for y in [-1, 1]:
            green_block.create_vertex(x, y, -1)
    green_block.create_triangle(0, 2, 1).create_triangle(1, 2, 3)
    green_block.select_vertices(-10, -10, -10, 10, 10, 10).extrude(0, 0, 2)
    green_block.t(3, 0, 0)
    
    blue_block = Geometry()
    for x in [-1, 1]:
        for y in [-1, 1]:
            blue_block.create_vertex(x, y, -1)
    blue_block.create_triangle(0, 1, 2).create_triangle(1, 3, 2)
    blue_block.select_vertices(-10, -10, -10, 10, 10, 10).extrude(0, 0, 2)
    blue_block.t(6, 0, 0)
    
    node_gear = Node('Gear Test')
    mesh_gear = node_gear.add_mesh('Gear Test')
    mesh_gear.add_primitive(red_block.pack(), material=Material('Red', '#f00'))
    
    node_ext = Node('Extrusion Test Blocks')
    mesh_ext = node_ext.add_mesh('Extrusion Test Blocks')
    mesh_ext.add_primitive(green_block.pack(),
        material=Material('Green', '#0f0'))
    mesh_ext.add_primitive(blue_block.pack(),
        material=Material('Blue', '#00f'))
