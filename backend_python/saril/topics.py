"""Classificação temática das pautas.

Determinística e por palavra-chave, de propósito: o auditor precisa poder
conferir por que uma reunião caiu num tema, e a classificação não pode mudar
entre execuções. O órgão entra como indício forte — uma reunião na ANVISA é
quase certamente de saúde —, mas o texto da pauta tem precedência quando diz
algo específico.

Duas dimensões independentes, porque são perguntas diferentes:
  * SETOR   — sobre o que se trata (saúde, energia, telecom…)
  * NATUREZA — que tipo de encontro é (técnico, institucional, cortesia…)
"""
from __future__ import annotations

import re

from .normalize import normalize_name

# ------------------------------------------------------------------ setor
# Termos extraídos das pautas e órgãos efetivamente presentes na base.
SECTORS: dict[str, tuple[str, tuple[str, ...]]] = {
    "TELECOM": ("Telecomunicações", (
        "anatel", "telecomunica", "espectro", "banda larga", "5g", "4g", "fibra",
        "radiofrequencia", "radiofrequência", "stir shaken", "celular", "telefonia",
        "rgc", "satelite", "satélite", "orbita", "órbita", "conectividade",
        "provedor", "internet", "roaming", "fust", "eace",
    )),
    "TRANSPORTE": ("Transporte e logística", (
        "antt", "antaq", "rodovia", "ferrovia", "ferroviaria", "ferroviária",
        "porto", "portuaria", "portuária", "hidrovia", "concessao rodoviaria",
        "pedagio", "pedágio", "transporte rodoviario", "transporte de cargas",
        "trc", "logistica", "logística", "dnit", "infra s a", "outorga rodoviaria",
    )),
    "AVIACAO": ("Aviação civil", (
        "anac", "aeroporto", "aeronave", "aviacao", "aviação", "voo", "aerea",
        "aérea", "aeronautic", "eVTOL", "evtol", "certificacao de tipo", "faa",
        "tripulante", "slot aeroportuario",
    )),
    "ENERGIA": ("Energia e petróleo", (
        "aneel", "anp ", "petroleo", "petróleo", "gas natural", "gás natural",
        "energia eletrica", "energia elétrica", "leilao de energia", "leilão de energia",
        "transmissao", "transmissão", "geracao", "geração", "distribuidora",
        "tarifa de energia", "biocombustivel", "biocombustível", "etanol", "eolica",
        "eólica", "solar", "hidreletrica", "hidrelétrica", "gasoduto", "refinaria",
        "combustivel", "combustível", "mineracao", "mineração", "anm",
    )),
    "SAUDE": ("Saúde", (
        "anvisa", "ans ", "saude", "saúde", "medicamento", "farmac", "vacina",
        "imunobiolog", "dispositivo medico", "dispositivo médico", "rdc ",
        "registro sanitario", "registro sanitário", "vigilancia sanitaria",
        "vigilância sanitária", "sus", "hospital", "plano de saude", "plano de saúde",
        "cosmetic", "cosmétic", "saneante", "alimento", "rotulagem",
    )),
    "AMBIENTE": ("Meio ambiente e clima", (
        "ibama", "icmbio", "conama", "meio ambiente", "licenciamento ambiental",
        "clima", "climatic", "climátic", "carbono", "desmatamento", "mata atlantica",
        "mata atlântica", "residuo", "resíduo", "sustentabilidade", "transicao ecologica",
        "transição ecológica", "supressao vegetal", "supressão vegetal",
    )),
    "TRIBUTARIO": ("Tributário e fiscal", (
        "tributari", "tributári", "reforma tributaria", "reforma tributária",
        "cbs", "ibs", "imposto", "receita federal", "aliquota", "alíquota",
        "drawback", "regime especial", "icms", "pis cofins", "carga tributaria",
        "split payment", "rtc",
    )),
    "FINANCEIRO": ("Sistema financeiro", (
        "banco central", "bacen", "cvm", "susep", "previc", "credito", "crédito",
        "financiamento", "seguro", "resseguro", "previdencia complementar",
        "previdência complementar", "fundo de investimento", "pix", "open finance",
        "meio de pagamento", "fintech",
    )),
    "AGRO": ("Agropecuária", (
        "agricultura", "agropecuari", "agropecuári", "defensivo", "agrotoxico",
        "agrotóxico", "safra", "plano safra", "fertilizante", "pecuaria", "pecuária",
        "exportacao agricola", "exportação agrícola", "mapa ", "embrapa", "cafe",
        "soja", "carne", "sanidade animal", "sanidade vegetal",
    )),
    "INDUSTRIA": ("Indústria e comércio", (
        "mdic", "industria", "indústria", "comercio exterior", "comércio exterior",
        "importacao", "importação", "exportacao", "exportação", "tarifa de importacao",
        "antidumping", "cadeia produtiva", "politica industrial", "política industrial",
        "mover", "rota 2030", "zona franca", "semicondutor",
    )),
    "TRABALHO": ("Trabalho e previdência", (
        "trabalho", "emprego", "sindical", "negociacao coletiva", "negociação coletiva",
        "fgts", "inss", "previdencia social", "previdência social", "seguranca do trabalho",
        "segurança do trabalho", "nr ", "terceirizacao", "terceirização",
    )),
    "DIGITAL": ("Economia digital e dados", (
        "anpd", "lgpd", "protecao de dados", "proteção de dados", "inteligencia artificial",
        "inteligência artificial", "plataforma digital", "marco civil", "big tech",
        "comercio eletronico", "comércio eletrônico", "marketplace", "cibersegur",
    )),
    "EDUCACAO": ("Educação", (
        "educacao", "educação", "mec ", "ensino", "universidade", "capes", "inep",
        "fies", "prouni", "bolsa de estudo",
    )),
    "INFRA_URBANA": ("Infraestrutura urbana e saneamento", (
        "saneamento", "agua e esgoto", "água e esgoto", "habitacao", "habitação",
        "mobilidade urbana", "residuos solidos", "resíduos sólidos", "obra publica",
        "obra pública", "ppp ", "concessao de saneamento",
    )),
    "CULTURA": ("Cultura e Economia Criativa", (
        "cultura", "cultural", "minc", "iphan", "ancine", "funarte", "museu", "museus",
        "ibram", "palmares", "fcp", "biblioteca nacional", "rouanet", "lei rouanet",
        "audiovisual", "cinema", "cinematogr", "teatro", "circo", "musica", "música",
        "danca", "dança", "artes visuais", "patrimonio historico", "patrimônio histórico",
        "patrimonio cultural", "patrimônio cultural", "artesanato", "samba", "carnaval",
        "orquestra", "escola de samba", "literatura", "livro e leitura", "politica cultural",
        "política cultural", "fundo nacional de cultura", "fnc", "aldir blanc", "paulo gustavo",
        "fundo setorial do audiovisual", "fsa", "economia criativa",
    )),
    "TURISMO": ("Turismo", (
        "turismo", "turist", "embratur", "hotelaria", "hoteleir", "ecoturismo",
        "atrativo turistico", "atrativo turístico", "guia de turismo", "promocao turistica",
        "promoção turística", "destino turistico", "destino turístico", "viagem", "resort",
    )),
    "ESPORTE": ("Esporte e Lazer", (
        "esporte", "esportiv", "atleta", "bolsa atleta", "lei de incentivo ao esporte",
        "cbf", "cob ", "comite olimpico", "comitê olímpico", "paralimpic", "paralímpic",
        "futebol", "jogos olimpicos", "jogos olímpicos", "estadio", "estádio",
    )),
    "DIREITOS_HUMANOS": ("Direitos Humanos e Cidadania", (
        "direitos humanos", "cidadania", "mdhc", "conselho tutelar", "crianca e adolescente",
        "criança e adolescente", "pessoa com deficiencia", "pessoa com deficiência", "idoso",
        "populacao em situacao de rua", "população em situação de rua", "lgbt",
    )),
    "IGUALDADE_RACIAL": ("Igualdade Racial", (
        "igualdade racial", "racial", "quilombol", "antirracis", "acao afirmativa",
        "ação afirmativa", "comunidade tradicional", "povos de terreiro",
    )),
    "POVOS_INDIGENAS": ("Povos Indígenas", (
        "povos indigenas", "povos indígenas", "indigena", "indígena", "funai",
        "demarcacao", "demarcação", "aldeia", "etnia", "terras indigenas", "terras indígenas",
    )),
    "MULHERES": ("Mulheres e Políticas de Gênero", (
        "ministerio das mulheres", "violencia contra a mulher", "violência contra a mulher",
        "maria da penha", "feminicidio", "feminicídio", "autonomia economica das mulheres",
        "autonomia econômica das mulheres",
    )),
    "PESCA": ("Pesca e Aquicultura", (
        "pesca", "pesqueir", "aquicultura", "defeso", "seguro defeso",
        "registro geral da pesca", "embarcacao de pesca", "embarcação de pesca",
    )),
    "PLANEJAMENTO_GESTAO": ("Planejamento, Gestão e Orçamento", (
        "planejamento", "orcamento", "orçamento", "ppa", "loa", "ldo", "gestao publica",
        "gestão pública", "mgi", "concurso publico", "concurso público", "carreira publica",
        "carreira pública", "patrimonio da uniao", "patrimônio da união", "spu",
    )),
    "INTEGRIDADE_CONTROLE": ("Integridade, Transparência e Controle", (
        "controladoria", "cgu", "auditoria", "corregedoria", "ouvidoria", "transparencia",
        "transparência", "acesso a informacao", "acesso à informação", "lai",
        "integridade", "anticorrupcao", "anticorrupção", "compliance", "tcu",
    )),
    "JURIDICO_ESTADO": ("Advocacia Pública e Segurança Jurídica", (
        "advocacia-geral", "agu", "procuradoria", "conjur", "consultoria juridica",
        "consultoria jurídica", "parecer juridico", "parecer jurídico", "contencioso",
        "seguranca juridica", "segurança jurídica",
    )),
    "GOVERNO_ARTICULACAO": ("Articulação Governamental e Relações Institucionais", (
        "relacoes institucionais", "relações institucionais", "articulacao politica",
        "articulação política", "casa civil", "secretaria-geral", "presidencia da republica",
        "presidência da república", "seguranca institucional", "segurança institucional",
        "defesa nacional", "forcas armadas", "forças armadas",
    )),
}

# Setor provável a partir do órgão, usado quando a pauta não decide.
ORGAN_SECTOR_HINTS: tuple[tuple[str, str], ...] = (
    ("agencia nacional de telecomunicacoes", "TELECOM"),
    ("ministerio das comunicacoes", "TELECOM"),
    ("agencia nacional de transportes terrestres", "TRANSPORTE"),
    ("agencia nacional de transportes aquaviarios", "TRANSPORTE"),
    ("ministerio dos transportes", "TRANSPORTE"),
    ("departamento nacional de infraestrutura de transportes", "TRANSPORTE"),
    ("agencia nacional de aviacao civil", "AVIACAO"),
    ("agencia nacional do petroleo", "ENERGIA"),
    ("agencia nacional de energia eletrica", "ENERGIA"),
    ("ministerio de minas e energia", "ENERGIA"),
    ("agencia nacional de mineracao", "ENERGIA"),
    ("agencia nacional de vigilancia sanitaria", "SAUDE"),
    ("agencia nacional de saude suplementar", "SAUDE"),
    ("ministerio da saude", "SAUDE"),
    ("ministerio do meio ambiente", "AMBIENTE"),
    ("instituto brasileiro do meio ambiente", "AMBIENTE"),
    ("instituto chico mendes", "AMBIENTE"),
    ("ministerio da fazenda", "TRIBUTARIO"),
    ("receita federal", "TRIBUTARIO"),
    ("banco central do brasil", "FINANCEIRO"),
    ("comissao de valores mobiliarios", "FINANCEIRO"),
    ("superintendencia de seguros privados", "FINANCEIRO"),
    ("superintendencia nacional de previdencia complementar", "FINANCEIRO"),
    ("ministerio da agricultura", "AGRO"),
    ("ministerio do desenvolvimento agrario", "AGRO"),
    ("ministerio do desenvolvimento industria comercio", "INDUSTRIA"),
    ("ministerio do trabalho", "TRABALHO"),
    ("autoridade nacional de protecao de dados", "DIGITAL"),
    ("ministerio da educacao", "EDUCACAO"),
    ("ministerio das cidades", "INFRA_URBANA"),
    ("ministerio da integracao", "INFRA_URBANA"),
    ("ministerio da cultura", "CULTURA"),
    ("fundacao nacional de artes", "CULTURA"),
    ("instituto do patrimonio historico", "CULTURA"),
    ("agencia nacional do cinema", "CULTURA"),
    ("instituto brasileiro de museus", "CULTURA"),
    ("fundacao cultural palmares", "CULTURA"),
    ("fundacao biblioteca nacional", "CULTURA"),
    ("ministerio do turismo", "TURISMO"),
    ("instituto brasileiro de turismo", "TURISMO"),
    ("embratur", "TURISMO"),
    ("ministerio do esporte", "ESPORTE"),
    ("ministerio dos direitos humanos", "DIREITOS_HUMANOS"),
    ("ministerio da igualdade racial", "IGUALDADE_RACIAL"),
    ("ministerio dos povos indigenas", "POVOS_INDIGENAS"),
    ("fundacao nacional dos povos indigenas", "POVOS_INDIGENAS"),
    ("ministerio das mulheres", "MULHERES"),
    ("ministerio da pesca", "PESCA"),
    ("ministerio do planejamento", "PLANEJAMENTO_GESTAO"),
    ("ministerio da gestao", "PLANEJAMENTO_GESTAO"),
    ("controladoria-geral da uniao", "INTEGRIDADE_CONTROLE"),
    ("tribunal de contas da uniao", "INTEGRIDADE_CONTROLE"),
    ("advocacia-geral da uniao", "JURIDICO_ESTADO"),
    ("secretaria de relacoes institucionais", "GOVERNO_ARTICULACAO"),
    ("casa civil", "GOVERNO_ARTICULACAO"),
    ("secretaria-geral da presidencia", "GOVERNO_ARTICULACAO"),
    ("gabinete de seguranca institucional", "GOVERNO_ARTICULACAO"),
    ("ministerio da defesa", "GOVERNO_ARTICULACAO"),
)

SECTOR_LABELS = {key: label for key, (label, _) in SECTORS.items()}
SECTOR_LABELS["INDEFINIDO"] = "Indefinido"

# --------------------------------------------------------------- natureza
NATURES: dict[str, tuple[str, tuple[str, ...]]] = {
    "TECNICA": ("Reunião técnica", (
        "reuniao tecnica", "reunião técnica", "grupo de trabalho", "gt ", "camara tecnica",
        "câmara técnica", "comite", "comitê", "plenaria", "plenária", "diligencia",
        "diligência", "workshop", "oficina", "capacitacao", "capacitação",
    )),
    "REGULATORIA": ("Tratativa regulatória", (
        "consulta publica", "consulta pública", "audiencia publica", "audiência pública",
        "tomada de subsidio", "tomada de subsídio", "regulament", "norma", "rdc ",
        "resolucao", "resolução", "portaria", "revisao normativa", "revisão normativa",
        "agenda regulatoria", "agenda regulatória",
    )),
    "CONTRATUAL": ("Contrato ou concessão", (
        "concessao", "concessão", "contrato", "licitacao", "licitação", "edital",
        "outorga", "prorrogacao", "prorrogação", "aditivo", "reequilibrio",
        "reequilíbrio", "leilao", "leilão",
    )),
    "PLEITO": ("Pleito ou demanda setorial", (
        "pleito", "demanda", "solicitacao", "solicitação", "proposta", "sugestao",
        "sugestão", "requerimento", "reivindicacao", "reivindicação",
    )),
    "PARLAMENTAR": ("Interlocução Política e Parlamentar", (
        "senador", "senadora", "deputad", "parlamentar", "bancada", "frente parlamentar",
        "lider do governo", "líder do governo", "lider partidario", "líder partidário",
        "prefeito", "prefeita", "governador", "governadora", "vereador", "vereadora",
        "congresso nacional", "camara dos deputados", "câmara dos deputados", "senado federal",
    )),
    "APRESENTACAO_PROJETO": ("Apresentação de projeto ou proposta", (
        "apresentacao de projeto", "apresentação de projeto", "apresentacao do projeto",
        "apresentação do projeto", "apresentacao da pesquisa", "apresentação da pesquisa",
        "apresentacao de proposta", "apresentação de proposta", "projeto cultural",
        "pesquisa de impacto", "plano de trabalho", "iniciativa cultural",
    )),
    "INSTITUCIONAL": ("Visita ou apresentação institucional", (
        "visita", "cortesia", "apresentacao institucional", "apresentação institucional",
        "assinatura", "posse", "cerimonia", "cerimônia", "lancamento", "lançamento",
        "evento", "protocolo de intencoes", "protocolo de intenções", "convite",
    )),
    "OPACA_INTERLOCUTOR": ("Identificação de interlocutor (pauta opaca)", (
        "com a ", "com o ", "com os ", "com as ", "audiencia com", "audiência com",
        "reuniao com", "reunião com", "encontro com", "visita do", "visita da",
        "vice-presidente", "presidente da", "presidente do", "diretor da", "diretor do",
        "diretora da", "diretora do", "representante do", "representante da",
        "fundador", "co-fundador", "gerente executivo", "superintendente",
    )),
}
NATURE_LABELS = {key: label for key, (label, _) in NATURES.items()}
NATURE_LABELS["NAO_DECLARADA"] = "Natureza não declarada"


def _matches(haystack: str, terms: tuple[str, ...]) -> str | None:
    for term in terms:
        if term in haystack:
            return term
    return None


def classify(topic: str | None, public_body: str | None = None) -> dict:
    """Setor e natureza de uma pauta, com o termo que decidiu cada um.

    Devolve o termo casado para que a interface possa justificar a
    classificação — categoria sem origem visível não é conferível.
    """
    text = f" {(topic or '').lower()} "
    body_norm = normalize_name(public_body or "")

    sector, sector_evidence, sector_source = "INDEFINIDO", "", "nenhuma"
    for key, (_label, terms) in SECTORS.items():
        hit = _matches(text, terms)
        if hit:
            sector, sector_evidence, sector_source = key, hit.strip(), "pauta"
            break

    if sector == "INDEFINIDO" and body_norm:
        for prefix, key in ORGAN_SECTOR_HINTS:
            if body_norm.startswith(prefix):
                sector, sector_evidence, sector_source = key, public_body or "", "órgão"
                break

    nature, nature_evidence = "NAO_DECLARADA", ""
    for key, (_label, terms) in NATURES.items():
        hit = _matches(text, terms)
        if hit:
            nature, nature_evidence = key, hit.strip()
            break

    return {
        "sector": sector,
        "sectorLabel": SECTOR_LABELS[sector],
        "sectorEvidence": sector_evidence,
        "sectorSource": sector_source,
        "nature": nature,
        "natureLabel": NATURE_LABELS[nature],
        "natureEvidence": nature_evidence,
    }
