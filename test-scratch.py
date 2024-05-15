import paraforge

paraforge.new_data_structure()
print('Serialization #1:', paraforge.serialize_test())

try:
    print('Call with bad index: ', end='')
    paraforge.multiply_float(4, 4.5)
    print('Error: success') # This shoudn't succeed
except Exception as e:
    print(repr(e))

paraforge.multiply_float(0, 2.0)
print('Serialization #2:', paraforge.serialize_test())

paraforge.init()
print('Real serialization test:', paraforge.serialize())
