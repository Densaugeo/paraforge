import cffi, ctypes

ffi = cffi.FFI()

ffi.cdef('''
    uint64_t model_pointer();
    uint64_t model_size();
    uint32_t new_data_structure();
    uint32_t multiply_float(uint32_t index, float value);
    uint32_t serialize();
''')

C = ffi.dlopen('target/debug/libparaforge.so')

C.new_data_structure()
print('Serialization return code:', C.serialize())
print('Output:', ctypes.string_at(C.model_pointer(), C.model_size()))

print('Call with bad index:', C.multiply_float(4, 4.5))

C.multiply_float(0, 2.0)
print('Serialization #2 return code:', C.serialize())
print('Output:', ctypes.string_at(C.model_pointer(), C.model_size()))
