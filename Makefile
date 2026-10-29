PY := .venv/bin/python

.PHONY: install run test eval eval-fresh eval-hidden eval-stress lint typecheck check frontend dev-frontend

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

eval-stress:
	$(PY) -m eval.stress.run_stress --runs 1

frontend:
	cd frontend && npm ci && npm run build

dev-frontend:
	cd frontend && npm run dev
