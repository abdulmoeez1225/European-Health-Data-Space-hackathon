"""LLM access for reading request text. Patient data is never sent.

Backends, chosen by GATEKEEPER_LLM (default "auto"):
- "openai": any OpenAI-compatible chat-completions endpoint (Gemini, Groq, OpenRouter, Mistral,
            Cerebras, a local Ollama) via GATEKEEPER_LLM_BASE_URL, GATEKEEPER_LLM_API_KEY, GATEKEEPER_LLM_MODEL
- "api":    Anthropic API via ANTHROPIC_API_KEY (or an `ant auth login` profile)
- "cli":    the local `claude` CLI, using the signed-in Claude subscription
- "rules":  no LLM; callers fall back to deterministic rules
"auto" picks openai if a base URL and model are set, else api if ANTHROPIC_API_KEY is set, else cli if
`claude` is on PATH, else rules.

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

import httpx
from pydantic import BaseModel, ValidationError

from backend.config import settings

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
    config = settings()
    if config.llm != "auto":
        return config.llm
    if config.llm_base_url and config.llm_model:
        return "openai"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "api"
    if shutil.which("claude"):
        return "cli"
    return "rules"


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def _model_id(backend: str) -> str:
    return {"api": API_MODEL, "cli": CLI_MODEL, "openai": settings().llm_model}.get(backend, backend)


def _cache_key(system: str, prompt: str, schema: type[BaseModel], backend: str, reading: int) -> str:
    payload = json.dumps(
        [system, prompt, schema.model_json_schema(), backend, _model_id(backend), EFFORT, reading],
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:32]


def _strict_schema(node: object) -> object:
    """Strict variant of a pydantic schema for the CLI and OpenAI-compatible endpoints.

    Every object lists all its properties as required and allows no others, otherwise the
    model may answer with a differently shaped object. `discriminator` is not accepted by the
    CLI's validator; the `kind` constants already select the variant.
    """
    if isinstance(node, list):
        return [_strict_schema(v) for v in node]
    if not isinstance(node, dict):
        return node
    strict: dict[str, Any] = {k: _strict_schema(v) for k, v in node.items() if k not in ("discriminator", "default")}
    if "properties" in strict:
        strict["required"] = list(strict["properties"])
        strict["additionalProperties"] = False
    return strict


def _call_cli(system: str, prompt: str, schema: type[BaseModel]) -> dict:
    command = [
        "claude", "-p", prompt,
        "--system-prompt", system,
        "--output-format", "json",
        "--json-schema", json.dumps(_strict_schema(schema.model_json_schema())),
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


def _http_client() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT_S)


def _json_content(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    parsed: dict[str, Any] = json.loads(text)
    return parsed


def _call_openai(system: str, prompt: str, schema: type[BaseModel]) -> dict:
    """Chat completions with a strict JSON schema; JSON mode plus the schema in the prompt if unsupported."""
    config = settings()
    if not (config.llm_base_url and config.llm_model):
        raise LlmUnavailable("GATEKEEPER_LLM_BASE_URL and GATEKEEPER_LLM_MODEL must be set")
    strict = _strict_schema(schema.model_json_schema())
    schema_format = {"type": "json_schema", "json_schema": {"name": schema.__name__, "schema": strict, "strict": True}}
    json_mode_system = f"{system}\n\nReply with one JSON object that matches this JSON Schema:\n{json.dumps(strict)}"
    headers = {"Authorization": f"Bearer {config.llm_api_key}"} if config.llm_api_key else {}
    url = config.llm_base_url.rstrip("/") + "/chat/completions"

    with _http_client() as client:
        for system_text, response_format in ((system, schema_format), (json_mode_system, {"type": "json_object"})):
            body = {
                "model": config.llm_model,
                "temperature": 0,
                "messages": [{"role": "system", "content": system_text}, {"role": "user", "content": prompt}],
                "response_format": response_format,
            }
            try:
                response = client.post(url, json=body, headers=headers)
            except httpx.HTTPError as error:
                raise LlmUnavailable(f"LLM endpoint unreachable: {error}") from error
            if response.status_code == 400 and response_format is schema_format:
                continue
            if response.status_code != 200:
                raise LlmUnavailable(f"LLM endpoint returned {response.status_code}: {response.text[:300]}")
            choice = response.json()["choices"][0]
            if choice.get("finish_reason") == "content_filter":
                raise LlmRefused("the model declined to process this request")
            try:
                return _json_content(choice["message"]["content"] or "")
            except (json.JSONDecodeError, IndexError) as error:
                raise LlmUnavailable(f"LLM returned invalid JSON: {error}") from error
    raise LlmUnavailable("LLM endpoint rejected both structured-output modes")


def _call(backend: str, system: str, prompt: str, schema: type[BaseModel]) -> dict:
    if backend == "openai":
        return _call_openai(system, prompt, schema)
    if backend == "cli":
        return _call_cli(system, prompt, schema)
    if backend == "api":
        return _call_api(system, prompt, schema)
    raise LlmUnavailable("no LLM backend configured")


def ask[T: BaseModel](
    system: str, prompt: str, schema: type[T], *, use_cache: bool = True, reading: int = 0
) -> tuple[T, bool]:
    """Structured answer from the configured backend. Returns (answer, served_from_cache).

    `reading` numbers independent readings of the same prompt; each is cached separately.
    A failed or malformed answer is retried once; a refusal is not.
    """
    backend = backend_name()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(_cache_key(system, prompt, schema, backend, reading))
    if use_cache and path.exists():
        return schema.model_validate_json(path.read_text()), True

    for attempt in (1, 2):
        try:
            answer = schema.model_validate(_call(backend, system, prompt, schema))
            break
        except LlmRefused:
            raise
        except (LlmUnavailable, ValidationError, subprocess.TimeoutExpired) as error:
            if attempt == 2 or backend == "rules":
                raise LlmUnavailable(str(error)[:300]) from error

    path.write_text(answer.model_dump_json(indent=2))
    return answer, False
