# Antessala — Plataforma de Inteligência Cívica e Auditoria de Relações Público-Privadas

[![Licença MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-emerald.svg)](LICENSE)
[![CGU Edital 46/2026](https://img.shields.io/badge/CGU-2%C2%BA%20Concurso%20Re%C3%BAso%20Dados-blue.svg)](https://dados.gov.br)
[![e-Agendas](https://img.shields.io/badge/Dados%20Abertos-e--Agendas%20%2B%20DOU%20%2B%20CEIS-059669.svg)](https://dados.gov.br)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](backend_python/)
[![React + TypeScript](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TS-cyan.svg)](frontend/)

> **Projeto Antessala**  
> *Desenvolvido por Aislan Greca (Cientista de Dados) e o Robô Antunes*  
> Contato: `robodoaislan@greca.dev.br`  
> Submetido ao **2º Concurso de Reúso de Dados Abertos da Controladoria-Geral da União (Edital CGU nº 46/2026)**.

---

## O que é o Antessala?

O **Antessala** é uma solução de inteligência de dados abertos e controle social que audita continuamente a influência de interesses privados sobre decisões do Governo Federal. 

O sistema responde de forma pericial e com fundamentação estatística à pergunta:  
***Uma reunião entre um representante privado e uma autoridade pública foi seguida, dias ou semanas depois, por um ato normativo, contrato de alto valor ou dispensa de licitação publicado no Diário Oficial da União (DOU)?***

---

## Arquitetura do Pipeline de Dados

```
Dados Abertos CGU (dados.gov.br) ──── CSVs Mensais e-Agendas (2023–presente, 1M+ compromissos)
                     │
                     ▼
         saril/cgu_downloader.py ──── Download resiliente, retries e hash SHA-256
                     │
                     ▼
         saril/cgu_incremental.py ─── Ingestão e delta por (event_id, lobbyist, entity)
                     │
                     ▼
               data/saril.duckdb ◄──── saril/dou_client.py  (in.gov.br, ao vivo)
                     │                 saril/dou_parser.py  (CNPJ, valor, contratada)
                     │                 saril/correlation.py (Δt ≤ 60 dias, IAI, ETT)
                     ▼
         data/saril_serving.duckdb  (Snapshot atômico com os.replace — zero downtime)
                     │
                     ▼
               saril/api.py  →  FastAPI :8000 (/docs)  →  React/Vite :5173
```

Backend único em Python. O DuckDB admite um só escritor, então o pipeline
publica um snapshot atômico (`saril_serving.duckdb`) que a API lê — a interface
continua respondendo durante a ingestão.

## Fontes de dados

| Fonte | Situação | Observação |
|---|---|---|
| e-Agendas / CGU | **ingerida** | Parquet consolidado 2023–2026, 1,22 M compromissos |
| DOU / Imprensa Nacional | **ingerida (dirigida)** | Busca pública do in.gov.br, seções DO1 e DO3 |
| Receita Federal (QSA) | **não ingerida** | Vínculos societários voltam vazios e sinalizados |
| TSE (doações) | **não ingerida** | Idem |

As duas últimas aparecem em `data_gaps` nas respostas da API. O sistema nunca
preenche uma lacuna com dado plausível: num instrumento de controle, um campo
inventado é pior que um campo vazio.

### Como o DOU é lido

A busca pública do in.gov.br devolve HTML com um `<script type="application/json">`
embutido contendo os atos já estruturados (órgão, tipo de ato, data, título,
ementa, slug). O texto integral — de onde saem CNPJ, contratada e valor — vem da
página do próprio ato.

```
GET https://www.in.gov.br/consulta/-/buscar/dou
    ?q="petrobras"&s=do3&exactDate=personalizado
    &publishFrom=01-01-2023&publishTo=31-12-2025&delta=50&currentPage=1
```

Sem autenticação. As respostas ficam em `data/dou_cache/`, então reprocessar não
gera tráfego novo. O intervalo entre requisições é configurável em
`saril/config.py` (`DOU_REQUEST_DELAY`).

## Uso e Automação Contínua (sync-cgu)

```bash
cd backend_python

# Sincronização incremental contínua do e-Agendas (CGU)
# Baixa arquivos novos, detecta deltas, classifica e publica snapshot atômico
./venv/bin/python -m saril.pipeline sync-cgu

# Para forçar reprocessamento integral
./venv/bin/python -m saril.pipeline sync-cgu --force

# Status do pipeline e histórico de ingestão
./venv/bin/python -m saril.pipeline status

# Varredura dirigida do DOU pelas entidades mais presentes na Esplanada
./venv/bin/python -m saril.pipeline ingest-dou --top 40 --max-pages 3

# Cruzamento temporal e geração de correlações
./venv/bin/python -m saril.pipeline correlate
```

Subir a aplicação completa:

```bash
./start.sh
```

- **Interface do Cidadão**: http://localhost:5173
- **Documentação Interativa de API (Swagger / OpenAPI)**: http://localhost:8000/docs
- **Status da Sincronização e Auditoria**: http://localhost:8000/api/v1/sync/status
- **Saúde da base e cobertura das fontes**: http://localhost:8000/api/v1/health

### Testes Automatizados de Ponta a Ponta

```bash
cd backend_python
./venv/bin/python test_cgu_sync.py   # Testes E2E do pipeline de sync (7/7 aprovados)
./venv/bin/python test_saril.py      # Testes da lógica forense e correlações
```

## Regra de correlação

**Uma correlação = um ato do DOU + uma entidade.** As reuniões anteriores são o
contexto que a qualifica, não alertas separados. Emitir um alerta por reunião
produzia 47 mil registros a partir de mil atos, porque uma empresa com 8.000
reuniões multiplica cada ato por toda a janela.

Exigências cumulativas:

1. **Vínculo entidade–ato.** Por CNPJ (prova documental) ou por razão social
   normalizada (indício, confiança ≥ 0,7). O casamento usa o *conjunto* de
   CNPJs já declarados para a entidade — matriz, filiais e controladora — e o
   CNPJ também gera o candidato, não apenas o confirma. A normalização remove
   acento e sufixo societário e exige contenção de *token* inteiro, por isso
   `Vale` não casa com `Valec`.
2. **Ato de benefício.** Só entram atos que outorgam algo: contrato, aditivo,
   inexigibilidade, dispensa, adesão, registro de preços, resolução, outorga,
   autorização. Acórdãos, resultados de julgamento, editais e penalidades
   mencionam a empresa sem lhe conferir nada.
3. **Direção temporal.** A reunião precede a publicação. Reunião posterior é
   descartada.
4. **Janela.** Δt ≤ 365 dias (`CORRELATION_WINDOW_DAYS`).
5. **Escopo.** Atos de prefeituras, governos estaduais e tribunais ficam fora
   (o e-Agendas cobre o Executivo federal), e entes públicos e cargos digitados
   no campo de empresa não são tratados como atores privados.

### Normalização pela cadência da entidade

A severidade vem da faixa de Δt (≤30 crítica, ≤90 alta, ≤180 média, ≤365 baixa),
mas é **rebaixada um degrau quando a proximidade é explicada pela própria
rotina da entidade**. Uma empresa com 2.400 reuniões na janela tem, em média,
uma reunião a cada 0,15 dia: encontrar uma no mesmo dia de um ato é certeza
estatística, não indício. Sem essa correção o índice premiava quem se reúne
mais.

```
lift = (janela / reuniões_na_janela) / (Δt + 1)
```

Uma entidade com 3 reuniões no ano e um ato 54 dias depois tem lift 2,2 — mais
próximo do que a rotina explicaria. A Embraer, com 2.070 reuniões e um aditivo
no mesmo dia, tem lift 0,18. A primeira pontua mais alto, e é a ordenação certa.

O score é agravado por valor, contratação sem licitação plena e coincidência
entre o órgão da reunião e o órgão publicador, e multiplicado pela confiança do
vínculo.

**Correlação temporal não é causalidade.** A interface e a API afirmam isso
explicitamente em cada resposta. O produto do Antessala é uma hipótese priorizada
com link para o ato original, não um veredito.

## Métricas

- **ETT (Entropia de Trânsito)** — entropia de Shannon da distribuição de órgãos
  visitados por um ator. 0 = concentrado num órgão; ~3 = circula uniformemente
  por 8. Valor alto caracteriza o "trânsito coringa".
- **IAI (Índice de Acesso Ilegítimo, 0–100)** — combina volume de acesso,
  alcance institucional, entropia e, com o maior peso, correlações documentais
  efetivamente encontradas no DOU. Acesso amplo, isolado, não pontua alto.
- **Índice de Transparência** — proporção de reuniões com pauta informativa.
  Pauta ausente ou com menos de 25 caracteres conta como opaca.

## O que foi corrigido nesta versão

Ver `quarentena_dados_sinteticos/LEIA-ME.md` para o inventário completo. Em
resumo, a versão anterior:

- **nunca acessou o DOU.** O scraper apontava para o catálogo CKAN de metadados
  do dados.gov.br e o parser da resposta era um `pass`; o caminho real de
  execução era um fallback com três registros escritos à mão;
- **servia correlações sorteadas.** `run_dou_temporal_correlation.py` gerava o
  Δt com `np.random.exponential(scale=14.0)`, e os 2 MB resultantes eram
  entregues pela API como correlação forense;
- **servia uma página falsa do Diário Oficial** (`MockDouController`) como
  destino do link de "prova material";
- **parseava as datas erradas.** O e-Agendas usa `dd-mm-yyyy`; sem `format=`,
  736.167 das 1.223.337 reuniões viravam `NaT` e as demais tinham dia e mês
  invertidos;
- **não integrava.** O `start.sh` anunciava o Java na 8090, o `application.yml`
  definia 8085, o Java rodava sobre H2 em memória com seed de demonstração, e
  não compartilhava fonte alguma com o Python.

O backend Java está preservado em
`quarentena_dados_sinteticos/backend_java_aposentado/`.

## Resultado da varredura atual

| | |
|---|---|
| Compromissos do e-Agendas lidos | 1.223.337 |
| Relações (visitante externo → autoridade) | 838.031 |
| Entidades privadas distintas | 72.153 |
| Participações reatribuídas por CNPJ | 487.855 → 13.264 entidades canônicas |
| Participações de entes públicos excluídas | 15.409 |
| Atos do DOU coletados | 1.778 |
| Correlações reais | 336 (50 críticas, 181 altas, 36 médias, 69 baixas) |

Cada alerta traz o link para o ato no in.gov.br e a base do vínculo, para que o
auditor confira antes de concluir.

## Escopo: quem entra na base

O Antessala audita a relação entre **pessoas externas ao governo** e **autoridades
públicas**. A reunião de quem está do lado de dentro é articulação
intergovernamental, não lobby privado.

**Fora da base:**

- Agências reguladoras e órgãos da administração direta e indireta
- Entes federativos (estados, municípios) e seus órgãos
- Conselhos profissionais — autarquias federais por lei (CFM, CREA, COFFITO…)
- Entidades de função estatal delegada: ONS, CCEE, EPE, ABDI, APEX-Brasil,
  AgSUS, CONIF
- Organismos internacionais (Banco Mundial, BID)
- Cargos digitados no campo de entidade ("Presidente", "Diretor de Relações
  Institucionais")

**Dentro da base**, por decisão de escopo:

- **Empresas de economia mista e estatais** — Petrobras, Banco do Brasil, Caixa,
  BNDES. Competem comercialmente, disputam contratos e fazem representação de
  interesse próprio; nisso se distinguem de uma agência que regula ou de um
  operador que exerce função delegada.
- Federações, confederações, associações setoriais e sindicatos — são
  representação de interesse organizada, e o objeto central da auditoria.

A lista de exclusão é **nominal**, nunca por padrão de nome: uma regra ampla com
"agência" removeria FIESP, FIRJAN, CBIC, ALANAC e o próprio iFood, cuja razão
social é "IFOOD.COM AGÊNCIA DE RESTAURANTES ONLINE S.A".

## Matriz Autoridade ↔ Lobista

A matriz por órgão traz a evidência na própria linha, para o auditor triar sem
navegar: o Δt desenhado como um **vão em escala fixa de 0 a 365 dias** (barra
curta = ato publicado logo após o encontro), o tipo de ato, o órgão emissor, o
valor, a base do vínculo e o link direto ao DOU. A ficha completa continua a um
clique.

O Δt exibido é medido a partir das reuniões **daquele par**, não da
reunião-âncora da correlação — que pode pertencer a outro representante da
mesma empresa. No dossiê individual vale a mesma regra, e os dois intervalos
(do ator e da entidade) aparecem lado a lado.

## Limites conhecidos

- A varredura do DOU é **dirigida** pelas entidades mais frequentes no
  e-Agendas. Uma empresa com poucas reuniões e um contrato grande não é
  alcançada até que a varredura completa do DO3 seja executada.
- Entidades de nome curto e ambíguo (`Oi`, `ONS`) não geram termo de busca:
  recuperariam ruído. Serão alcançadas quando houver ingestão por CNPJ.
- O e-Agendas não publica o CPF completo dos agentes privados, então a
  identidade do ator é a grafia do nome — homônimos não são desambiguados.
- A consolidação de entidades só funde o que compartilha CNPJ declarado.
  Grafias sem CNPJ algum (`ferrovia transnordestina`, `transnordestina`)
  permanecem separadas; fundi-las por semelhança de nome uniria Vale e Valec.
- O valor monetário nem sempre é extraível: resoluções e autorizações
  frequentemente não trazem montante no texto do ato.
- Vínculos societários e doações eleitorais dependem da ingestão de Receita
  Federal e TSE, ainda não implementada.
