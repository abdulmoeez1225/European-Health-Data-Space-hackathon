#!/usr/bin/env bash
# Runs eval.run_eval on the server, inside the live image with the live /etc/gatekeeper.env,
# in a throwaway container: the running site, its state and its LLM cache are not touched.
# Usage (on the server, as root): eval-live.sh [run_eval arguments]
set -euo pipefail
APP=/opt/gatekeeper

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp -r "$APP/eval" "$work/eval"
chown -R 10001 "$work"

docker run --rm \
  --env-file /etc/gatekeeper.env \
  -e GATEKEEPER_STATE_DIR=/tmp/state \
  -v "$work/eval:/app/eval" \
  gatekeeper:latest \
  python -m eval.run_eval "$@" >/dev/null

cat "$work/eval/results.md"
