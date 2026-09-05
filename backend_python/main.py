"""Ponto de entrada do backend SARIL.

    uvicorn main:app --port 8000

A implementação vive em saril/api.py; este módulo existe para preservar o
comando de inicialização já usado pelo start.sh.
"""
import os
from pathlib import Path

# Carrega expressamente o arquivo /Users/macmini/apps/CGU/.env para o os.environ
env_path = Path("/Users/macmini/apps/CGU/.env")
if env_path.exists():
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("\"'")
                if k not in os.environ:
                    os.environ[k] = v

from saril.api import app  # noqa: F401
