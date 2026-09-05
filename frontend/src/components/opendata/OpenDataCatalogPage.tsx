import React from 'react';
import { Database, ExternalLink, ShieldCheck, CheckCircle2, FileText, Globe, Layers, Download, Sparkles } from 'lucide-react';
import styles from './OpenDataCatalogPage.module.css';

interface OpenDataset {
  id: string;
  name: string;
  custodian: string;
  portalUrl: string;
  format: string;
  frequency: string;
  recordsCount: string;
  legalBasis: string;
  description: string;
  license: string;
}

const DATASETS: OpenDataset[] = [
  {
    id: 'e-agendas',
    name: 'e-Agendas — Agendas de Autoridades do Executivo Federal',
    custodian: 'Controladoria-Geral da União (CGU)',
    portalUrl: 'https://dados.gov.br/dados/conjuntos-dados/agenda-de-autoridades',
    format: 'CSV / CKAN API',
    frequency: 'Diária / Contínua',
    recordsCount: '1.220.000+ compromissos',
    legalBasis: 'Lei nº 12.813/2013 e Decreto nº 10.889/2021',
    description:
      'Registro oficial e obrigatório de compromissos públicos de ministros, secretários e dirigentes federais com agentes privados e grupos de interesse.',
    license: 'Open Data Commons / Domínio Público',
  },
  {
    id: 'dou',
    name: 'Diário Oficial da União (DOU) — Seções 1, 2 e 3',
    custodian: 'Imprensa Nacional (IN / Presidência da República)',
    portalUrl: 'https://www.in.gov.br/consulta/-/buscar/dou',
    format: 'JSON / HTML Estruturado',
    frequency: 'Diária (dias úteis)',
    recordsCount: '1.539+ atos auditados',
    legalBasis: 'Decreto nº 9.215/2017 e Lei nº 12.527/2011 (LAI)',
    description:
      'Publicações de atos normativos, portarias, contratos de alto valor, dispensas e inexigibilidades de licitação submetidas a cruzamento temporal.',
    license: 'Domínio Público Governamental',
  },
  {
    id: 'ceis',
    name: 'Cadastro Nacional de Empresas Inidôneas e Suspensas (CEIS)',
    custodian: 'Controladoria-Geral da União (CGU)',
    portalUrl: 'https://dados.gov.br/dados/conjuntos-dados/ceis',
    format: 'CSV / API de Transparência',
    frequency: 'Semanal',
    recordsCount: '18.400+ sanções ativas',
    legalBasis: 'Lei nº 12.846/2013 (Lei Anticorrupção) e Lei nº 14.133/2021',
    description:
      'Relação consolidada de empresas e profissionais impedidos de licitar e contratar com a Administração Pública brasileira.',
    license: 'Open Government Data',
  },
  {
    id: 'cnep',
    name: 'Cadastro Nacional de Empresas Punidas (CNEP)',
    custodian: 'Controladoria-Geral da União (CGU)',
    portalUrl: 'https://dados.gov.br/dados/conjuntos-dados/cnep',
    format: 'CSV / API de Transparência',
    frequency: 'Semanal',
    recordsCount: '1.900+ penalidades gravadas',
    legalBasis: 'Art. 22 da Lei nº 12.846/2013 (Lei Anticorrupção)',
    description:
      'Cadastro de pessoas jurídicas sancionadas pela prática de atos lesivos contra a administração pública nacional ou estrangeira.',
    license: 'Open Government Data',
  },
  {
    id: 'pncp',
    name: 'Portal Nacional de Contratações Públicas (PNCP)',
    custodian: 'Governo Federal / Ministério da Gestão e da Inovação',
    portalUrl: 'https://pncp.gov.br',
    format: 'REST API / Open Data',
    frequency: 'Tempo Real',
    recordsCount: 'Integrado sob demanda',
    legalBasis: 'Art. 174 da Lei nº 14.133/2021 (Nova Lei de Licitações)',
    description:
      'Sítio eletrônico oficial para divulgação obrigatória dos atos de contratação pública, licitações, atas e contratos federais.',
    license: 'Creative Commons Attribution',
  },
];

export const OpenDataCatalogPage: React.FC = () => {
  return (
    <div className={styles.container}>
      {/* Banner Principal */}
      <div className={styles.banner}>
        <div className={styles.bannerTitle}>
          <div className={styles.bannerIcon}>
            <Database size={24} />
          </div>
          <div className={styles.bannerText}>
            <h2>Catálogo de Dados Abertos Oficiais Governamentais</h2>
            <p>
              O <strong>Antessala</strong> é estritamente baseado no reúso ético e transparente de bases de dados
              públicas abertas, protegidas pela Lei de Acesso à Informação (Lei nº 12.527/2011) e catalogadas no
              Portal Brasileiro de Dados Abertos (<strong>dados.gov.br</strong>).
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <a
            href="https://dados.gov.br"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.portalLink}
            title="Acessar o Portal Brasileiro de Dados Abertos"
          >
            <Globe size={14} />
            <span>dados.gov.br</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Aviso de Conformidade com o Edital CGU nº 46/2026 */}
      <div className={styles.complianceNotice}>
        <ShieldCheck size={22} color="#16A34A" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div className={styles.complianceText}>
          <h4>Conformidade com os Requisitos de Admissibilidade (Item 4.1.4 do Edital CGU nº 46/2026)</h4>
          <p>
            Todos os conjuntos de dados exibidos são provenientes de fontes primárias do Governo Federal, sem retenção
            ou modificação de fatos oficiais. As transformações algorítmicas implementadas (IAI, ETT e Janela Temporal
            $\Delta t \le 60$ dias) são de código aberto (Licença MIT), permitindo auditoria pericial e reprodução
            independente por qualquer cidadão.
          </p>
        </div>
      </div>

      {/* Grid de Datasets */}
      <div className={styles.grid}>
        {DATASETS.map((ds) => (
          <div key={ds.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleArea}>
                <span className={styles.custodian}>{ds.custodian}</span>
                <h3 className={ds.name.length > 40 ? styles.datasetName : styles.datasetName}>
                  {ds.name}
                </h3>
              </div>
              <span className={styles.formatBadge}>{ds.format}</span>
            </div>

            <p className={styles.description}>{ds.description}</p>

            <div className={styles.metadataGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Periodicidade:</span>
                <span className={styles.metaValue}>{ds.frequency}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Registros Processados:</span>
                <span className={styles.metaValue}>{ds.recordsCount}</span>
              </div>
              <div className={styles.metaItem} style={{ gridColumn: 'span 2' }}>
                <span className={styles.metaLabel}>Fundamento Legal:</span>
                <span className={styles.metaValue} style={{ fontSize: '0.74rem' }}>{ds.legalBasis}</span>
              </div>
            </div>

            <div className={styles.cardFooter}>
              <span className={styles.licenseTag}>
                <CheckCircle2 size={13} color="#059669" />
                <span>{ds.license}</span>
              </span>

              <a
                href={ds.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.portalLink}
                title={`Acessar dataset oficial no ${ds.portalUrl}`}
              >
                <span>Acessar no dados.gov.br</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OpenDataCatalogPage;
