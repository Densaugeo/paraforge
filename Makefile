PY=python3.12
TEST=test.py
PYTEST_ARGS=--verbosity 2 --tb short

build:
	cd rust && cargo build --release --target wasm32-unknown-unknown
	ln -sf ../rust/target/wasm32-unknown-unknown/release/paraforge.wasm paraforge/paraforge.wasm
	
	python javascript/icons/build-svg-icons.py
	
	# Can't use symlinks for these because npm won't follow them
	cp -f rust/target/wasm32-unknown-unknown/release/paraforge.wasm javascript/paraforge-rust.wasm
	cp -f paraforge/__init__.py javascript/__init__.py

test-scratch:
	$(PY) test-scratch.py

test-all:
	./test-all.sh

test:
	rm -rf test-temp
	venv-$(PY)/bin/python -u -m pytest $(PYTEST_ARGS) $(TEST)

test-manual: test.pem
	cd test-files && npm update
	
	@printf '\n\033[38;2;0;255;0m!!!! '
	@printf 'Run manual tests by visiting pages served here:'
	@printf ' !!!!\033[0m\n\n'
	
	cd test-files && ../venv-$(PY)/bin/python -m reloadserver -c ../test.pem

install-dev:
	chmod 775 test-all.sh
	$(PY) -m venv venv-$(PY)
	venv-$(PY)/bin/python -m pip install --upgrade pip
	venv-$(PY)/bin/python -m pip install pytest wasmtime reloadserver
	cd test-files && npm install
	
	# Only way to silence python linter spam is to remove the relevant
	# modules from the host. Does that mean the LSP isn't using the venv?
	# Not sure if there's any way to make the LSP use the venv
	python -m pip uninstall pyflakes
	python -m pip uninstall pycodestyle

package:
	$(PY) -m pip install --user --upgrade setuptools wheel
	$(PY) setup.py sdist bdist_wheel

upload:
	$(PY) -m pip install --user --upgrade twine
	$(PY) -m twine upload dist/*
	# Remove keyring, otherwise it will nag about passwords every time I use pip
	$(PY) -m pip uninstall -y keyring

publish-npm:
	cd javascript && npm publish

test.pem:
	openssl req -x509 -out test.pem -keyout test.pem -newkey rsa:3072 \
		-nodes -sha256 -subj '/CN=test' -days 10000

clean:
	cd rust && cargo clean
	rm -rf paraforge/libparaforge.so build dist paraforge/__pycache__ paraforge.egg-info __pycache__ test-temp
	rm -rf javascript/paraforge-rust.wasm javascript/__init__.py
