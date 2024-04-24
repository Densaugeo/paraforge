PY=python3.12

build:
	cargo build --release
	ln -sf ../target/release/libparaforge.so paraforge/libparaforge.so

test:
	$(PY) test.py

package:
	$(PY) -m pip install --user --upgrade setuptools wheel
	$(PY) setup.py sdist bdist_wheel

upload:
	$(PY) -m pip install --user --upgrade twine
	$(PY) -m twine upload dist/*
	# Remove keyring, otherwise it will nag about passwords every time I use pip
	$(PY) -m pip uninstall -y keyring

clean:
	cargo clean
	rm -rf paraforge/libparaforge.so build dist paraforge/__pycache__ paraforge.egg-info __pycache__
