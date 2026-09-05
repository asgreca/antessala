import React, { useState, useEffect } from 'react';
import { alertsService, PageResponse } from '../../services/alertsService';
import { AlertListItem, AlertSeverity } from '../../types/alert.types';

import { BadgeSeverity } from '../common/BadgeSeverity';
import { CompanyLogo } from '../common/CompanyLogo';
import { detectEntityCategory, getCategoryLabel } from '../../utils/companyLogo';
import { getApiUrl } from '../../services/api';
import { 
  ShieldAlert, Filter, ChevronLeft, ChevronRight, 
  ArrowRight, Search, Eye, Sparkles, Building2, User 
} from 'lucide-react';
import styles from './AlertsPage.module.css';

interface AlertsPageProps {
  onInspectPerson: (personId: string) => void;
}

/** Campos de proveniência da evidência, servidos pela API de correlações. */
type AlertWithEvidence = AlertListItem & {
  douUrl?: string;
  matchBasis?: 'CNPJ' | 'CNPJ_RAIZ' | 'RAZAO_SOCIAL';
  proximityLift?: number;
  priorMeetingsCount?: number;
};

const formatBRL = (v: number): string => {
  if (!v) return 'R$ 0';
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)} bi`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)} mi`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};

export const AlertsPage: React.FC<AlertsPageProps> = ({ onInspectPerson }) => {
  const [alerts, setAlerts] = useState<AlertWithEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<AlertSeverity | 'TODOS'>('TODOS');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [kpis, setKpis] = useState({
    critical: 0, high: 0, medium: 0, low: 0,
    highEntropy: 0, opaque: 0, douCorrelated: 0,
  });
  // Totais da base e valor correlacionado, ambos vindos da API. Estavam
  // escritos no JSX como "1,22 milhão" e "R$ 35,5 bilhões" — este último era o
  // total das correlações sorteadas que foram retiradas de circulação.
  const [totals, setTotals] = useState({ participations: 0, correlatedValue: 0, bodies: 0 });

  const loadData = async () => {
    setLoading(true);
    try {
      const [kpiRes, alertsRes] = await Promise.all([
        alertsService.getKpis(),
        alertsService.getAlerts(currentPage, 10, selectedSeverity === 'TODOS' ? undefined : selectedSeverity)
      ]);
      setKpis({
        critical: kpiRes.criticalAlertsCount,
        high: kpiRes.highAlertsCount,
        medium: kpiRes.mediumAlertsCount,
        low: kpiRes.lowAlertsCount,
        highEntropy: kpiRes.highEntropyLobbyistsCount,
        opaque: kpiRes.opaqueMeetingsCount,
        douCorrelated: kpiRes.correlatedDouActsCount
      });
      const statsRes = await fetch(getApiUrl('/api/v1/analytics/stats')).then((r) => r.json());
      setTotals({
        participations: statsRes.summary_numeric?.private_participations ?? 0,
        correlatedValue: statsRes.total_monetary_value_dou ?? 0,
        bodies: statsRes.summary_numeric?.distinct_public_bodies ?? 0,
      });
      setAlerts(alertsRes.content);
      setTotalPages(alertsRes.totalPages);
      setTotalElements(alertsRes.totalElements);
    } catch (err) {
      console.error('Erro ao carregar alertas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentPage, selectedSeverity]);

  return (
    <div className={styles.container}>
      {/* Hero Banner Institucional Antessala CGU */}
      <div className={styles.heroBanner}>
        <div className={styles.heroLeft}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <div className={styles.heroBadge}>
              <ShieldAlert size={14} /> Auditoria Contínua &bull; CGU
            </div>
          </div>
          <h1 className={styles.heroTitle}>
            Central de Alertas e Anomalias de Auditoria
          </h1>
          <p className={styles.heroSubtitle}>
            Detecção em tempo real de reuniões no e-Agendas que antecederam contratos, dispensas de licitação, convênios, termos de parceria ou atos normativos publicados no Diário Oficial da União envolvendo entidades externas (empresas, associações setoriais, confederações, ONGs, sindicatos e demais pessoas jurídicas) em {totals.bodies.toLocaleString('pt-BR')} órgãos federais.
          </p>

          <div className={styles.antunesQuoteCard}>
            <p>
              <strong>Metodologia Probatória Abrangente:</strong> Cruzamento algorítmico estrito entre o CNPJ da entidade externa (empresa, associação, federação, sindicato, ONG ou fundação) e os extratos publicados no DOU. Todo apontamento exibe a base de vínculo probatório e link direto para conferência na Imprensa Nacional.
            </p>
          </div>

          <button 
            className={styles.heroCtaBtn}
            onClick={() => {
              const el = document.getElementById('alerts-table');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <span>ANALISAR ALERTAS DE RISCO</span>
            <ArrowRight size={18} />
          </button>
        </div>

        <div className={styles.heroRight}>
          <img
            src="/antunes_mala.png"
            alt="Robô Antunes periciando evidências no DOU"
            className={styles.mascotImg}
          />
        </div>
      </div>

      {/* Título da Seção de Estatísticas */}
      <div className={styles.sectionHeader}>
        <h2>Estatísticas de Transparência do Executivo Federal</h2>
        <span>
          Dados consolidados de 01/01/2023 até hoje &bull;{' '}
          {totals.participations.toLocaleString('pt-BR')} participações privadas auditadas
        </span>
      </div>

      {/* Grid de KPIs Clean com Bordas Coloridas */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.kpiGreen}`}>
          <span className={styles.kpiValue}>{formatBRL(totals.correlatedValue)}</span>
          <span className={styles.kpiLabel}>Valor em atos do DOU correlacionados</span>
        </div>

        <div className={`${styles.kpiCard} ${styles.kpiBlue}`}>
          <span className={styles.kpiValue}>{totals.participations.toLocaleString('pt-BR')}</span>
          <span className={styles.kpiLabel}>Participações privadas auditadas</span>
        </div>

        <div className={`${styles.kpiCard} ${styles.kpiOrange}`}>
          <span className={styles.kpiValue}>{kpis.critical.toLocaleString()}</span>
          <span className={styles.kpiLabel}>Alertas Críticos de Risco</span>
        </div>

        <div className={`${styles.kpiCard} ${styles.kpiGold}`}>
          <span className={styles.kpiValue}>{kpis.highEntropy.toLocaleString()}</span>
          <span className={styles.kpiLabel}>Articuladores Multissetoriais</span>
        </div>
      </div>

      {/* Tabela de Alertas de Auditoria */}
      <div id="alerts-table" className={styles.tableCard}>
        <div className={styles.cardHeader}>
          <div className={styles.titleBox}>
            <ShieldAlert size={20} color="#DC2626" />
            <div>
              <h3>Central de Alertas de Auditoria</h3>
              <span>{totalElements.toLocaleString()} alertas de risco de auditoria identificados</span>
            </div>
          </div>

          <div className={styles.filterGroup}>
            <Filter size={16} />
            <span>Severidade:</span>
            {(['TODOS', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
              <button
                key={sev}
                className={`${styles.filterBtn} ${selectedSeverity === sev ? styles.filterBtnActive : ''}`}
                onClick={() => {
                  setSelectedSeverity(sev);
                  setCurrentPage(0);
                }}
              >
                {sev === 'CRITICAL' ? 'CRÍTICO' : sev === 'HIGH' ? 'ALTO' : sev === 'MEDIUM' ? 'MÉDIO' : sev === 'LOW' ? 'BAIXO' : 'TODOS'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '24px' }}>
            <div className="skeleton" style={{ height: '50px', width: '100%', marginBottom: '12px' }} />
            <div className="skeleton" style={{ height: '50px', width: '100%', marginBottom: '12px' }} />
            <div className="skeleton" style={{ height: '50px', width: '100%' }} />
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Severidade &amp; IAI</th>
                  <th>Alerta / Anomalia de Auditoria</th>
                  <th>Representante / Interlocutor</th>
                  <th>
                    <div className={styles.thHeader}>
                      <span>Entidade / Organização Externa</span>
                      <span className={styles.thSubtext}>Empresas, Associações, ONGs, Sindicatos e PJs</span>
                    </div>
                  </th>
                  <th>Autoridade Visitada</th>
                  <th>Base do vínculo</th>
                  <th>Prova no DOU</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((item) => (
                  <tr key={item.id} className={styles.tr}>
                    <td>
                      <BadgeSeverity severity={item.severity} score={item.iaiScore} />
                    </td>
                    <td>
                      <div>
                        <strong className={styles.alertTitle}>{item.title}</strong>
                        <div className={styles.alertDesc}>{item.description}</div>
                      </div>
                    </td>
                    <td>
                      <div 
                        className={styles.visitorCell}
                        onClick={() => onInspectPerson(item.visitorId)}
                      >
                        <User size={14} color="#0284C7" />
                        <span className={styles.visitorName}>{item.visitorName}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.entityCell}>
                        <span className={styles.companyBadge}>
                          <CompanyLogo name={item.organizationName} size={18} />
                          <span className={styles.entityNameText}>{item.organizationName}</span>
                        </span>
                        <span 
                          className={styles.categoryPill} 
                          data-cat={detectEntityCategory(item.organizationName)}
                        >
                          {getCategoryLabel(detectEntityCategory(item.organizationName))}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.authorityText}>
                        {item.authorityName || 'Autoridade Federal'}
                      </span>
                    </td>
                    <td>
                      {item.matchBasis?.startsWith('CNPJ') ? (
                        <span className={styles.basisStrong} title="Entidade identificada pelo CNPJ no ato">
                          CNPJ
                        </span>
                      ) : (
                        <span
                          className={styles.basisWeak}
                          title="Vínculo por semelhança de razão social / denominação — conferir o ato antes de concluir"
                        >
                          razão social
                        </span>
                      )}
                    </td>
                    <td>
                      {item.douUrl ? (
                        <a
                          className={styles.evidenceLink}
                          href={item.douUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir o ato publicado no Diário Oficial da União"
                        >
                          ver ato
                        </a>
                      ) : (
                        <span className={styles.authorityText}>—</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={styles.dossierBtn}
                        onClick={() => onInspectPerson(item.visitorId)}
                      >
                        <Eye size={14} />
                        <span>Abrir Ficha</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        <div className={styles.pagination}>
          <span>Página {currentPage + 1} de {totalPages || 1}</span>
          <div className={styles.pageBtnGroup}>
            <button
              className={styles.pageBtn}
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 0))}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <button
              className={styles.pageBtn}
              disabled={currentPage + 1 >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Próxima <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
