PY=python3.12
TEST=test.py
PYTEST_ARGS=--verbosity 2 --tb short

build:
	cd rust && cargo build --release --target wasm32-unknown-unknown
	ln -sf ../rust/target/wasm32-unknown-unknown/release/paraforge.wasm paraforge/paraforge.wasm

test-scratch:
	$(PY) test-scratch.py

test-all:
	./test-all.sh

test:
	rm -rf test-temp
	. venv-$(PY)/bin/activate; $(PY) -u -m pytest $(PYTEST_ARGS) $(TEST)

install-dev:
	chmod 775 test-all.sh
	$(PY) -m venv venv-$(PY)
	. venv-$(PY)/bin/activate; $(PY) -m pip install pytest wasmtime

package:
	$(PY) -m pip install --user --upgrade setuptools wheel
	$(PY) setup.py sdist bdist_wheel

upload:
	$(PY) -m pip install --user --upgrade twine
	$(PY) -m twine upload dist/*
	# Remove keyring, otherwise it will nag about passwords every time I use pip
	$(PY) -m pip uninstall -y keyring

clean:
	cd rust && cargo clean
	rm -rf paraforge/libparaforge.so build dist paraforge/__pycache__ paraforge.egg-info __pycache__ test-temp
