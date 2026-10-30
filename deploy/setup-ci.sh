#!/usr/bin/env bash
# One-time setup for the deploy job in .github/workflows/ci.yml. Run from the repo root on a machine
# where `exo` and `gh` are logged in and ~/.ssh/exoscale_gatekeeper can reach the server.
# Nothing secret is printed; private material goes straight into GitHub secrets.
set -euo pipefail

REPO=abdulmoeez1225/European-Health-Data-Space-hackathon
HOST=85.217.173.14
SITE_URL=https://85.217.173.14.sslip.io
ADMIN_KEY=~/.ssh/exoscale_gatekeeper
ROLE=gatekeeper-ci

# 1. Exoscale API key that can only edit security-group rules.
if ! exo iam role show "$ROLE" >/dev/null 2>&1; then
  exo iam role create "$ROLE" \
    --description "GitHub Actions: open/close SSH rule on the gatekeeper security group" \
    --policy '{"default-service-strategy":"deny","services":{"compute":{"type":"rules","rules":[{"expression":"operation in [\"add-rule-to-security-group\", \"delete-rule-from-security-group\", \"get-security-group\", \"list-security-groups\", \"get-operation\", \"list-zones\"]","action":"allow"},{"expression":"true","action":"deny"}]}}}' \
    >/dev/null
  echo "created Exoscale role $ROLE"
fi
api_key_json=$(exo iam api-key create "$ROLE-github" "$ROLE" -O json)
python3 -c 'import json,sys; print((lambda d: d.get("key") or d["Key"])(json.load(sys.stdin)), end="")' <<<"$api_key_json" | gh secret set EXOSCALE_API_KEY -R "$REPO"
python3 -c 'import json,sys; print((lambda d: d.get("secret") or d["Secret"])(json.load(sys.stdin)), end="")' <<<"$api_key_json" | gh secret set EXOSCALE_API_SECRET -R "$REPO"
unset api_key_json

# 2. SSH key that can do exactly one thing on the server: run the deploy.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
ssh-keygen -q -t ed25519 -N "" -C "github-actions-deploy" -f "$tmp/key"
entry="restrict,command=\"sudo /usr/local/bin/gatekeeper-deploy\" $(cat "$tmp/key.pub")"
ssh -i "$ADMIN_KEY" "ubuntu@$HOST" "sed -i '/github-actions-deploy\$/d' ~/.ssh/authorized_keys && echo '$entry' >> ~/.ssh/authorized_keys"
gh secret set DEPLOY_SSH_KEY -R "$REPO" <"$tmp/key"

# 3. Non-secret settings.
gh variable set DEPLOY_HOST -R "$REPO" --body "$HOST"
gh variable set SITE_URL -R "$REPO" --body "$SITE_URL"
gh variable set DEPLOY_KNOWN_HOSTS -R "$REPO" --body "$(ssh-keyscan -t ed25519 "$HOST" 2>/dev/null)"

echo "CI deploy configured:"
gh secret list -R "$REPO"
gh variable list -R "$REPO"
