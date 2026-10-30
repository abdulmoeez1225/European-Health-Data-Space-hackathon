PY := .venv/bin/python
LIVE_HOST ?= ubuntu@85.217.173.14
LIVE_KEY ?= ~/.ssh/exoscale_gatekeeper
LIVE_EVAL ?= --runs 3 --no-cache --set main

.PHONY: install run test eval eval-fresh eval-hidden eval-german eval-stress eval-live lint typecheck check frontend dev-frontend

install:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements-dev.txt

run:
	@test -f frontend/out/index.html || $(MAKE) frontend
	.venv/bin/uvicorn backend.api:app --port 8000

test:
	$(PY) -m pytest tests -q

lint:
	$(PY) -m ruff check .

typecheck:
	$(PY) -m mypy backend

check: lint typecheck test

eval:
	$(PY) -m eval.run_eval --runs 3 --set main

eval-fresh:
	$(PY) -m eval.run_eval --runs 3 --no-cache --set main

eval-hidden:
	$(PY) -m eval.run_eval --runs 1 --set hidden

eval-german:
	$(PY) -m eval.run_eval --runs 3 --set german

eval-stress:
	$(PY) -m eval.stress.run_stress --runs 1

# The same evaluation on the Exoscale server, with the deployed image and its LLM settings.
# Defaults to eval-fresh; narrow it with e.g. LIVE_EVAL="--runs 1 --no-cache --only R01,R02".
eval-live:
	ssh -i $(LIVE_KEY) $(LIVE_HOST) 'sudo bash -s -- $(LIVE_EVAL)' < deploy/eval-live.sh

frontend:
	cd frontend && npm ci && npm run build

dev-frontend:
	cd frontend && npm run dev
