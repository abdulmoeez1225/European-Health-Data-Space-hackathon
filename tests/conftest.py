import os

# Tests must not pick up a developer's .env (LLM keys, backend choice).
os.environ["GATEKEEPER_ENV_FILE"] = ""
