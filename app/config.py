"""Runtime settings, read from environment variables (prefix GATEKEEPER_)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent

LlmChoice = Literal["auto", "api", "cli", "rules"]


def _origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Settings(BaseModel):
    llm: str = "auto"
    api_model: str = "claude-opus-5-5"
    cli_model: str = "sonnet"
    llm_effort: Literal["low", "medium", "high", "xhigh", "max"] = "low"
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
