import paraforge
from paraforge import Material

def gen_first_model():
    node_handle = paraforge.add_node_to_scene(0, 'Fortress Wall Battlement')
    mesh_handle = paraforge.add_mesh_to_node(node_handle,
        'Fortress Wall Battlement')
    
    red_material = Material('Red', '#f00', roughness=0.5)
    black_material = Material('Black', r=0.1, g=0.1, b=0.1, roughness=0.5)
    
    red_block_handle = paraforge.new_geometry_cube()
    paraforge.geometry_scale(red_block_handle, 1.0, 0.25, 0.3)
    paraforge.geometry_translate(red_block_handle, 0.0, -0.75, 4.1)
    packed_red_block = paraforge.geometry_pack(red_block_handle)
    paraforge.mesh_add_primitive(mesh_handle, packed_red_block,
        red_material.handle)
    
    black_block_handle = paraforge.new_geometry_cube()
    paraforge.geometry_scale(black_block_handle, 0.5, 0.25, 0.3)
    paraforge.geometry_translate(black_block_handle, 0.0, -0.75, 4.7)
    paraforge.geometry_select_triangles(black_block_handle, -10.0, -10.0, 4.3,
        10.0, 10.0, 4.5)
    paraforge.geometry_delete_triangles(black_block_handle)
    packed_black_block = paraforge.geometry_pack(black_block_handle)
    paraforge.mesh_add_primitive(mesh_handle, packed_black_block,
        black_material.handle)
