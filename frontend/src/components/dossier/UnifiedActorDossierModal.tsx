import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DossierDetail } from '../../types/dossier.types';
import { GraphNetworkData } from '../../types/graph.types';
import { dossierService } from '../../services/dossierService';
import { graphService } from '../../services/graphService';
import { InfluenceGraph } from '../graph/InfluenceGraph';
import { BadgeSeverity } from '../common/BadgeSeverity';
import { LobbyistCharts } from '../charts/LobbyistCharts';
import { 
  X, User, Building2, ShieldAlert, Share2, BarChart3, 
  FileText, ExternalLink, AlertTriangle, Sparkles, Loader2,
  Calendar, Landmark, Search, Filter, ArrowRight, ChevronLeft, ChevronRight, CheckCircle, HelpCircle,
  Printer, Database, Compass, Eye, Users
} from 'lucide-react';
import { getApiUrl } from '../../services/api';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { CompanyLogo } from '../common/CompanyLogo';
import { AuthorityAvatar } from '../common/AuthorityAvatar';
import styles from './UnifiedActorDossierModal.module.css';

interface UnifiedActorDossierModalProps {
  personId: string | null;
  targetAuthorityName?: string | null;
  onClose: () => void;
  /** Navega para a ficha de outro ator — usado quando um representante da
   *  mesma empresa esteve mais próximo do ato. */
  onInspectPerson?: (personId: string) => void;
  /** Navega para a ficha/dossiê da autoridade pública */
  onInspectAuthority?: (authorityName: string) => void;
}

/** Escala o valor à sua ordem de grandeza: dividir tudo por 1e6 exibia
 *  "R$ 0.0M" para um contrato de R$ 34 mil. */
/** A relação é a pergunta central: um ato próximo no tempo mas de outra matéria
 *  é coincidência, não indício. Rotulada em português para o auditor. */
const RELATION_LABEL: Record<string, string> = {
  mesma_materia: 'Mesma matéria',
  materia_conexa: 'Matéria conexa',
  sem_relacao: 'Sem relação',
  indeterminado: 'Impossível determinar (pauta genérica)',
};

const relationClass = (relation: string): string =>
  relation === 'mesma_materia'
    ? 'relationStrong'
    : relation === 'materia_conexa'
      ? 'relationMedium'
      : relation === 'sem_relacao'
        ? 'relationNone'
        : 'relationIndeterminate';

/** aaaa-mm-dd -> dd/mm/aaaa */
const brDate = (iso?: string): string =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
    : (iso ?? '—');

const formatBRL = (v: number): string => {
  if (!v) return 'sem valor no ato';
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)} bi`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(2)} mi`;
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
};

export const UnifiedActorDossierModal: React.FC<UnifiedActorDossierModalProps> = ({
  personId,
  targetAuthorityName,
  onClose,
  onInspectPerson,
  onInspectAuthority,
}) => {
  const [dossier, setDossier] = useState<DossierDetail | null>(null);
  const [graphData, setGraphData] = useState<GraphNetworkData | null>(null);
  // Erro medido do classificador de relação. Exibido junto da coluna que ele
  // alimenta: um julgamento automatizado sem erro conhecido é afirmação sem
  // lastro, e o auditor precisa saber com o que está lidando.
  const [reliability, setReliability] = useState<{
    measured: boolean; summary?: string; warning?: string;
    goldSize?: number; promptVersion?: string; model?: string;
  } | null>(null);

  useEffect(() => {
    fetch(getApiUrl('/api/v1/analytics/llm-reliability'))
      .then((r) => r.json())
      .then(setReliability)
      .catch(() => setReliability(null));
  }, []);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'RESUMO' | 'AUDIENCIAS' | 'GRAFO' | 'GRAFICOS' | 'DOCUMENTOS'>('RESUMO');

  // Filtros customizáveis de período e órgão para recálculo do Dossiê em tempo real
  const [customStartDate, setCustomStartDate] = useState<string>('2023-01-01');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [customOrgan, setCustomOrgan] = useState<string>('ALL');

  // Filtros e paginação da aba de Audiências (e-Agendas)
  const [audienceSearch, setAudienceSearch] = useState<string>('');
  const [audienceOrganFilter, setAudienceOrganFilter] = useState<string>('ALL');
  const [audienceEntityFilter, setAudienceEntityFilter] = useState<string>('ALL');
  const [audienceOpaqueFilter, setAudienceOpaqueFilter] = useState<'ALL' | 'OPAQUE' | 'CLEAR'>('ALL');
  const [audiencePage, setAudiencePage] = useState<number>(1);
  const AUDIENCES_PER_PAGE = 15;

  // Estado do Relatório Completo via LLM (DeepSeek / OpenAI)
  const [llmReport, setLlmReport] = useState<string | null>(null);
  const [llmLoading, setLlmLoading] = useState<boolean>(false);
  const [llmProvider, setLlmProvider] = useState<string | null>(null);
  const [llmGeneratedAt, setLlmGeneratedAt] = useState<string | null>(null);
  const [llmIsCached, setLlmIsCached] = useState<boolean>(false);
  const [llmDataHash, setLlmDataHash] = useState<string | null>(null);
  const [llmEvidenceCounts, setLlmEvidenceCounts] = useState<{ meetings: number; correlations: number; companyDouActs: number } | null>(null);

  const handleGenerateLlmReport = async () => {
    if (!personId) return;
    setLlmLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/v1/dossier/generate-report/${personId}`), {
        method: 'POST',
      });
      const data = await res.json();
      if (data.report) {
        setLlmReport(data.report);
        setLlmProvider(data.provider || 'Robô Antunes AI');
        setLlmGeneratedAt(data.generatedAt || null);
        setLlmIsCached(Boolean(data.isCached));
        setLlmDataHash(data.dataHash || null);
        setLlmEvidenceCounts(data.evidenceCounts || null);
      }
    } catch (err: any) {
      console.error('Erro ao gerar relatório LLM:', err);
    } finally {
      setLlmLoading(false);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  // Fechar com a tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Carrega os dados reais do dossiê (FastAPI + DuckDB)
  const loadData = useCallback(() => {
    if (!personId) return;
    setLoading(true);
    setError(null);
    setLlmReport(null);
    setAudiencePage(1);

    const queryParams = new URLSearchParams();
    if (customStartDate) queryParams.append('start_date', customStartDate);
    if (customEndDate) queryParams.append('end_date', customEndDate);
    if (customOrgan && customOrgan !== 'ALL') queryParams.append('public_body', customOrgan);

    const dossierUrl = `/api/v1/dossier/person/${personId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    Promise.all([
      fetch(getApiUrl(dossierUrl)).then((r) => {
        if (!r.ok) throw new Error(`Falha ao carregar dossiê: ${r.status}`);
        return r.json();
      }),
      fetch(getApiUrl(`/api/v1/graph/subgraph/${personId}?depth=2`)).then((r) => {
        if (!r.ok) throw new Error(`Falha ao carregar grafo: ${r.status}`);
        return r.json();
      }),
    ])
      .then(([dossierData, graphNetData]) => {
        setDossier(dossierData);
        setGraphData(graphNetData);
      })
      .catch((err) => {
        console.error('Erro ao buscar dados do dossiê:', err);
        setError('Não foi possível carregar os dados deste ator público ou privado.');
      })
      .finally(() => setLoading(false));
  }, [personId, targetAuthorityName, customStartDate, customEndDate, customOrgan]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Entidades e empresas representadas pelo interlocutor
  const representedEntitiesStats = useMemo(() => {
    if (!dossier) return [];
    const counts = new Map<string, number>();

    if (dossier.audienceTimeline) {
      dossier.audienceTimeline.forEach((a) => {
        const ent = a.representedEntity || (a as any).entityName;
        if (ent && ent.trim() && ent.trim() !== 'Não especificada' && ent.trim() !== 'Não informado') {
          const clean = ent.trim();
          counts.set(clean, (counts.get(clean) ?? 0) + 1);
        }
      });
    }

    if (dossier.representedEntities && Array.isArray(dossier.representedEntities)) {
      dossier.representedEntities.forEach((ent) => {
        if (ent && ent.trim() && !counts.has(ent.trim())) {
          counts.set(ent.trim(), 1);
        }
      });
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [dossier]);

  const primaryCompany = representedEntitiesStats[0]?.name || dossier?.societaryLinks?.[0]?.corporateName;
  const otherCompaniesCount = Math.max(0, representedEntitiesStats.length - 1);

  // Lista de órgãos únicos visitados pelo ator
  const audienceOrgans = useMemo(() => {
    if (!dossier?.audienceTimeline) return [];
    const set = new Set<string>();
    dossier.audienceTimeline.forEach((a) => {
      if (a.publicBodyName) set.add(a.publicBodyName);
    });
    return Array.from(set).sort();
  }, [dossier?.audienceTimeline]);

  // Contagens para o seletor de pauta
  const opaqueCount = useMemo(() => {
    if (!dossier?.audienceTimeline) return 0;
    return dossier.audienceTimeline.filter(a => Boolean(a.isOpaque)).length;
  }, [dossier?.audienceTimeline]);

  const clearCount = useMemo(() => {
    if (!dossier?.audienceTimeline) return 0;
    return dossier.audienceTimeline.filter(a => !Boolean(a.isOpaque)).length;
  }, [dossier?.audienceTimeline]);

  // Audiências filtradas
  const filteredAudiences = useMemo(() => {
    if (!dossier?.audienceTimeline) return [];
    return dossier.audienceTimeline.filter((aud) => {
      if (audienceOrganFilter !== 'ALL' && aud.publicBodyName !== audienceOrganFilter) {
        return false;
      }
      if (
        audienceEntityFilter !== 'ALL' &&
        (aud.representedEntity || '').toLowerCase() !== audienceEntityFilter.toLowerCase()
      ) {
        return false;
      }
      const isOpaque = Boolean(aud.isOpaque);
      if (audienceOpaqueFilter === 'OPAQUE' && !isOpaque) return false;
      if (audienceOpaqueFilter === 'CLEAR' && isOpaque) return false;
      if (audienceSearch.trim()) {
        const q = audienceSearch.toLowerCase();
        const match =
          (aud.authorityName?.toLowerCase().includes(q) ?? false) ||
          (aud.publicBodyName?.toLowerCase().includes(q) ?? false) ||
          (aud.declaredTopic?.toLowerCase().includes(q) ?? false) ||
          (aud.representedEntity?.toLowerCase().includes(q) ?? false);
        if (!match) return false;
      }
      return true;
    });
  }, [dossier?.audienceTimeline, audienceOrganFilter, audienceEntityFilter, audienceOpaqueFilter, audienceSearch]);

  const totalAudiencePages = Math.max(1, Math.ceil(filteredAudiences.length / AUDIENCES_PER_PAGE));
  const paginatedAudiences = useMemo(() => {
    const start = (audiencePage - 1) * AUDIENCES_PER_PAGE;
    return filteredAudiences.slice(start, start + AUDIENCES_PER_PAGE);
  }, [filteredAudiences, audiencePage]);

  if (!personId) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ficha do Representante"
      >
        {/* Header da Ficha */}
        <div className={styles.modalHeader}>
          {loading || !dossier ? (
            <div className="skeleton" style={{ height: '40px', width: '300px' }} />
          ) : (
            <div className={styles.actorInfoBox}>
              <div className={styles.avatarBox}>
                <User size={28} />
              </div>
              <div className={styles.actorTitle}>
                <h2>{dossier.person.name}</h2>
                <div className={styles.metaRow}>
                  <span className="font-mono">CPF: {dossier.person.maskedCpf}</span>
                  {primaryCompany && (
                    <span
                      className={styles.companyBadge}
                      title={`Empresa/Entidade representada: ${primaryCompany}${representedEntitiesStats.length > 1 ? ` (atua por ${representedEntitiesStats.length} entidades no total)` : ''}`}
                    >
                      <CompanyLogo name={primaryCompany} size={15} /> Representa: <strong>{primaryCompany}</strong>
                      {otherCompaniesCount > 0 && (
                        <span style={{ opacity: 0.85, marginLeft: '4px', fontWeight: 'normal' }}>
                          (+{otherCompaniesCount} {otherCompaniesCount === 1 ? 'outra' : 'outras'})
                        </span>
                      )}
                    </span>
                  )}
                  {dossier.audienceTimeline.length > 0 && dossier.audienceTimeline[0].authorityName && (
                    <button
                      type="button"
                      className={styles.authorityBadge}
                      style={{
                        cursor: onInspectAuthority ? 'pointer' : 'default',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 8px',
                      }}
                      onClick={() => onInspectAuthority && onInspectAuthority(dossier.audienceTimeline[0].authorityName)}
                      title={onInspectAuthority ? `Abrir Dossiê da Autoridade: ${dossier.audienceTimeline[0].authorityName}` : undefined}
                    >
                      <AuthorityAvatar
                        name={dossier.audienceTimeline[0].authorityName}
                        role={dossier.audienceTimeline[0].authorityRole}
                        size={20}
                        showBadge={false}
                      />
                      <span>Visitou: {dossier.audienceTimeline[0].authorityName}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img 
              src="/logo_antessala.png" 
              alt="Antessala — Monitorando Agenda. Rastreando Influências." 
              style={{ height: '42px', width: 'auto' }} 
              title="Antessala — Monitorando Agenda. Rastreando Influências."
            />
            {dossier && (
              <BadgeSeverity
                severity={
                  dossier.person.iaiScore >= 75 ? 'CRITICAL' :
                  dossier.person.iaiScore >= 50 ? 'HIGH' :
                  dossier.person.iaiScore >= 25 ? 'MEDIUM' : 'LOW'
                }
                score={dossier.person.iaiScore}
              />
            )}
            <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar ficha">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Abas Internas da Ficha */}
        <div className={styles.tabsHeader}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'RESUMO' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('RESUMO')}
          >
            <ShieldAlert size={16} />
            <span>1. Resumo &amp; Diagnóstico</span>
          </button>

          <button
            className={`${styles.tabBtn} ${activeTab === 'AUDIENCIAS' ? styles.tabActive : ''}`}
            onClick={() => {
              setActiveTab('AUDIENCIAS');
              setAudiencePage(1);
            }}
          >
            <Calendar size={16} />
            <span>2. Audiências no e-Agendas ({dossier?.audienceTimeline?.length || 0})</span>
          </button>

          <button
            className={`${styles.tabBtn} ${activeTab === 'GRAFO' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('GRAFO')}
          >
            <Share2 size={16} />
            <span>3. Grafo de Influência</span>
          </button>

          <button
            className={`${styles.tabBtn} ${activeTab === 'GRAFICOS' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('GRAFICOS')}
          >
            <BarChart3 size={16} />
            <span>4. Gráficos &amp; Pautas</span>
          </button>

          <button
            className={`${styles.tabBtn} ${activeTab === 'DOCUMENTOS' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('DOCUMENTOS')}
          >
            <FileText size={16} />
            <span>5. Documentos no DOU ({dossier?.douCorrelations?.length || 0})</span>
          </button>
        </div>

        {/* Corpo da Ficha */}
        <div className={styles.modalBody}>
          {error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '60px 24px', textAlign: 'center' }}>
              <AlertTriangle size={42} color="#EF4444" />
              <strong style={{ fontSize: '1.15rem', color: 'var(--text-primary)' }}>Falha ao Carregar Dossiê</strong>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', fontSize: '0.88rem', lineHeight: '1.5' }}>{error}</p>
              <button
                type="button"
                style={{ padding: '8px 20px', background: 'var(--primary)', color: '#FFFFFF', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem' }}
                onClick={loadData}
              >
                Tentar Novamente
              </button>
            </div>
          ) : loading || !dossier ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
              <div className="skeleton" style={{ height: '80px', width: '100%' }} />
              <div className="skeleton" style={{ height: '200px', width: '100%' }} />
            </div>
          ) : (
            <>
              {/* PAINEL DE REFILTRAGEM CUSTOMIZADA DA FICHA EM TEMPO REAL */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                  <Filter size={15} color="#00A859" />
                  <span>Filtros do Dossiê:</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>De:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        color: '#0F172A',
                        background: '#FFFFFF'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>Até:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        color: '#0F172A',
                        background: '#FFFFFF'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>Órgão:</span>
                    <select
                      value={customOrgan}
                      onChange={(e) => setCustomOrgan(e.target.value)}
                      style={{
                        padding: '4px 10px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        color: '#0F172A',
                        background: '#FFFFFF',
                        maxWidth: '180px'
                      }}
                    >
                      <option value="ALL">Todos os Órgãos</option>
                      {Array.from(new Set(dossier.audienceTimeline.map(a => a.publicBodyName).filter(Boolean))).map((org, oIdx) => (
                        <option key={oIdx} value={org}>{org}</option>
                      ))}
                    </select>
                  </div>

                  {(customStartDate !== '2023-01-01' || customEndDate !== '' || customOrgan !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomStartDate('2023-01-01');
                        setCustomEndDate('');
                        setCustomOrgan('ALL');
                      }}
                      style={{
                        padding: '4px 10px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '6px',
                        color: '#0284C7',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Limpar Filtros
                    </button>
                  )}
                </div>
              </div>

              {/* TAB 1: RESUMO & DIAGNÓSTICO */}
              {activeTab === 'RESUMO' && (
                <>
                  <div className={styles.kpiSummaryGrid}>
                    <div className={styles.kpiMiniCard}>
                      <span className={styles.kpiMiniLabel}>Entropia de Trânsito (ETT)</span>
                      <span className={styles.kpiMiniVal}>{dossier.person.entropyScore.toFixed(2)} ETT</span>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                        {dossier.person.entropyScore < 1.0 ? 'Alta Concentração Temática' : 'Alta Dispersão Cívica'}
                      </span>
                    </div>

                    <div className={styles.kpiMiniCard}>
                      <span className={styles.kpiMiniLabel}>Índice IAI Risco</span>
                      <span className={styles.kpiMiniVal} style={{ color: dossier.person.iaiScore >= 75 ? '#EF4444' : '#F59E0B' }}>
                        {dossier.person.iaiScore} / 100
                      </span>
                      {(dossier.person as any).benchmark && (
                        <span style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 700, marginTop: '2px' }}>
                          {(dossier.person as any).benchmark.percentileRank} &bull; {(dossier.person as any).benchmark.quartile}
                        </span>
                      )}
                    </div>

                    <div className={styles.kpiMiniCard}>
                      <span className={styles.kpiMiniLabel}>Total Audiências</span>
                      <span className={styles.kpiMiniVal}>{dossier.audienceTimeline.length} Reuniões</span>
                      {(dossier.person as any).benchmark && (
                        <span style={{ fontSize: '0.72rem', color: '#0284C7', marginTop: '2px' }}>
                          {(dossier.person as any).benchmark.distinctOrgans} órgãos visitados
                        </span>
                      )}
                    </div>

                    <div className={styles.kpiMiniCard}>
                      <span className={styles.kpiMiniLabel}>Contratos DOU Correlacionados</span>
                      <span className={styles.kpiMiniVal}>{dossier.douCorrelations.length} Atos</span>
                    </div>
                  </div>

                  {/* BLOCO DE RELATÓRIO FORENSE VIA LLM (ROBÔ ANTUNES / DEEPSEEK) */}
                  <div className={styles.sectionBox} style={{ border: '1.5px solid #00A859', background: '#F0FDF4' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                      <div className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Sparkles size={20} color="#00A859" />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>
                            Relatório Forense de Inteligência &mdash; Robô Antunes
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#008A4B', fontWeight: 600 }}>
                            Análise Pericial &bull; Cruzamento Integral e-Agendas (CGU) &times; DOU
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.llmReportBtn}
                        onClick={handleGenerateLlmReport}
                        disabled={llmLoading}
                      >
                        {llmLoading ? (
                          <>
                            <Loader2 size={16} className={`${styles.spinIcon} spin`} />
                            <span>Antunes Analisando Dados...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            <span>{llmReport ? 'Regerar Relatório com Antunes' : 'Gerar Relatório Completo via LLM'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {llmReport ? (
                      <div className={styles.llmReportBox} id="printable-antunes-report" style={{ marginTop: '14px', background: '#FFFFFF' }}>
                        {/* Cabeçalho de Impressão Oficial com Antunes */}
                        <div className={styles.printHeaderBox}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <img
                              src="/logo_antessala.png"
                              alt="Antessala — Monitorando Agenda. Rastreando Influências."
                              style={{ height: '68px', width: 'auto', objectFit: 'contain' }}
                            />
                            <div style={{ borderLeft: '1.5px solid #CBD5E1', paddingLeft: '14px' }}>
                              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                                RELATÓRIO FORENSE DE AUDITORIA &bull; CONTROLE SOCIAL
                              </div>
                              <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#00A859' }}>
                                Robô Antunes &bull; Auditor Robô Aposentado &bull; Análise de Agendas Públicas
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                                Interlocutor Auditado: <strong>{dossier.person.name}</strong> (CPF: {dossier.person.maskedCpf})
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <img
                              src="/antunes_mala.png"
                              alt="Robô Antunes"
                              className={styles.printMascotImg}
                              style={{ height: '54px', width: 'auto' }}
                            />
                            <div style={{ textAlign: 'right', fontSize: '0.72rem', color: '#64748B' }}>
                              <div>Data da Análise: {llmGeneratedAt ? new Date(llmGeneratedAt).toLocaleString('pt-BR') : 'Tempo Real'}</div>
                              {llmDataHash && (
                                <div className="font-mono" style={{ fontSize: '0.66rem', color: '#94A3B8' }}>
                                  Hash: {llmDataHash.slice(0, 16)}...
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Barra de Ações Rápidas em Tela: Imprimir, Evidências e Hash */}
                        <div className={styles.reportActionsBar}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span className={styles.reportEngineBadge}>
                              Motor: Inteligência Cívica Antessala
                            </span>
                            {llmDataHash && (
                              <span 
                                className={styles.reportHashBadge}
                                title={`Hash SHA-256 dos dados: ${llmDataHash}. Se novos dados entrarem no banco, o sistema invalida este hash e regera o relatório automaticamente.`}
                              >
                                <Database size={12} />
                                {llmIsCached ? 'Base Inalterada (Cache Seguro)' : 'Dados Atualizados (Novo Hash)'}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Botão para ir direto às evidências filtradas no banco */}
                            <button
                              type="button"
                              className={styles.evidenceFilterBtn}
                              onClick={() => {
                                setActiveTab('AUDIENCIAS');
                                setAudiencePage(1);
                              }}
                              title="Ver registros completos do e-Agendas utilizados nesta análise"
                            >
                              <Database size={13} />
                              <span>Ver Evidências no Banco ({dossier.audienceTimeline.length} Audiências / {dossier.douCorrelations.length} Atos)</span>
                            </button>

                            {/* Botão de Impressão com Imagem do Antunes */}
                            <button
                              type="button"
                              className={styles.printReportBtn}
                              onClick={handlePrintReport}
                              title="Imprimir relatório pericial completo com brasão e mascote oficial"
                            >
                              <Printer size={14} />
                              <span>Imprimir Relatório</span>
                            </button>
                          </div>
                        </div>

                        {/* Conteúdo Pericial Formatado em Markdown */}
                        <div className={styles.reportContentWrapper}>
                          <MarkdownRenderer content={llmReport} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '12px', background: '#FFFFFF', padding: '16px 20px', borderRadius: '8px', border: '1px solid #DCFCE7' }}>
                        <img
                          src="/antunes_mala.png"
                          alt="Robô Antunes com a pasta de trabalho"
                          style={{ width: '78px', height: '78px', objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.08))' }}
                        />
                        <p style={{ fontSize: '0.86rem', color: '#334155', margin: 0, lineHeight: 1.55 }}>
                          Pressione o botão acima para acionar o <strong>Robô Antunes</strong>. Auditor robô aposentado que agora atua no controle social independente munido de sua pasta do rigor e lupa metodológica, 
                          ele cruzará o histórico completo de reuniões ministeriais deste interlocutor, os vínculos corporativos e os extratos publicados no 
                          <strong>Diário Oficial da União</strong>, gerando um parecer pericial minucioso com salvaguardas cívicas e diagramas visuais.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className={styles.sectionBox}>
                    <div className={styles.sectionTitle}>
                      <ShieldAlert size={18} color="#3B82F6" />
                      <span>Diagnóstico de Auditoria (agregação sobre e-Agendas e DOU)</span>
                    </div>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {dossier.aiSummary.executiveSummary}
                    </p>
                  </div>

                  {/* INTELIGÊNCIA CÍVICA: DECODIFICAÇÃO DE PAUTAS & IMPACTO NO CIDADÃO */}
                  {(Boolean(dossier.aiSummary?.betweenTheLines?.length) ||
                    Boolean(dossier.aiSummary?.citizenImpacts?.length) ||
                    Boolean(dossier.aiSummary?.thematicClusters?.length)) && (
                    <div className={styles.sectionBox} style={{ border: '1px solid rgba(16, 185, 129, 0.35)', background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(6, 11, 24, 0.7) 100%)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div className={styles.sectionTitle} style={{ margin: 0, color: '#10B981' }}>
                          <Compass size={18} color="#10B981" />
                          <span>Inteligência Cívica: Decodificação de Pautas &amp; Interesse Público</span>
                        </div>
                        <span style={{ fontSize: '0.74rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#34D399', fontWeight: 600 }}>
                          Controle Social · CF/88 Art. 5º XXXIII
                        </span>
                      </div>

                      {/* BADGES DE ATIVOS E PARCEIRAS */}
                      {((dossier.aiSummary.highlightedAssets && dossier.aiSummary.highlightedAssets.length > 0) ||
                        (dossier.aiSummary.highlightedPartners && dossier.aiSummary.highlightedPartners.length > 0)) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                          {dossier.aiSummary.highlightedAssets && dossier.aiSummary.highlightedAssets.map((asset, aIdx) => (
                            <span key={`ast-${aIdx}`} style={{ fontSize: '0.74rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.12)', color: '#38BDF8', border: '1px solid rgba(56, 189, 248, 0.25)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              🚢 {asset}
                            </span>
                          ))}
                          {dossier.aiSummary.highlightedPartners && dossier.aiSummary.highlightedPartners.map((partner, pIdx) => (
                            <span key={`prt-${pIdx}`} style={{ fontSize: '0.74rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(168, 85, 247, 0.12)', color: '#C084FC', border: '1px solid rgba(168, 85, 247, 0.25)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              🤝 Consórcio: {partner}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                        {/* COLUNA 1: LEITURA NAS ENTRELINHAS */}
                        {dossier.aiSummary.betweenTheLines && dossier.aiSummary.betweenTheLines.length > 0 && (
                          <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.84rem', fontWeight: 600, color: '#FCD34D' }}>
                              <Eye size={15} color="#FBBF24" />
                              <span>Decodificação Pericial: Leitura nas Entrelinhas</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {dossier.aiSummary.betweenTheLines.map((btl, bIdx) => (
                                <div key={bIdx} style={{ fontSize: '0.8rem', color: '#CBD5E1', margin: 0, lineHeight: 1.45 }}>
                                  <MarkdownRenderer content={btl} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* COLUNA 2: O QUE ESTÁ EM JOGO PARA O CIDADÃO */}
                        {dossier.aiSummary.citizenImpacts && dossier.aiSummary.citizenImpacts.length > 0 && (
                          <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.84rem', fontWeight: 600, color: '#6EE7B7' }}>
                              <Users size={15} color="#34D399" />
                              <span>O Que Está em Jogo para o Cidadão Comum</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {dossier.aiSummary.citizenImpacts.map((ci, cIdx) => (
                                <div key={cIdx} style={{ fontSize: '0.8rem', color: '#CBD5E1', margin: 0, lineHeight: 1.45 }}>
                                  <MarkdownRenderer content={ci} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* EIXOS TEMÁTICOS SUBSTANTIVOS MAPEADOS */}
                      {dossier.aiSummary.thematicClusters && dossier.aiSummary.thematicClusters.length > 0 && (
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94A3B8', marginBottom: '8px' }}>
                            Núcleos Temáticos Monitorados no e-Agendas ({dossier.aiSummary.thematicClusters.length} eixos identificados):
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px' }}>
                            {dossier.aiSummary.thematicClusters.map((cluster, clIdx) => (
                              <div key={clIdx} style={{ background: 'rgba(2, 6, 23, 0.4)', borderRadius: '6px', padding: '8px 10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#E2E8F0' }}>{cluster.category}</span>
                                  <span style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 700, padding: '1px 6px', background: 'rgba(16, 185, 129, 0.12)', borderRadius: '4px' }}>
                                    {cluster.count} aud.
                                  </span>
                                </div>
                                <p style={{ fontSize: '0.74rem', color: '#94A3B8', margin: 0, lineHeight: 1.35 }}>
                                  {cluster.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.sectionBox}>
                    <div className={styles.sectionTitle}>
                      <AlertTriangle size={18} color="#EF4444" />
                      <span>Red Flags Acionadas</span>
                    </div>
                    <div className={styles.redFlagsList}>
                      {dossier.aiSummary.identifiedRedFlags.map((flag, fIdx) => (
                        <div key={fIdx} className={styles.redFlagItem}>
                          <AlertTriangle size={14} />
                          <span>{flag}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* EMPRESAS & ENTIDADES REPRESENTADAS NO E-AGENDAS */}
                  {representedEntitiesStats.length > 0 && (
                    <div className={styles.sectionBox}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div className={styles.sectionTitle} style={{ margin: 0 }}>
                          <Building2 size={18} color="#0284C7" />
                          <span>Entidades &amp; Organizações Representadas ({representedEntitiesStats.length})</span>
                        </div>
                        <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                          Clique na organização para ver suas audiências
                        </span>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: '#64748B', margin: '0 0 12px 0' }}>
                        Empresas, associações setoriais, federações, ONGs, institutos e sindicatos registrados nas audiências públicas deste interlocutor no e-Agendas:
                      </p>
                      <div className={styles.societaryGrid}>
                        {representedEntitiesStats.map((ent, eIdx) => {
                          const total = dossier.audienceTimeline.length || 1;
                          const pct = ((ent.count / total) * 100).toFixed(0);
                          return (
                            <div
                              key={eIdx}
                              className={styles.societaryCard}
                              style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                              onClick={() => {
                                setAudienceEntityFilter(ent.name);
                                setActiveTab('AUDIENCIAS');
                                setAudiencePage(1);
                              }}
                              title={`Clique para filtrar as audiências de ${ent.name}`}
                            >
                              <div className={styles.societaryCardHeader}>
                                <span className={styles.societaryCnpj}>
                                  <Building2 size={12} /> {ent.count} {ent.count === 1 ? 'audiência' : 'audiências'}
                                </span>
                                <span className={styles.societaryCap}>{pct}% das agendas</span>
                              </div>
                              <div className={styles.societaryName} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CompanyLogo name={ent.name} size={18} />
                                <span>{ent.name}</span>
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#0284C7', marginTop: '6px', fontWeight: 600 }}>
                                Filtrar audiências no e-Agendas &rarr;
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* VÍNCULOS SOCIETÁRIOS / CNPJS */}
                  {dossier.societaryLinks && dossier.societaryLinks.length > 0 && (
                    <div className={styles.sectionBox}>
                      <div className={styles.sectionTitle}>
                        <Building2 size={18} color="#0284C7" />
                        <span>Vínculos Societários Oficiais &amp; QSA ({dossier.societaryLinks.length})</span>
                      </div>
                      <div className={styles.societaryGrid}>
                        {dossier.societaryLinks.map((soc, sIdx) => (
                          <div key={sIdx} className={styles.societaryCard}>
                            <div className={styles.societaryCardHeader}>
                              <span className={styles.societaryCnpj}>{soc.cnpj}</span>
                              {soc.capitalPercentage > 0 && (
                                <span className={styles.societaryCap}>{soc.capitalPercentage}% Capital</span>
                              )}
                            </div>
                            <div className={styles.societaryName}>{soc.corporateName}</div>
                            {soc.fantasyName && (
                              <div className={styles.societaryFantasy}>Nome fantasia: {soc.fantasyName}</div>
                            )}
                            {soc.qualification && (
                              <div className={styles.societaryRole}>{soc.qualification} &bull; {soc.linkType || 'Vínculo'}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* DOAÇÕES ELEITORAIS / TSE */}
                  {dossier.politicalLinks && dossier.politicalLinks.length > 0 && (
                    <div className={styles.sectionBox}>
                      <div className={styles.sectionTitle}>
                        <Landmark size={18} color="#F59E0B" />
                        <span>Doações Eleitorais Declaradas (TSE)</span>
                      </div>
                      <div className={styles.politicalGrid}>
                        {dossier.politicalLinks.map((pol, pIdx) => (
                          <div key={pIdx} className={styles.politicalCard}>
                            <div className={styles.politicalCardHeader}>
                              <span>{pol.candidateName}</span>
                              <span>Ano {pol.electionYear}</span>
                            </div>
                            <div className={styles.politicalAmount}>{formatBRL(pol.amount)}</div>
                            <div style={{ fontSize: '0.78rem', color: '#78350F' }}>
                              Cargo disputado: {pol.disputedRole || 'Não informado'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PRÉVIA DAS REUNIÕES RECENTES COM BOTÃO DE ACESSO */}
                  {dossier.audienceTimeline && dossier.audienceTimeline.length > 0 && (
                    <div className={styles.sectionBox}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div className={styles.sectionTitle} style={{ margin: 0 }}>
                          <Calendar size={18} color="#00A859" />
                          <span>Audiências Recentes ({dossier.audienceTimeline.length} no total)</span>
                        </div>
                        <button
                          type="button"
                          className={styles.quickLinkBtn}
                          onClick={() => {
                            setActiveTab('AUDIENCIAS');
                            setAudiencePage(1);
                          }}
                        >
                          <span>Ver timeline completa ({dossier.audienceTimeline.length})</span>
                          <ArrowRight size={14} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                        {dossier.audienceTimeline.slice(0, 3).map((item, aIdx) => (
                          <div
                            key={item.id ?? aIdx}
                            style={{
                              padding: '10px 14px',
                              background: '#F8FAFC',
                              borderRadius: '6px',
                              border: '1px solid #E2E8F0',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '12px',
                              flexWrap: 'wrap'
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: '0.86rem', color: '#0F172A' }}>{item.publicBodyName}</strong>
                              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                Com {item.authorityName} &bull; {item.dateTime?.slice(0, 10)}
                              </div>
                              <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '3px' }}>
                                Pauta: {item.declaredTopic || item.disambiguatedTopic || 'Sem pauta informada'}
                              </div>
                            </div>
                            <span className={item.isOpaque ? styles.badgeOpaque : styles.badgeClear}>
                              {item.isOpaque ? 'Pauta Opaca' : 'Pauta Clara'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: AUDIÊNCIAS NO E-AGENDAS (TIMELINE COMPLETA) */}
              {activeTab === 'AUDIENCIAS' && (
                <div className={styles.sectionBox}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                    <div className={styles.sectionTitle} style={{ margin: 0 }}>
                      <Calendar size={18} color="#00A859" />
                      <span>Audiências e Reuniões Oficiais no e-Agendas ({dossier.audienceTimeline.length})</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      Exibindo {paginatedAudiences.length} de {filteredAudiences.length} audiências encontradas
                    </span>
                  </div>

                  {/* Barra de Filtros de Audiências */}
                  <div className={styles.audiencesToolbar}>
                    <div className={styles.audienceFilterGroup}>
                      <input
                        type="text"
                        placeholder="Buscar por pauta, autoridade ou órgão..."
                        className={styles.audienceSearchInput}
                        value={audienceSearch}
                        onChange={(e) => {
                          setAudienceSearch(e.target.value);
                          setAudiencePage(1);
                        }}
                      />

                      {audienceOrgans.length > 1 && (
                        <select
                          className={styles.audienceSelect}
                          value={audienceOrganFilter}
                          onChange={(e) => {
                            setAudienceOrganFilter(e.target.value);
                            setAudiencePage(1);
                          }}
                        >
                          <option value="ALL">Todos os Órgãos / Ministérios ({audienceOrgans.length})</option>
                          {audienceOrgans.map((org) => (
                            <option key={org} value={org}>
                              {org}
                            </option>
                          ))}
                        </select>
                      )}

                      {representedEntitiesStats.length > 1 && (
                        <select
                          className={styles.audienceSelect}
                          value={audienceEntityFilter}
                          onChange={(e) => {
                            setAudienceEntityFilter(e.target.value);
                            setAudiencePage(1);
                          }}
                        >
                          <option value="ALL">Todas as Entidades / Organizações ({representedEntitiesStats.length})</option>
                          {representedEntitiesStats.map((ent) => (
                            <option key={ent.name} value={ent.name}>
                              {ent.name.length > 35 ? `${ent.name.slice(0, 34)}…` : ent.name} ({ent.count})
                            </option>
                          ))}
                        </select>
                      )}

                      <select
                        className={styles.audienceSelect}
                        value={audienceOpaqueFilter}
                        onChange={(e) => {
                          setAudienceOpaqueFilter(e.target.value as any);
                          setAudiencePage(1);
                        }}
                      >
                        <option value="ALL">Todas as Pautas ({dossier.audienceTimeline.length})</option>
                        <option value="CLEAR">Apenas Pautas Claras ({clearCount})</option>
                        <option value="OPAQUE">Apenas Pautas Opacas / Risco ({opaqueCount})</option>
                      </select>
                    </div>

                    {(audienceSearch || audienceOrganFilter !== 'ALL' || audienceEntityFilter !== 'ALL' || audienceOpaqueFilter !== 'ALL') && (
                      <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={() => {
                          setAudienceSearch('');
                          setAudienceOrganFilter('ALL');
                          setAudienceEntityFilter('ALL');
                          setAudienceOpaqueFilter('ALL');
                          setAudiencePage(1);
                        }}
                      >
                        Limpar Filtros
                      </button>
                    )}
                  </div>

                  {/* Tabela de Audiências com Rolagem */}
                  {filteredAudiences.length === 0 ? (
                    <p className={styles.emptyNote}>
                      Nenhuma audiência corresponde aos critérios de busca selecionados.
                    </p>
                  ) : (
                    <>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th style={{ minWidth: '100px' }}>Data &amp; Hora</th>
                              <th style={{ minWidth: '160px' }}>Órgão Público</th>
                              <th style={{ minWidth: '180px' }}>Autoridade Visitada</th>
                              <th style={{ minWidth: '160px' }}>Entidade Representada</th>
                              <th style={{ minWidth: '240px' }}>Pauta Declarada</th>
                              <th style={{ minWidth: '110px' }}>Classificação</th>
                            </tr>
                          </thead>
                          <tbody key={`tbody-${audienceOpaqueFilter}-${audienceOrganFilter}-${audiencePage}-${audienceSearch}`}>
                            {paginatedAudiences.map((aud, idx) => {
                              const isOpaque = Boolean(aud.isOpaque);
                              return (
                                <tr key={`aud-row-${aud.id}-${idx}-${encodeURIComponent(aud.authorityName || '')}`}>
                                  <td className="font-mono" style={{ fontSize: '0.8rem' }}>
                                    {aud.dateTime?.replace('T', ' ').slice(0, 16) || '—'}
                                  </td>
                                  <td>
                                    <strong>{aud.publicBodyName}</strong>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <AuthorityAvatar
                                          name={aud.authorityName || ''}
                                          role={aud.authorityRole}
                                          size={26}
                                          showBadge={true}
                                        />
                                        {onInspectAuthority && aud.authorityName ? (
                                          <button
                                            type="button"
                                            style={{
                                              background: 'none',
                                              border: 'none',
                                              padding: 0,
                                              font: 'inherit',
                                              color: '#0284C7',
                                              cursor: 'pointer',
                                              textDecoration: 'underline',
                                              textAlign: 'left',
                                              fontWeight: 600,
                                            }}
                                            onClick={() => onInspectAuthority(aud.authorityName)}
                                            title={`Abrir Dossiê da Autoridade: ${aud.authorityName}`}
                                          >
                                            {aud.authorityName}
                                          </button>
                                        ) : (
                                          <span style={{ fontWeight: 600 }}>{aud.authorityName}</span>
                                        )}
                                      </div>
                                      {aud.authorityRole && (
                                        <div style={{ fontSize: '0.73rem', color: '#64748B', paddingLeft: '19px' }}>
                                          {aud.authorityRole}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <CompanyLogo name={aud.representedEntity || ''} size={15} />
                                      <span>{aud.representedEntity || 'Não especificada'}</span>
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ fontSize: '0.84rem', lineHeight: '1.4', color: '#1E293B' }}>
                                      {aud.declaredTopic || aud.disambiguatedTopic || '—'}
                                    </div>
                                  </td>
                                  <td>
                                    <span className={isOpaque ? styles.badgeOpaque : styles.badgeClear}>
                                      {isOpaque ? 'Pauta Opaca' : 'Pauta Clara'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Paginação de Audiências */}
                      {totalAudiencePages > 1 && (
                        <div className={styles.paginationRow}>
                          <span>
                            Página <strong>{audiencePage}</strong> de <strong>{totalAudiencePages}</strong> ({filteredAudiences.length} registros)
                          </span>
                          <div className={styles.paginationControls}>
                            <button
                              type="button"
                              className={styles.pageBtn}
                              disabled={audiencePage <= 1}
                              onClick={() => setAudiencePage(p => Math.max(1, p - 1))}
                            >
                              <ChevronLeft size={14} />
                              <span>Anterior</span>
                            </button>
                            <button
                              type="button"
                              className={styles.pageBtn}
                              disabled={audiencePage >= totalAudiencePages}
                              onClick={() => setAudiencePage(p => Math.min(totalAudiencePages, p + 1))}
                            >
                              <span>Próxima</span>
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: GRAFO DE INFLUÊNCIA INTERATIVO DEDICADO À PESSOA */}
              {activeTab === 'GRAFO' && (
                <div className={styles.graphContainer}>
                  {graphData && <InfluenceGraph data={graphData} />}
                </div>
              )}

              {/* TAB 3: GRÁFICOS & PAUTAS */}
              {activeTab === 'GRAFICOS' && (
                <div className={styles.sectionBox}>
                  <div className={styles.sectionTitle}>
                    <BarChart3 size={18} color="#10B981" />
                    <span>Perfil de atua&ccedil;&atilde;o do ator</span>
                  </div>
                  {dossier.charts ? (
                    <LobbyistCharts
                      charts={dossier.charts}
                      meetingsTotal={dossier.audienceTimeline.length}
                    />
                  ) : (
                    <p className={styles.emptyNote}>Sem dados agregados para este ator.</p>
                  )}
                </div>
              )}

              {/* TAB 4: ATOS DO DOU CORRELACIONADOS, COM PROCEDÊNCIA EXPLÍCITA */}
              {activeTab === 'DOCUMENTOS' && (
                <div className={styles.sectionBox}>
                  <div className={styles.sectionTitle}>
                    <FileText size={18} color="#A855F7" />
                    <span>Atos publicados no Di&aacute;rio Oficial ap&oacute;s audi&ecirc;ncias</span>
                  </div>

                  {dossier.douCorrelations.length === 0 ? (
                    <p className={styles.emptyNote}>
                      Nenhum ato correlacionado &agrave;s entidades representadas por este ator na
                      varredura atual do DOU. A varredura &eacute; dirigida: aus&ecirc;ncia aqui
                      n&atilde;o significa aus&ecirc;ncia de atos.
                    </p>
                  ) : (
                    <>
                      {reliability && (
                        <p className={reliability.measured
                          ? styles.reliabilityNote : styles.reliabilityWarn}>
                          <strong>Leitura automatizada:</strong>{' '}
                          {reliability.measured
                            ? `${reliability.summary} (${reliability.model}, prompt ${reliability.promptVersion})`
                            : reliability.warning}
                        </p>
                      )}
                      <p className={styles.evidenceNote}>
                        Os atos abaixo pertencem &agrave;s <strong>entidades que este ator
                        representa</strong>. A gravidade mede a atua&ccedil;&atilde;o
                        <strong> dele</strong>: o intervalo at&eacute; a reuni&atilde;o mais
                        pr&oacute;xima que ele pr&oacute;prio teve, descontada a cad&ecirc;ncia
                        com que ele se re&uacute;ne. <strong>Crit&eacute;rio Pericial de Pauta:</strong> quando a
                        pauta cadastrada no e-Agendas &eacute; gen&eacute;rica ou opaca (ex: apenas cita o nome da
                        empresa ou &ldquo;reuni&atilde;o institucional&rdquo; sem detalhar o objeto da audi&ecirc;ncia, em descumprimento
                        ao Art. 11, &sect; 2&ordm; do Decreto n&ordm; 10.889/2021), &eacute; <em>tecnicamente imposs&iacute;vel
                        determinar se houve ou n&atilde;o correla&ccedil;&atilde;o tem&aacute;tica</em> com o ato publicado no DOU.
                        Quando outro representante da mesma empresa esteve mais perto do ato, a &uacute;ltima coluna aponta para a ficha
                        dele — &eacute; ali que a proximidade constitui ind&iacute;cio, e n&atilde;o aqui.
                      </p>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Publica&ccedil;&atilde;o</th>
                            <th>Entidade / &Oacute;rg&atilde;o emissor</th>
                            <th>Tipo de ato</th>
                            <th>O que foi concedido</th>
                            <th>
                              Trata da mat&eacute;ria da pauta?
                              <span className={styles.thHint}>
                                pauta gen&eacute;rica no e-Agendas torna a rela&ccedil;&atilde;o imposs&iacute;vel de determinar
                              </span>
                            </th>
                            <th>
                              Reuni&atilde;o <em>deste ator</em> &rarr; ato
                              <span className={styles.thHint}>
                                dias entre a reuni&atilde;o mais pr&oacute;xima dele e a publica&ccedil;&atilde;o
                              </span>
                            </th>
                            <th>
                              Outro representante mais pr&oacute;ximo
                              <span className={styles.thHint}>
                                onde o ind&iacute;cio de fato est&aacute;
                              </span>
                            </th>
                            <th>Base do v&iacute;nculo</th>
                            <th>Valor</th>
                            <th>Prova</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dossier.douCorrelations.map((dou, idx) => (
                            <tr key={dou.id ?? idx}>
                              <td className="font-mono">{dou.publicationDate}</td>
                              <td>
                                <strong>{dou.entityName}</strong>
                                <div className={styles.subtleCell}>{dou.issuingBody}</div>
                              </td>
                              <td>
                                <strong>{dou.actType}</strong>
                                {dou.isNoBid && (
                                  <div className={styles.noBidTag}>sem licita&ccedil;&atilde;o</div>
                                )}
                                {dou.contractedName && (
                                  <div className={styles.subtleCell}>{dou.contractedName}</div>
                                )}
                              </td>
                              <td>
                                {dou.reading?.granted ? (
                                  <>
                                    <span className={styles.grantedText}>
                                      {dou.reading.granted}
                                    </span>
                                    {dou.reading.declaredValue &&
                                      dou.reading.declaredValue !== 'não consta' && (
                                        <div className={styles.subtleCell}>
                                          {dou.reading.declaredValue}
                                        </div>
                                      )}
                                  </>
                                ) : (
                                  <span className={styles.subtleCell}>não lido ainda</span>
                                )}
                              </td>
                              <td>
                                {dou.reading?.relation ? (
                                  dou.reading.relation === 'indeterminado' || dou.reading.overridden ? (
                                    <>
                                      <span
                                        className={styles.relationIndeterminate}
                                        title="Pauta genérica ou opaca: a ausência de objeto específico registrado pela autoridade pública impede aferir relação com o ato"
                                      >
                                        <HelpCircle size={12} />
                                        Impossível determinar (pauta genérica)
                                      </span>
                                      <div className={styles.indeterminateHint}>
                                        {dou.reading.overridden
                                          ? 'Pauta sem matéria declarada no e-Agendas (impossível correlacionar)'
                                          : (dou.reading.relationRationale || 'Pauta genérica: impossível correlacionar ao ato')}
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <span className={styles[relationClass(dou.reading.relation)]}>
                                        {RELATION_LABEL[dou.reading.relation] || dou.reading.relation}
                                      </span>
                                      <div className={styles.subtleCell}>
                                        {dou.reading.relationRationale}
                                      </div>
                                    </>
                                  )
                                ) : (
                                  <span className={styles.subtleCell}>&mdash;</span>
                                )}
                              </td>
                              <td className="font-mono">
                                {dou.timeDeltaDays !== null && dou.timeDeltaDays !== undefined ? (
                                  <>
                                    <span className={styles.deltaOwn}>{dou.timeDeltaDays} dias</span>
                                    <div className={styles.subtleCell}>
                                      reuniu-se em {brDate(dou.ownMeetingDate)}
                                    </div>
                                    {dou.severity && (
                                      <div className={styles.subtleCell}>
                                        <BadgeSeverity severity={dou.severity} />
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className={styles.subtleCell}>
                                    este ator n&atilde;o teve reuni&atilde;o antes deste ato
                                  </span>
                                )}
                              </td>
                              <td>
                                {dou.closestRepresentative ? (
                                  <>
                                    <button
                                      className={styles.pointerBtn}
                                      onClick={() =>
                                        onInspectPerson?.(dou.closestRepresentative!.id)}
                                      title="Abrir a ficha de quem esteve mais próximo do ato"
                                    >
                                      {dou.closestRepresentative.name}
                                    </button>
                                    <div className={styles.subtleCell}>
                                      a {dou.closestRepresentative.deltaDays} dia
                                      {dou.closestRepresentative.deltaDays === 1 ? '' : 's'} do ato
                                      {' · '}reuniu-se em{' '}
                                      {brDate(dou.closestRepresentative.meetingDate)}
                                    </div>
                                  </>
                                ) : (
                                  <span className={styles.subtleCell}>
                                    este ator foi o mais pr&oacute;ximo
                                  </span>
                                )}
                              </td>
                              <td>
                                {dou.matchBasis?.startsWith('CNPJ') ? (
                                  <span className={styles.basisStrong} title="Empresa identificada pelo CNPJ no ato">
                                    CNPJ
                                  </span>
                                ) : (
                                  <span className={styles.basisWeak} title="Semelhança de razão social — conferir o ato">
                                    raz&atilde;o social
                                  </span>
                                )}
                              </td>
                              <td className="font-mono">{formatBRL(dou.monetaryValue)}</td>
                              <td>
                                {dou.douUrl ? (
                                  <a
                                    className={styles.evidenceBtn}
                                    href={dou.douUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink size={12} />
                                    <span>Ver ato</span>
                                  </a>
                                ) : (
                                  <span className={styles.subtleCell}>sem link</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
