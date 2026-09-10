#!/bin/bash
# Atualização mensal do Antessala. Agendamento sugerido (crontab do usuário
# que roda a aplicação, nunca root):
#
#   0 3 10 * * /caminho/para/antessala/deploy/monthly_sync.sh
#
# Cada fonte é uma etapa independente que registra OK ou FALHA, e o código de
# saída é o número de etapas que falharam — uma rotina que escreve "sucesso"
# sem ter baixado nada é pior do que nenhuma rotina.
set -uo pipefail

APP="${APP:-$(cd "$(dirname "$0")/.." && pwd)}"
C="${CONTAINER:-antessala_backend}"
LOG="$APP/data/monthly_sync.log"
FALHAS=0

log(){ echo "$(date +'%Y-%m-%d %H:%M:%S') | $*" >> "$LOG"; }
etapa(){
  local nome="$1"; shift
  log "--- $nome: iniciando"
  if docker exec "$C" "$@" >> "$LOG" 2>&1; then
    log "--- $nome: OK"
  else
    log "--- $nome: FALHA (codigo $?)"
    FALHAS=$((FALHAS+1))
  fi
}

mkdir -p "$APP/data"
log "=============================================================="
log "Sincronizacao mensal iniciada"

# 1. e-Agendas: pacote público da CGU, baixado só se o ETag mudou.
#    Inclui canonicalização de entidades e deduplicação.
etapa "e-Agendas" python -m saril.pipeline sync-cgu
# 2. Sanções CEIS/CNEP (exige TRANSPARENCIA no .env).
etapa "Sancoes" python -m saril.pipeline ingest-sanctions
# 3. DOU: busca dirigida às entidades mais frequentes.
etapa "DOU" python -m saril.pipeline ingest-dou --top 40 --max-pages 2 --delay 0.8
# 4. Cruzamento e publicação do snapshot lido pela API. A publicação é
#    recusada se a base encolher mais de 50% — proteção contra banco vazio.
etapa "Correlacao" python -m saril.pipeline correlate
etapa "Publicacao" python -m saril.pipeline publish

if [ "$FALHAS" -eq 0 ]; then
  log "Sincronizacao concluida SEM FALHAS"
else
  log "Sincronizacao concluida com $FALHAS ETAPA(S) COM FALHA"
fi
log "=============================================================="
exit "$FALHAS"
