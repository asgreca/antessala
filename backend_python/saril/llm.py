"""Integração com Inteligência Artificial / LLM (DeepSeek Cloud API / OpenAI API).

FUNÇÃO NO PROJETO:
- Fornece sínteses executivas de atos do DOU e auxílio pericial na comparação conceitual entre a pauta da reunião e o teor do ato normativo/contratual.
- Gera justificativas em linguagem natural legível para os relatórios e dossiês do painel.

COMO FUNCIONA:
1. Conecta-se de forma assíncrona à API de Nuvem da DeepSeek / OpenAI sem comprometer a CPU/GPU local.
2. `summarize_act`: resume em uma frase o objeto e o valor do ato oficial.
3. `judge_relation`: avalia se o ato publicado no DOU tem correlação temática com a pauta declarada no e-Agendas.
4. Armazena o resultado em cache determinístico (por hash do prompt) para reprodutibilidade pericial completa.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEFAULT_MODEL = "deepseek-chat"
TIMEOUT = 60


def _get_deepseek_key() -> str:
    key = os.getenv("DEEPSEEK_KEY") or os.getenv("DEEPSEEK_API_KEY", "")
    if key:
        return key
    for path in ("../.env", ".env", "/Users/macmini/apps/CGU/.env"):
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("DEEPSEEK_KEY=") or line.startswith("DEEPSEEK_API_KEY="):
                            return line.split("=", 1)[1].strip("\"'")
            except Exception:
                pass
    return ""

# Versão POR TAREFA. Versionar em bloco invalidaria saídas ainda válidas: ao
# corrigir só o prompt de relação, os 154 resumos já gerados sumiram da tela
# porque a API passou a servir apenas a versão vigente.
PROMPT_VERSIONS = {
    "summarize_act": "v1",   # inalterado
    "judge_relation": "v2",  # reescrito após medir precisão 0,0 na classe de risco
}

# Mantida para leitura da versão do julgamento, que é a medida no eval.
PROMPT_VERSION = PROMPT_VERSIONS["judge_relation"]


def prompt_version(task: str) -> str:
    return PROMPT_VERSIONS.get(task, "v1")


# Teto de tokens por tarefa. O julgamento v2 devolve seis campos, dois deles
# com texto livre; com o teto de 220 do resumo, o JSON era cortado no meio da
# string e 64% das chamadas voltavam inválidas.
MAX_TOKENS = {
    "summarize_act": 350,
    "judge_relation": 600,
}

SUMMARY_PROMPT = """Você lê atos publicados no Diário Oficial da União para auditores da CGU.

Extraia APENAS o que está escrito no ato. Não infira, não complete, não avalie legalidade.
Se um campo não constar do texto, use "não consta".

Responda SOMENTE JSON:
{"concedido":"<o que o ato concede, em até 12 palavras>",
 "beneficiario":"<quem recebe, como está escrito>",
 "objeto":"<objeto do ato em até 15 palavras>",
 "valor":"<valor como aparece, ou 'não consta'>",
 "fundamento":"<dispositivo legal citado, ou 'não consta'>"}

ATO
tipo: %(act_type)s
título: %(title)s
texto: %(text)s
"""

RELATION_PROMPT = """Você apoia auditores da CGU comparando a PAUTA declarada de uma reunião com um ATO publicado depois no Diário Oficial.

Que a empresa apareça nos dois textos JÁ ESTÁ ESTABELECIDO e NÃO É a sua tarefa.
O vínculo entre empresa e ato foi confirmado antes, por CNPJ. Se você responder
com base em a empresa ser citada nos dois lados, a resposta está errada.

Sua única tarefa: o ASSUNTO tratado na reunião e o OBJETO do ato são o mesmo?

Trabalhe em três passos, nesta ordem:

PASSO 1 — Qual assunto a pauta declara?
  Se a pauta apenas nomeia uma empresa, uma associação, uma pessoa, um evento,
  uma sigla ou um número de processo, ela NÃO declara assunto. Nesse caso pare:
  relacao = "indeterminado", confianca = 0.0.

PASSO 2 — Qual o objeto do ato, conforme escrito nele?
  Copie do texto o objeto contratado ou o que o ato determina. Não deduza.

PASSO 3 — O objeto do PASSO 2 atende ao assunto do PASSO 1?
  "mesma_materia"  = o objeto do ato é exatamente o assunto tratado na reunião
  "materia_conexa" = mesmo setor ou programa, objeto diferente
  "sem_relacao"    = assuntos distintos
  Se para responder você precisar recorrer ao nome da empresa, a resposta é
  "sem_relacao" ou "indeterminado", nunca "mesma_materia".

Exemplos resolvidos:
  Pauta "Audiência com representantes da VALE S.A." + ato de aditivo com a Vale
    -> indeterminado (a pauta só nomeia a empresa)
  Pauta "EMB-505 - Flight Test Group Question to ANAC" + ato de aditivo de
    contrato de fabricação
    -> sem_relacao (certificação de voo não é o objeto do aditivo)
  Pauta "Revisão da RDC 786 de rotulagem" + ato que altera a RDC 786
    -> mesma_materia (o ato é sobre a norma discutida)

Responda SOMENTE JSON:
{"assunto_da_pauta":"<assunto, ou 'não declarado'>",
 "objeto_do_ato":"<objeto conforme o texto>",
 "relacao":"mesma_materia|materia_conexa|sem_relacao|indeterminado",
 "confianca":0.0,
 "trecho_do_ato":"<trecho literal que sustenta, ou ''>",
 "justificativa":"<até 25 palavras, sem citar o nome da empresa>"}

PAUTA DECLARADA NA REUNIÃO
%(pauta)s

ATO DO DOU (%(act_type)s, publicado %(delta)d dias após a reunião)
título: %(title)s
texto: %(text)s
"""


@dataclass
class LlmResult:
    task: str
    prompt_version: str
    model: str
    input_hash: str
    output: dict
    raw: str
    duration_s: float
    ok: bool
    error: str = ""


def available(model: str = DEFAULT_MODEL) -> bool:
    """Verifica se a chave da DeepSeek está disponível para execução em nuvem."""
    return bool(_get_deepseek_key())


def _call(prompt: str, model: str, num_predict: int) -> tuple[str, float]:
    key = _get_deepseek_key()
    if not key:
        raise RuntimeError("Chave da API DeepSeek não configurada (DEEPSEEK_KEY).")

    # Mapeia modelos locais ou legados para o modelo em nuvem oficial
    target_model = "deepseek-chat" if ("deepseek" in model.lower() or "gemma" in model.lower()) else model

    payload = {
        "model": target_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Você é um auditor de controle interno da Controladoria-Geral da União (CGU). "
                    "Responda estritamente em formato JSON válido, sem formatação markdown em torno do JSON "
                    "e sem qualquer texto adicional."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "temperature": 0.0,
        "max_tokens": max(num_predict, 500),
        "response_format": {"type": "json_object"},
    }

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        DEEPSEEK_API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "User-Agent": "Antessala-CGU-Forensics/1.0",
        },
    )
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        data = json.loads(response.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
    return content, time.monotonic() - started


def _run(task: str, prompt: str, model: str, num_predict: int) -> LlmResult:
    version = prompt_version(task)
    input_hash = hashlib.sha256(prompt.encode()).hexdigest()[:32]
    try:
        raw, duration = _call(prompt, model, num_predict)
    except Exception as exc:                                   # noqa: BLE001
        return LlmResult(task, version, model, input_hash, {}, "", 0.0,
                         False, str(exc))
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        truncado = "Unterminated" in str(exc) or not raw.rstrip().endswith("}")
        motivo = ("resposta truncada (aumente MAX_TOKENS para a tarefa)"
                  if truncado else f"JSON inválido: {exc}")
        return LlmResult(task, version, model, input_hash, {}, raw,
                         duration, False, motivo)
    return LlmResult(task, version, model, input_hash, parsed, raw, duration, True)


def summarize_act(act_type: str, title: str, text: str,
                  model: str = DEFAULT_MODEL) -> LlmResult:
    prompt = SUMMARY_PROMPT % {
        "act_type": act_type or "não informado",
        "title": (title or "")[:200],
        "text": (text or "")[:2500],
    }
    return _run("summarize_act", prompt, model, MAX_TOKENS["summarize_act"])


def judge_relation(pauta: str, act_type: str, title: str, text: str, delta_days: int,
                   model: str = DEFAULT_MODEL) -> LlmResult:
    prompt = RELATION_PROMPT % {
        "pauta": (pauta or "").strip() or "(vazia)",
        "act_type": act_type or "não informado",
        "title": (title or "")[:200],
        "text": (text or "")[:2000],
        "delta": delta_days,
    }
    result = _run("judge_relation", prompt, model, MAX_TOKENS["judge_relation"])

    if not result.ok:
        return result

    relacao = result.output.get("relacao")
    if relacao not in ("mesma_materia", "materia_conexa"):
        return result

    # Duas travas determinísticas sobre a classe de risco. A medição do prompt
    # anterior deu precisão 0,0 nessa classe: o modelo afirmava "mesma matéria"
    # sempre que a empresa aparecia nos dois textos.
    motivo = None
    if not pauta_has_subject(pauta):
        motivo = "Pauta não declara matéria; comparação impossível."
    elif str(result.output.get("assunto_da_pauta", "")).strip().lower() in (
            "não declarado", "nao declarado", "", "não consta"):
        motivo = "O próprio modelo não identificou assunto na pauta."
    elif _justifies_by_company(result.output, pauta):
        motivo = "Justificativa apoiada no nome da empresa, não na matéria."

    if motivo:
        result.output = {
            **result.output,
            "relacao": "indeterminado",
            "confianca": 0.0,
            "justificativa": motivo,
            "sobrescrito": True,
            "resposta_do_modelo": relacao,
        }
    return result


def _justifies_by_company(output: dict, pauta: str) -> bool:
    """A justificativa se apoia no nome da empresa em vez da matéria?

    Foi o atalho dominante na versão anterior: "a pauta menciona a X e o ato
    trata de um aditivo com ela". Identidade de empresa já é dada pelo
    cruzamento; usá-la como razão da relação é circular.
    """
    justificativa = str(output.get("justificativa", "")).lower()
    if not justificativa:
        return False
    marcadores = ("menciona a empresa", "menciona a ", "nomeia a ", "envolvendo a ",
                  "com ela", "com a mesma", "a mesma empresa", "cita a ")
    return any(m in justificativa for m in marcadores)


# Marcadores de que a pauta declara matéria, e não apenas nomeia alguém.
_SUBJECT_HINTS = (
    "sobre", "acerca", "referente", "regulament", "consulta", "norma", "rdc",
    "portaria", "resolu", "decreto", "lei ", "projeto", "contrato", "licita",
    "edital", "processo", "tarifa", "leilão", "leilao", "registro", "produto",
    "programa", "plano", "revisão", "revisao", "audiência", "audiencia",
    "proposta", "pleito", "demanda", "regra", "marco", "política", "politica",
)


def pauta_has_subject(pauta: str | None) -> bool:
    """A pauta declara alguma matéria, ou apenas nomeia?

    Deliberadamente conservadora: na dúvida, responde False, e o vínculo fica
    indeterminado em vez de afirmado.
    """
    text = (pauta or "").strip().lower()
    if len(text) < 25:
        return False
    if any(hint in text for hint in _SUBJECT_HINTS):
        return True
    # Pauta longa com muitas palavras costuma descrever assunto; nomes próprios
    # e siglas isolados, não.
    return len([w for w in text.split() if len(w) > 3]) >= 6
