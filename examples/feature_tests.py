from math import *

from paraforge import *

π = pi

def gen_gear(tooth_count: int = 16, pitch_radius: float = 1.0,
pressure_angle: float = 0.349066, backlash: float = 0.01,
curve_segments: int = 5) -> Node:
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
    red_block.create_vtx(0, 0, 0)
    for i in range(ns + 1):
        t = Imax*i/ns
        r = rb*sqrt(1 + t**2)
        θ = t - atan(t)
        red_block.create_vtx(r*cos(θ), r*sin(θ), 0)
    for i in range(ns + 1):
        θ = θi + (θr - 2*θi)*i/ns
        red_block.create_vtx(ra*cos(θ), ra*sin(θ), 0)
    for i in range(ns, -1, -1):
        t = Imax*i/ns
        r = rb*sqrt(1 + t**2)
        θ = θr - (t - atan(t))
        red_block.create_vtx(r*cos(θ), r*sin(θ), 0)
    for i in range(ns + 1):
        θ = θr + (2*π/z - θr)*i/ns
        red_block.create_vtx((rp - hd)*cos(θ), (rp - hd)*sin(θ), 0)
    red_block.create_vtx(rb*cos(2*π/z), rb*sin(2*π/z), 0)
    for i in range(1, red_block.get_vtx_count() - 1):
        red_block.create_tri(0, i, i + 1)
    
    red_block.select_vtcs(-10, -10, -10, 10, 10, 10)
    red_block.extrude(0, 0, 1)
    
    tooth_mesh = Mesh('Gear Tooth')
    tooth_mesh.new_prim(red_block.pack(), material=Material('Bronze', '#984',
        metallicity=1.0, roughness=0.5))
    
    gear = Node('Gear')
    for i in range(z):
        gear.add(Node(mesh=tooth_mesh).rz(2*π/z*i))
    return gear

def gen_extrusion() -> Node:
    geometry = Geometry()
    for x in [-1, 1]:
        for y in [-1, 1]:
            geometry.create_vtx(x, y, -1)
    geometry.create_tri(0, 2, 1).create_tri(1, 2, 3)
    geometry.select_vtcs(-10, -10, -10, 10, 10, 10).extrude(0, 0, 2)
    
    ext = Node('Extrusion Test Block')
    ext.mesh = Mesh()
    ext.mesh.new_prim(geometry.pack(), material=Material('Green', '#0f0'))
    return ext

def gen_extrusion_inside_out() -> Node:
    geometry = Geometry()
    for x in [-1, 1]:
        for y in [-1, 1]:
            geometry.create_vtx(x, y, -1)
    geometry.create_tri(0, 1, 2).create_tri(1, 3, 2)
    geometry.select_tris(-10, -10, -10, 10, 10, 10).extrude(0, 0, 2)
    
    ext = Node('Extrusion Test Block')
    ext.mesh = Mesh()
    ext.mesh.new_prim(geometry.pack(), material=Material('Blue' , '#00f'))
    return ext
