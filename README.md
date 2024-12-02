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
  * Will probably need to make more GLTF objects immutable to allow
    deduplication, especially when generators are calling other generators
  * Proposal for enabling composition with deduplication:
    - Python-side objects don't initially talk to Rust
    - Each Python-side GLTF object has a .pack() method that generates the Rust
      side object, and also freezes the Python object
    - .pack() calls are recursive - Node.pack() would .pack() all the relevant
      materials, geometries, etc..
    - Paraforge generators get a decorator, which will ensure .pack() is always
      called on the result
    - This decorator could later handle caching generator calls, since generator
      argument are passed by value and the results are immutable
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
  * Made a serious attempt at this and it might be impossible/impractical.
    Decorators wreak havoc on LSP and type hints, Callable classes don't work
    with LSP at all, and MicroPython won't allow setting attributes on functions

## License

SSPL
