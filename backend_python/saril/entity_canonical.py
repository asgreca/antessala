"""Engine de Canonização e Unificação de Entidades Privadas (`entity_canonical.py`).

FUNÇÃO NO PROJETO:
- Soluciona a fragmentação de nomes de empresas no e-Agendas (onde uma mesma empresa aparece com dezenas de grafias, marcas ou filiais com CNPJs diferentes).
- Consolida as reuniões de filiais, marcas e razões sociais sob uma única **Entidade Canônica** (ex: funde "Meta", "Facebook Brasil", "WhatsApp" sob o grupo canônico Meta).

COMO FUNCIONA:
1. Aplica unificação determinística por CNPJ (agrupando CNPJs com a mesma raiz de 8 dígitos ou explicitamente declarados).
2. Utiliza dicionário curado de equivalências corporativas nacionais (siglas de federações como FEBRABAN, FIESP, CNI e marcas comerciais).
3. Propaga a entidade canônica no banco DuckDB sem misturar empresas distintas (evitando falsos positivos entre homônimos).
"""
from __future__ import annotations

import difflib
import logging
import re
from typing import Optional
import pandas as pd

from .normalize import is_generic, starts_with_role, normalize_name, _LEGAL_SUFFIXES, ROLE_WORDS

logger = logging.getLogger("saril.entity_canonical")

CONNECTORS = {"de", "da", "do", "dos", "das", "e", "em", "para", "com", "a", "o", "as", "os"}
BUSINESS_STOPWORDS = _LEGAL_SUFFIXES | CONNECTORS | {
    "instituicao", "pagamento", "pagamentos", "servicos", "servico",
    "comercio", "industria", "brasil", "brasileira", "brasileiro",
    "participacoes", "holding", "holdings", "energia", "tecnologia",
    "solucoes", "associacao", "confederacao", "federacao", "sindicato",
    "instituto", "fundo", "fundacao", "consultoria", "advogados",
    "advocacia", "engenharia", "empreendimentos", "nacional", "internacional",
    "com", "br", "net", "org",
}

# Catálogo Curado de Entidades Notórias:
# (canonical_norm, canonical_name, root_cnpj, aliases)
CANONICAL_ENTITIES_CATALOG = [
    # Petróleo, Gás, Energia e Mineração
    (
        "petrobras",
        "Petrobras",
        "33000167000101",
        [
            "petrobras",
            "petroleo brasileiro s a petrobras",
            "petroleo brasileiro s a",
            "petroleo brasileiro sa",
            "petroleo brasileiro",
            "petroleo brasileiro s a petrobras",
            "a petrobras",
            "petrobras petroleo brasileiro",
            "petrobrass",
            "gerente petrobras",
            "presidencia da petrobras",
            "comercializacao da petrobras",
            "imprensa da petrobras",
            "relacionamento com investidores petrobras",
            "relacionamento externo da petrobras",
            "cenpes petrobras",
            "petrobras danielbribeiro petrobras com br",
            "petrobras fernando amaral petrobras com br",
        ],
    ),
    (
        "transpetro",
        "Transpetro",
        "02709449000159",
        [
            "transpetro",
            "petrobras transporte s a transpetro",
            "petrobras transporte s a",
            "petrobras transporte",
        ],
    ),
    (
        "petros",
        "Petros",
        "34053942000150",
        [
            "petros",
            "fundacao petrobras de seguridade social petros",
            "fundacao petrobras de seguridade social",
            "petros fundacao petrobras de seguridade social",
            "petros fundo de previdencia dos func da petrobras",
        ],
    ),
    (
        "vale",
        "Vale",
        "33592510000154",
        [
            "vale",
            "vale s a",
            "vale sa",
            "vale s/a",
            "vale holdings",
            "companhia vale do rio doce",
            "cia vale do rio doce",
        ],
    ),
    (
        "eletrobras",
        "Eletrobras",
        "00001180000126",
        [
            "eletrobras",
            "centrais eletricas brasileiras s a eletrobras",
            "centrais eletricas brasileiras",
            "centrais eletricas brasileiras s a",
        ],
    ),
    (
        "neoenergia",
        "Neoenergia",
        "01083200000118",
        [
            "neoenergia",
            "neoenergia s a",
            "neoenergia sa",
            "grupo neoenergia",
        ],
    ),
    (
        "cpfl energia",
        "CPFL Energia",
        "02429144000193",
        [
            "cpfl",
            "cpfl energia",
            "cpfl energia s a",
            "grupo cpfl",
        ],
    ),
    (
        "enel",
        "Enel",
        "07523555000100",
        [
            "enel",
            "enel brasil",
            "enel brasil s a",
            "enel distribuicao",
        ],
    ),
    (
        "equinor",
        "Equinor",
        "04235282000181",
        [
            "equinor",
            "equinor brasil",
            "equinor brasil energia ltda",
        ],
    ),
    (
        "shell",
        "Shell",
        "10454280000195",
        [
            "shell",
            "shell brasil",
            "shell brasil petroleo ltda",
        ],
    ),
    (
        "vibra energia",
        "Vibra Energia",
        "34274233000102",
        [
            "vibra",
            "vibra energia",
            "vibra energia s a",
            "petrobras distribuidora",
        ],
    ),
    (
        "raizen",
        "Raízen",
        "08070508000178",
        [
            "raizen",
            "raizen s a",
            "raizen energia s a",
            "raizen combustiveis",
        ],
    ),
    (
        "transportadora associada de gas",
        "TAG - Transportadora Associada de Gás",
        "06248349000123",
        [
            "tag",
            "tag transportadora associada de gas",
            "transportadora associada de gas s a tag",
            "transportadora associada de gas",
        ],
    ),
    (
        "braskem",
        "Braskem",
        "42150391000170",
        [
            "braskem",
            "braskem s a",
            "braskem sa",
        ],
    ),
    (
        "gerdau",
        "Gerdau",
        "33611500000119",
        [
            "gerdau",
            "gerdau s a",
            "gerdau sa",
            "metalurgica gerdau",
        ],
    ),
    (
        "suzano",
        "Suzano",
        "16404287000155",
        [
            "suzano",
            "suzano s a",
            "suzano sa",
            "suzano papel e celulose",
        ],
    ),
    (
        "klabin",
        "Klabin",
        "89637490000145",
        [
            "klabin",
            "klabin s a",
            "klabin sa",
        ],
    ),
    # Telecomunicações e Tecnologia
    (
        "telefonica vivo",
        "Telefônica Brasil (Vivo)",
        "02558157000162",
        [
            "telefonica",
            "vivo",
            "telefonica brasil",
            "telefonica brasil s a",
            "telefonica vivo",
            "tefonica",
            "telefonica com",
            "telefonica.com",
            "telefonica brasil com br",
        ],
    ),
    (
        "claro",
        "Claro",
        "40432544000147",
        [
            "claro",
            "claro s a",
            "claro empresas",
            "embratel",
            "claro brasil",
        ],
    ),
    (
        "tim",
        "TIM",
        "02421421000111",
        [
            "tim",
            "tim s a",
            "tim sa",
            "tim brasil",
            "tim celular",
        ],
    ),
    (
        "algar telecom",
        "Algar Telecom",
        "71208516000174",
        [
            "algar",
            "algar telecom",
            "algar telecom s a",
            "algartelecom",
        ],
    ),
    (
        "eace",
        "EACE - Conectividade de Escolas",
        "45726363000147",
        [
            "eace",
            "entidade administradora da conectividade de escolas eace",
            "entidade administradora da conectividade das escolas eace",
            "entidade administradora da faixa eace",
            "entidade administradora da conectividade de escolas eace representando interesse proprio",
        ],
    ),
    (
        "google",
        "Google",
        "06990590000123",
        [
            "google",
            "google brasil",
            "google brasil internet ltda",
            "google brasil internet",
        ],
    ),
    (
        "microsoft",
        "Microsoft",
        "60316817000103",
        [
            "microsoft",
            "microsoft brasil",
            "microsoft informatica ltda",
        ],
    ),
    (
        "uber",
        "Uber",
        "17895646000187",
        [
            "uber",
            "uber do brasil",
            "uber do brasil tecnologia ltda",
        ],
    ),
    (
        "ifood",
        "iFood",
        "14380200000121",
        [
            "ifood",
            "ifood com agencia de restaurantes online s a",
            "ifood com agencia de restaurantes online",
        ],
    ),
    (
        "meta facebook",
        "Meta (Facebook)",
        "13347016000117",
        [
            "meta",
            "facebook",
            "facebook servicos online do brasil ltda",
            "facebook servicos online do brasil",
            "facebook servicos online",
            "meta plataformas de tecnologias do brasil ltda",
            "meta plataformas de tecnologias do",
            "meta platforms inc",
            "meta platforms technologies",
            "meta platforms technologies llc",
            "meta whatsapp no brasil",
            "meta whatsapp no",
            "meta no brasil",
            "meta no",
            "empresa meta",
            "meta brasil servicos s c",
            "meta brasil",
            "whatsapp brasil",
            "whatsapp llc",
            "meta platforms inc whatsapp",
            "meta digital",
        ],
    ),
    (
        "gauge",
        "Gauge",
        "07571218000145",
        [
            "gauge",
            "gauge comunicacao digital",
            "gauge servicos de comunicacao",
        ],
    ),
    # Aeroespacial, Aviação, Rodovias e Logística
    (
        "embraer",
        "Embraer",
        "07689002000189",
        [
            "embraer",
            "embraer s a",
            "empresa brasileira de aeronautica s a embraer",
            "empresa brasileira de aeronautica",
        ],
    ),
    (
        "vli logistica",
        "VLI Logística",
        "42276907000128",
        [
            "vli",
            "vli logistica",
            "vli multimodal",
            "vli multimodal s a",
        ],
    ),
    (
        "ccr",
        "Grupo CCR",
        "02846056000197",
        [
            "ccr",
            "grupo ccr",
            "motiva infraestrutura de mobilidade",
            "ccr s a",
        ],
    ),
    (
        "arteris",
        "Arteris",
        "02919555000167",
        [
            "arteris",
            "aretris",
            "arteris s a",
        ],
    ),
    (
        "rumo logistica",
        "Rumo Logística",
        "02387241000160",
        [
            "rumo",
            "rumo logistica",
            "rumo s a",
            "rumo sa",
            "rumo logistica operadora multimodal s a",
            "empresa rumo",
            "empresa rumo logistica",
            "rumo log",
            "concessionaria ferroviaria rumo logistica",
            "rumo malha norte",
            "rumo malha norte s a",
            "rumo malha paulista",
            "rumo malha paulista s a",
        ],
    ),
    (
        "azul linhas aereas",
        "Azul Linhas Aéreas",
        "09296295000160",
        [
            "azul",
            "azul linhas aereas",
            "azul linhas aereas brasileiras s a",
            "azul linhas aereas brasileiras",
            "azul linhas areas",
        ],
    ),
    (
        "gol linhas aereas",
        "Gol Linhas Aéreas",
        "07575651000159",
        [
            "gol",
            "gol linhas aereas",
            "gol linhas aereas s a",
            "gol transportes aereos",
        ],
    ),
    (
        "latam airlines",
        "LATAM Airlines",
        "02012862000160",
        [
            "latam",
            "latam airlines",
            "latam airlines brasil",
            "tam linhas aereas s a",
        ],
    ),
    # Bancos e Mercado Financeiro
    (
        "banco do brasil",
        "Banco do Brasil",
        "00000000000191",
        [
            "banco do brasil",
            "banco do brasil s a",
            "banco do brasil sa",
            "banco do",
            "liza castel bb com br",
        ],
    ),
    (
        "itau unibanco",
        "Itaú Unibanco",
        "60701190000104",
        [
            "itau",
            "banco itau",
            "itau unibanco",
            "itau unibanco s a",
            "itau unibanco sa",
            "banco itau unibanco",
        ],
    ),
    (
        "bradesco",
        "Bradesco",
        "60746948000112",
        [
            "bradesco",
            "banco bradesco",
            "banco bradesco s a",
            "banco bradesco sa",
        ],
    ),
    (
        "santander",
        "Santander",
        "90400888000142",
        [
            "santander",
            "banco santander",
            "banco santander brasil s a",
            "banco santander brasil",
            "santander brasil",
        ],
    ),
    (
        "caixa economica federal",
        "Caixa Econômica Federal",
        "00360305000104",
        [
            "caixa economica federal",
            "caixa economica",
            "cef",
        ],
    ),
    (
        "b3",
        "B3 (Brasil, Bolsa, Balcão)",
        "09346601000125",
        [
            "b3",
            "b3 sa",
            "b3 s a",
            "b3 brasil bolsa balcao",
            "b3 s a brasil bolsa balcao",
            "brasil bolsa balcao",
            "bsm supervisao de mercados",
        ],
    ),
    (
        "cielo",
        "Cielo",
        "01027058000191",
        [
            "cielo",
            "cielo s a",
            "cielo s a instituicao de pagamento",
        ],
    ),
    # Associações, Confederações e Terceiro Setor
    (
        "anbima",
        "ANBIMA",
        "34271171000177",
        [
            "anbima",
            "anbima associacao brasileira das entidades dos mercados financeiro e de capitais",
            "anbima associacao brasileira das entidades dos mercados financeiros e de capitais",
            "associacao brasileira das entidades dos mercados financeiro e de capitais",
            "associacao brasileira das entidades dos mercados financeiros e de capitais",
            "associacao brasileira das entidades dos mercados financeiro e de capitais anbima",
            "associacao brasileira das entidades dos mercados financeiros e de capitais anbima",
            "analista senior anbima",
            "gerente executivo anbima",
            "gerente anbima",
            "vice presidente anbima",
            "assessoria juridica compliance anbima",
            "representacao de mercados anbima",
            "representacao de distribuicao de produtos de investimento anbima",
            "jose carlos h doherty superintendente geral anbima",
        ],
    ),
    (
        "febraban",
        "FEBRABAN",
        "00068353000123",
        [
            "febraban",
            "federacao brasileira de bancos",
            "federacao brasileira de bancos febraban",
            "presidente febraban",
            "febraban federacao brasileira de bancos",
        ],
    ),
    (
        "cni",
        "CNI",
        "33665126000134",
        [
            "cni",
            "confederacao nacional da industria",
            "confederacao nacional da industria cni",
            "confederacao nacional da",
        ],
    ),
    (
        "cnt",
        "CNT",
        "00721183000134",
        [
            "cnt",
            "confederacao nacional do transporte",
            "confederacao nacional do transporte cnt",
        ],
    ),
    (
        "cna",
        "CNA",
        "33843798000139",
        [
            "cna",
            "confederacao da agricultura e pecuaria do brasil",
            "confederacao da agricultura e pecuaria do brasil cna",
        ],
    ),
    (
        "ibp",
        "IBP - Instituto Brasileiro de Petróleo e Gás",
        "33634254000110",
        [
            "ibp",
            "instituto brasileiro de petroleo e gas",
            "instituto brasileiro de petroleo",
            "ibp instituto brasileiro de petroleo e gas",
            "ibp instituto brasileiro de petroleo",
            "distribuicao ibp",
        ],
    ),
    (
        "abcr",
        "ABCR",
        "01435491000166",
        [
            "abcr",
            "assoc brasileira de concessionarias de rodovias abcr",
            "associacao brasileira de concessionarias de rodovias",
        ],
    ),
    (
        "abradee",
        "ABRADEE",
        "00058328000169",
        [
            "abradee",
            "abradee associacao brasileira distrib energia eletrica",
            "associacao brasileira de distribuidores de energia eletrica abradee",
            "associacao brasileira de distribuidores de energia eletrica",
        ],
    ),
    (
        "abrace energia",
        "ABRACE Energia",
        "53812772000194",
        [
            "abrace",
            "abrace energia",
            "associacao brasileira de grandes consumidores industriais de energia e de consumidores livres abrace",
        ],
    ),
    (
        "telcomp",
        "Telcomp",
        "03611622000144",
        [
            "telcomp",
            "telcomp associacao brasileira das prestadoras de servicos de telecomunicacoes competitivas",
            "associacao brasileira das prestadoras de servicos de telecomunicacoes competitivas telcomp",
        ],
    ),
    (
        "abear",
        "ABEAR",
        "15799709000176",
        [
            "abear",
            "associacao brasileira das empresas aereas",
            "associacao brasileira das empresas aereas abear",
        ],
    ),
    (
        "abiove",
        "ABIOVE",
        "00640409000172",
        [
            "abiove",
            "associacao brasileira das industrias de oleos vegetais",
            "associacao brasileira das industrias de oleos vegetais abiove",
        ],
    ),
    (
        "contag",
        "CONTAG",
        "33683202000134",
        [
            "contag",
            "confederacao nacional dos trabalhadores rurais agricultores e agricultoras familiares",
            "confederacao nacional dos trabalhadores rurais agricultores e agricultoras familiares contag",
        ],
    ),
    (
        "unacon sindical",
        "UNACON Sindical",
        "03659042000127",
        [
            "unacon",
            "unacon sindical",
            "sindicato nacional dos auditores e tecnicos federais de financas e controle",
        ],
    ),
    (
        "fundacao getulio vargas",
        "Fundação Getulio Vargas (FGV)",
        "33641663000144",
        [
            "fgv",
            "fundacao getulio vargas",
            "fundacao getulio vargas fgv projetos",
            "fgv projetos",
        ],
    ),
    (
        "pinheiro neto advogados",
        "Pinheiro Neto Advogados",
        "60613478000119",
        [
            "pinheiro neto",
            "pinheiro neto advogados",
        ],
    ),
    (
        "jbs",
        "JBS",
        "02916265000160",
        [
            "jbs",
            "jbs s a",
            "jbs sa",
            "jbs s/a",
            "jbs friboi",
        ],
    ),
    (
        "ambev",
        "Ambev",
        "07526557000100",
        [
            "ambev",
            "ambev s a",
            "ambev sa",
            "ambev s/a",
            "companhia de bebidas das americas ambev",
        ],
    ),
    (
        "bndes",
        "BNDES",
        "33657248000189",
        [
            "bndes",
            "banco nacional de desenvolvimento economico e social",
            "banco nacional de desenvolvimento economico e social bndes",
            "bndes banco nacional de desenvolvimento economico e social",
            "banco nacional do desenvolvimento bndes",
            "planejamento e estruturacao de projetos bndes",
        ],
    ),
    (
        "cnseg",
        "Confederação Nacional das Seguradoras (CNseg)",
        "10393001000105",
        [
            "cnseg",
            "confederacao nacional das seguradoras",
            "cnseg confederacao nacional das seguradoras",
            "confederacao nacional das empresas de seguros gerais previdencia privada e vida saude suplementar e capitalizacao cnseg",
            "confederacao nacional das empresas de seguros gerais previdencia privada e vida saude suplementar e capitalizacao",
            "relacoes institucionais cnseg",
        ],
    ),
    (
        "anfavea",
        "ANFAVEA - Associação Nacional dos Fabricantes de Veículos Automotores",
        "43054493000155",
        [
            "anfavea",
            "associacao nacional dos fabricantes de veiculos automotores",
            "associacao nacional dos fabricantes de veiculos automotores anfavea",
            "fabricantes de veiculos automotores anfavea",
        ],
    ),
    (
        "abimaq",
        "ABIMAQ - Associação Brasileira da Indústria de Máquinas e Equipamentos",
        "46390209000100",
        [
            "abimaq",
            "abimaq associacao brasileira da industria de maquinas e equipamentos",
            "associacao brasileira da industria de maquinas e equipamentos abimaq",
            "associacao brasileira da industria de maquinas e equipamentos",
            "associacao brasileira da ind de maquinas e equipamentos",
            "industria de maquinas e equipamentos abimaq",
            "diretor executivo abimaq",
            "csfm abimaq",
        ],
    ),
    (
        "cut",
        "Central Única dos Trabalhadores (CUT)",
        "60563731000177",
        [
            "cut",
            "central unica dos trabalhadores",
            "central unica dos trabalhadores cut",
            "cut central unica dos trabalhadores",
            "cut rj",
            "cut sp",
            "sinergia cut sp",
        ],
    ),
    (
        "mst",
        "MST - Movimento dos Trabalhadores Rurais Sem Terra",
        "20485818000159",
        [
            "mst",
            "movimento dos trabalhadores rurais sem terra",
            "movimento dos trabalhadores rurais sem terra mst",
            "movimento sem terra mst",
            "movimento sem terra",
            "coordenador nacional do mst",
            "representante do mst",
        ],
    ),
    (
        "sebrae",
        "Sebrae Nacional",
        "00330845000145",
        [
            "sebrae",
            "sebrae nacional",
            "servico brasileiro de apoio as micro e pequenas empresas",
            "serv brasileiro de apoio as micro e pequenas empresas",
        ],
    ),
    (
        "conexis",
        "Conexis Brasil Digital",
        "06102961000274",
        [
            "conexis",
            "conexis brasil digital",
            "conexis brasil digital sindicato nacional das empresas de telefonia e de servico movel celular e pessoal",
            "conexis sindicato nacional das empresas de telefonia e de servico movel celular e pessoal",
            "sindicato nacional das empresas de telefonia e de servico movel celular e pessoal",
        ],
    ),
    (
        "abr telecom",
        "ABR Telecom",
        "05243212000113",
        [
            "abr telecom",
            "associacao brasileira de recursos em telecomunicacoes",
            "associacao brasileira de recursos em telecomunicacoes abr telecom",
        ],
    ),
    (
        "brasscom",
        "BRASSCOM",
        "06244855000144",
        [
            "brasscom",
            "brasscom associacao das empresas de tecnologia da informacao e comunicacao tic e de tecnologias digitais",
            "associacao das empresas de tecnologia da informacao e comunicacao tic e de tecnologias digitais",
        ],
    ),
    (
        "transnordestina logistica",
        "Transnordestina Logística",
        "02281836000137",
        [
            "transnordestina",
            "transnordestina logistica",
            "transnordestina logistica s a",
            "ftl ferrovia transnordestina logistica",
            "ftl ferrovia transnordestina logistica s a",
            "ferrovia transnordestina logistica",
            "ferrovia transnordestina",
        ],
    ),
    (
        "abraceel",
        "Abraceel",
        "03701689000170",
        [
            "abraceel",
            "associacao brasileira dos comercializadores de energia",
            "associacao brasileira dos comercializadores de energia eletrica",
            "associacao brasileira dos comercializadores de energia abraceel",
        ],
    ),
    (
        "abiape",
        "ABIAPE",
        "07217526000177",
        [
            "abiape",
            "associacao brasileira dos investidores em autoproducao de energia",
            "associacao brasileira dos investidores em autoproducao de energia abiape",
        ],
    ),
    (
        "abeeolica",
        "ABEEólica",
        "08087674000187",
        [
            "abeeolica",
            "associacao brasileira de energia eolica",
            "associacao brasileira de energia eolica abeeolica",
            "abeeolica associacao brasileira de energia eolica e novas tecnologias",
            "associacao brasileira de energia eolica e novas tecnologias",
        ],
    ),
    (
        "absolar",
        "ABSOLAR",
        "19538290000150",
        [
            "absolar",
            "associacao brasileira de energia solar fotovoltaica",
            "associacao brasileira de energia solar fotovoltaica absolar",
            "absolar associacao brasileira de energia solar termica fotovoltaica",
        ],
    ),
    (
        "abrate",
        "ABRATE",
        "03638083000137",
        [
            "abrate",
            "associacao brasileira das empresas de transmissao de energia eletrica",
            "associacao brasileira das empresas de transmissao de energia eletrica abrate",
        ],
    ),
    (
        "sindigas",
        "SINDIGÁS",
        "44079002000193",
        [
            "sindigas",
            "sindicato nacional das empresas distribuidoras de gas liquefeito de petroleo",
            "sindicato nacional das empresas distribuidoras de gas liquefeito de petroleo sindigas",
        ],
    ),
    (
        "interfarma",
        "INTERFARMA",
        "31118508000112",
        [
            "interfarma",
            "interfarma associacao da industria farmaceutica de pesquisa",
            "associacao da industria farmaceutica de pesquisa",
        ],
    ),
    (
        "btg pactual",
        "BTG Pactual",
        "30306294000145",
        [
            "btg",
            "btg pactual",
            "banco btg",
            "banco btg pactual",
            "banco btg pactual s a",
            "btg pactual asset management",
            "btg pactual asset management s a distribuidora de titulos e valores mobiliarios",
        ],
    ),
    (
        "huawei",
        "Huawei do Brasil",
        "02975504000152",
        [
            "huawei",
            "huawei do brasil",
            "huawei do brasil telecomunicacoes ltda",
            "huawei do brasil telecomunicacoes",
        ],
    ),
    (
        "stefanini",
        "Stefanini",
        "58069360000120",
        [
            "stefanini",
            "stefanini it solutions",
            "empresa stefanini",
        ],
    ),
    (
        "mattos filho",
        "Mattos Filho Advogados",
        "67003673000176",
        [
            "mattos filho",
            "mattos filho advogados",
            "mattos filhos advogados",
            "mattos filho veiga filho marrey jr e quiroga advogados",
            "mattos filho veiga filho marrei jr e quiroga ad",
        ],
    ),
]


def extract_core_tokens(name: str) -> set[str]:
    """Extrai os tokens nucleares de uma entidade, removendo sufixos e stopwords."""
    norm = normalize_name(name)
    tokens = [t for t in norm.split() if t not in BUSINESS_STOPWORDS and len(t) > 1]
    return set(tokens)


def is_acronym_of(short_str: str, long_str: str) -> bool:
    """Detecta se short_str é sigla/acrônimo das palavras principais de long_str."""
    short_norm = normalize_name(short_str).replace(" ", "")
    if len(short_norm) < 2 or len(short_norm) > 10:
        return False
    long_tokens = [w for w in normalize_name(long_str).split() if w not in CONNECTORS and len(w) > 1]
    if not long_tokens:
        return False
    initials = "".join([w[0] for w in long_tokens])
    if short_norm == initials or short_norm in initials:
        return True
    pos = 0
    for tok in long_tokens:
        for sz in (3, 2, 1):
            if pos + sz <= len(short_norm) and tok.startswith(short_norm[pos:pos+sz]):
                pos += sz
                break
        if pos == len(short_norm):
            return True
    return False


def names_are_compatible(name1: str, name2: str) -> bool:
    """Verifica se duas variações de nome são compatíveis e representam a mesma entidade."""
    if not name1 or not name2:
        return False
    norm1, norm2 = normalize_name(name1), normalize_name(name2)
    if norm1 == norm2:
        return True

    # Se uma contém a outra como termo/expressão inteira (evita 'vale' casar com 'valec')
    shorter, longer = (norm1, norm2) if len(norm1) <= len(norm2) else (norm2, norm1)
    if len(shorter) >= 3 and shorter not in BUSINESS_STOPWORDS:
        pattern = r"(?:\A|\s)" + re.escape(shorter) + r"(?:\s|\Z)"
        if re.search(pattern, longer):
            return True

    # Se uma é sigla/acrônimo da outra
    if is_acronym_of(norm1, norm2) or is_acronym_of(norm2, norm1):
        return True

    core1 = extract_core_tokens(name1)
    core2 = extract_core_tokens(name2)

    if not core1 or not core2:
        return False

    # Se os tokens nucleares de um são subconjunto do outro (ex.: 'vale' in {'vale', 'holdings'})
    if core1.issubset(core2) or core2.issubset(core1):
        return True

    # Se compartilham algum token nuclear forte (>= 3 letras, ex.: 'vli', 'ccr', 'arteris')
    shared = {t for t in (core1 & core2) if len(t) >= 3}
    if shared:
        return True

    # Similaridade Levenshtein nas strings de tokens nucleares (somente com >= 6 letras para evitar 'vale' vs 'valec')
    str1 = " ".join(sorted(core1))
    str2 = " ".join(sorted(core2))
    if len(str1) >= 6 and len(str2) >= 6:
        if difflib.SequenceMatcher(None, str1, str2).ratio() >= 0.80:
            return True

    return False


ROLE_AND_DEPT_WORDS = ROLE_WORDS | {
    "vice", "senior", "junior", "pleno", "executivo", "executiva", "geral",
    "adjunto", "adjunta", "tecnico", "tecnica", "especialista", "assessoria",
    "juridico", "juridica", "compliance", "relacoes", "institucionais",
    "governamentais", "assuntos", "corporativos", "regulatorios", "comunicacao",
    "representacao", "mercados", "produtos", "investimento",
}


def build_catalog_indices() -> tuple[dict[str, tuple[str, str, str]], dict[str, tuple[str, str, str]], dict[str, tuple[str, str, str]]]:
    """Cria índices reversos: alias_norm -> canônica, cnpj_14 -> canônica e root_cnpj_8 -> canônica."""
    alias_map: dict[str, tuple[str, str, str]] = {}
    cnpj_map: dict[str, tuple[str, str, str]] = {}
    root_cnpj_map: dict[str, tuple[str, str, str]] = {}

    for norm, name, cnpj, aliases in CANONICAL_ENTITIES_CATALOG:
        info = (norm, name, cnpj)
        if cnpj:
            cnpj_map[cnpj] = info
            if len(cnpj) >= 8:
                root_cnpj_map[cnpj[:8]] = info
        for alias in aliases:
            a_norm = normalize_name(alias)
            if a_norm:
                alias_map[a_norm] = info

    return alias_map, cnpj_map, root_cnpj_map


def build_canonical_mapping_df(conn) -> pd.DataFrame:
    """Gera um DataFrame de de-para para unificar grafias em meetings.
    
    Colunas: old_norm, new_norm, new_name, new_cnpj
    """
    alias_map, catalog_cnpj_map, catalog_root_cnpj_map = build_catalog_indices()

    # Extrai todas as combinações existentes em meetings
    df_raw = conn.execute("""
        SELECT
            entity_norm,
            mode(entity_name) as entity_name,
            mode(entity_cnpj) FILTER (WHERE entity_cnpj IS NOT NULL) as entity_cnpj,
            count(*) as n
        FROM meetings
        WHERE entity_norm IS NOT NULL AND length(entity_norm) >= 2
        GROUP BY 1
    """).df()

    mapping_rows = []
    matched_norms = set()

    # 1. Aplica o catálogo de entidades notórias por alias direto
    for row in df_raw.itertuples():
        if row.entity_norm in alias_map:
            canon_norm, canon_name, canon_cnpj = alias_map[row.entity_norm]
            mapping_rows.append({
                "old_norm": row.entity_norm,
                "new_norm": canon_norm,
                "new_name": canon_name,
                "new_cnpj": canon_cnpj or row.entity_cnpj,
            })
            matched_norms.add(row.entity_norm)

    # 2. Match por CNPJ catalogado de 14 dígitos (matriz)
    for row in df_raw.itertuples():
        if row.entity_norm in matched_norms:
            continue
        if row.entity_cnpj and row.entity_cnpj in catalog_cnpj_map:
            canon_norm, canon_name, canon_cnpj = catalog_cnpj_map[row.entity_cnpj]
            if names_are_compatible(row.entity_norm, canon_norm):
                mapping_rows.append({
                    "old_norm": row.entity_norm,
                    "new_norm": canon_norm,
                    "new_name": canon_name,
                    "new_cnpj": canon_cnpj or row.entity_cnpj,
                })
                matched_norms.add(row.entity_norm)

    # 3. Match por Raiz de CNPJ (8 dígitos: filiais de entidades catalogadas)
    for row in df_raw.itertuples():
        if row.entity_norm in matched_norms:
            continue
        if row.entity_cnpj and len(str(row.entity_cnpj)) >= 8:
            root = str(row.entity_cnpj)[:8]
            if root in catalog_root_cnpj_map:
                canon_norm, canon_name, canon_cnpj = catalog_root_cnpj_map[root]
                if names_are_compatible(row.entity_norm, canon_norm):
                    mapping_rows.append({
                        "old_norm": row.entity_norm,
                        "new_norm": canon_norm,
                        "new_name": canon_name,
                        "new_cnpj": canon_cnpj or row.entity_cnpj,
                    })
                    matched_norms.add(row.entity_norm)

    # 4. Match por divisão de delimitador (' - ', ' – ', ' : ')
    # Ex: 'Analista Senior - ANBIMA', 'Diretor Executivo - ABIMAQ'
    for row in df_raw.itertuples():
        if row.entity_norm in matched_norms:
            continue
        if row.entity_name and any(d in row.entity_name for d in [" - ", " – ", " : "]):
            parts = re.split(r"\s+[\-–:]\s+", row.entity_name)
            for p in reversed(parts):
                pn = normalize_name(p.strip())
                if pn in alias_map:
                    canon_norm, canon_name, canon_cnpj = alias_map[pn]
                    mapping_rows.append({
                        "old_norm": row.entity_norm,
                        "new_norm": canon_norm,
                        "new_name": canon_name,
                        "new_cnpj": canon_cnpj or row.entity_cnpj,
                    })
                    matched_norms.add(row.entity_norm)
                    break

    # 5. Remoção de prefixo de cargo ou casamento de token final com alias
    # Ex: 'vice presidente anbima', 'gerente executivo anbima'
    for row in df_raw.itertuples():
        if row.entity_norm in matched_norms:
            continue
        tokens = row.entity_norm.split()
        if len(tokens) >= 2:
            # Se o último token for um alias e o prefixo for cargo/departamento
            if tokens[-1] in alias_map and len(tokens[-1]) >= 3:
                prefix = tokens[:-1]
                if all(t in ROLE_AND_DEPT_WORDS or len(t) <= 2 for t in prefix):
                    canon_norm, canon_name, canon_cnpj = alias_map[tokens[-1]]
                    mapping_rows.append({
                        "old_norm": row.entity_norm,
                        "new_norm": canon_norm,
                        "new_name": canon_name,
                        "new_cnpj": canon_cnpj or row.entity_cnpj,
                    })
                    matched_norms.add(row.entity_norm)
                    continue
            # Se começar por palavras de cargo
            i = 0
            while i < len(tokens) and (tokens[i] in ROLE_AND_DEPT_WORDS or len(tokens[i]) <= 2):
                i += 1
            if i > 0 and i < len(tokens):
                stripped = " ".join(tokens[i:])
                if stripped in alias_map:
                    canon_norm, canon_name, canon_cnpj = alias_map[stripped]
                    mapping_rows.append({
                        "old_norm": row.entity_norm,
                        "new_norm": canon_norm,
                        "new_name": canon_name,
                        "new_cnpj": canon_cnpj or row.entity_cnpj,
                    })
                    matched_norms.add(row.entity_norm)

    # 6. Agrupamento por Raiz de CNPJ (8 dígitos) para entidades não catalogadas
    df_remaining = df_raw[~df_raw["entity_norm"].isin(matched_norms)].copy()
    with_cnpj = df_remaining[df_remaining["entity_cnpj"].notna() & (df_remaining["entity_cnpj"].str.len() == 14)].copy()

    if not with_cnpj.empty:
        with_cnpj["root_cnpj"] = with_cnpj["entity_cnpj"].str[:8]
        with_cnpj["usable"] = ~(
            with_cnpj["entity_name"].map(is_generic)
            | with_cnpj["entity_name"].map(starts_with_role)
        )
        # Escolhe a forma canônica por raiz de CNPJ (mais frequente e válida)
        canonical_by_root = (
            with_cnpj.sort_values(["usable", "n"], ascending=[False, False])
            .drop_duplicates(subset=["root_cnpj"])
            .set_index("root_cnpj")[["entity_norm", "entity_name", "entity_cnpj"]]
        )

        for row in with_cnpj.itertuples():
            if row.root_cnpj in canonical_by_root.index:
                c_norm = canonical_by_root.loc[row.root_cnpj, "entity_norm"]
                c_name = canonical_by_root.loc[row.root_cnpj, "entity_name"]
                c_cnpj = canonical_by_root.loc[row.root_cnpj, "entity_cnpj"]
                # Apenas se houver mudança E os nomes forem compatíveis
                if (row.entity_norm != c_norm or row.entity_name != c_name) and names_are_compatible(row.entity_norm, c_norm):
                    mapping_rows.append({
                        "old_norm": row.entity_norm,
                        "new_norm": c_norm,
                        "new_name": c_name,
                        "new_cnpj": c_cnpj,
                    })

    if not mapping_rows:
        return pd.DataFrame(columns=["old_norm", "new_norm", "new_name", "new_cnpj"])

    df_map = pd.DataFrame(mapping_rows).drop_duplicates(subset=["old_norm"])
    return df_map


def unify_canonical_entities(conn) -> dict:
    """Executa a unificação completa e transacional de entidades no DuckDB fornecido."""
    logger.info("Iniciando construção do mapa canônico de entidades...")
    df_map = build_canonical_mapping_df(conn)

    if df_map.empty:
        logger.info("Nenhuma entidade necessita de unificação.")
        return {"entities_mapped": 0, "meetings_updated": 0}

    logger.info(f"Mapa construído com {len(df_map):,} regras de unificação.")

    # Registra no DuckDB como tabela temporária
    conn.register("tmp_canonical_map", df_map)

    # 1. Atualiza meetings
    logger.info("Atualizando tabela meetings...")
    conn.execute("""
        UPDATE meetings
        SET
            entity_norm = m.new_norm,
            entity_name = m.new_name,
            entity_cnpj = COALESCE(meetings.entity_cnpj, m.new_cnpj)
        FROM tmp_canonical_map m
        WHERE meetings.entity_norm = m.old_norm
    """)

    # 2. Propagação de CNPJ para registros sem CNPJ da mesma entidade canônica
    logger.info("Propagando CNPJs canônicos para audiências sem CNPJ...")
    conn.execute("""
        WITH dominant_cnpj AS (
            SELECT entity_norm, mode(entity_cnpj) as best_cnpj
            FROM meetings
            WHERE entity_cnpj IS NOT NULL AND length(entity_cnpj) = 14
            GROUP BY 1
        )
        UPDATE meetings
        SET entity_cnpj = d.best_cnpj
        FROM dominant_cnpj d
        WHERE meetings.entity_norm = d.entity_norm
          AND meetings.entity_cnpj IS NULL
    """)

    # 3. Recria tabela de entities
    logger.info("Reconstruindo tabela de entidades consolidadas...")
    conn.execute("DELETE FROM entities")
    conn.execute("""
        INSERT INTO entities
        SELECT
            entity_norm,
            mode(entity_name)                                           AS display_name,
            mode(entity_cnpj) FILTER (WHERE entity_cnpj IS NOT NULL)    AS cnpj,
            string_agg(DISTINCT entity_cnpj, ', ') FILTER (WHERE entity_cnpj IS NOT NULL) AS cnpjs,
            count(*)                                                    AS meetings_count,
            count(DISTINCT lobbyist_name)                               AS lobbyists_count,
            count(DISTINCT public_body)                                 AS bodies_count,
            count(DISTINCT authority_name)                              AS authorities_count,
            min(meeting_date)                                           AS first_meeting,
            max(meeting_date)                                           AS last_meeting
        FROM meetings
        GROUP BY entity_norm
    """)

    # 4. Atualiza tabela correlations
    logger.info("Sincronizando tabela correlations com entidades canônicas...")
    conn.execute("""
        UPDATE correlations
        SET
            entity_norm = m.new_norm,
            entity_name = m.new_name
        FROM tmp_canonical_map m
        WHERE correlations.entity_norm = m.old_norm
    """)

    # 5. Atualiza sanction_hits se existir
    tables = [t[0] for t in conn.execute("SHOW TABLES").fetchall()]
    if "sanction_hits" in tables:
        logger.info("Sincronizando tabela sanction_hits com entidades canônicas...")
        conn.execute("""
            UPDATE sanction_hits
            SET
                entity_norm = m.new_norm,
                entity_name = m.new_name
            FROM tmp_canonical_map m
            WHERE sanction_hits.entity_norm = m.old_norm
        """)

    conn.unregister("tmp_canonical_map")

    logger.info("Unificação de entidades concluída com sucesso.")
    return {
        "entities_mapped": len(df_map),
        "unique_canonical_entities": int(df_map["new_norm"].nunique()),
    }
