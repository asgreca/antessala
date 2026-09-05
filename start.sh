#!/bin/bash
set -e

echo "============================================================"
echo " SARIL — Auditoria Contínua de Lobby (e-Agendas x DOU)"
echo "============================================================"

ROOT="/Users/macmini/apps/CGU"
PYTHON_VENV="$ROOT/backend_python/venv/bin"

if [ ! -f "$ROOT/data/saril.duckdb" ]; then
  echo "AVISO: data/saril.duckdb não existe. Rode a ingestão antes:"
  echo "  cd $ROOT/backend_python"
  echo "  ./venv/bin/python -m saril.pipeline all --top 40"
  echo ""
fi

echo "[1/2] Backend SARIL (FastAPI + DuckDB) na porta 8000..."
cd "$ROOT/backend_python"
"$PYTHON_VENV/uvicorn" main:app --port 8000 --reload &
BACKEND_PID=$!

echo "[2/2] Frontend React + Vite na porta 5173..."
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo "------------------------------------------------------------"
echo "API SARIL:        http://localhost:8000"
echo "Documentação:     http://localhost:8000/docs"
echo "Saúde da base:    http://localhost:8000/api/v1/health"
echo "Interface:        http://localhost:5173"
echo "------------------------------------------------------------"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
