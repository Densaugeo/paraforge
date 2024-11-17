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
  * Lit components. Really hope those hope with cutting down on re-rendering
    complications
  * 'Gen' shortcut functions need restoring - should be able to automatically
    load necessary python scripts and pass in args / kwargs
- Generator parameters apparently need a lot of work
  * Way of specifying metadata like bounds, step, display name
  * Automated enforcement of bounds
  * How to make sure metadata is well-formatted?

## License

SSPL
