"""Ponto de Entrada Principal da API Backend (FastAPI).

FUNÇÃO NO PROJETO:
- Atua como o script principal para inicialização da API RESTful do Antessala via Uvicorn.
- Garante o carregamento automático de variáveis de ambiente do arquivo `.env` (como chaves de IA/LLM e configurações de banco).
- Re-exporta a aplicação FastAPI `app` do módulo `saril.api` para manter compatibilidade com scripts de inicialização (ex: `start.sh`).

COMO FUNCIONA:
1. Localiza e lê o arquivo `.env` na raiz do projeto, populando `os.environ`.
2. Importa e expõe a instância `app` do FastAPI configurada em `saril.api.py`.
3. Servido normalmente pelo comando: `uvicorn main:app --host 0.0.0.0 --port 8000`.
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
