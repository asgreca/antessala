"""Módulo de Avaliação Forense e Dataset Gold Standard (`eval.py`).

FUNÇÃO NO PROJETO:
- Fornece a infraestrutura de medição de acurácia da classificação temática e relacional efetuada pelos modelos de IA e heurísticas do Antessala.
- Valida preditivos contra o dataset de referência humana (*Gold Standard Dataset*) em `data/eval/gold_relations.json`.

COMO FUNCIONA:
1. Carrega itens rotulados manualmente (reuniões reais vs atos do DOU com rótulos `mesma_materia`, `materia_conexa`, `sem_relacao`).
2. Calcula matriz de confusão, precisão, revocação e métrica de `highStakesPrecision` (precisão em alertas de alto impacto).
3. Impede que alucinações de modelos de IA afetem a confiabilidade das auditorias.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from . import config

GOLD_PATH = config.DATA_DIR / "eval" / "gold_relations.json"

LABELS = ("mesma_materia", "materia_conexa", "sem_relacao", "indeterminado")

# Classes em que um erro tem consequência distinta. Um falso "mesma_materia"
# reforça um alerta sem lastro; um falso "sem_relacao" apenas enfraquece um
# indício. A primeira é a que precisa de precisão alta.
HIGH_STAKES = ("mesma_materia", "materia_conexa")


@dataclass
class GoldItem:
    correlation_id: str
    entity_name: str
    pauta: str
    act_type: str
    act_title: str
    act_excerpt: str
    label: str
    rationale: str


def load_gold() -> list[GoldItem]:
    if not GOLD_PATH.exists():
        return []
    raw = json.loads(GOLD_PATH.read_text(encoding="utf-8"))
    return [GoldItem(**item) for item in raw]


def save_gold(items: list[GoldItem]) -> None:
    GOLD_PATH.parent.mkdir(parents=True, exist_ok=True)
    GOLD_PATH.write_text(
        json.dumps([vars(i) for i in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def score(predictions: dict[str, str], gold: list[GoldItem]) -> dict:
    """Precisão e cobertura por classe, mais o número que decide o uso.

    `highStakesPrecision` é a proporção de acertos entre tudo que o modelo
    afirmou ser mesma matéria ou matéria conexa. É esse valor que autoriza (ou
    não) exibir o julgamento como reforço de um alerta.
    """
    by_label = {label: {"tp": 0, "fp": 0, "fn": 0} for label in LABELS}
    matched = 0
    confusion: dict[tuple[str, str], int] = {}

    for item in gold:
        predicted = predictions.get(item.correlation_id)
        if predicted is None:
            continue
        matched += 1
        confusion[(item.label, predicted)] = confusion.get((item.label, predicted), 0) + 1
        if predicted == item.label:
            by_label[item.label]["tp"] += 1
        else:
            by_label.setdefault(predicted, {"tp": 0, "fp": 0, "fn": 0})["fp"] += 1
            by_label[item.label]["fn"] += 1

    def ratio(numerator: int, denominator: int) -> float | None:
        return round(numerator / denominator, 3) if denominator else None

    per_label = {}
    for label, counts in by_label.items():
        per_label[label] = {
            **counts,
            "precision": ratio(counts["tp"], counts["tp"] + counts["fp"]),
            "recall": ratio(counts["tp"], counts["tp"] + counts["fn"]),
        }

    hs_tp = sum(by_label[l]["tp"] for l in HIGH_STAKES)
    hs_fp = sum(by_label[l]["fp"] for l in HIGH_STAKES)
    correct = sum(by_label[l]["tp"] for l in LABELS)

    return {
        "evaluated": matched,
        "accuracy": ratio(correct, matched),
        "highStakesPrecision": ratio(hs_tp, hs_tp + hs_fp),
        "highStakesClaimed": hs_tp + hs_fp,
        "perLabel": per_label,
        "confusion": [
            {"gold": g, "predicted": p, "n": n}
            for (g, p), n in sorted(confusion.items(), key=lambda kv: -kv[1])
        ],
    }
