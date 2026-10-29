"""LLM access for reading request text. Patient data is never sent.

Backends, chosen by GATEKEEPER_LLM (default "auto"):
- "api":   Anthropic API via ANTHROPIC_API_KEY (or an `ant auth login` profile)
- "cli":   the local `claude` CLI, using the signed-in Claude subscription
- "rules": no LLM; callers fall back to deterministic rules
"auto" picks api if ANTHROPIC_API_KEY is set, else cli if `claude` is on PATH, else rules.

Answers are cached on disk by a hash of the prompt, so the same request always
gets the same reading.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.config import settings

CACHE_DIR = settings().cache_dir
API_MODEL = settings().api_model
CLI_MODEL = settings().cli_model
EFFORT = settings().llm_effort
TIMEOUT_S = 90


class LlmUnavailable(RuntimeError):
    pass


class LlmRefused(LlmUnavailable):
    """The model's safety system declined the request text."""


def backend_name() -> str:
    choice = settings().llm
    if choice != "auto":
        return choice
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "api"
    if shutil.which("claude"):
        return "cli"
    return "rules"


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def _cache_key(system: str, prompt: str, schema: type[BaseModel]) -> str:
    payload = json.dumps([system, prompt, schema.model_json_schema()], sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()[:32]


def _cli_schema(node: object) -> object:
    """Strict variant of a pydantic schema for the CLI.

    Every object lists all its properties as required and allows no others, otherwise the
    model may answer with a differently shaped object. `discriminator` is not accepted by the
    CLI's validator; the `kind` constants already select the variant.
    """
    if isinstance(node, list):
        return [_cli_schema(v) for v in node]
    if not isinstance(node, dict):
        return node
    strict: dict[str, Any] = {k: _cli_schema(v) for k, v in node.items() if k not in ("discriminator", "default")}
    if "properties" in strict:
        strict["required"] = list(strict["properties"])
        strict["additionalProperties"] = False
    return strict


def _call_cli(system: str, prompt: str, schema: type[BaseModel]) -> dict:
    command = [
        "claude", "-p", prompt,
        "--system-prompt", system,
        "--output-format", "json",
        "--json-schema", json.dumps(_cli_schema(schema.model_json_schema())),
        "--model", CLI_MODEL,
        "--effort", EFFORT,
        "--tools", "",
        "--no-session-persistence",
        "--setting-sources", "",
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=TIMEOUT_S, cwd=CACHE_DIR)
    try:
        envelope = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise LlmUnavailable(f"claude CLI failed: {completed.stderr.strip()[:300]}") from error
    if envelope.get("stop_reason") == "refusal":
        raise LlmRefused("the model declined to process this request")
    if envelope.get("is_error") or "structured_output" not in envelope:
        raise LlmUnavailable(f"claude CLI returned no structured output: {str(envelope.get('result'))[:300]}")
    output: dict[str, Any] = envelope["structured_output"]
    return output


def _call_api(system: str, prompt: str, schema: type[BaseModel]) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    try:
        response = client.messages.parse(
            model=API_MODEL,
            max_tokens=16000,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_format=schema,
            output_config={"effort": EFFORT},
        )
    except anthropic.APIError as error:
        raise LlmUnavailable(f"Anthropic API error: {error}") from error
    if response.stop_reason == "refusal":
        raise LlmRefused("the model declined to process this request")
    if response.parsed_output is None:
        raise LlmUnavailable(f"Anthropic API returned no parsed output (stop_reason={response.stop_reason})")
    dumped: dict[str, Any] = response.parsed_output.model_dump(mode="json")
    return dumped


def ask[T: BaseModel](system: str, prompt: str, schema: type[T], *, use_cache: bool = True) -> tuple[T, bool]:
    """Structured answer from the configured backend. Returns (answer, served_from_cache)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = _cache_key(system, prompt, schema)
    path = _cache_path(key)
    if use_cache and path.exists():
        return schema.model_validate_json(path.read_text()), True

    backend = backend_name()
    if backend == "cli":
        raw = _call_cli(system, prompt, schema)
    elif backend == "api":
        raw = _call_api(system, prompt, schema)
    else:
        raise LlmUnavailable("no LLM backend configured")

    answer = schema.model_validate(raw)
    path.write_text(answer.model_dump_json(indent=2))
    return answer, False
