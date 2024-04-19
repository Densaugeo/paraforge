import cffi

ffi = cffi.FFI()

ffi.cdef('''
    uint32_t new_data_structure();
    uint32_t multiply_float(uint32_t index, float value);
    float get_float(uint32_t index);
''')

C = ffi.dlopen('target/debug/libparaforge.so')

index = C.new_data_structure()
print('Initial float value:', C.get_float(index))
C.multiply_float(index, 2.0)
print('Tried doubling it:', C.get_float(index))
C.multiply_float(index, 0.5)
print('Tried putting it back:', C.get_float(index))

print('What happens when I access a structure that doesn\'t exist?',
    C.get_float(4))

