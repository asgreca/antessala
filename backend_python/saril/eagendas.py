"""Parser de Participantes e Estruturação de Compromissos do e-Agendas.

FUNÇÃO NO PROJETO:
- Realiza o desmembramento (parsing) das strings livres de participantes do e-Agendas.
- Identifica quem são os agentes públicos (autoridades) e quem são os representantes privados (lobistas / visitantes) com suas respectivas empresas.

COMO FUNCIONA:
1. Divide o campo `raw_participants` pelos delimitadores oficiais do e-Agendas (`||`).
2. Isolando o bloco de participantes privados, extrai o nome do representante, seu cargo e a empresa/entidade representada.
3. Remove prefixos institucionais ("Gerente de Relações de...", "Representante de...") para garantir que a empresa seja corretamente identificada.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass, field

import pandas as pd

from . import config
from .normalize import clean_cnpj, is_generic, normalize_name

# "Gerentes de Relações Institucionais da Azul Linhas Aéreas" descreve o cargo
# e só depois nomeia a empresa. Sem extrair, a mesma companhia aparece como
# várias entidades distintas, uma por variação de cargo.
_ROLE_PREFIX_RE = re.compile(
    r"^(?:[\w\s\-çãõáéíóúâêôàü]{0,70}?"
    r"(?:relaç(?:ões|ao|oes)\s+(?:institucionais|governamentais|públicas)"
    r"|assuntos\s+(?:institucionais|corporativos|governamentais|regulatórios)"
    r"|head\s+of|head\s+de|diretor(?:a)?|gerente(?:s)?|coordenador(?:a)?"
    r"|superintendente|presidente|vice[\s-]presidente|s[óo]cio(?:a)?"
    r"|advogad[oa]|consultor(?:a)?|assessor(?:a)?|representante)"
    r"[\w\s\-çãõáéíóúâêôàü]{0,40}?)\s+(?:da|de|do|das|dos|na|no|em)\s+(?=[A-ZÀ-Ú])",
    re.I,
)


def strip_role_prefix(entity: str) -> str:
    """Remove a descrição de cargo que antecede o nome da empresa.

    Aplicada em cadeia porque os cargos se encaixam: "Gerentes de Relações
    Institucionais da Azul" precisa de duas passadas para chegar em "Azul".
    O limite de iterações evita laço em entrada patológica.
    """
    current = (entity or "").strip()
    for _ in range(4):
        if len(current) < 12:
            break
        match = _ROLE_PREFIX_RE.match(current)
        if not match:
            break
        remainder = current[match.end():].strip(" -,.")
        # Só aceita a poda se o que sobrou ainda identifica uma organização.
        if len(remainder) < 4:
            break
        current = remainder
    return current or entity

BLOCK_SPLIT = "||"
PUBLIC_LABEL = "Agentes públicos participantes:"
PRIVATE_LABEL = "Agentes privados participantes:"
FOREIGN_LABEL = "Representantes de governo estrangeiro"

_CPF_RE = re.compile(r"\(CPF:\s*([^)]+)\)")
_CNPJ_INLINE_RE = re.compile(r"\(CNPJ:?\s*([^)]+)\)", re.I)
# O CNPJ também aparece solto, sem parênteses, colado à razão social.
_CNPJ_BARE_RE = re.compile(
    r"[,\s-]*\bcnpj:?\s*([\d][\d./\s-]{15,20})", re.I)
_REPRESENTING_RE = re.compile(r"\brepresentando\s+(.+)$", re.IGNORECASE)


@dataclass
class PublicAgent:
    name: str
    masked_cpf: str = ""
    role: str = ""
    body: str = ""


@dataclass
class PrivateAgent:
    name: str
    role: str = ""
    masked_cpf: str = ""
    represented_entity: str = ""
    represented_cnpj: str | None = None
    own_interest: bool = False


@dataclass
class ParsedParticipants:
    public_agents: list[PublicAgent] = field(default_factory=list)
    private_agents: list[PrivateAgent] = field(default_factory=list)
    foreign_agents: list[str] = field(default_factory=list)


def _split_blocks(raw: str) -> dict[str, str]:
    """Reparte o texto livre nos blocos rotulados, tolerando rótulo colado ao
    conteúdo anterior (ex.: '...Terrestres || Agentes privados participantes:')."""
    blocks: dict[str, str] = {}
    current = None
    for chunk in str(raw).split(BLOCK_SPLIT):
        chunk = chunk.strip()
        if not chunk:
            continue
        if PRIVATE_LABEL in chunk:
            current = "private"
            chunk = chunk.split(PRIVATE_LABEL, 1)[1]
        elif PUBLIC_LABEL in chunk:
            current = "public"
            chunk = chunk.split(PUBLIC_LABEL, 1)[1]
        elif FOREIGN_LABEL in chunk:
            current = "foreign"
            chunk = chunk.split(":", 1)[-1]
        if current:
            blocks[current] = (blocks.get(current, "") + " | " + chunk).strip(" |")
    return blocks


def parse_participants(raw: str | None) -> ParsedParticipants:
    result = ParsedParticipants()
    if not raw or not isinstance(raw, str):
        return result

    # O e-Agendas devolve o texto com entidades HTML escapadas. Sem desfazer,
    # "P&D Brasil" vira "P&amp;D Brasil" e normaliza para "p amp d" — a mesma
    # empresa se parte em várias entidades e o termo de busca no DOU fica
    # irrecuperável.
    raw = html.unescape(raw)

    blocks = _split_blocks(raw)

    for entry in _entries(blocks.get("public", "")):
        parts = [p.strip() for p in entry.split("/")]
        name_part = parts[0] if parts else ""
        cpf_match = _CPF_RE.search(name_part)
        result.public_agents.append(
            PublicAgent(
                name=_CPF_RE.sub("", name_part).strip(" -"),
                masked_cpf=cpf_match.group(1).strip() if cpf_match else "",
                role=parts[1] if len(parts) > 1 else "",
                body=parts[2] if len(parts) > 2 else "",
            )
        )

    for entry in _entries(blocks.get("private", "")):
        result.private_agents.append(_parse_private_entry(entry))

    result.foreign_agents = [e for e in _entries(blocks.get("foreign", ""))]
    return result


def _entries(block: str) -> list[str]:
    return [e.strip() for e in block.split("|") if e.strip()]


def _parse_private_entry(entry: str) -> PrivateAgent:
    entity, cnpj = "", None
    match = _REPRESENTING_RE.search(entry)
    person_part = entry

    if match:
        entity = match.group(1).strip(" .;")
        person_part = entry[: match.start()].strip(" -/")
        # "representando representando X" ocorre no dado bruto e faria o próprio
        # verbo virar parte da razão social.
        entity = re.sub(r"^(?:representando\s+)+", "", entity, flags=re.I).strip()

    # O CPF mascarado às vezes é digitado no campo da entidade. Ele identifica
    # uma pessoa, não uma organização, e polui a busca com falsas "empresas".
    entity = _CPF_RE.sub("", entity).strip(" -.,")

    for pattern in (_CNPJ_INLINE_RE, _CNPJ_BARE_RE):
        cnpj_match = pattern.search(entity)
        if cnpj_match:
            cnpj = cnpj or clean_cnpj(cnpj_match.group(1))
            entity = pattern.sub("", entity).strip(" -.,")

    # O CPF mascarado aparece em 22,5% das participações privadas. Ele precisa
    # sair do nome (senão fragmenta o mesmo ator em identidades distintas), mas
    # não pode ser descartado: é a única chave que distingue homônimos.
    cpf_match = _CPF_RE.search(person_part)
    masked_cpf = cpf_match.group(1).strip() if cpf_match else ""
    person_part = _CPF_RE.sub("", person_part).strip(" -/,")
    # O nome vem antes do cargo, separado por hífen, barra ou vírgula. O
    # e-Agendas usa as três formas, além de travessão (–/—) — sem cobrir todas,
    # o mesmo ator vira várias pessoas distintas na base.
    segs = re.split(r"\s+[-–—]\s+|\s+/\s+|\s*,\s+", person_part)
    person_name = segs[0].strip() if segs else person_part.strip()
    role = segs[1].strip() if len(segs) > 1 else ""

    entity = strip_role_prefix(entity)
    own = is_generic(entity) and "interesse" in normalize_name(entity)
    return PrivateAgent(
        name=person_name,
        role=role,
        masked_cpf=masked_cpf,
        represented_entity="" if is_generic(entity) else entity,
        represented_cnpj=cnpj,
        own_interest=own,
    )


def load_meetings(columns: list[str] | None = None) -> pd.DataFrame:
    """Carrega o parquet real com as datas parseadas corretamente.

    O formato é dd-mm-yyyy. Deixar o pandas inferir descarta 736k linhas como
    NaT e inverte dia/mês nas demais — foi assim que a versão anterior do
    cruzamento produziu Δt sem sentido.
    """
    df = pd.read_parquet(config.EAGENDAS_PARQUET, columns=columns)
    if "date_start" in df.columns:
        df["date_start"] = pd.to_datetime(
            df["date_start"], format=config.EAGENDAS_DATE_FORMAT, errors="coerce"
        )
        unparsed = int(df["date_start"].isna().sum())
        if unparsed:
            print(f"[eagendas] aviso: {unparsed:,} datas não parseadas e descartadas")
            df = df[df["date_start"].notna()]
    return df


def explode_private_participants(df: pd.DataFrame) -> pd.DataFrame:
    """Uma linha por (reunião, ator privado). É a tabela-base da auditoria."""
    rows: list[dict] = []
    for row in df.itertuples(index=False):
        raw = getattr(row, "raw_participants", None)
        if not raw or PRIVATE_LABEL not in str(raw):
            continue
        parsed = parse_participants(raw)
        if not parsed.private_agents:
            continue
        authority = parsed.public_agents[0].name if parsed.public_agents else ""
        authority_role = parsed.public_agents[0].role if parsed.public_agents else ""
        for agent in parsed.private_agents:
            if not agent.represented_entity and not agent.represented_cnpj:
                continue
            rows.append(
                {
                    "event_id": getattr(row, "event_id", None),
                    "meeting_date": getattr(row, "date_start", None),
                    "public_body": getattr(row, "public_body", ""),
                    "declared_topic": getattr(row, "declared_topic", ""),
                    "authority_name": getattr(row, "authority_name", "") or authority,
                    "authority_role": getattr(row, "authority_role", "") or authority_role,
                    "lobbyist_name": agent.name,
                    "lobbyist_role": agent.role,
                    "lobbyist_masked_cpf": agent.masked_cpf,
                    "entity_name": agent.represented_entity,
                    "entity_norm": normalize_name(agent.represented_entity),
                    "entity_cnpj": agent.represented_cnpj,
                }
            )
    return pd.DataFrame(rows)
