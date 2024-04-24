import setuptools

with open('README.md', 'r') as fh:
    long_description = fh.read()

setuptools.setup(
    name='paraforge',
    version='0.0.3',
    author='Densaugeo',
    author_email='author@example.com',
    description='Evaluation of a Python-Rust architecture for a parametric modeling project',
    long_description=long_description,
    long_description_content_type='text/markdown',
    url='https://github.com/Densaugeo/paraforge',
    packages=['paraforge'],
    classifiers=[
        'Programming Language :: Python :: 3',
        'Programming Language :: Rust',
        #'License :: TBD',
        'Operating System :: POSIX :: Linux',
    ],
    python_requires='>=3.12',
    install_requires=[
        'cffi',
    ],
    include_package_data=True,
)
