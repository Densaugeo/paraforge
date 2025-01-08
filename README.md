# Paraforge

Evaluation of a Python-Rust architecture for a parametric modeling project.

## TODO

- Selection handling
  * Select all vtcs/tris
  * Every function that handles vtx/tri indices should check bounds
  * Clear selection
- Code cleanup
  * Create function for loading new script files into VM
    - Simplest way I can think of for allowing imports from any URL
    - Seems awkard to add and then import every file. Could allow loading a
      whole folder, or replace import with another function. A quick test shows
      import from folder like "from examples.feature_tests import *" seems to
      work - maybe create a load_package function that copies a folder in?
    - Another option would be trying to build something around requirements
      fiels and Python-style packaging
  * Figure out where I want to use u32 vs usize
  * Add a Forge class to Python to manage connections to Rust modules and
    make Paraforge's hidden state more intuitive
    - Debatable how useful manage multiple Rust-side modules really is,
      especially if I adopt WebAssembly for terminal use as well
    - However, it might be nice to have an object for acessing the full
      collection of GLTF objects at any given time
  * Need to properly support Scenes
  * Replace geometry packing with freeze mechanism?
    - Previously investigated a freeze mechanism to support caching and reuse of
      Nodes. Effort failed because Nodes cannot appear more than once in the
      node tree per spec.
    - Applying freezes to Node/Mesh/Geometry could still be useful, since they
      will be reused by cloning. Not MVP though.
    - Using a freeze mechanism on Geometries could avoid a memory copy if they
      don't have to be packed (should test this when I have better memory
      testing).
    - Freeze mechanism would be implemented on the Rust side, by storing freeze
      flags in Geometry structs (or in parallel arrays for GLTF structs).
    - Geometry and PackedGeometry could be merged.
- Basic geometries
  * Some spheres
  * Cylinder
  * Circle
  * Cone
  * Donut?
  * Check Blender for other geometries to consider
- UI
  * Adjust parameters / model and file names
  * Handle multiple models at once. I'm really going to need that for testing
  * 'Gen' shortcut functions need restoring - should be able to automatically
    load necessary python scripts and pass in args / kwargs
  * When I try to add a code editor - look into Monaco. Apparently MS packaged
    the insides of VSCode for bundling into web sites.
- Generator parameters apparently need a lot of work
  * Way of specifying metadata like bounds, step, display name
  * Automated enforcement of bounds
  * How to make sure metadata is well-formatted?
  * Made a serious attempt at this and it might be impossible/impractical.
    Decorators wreak havoc on LSP and type hints, Callable classes don't work
    with LSP at all, and MicroPython won't allow setting attributes on functions

## History of Design Decisions

- `Geometry.select()`
  * Used to be two functions: `.select_vtcs()` and `.select_tris()`
  * Iterating over the vtcs of a tri selection requires detecting duplicate,
    and I could not find a way to do that without additional memory allocations.
  * Handling vtx/tri selection meant 2 code paths in nearly every vtx
    manipulation function.
  * Actually selecting tris required significant search overhead, beyond what is
    is required for selecting vtcs, because tri selection works by first
    selecting vtcs and then searching for contained tris.
  * The biggest reason for keeping tris was for cases like removing one half of
    a 2-sided face.
    - However, this can be done with vtx-based helpers.
    - While tri-based functions could do this more efficiently, the overhead of
      selecting the tris first would likely have removed any perofrmance
      benefit.

## License

SSPL
