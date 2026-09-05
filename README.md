# Antessala — Plataforma de Inteligência Cívica e Auditoria de Relações Público-Privadas

[![Licença MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-emerald.svg)](LICENSE)
[![CGU Edital 46/2026](https://img.shields.io/badge/CGU-2%C2%BA%20Concurso%20Re%C3%BAso%20Dados-blue.svg)](https://dados.gov.br)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](backend_python/)
[![React + TypeScript](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TS-cyan.svg)](frontend/)

> **Projeto Antessala**  
> *Desenvolvido por Aislan Greca (Cientista de Dados) e o Antunes*  
> Contato: `robodoaislan@greca.dev.br`  
> Submetido ao **2º Concurso de Reúso de Dados Abertos da Controladoria-Geral da União (Edital CGU nº 46/2026)**.

---

## 📌 O que é o Antessala?

O **Antessala** é uma plataforma de inteligência cívica e controle social desenvolvida para auditar a relação entre o setor privado e o Governo Federal. O sistema realiza o cruzamento automatizado entre as agendas públicas do **e-Agendas (CGU)** e os atos normativos/contratuais do **Diário Oficial da União (DOU)**, identificando indicativos de proximidade temporal entre reuniões e atos contratuais ou regulatórios.

---

## ⚙️ Pré-requisitos & Dependências Fora do Git (`.gitignore`)

Para garantir o funcionamento completo sem carregar arquivos pesados no repositório, os dados e artefatos de runtime estão ignorados no `.gitignore`. O pipeline baixa e constrói tudo automaticamente no primeiro uso.

### Pré-requisitos do Sistema
- **Python 3.10+** (recomendado Python 3.11 ou superior)
- **Node.js 18+** e **npm**

### Arquivos Gerados/Ignorados pelo `.gitignore` (Baixados ou Construídos Automaticamente)
- `data/saril.duckdb` e `data/saril_serving.duckdb`: Banco de dados DuckDB compilado durante a ingestão.
- `data/cgu_sync_state.json`: Controle de estado das sincronizações incrementais do e-Agendas (CGU).
- `data/dou_cache/`: Cache local de requisições e páginas baixadas do Diário Oficial da União.
- `data/*.parquet`, `data/*.zip`, `data/*.duckdb`: Datasets intermediários e backups locais.

---

## 🚀 Como Instalar e Rodar

### 1. Clonar o Repositório
```bash
git clone https://github.com/asgreca/antessala.git
cd antessala
```

### 2. Execução Rápida (Recomendado)
O projeto possui um script de inicialização única que configura o ambiente virtual Python, instala dependências do backend/frontend e sobe os servidores:

```bash
chmod +x start.sh
./start.sh
```

Após rodar o script:
- **Interface Web (Frontend)**: http://localhost:5173
- **API Backend & Documentação Swagger**: http://localhost:8000/docs
- **Status do Pipeline de Sincronização**: http://localhost:8000/api/v1/sync/status

---

## 💻 Instalação & Execução Manual (Passo a Passo)

### Backend (Python / FastAPI / DuckDB)

```bash
cd backend_python

# 1. Criar e ativar venv
python3 -m venv venv
source venv/bin/activate  # ou ./venv/bin/python

# 2. Instalar dependências
pip install -r requirements.txt

# 3. Baixar dados do e-Agendas (CGU) e gerar o banco DuckDB
python -m saril.pipeline sync-cgu

# 4. Iniciar servidor FastAPI
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (React / Vite / TypeScript)

```bash
cd frontend

# 1. Instalar pacotes npm
npm install

# 2. Rodar ambiente de desenvolvimento
npm run dev
```

---

## 🧪 Testes Automatizados

Para executar os testes end-to-end do pipeline de sincronização e regras de negócio:

```bash
cd backend_python
./venv/bin/python test_cgu_sync.py
./venv/bin/python test_saril.py
```

---

## 📜 Licença

Distribuído sob a licença **MIT**. Veja `LICENSE` para mais informações.
