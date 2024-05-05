#!/bin/bash
set -euf -o pipefail

make test PY=python3.12
make test PY=python3.12
make test PY=python3.13
make test PY=python3.13
