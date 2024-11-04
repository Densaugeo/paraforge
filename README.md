# Paraforge

Evaluation of a Python-Rust architecture for a parametric modeling project.

## TODO

- Selection handling
  * Select all vtcs/tris
  * Every function that handles vtx/tri indices should check bounds
  * Clear selection
  * Geometry operations update selection in sane ways
  * TRS transforms apply selection
- Code cleanup
  * Figure out where I want to use u32 vs usize
  * Add a Forge class to Python to manage connections to Rust modules and
    make Paraforge's hidden state more intuitive
  * Need to properly support Scenes
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
- Core functions
  * Test multiple runs in one wasm instance

## License

SSPL
