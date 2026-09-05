import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Landmark, Building2, User, HelpCircle, AlertTriangle, Sparkles, Loader2,
  Calendar, FileText, ExternalLink, Printer, Database, ArrowRight,
  ChevronLeft, ChevronRight, CheckCircle, ShieldAlert, Users, Share2, BarChart3, Download
} from 'lucide-react';
import { AuthorityDossierDetail, AuthorityReportResponse } from '../../types/authority.types';
import { GraphNetworkData } from '../../types/graph.types';
import { authorityService } from '../../services/authorityService';
import { InfluenceGraph } from '../graph/InfluenceGraph';
import { AuthorityCharts } from '../charts/AuthorityCharts';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { CompanyLogo } from '../common/CompanyLogo';
import { AuthorityAvatar } from '../common/AuthorityAvatar';
import { getApiUrl } from '../../services/api';
import styles from './UnifiedAuthorityDossierModal.module.css';

interface UnifiedAuthorityDossierModalProps {
  authorityName: string | null;
  onClose: () => void;
  onInspectPerson?: (personId: string) => void;
}

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

const formatBRL = (v: number): string => {
  if (!v) return 'sem valor no ato';
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)} bi`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(2)} mi`;
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
};

export const UnifiedAuthorityDossierModal: React.FC<UnifiedAuthorityDossierModalProps> = ({
  authorityName,
  onClose,
  onInspectPerson,
}) => {
  const [dossier, setDossier] = useState<AuthorityDossierDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'RESUMO' | 'GRAPH' | 'CHARTS' | 'AUDIENCIAS' | 'DOCUMENTOS'>('RESUMO');

  // Grafo de rede de influência
  const [graphData, setGraphData] = useState<GraphNetworkData | null>(null);
  const [loadingGraph, setLoadingGraph] = useState<boolean>(false);

  // Filtros de audiências
  const [audienceSearch, setAudienceSearch] = useState('');
  const [audienceOpaqueFilter, setAudienceOpaqueFilter] = useState<'ALL' | 'CLEAR' | 'OPAQUE'>('ALL');
  const [audienceEntityFilter, setAudienceEntityFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Filtros de documentos do DOU
  const [douSearch, setDouSearch] = useState('');
  const [douTypeFilter, setDouTypeFilter] = useState('ALL');
  const [douPage, setDouPage] = useState(1);
  const douPageSize = 15;

  // Estado do Relatório do Robô Antunes
  const [report, setReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState<boolean>(false);
  const [reportProvider, setReportProvider] = useState<string | null>(null);
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null);
  const [isReportCached, setIsReportCached] = useState<boolean>(false);
  const [reportHash, setReportHash] = useState<string | null>(null);

  // Escuta tecla ESC para fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Carrega dossiê da autoridade
  const loadDossier = useCallback(() => {
    if (!authorityName) return;
    setLoading(true);
    setError(null);
    setReport(null);
    setGraphData(null);
    setPage(1);
    setAudienceSearch('');
    setAudienceOpaqueFilter('ALL');
    setAudienceEntityFilter('ALL');
    setDouSearch('');
    setDouTypeFilter('ALL');
    setDouPage(1);

    authorityService
      .getAuthorityDossier(authorityName)
      .then((data) => setDossier(data))
      .catch((err) => {
        console.error('Erro ao carregar dossiê da autoridade:', err);
        setError('Não foi possível carregar os registros desta autoridade pública.');
      })
      .finally(() => setLoading(false));

    setLoadingGraph(true);
    authorityService
      .getAuthorityGraph(authorityName)
      .then((gData) => setGraphData(gData))
      .catch((err) => console.error('Erro ao carregar grafo:', err))
      .finally(() => setLoadingGraph(false));
  }, [authorityName]);

  useEffect(() => {
    loadDossier();
  }, [loadDossier]);

  // Gerar Relatório Forense Cívico com o Robô Antunes
  const handleGenerateReport = async () => {
    if (!authorityName) return;
    setGeneratingReport(true);
    try {
      const data = await authorityService.generateAuthorityReport(authorityName);
      if (data.report) {
        setReport(data.report);
        setReportProvider(data.provider || 'Robô Antunes (Auditor Robô Aposentado)');
        setReportGeneratedAt(data.generatedAt || null);
        setIsReportCached(!!data.isCached);
        setReportHash(data.dataHash || null);
      }
    } catch (err) {
      console.error('Erro ao gerar parecer cívico da autoridade:', err);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleReportToFalaBr = () => {
    if (!dossier) return;
    const authName = dossier.authority.name;
    const authRole = dossier.authority.role;
    const body = dossier.authority.publicBody;
    const query = encodeURIComponent(
      `Manifestação referente ao monitoramento cívico da autoridade pública ${authName} (${authRole} no ${body}). ` +
      `Identificados ${dossier.authority.totalMeetings} compromissos públicos e ${dossier.authority.opacityRatePct}% de pautas opacas (Decreto nº 10.889/2021). ` +
      `Evidências auditadas via Antessala.`
    );
    const organParam = encodeURIComponent(body);
    window.open(`https://falabr.cgu.gov.br/publico/Manifestacao/SelecionarTipoManifestacao.aspx?assunto=${query}&orgao=${organParam}`, '_blank');
  };

  const handleExportCsv = () => {
    if (!dossier?.audienceTimeline || dossier.audienceTimeline.length === 0) return;
    const headers = ['Data', 'Órgão', 'Autoridade', 'Cargo', 'Interlocutor', 'Entidade Representada', 'Pauta Declarada', 'Opacidade'];
    const rows = dossier.audienceTimeline.map((a) => [
      `"${(a.dateTime || '').replace(/"/g, '""')}"`,
      `"${(dossier.authority.publicBody || '').replace(/"/g, '""')}"`,
      `"${(dossier.authority.name || '').replace(/"/g, '""')}"`,
      `"${(dossier.authority.role || '').replace(/"/g, '""')}"`,
      `"${(a.lobbyistName || '').replace(/"/g, '""')}"`,
      `"${(a.representedEntity || '').replace(/"/g, '""')}"`,
      `"${(a.declaredTopic || '').replace(/"/g, '""')}"`,
      `"${a.isOpaque ? 'OPACA' : 'CLARA'}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `antessala_${dossier.authority.name.toLowerCase().replace(/\s+/g, '_')}_audiencias.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJson = () => {
    if (!dossier) return;
    const jsonContent = JSON.stringify(dossier, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `antessala_${dossier.authority.name.toLowerCase().replace(/\s+/g, '_')}_dossie.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Audiências filtradas
  const filteredAudiences = useMemo(() => {
    if (!dossier?.audienceTimeline) return [];
    return dossier.audienceTimeline.filter((aud) => {
      if (audienceOpaqueFilter === 'OPAQUE' && !aud.isOpaque) return false;
      if (audienceOpaqueFilter === 'CLEAR' && aud.isOpaque) return false;
      if (audienceEntityFilter !== 'ALL' && aud.representedEntity !== audienceEntityFilter) return false;

      if (audienceSearch.trim()) {
        const q = audienceSearch.toLowerCase();
        const inLobbyist = aud.lobbyistName.toLowerCase().includes(q);
        const inEntity = aud.representedEntity.toLowerCase().includes(q);
        const inTopic = aud.declaredTopic.toLowerCase().includes(q);
        if (!inLobbyist && !inEntity && !inTopic) return false;
      }
      return true;
    });
  }, [dossier?.audienceTimeline, audienceOpaqueFilter, audienceEntityFilter, audienceSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredAudiences.length / pageSize));
  const paginatedAudiences = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAudiences.slice(start, start + pageSize);
  }, [filteredAudiences, page]);

  // Documentos do DOU filtrados
  const distinctActTypes = useMemo(() => {
    if (!dossier?.douCorrelations) return [];
    const types = new Set<string>();
    dossier.douCorrelations.forEach((d) => {
      if (d.actType) types.add(d.actType);
    });
    return Array.from(types).sort();
  }, [dossier?.douCorrelations]);

  const filteredDouActs = useMemo(() => {
    if (!dossier?.douCorrelations) return [];
    let list = dossier.douCorrelations;

    if (douTypeFilter !== 'ALL') {
      list = list.filter((d) => d.actType === douTypeFilter);
    }

    if (douSearch.trim()) {
      const q = douSearch.toLowerCase();
      list = list.filter((d) =>
        (d.entityName?.toLowerCase().includes(q) ?? false) ||
        (d.actType?.toLowerCase().includes(q) ?? false) ||
        (d.summary?.toLowerCase().includes(q) ?? false) ||
        (d.issuingBody?.toLowerCase().includes(q) ?? false)
      );
    }

    return list;
  }, [dossier?.douCorrelations, douSearch, douTypeFilter]);

  const totalDouPages = Math.max(1, Math.ceil(filteredDouActs.length / douPageSize));
  const paginatedDouActs = useMemo(() => {
    const start = (douPage - 1) * douPageSize;
    return filteredDouActs.slice(start, start + douPageSize);
  }, [filteredDouActs, douPage, douPageSize]);

  if (!authorityName) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Dossiê da Autoridade Pública"
      >
        {/* Cabeçalho do Modal */}
        <div className={styles.modalHeader}>
          {loading || !dossier ? (
            <div className="skeleton" style={{ height: '40px', width: '320px' }} />
          ) : (
            <div className={styles.authorityInfoBox}>
              <AuthorityAvatar
                name={dossier.authority.name}
                role={dossier.authority.role}
                size={54}
              />
              <div className={styles.authorityTitle}>
                <h2>{dossier.authority.name}</h2>
                <div className={styles.metaRow}>
                  <span className={styles.roleBadge}>{dossier.authority.role}</span>
                  <span className={styles.bodyBadge}>
                    <Building2 size={13} /> {dossier.authority.publicBody}
                  </span>
                  <span
                    style={{
                      background: dossier.authority.opacityRatePct > 50 ? '#FEF2F2' : '#F0FDF4',
                      color: dossier.authority.opacityRatePct > 50 ? '#DC2626' : '#16A34A',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontWeight: 700,
                    }}
                  >
                    Opacidade de Pauta: {dossier.authority.opacityRatePct}%
                  </span>
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
            <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar ficha">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className={styles.tabsHeader}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'RESUMO' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('RESUMO')}
          >
            <Sparkles size={16} />
            <span>1. Resumo &amp; Robô Antunes</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'GRAPH' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('GRAPH')}
          >
            <Share2 size={16} />
            <span>2. Grafo de Influência</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'CHARTS' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('CHARTS')}
          >
            <BarChart3 size={16} />
            <span>3. Gráficos &amp; Estatísticas</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'AUDIENCIAS' ? styles.tabActive : ''}`}
            onClick={() => {
              setActiveTab('AUDIENCIAS');
              setPage(1);
            }}
          >
            <Calendar size={16} />
            <span>4. Audiências Oficiais ({dossier?.authority.totalMeetings || 0})</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'DOCUMENTOS' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('DOCUMENTOS')}
          >
            <FileText size={16} />
            <span>5. Documentos no DOU ({dossier?.douCorrelations.length || 0})</span>
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className={styles.modalBody}>
          {error ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <AlertTriangle size={42} color="#EF4444" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ color: '#0F172A', margin: '0 0 8px 0' }}>Falha ao Carregar Dossiê</h3>
              <p style={{ color: '#64748B', maxWidth: '420px', margin: '0 auto 16px' }}>{error}</p>
              <button className={styles.llmReportBtn} onClick={loadDossier}>
                Tentar Novamente
              </button>
            </div>
          ) : loading || !dossier ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="skeleton" style={{ height: '90px', width: '100%' }} />
              <div className="skeleton" style={{ height: '240px', width: '100%' }} />
            </div>
          ) : (
            <>
              {/* ABA 1: RESUMO & ROBÔ ANTUNES */}
              {activeTab === 'RESUMO' && (
                <>
                  {/* Grid de KPIs da Autoridade */}
                  <div className={styles.kpiSummaryGrid}>
                    <div className={styles.kpiMiniCard}>
                      <span className={styles.kpiMiniLabel}>Total Audiências</span>
                      <span className={styles.kpiMiniVal}>{dossier.authority.totalMeetings}</span>
                    </div>
                    <div className={styles.kpiMiniCard}>
                      <span className={styles.kpiMiniLabel}>Interlocutores Atendidos</span>
                      <span className={styles.kpiMiniVal}>{dossier.authority.distinctLobbyists}</span>
                    </div>
                    <div className={styles.kpiMiniCard}>
                      <span className={styles.kpiMiniLabel}>Entidades / Empresas</span>
                      <span className={styles.kpiMiniVal}>{dossier.authority.distinctEntities}</span>
                    </div>
                    <div className={styles.kpiMiniCard}>
                      <span className={styles.kpiMiniLabel}>Índice Pautas Opacas</span>
                      <span
                        className={styles.kpiMiniVal}
                        style={{
                          color: dossier.authority.opacityRatePct > 50 ? '#DC2626' : '#16A34A',
                        }}
                      >
                        {dossier.authority.opacityRatePct}%
                      </span>
                    </div>
                  </div>

                  {/* Card do Robô Antunes Aposentado */}
                  <div
                    className={styles.sectionBox}
                    style={{ border: '1.5px solid #00A859', background: '#F0FDF4' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px',
                      }}
                    >
                      <div className={styles.sectionTitle} style={{ margin: 0 }}>
                        <Sparkles size={20} color="#00A859" />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0F172A' }}>
                            Parecer Pericial Cívico — Robô Antunes
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#008A4B', fontWeight: 600 }}>
                            Auditor Robô Aposentado • Análise Cívica da Agenda da Autoridade Pública
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={styles.llmReportBtn}
                        onClick={handleGenerateReport}
                        disabled={generatingReport}
                      >
                        {generatingReport ? (
                          <>
                            <Loader2 size={16} className={styles.spinIcon} />
                            <span>Antunes Analisando Gabinete...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            <span>
                              {report ? 'Regerar Relatório do Antunes' : 'Gerar Parecer Cívico com Antunes'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>

                    {report ? (
                      <div
                        className={styles.llmReportBox}
                        id="printable-authority-report"
                        style={{ background: '#FFFFFF' }}
                      >
                        {/* Cabeçalho Formal para Impressão */}
                        <div className={styles.printHeaderBox}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <img
                              src="/logo_antessala.png"
                              alt="Antessala — Monitorando Agenda. Rastreando Influências."
                              style={{ height: '68px', width: 'auto', objectFit: 'contain' }}
                            />
                            <div style={{ borderLeft: '1.5px solid #CBD5E1', paddingLeft: '14px' }}>
                              <div
                                style={{
                                  fontSize: '1.05rem',
                                  fontWeight: 800,
                                  color: '#0F172A',
                                  letterSpacing: '-0.02em',
                                }}
                              >
                                RELATÓRIO FORENSE DE AUDITORIA &bull; CONTROLE SOCIAL
                              </div>
                              <div
                                style={{ fontSize: '0.80rem', fontWeight: 700, color: '#00A859' }}
                              >
                                Robô Antunes &bull; Auditor Robô Aposentado &bull; Análise de Agendas Públicas
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                                Autoridade Auditada: <strong>{dossier.authority.name}</strong> ({dossier.authority.role})
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
                              <div>
                                Data da Análise:{' '}
                                {reportGeneratedAt
                                  ? new Date(reportGeneratedAt).toLocaleString('pt-BR')
                                  : 'Tempo Real'}
                              </div>
                              {reportHash && (
                                <div
                                  className="font-mono"
                                  style={{ fontSize: '0.66rem', color: '#94A3B8' }}
                                >
                                  Hash: {reportHash.slice(0, 14)}...
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Barra de Ações do Relatório */}
                        <div className={styles.reportActionsBar}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span className={styles.reportEngineBadge}>Motor: {reportProvider}</span>
                            {reportHash && (
                              <span
                                className={styles.reportHashBadge}
                                title={`Hash SHA-256 dos dados: ${reportHash}`}
                              >
                                <CheckCircle size={12} />
                                {isReportCached
                                  ? 'Base Inalterada (Cache Seguro)'
                                  : 'Dados Atualizados (Novo Hash)'}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              className={styles.evidenceFilterBtn}
                              onClick={() => setActiveTab('AUDIENCIAS')}
                              title="Ver registros completos do e-Agendas utilizados nesta análise"
                            >
                              <Database size={13} />
                              <span>
                                Ver Evidências ({dossier.authority.totalMeetings} Audiências /{' '}
                                {dossier.douCorrelations.length} Atos)
                              </span>
                            </button>
                              <button
                                type="button"
                                className={styles.exportBtn}
                                onClick={handleExportCsv}
                                title="Exportar dados abertos das audiências em formato CSV"
                              >
                                <Download size={13} />
                                <span>Exportar CSV</span>
                              </button>
                              <button
                                type="button"
                                className={styles.exportBtn}
                                onClick={handleExportJson}
                                title="Exportar dossiê completo em formato JSON aberto"
                              >
                                <FileText size={13} />
                                <span>JSON</span>
                              </button>
                              <button
                                type="button"
                                className={styles.falaBrBtn}
                                onClick={handleReportToFalaBr}
                                title="Reportar evidências diretamente à Ouvidoria da CGU (Plataforma Fala.BR)"
                              >
                                <ShieldAlert size={14} />
                                <span>Reportar Fala.BR</span>
                              </button>
                              <button
                                type="button"
                                className={styles.printReportBtn}
                                onClick={handlePrint}
                                title="Imprimir relatório pericial completo com brasão e mascote oficial"
                              >
                                <Printer size={14} />
                                <span>Imprimir Parecer</span>
                              </button>
                            </div>
                          </div>

                        {/* Conteúdo Renderizado (GFM + Mermaid) */}
                        <div className={styles.reportContentWrapper}>
                          <MarkdownRenderer content={report} />
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '20px',
                          marginTop: '12px',
                          background: '#FFFFFF',
                          padding: '16px 20px',
                          borderRadius: '8px',
                          border: '1px solid #DCFCE7',
                        }}
                      >
                        <img
                          src="/antunes_mala.png"
                          alt="Robô Antunes"
                          style={{
                            width: '78px',
                            height: '78px',
                            objectFit: 'contain',
                            flexShrink: 0,
                            filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.08))',
                          }}
                        />
                        <p style={{ fontSize: '0.86rem', color: '#334155', margin: 0, lineHeight: 1.55 }}>
                          Pressione o botão acima para acionar o <strong>Robô Antunes</strong>. Como um
                          auditor robô aposentado a serviço da sociedade civil, Antunes cruzará as{' '}
                          <strong>{dossier.authority.totalMeetings} audiências públicas</strong> concedidas
                          por esta autoridade, identificando a taxa de opacidade de pauta (em cumprimento
                          ao Art. 11 do Decreto nº 10.889/2021), assimetrias de acesso corporativo e
                          correlações temporais com publicações do <strong>Diário Oficial da União</strong>.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Top Entidades e Empresas Atendidas */}
                  <div className={styles.sectionBox}>
                    <div className={styles.sectionTitle}>
                      <Building2 size={18} color="#0284C7" />
                      <span>Principais Entidades &amp; Empresas Recebidas no Gabinete</span>
                    </div>
                    <div className={styles.entitiesGrid}>
                      {dossier.topEntities.slice(0, 8).map((ent, idx) => (
                        <div key={idx} className={styles.entityCard}>
                          <div className={styles.entityHeader}>
                            <span>{ent.count} audiência{ent.count === 1 ? '' : 's'}</span>
                            <span style={{ fontWeight: 700, color: '#0284C7' }}>{ent.pct}% da agenda</span>
                          </div>
                          <div className={styles.entityName}>{ent.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Interlocutores / Representantes */}
                  <div className={styles.sectionBox}>
                    <div className={styles.sectionTitle}>
                      <Users size={18} color="#3B82F6" />
                      <span>Interlocutores &amp; Representantes com Maior Assiduidade</span>
                    </div>
                    <div className={styles.lobbyistsGrid}>
                      {dossier.topLobbyists.slice(0, 8).map((lob, idx) => (
                        <div
                          key={idx}
                          className={styles.lobbyistCard}
                          onClick={() => onInspectPerson?.(lob.id)}
                          title={`Abrir ficha de ${lob.name}`}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#64748B' }}>
                            <span>{lob.count} reunião{lob.count === 1 ? '' : 'ões'}</span>
                            <span style={{ color: '#0284C7', fontWeight: 700 }}>Ver Dossiê →</span>
                          </div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                            {lob.name}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '3px' }}>
                            {lob.entity}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ABA 2: GRAFO DE INFLUÊNCIA */}
              {activeTab === 'GRAPH' && (
                <div className={styles.sectionBox} style={{ minHeight: '620px', display: 'flex', flexDirection: 'column' }}>
                  <div className={styles.sectionTitle}>
                    <Share2 size={18} color="#00D084" />
                    <span>Rede de Relações e Influência da Autoridade</span>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: '#64748B', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    Mapeamento topológico interativo das conexões entre a autoridade pública, seu órgão de lotação, as entidades privadas recebidas em audiência, os interlocutores/lobistas e os atos oficiais do DOU vinculados.
                  </p>
                  {loadingGraph ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '450px', gap: '10px', color: '#64748B' }}>
                      <Loader2 className={styles.spinIcon} size={24} />
                      <span>Carregando topologia da rede de influência...</span>
                    </div>
                  ) : graphData && graphData.nodes.length > 0 ? (
                    <InfluenceGraph
                      data={graphData}
                      height={540}
                      onSelectNode={(node) => {
                        if (node.type === 'PERSON' && node.isLobbyist && onInspectPerson) {
                          onInspectPerson(node.id);
                        }
                      }}
                    />
                  ) : (
                    <div style={{ color: '#64748B', padding: '40px', textAlign: 'center' }}>
                      Nenhuma conexão topológica identificada para os filtros selecionados.
                    </div>
                  )}
                </div>
              )}

              {/* ABA 3: GRÁFICOS & ESTATÍSTICAS */}
              {activeTab === 'CHARTS' && (
                <div className={styles.sectionBox}>
                  <div className={styles.sectionTitle}>
                    <BarChart3 size={18} color="#10B981" />
                    <span>Métricas Analíticas e Estatísticas da Autoridade</span>
                  </div>
                  {dossier.charts ? (
                    <AuthorityCharts
                      charts={dossier.charts}
                      meetingsTotal={dossier.authority.totalMeetings}
                    />
                  ) : (
                    <div style={{ color: '#64748B', padding: '40px', textAlign: 'center' }}>
                      Estatísticas em processamento.
                    </div>
                  )}
                </div>
              )}

              {/* ABA 4: AUDIÊNCIAS OFICIAIS */}
              {activeTab === 'AUDIENCIAS' && (
                <div className={styles.sectionBox}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div className={styles.sectionTitle} style={{ margin: 0 }}>
                      <Calendar size={18} color="#00A859" />
                      <span>Audiências Concedidas no e-Agendas ({filteredAudiences.length} registros)</span>
                    </div>
                  </div>

                  {/* Barra de Filtros */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <input
                      type="text"
                      placeholder="Buscar por pauta, interlocutor ou empresa..."
                      value={audienceSearch}
                      onChange={(e) => { setAudienceSearch(e.target.value); setPage(1); }}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        fontSize: '0.84rem',
                        flex: '1',
                        minWidth: '220px',
                      }}
                    />
                    <select
                      value={audienceOpaqueFilter}
                      onChange={(e) => { setAudienceOpaqueFilter(e.target.value as any); setPage(1); }}
                      style={{ padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.84rem' }}
                    >
                      <option value="ALL">Todas as Pautas ({dossier.audienceTimeline.length})</option>
                      <option value="CLEAR">Apenas Pautas Claras ({dossier.authority.clearMeetingsCount})</option>
                      <option value="OPAQUE">Apenas Pautas Opacas / Risco ({dossier.authority.opaqueMeetingsCount})</option>
                    </select>
                  </div>

                  {/* Tabela de Audiências */}
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: '100px' }}>Data</th>
                          <th style={{ minWidth: '180px' }}>Interlocutor Visitante</th>
                          <th style={{ minWidth: '180px' }}>Entidade Declarada</th>
                          <th style={{ minWidth: '260px' }}>Pauta Declarada</th>
                          <th style={{ minWidth: '110px' }}>Classificação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedAudiences.map((aud, idx) => (
                          <tr key={aud.id ?? idx}>
                            <td className="font-mono" style={{ fontSize: '0.8rem' }}>
                              {aud.dateTime ? aud.dateTime.slice(0, 10) : '—'}
                            </td>
                            <td>
                              <button
                                className={styles.pointerBtn}
                                onClick={() => onInspectPerson?.(aud.lobbyistId)}
                                title="Abrir dossiê deste interlocutor"
                              >
                                {aud.lobbyistName}
                              </button>
                              <div className={styles.subtleCell}>CPF: {aud.lobbyistMaskedCpf}</div>
                            </td>
                            <td>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <CompanyLogo name={aud.representedEntity} size={15} />
                                <strong>{aud.representedEntity}</strong>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: '0.82rem', color: '#1E293B', lineHeight: '1.4' }}>
                                {aud.declaredTopic}
                              </div>
                            </td>
                            <td>
                              <span className={aud.isOpaque ? styles.badgeOpaque : styles.badgeClear}>
                                {aud.isOpaque ? 'Pauta Opaca' : 'Pauta Clara'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginação */}
                  {totalPages > 1 && (
                    <div className={styles.paginationRow}>
                      <span>
                        Página <strong>{page}</strong> de <strong>{totalPages}</strong> ({filteredAudiences.length} registros)
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className={styles.pageBtn}
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft size={14} /> Anterior
                        </button>
                        <button
                          className={styles.pageBtn}
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                          Próxima <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 5: DOCUMENTOS NO DOU */}
              {activeTab === 'DOCUMENTOS' && (
                <div className={styles.sectionBox}>
                  <div className={styles.sectionTitle}>
                    <FileText size={18} color="#A855F7" />
                    <span>Atos Publicados no DOU Correlacionados às Audiências da Autoridade ({dossier.douCorrelations.length} atos)</span>
                  </div>

                  {dossier.douCorrelations.length === 0 ? (
                    <p style={{ color: '#64748B', fontSize: '0.88rem' }}>
                      Nenhum ato com vínculo monetário direto localizado no acervo do DOU para as entidades
                      que se reuniram com esta autoridade no recorte temporal analisado.
                    </p>
                  ) : (
                    <>
                      <p style={{ fontSize: '0.84rem', color: '#64748B', margin: '0 0 14px 0' }}>
                        <strong>Critério Pericial de Pauta:</strong> quando o registro no e-Agendas possui pauta
                        genérica ou opaca (descumprindo o Art. 11, § 2º do Decreto nº 10.889/2021), é{' '}
                        <em>tecnicamente impossível determinar a correlação temático-causal</em> com o ato publicado.
                      </p>

                      {/* Barra de Filtro de Atos do DOU */}
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        <input
                          type="text"
                          placeholder="Buscar por empresa, tipo de ato, resumo ou órgão..."
                          value={douSearch}
                          onChange={(e) => { setDouSearch(e.target.value); setDouPage(1); }}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            fontSize: '0.84rem',
                            flex: '1',
                            minWidth: '220px',
                          }}
                        />
                        {distinctActTypes.length > 1 && (
                          <select
                            value={douTypeFilter}
                            onChange={(e) => { setDouTypeFilter(e.target.value); setDouPage(1); }}
                            style={{ padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.84rem' }}
                          >
                            <option value="ALL">Todos os Tipos ({dossier.douCorrelations.length})</option>
                            {distinctActTypes.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Publicação</th>
                              <th>Entidade / Empresa</th>
                              <th>Tipo de Ato</th>
                              <th>O que foi concedido</th>
                              <th>
                                Trata da matéria da pauta?
                                <span className={styles.thHint}>
                                  pauta genérica no e-Agendas torna a relação indeterminável
                                </span>
                              </th>
                              <th>Interlocutor Presente</th>
                              <th>Intervalo (Δt)</th>
                              <th>Valor</th>
                              <th>Prova</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedDouActs.map((dou, idx) => (
                              <tr key={dou.id ?? idx}>
                                <td className="font-mono">{dou.publicationDate}</td>
                                <td>
                                  <strong>{dou.entityName}</strong>
                                  <div className={styles.subtleCell}>{dou.issuingBody}</div>
                                </td>
                                <td>
                                  <strong>{dou.actType}</strong>
                                  {dou.isNoBid && (
                                    <div style={{ color: '#DC2626', fontSize: '0.72rem', fontWeight: 700 }}>
                                      sem licitação
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {dou.reading?.granted ? (
                                    <>
                                      <span style={{ fontSize: '0.82rem', color: '#1E293B' }}>
                                        {dou.reading.granted}
                                      </span>
                                      {dou.reading.declaredValue && (
                                        <div className={styles.subtleCell}>{dou.reading.declaredValue}</div>
                                      )}
                                    </>
                                  ) : (
                                    <span className={styles.subtleCell}>{dou.summary || 'Ato oficial registrado'}</span>
                                  )}
                                </td>
                                <td>
                                  {dou.reading?.relation ? (
                                    dou.reading.relation === 'indeterminado' || dou.reading.overridden ? (
                                      <>
                                        <span
                                          className={styles.relationIndeterminate}
                                          title="Pauta genérica ou opaca: a ausência de objeto específico registrado impede aferir relação com o ato"
                                        >
                                          <HelpCircle size={12} />
                                          Impossível determinar (pauta genérica)
                                        </span>
                                        <div className={styles.indeterminateHint}>
                                          {dou.reading.overridden
                                            ? 'Pauta sem matéria declarada no e-Agendas'
                                            : (dou.reading.relationRationale || 'Pauta genérica')}
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <span className={styles[relationClass(dou.reading.relation)]}>
                                          {RELATION_LABEL[dou.reading.relation] || dou.reading.relation}
                                        </span>
                                        <div className={styles.subtleCell}>{dou.reading.relationRationale}</div>
                                      </>
                                    )
                                  ) : (
                                    <span className={styles.subtleCell}>&mdash;</span>
                                  )}
                                </td>
                                <td>
                                  {dou.lobbyistName ? (
                                    <button
                                      className={styles.pointerBtn}
                                      onClick={() => onInspectPerson?.(dou.lobbyistId || '')}
                                    >
                                      {dou.lobbyistName}
                                    </button>
                                  ) : (
                                    <span className={styles.subtleCell}>—</span>
                                  )}
                                </td>
                                <td className="font-mono">
                                  {dou.timeDeltaDays !== null && dou.timeDeltaDays !== undefined ? (
                                    <span>{dou.timeDeltaDays} dias após</span>
                                  ) : (
                                    <span className={styles.subtleCell}>—</span>
                                  )}
                                </td>
                                <td className="font-mono">{formatBRL(dou.monetaryValue)}</td>
                                <td>
                                  {dou.douUrl ? (
                                    <a
                                      href={dou.douUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        color: '#00A859',
                                        fontWeight: 700,
                                        fontSize: '0.78rem',
                                      }}
                                    >
                                      <ExternalLink size={12} /> Ver ato
                                    </a>
                                  ) : (
                                    <span className={styles.subtleCell}>—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Paginação do DOU */}
                      {totalDouPages > 1 && (
                        <div className={styles.paginationRow} style={{ marginTop: '14px' }}>
                          <span>
                            Página <strong>{douPage}</strong> de <strong>{totalDouPages}</strong> ({filteredDouActs.length} atos)
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className={styles.pageBtn}
                              disabled={douPage <= 1}
                              onClick={() => setDouPage((p) => Math.max(1, p - 1))}
                            >
                              <ChevronLeft size={14} /> Anterior
                            </button>
                            <button
                              className={styles.pageBtn}
                              disabled={douPage >= totalDouPages}
                              onClick={() => setDouPage((p) => Math.min(totalDouPages, p + 1))}
                            >
                              Próxima <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}
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
