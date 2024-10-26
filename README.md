# Paraforge

Evaluation of a Python-Rust architecture for a parametric modeling project.

## TODO

- Selection handling
  * Select all vtcs/tris
  * Clear selection
  * Geometry operations update selection in sane ways
  * TRS transforms apply selection
- Code cleanup
  * Abbreviations: tri, vtx, prim
  * Try to de-abstract the many layers to get from a top-level Python call to
    actual geometry code. The Python wrappers for wasm_calls are gone now! Can I
    remove more layers?
  * Change selection data structure from Vector to HashSet
  * Naming standardization: Methods that add an existing object should be named
    .add_\*, methods that create a new object should be named .new_\*
- Basic geometries
  * Plane
  * Some spheres
  * Cylinder
  * Circle
  * Cone
  * Donut?
  * Check Blender for other geometries to consider
- UI
  * Adjust parameters / model and file names
  * Handle multiple models at once. I'm really going to need that for testing
- Debug tools
  * Vtx count
  * Get vtx
  * Set vtx
  * Tri count
  * Get tri
  * Set tri
- Core functions
  * Rotate vtcs
  * Add existing node, mesh, meshprimitive
  * Nodes should not always be descendants of scene 0 - necessary to support
    import generators

## License

SSPL
