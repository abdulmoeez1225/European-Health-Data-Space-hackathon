"""Runtime settings, read from environment variables (prefix GATEKEEPER_).

A `.env` file in the project root (see `.env.example`) is loaded at startup; variables
already set in the environment, as on a hosting platform, take precedence over it.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent

LlmChoice = Literal["auto", "openai", "api", "cli", "rules"]


def _load_env_file() -> None:
    """Copy KEY=VALUE lines from the env file into os.environ without overriding what is set.

    GATEKEEPER_ENV_FILE chooses another file; an empty value disables loading (used by tests).
    """
    path = Path(os.environ.get("GATEKEEPER_ENV_FILE", ROOT / ".env"))
    if not str(path) or not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_env_file()


def _origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Settings(BaseModel):
    llm: LlmChoice = "auto"
    api_model: str = "claude-opus-5-5"
    cli_model: str = "sonnet"
    llm_effort: Literal["low", "medium", "high", "xhigh", "max"] = "low"
    llm_readings: int = 3
    llm_max_rpm: int = 0
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_deadline_s: float = 40.0
    data_dir: Path = ROOT / "data"
    state_dir: Path = ROOT / "state"
    cache_dir: Path = ROOT / ".cache" / "llm"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    log_level: str = "INFO"

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Settings:
        source = os.environ if env is None else env
        values: dict[str, object] = {}
        for field, name in (
            ("llm", "GATEKEEPER_LLM"),
            ("api_model", "GATEKEEPER_API_MODEL"),
            ("cli_model", "GATEKEEPER_CLI_MODEL"),
            ("llm_effort", "GATEKEEPER_LLM_EFFORT"),
            ("llm_readings", "GATEKEEPER_LLM_READINGS"),
            ("llm_max_rpm", "GATEKEEPER_LLM_MAX_RPM"),
            ("llm_base_url", "GATEKEEPER_LLM_BASE_URL"),
            ("llm_api_key", "GATEKEEPER_LLM_API_KEY"),
            ("llm_model", "GATEKEEPER_LLM_MODEL"),
            ("llm_deadline_s", "GATEKEEPER_LLM_DEADLINE_S"),
            ("data_dir", "GATEKEEPER_DATA_DIR"),
            ("state_dir", "GATEKEEPER_STATE_DIR"),
            ("cache_dir", "GATEKEEPER_CACHE_DIR"),
            ("log_level", "GATEKEEPER_LOG_LEVEL"),
        ):
            if source.get(name):
                values[field] = source[name]
        if source.get("GATEKEEPER_CORS_ORIGINS"):
            values["cors_origins"] = _origins(source["GATEKEEPER_CORS_ORIGINS"])
        return cls.model_validate(values)


def settings() -> Settings:
    """Current settings. Re-read on every call so tests and operators can change the environment."""
    return Settings.from_env()
